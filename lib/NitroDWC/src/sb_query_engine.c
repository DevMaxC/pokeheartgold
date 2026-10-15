#pragma force_active on
#include <string.h>

#include "global.h"

#include "dwc/sb_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

extern u32 current_time(void);
extern void SocketStartUp(void);
extern int CanReceiveOnSocket(int socket);
extern int gsSocketCreate(int domain, int type, int protocol);
extern void gsSocketClose(int socket);
extern int gsSocketRecvFrom(int socket, void *buf, int len, int flags, void *addr, int *addrLen);
extern void gsSocketSendTo(int socket, void *buf, int len, int flags, void *addr, int addrLen);

extern int ov00_0221B0D0;
extern char *qr2_registered_key_list[]; // query key names

typedef struct {
    u8 data[13];
} SBBasicQuery;

typedef struct {
    u8 data[8];
} SBStatusQuery;

extern SBBasicQuery sStr_BasicInfo;  // "\\basic\\\\info\\"
extern SBStatusQuery sKey_status_2; // "\\status\\"
extern char sKey_final_8[];        // "\\final\\"

typedef struct SockAddr {
    u8 len;
    u8 family;
    u16 port;
    u32 address;
} SockAddr;

// List request decoding (state: 256-byte permutation + 5 index bytes, see SBServerList.cryptState)
u8 keyrand(u8 *state, u32 max, u8 *key, u32 len, u8 *value, u32 *pos) {
    u32 count, mask, r;
    if (!max) {
        return 0;
    }
    count = 0;
    mask = 1;
    while (mask < max) {
        mask = (mask << 1) + 1;
    }
    do {
        u32 at = (*pos)++;
        *value = state[*value] + key[at];
        if (*pos >= len) {
            *pos = 0;
            *value += len;
        }
        r = mask & *value;
        if (++count > 11) {
            r %= max;
        }
    } while (r > max);
    return r;
}

void GOAHashInit(u8 *state) {
    int i, j;
    state[256] = 1;
    state[257] = 3;
    state[258] = 5;
    state[259] = 7;
    state[260] = 11;
    for (i = 0, j = 255; i < 256; i++, j--) {
        state[i] = j;
    }
}

void GOACryptInit(u8 *state, s8 *key, u32 len) {
    struct {
        u8 value;
        u32 pos;
    } k;

    int i;
    if (len < 1) {
        GOAHashInit(state);
        return;
    }
    for (i = 0; i < 256; i++) {
        state[i] = i;
    }
    k.pos = 0;
    k.value = 0;
    for (i = 255; i >= 0; i--) {
        u8 index = keyrand(state, i, (u8 *)key, len, &k.value, &k.pos);
        u8 tmp = state[i];
        state[i] = state[index];
        state[index] = tmp;
    }
    state[256] = state[1];
    state[257] = state[3];
    state[258] = state[5];
    state[259] = state[7];
    state[260] = state[k.value];
    k.value = 0;
    k.pos = 0;
}

u8 GOADecryptByte(u8 *state, u8 value) {
    u8 old = state[256]++;
    u8 tmp;
    state[257] += state[old];
    tmp = state[state[260]];
    state[state[260]] = state[state[257]];
    state[state[257]] = state[state[259]];
    state[state[259]] = state[state[256]];
    state[state[256]] = tmp;
    state[258] += state[tmp];
    state[259] = value ^ state[(u8)(state[state[258]] + state[state[256]])] ^ state[state[(u8)(state[state[257]] + (state[state[259]] + state[state[260]]))]];
    state[260] = value;
    return state[259];
}

void GOADecrypt(u8 *state, u8 *data, int len) {
    int i;
    for (i = 0; i < len; i++) {
        data[i] = GOADecryptByte(state, data[i]);
    }
}

// Server queues
void FIFOAddRear(SBServerQueue *queue, SBServer *server) {
    if (queue->last) {
        queue->last->next = server;
    }
    queue->last = server;
    server->next = NULL;
    if (!queue->first) {
        queue->first = server;
    }
    queue->count++;
}

void FIFOAddFront(SBServerQueue *queue, SBServer *server) {
    server->next = queue->first;
    queue->first = server;
    if (!queue->last) {
        queue->last = server;
    }
    queue->count++;
}

SBServer *FIFOGetFirst(SBServerQueue *queue) {
    SBServer *server = queue->first;
    if (server) {
        queue->first = server->next;
        if (!queue->first) {
            queue->last = NULL;
        }
        queue->count--;
    }
    return server;
}

int FIFORemove(SBServerQueue *queue, SBServer *server) {
    SBServer *cur = queue->first, *prev = NULL;
    while (cur) {
        if (cur == server) {
            if (prev) {
                prev->next = cur->next;
            }
            if (queue->first == cur) {
                queue->first = cur->next;
            }
            if (queue->last == cur) {
                queue->last = prev;
            }
            queue->count--;
            return 1;
        }
        prev = cur;
        cur = cur->next;
    }
    return 0;
}

void FIFOClear(SBServerQueue *queue) {
    queue->last = NULL;
    queue->first = NULL;
    queue->count = 0;
}

// Query engine: sends the query for server (binary query with the engine's keys, or a text query)
void QEStartQuery(SBQueryEngine *engine, SBServer *server) {
    SockAddr addr;
    u8 data[256];
    int size, i;
    u32 ip;
    FIFOAddRear(&engine->querying, server);
    server->updateTime = current_time();
    addr.family = AF_INET;
    if (server->state & STATE_PENDINGICMPQUERY) {
        return;
    }
    if (engine->queryVersion == 1) {
        data[0] = 254;
        data[1] = 253;
        data[2] = 0;
        memcpy(data + 3, &server->updateTime, 4);
        if (server->state & STATE_PENDINGBASICQUERY) {
            data[7] = engine->numKeys;
            i = 0;
            if (engine->numKeys > 0) {
                u8 *out = data;
                do {
                    out[8] = engine->keys[i];
                    i++;
                    out++;
                } while (i < engine->numKeys);
            }
            data[8 + engine->numKeys] = 0;
            data[9 + engine->numKeys] = 0;
            size = engine->numKeys + 10;
        } else {
            data[7] = 255;
            data[8] = 255;
            data[9] = 255;
            size = 10;
        }
    } else if (server->state & STATE_PENDINGBASICQUERY) {
        memcpy(data, &sStr_BasicInfo, 13);
        size = 13;
    } else {
        memcpy(data, &sKey_status_2, 8);
        size = 8;
    }
    ip = server->publicIp;
    if (ip == engine->publicIp && (server->flags & PRIVATE_IP_FLAG)) {
        addr.address = server->privateIp;
        addr.port = server->privatePort;
    } else {
        addr.address = ip;
        addr.port = server->publicPort;
    }
    gsSocketSendTo(engine->socket, data, size, 0, &addr, 8);
}

void SBQueryEngineInit(SBQueryEngine *engine, int maxUpdates, int queryVersion, int force, SBEngineCallback callback, void *param) {
    if (!force && ov00_0221B0D0 != 1) {
        return;
    }
    SocketStartUp();
    engine->queryVersion = queryVersion;
    engine->maxUpdates = maxUpdates;
    engine->numKeys = 0;
    engine->callback = callback;
    engine->param = param;
    engine->publicIp = 0;
    engine->socket = gsSocketCreate(AF_INET, SOCK_DGRAM, 0);
    FIFOClear(&engine->pending);
    FIFOClear(&engine->querying);
}

void SBQueryEngineSetPublicIP(SBQueryEngine *engine, u32 publicIp) {
    engine->publicIp = publicIp;
}

void SBEngineHaltUpdates(SBQueryEngine *engine) {
    FIFOClear(&engine->pending);
    FIFOClear(&engine->querying);
}

void SBEngineCleanup(SBQueryEngine *engine) {
    gsSocketClose(engine->socket);
    engine->socket = INVALID_SOCKET;
    FIFOClear(&engine->pending);
    FIFOClear(&engine->querying);
}

// mode 0: basic query, 1: full query, 2: none
void SBQueryEngineUpdateServer(SBQueryEngine *engine, SBServer *server, int first, int mode) {
    server->state &= 0xC3;
    if (mode == QTYPE_BASIC) {
        server->state |= STATE_PENDINGBASICQUERY;
    } else if (mode == QTYPE_FULL) {
        server->state |= STATE_PENDINGFULLQUERY;
    } else if (mode == QTYPE_ICMP) {
        return;
    }
    if (engine->querying.count < engine->maxUpdates) {
        QEStartQuery(engine, server);
        return;
    }
    if (first) {
        FIFOAddFront(&engine->pending, server);
    } else {
        FIFOAddRear(&engine->pending, server);
    }
}

// Binary query reply
void ParseSingleQR2Reply(SBQueryEngine *engine, SBServer *server, s8 *data, int len) {
    int i, size;
    if (*data) {
        return;
    }
    data += 5;
    len -= 5;
    if (server->state & STATE_PENDINGBASICQUERY) {
        for (i = 0; i < engine->numKeys; i++) {
            size = NTSLengthSB((char *)data, len);
            if (size < 0) {
                break;
            }
            SBServerAddKeyValue(server, qr2_registered_key_list[engine->keys[i]], (char *)data);
            data += size;
            len -= size;
        }
        server->state |= (STATE_BASICKEYS | STATE_VALIDPING);
    } else {
        SBServerParseQR2FullKeysSingle(server, (char *)data, len);
        server->state |= (STATE_BASICKEYS | STATE_FULLKEYS | STATE_VALIDPING);
    }
    server->state &= 0xF3;
    server->updateTime = current_time() - server->updateTime;
    FIFORemove(&engine->querying, server);
    engine->callback(engine, qe_updatesuccess, server, engine->param);
}

// Text query reply
void ParseSingleGOAReply(SBQueryEngine *engine, SBServer *server, char *data, int len) {
    int final = strstr(data, sKey_final_8) != NULL;
    SBServerParseKeyVals(server, data);
    if (!final) {
        return;
    }
    if (server->state & STATE_PENDINGBASICQUERY) {
        server->state |= (STATE_BASICKEYS | STATE_VALIDPING);
    } else {
        server->state |= (STATE_FULLKEYS | STATE_VALIDPING);
    }
    server->state &= 0xF3;
    server->updateTime = current_time() - server->updateTime;
    FIFORemove(&engine->querying, server);
    engine->callback(engine, qe_updatesuccess, server, engine->param);
}

int ParseSingleICMPReply(SBQueryEngine *engine, SBServer *server, char *data, int len) {
    return 1;
}

// Receives the replies on the query socket (or, with second set, on icmpSocket)
void ProcessIncomingReplies(SBQueryEngine *engine, int second) {
    char buffer[0x800];
    SockAddr from;
    int fromLen = 8;
    int socket = second ? engine->icmpSocket : engine->socket;
    if (!CanReceiveOnSocket(socket)) {
        return;
    }
    do {
        int got = gsSocketRecvFrom(socket, buffer, 0x7FF, 0, &from, &fromLen);
        SBServer *server;
        if (got == -1) {
            return;
        }
        buffer[got] = 0;
        for (server = engine->querying.first; server; server = server->next) {
            if ((second && (server->flags & ICMP_IP_FLAG) && server->icmpIp == from.address) || (server->publicIp == from.address && (server->publicPort == from.port || second)) || (server->publicIp == engine->publicIp && (server->flags & PRIVATE_IP_FLAG) && server->privateIp == from.address && server->privatePort == from.port)) {
                if (second) {
                    if (ParseSingleICMPReply(engine, server, buffer, got)) {
                        break;
                    }
                } else {
                    if (engine->queryVersion == 1) {
                        ParseSingleQR2Reply(engine, server, (s8 *)buffer, got);
                    } else {
                        ParseSingleGOAReply(engine, server, buffer, got);
                    }
                    break;
                }
            }
        }
    } while (CanReceiveOnSocket(socket));
}
