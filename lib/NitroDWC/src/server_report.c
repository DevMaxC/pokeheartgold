#pragma force_active on
#include <string.h>

#include "global.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

// Reporting of this host to the master server: heartbeats, the answers to server queries (binary and
// "\key\value" text queries) and the master server's challenge / client messages.

extern int sprintf(char *buf, const char *fmt, ...);
extern int sscanf(const char *str, const char *fmt, ...);

extern void DWCi_GsFree(void *p);
extern u32 current_time(void);
extern void SocketShutDown(int unk);
extern int CanReceiveOnSocket(int socket);
extern void gsSocketClose(int socket);
extern int gsSocketRecvFrom(int socket, void *buf, int len, int flags, void *addr, int *addrLen);
extern void gsSocketSendTo(int socket, void *buf, int len, int flags, void *addr, int addrLen);
extern u32 gsSocketInetAddr(const char *address);

typedef struct HostEnt {
    char *name;
    char **aliases;
    s16 type;
    s16 length;
    u8 **addresses;
} HostEnt;

extern HostEnt *getlocalhost(const char *name);
extern HostEnt *SOC_GetHostByName(const char *name);
extern char *SOC_InetNtoA(u32 address);

typedef struct SockAddr {
    u8 len;
    u8 family;
    u16 port;
    u32 address;
} SockAddr;

// GameSpy socket layer (BSD names).
#ifndef INVALID_SOCKET
#define INVALID_SOCKET (-1)
#define SOCKET_ERROR   (-1)
#define AF_INET        2
#define SOCK_STREAM    1
#define SOCK_DGRAM     2
#endif

// qr2 packet types (third byte of a packet)
#define PACKET_QUERY              0x00
#define PACKET_CHALLENGE          0x01
#define PACKET_ECHO               0x02
#define PACKET_HEARTBEAT          0x03
#define PACKET_ADDERROR           0x04
#define PACKET_ECHO_RESPONSE      0x05
#define PACKET_CLIENT_MESSAGE     0x06
#define PACKET_CLIENT_MESSAGE_ACK 0x07
#define PACKET_KEEPALIVE          0x08

// qr2 key types
enum {
    key_server,
    key_player,
    key_team,
};

// qr2 error codes (QRRecord.errorCallback)
enum {
    e_qrnoerror,
    e_qrwsockerror,
    e_qrbinderror,
    e_qrdnserror,
    e_qrconnerror,
    e_qrnochallengeerror,
};

// Outgoing packet
typedef struct QRBuffer {
    char data[0x800];
    int len;
} QRBuffer;

// Key ids of one key type (server, player, team)
typedef struct QRKeyList {
    u8 keys[256];
    int count;
} QRKeyList;

typedef void (*QRServerKeyCallback)(u8 key, QRBuffer *buffer, void *param);
typedef void (*QRIndexedKeyCallback)(u8 key, int index, QRBuffer *buffer, void *param);
typedef void (*QRKeyListCallback)(int type, QRKeyList *list, void *param);
typedef int (*QRCountCallback)(int type, void *param);
typedef void (*QRErrorCallback)(int error, char *message, void *param);
typedef void (*QRNatCallback)(u32 cookie, void *param);
typedef void (*QRMessageCallback)(const u8 *data, int len, void *param);
typedef void (*QRAddressCallback)(u32 ip, u16 port, void *param);

typedef struct QRRecord {
    int socket;                                               // 0x000
    char gameName[64];                                        // 0x004
    char secretKey[64];                                       // 0x044
    char instanceKey[4];                                      // 0x084
    QRServerKeyCallback serverKeyCallback;                    // 0x088
    QRIndexedKeyCallback playerKeyCallback;                   // 0x08C
    QRIndexedKeyCallback teamKeyCallback;                     // 0x090
    QRKeyListCallback keyListCallback;                        // 0x094
    QRCountCallback countCallback;                            // 0x098
    QRErrorCallback errorCallback;                            // 0x09C
    QRNatCallback natNegotiateCallback;                       // 0x0A0
    QRMessageCallback clientMessageCallback;                  // 0x0A4
    QRAddressCallback publicAddressCallback;                  // 0x0A8
    u32 lastHeartbeatTime;                                    // 0x0AC
    u32 lastKeepAliveTime;                                    // 0x0B0
    int stateChangePending;                                   // 0x0B4
    int challengeRetries;                                     // 0x0B8, -1 once the master server answered
    int isPublic;                                             // 0x0BC
    int queryPort;                                            // 0x0C0
    int ownsSocket;                                           // 0x0C4
    int natNegotiate;                                         // 0x0C8
    SockAddr masterAddr;                                      // 0x0CC
    void (*rawCallback)(char *data, int len, SockAddr *from); // 0x0D4
    int clientMessageKeys[10];                                // 0x0D8, last client message keys (duplicate filter)
    int clientMessageKeyIndex;                                // 0x100
    u32 publicIp;                                             // 0x104
    u16 publicPort;                                           // 0x108
    void *param;                                              // 0x10C
} QRRecord;

extern QRRecord *current_rec; // used for a NULL record
extern QRRecord static_qr2_rec;
extern char sStr_NoChallengeValueWasReceivedFromTheMasterServer[];
extern char sFmt_Int_4[];
extern char sStr_255_Dot255_Dot255_Dot255[];
extern const char sFmt_HexHex_2[];
extern char sStr_unknown[];
extern char sStr_Empty_11[];
extern char sFmt_StrInt[];
extern char sStr_FinalQueryid1_1[];
extern char sFmt_Localip[];
extern char sStr_localport[];
extern char sStr_natneg[];
extern char sStr_1_4[];
extern char sStr_0_6[];
extern char sStr_statechanged[];
extern char sStr_gamename[];
extern char sStr_publicip[];
extern char sStr_publicport[];
extern char *qr2_registered_key_list[]; // key names by id

typedef struct {
    u8 data[6];
} QRNatMagic;

extern const QRNatMagic qrNatNegMagic;
extern int num_local_ips;    // number of local addresses
extern u32 local_ip_list[5]; // local addresses
extern char qr2_query_buffer[]; // receive buffer

void qr2_register_natneg_callback(QRRecord *record, QRNatCallback callback);
void qr2_register_clientmessage_callback(QRRecord *record, QRMessageCallback callback);
void qr2_register_publicaddress_callback(QRRecord *record, QRAddressCallback callback);
void qr2_think(QRRecord *record);
void qr2_check_queries(QRRecord *record);
void qr2_check_send_heartbeat(QRRecord *record);
void qr2_send_statechanged(QRRecord *record);
void qr2_shutdown(QRRecord *record);
void qr2_keybuffer_add(QRKeyList *list, int key);
void qr2_buffer_add_int(QRBuffer *buffer, int value);
void qr2_buffer_addA(QRBuffer *buffer, const char *str);
void get_local_ips(const char *name);
int get_sockaddrin(char *name, int port, SockAddr *addr, HostEnt **hostOut);
void swap_byte(u8 *a, u8 *b);
u8 encode_ct(u32 n);
void gs_encode(const u8 *src, int len, u8 *dst);
void gs_encrypt(const u8 *key, int keyLen, u8 *data, int len);
void qr_add_packet_header(QRBuffer *buffer, int type, u8 *key);
void compute_challenge_response(QRRecord *record, QRBuffer *buffer, char *challenge, int len);
void handle_public_address(QRRecord *record, const char *str);
void qr_build_partial_query_reply(QRRecord *record, QRBuffer *buffer, int type, int count, u8 *keys);
void qr_build_query_reply(QRRecord *record, QRBuffer *buffer, int serverCount, u8 *serverKeys, int playerCount, u8 *playerKeys, int teamCount, u8 *teamKeys);
void qr_process_query(QRRecord *record, QRBuffer *buffer, u8 *data, int len);
void qr_build_partial_old_query_reply(QRRecord *record, QRBuffer *buffer, int type);
void qr_process_old_query(QRRecord *record, QRBuffer *buffer);
void qr_process_client_message(QRRecord *record, const u8 *data, int len);
int qr_got_recent_message(QRRecord *record, int key);
void qr2_parse_queryA(QRRecord *record, char *data, int len, SockAddr *from);
void send_keepalive(QRRecord *record);
void send_heartbeat(QRRecord *record, int stateChange);
void qr2_register_keyA(int id, char *name);

void qr2_register_natneg_callback(QRRecord *record, QRNatCallback callback) {
    if (!record) {
        record = current_rec;
    }
    record->natNegotiateCallback = callback;
}

void qr2_register_clientmessage_callback(QRRecord *record, QRMessageCallback callback) {
    if (!record) {
        record = current_rec;
    }
    record->clientMessageCallback = callback;
}

void qr2_register_publicaddress_callback(QRRecord *record, QRAddressCallback callback) {
    if (!record) {
        record = current_rec;
    }
    record->publicAddressCallback = callback;
}

void qr2_think(QRRecord *record) {
    if (!record) {
        record = current_rec;
    }
    if (record->isPublic) {
        qr2_check_send_heartbeat(record);
    }
    qr2_check_queries(record);
}

void qr2_check_queries(QRRecord *record) {
    SockAddr from;
    int fromLen;
    int len;
    fromLen = 8;
    if (!record->ownsSocket) {
        return;
    }
    if (!CanReceiveOnSocket(record->socket)) {
        return;
    }
    do {
        len = gsSocketRecvFrom(record->socket, qr2_query_buffer, 255, 0, &from, &fromLen);
        if (len != SOCKET_ERROR) {
            qr2_query_buffer[len] = 0;
            qr2_parse_queryA(record, qr2_query_buffer, len, &from);
        }
    } while (CanReceiveOnSocket(record->socket));
}

// Heartbeats: retries while the challenge is missing, every 60 s otherwise; keep-alive every 20 s
void qr2_check_send_heartbeat(QRRecord *record) {
    u32 now = current_time();
    if (record->socket == INVALID_SOCKET) {
        return;
    }
    if (record->challengeRetries > 0 && now - record->lastHeartbeatTime > 10000) {
        if (record->challengeRetries >= 4) {
            record->challengeRetries = 0;
            record->errorCallback(e_qrnochallengeerror, sStr_NoChallengeValueWasReceivedFromTheMasterServer, record->param);
            return;
        }
        send_heartbeat(record, 3);
        record->challengeRetries++;
    } else if (record->stateChangePending && now - record->lastHeartbeatTime > 10000) {
        send_heartbeat(record, 1);
    } else if (now - record->lastHeartbeatTime > 60000 || record->lastHeartbeatTime == 0 || now < record->lastHeartbeatTime) {
        send_heartbeat(record, 0);
    }
    if (now - record->lastKeepAliveTime > 20000) {
        send_keepalive(record);
    }
}

void qr2_send_statechanged(QRRecord *record) {
    if (!record) {
        record = current_rec;
    }
    if (!record->isPublic) {
        return;
    }
    if (current_time() - record->lastHeartbeatTime < 10000) {
        record->stateChangePending = 1;
        return;
    }
    send_heartbeat(record, 1);
    record->stateChangePending = 0;
}

void qr2_shutdown(QRRecord *record) {
    if (!record) {
        record = current_rec;
    }
    if (record->isPublic) {
        send_heartbeat(record, 2);
    }
    if (record->socket != INVALID_SOCKET && record->ownsSocket) {
        gsSocketClose(record->socket);
    }
    record->socket = INVALID_SOCKET;
    record->lastHeartbeatTime = 0;
    if (record->ownsSocket) {
        SocketShutDown(record->ownsSocket);
    }
    if (record != &static_qr2_rec) {
        DWCi_GsFree(record);
    }
}

void qr2_keybuffer_add(QRKeyList *list, int key) {
    if (list->count >= 0xFE) {
        return;
    }
    if (key < 1 || key > 0xFE) {
        return;
    }
    list->keys[list->count++] = key;
}

void qr2_buffer_add_int(QRBuffer *buffer, int value) {
    char str[20];
    sprintf(str, sFmt_Int_4, value);
    qr2_buffer_addA(buffer, str);
}

void qr2_buffer_addA(QRBuffer *buffer, const char *str) {
    int len = strlen(str) + 1;
    int left = 2048 - buffer->len;
    if (len > left) {
        len = left;
    }
    if (len == 0) {
        return;
    }
    memcpy(buffer->data + buffer->len, str, len);
    buffer->len += len;
    buffer->data[buffer->len - 1] = 0;
}

void get_local_ips(const char *name) {
    HostEnt *host = getlocalhost(name);
    if (host == NULL) {
        return;
    }
    for (num_local_ips = 0; num_local_ips < 5; num_local_ips++) {
        if (host->addresses[num_local_ips] == NULL) {
            return;
        }
        memcpy(&local_ip_list[num_local_ips], host->addresses[num_local_ips], 4);
    }
}

int get_sockaddrin(char *name, int port, SockAddr *addr, HostEnt **hostOut) {
    HostEnt *host = NULL;
    addr->family = AF_INET;
    addr->port = ((u16)port >> 8 & 255) | ((u16)port << 8 & 0xFF00);
    if (!name) {
        addr->address = 0;
    } else {
        addr->address = gsSocketInetAddr(name);
    }
    if (addr->address == -1 && strcmp(name, sStr_255_Dot255_Dot255_Dot255) != 0) {
        host = SOC_GetHostByName(name);
        if (!host) {
            return 0;
        }
        addr->address = *(u32 *)host->addresses[0];
    }
    if (hostOut) {
        *hostOut = host;
    }
    return 1;
}

void swap_byte(u8 *a, u8 *b) {
    u8 tmp = *a;
    *a = *b;
    *b = tmp;
}

// Base64 alphabet
u8 encode_ct(u32 n) {
    if (n < 26) {
        return n + 'A';
    }
    if (n < 52) {
        return n + 71;
    }
    if (n < 62) {
        return n - 4;
    }
    if (n == 62) {
        return '+';
    }
    if (n == 63) {
        return '/';
    }
    return 0;
}

void gs_encode(const u8 *src, int len, u8 *dst) {
    u8 input[3], output[4];
    int used = 0, i;
    while (used < len) {
        for (i = 0; i <= 2; i++) {
            if (used < len) {
                input[i] = *src++;
            } else {
                input[i] = 0;
            }
            used++;
        }
        output[0] = input[0] >> 2;
        output[1] = ((input[0] & 3) << 4) + (input[1] >> 4);
        output[2] = ((input[1] & 15) << 2) + (input[2] >> 6);
        output[3] = input[2] & 63;
        for (i = 0; i <= 3; i++) {
            *dst++ = encode_ct(output[i]);
        }
    }
    *dst = 0;
}

// RC4-style stream cipher
void gs_encrypt(const u8 *key, int keyLen, u8 *data, int len) {
    u8 table[256];
    u8 i, j;
    s16 n;
    for (n = 0; n < 256; n++) {
        table[n] = n;
    }
    i = 0;
    j = 0;
    for (n = 0; n < 256; n++) {
        j = (table[n] + key[i] + j) % 256;
        i = (i + 1) % keyLen;
        swap_byte(&table[n], &table[j]);
    }
    i = 0;
    j = 0;
    for (n = 0; n < len; n++) {
        i = (i + data[n] + 1) % 256;
        j = (table[i] + j) % 256;
        swap_byte(&table[i], &table[j]);
        data[n] ^= table[(u8)((table[i] + table[j]) % 256)];
    }
}

typedef struct {
    u8 data[4];
} QRKey4;

// Packet header: type and the 4-byte key
void qr_add_packet_header(QRBuffer *buffer, int type, u8 *key) {
    buffer->data[0] = type;
    *(QRKey4 *)(buffer->data + 1) = *(QRKey4 *)key;
    buffer->len = 5;
}

// Challenge answer: the challenge encrypted with the secret key, base64 encoded
void compute_challenge_response(QRRecord *record, QRBuffer *buffer, char *challenge, int len) {
    char tmp[65];
    if (len < 1) {
        return;
    }
    if (len > 65) {
        return;
    }
    if (challenge[len - 1] != 0) {
        return;
    }
    strcpy(tmp, challenge);
    gs_encrypt((u8 *)record->secretKey, strlen(record->secretKey), (u8 *)tmp, len - 1);
    gs_encode((u8 *)tmp, len - 1, (u8 *)buffer->data + buffer->len);
    buffer->len += strlen(buffer->data + buffer->len) + 1;
}

// Public address reported by the master server ("%08X%04X")
void handle_public_address(QRRecord *record, const char *str) {
    u32 ip;
    int portValue;
    u16 port;
    sscanf(str, sFmt_HexHex_2, &ip, &portValue);
    port = (u16)portValue;
    ip = ((ip >> 24) & 0xFF) | ((ip >> 8) & 0xFF00) | ((ip << 8) & 0xFF0000) | ((ip << 24) & 0xFF000000);
    if (ip == 0 || port == 0) {
        return;
    }
    if (record->publicIp == ip && record->publicPort == port) {
        return;
    }
    record->publicIp = ip;
    record->publicPort = port;
    record->publicAddressCallback(ip, port, record->param);
}

#pragma opt_propagation off
#pragma opt_lifetimes off

// Binary query answer for one key type (0 server, 1 player, 2 team); count 255: all keys, with their names
void qr_build_partial_query_reply(QRRecord *record, QRBuffer *buffer, int type, int count, u8 *keys) {
    QRKeyList all;
    u16 wire;
    int rows, i, j;
    all.count = 0;
    if (count == 0) {
        return;
    }
    if ((u32)(type - 1) <= 1) {
        if (sizeof(buffer->data) - buffer->len < 2) {
            return;
        }
        rows = record->countCallback(type, record->param);
        {
            int value = (u16)rows;
            wire = ((value >> 8) & 255) | ((value << 8) & 0xFF00);
            memcpy(buffer->data + buffer->len, &wire, 2);
        }
        buffer->len += 2;
    } else {
        rows = 1;
    }
    if (count == 255) {
        record->keyListCallback(type, &all, record->param);
        j = 0;
        if (all.count > 0) {
            keys = all.keys;
            do {
                u32 before;
                const char *name = qr2_registered_key_list[*keys];
                if (!name) {
                    name = sStr_unknown;
                }
                qr2_buffer_addA(buffer, name);
                if (type == key_server) {
                    before = buffer->len;
                    record->serverKeyCallback(*keys, buffer, record->param);
                    if (before == buffer->len) {
                        qr2_buffer_addA(buffer, sStr_Empty_11);
                    }
                }
                j++;
                keys++;
            } while (j < all.count);
        }
        if ((int)(sizeof(buffer->data) - buffer->len) < 1) {
            return;
        }
        buffer->data[buffer->len++] = 0;
        count = all.count;
        keys = all.keys;
        if (type == key_server) {
            return;
        }
    }
    i = 0;
    if (rows <= 0) {
        return;
    }
    do {
        j = 0;
        if (count > 0) {
            do {
                u32 before = buffer->len;
                if (type == key_server) {
                    record->serverKeyCallback(keys[j], buffer, record->param);
                } else if (type == key_player) {
                    record->playerKeyCallback(keys[j], i, buffer, record->param);
                } else if (type == key_team) {
                    record->teamKeyCallback(keys[j], i, buffer, record->param);
                }
                if (before == buffer->len) {
                    qr2_buffer_addA(buffer, sStr_Empty_11);
                }
                j++;
            } while (j < count);
        }
        i++;
    } while (i < rows);
}

#pragma opt_lifetimes reset
#pragma opt_propagation reset

void qr_build_query_reply(QRRecord *record, QRBuffer *buffer, int serverCount, u8 *serverKeys, int playerCount, u8 *playerKeys, int teamCount, u8 *teamKeys) {
    qr_build_partial_query_reply(record, buffer, key_server, serverCount, serverKeys);
    qr_build_partial_query_reply(record, buffer, key_player, playerCount, playerKeys);
    qr_build_partial_query_reply(record, buffer, key_team, teamCount, teamKeys);
}

// Binary query: three counted key id lists (0 / 255: none / all)
void qr_process_query(QRRecord *record, QRBuffer *buffer, u8 *data, int len) {
    u8 serverCount, playerCount, teamCount;
    u8 *serverKeys = NULL, *playerKeys = NULL, *teamKeys = NULL;
    if (len < 3) {
        return;
    }
    serverCount = *data++;
    len--;
    if (serverCount != 0 && serverCount != 255) {
        serverKeys = data;
        len -= serverCount;
        data += serverCount;
    }
    if (len < 2) {
        return;
    }
    playerCount = *data++;
    len--;
    if (playerCount != 0 && playerCount != 255) {
        playerKeys = data;
        len -= playerCount;
        data += playerCount;
    }
    if (len < 1) {
        return;
    }
    teamCount = *data;
    len--;
    if (teamCount != 0 && teamCount != 255) {
        len -= teamCount;
        teamKeys = data + 1;
    }
    if (len < 0) {
        return;
    }
    qr_build_query_reply(record, buffer, serverCount, serverKeys, playerCount, playerKeys, teamCount, teamKeys);
}

// Text query answer for one key type: "\key\value" ("\key_N\value" for players and teams)
void qr_build_partial_old_query_reply(QRRecord *record, QRBuffer *buffer, int type) {
    char name[128];
    QRKeyList list;
    int count, i, old, j;
    list.count = 0;
    if ((u32)(type - 1) > 1) {
        count = 1;
    } else {
        count = record->countCallback(type, record->param);
    }
    record->keyListCallback(type, &list, record->param);
    for (i = 0; i < list.count; i++) {
        char *key = qr2_registered_key_list[list.keys[i]];
        if (key == NULL) {
            key = sStr_unknown;
        }
        if (type == key_server) {
            qr2_buffer_addA(buffer, key);
            buffer->data[buffer->len - 1] = '\\';
            old = buffer->len;
            record->serverKeyCallback(list.keys[i], buffer, record->param);
            if (old == buffer->len) {
                qr2_buffer_addA(buffer, sStr_Empty_11);
            }
            buffer->data[buffer->len - 1] = '\\';
        } else {
            for (j = 0; j < count; j++) {
                sprintf(name, sFmt_StrInt, key, j);
                qr2_buffer_addA(buffer, name);
                buffer->data[buffer->len - 1] = '\\';
                old = buffer->len;
                if (type == key_player) {
                    record->playerKeyCallback(list.keys[i], j, buffer, record->param);
                } else if (type == key_team) {
                    record->teamKeyCallback(list.keys[i], j, buffer, record->param);
                }
                if (old == buffer->len) {
                    qr2_buffer_addA(buffer, sStr_Empty_11);
                }
                buffer->data[buffer->len - 1] = '\\';
            }
        }
    }
}

void qr_process_old_query(QRRecord *record, QRBuffer *buffer) {
    buffer->len = 1;
    buffer->data[0] = '\\';
    qr_build_partial_old_query_reply(record, buffer, key_server);
    qr_build_partial_old_query_reply(record, buffer, key_player);
    qr_build_partial_old_query_reply(record, buffer, key_team);
    qr2_buffer_addA(buffer, sStr_FinalQueryid1_1);
    buffer->len--;
}

// Client message: NAT negotiation request (magic + cookie) or data for the client message callback
void qr_process_client_message(QRRecord *record, const u8 *data, int len) {
    QRNatMagic magic = qrNatNegMagic;
    u32 cookie;
    int i;
    BOOL match = TRUE;
    if (len >= 10) {
        for (i = 0; i < 6; i++) {
            if (magic.data[i] != data[i]) {
                match = FALSE;
                break;
            }
        }
    } else {
        match = FALSE;
    }
    if (match) {
        memcpy(&cookie, data + 6, 4);
        if (record->natNegotiateCallback == NULL) {
            return;
        }
        record->natNegotiateCallback(((cookie >> 24) & 0xFF) | ((cookie >> 8) & 0xFF00) | ((cookie << 8) & 0xFF0000) | ((cookie << 24) & 0xFF000000), record->param);
    } else {
        if (record->clientMessageCallback == NULL) {
            return;
        }
        record->clientMessageCallback(data, len, record->param);
    }
}

// Returns 1 if key was seen recently, else remembers it
int qr_got_recent_message(QRRecord *record, int key) {
    int i;
    for (i = 0; i < 10; i++) {
        if (record->clientMessageKeys[i] == key) {
            return 1;
        }
    }
    record->clientMessageKeyIndex = (record->clientMessageKeyIndex + 1) % 10;
    record->clientMessageKeys[record->clientMessageKeyIndex] = key;
    return 0;
}

// Handles one received packet: raw data (';'), a text query ('\'), or a binary packet (0xFE 0xFD type key)
void qr2_parse_queryA(QRRecord *record, char *data, int len, SockAddr *from) {
    union { // one stack slot for the loop index and the message key
        int index;
        u32 word;
        char bytes[4];
    } tmp;

    QRBuffer buffer;
    int type;
    char *key, *payload;
    buffer.len = 0;
    if (!record) {
        record = current_rec;
    }
    if (*data == ';') {
        if (record->rawCallback) {
            record->rawCallback(data, len, from);
        }
        return;
    }
    if (*data == '\\') {
        qr_process_old_query(record, &buffer);
        gsSocketSendTo(record->socket, buffer.data, buffer.len, 0, from, 8);
        return;
    }
    if (len < 7) {
        return;
    }
    if ((u8)*data != 254 || (u8)data[1] != 253) {
        return;
    }
    if (record->challengeRetries > 0) {
        record->challengeRetries = 0;
    }
    type = data[2];
    key = data + 3;
    payload = data + 7;
    len -= 7;
    qr_add_packet_header(&buffer, type, (u8 *)key);
    switch (type) {
    case PACKET_QUERY:
        qr_process_query(record, &buffer, (u8 *)payload, len);
        break;
    case PACKET_CHALLENGE:
        if (len >= 13 && record->publicAddressCallback) {
            handle_public_address(record, payload + len - 13);
        }
        compute_challenge_response(record, &buffer, payload, len);
        break;
    case PACKET_ECHO:
        if (len > 32) {
            len = 32;
        }
        buffer.data[0] = PACKET_ECHO_RESPONSE;
        memcpy(buffer.data + buffer.len, payload, len);
        buffer.len += len;
        break;
    case PACKET_ADDERROR:
        if (record->challengeRetries == -1) {
            return;
        }
        tmp.index = 0;
        do {
            if (key[tmp.index] != record->instanceKey[tmp.index]) {
                return;
            }
            tmp.index++;
        } while (tmp.index < 4);
        if (len < 2) {
            return;
        }
        record->challengeRetries = -1;
        record->errorCallback(payload[0], payload + 1, record->param);
        return;
    case PACKET_CLIENT_MESSAGE:
        tmp.index = 0;
        do {
            if (key[tmp.index] != record->instanceKey[tmp.index]) {
                return;
            }
            tmp.index++;
        } while (tmp.index < 4);
        if (len < 4) {
            return;
        }
        buffer.data[0] = PACKET_CLIENT_MESSAGE_ACK;
        memcpy(buffer.data + buffer.len, payload, 4);
        buffer.len += 4;
        memcpy(&tmp.word, payload, 4);
        if (!qr_got_recent_message(record, tmp.word)) {
            qr_process_client_message(record, (u8 *)payload + 4, len - 4);
        }
        break;
    case PACKET_CLIENT_MESSAGE_ACK:
    case PACKET_KEEPALIVE:
    default:
        return;
    }
    gsSocketSendTo(record->socket, buffer.data, buffer.len, 0, from, 8);
}

// Keep-alive packet to the master server
void send_keepalive(QRRecord *record) {
    QRBuffer buffer;
    buffer.len = 0;
    qr_add_packet_header(&buffer, PACKET_KEEPALIVE, (u8 *)record->instanceKey);
    gsSocketSendTo(record->socket, &buffer, buffer.len, 0, &record->masterAddr, 8);
    record->lastKeepAliveTime = current_time();
}

// Heartbeat: local addresses, query port, NAT flag, state change, game name, public address and all keys
void send_heartbeat(QRRecord *record, int stateChange) {
    QRBuffer buffer;
    char key[20];
    int i;
    buffer.len = 0;
    qr_add_packet_header(&buffer, PACKET_HEARTBEAT, (u8 *)record->instanceKey);
    for (i = 0; i < num_local_ips; i++) {
        sprintf(key, sFmt_Localip, i);
        qr2_buffer_addA(&buffer, key);
        qr2_buffer_addA(&buffer, SOC_InetNtoA(local_ip_list[i]));
    }
    qr2_buffer_addA(&buffer, sStr_localport);
    qr2_buffer_add_int(&buffer, record->queryPort);
    qr2_buffer_addA(&buffer, sStr_natneg);
    qr2_buffer_addA(&buffer, record->natNegotiate ? sStr_1_4 : sStr_0_6);
    if (stateChange) {
        qr2_buffer_addA(&buffer, sStr_statechanged);
        qr2_buffer_add_int(&buffer, stateChange);
    }
    qr2_buffer_addA(&buffer, sStr_gamename);
    qr2_buffer_addA(&buffer, record->gameName);
    if (record->publicAddressCallback) {
        qr2_buffer_addA(&buffer, sStr_publicip);
        qr2_buffer_add_int(&buffer, record->publicIp);
        qr2_buffer_addA(&buffer, sStr_publicport);
        qr2_buffer_add_int(&buffer, record->publicPort);
    }
    if (stateChange != 2) {
        qr_build_query_reply(record, &buffer, 255, NULL, 255, NULL, 255, NULL);
    } else if (2048 - buffer.len >= 1) {
        int len = buffer.len;
        buffer.len = len + 1;
        buffer.data[len] = 0;
    }
    gsSocketSendTo(record->socket, buffer.data, buffer.len, 0, &record->masterAddr, 8);
    {
        int now = current_time();
        record->lastHeartbeatTime = now;
        record->lastKeepAliveTime = now;
    }
    if (stateChange) {
        record->stateChangePending = 0;
    }
}

// Sets the name of a custom key id (50-254)
void qr2_register_keyA(int id, char *name) {
    if (id < 50 || id > 254) {
        return;
    }
    qr2_registered_key_list[id] = name;
}
