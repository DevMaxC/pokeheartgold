#pragma force_active on
#include <string.h>

#include "global.h"

#include "dwc/gt_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

// Reliable UDP sockets: the protocol messages (reliable messages with their serial numbers, acks,
// pings, challenge / response), the connection table, socket and connection creation and teardown,
// raw sends, and the "host:port" address conversions.

typedef struct GTInAddr {
    u32 addr;
} GTInAddr;

typedef struct GTHostEnt {
    u8 unk_00[12];
    u32 **addresses; // 0x0C
} GTHostEnt;

typedef struct GTBindAddr {
    u16 port;
    u16 unk_02;
    int length;
    u32 host;
    GTSockAddr address;
} GTBindAddr;

extern const char sStr_gti2EndReliableMessage[]; // "gti2EndReliableMessage"
extern const u8 gti2ProtocolMagic[];   // 0xFE 0xFE, protocol magic
extern const char sStr_LenGt0_2[]; // "len > 0"
extern const char sStr_Gt2MessageC[]; // "gt2Message.c"
extern const char sStr_gt2StringToAddress[]; // "gt2StringToAddress"
extern const char sFmt_StrColonInt[]; // "%s:%d"
extern const char sFmt_Str_2[]; // "%s"
extern const char sFmt_ColonInt[]; // ":%d"
extern const char sStr_LenLtGTI2_STACK_HOSTLEN_MAX[]; // "len < GTI2_STACK_HOSTLEN_MAX"
extern const char sStr_Gt2UtilityC[]; // "gt2Utility.c"
extern int gti2AddressStringIndex;          // which of the two address string buffers is next
extern char gti2AddressStrings[];       // two address string buffers of 22 bytes
extern u16 __msl_digit[];

extern int sprintf(char *, const char *, ...);
extern long atol(const char *);
extern char *strchr(const char *, int);
extern void __msl_assertion_failed(const char *, const char *, const char *, int);
extern char *SOC_InetNtoA(GTInAddr addr);
extern GTHostEnt *SOC_GetHostByName(const char *);
extern void *DWCi_GsMalloc(u32 size);
extern void DWCi_GsFree(void *p);
extern int ArrayLength(void *);
extern void *ArrayNew(int, int, void *);
extern void ArrayFree(void *);
extern void *ArrayNth(void *, int);
extern int ArrayAppend(void *, void *);
extern void ArrayDeleteAt(void *, int);
extern void *TableNew2(int, int, int, void *, void *, void *);
extern void TableFree(void *);
extern void TableEnter(void *, void *);
extern void TableRemove(void *, void *);
extern void *TableLookup(void *, void *);
extern int TableMapSafe2(void *, void *, void *);
extern u32 current_time(void);
extern void SocketStartUp(void);
extern void SocketShutDown(void);
extern int CanSendOnSocket(int sock);
extern int gsSocketCreate(int, int, int);
extern void gsSocketClose(int);
extern int gsSocketBind(int, void *, int);
extern int gsSocketSendTo(int sock, const u8 *data, int len, int flags, GTSockAddr *to, int toLen);
extern int gsSocketGetSockName(int, void *, int *);
extern u32 gsSocketInetAddr(const char *);
extern int gsSocketGetLastError(int sock);
extern void gti2MessageCheck(const u8 **data, int *len);

int gti2AddOutgoingMessage(GTConn *conn, int serial, int len);
int gti2StartReliableMessage(GTConn *conn, int type, int len, int *overflow);
int gti2EndReliableMessage(GTConn *conn);
int gti2SendAppReliable(GTConn *conn, void *msg, int len);
int gti2SendClientChallenge(GTConn *conn, void *challenge);
int gti2SendServerChallenge(GTConn *conn, void *response, void *challenge);
int gti2SendClientResponse(GTConn *conn, void *response, void *msg, int len);
int gti2SendAccept(GTConn *conn);
int gti2SendReject(GTConn *conn, void *msg, int len);
int gti2SendClose(GTConn *conn);
int gti2SendKeepAlive(GTConn *conn);
int gti2SendAppUnreliable(GTConn *conn, u8 *msg, int len);
int gti2SendAck(GTConn *conn);
int gti2SendNack(GTConn *conn, u16 first, u16 last);
int gti2SendPong(GTConn *conn, u8 *msg, int len);
int gti2SendClosed(GTConn *conn);
int gti2SendClosedToAddress(GTSocket *socket, u32 ip, u16 port);
int gti2ResendMessage(GTConn *conn, GTOutMsg *msg);
int gti2Send(GTConn *conn, void *msg, int len, int reliable);
u32 gti2ConnectionHash(GTConn **conn, u32 numBuckets);
int gti2ConnectionCompare(GTConn **a, GTConn **b);
void gti2ConnectionFree(GTConn **conn);
GTConn *gti2SocketFindConnection(GTSocket *socket, u32 ip, int port);
int gti2CreateSocket(GTSocket **out, char *address, int outgoingBufferSize, int incomingBufferSize, void *socketErrorCB);
void gti2CloseSocket(GTSocket *socket);
void gti2Listen(GTSocket *socket, int (*connectAttemptCB)());
GTConn *gti2AllocConnection(void);
int gti2NewSocketConnection(GTSocket *socket, GTConn **out, u32 ip, int port);
void gti2FreeSocketConnection(GTConn *conn);
int gti2SocketSend(GTSocket *socket, u32 ip, u16 port, const u8 *data, int len);
int gti2SocketConnectionsThinkMap(GTConn **conn, u32 *now);
int gti2SocketConnectionsThink(GTSocket *socket);
void gti2FreeClosedConnections(GTSocket *socket);
void gti2SocketError(GTSocket *socket);
char *gt2AddressToString(u32 ip, u16 port, char *buf);
int gt2StringToAddress(const char *text, u32 *ip, u16 *port);

// Remembers where the next reliable message starts in the outgoing buffer.
int gti2AddOutgoingMessage(GTConn *conn, int serial, int len) {
    GTOutMsg msg = { 0 };
    int n;
    msg.start = conn->outgoingBuffer.len;
    msg.len = len;
    msg.serial = serial;
    msg.lastSend = current_time();
    n = ArrayLength(conn->outgoingBufferedMessages);
    ArrayAppend(conn->outgoingBufferedMessages, &msg);
    return n + 1 == ArrayLength(conn->outgoingBufferedMessages);
}

// Writes the header of a reliable message: magic, type, serial number, expected serial number.
int gti2StartReliableMessage(GTConn *conn, int type, int len, int *overflow) {
    if (gti2GetBufferFreeSpace(&conn->outgoingBuffer) < len) {
        if (!gti2ConnectionOutOfMemoryError(conn)) {
            return 0;
        }
        *overflow = 1;
        return 1;
    }
    if (!gti2AddOutgoingMessage(conn, conn->serialNumber, len)) {
        if (!gti2ConnectionOutOfMemoryError(conn)) {
            return 0;
        }
        *overflow = 1;
        return 1;
    }
    gti2BufferWriteData(&conn->outgoingBuffer, gti2ProtocolMagic, 2);
    gti2BufferWriteByte(&conn->outgoingBuffer, type);
    type = conn->serialNumber;
    conn->serialNumber = type + 1;
    gti2BufferWriteUShort(&conn->outgoingBuffer, type);
    gti2BufferWriteUShort(&conn->outgoingBuffer, conn->expectedSerialNumber);
    *overflow = 0;
    return 1;
}

int gti2EndReliableMessage(GTConn *conn) {
    int n = ArrayLength(conn->outgoingBufferedMessages);
    GTOutMsg *msg;
    if (n <= 0) {
        __msl_assertion_failed(sStr_LenGt0_2, sStr_Gt2MessageC, sStr_gti2EndReliableMessage, 0x475);
    }
    msg = ArrayNth(conn->outgoingBufferedMessages, n - 1);
    if (gti2ConnectionSendData(conn, conn->outgoingBuffer.buffer + msg->start, msg->len)) {
        conn->pendingAck = 0;
        return 1;
    }
    return 0;
}

// Reliable user message (type 0).
int gti2SendAppReliable(GTConn *conn, void *msg, int len) {
    int overflow;
    if (!gti2StartReliableMessage(conn, GTI2MsgAppReliable, len + 7, &overflow)) {
        return 0;
    }
    if (overflow) {
        return 1;
    }
    gti2BufferWriteData(&conn->outgoingBuffer, msg, len);
    if (gti2EndReliableMessage(conn)) {
        return 1;
    }
    return 0;
}

// Challenge (type 1).
int gti2SendClientChallenge(GTConn *conn, void *challenge) {
    int overflow;
    if (!gti2StartReliableMessage(conn, GTI2MsgClientChallenge, 0x27, &overflow)) {
        return 0;
    }
    if (overflow) {
        return 1;
    }
    gti2BufferWriteData(&conn->outgoingBuffer, challenge, 0x20);
    if (gti2EndReliableMessage(conn)) {
        return 1;
    }
    return 0;
}

// Response + own challenge (type 2).
int gti2SendServerChallenge(GTConn *conn, void *response, void *challenge) {
    int overflow;
    if (!gti2StartReliableMessage(conn, GTI2MsgServerChallenge, 0x47, &overflow)) {
        return 0;
    }
    if (overflow) {
        return 1;
    }
    gti2BufferWriteData(&conn->outgoingBuffer, response, 0x20);
    gti2BufferWriteData(&conn->outgoingBuffer, challenge, 0x20);
    if (!gti2EndReliableMessage(conn)) {
        return 0;
    }
    conn->challengeTime = conn->lastSend;
    return 1;
}

// Response + initial message (type 3).
int gti2SendClientResponse(GTConn *conn, void *response, void *msg, int len) {
    int overflow;
    if (!gti2StartReliableMessage(conn, GTI2MsgClientResponse, len + 0x27, &overflow)) {
        return 0;
    }
    if (overflow) {
        return 1;
    }
    gti2BufferWriteData(&conn->outgoingBuffer, response, 0x20);
    gti2BufferWriteData(&conn->outgoingBuffer, msg, len);
    if (gti2EndReliableMessage(conn)) {
        return 1;
    }
    return 0;
}

// Accept (type 4).
int gti2SendAccept(GTConn *conn) {
    int overflow;
    if (!gti2StartReliableMessage(conn, GTI2MsgAccept, 7, &overflow)) {
        return 0;
    }
    if (overflow) {
        return 1;
    }
    if (gti2EndReliableMessage(conn)) {
        return 1;
    }
    return 0;
}

// Reject with a message (type 5).
int gti2SendReject(GTConn *conn, void *msg, int len) {
    int overflow;
    if (!gti2StartReliableMessage(conn, GTI2MsgReject, len + 7, &overflow)) {
        return 0;
    }
    if (overflow) {
        return 1;
    }
    gti2BufferWriteData(&conn->outgoingBuffer, msg, len);
    if (gti2EndReliableMessage(conn)) {
        return 1;
    }
    return 0;
}

// Close (type 6).
int gti2SendClose(GTConn *conn) {
    int overflow;
    if (!gti2StartReliableMessage(conn, GTI2MsgClose, 7, &overflow)) {
        return 0;
    }
    if (overflow) {
        return 1;
    }
    if (gti2EndReliableMessage(conn)) {
        return 1;
    }
    return 0;
}

// Keep alive (type 7).
int gti2SendKeepAlive(GTConn *conn) {
    int overflow;
    if (!gti2StartReliableMessage(conn, GTI2MsgKeepAlive, 7, &overflow)) {
        return 0;
    }
    if (overflow) {
        return 1;
    }
    if (gti2EndReliableMessage(conn)) {
        return 1;
    }
    return 0;
}

// Unreliable message; one that starts with the magic gets it doubled so it isn't taken for a protocol
// message.
int gti2SendAppUnreliable(GTConn *conn, u8 *msg, int len) {
    int pos;
    u8 *buffer;
    int n;
    if (len < 2 || memcmp(msg, gti2ProtocolMagic, 2)) {
        int result = gti2ConnectionSendData(conn, msg, len);
        if (result == 0) {
            return 0;
        }
        return 1;
    }
    n = len + 2;
    if (gti2GetBufferFreeSpace(&conn->outgoingBuffer) < n) {
        return 1;
    }
    buffer = conn->outgoingBuffer.buffer;
    pos = conn->outgoingBuffer.len;
    gti2BufferWriteData(&conn->outgoingBuffer, gti2ProtocolMagic, 2);
    gti2BufferWriteData(&conn->outgoingBuffer, msg, len);
    if (!gti2ConnectionSendData(conn, buffer + pos, n)) {
        return 0;
    }
    gti2BufferShorten(&conn->outgoingBuffer, -1, n);
    return 1;
}

// Ack (type 100).
int gti2SendAck(GTConn *conn) {
    u8 msg[5];
    memcpy(msg, gti2ProtocolMagic, 2);
    msg[2] = GTI2MsgAck;
    gti2WriteUShort(msg, 3, conn->expectedSerialNumber);
    if (gti2ConnectionSendData(conn, msg, 5)) {
        conn->pendingAck = 0;
        return 1;
    }
    return 0;
}

// Nack of a range of serial numbers (type 101).
int gti2SendNack(GTConn *conn, u16 first, u16 last) {
    u8 msg[7];
    int len = 0;
    memcpy(msg, gti2ProtocolMagic, 2);
    msg[2] = GTI2MsgNack;
    gti2WriteUShort(msg, 3, first);
    len += 5;
    if (first != last) {
        gti2WriteUShort(msg, len, last);
        len += 2;
    }
    if (!gti2ConnectionSendData(conn, msg, len)) {
        return 0;
    }
    return 1;
}

// Pong (type 103): the received ping sent back.
int gti2SendPong(GTConn *conn, u8 *msg, int len) {
    msg[2] = GTI2MsgPong;
    return gti2ConnectionSendData(conn, msg, len);
}

int gti2SendClosed(GTConn *conn) {
    return gti2SendClosedToAddress(conn->socket, conn->ip, conn->port);
}

// Closed (type 104), sent to an address without a connection.
int gti2SendClosedToAddress(GTSocket *socket, u32 ip, u16 port) {
    u8 msg[3];
    memcpy(msg, gti2ProtocolMagic, 2);
    msg[2] = GTI2MsgClosed;
    return gti2SocketSend(socket, ip, port, msg, 3) != 0;
}

// Resends a reliable message with the current expected serial number.
int gti2ResendMessage(GTConn *conn, GTOutMsg *msg) {
    gti2WriteUShort(conn->outgoingBuffer.buffer, msg->start + 5, conn->expectedSerialNumber);
    if (!gti2ConnectionSendData(conn, conn->outgoingBuffer.buffer + msg->start, msg->len)) {
        return 0;
    }
    msg->lastSend = conn->lastSend;
    if (conn->outgoingBuffer.buffer[msg->start + 2] == GTI2MsgServerChallenge) {
        conn->challengeTime = conn->lastSend;
    }
    return 1;
}

int gti2Send(GTConn *conn, void *msg, int len, int reliable) {
    if (reliable) {
        return gti2SendAppReliable(conn, msg, len);
    }
    return gti2SendAppUnreliable(conn, msg, len);
}

// Connection table hash, compare and free functions.
u32 gti2ConnectionHash(GTConn **conn, u32 numBuckets) {
    GTConn *c = *conn;
    return ((u32)c->ip * (u32)c->port) % numBuckets;
}

int gti2ConnectionCompare(GTConn **a, GTConn **b) {
    GTConn *p = *a, *q = *b;
    if (p->ip != q->ip) {
        return p->ip - q->ip;
    }
    return (s16)(p->port - q->port);
}

void gti2ConnectionFree(GTConn **conn) {
    gti2ConnectionCleanup(*conn);
}

GTConn *gti2SocketFindConnection(GTSocket *socket, u32 ip, int port) {
    GTConn key;
    GTConn *p;
    GTConn **found;
    key.ip = ip;
    key.port = port;
    p = &key;
    found = TableLookup(socket->connections, &p);
    return found ? *found : 0;
}

static inline u16 GTSwap16(u16 value) {
    int v = value;
    return ((v >> 8) & 255) | ((v << 8) & 0xff00);
}

int gti2CreateSocket(GTSocket **out, char *address, int outgoingBufferSize, int incomingBufferSize, void *socketErrorCB) {
    GTBindAddr local;
    GTSocket *socket;
    SocketStartUp();
    if (incomingBufferSize == 0) {
        incomingBufferSize = 65536;
    }
    if (outgoingBufferSize == 0) {
        outgoingBufferSize = 65536;
    }
    if (gt2StringToAddress(address, &local.host, &local.port) == 0) {
        return GT2AddressError;
    }
    socket = DWCi_GsMalloc(sizeof(GTSocket));
    if (socket == 0) {
        return GT2OutOfMemory;
    }
    memset(socket, 0, sizeof(GTSocket));
    socket->handle = INVALID_SOCKET;
    socket->incomingBufferSize = incomingBufferSize;
    socket->outgoingBufferSize = outgoingBufferSize;
    socket->socketErrorCB = socketErrorCB;
    socket->connections = TableNew2(4, 32, 2, gti2ConnectionHash, gti2ConnectionCompare, 0);
    if (socket->connections == 0) {
        DWCi_GsFree(socket);
        return GT2OutOfMemory;
    }
    socket->closedConnections = ArrayNew(4, 4, gti2ConnectionFree);
    if (socket->closedConnections == 0) {
        TableFree(socket->connections);
        DWCi_GsFree(socket);
        return GT2OutOfMemory;
    }
    socket->handle = gsSocketCreate(AF_INET, SOCK_DGRAM, 0);
    if (socket->handle == INVALID_SOCKET) {
        TableFree(socket->connections);
        ArrayFree(socket->closedConnections);
        DWCi_GsFree(socket);
        return GT2NetworkError;
    }
    memset(&local.address, 0, 8);
    local.address.family = AF_INET;
    local.address.addr = local.host;
    local.address.port = GTSwap16(local.port);
    if (gsSocketBind(socket->handle, &local.address, 8) == SOCKET_ERROR) {
        gsSocketClose(socket->handle);
        TableFree(socket->connections);
        ArrayFree(socket->closedConnections);
        DWCi_GsFree(socket);
        return GT2NetworkError;
    }
    local.length = 8;
    gsSocketGetSockName(socket->handle, &local.address, &local.length);
    socket->ip = local.address.addr;
    socket->port = GTSwap16(local.address.port);
    *out = socket;
    return GT2Success;
}

void gti2CloseSocket(GTSocket *socket) {
    if (socket->callbackLevel) {
        socket->close = 1;
        return;
    }
    gsSocketClose(socket->handle);
    TableFree(socket->connections);
    ArrayFree(socket->closedConnections);
    DWCi_GsFree(socket);
    SocketShutDown();
}

void gti2Listen(GTSocket *socket, int (*connectAttemptCB)()) {
    socket->connectAttemptCB = connectAttemptCB;
}

GTConn *gti2AllocConnection(void) {
    return DWCi_GsMalloc(sizeof(GTConn));
}

int gti2NewSocketConnection(GTSocket *socket, GTConn **out, u32 ip, int port) {
    GTConn *conn = 0;
    if (gti2SocketFindConnection(socket, ip, port)) {
        return GT2DuplicateAddress;
    }
    conn = gti2AllocConnection();
    if (conn) {
        memset(conn, 0, sizeof(GTConn));
        conn->ip = ip;
        conn->port = port;
        conn->socket = socket;
        conn->startTime = current_time();
        conn->lastSend = conn->startTime;
        conn->serialNumber = 0;
        conn->expectedSerialNumber = 0;
        if (!gti2AllocateBuffer(&conn->incomingBuffer, socket->incomingBufferSize)) {
            goto fail;
        }
        if (!gti2AllocateBuffer(&conn->outgoingBuffer, socket->outgoingBufferSize)) {
            goto fail;
        }
        conn->incomingBufferedMessages = ArrayNew(0x10, 0x40, 0);
        if (!conn->incomingBufferedMessages) {
            goto fail;
        }
        conn->outgoingBufferedMessages = ArrayNew(0x10, 0x40, 0);
        if (!conn->outgoingBufferedMessages) {
            goto fail;
        }
        conn->sendFilters = ArrayNew(4, 2, 0);
        if (!conn->sendFilters) {
            goto fail;
        }
        conn->receiveFilters = ArrayNew(4, 2, 0);
        if (!conn->receiveFilters) {
            goto fail;
        }
        TableEnter(socket->connections, &conn);
        *out = gti2SocketFindConnection(socket, ip, port);
        if (*out) {
            return GT2Success;
        }
    }
fail:
    if (conn) {
        DWCi_GsFree(conn->incomingBuffer.buffer);
        DWCi_GsFree(conn->outgoingBuffer.buffer);
        if (conn->incomingBufferedMessages) {
            ArrayFree(conn->incomingBufferedMessages);
        }
        if (conn->outgoingBufferedMessages) {
            ArrayFree(conn->outgoingBufferedMessages);
        }
        if (conn->sendFilters) {
            ArrayFree(conn->sendFilters);
        }
        if (conn->receiveFilters) {
            ArrayFree(conn->receiveFilters);
        }
        DWCi_GsFree(conn);
    }
    return GT2OutOfMemory;
}

// Removes a connection from its socket's tables (unless a callback is running on it).
void gti2FreeSocketConnection(GTConn *conn) {
    int n, i;
    if (conn->freeAtAcceptReject || conn->callbackLevel) {
        return;
    }
    if (conn->state == GTI2Closed) {
        n = ArrayLength(conn->socket->closedConnections);
        for (i = 0; i < n; i++) {
            if (conn == *(GTConn **)ArrayNth(conn->socket->closedConnections, i)) {
                ArrayDeleteAt(conn->socket->closedConnections, i);
                return;
            }
        }
    } else {
        TableRemove(conn->socket->connections, &conn);
    }
}

int gti2SocketSend(GTSocket *socket, u32 ip, u16 port, const u8 *data, int len) {
    int err;
    gti2MessageCheck(&data, &len);
    if (!CanSendOnSocket(socket->handle)) {
        return 1;
    }
    {
        GTSockAddr to = { 0 };
        to.family = AF_INET;
        to.port = ((port >> 8) & 0xff) | ((port << 8) & 0xff00);
        to.addr = ip;
        err = gsSocketSendTo(socket->handle, data, len, 0, &to, sizeof(to));
    }
    if (err == -1) {
        err = gsSocketGetLastError(socket->handle);
        if (err == -15) {
            if (gti2HandleConnectionReset(socket, ip, port) == 0) {
                return 0;
            }
        } else {
            if (err == -42 || err == -6) {
                return 1;
            }
            if (err != -35) {
                gti2SocketError(socket);
                return 0;
            }
        }
    } else if (socket->sendDumpCallback != 0) {
        if (gti2DumpCallback(socket, gti2SocketFindConnection(socket, ip, port), ip, port, 0, (u8 *)data, len, 1) == 0) {
            return 0;
        }
    }
    return 1;
}

int gti2SocketConnectionsThinkMap(GTConn **connp, u32 *now) {
    GTConn *conn = *connp;
    u32 time = *now;
    if (conn->state != GTI2Closed && !gti2ConnectionThink(conn, time)) {
        return 0;
    }
    if (conn->state == GTI2Closed && !conn->freeAtAcceptReject && !conn->callbackLevel) {
        gti2FreeSocketConnection(conn);
    }
    return 1;
}

int gti2SocketConnectionsThink(GTSocket *socket) {
    u32 now = current_time();
    return !TableMapSafe2(socket->connections, gti2SocketConnectionsThinkMap, &now);
}

void gti2FreeClosedConnections(GTSocket *socket) {
    int i;
    for (i = ArrayLength(socket->closedConnections) - 1; i >= 0; i--) {
        gti2FreeSocketConnection(*(GTConn **)ArrayNth(socket->closedConnections, i));
    }
}

void gti2SocketError(GTSocket *socket) {
    if (socket->error) {
        return;
    }
    socket->error = 1;
    gt2CloseAllConnectionsHard(socket);
    if (gti2SocketErrorCallback(socket)) {
        gti2CloseSocket(socket);
    }
}

static inline int GTIsDigit(int c) {
    return (c < 0 || c >= 128) ? 0 : (__msl_digit[c] & 8);
}

// "a.b.c.d:port" in buf, or in one of two alternating static buffers when buf is NULL.
char *gt2AddressToString(u32 ip, u16 port, char *buf) {
    if (buf == 0) {
        gti2AddressStringIndex ^= 1;
        buf = gti2AddressStrings + gti2AddressStringIndex * 22;
    }
    if (ip) {
        GTInAddr addr;
        addr.addr = ip;
        if (port) {
            sprintf(buf, sFmt_StrColonInt, SOC_InetNtoA(addr), port);
        } else {
            sprintf(buf, sFmt_Str_2, SOC_InetNtoA(addr));
        }
    } else {
        if (port) {
            sprintf(buf, sFmt_ColonInt, port);
        } else {
            *buf = 0;
        }
    }
    return buf;
}

// Parses "host[:port]" (host name or dotted address, either part may be missing).
int gt2StringToAddress(const char *text, u32 *ip, u16 *port) {
    char local[260];
    u32 address;
    u16 portValue;
    char *colon;
    if (!text || !*text) {
        address = 0;
        portValue = 0;
    } else {
        colon = strchr(text, ':');
        if (!colon) {
            portValue = 0;
        } else {
            if (colon == text) {
                text = 0;
                address = 0;
            } else {
                int length = colon - text;
                if (length >= 256) {
                    __msl_assertion_failed(sStr_LenLtGTI2_STACK_HOSTLEN_MAX, sStr_Gt2UtilityC, sStr_gt2StringToAddress, 129);
                }
                memcpy(local, text, length);
                local[length] = 0;
                text = local;
            }
            {
                char *p = colon + 1;
                while (*p) {
                    if (!GTIsDigit(*p)) {
                        return 0;
                    }
                    p++;
                }
            }
            {
                long value = atol(colon + 1);
                if (value < 0 || value > 65535) {
                    return 0;
                }
                portValue = (u16)value;
            }
        }
        if (text) {
            address = gsSocketInetAddr(text);
            if (address == 0xffffffff) {
                GTHostEnt *host = SOC_GetHostByName(text);
                if (!host) {
                    return 0;
                }
                address = *host->addresses[0];
            }
        }
    }
    if (ip) {
        *ip = address;
    }
    if (port) {
        *port = portValue;
    }
    return 1;
}
