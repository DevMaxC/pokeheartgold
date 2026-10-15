#pragma force_active on
#include <string.h>

#include "global.h"

#include "dwc/gt_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

// Reliable UDP sockets: the connection challenge / response, the growable message buffers, and the
// socket error and connect attempt callbacks into the user code.

extern const char sStr_gti2GetChallenge[]; // "gti2GetChallenge"
extern const char sStr_3b8dd8995f7c40a9a5c5b7dd5b481341[]; // "3b8dd8995f7c40a9a5c5b7dd5b481341"
extern const char sStr_buffer[]; // "buffer"
extern const char sStr_Gt2AuthC[]; // "gt2Auth.c"
extern const char sStr_gti2BufferShorten[]; // "gti2BufferShorten"
extern const char sStr_gti2BufferWriteData[]; // "gti2BufferWriteData"
extern const char sStr_gti2BufferWriteByte[]; // "gti2BufferWriteByte"
extern const char sStr_gti2BufferWriteUShort[]; // "gti2BufferWriteUShort"
extern const char sStr_BufferLenLtBufferSize[]; // "buffer->len < buffer->size"
extern const char sStr_Gt2BufferC[]; // "gt2Buffer.c"
extern const char sStr_BufferLen2_LeBufferSize[]; // "(buffer->len + 2) <= buffer->size"
extern const char sStr_BufferLenLenLeBufferSize[]; // "(buffer->len + len) <= buffer->size"
extern const char sStr_StartLeBufferLen[]; // "start <= buffer->len"
extern const char sStr_ShortenByLeBufferLenStart[]; // "shortenBy <= (buffer->len - start)"
extern const char sStr_gti2SocketErrorCallback[]; // "gti2SocketErrorCallback"
extern const char sStr_gti2ConnectAttemptCallback[]; // "gti2ConnectAttemptCallback"
extern const char sStr_socket[]; // "socket"
extern const char sStr_Gt2CallbackC[]; // "gt2Callback.c"
extern const char sStr_SocketAndConnection[]; // "socket && connection"

extern void __msl_assertion_failed(const char *expr, const char *file, const char *func, int line);
extern int abs(int x);
extern int rand(void);
extern void srand(unsigned int seed);
extern void *DWCi_GsMalloc(u32 size);
extern u32 current_time(void);
extern void gti2CloseSocket(GTSocket *socket);

int gti2ConnectAttemptCallback(GTSocket *socket, GTConn *connection, int ip, int port, int latency, int msg, int len);

BOOL gti2VerifyChallenge(const u8 *buf) {
    int parity;
    int i;
    parity = 0;
    i = 1;
    for (; i < 32; i++) {
        parity = ((buf[0] & 1) ^ (parity ^ ((i ^ buf[i - 1]) & 1))) ^ (buf[0] < 0x4f ? 1 : 0) ^ (buf[i - 1] < buf[0] ? 1 : 0);
        if ((parity != 0 && (buf[i] & 1) == 0) || (parity == 0 && (buf[i] & 1) == 1)) {
            return FALSE;
        }
    }
    return TRUE;
}

u8 *gti2GetChallenge(u8 *buf) {
    int i;
    int parity;
    if (buf == NULL) {
        __msl_assertion_failed(sStr_buffer, sStr_Gt2AuthC, sStr_gti2GetChallenge, 0x2b);
    }
    srand(current_time());
    buf[0] = rand() % 93 + 33;
    parity = 0;
    i = 1;
    for (; i < 32; i++) {
        parity = ((buf[0] & 1) ^ (parity ^ ((i ^ buf[i - 1]) & 1))) ^ (buf[0] < 0x4f ? 1 : 0) ^ (buf[i - 1] < buf[0] ? 1 : 0);
        buf[i] = rand() % 93 + 33;
        if ((parity != 0 && (buf[i] & 1) == 0) || (parity == 0 && (buf[i] & 1) == 1)) {
            buf[i]++;
        }
    }
    return buf;
}

char *gti2GetResponse(char *out, const char *key) {
    int i;
    int keyLen[1];
    BOOL valid;
    keyLen[0] = strlen(sStr_3b8dd8995f7c40a9a5c5b7dd5b481341);
    valid = gti2VerifyChallenge((const u8 *)key);
    for (i = 0; i < 32; i++) {
        if (!valid || i == 0 || i == 13) {
            out[i] = rand() % 93 + 33;
        } else {
            int prev = ((i == 1 || i == 14) ? key[i] : key[i - 1]);
            out[i] = abs(((u8 *)key)[(i * (u8)key[i] + sStr_3b8dd8995f7c40a9a5c5b7dd5b481341[(i + (u8)key[i]) % keyLen[0]]) % 32] ^ sStr_3b8dd8995f7c40a9a5c5b7dd5b481341[(prev * (i * 0x4647)) % keyLen[0]]) % 93 + 33;
        }
    }
    return out;
}

int gti2CheckResponse(u8 *a, u8 *b) {
    int i;
    for (i = 0; i < 32; i++) {
        if (i != 0 && i != 13 && a[i] != b[i]) {
            return 0;
        }
    }
    return 1;
}

int gti2AllocateBuffer(GTBuffer *buffer, int size) {
    buffer->buffer = DWCi_GsMalloc(size);
    if (!buffer->buffer) {
        return 0;
    }
    buffer->size = size;
    return 1;
}

int gti2GetBufferFreeSpace(GTBuffer *buffer) {
    return buffer->size - buffer->len;
}

void gti2BufferWriteByte(GTBuffer *buffer, u8 c) {
    if (!(buffer->len < buffer->size)) {
        __msl_assertion_failed(sStr_BufferLenLtBufferSize, sStr_Gt2BufferC, sStr_gti2BufferWriteByte, 0x23);
    }
    buffer->buffer[buffer->len++] = c;
}

void gti2BufferWriteUShort(GTBuffer *buffer, int v) {
    if (!(buffer->len + 2 <= buffer->size)) {
        __msl_assertion_failed(sStr_BufferLen2_LeBufferSize, sStr_Gt2BufferC, sStr_gti2BufferWriteUShort, 0x2e);
    }
    buffer->buffer[buffer->len++] = v >> 8;
    buffer->buffer[buffer->len++] = v;
}

void gti2BufferWriteData(GTBuffer *buffer, const void *src, int n) {
    if (!src || !n) {
        return;
    }
    if (n == -1) {
        n = strlen(src);
    }
    if (!(buffer->len + n <= buffer->size)) {
        __msl_assertion_failed(sStr_BufferLenLenLeBufferSize, sStr_Gt2BufferC, sStr_gti2BufferWriteData, 0x40);
    }
    memcpy(buffer->buffer + buffer->len, src, n);
    buffer->len += n;
}

void gti2BufferShorten(GTBuffer *buffer, int pos, int n) {
    if (pos == -1) {
        pos = buffer->len - n;
    }
    if (!(pos <= buffer->len)) {
        __msl_assertion_failed(sStr_StartLeBufferLen, sStr_Gt2BufferC, sStr_gti2BufferShorten, 0x4f);
    }
    if (!(n <= buffer->len - pos)) {
        __msl_assertion_failed(sStr_ShortenByLeBufferLenStart, sStr_Gt2BufferC, sStr_gti2BufferShorten, 0x50);
    }
    memmove(buffer->buffer + pos, buffer->buffer + pos + n, buffer->len - pos - n);
    buffer->len -= n;
}

int gti2SocketErrorCallback(GTSocket *socket) {
    if (!socket) {
        __msl_assertion_failed(sStr_socket, sStr_Gt2CallbackC, sStr_gti2SocketErrorCallback, 0x1b);
    }
    if (!socket) {
        return 1;
    }
    if (!socket->socketErrorCB) {
        return 1;
    }
    socket->callbackLevel++;
    socket->socketErrorCB(socket);
    socket->callbackLevel--;
    if (socket->close && socket->callbackLevel == 0) {
        gti2CloseSocket(socket);
        return 0;
    }
    return 1;
}

int gti2ConnectAttemptCallback(GTSocket *socket, GTConn *connection, int ip, int port, int latency, int msg, int len) {
    if (!(socket && connection)) {
        __msl_assertion_failed(sStr_SocketAndConnection, sStr_Gt2CallbackC, sStr_gti2ConnectAttemptCallback, 0x3d);
    }
    if (!socket || !connection) {
        return 1;
    }
    if (!socket->connectAttemptCB) {
        return 1;
    }
    if (!len || !msg) {
        msg = 0;
        len = 0;
    }
    socket->callbackLevel++;
    connection->callbackLevel++;
    socket->connectAttemptCB(socket, connection, ip, port, latency, msg, len);
    socket->callbackLevel--;
    connection->callbackLevel--;
    if (socket->close && socket->callbackLevel == 0) {
        gti2CloseSocket(socket);
        return 0;
    }
    return 1;
}
