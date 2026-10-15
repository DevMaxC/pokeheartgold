#pragma force_active on
#include <string.h>

#include "global.h"

#include "dwc/gp_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

// Presence connection buffers ("gpiBuffer.c": growable output / input buffers, buffered socket sends and
// reads, "\msg\" framing) and the queued user callbacks ("gpiCallback.c").

extern const char sStr_gpiRecvToBuffer[]; // "gpiRecvToBuffer"
extern const char sStr_gpiSendFromBuffer[]; // "gpiSendFromBuffer"
extern const char sStr_gpiSendOrBufferChar[]; // "gpiSendOrBufferChar"
extern const char sStr_gpiAppendCharToBuffer[]; // "gpiAppendCharToBuffer"
extern const char sStr_gpiSendOrBufferStringLen[]; // "gpiSendOrBufferStringLen"
extern const char sStr_gpiAppendStringToBufferLen[]; // "gpiAppendStringToBufferLen"
extern const char sStr_OutputBufferNeNULL[]; // "outputBuffer != NULL"
extern const char sStr_GpiBufferC[]; // "gpiBuffer.c"
extern const char sStr_OutOfMemory_3[]; // "Out of memory."
extern const char sStr_StringNeNULL[]; // "string != NULL"
extern const char sStr_StringLenGe0[]; // "stringLen >= 0"
extern const char sFmt_Int_2[]; // "%d"
extern const char sStr_ThereWasAnErrorSendingOnA_Socket[]; // "There was an error sending on a socket."
extern const char sFmt_SENDXXXX_ConnectionClosed[]; // "SENDXXXX(%s): Connection closed\n"
extern const char sStr_PeerOutputBufferBufferNeNULL[]; // "peer->outputBuffer.buffer != NULL"
extern const char sStr_PT[]; // "PT"
extern const char sStr_SockNeINVALID_SOCKET[]; // "sock != INVALID_SOCKET"
extern const char sStr_InputBufferNeNULL[]; // "inputBuffer != NULL"
extern const char sStr_BytesReadNeNULL[]; // "bytesRead != NULL"
extern const char sStr_ConnClosedNeNULL[]; // "connClosed != NULL"
extern const char sStr_ThereWasAnErrorReadingFromA_Socket[]; // "There was an error reading from a socket."
extern const char sFmt_RECVXXXX_ConnectionClosed[]; // "RECVXXXX(%s): Connection closed\n"
extern const char sFmt_RECVTOTL[]; // "RECVTOTL(%s): %d\n"
extern const char sStr_LenGe0[]; // "len >= 0"
extern const char sStr_PosGe0[]; // "pos >= 0"
extern const char sStr_PosLeLen[]; // "pos <= len"
extern const char sKey_msg_2[]; // "\\msg\\"
extern const char sKey_m[]; // "\\m\\"
extern const char sKey_len[]; // "\\len\\"
extern const char sStr_gpiCallCallback[]; // "gpiCallCallback"
extern const char sStr_gpiCallErrorCallback[]; // "gpiCallErrorCallback"
extern const char sStr_IconnectionNeNULL[]; // "iconnection != NULL"
extern const char sStr_GpiCallbackC[]; // "gpiCallback.c"
extern const char sStr_ResultNeGP_NO_ERROR[]; // "result != GP_NO_ERROR"
extern const char sStr_FatalEqGP_FATAL_OrFatalEqGP_NON_FATAL[]; // "(fatal == GP_FATAL) || (fatal == GP_NON_FATAL)"
extern const char sStr_OutOfMemory_4[]; // "Out of memory."
extern const char sStr_DataCallbackCallbackNeNULL[]; // "data->callback.callback != NULL"
extern const char sStr_DataArgNeNULL[]; // "data->arg != NULL"

extern int sprintf(char *, const char *, ...);
extern int strncmp(const char *, const char *, size_t);
extern long atol(const char *);
extern char *strchr(const char *, int);
extern void __msl_assertion_failed(const char *, const char *, const char *, int);
extern void *DWCi_GsMalloc(u32 size);
extern void *DWCi_GsRealloc(void *p, int size);
extern void DWCi_GsFree(void *p);
extern int ArrayLength(void *);
extern int gsSocketRecv(int, char *, int, int);
extern int gsSocketSend(int, void *, int, int);
extern int gsSocketGetLastError(int);

int gpiSendOrBufferString(GpConnection **connection, GpPeer *peer, char *string);
void gpiCallErrorCallback(GpConnection **connection, int result, int fatal);
int gpiAddCallback(GpConnection **connection, volatile GpCallback callback, void *arg, GpOperation *operation, int type, ...);

int gpiAppendCharToBuffer(GpConnection **connection, GpBuffer *outputBuffer, int c) {
    int len, size;
    char *buffer;
    if (!outputBuffer) {
        __msl_assertion_failed(sStr_OutputBufferNeNULL, sStr_GpiBufferC, sStr_gpiAppendCharToBuffer, 0x25);
    }
    len = outputBuffer->len;
    buffer = outputBuffer->buffer;
    size = outputBuffer->size;
    if (size == len) {
        size += 2048;
        buffer = DWCi_GsRealloc(buffer, size + 1);
        if (!buffer) {
            gpiSetErrorString(connection, sStr_OutOfMemory_3);
            return GP_MEMORY_ERROR;
        }
    }
    buffer[len] = c;
    buffer[len + 1] = 0;
    outputBuffer->len++;
    outputBuffer->size = size;
    outputBuffer->buffer = buffer;
    return GP_NO_ERROR;
}

int gpiAppendStringToBufferLen(GpConnection **connection, GpBuffer *outputBuffer, const char *string, int stringLen) {
    int len, size;
    char *buffer;
    if (!string) {
        __msl_assertion_failed(sStr_StringNeNULL, sStr_GpiBufferC, sStr_gpiAppendStringToBufferLen, 0x51);
    }
    if (stringLen < 0) {
        __msl_assertion_failed(sStr_StringLenGe0, sStr_GpiBufferC, sStr_gpiAppendStringToBufferLen, 0x52);
    }
    if (!outputBuffer) {
        __msl_assertion_failed(sStr_OutputBufferNeNULL, sStr_GpiBufferC, sStr_gpiAppendStringToBufferLen, 0x53);
    }
    if (!string) {
        return GP_NO_ERROR;
    }
    len = outputBuffer->len;
    size = outputBuffer->size;
    buffer = outputBuffer->buffer;
    if (size - len < stringLen) {
        size += stringLen < 2048 ? 2048 : stringLen;
        buffer = DWCi_GsRealloc(buffer, size + 1);
        if (!buffer) {
            gpiSetErrorString(connection, sStr_OutOfMemory_3);
            return GP_MEMORY_ERROR;
        }
    }
    memcpy(buffer + len, string, stringLen);
    buffer[len + stringLen] = 0;
    outputBuffer->len += stringLen;
    outputBuffer->size = size;
    outputBuffer->buffer = buffer;
    return GP_NO_ERROR;
}

int gpiAppendStringToBuffer(GpConnection **connection, GpBuffer *outputBuffer, const char *string) {
    return gpiAppendStringToBufferLen(connection, outputBuffer, string, strlen(string));
}

int gpiAppendIntToBuffer(GpConnection **connection, GpBuffer *outputBuffer, int n) {
    char buf[16];
    sprintf(buf, sFmt_Int_2, n);
    return gpiAppendStringToBuffer(connection, outputBuffer, buf);
}

#pragma optimize_for_size on

// Sends what the socket takes; "PR"-tagged sockets fail silently.
int gpiSendData(GpConnection **connection, int sock, void *data, int len, int *connClosed, int *bytesSent, const char *tag) {
    u32 n = gsSocketSend(sock, data, len, 0);
    if (n == -1) {
        int err = gsSocketGetLastError(sock);
        if (err != -6 && err != -26 && err != -76) {
            if (tag[0] == 'P' && tag[1] == 'R') {
                return GP_NETWORK_ERROR;
            }
            gpiSetError(connection, GP_NETWORK, sStr_ThereWasAnErrorSendingOnA_Socket);
            gpiCallErrorCallback(connection, GP_NETWORK_ERROR, GP_NON_FATAL);
            return GP_NETWORK_ERROR;
        }
        *bytesSent = 0;
        *connClosed = 0;
    } else {
        if (n > 0) {
            *bytesSent = n;
            *connClosed = 0;
            goto finish;
        }
        gpiDebug(connection, sFmt_SENDXXXX_ConnectionClosed, tag);
        *bytesSent = 0;
        *connClosed = 1;
    }
finish:
    return GP_NO_ERROR;
}

#pragma optimize_for_size reset

// gpiSendData was compiled for size in its own file; keep it out of line.
#pragma dont_inline on

int gpiSendOrBufferChar(GpConnection **connection, GpPeer *peer, char c, ...) {
    int closed, sent, result;
    if (peer->outputBuffer.buffer == 0) {
        __msl_assertion_failed(sStr_PeerOutputBufferBufferNeNULL, sStr_GpiBufferC, sStr_gpiSendOrBufferChar, 222);
    }
    if (peer->outputBuffer.len - peer->outputBuffer.pos == 0 && ArrayLength(peer->messages) == 0) {
        result = gpiSendData(connection, peer->sock, &c, 1, &closed, &sent, sStr_PT);
        if (result) {
            return result;
        }
        if (sent) {
            return GP_NO_ERROR;
        }
    }
    return gpiAppendCharToBuffer(connection, &peer->outputBuffer, *(s8 *)(&c));
}

int gpiSendOrBufferStringLen(GpConnection **connection, GpPeer *peer, char *string, int stringLen) {
    int total, result, closed, sent;
    if (!peer->outputBuffer.buffer) {
        __msl_assertion_failed(sStr_PeerOutputBufferBufferNeNULL, sStr_GpiBufferC, sStr_gpiSendOrBufferStringLen, 0xfb);
    }
    total = 0;
    if (!stringLen) {
        return total;
    }
    if (peer->outputBuffer.len - peer->outputBuffer.pos == 0 && ArrayLength(peer->messages) == 0) {
        do {
            result = gpiSendData(connection, peer->sock, string + total, stringLen, &closed, &sent, sStr_PT);
            if (result) {
                return result;
            }
            if (sent) {
                stringLen -= sent;
                total += sent;
            }
        } while (sent && stringLen);
    }
    if (stringLen) {
        result = gpiAppendStringToBufferLen(connection, &peer->outputBuffer, string + total, stringLen);
        if (result) {
            return result;
        }
    }
    return GP_NO_ERROR;
}

int gpiSendOrBufferString(GpConnection **connection, GpPeer *peer, char *string) {
    return gpiSendOrBufferStringLen(connection, peer, string, strlen(string));
}

#pragma opt_lifetimes off

int gpiRecvToBuffer(GpConnection **connection, int sock, GpBuffer *inputBuffer, int *bytesRead, int *connClosed, const char *tag) {
    char *buffer;
    int len, size, read, total, closed;

    struct {
        int a, b, c;
    } errors;

    if (sock == INVALID_SOCKET) {
        __msl_assertion_failed(sStr_SockNeINVALID_SOCKET, sStr_GpiBufferC, sStr_gpiRecvToBuffer, 0x150);
    }
    if (!inputBuffer) {
        __msl_assertion_failed(sStr_InputBufferNeNULL, sStr_GpiBufferC, sStr_gpiRecvToBuffer, 0x151);
    }
    if (!bytesRead) {
        __msl_assertion_failed(sStr_BytesReadNeNULL, sStr_GpiBufferC, sStr_gpiRecvToBuffer, 0x152);
    }
    if (!connClosed) {
        __msl_assertion_failed(sStr_ConnClosedNeNULL, sStr_GpiBufferC, sStr_gpiRecvToBuffer, 0x153);
    }
    len = inputBuffer->len;
    buffer = inputBuffer->buffer;
    size = inputBuffer->size;
    errors.c = -76;
    errors.b = -26;
    errors.a = -6;
    total = 0;
    closed = 0;
    do {
        if (len + 2048 > size) {
            size = len + 2048;
            buffer = DWCi_GsRealloc(buffer, size + 1);
            if (!buffer) {
                gpiSetErrorString(connection, sStr_OutOfMemory_3);
                return GP_MEMORY_ERROR;
            }
        }
        read = gsSocketRecv(sock, buffer + len, size - len, 0);
        if (read == -1) {
            int error = gsSocketGetLastError(sock);
            if (error != errors.a && error != errors.b && error != errors.c) {
                gpiSetErrorString(connection, sStr_ThereWasAnErrorReadingFromA_Socket);
                return GP_NETWORK_ERROR;
            }
        } else if (read) {
            len += read;
            total += read;
        } else {
            closed = 1;
            gpiDebug(connection, sFmt_RECVXXXX_ConnectionClosed, tag);
        }
        buffer[len] = 0;
    } while (read != -1 && !closed && total < 0x20000);
    if (total) {
        gpiDebug(connection, sFmt_RECVTOTL, tag, total);
    }
    inputBuffer->buffer = buffer;
    inputBuffer->len = len;
    inputBuffer->size = size;
    *bytesRead = total;
    *connClosed = closed;
    return GP_NO_ERROR;
}

#pragma opt_lifetimes reset

int gpiSendFromBuffer(GpConnection **connection, int sock, GpBuffer *outputBuffer, int *connClosed, int clear, const char *tag) {
    if (!outputBuffer) {
        __msl_assertion_failed(sStr_OutputBufferNeNULL, sStr_GpiBufferC, sStr_gpiSendFromBuffer, 441);
    }
    int total = 0, left;
    char *buffer;
    int pos, len;
    len = outputBuffer->len;
    pos = outputBuffer->pos;
    buffer = outputBuffer->buffer;
    left = len - pos;
    int result, closed, sent;
    if (left == 0) {
        return total;
    }
    do {
        result = gpiSendData(connection, sock, buffer + (pos + total), left, &closed, &sent, tag);
        if (result) {
            return result;
        }
        if (sent) {
            left -= sent;
            total += sent;
        }
    } while (sent && left);
    if (clear) {
        if (total > 0) {
            memmove(buffer, buffer + total, left + 1);
            len -= total;
        }
    } else {
        pos += total;
    }
    if (len < 0) {
        __msl_assertion_failed(sStr_LenGe0, sStr_GpiBufferC, sStr_gpiSendFromBuffer, 478);
    }
    if (pos < 0) {
        __msl_assertion_failed(sStr_PosGe0, sStr_GpiBufferC, sStr_gpiSendFromBuffer, 479);
    }
    if (pos > len) {
        __msl_assertion_failed(sStr_PosLeLen, sStr_GpiBufferC, sStr_gpiSendFromBuffer, 480);
    }
    outputBuffer->len = len;
    outputBuffer->pos = pos;
    if (connClosed) {
        *connClosed = closed;
    }
    return GP_NO_ERROR;
}

#pragma dont_inline reset

// Takes the next complete "...\msg\...\m\<type>\len\<n>\n<n bytes>" message out of inputBuffer, if any.
int gpiReadMessage(GpConnection **connection, GpBuffer *inputBuffer, char **message, int *type, int *len) {
    char tmp[16], *end;
    int n;
    *message = 0;
    if (inputBuffer->len < 5) {
        return GP_NO_ERROR;
    }
    end = strchr(inputBuffer->buffer, 10);
    if (end) {
        if (strncmp(end - 5, sKey_msg_2, 5)) {
            return GP_NETWORK_ERROR;
        }
        *end = 0;
        if (!gpiValueForKey(inputBuffer->buffer, sKey_m, tmp, 16)) {
            return GP_NETWORK_ERROR;
        }
        *type = atol(tmp);
        if (!gpiValueForKey(inputBuffer->buffer, sKey_len, tmp, 16)) {
            return GP_NETWORK_ERROR;
        }
        n = atol(tmp);
        if (inputBuffer->len > (n + 1) + (end - inputBuffer->buffer)) {
            if (end[n + 1]) {
                return GP_NETWORK_ERROR;
            }
            *message = end + 1;
            *len = n;
            inputBuffer->pos = (n + 1) + (end - inputBuffer->buffer) + 1;
        } else {
            *end = 10;
        }
    }
    return GP_NO_ERROR;
}

// Drops the message taken by gpiReadMessage.
int gpiClipBufferToPosition(GpConnection **connection, GpBuffer *inputBuffer) {
    if (!inputBuffer || !inputBuffer->buffer || !inputBuffer->pos) {
        return 0;
    }
    inputBuffer->len -= inputBuffer->pos;
    if (inputBuffer->len) {
        memmove(inputBuffer->buffer, inputBuffer->buffer + inputBuffer->pos, inputBuffer->len);
    }
    inputBuffer->buffer[inputBuffer->len] = 0;
    inputBuffer->pos = 0;
    return 0;
}

void gpiCallErrorCallback(GpConnection **connection, int result, int fatal) {
    GpConnection *iconnection = *connection;
    GpCallback callback;
    GpErrorArg *arg;
    if (!iconnection) {
        __msl_assertion_failed(sStr_IconnectionNeNULL, sStr_GpiCallbackC, sStr_gpiCallErrorCallback, 35);
    }
    if (!result) {
        __msl_assertion_failed(sStr_ResultNeGP_NO_ERROR, sStr_GpiCallbackC, sStr_gpiCallErrorCallback, 36);
    }
    if (fatal != GP_FATAL && fatal != GP_NON_FATAL) {
        __msl_assertion_failed(sStr_FatalEqGP_FATAL_OrFatalEqGP_NON_FATAL, sStr_GpiCallbackC, sStr_gpiCallErrorCallback, 37);
    }
    if (fatal == GP_FATAL) {
        iconnection->fatalError = 1;
    }
    callback.callback = iconnection->callbacks[GP_CALLBACK_ERROR].callback;
    callback.param = iconnection->callbacks[GP_CALLBACK_ERROR].param;
    if (callback.callback == 0) {
        return;
    }
    arg = DWCi_GsMalloc(16);
    if (arg) {
        arg->result = result;
        arg->fatal = fatal;
        arg->errorCode = iconnection->errorCode;
        arg->errorString = iconnection->errorString;
    }
    gpiAddCallback(connection, callback, arg, 0, GPI_ADD_ERROR);
}

// Queues a callback; gpiCallCallback calls it later.
int gpiAddCallback(GpConnection **connection, volatile GpCallback callback, void *arg, GpOperation *operation, int type, ...) {
    GpConnection *iconnection = *connection;
    GpCallbackData *data = DWCi_GsMalloc(24);
    if (!data) {
        gpiSetErrorString(connection, sStr_OutOfMemory_4);
        return GP_MEMORY_ERROR;
    }
    data->callback = callback.callback;
    data->param = callback.param;
    data->arg = arg;
    if (operation) {
        data->operationId = operation->id;
    } else {
        data->operationId = 0;
    }
    data->type = type;
    data->next = 0;
    if (!iconnection->callbacksHead) {
        iconnection->callbacksHead = data;
    }
    if (iconnection->callbacksTail) {
        iconnection->callbacksTail->next = data;
    }
    iconnection->callbacksTail = data;
    return GP_NO_ERROR;
}

// Calls a queued callback and frees its argument (with the strings / lists the argument type owns).
void gpiCallCallback(GpConnection **connection, GpCallbackData *data) {
    if (!data->callback) {
        __msl_assertion_failed(sStr_DataCallbackCallbackNeNULL, sStr_GpiCallbackC, sStr_gpiCallCallback, 110);
    }
    if (!data->arg) {
        __msl_assertion_failed(sStr_DataArgNeNULL, sStr_GpiCallbackC, sStr_gpiCallCallback, 111);
    }
    ((void (*)(GpConnection **, void *, void *))data->callback)(connection, data->arg, data->param);
    if (data->type == GPI_ADD_MESSAGE) {
        void **p = data->arg;
        DWCi_GsFree(p[2]);
        ((void **)data->arg)[2] = 0;
    } else if (data->type == GPI_ADD_NICKS) {
        int i;
        GpListArg *list = data->arg;
        for (i = 0; i < list->count; i++) {
            DWCi_GsFree(list->a[i]);
            list->a[i] = 0;
            DWCi_GsFree(list->b[i]);
            list->b[i] = 0;
        }
        DWCi_GsFree(list->a);
        list->a = 0;
        DWCi_GsFree(list->b);
        list->b = 0;
    } else if (data->type == GPI_ADD_PMATCH) {
        void **p = data->arg;
        DWCi_GsFree(p[3]);
        p[3] = 0;
    } else if (data->type == GPI_ADD_TRANSFER_CALLBACK) {
        void **p = data->arg;
        if (p[4]) {
            DWCi_GsFree(p[4]);
            p[4] = 0;
        }
    } else if (data->type == GPI_ADD_REVERSE_BUDDIES) {
        void **p = data->arg;
        if (p[2]) {
            DWCi_GsFree(p[2]);
            p[2] = 0;
        }
    } else if (data->type == GPI_ADD_SUGGESTED_UNIQUE) {
        int i;

        struct {
            u32 x;
            int count;
            void **p;
        } *p = data->arg;

        for (i = 0; i < p->count; i++) {
            DWCi_GsFree(p->p[i]);
            p->p[i] = 0;
        }
        DWCi_GsFree(p->p);
        p->p = 0;
    }
    DWCi_GsFree(data->arg);
    data->arg = 0;
    DWCi_GsFree(data);
}
