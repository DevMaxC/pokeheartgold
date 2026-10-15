#pragma force_active on
#include "global.h"

#include "dwc/http_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

// Multipart body overhead per field, computed once from the boundary string.
typedef struct GHIMultipartLengths {
    int footer;
    int stringField;
    int boundary;
    int fileField;
} GHIMultipartLengths;

typedef struct GHIThrottleSettings {
    int delay; // ms between two receives
    int bytesPerRecv;
} GHIThrottleSettings;

// "%00": url-encoding of one character
typedef struct GHIPercentEscape {
    char chars[4];
} GHIPercentEscape;

extern GHIConnList ghiConnectionList;
extern int ghiReferenceCount;
extern char *ghiProxyAddress; // proxy server address
extern GHIThrottleSettings ghiThrottleSettings;
extern int ghiThrottleBufferSize; // socket receive buffer size while throttled
extern GHIMultipartLengths ghiMultipartLengths;
extern GHIPercentEscape ghiPercentEscape;
extern char sStr_ghiFreeBuffer[];
extern char sStr_ghiInitBuffer[];
extern char sStr_ghiResetBuffer[];
extern char sStr_ghiResizeBuffer[];
extern char sStr_ghiInitFixedBuffer[];
extern char sStr_ghiAppendCharToBuffer[];
extern char sStr_ghiAppendDataToBuffer[];
extern char sStr_ghiReadDataFromBuffer[];
extern char sStr_buffer_2[];
extern char sStr_GhttpBufferC[];
extern char sStr_SizeIncrementGt0[];
extern char sStr_connection_3[];
extern char sStr_InitialSizeGt0[];
extern char sStr_userBuffer[];
extern char sStr_SizeGt0[];
extern char sStr_data_2[];
extern char sStr_DataLenGe0[];
extern char sStr_ConnectionEncryptorMEngineNe[];
extern char sStr_ColonSpace_2[];
extern char sStr_CrLf_2[];
extern char sFmt_Int_8[];
extern char sStr_BufferInNeNULL[];
extern char sStr_LenNeNULL[];
extern char sStr_ghiCallPostCallback[];
extern char sStr_ghiCallProgressCallback[];
extern char sStr_ghiCallCompletedCallback[];
extern char sStr_connection_4[];
extern char sStr_GhttpCallbacksC[];
extern char sStr_ghiFindFreeSlot[];
extern char sStr_ghiFreeConnection[];
extern char sStr_ghiRedirectConnection[];
extern char sStr_ghiRequestToConnection[];
extern char sStr_GhiNumConnectionsEqGhiConnectionsLen[];
extern char sStr_GhttpConnectionC[];
extern char sStr_connection_5[];
extern char sStr_ConnectionRequestGe0[];
extern char sStr_ConnectionRequestLtGhiConnectionsLen[];
extern char sStr_ConnectionInUse[];
extern char sStr_RequestGe0[];
extern char sStr_RequestLtGhiConnectionsLen[];
extern char sStr_ConnectionRedirectURL[];
extern char sStr_ghttpGetExA[];
extern char sStr_ghiProcessConnection[];
extern char sStr_connection_6[];
extern char sStr_GhttpMainC[];
extern char sStr_GhiRequestToConnectionConnectionRequestEq[];
extern char sStr_URL_AndURL_0[];
extern char sStr_BufferSizeGe0_2[];
extern char sStr_NotBufferOrBufferSize[];
extern char sStr_ghiPostInitState[];
extern char sStr_ghiPostDoPosting[];
extern char sStr_ghiPostStateInit[];
extern char sStr_ghiPostStateCleanup[];
extern char sStr_ghiPostStateDoPosting[];
extern char sStr_ghiPostGetContentType[];
extern char sStr_ghiPostGetContentLength[];
extern char sStr_ghiPostStringStateDoPosting[];
extern char sStr_ghiPostFileDiskStateDoPosting[];
extern char sStr_ghiPostGetNoFilesContentLength[];
extern char sStr_ghiPostFileMemoryStateDoPosting[];
extern char sStr_ghiPostGetHasFilesContentLength[];
extern char sStr_0_13[];
extern char sStr_GhttpPostC[];
extern char sStr_AbcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV[];
extern char sStr_post[];
extern char sStr_Empty_22[];
extern char sStr_MultipartFormDataBoundaryQr4G823s23d7d118e0536[];
extern char sStr_ApplicationX_WwwFormUrlencoded[];
extern char sStr_DataTypeEqGHIString[];
extern char sStr_Qr4G823s23d7d118e0536[];
extern char sStr_state[];
extern char sStr_ConnectionPost[];
extern char sStr_ArrayLengthConnectionPostDataEqArrayLength[];
extern char sStr_StatePosGe0[];
extern char sStr_StatePosLtStateDataDataStringLen[];
extern char sStr_C_16_Lt16[];
extern char sStr_0123456789ABCDEF[];
extern char sStr_StatePosLtStateStateFileDiskLen[];
extern char sStr_StatePosEqIntFtellStateStateFileDiskFile[];
extern char sStr_StatePosLtStateDataDataFileMemoryLen[];
extern char sStr_StateDataTypeEqGHIString[];
extern char sFmt_StrEq_2[];
extern char sFmt_AmpStrEq_2[];
extern char sStr_Qr4G823s23d7d118e0536_2[];
extern char sStr_Qr4G823s23d7d118e0536_3[];
extern char sFmt_ContentDispositionFormDataName[];
extern char sFmt_ContentDispositionFormDataNameFilenameContent[];
extern char sStr_StateDataTypeEqGHIFileMemory[];
extern char sStr_connection_7[];
extern char sStr_ConnectionPostingStateStates[];
extern char sStr_ConnectionPostingStateIndexGe0[];
extern char sStr_ConnectionPostingStateIndexLeArrayLength[];
extern char sStr_postState[];
extern char sStr_ConnectionCompletedAndConnectionResult[];
extern char sStr_Qr4G823s23d7d118e0536_4[];

static inline void ClearPostState(void *p) {
    GHIPostState *state = p;
    state->data = NULL;
    state->pos = 0;
    state->file = NULL;
    state->len = 0;
}

int ghiResizeBuffer(GHIBuffer *buffer, int sizeIncrement) {
    char *tmp;
    int newSize;
    HTTP_ASSERT(buffer, sStr_buffer_2, sStr_GhttpBufferC, sStr_ghiResizeBuffer, 0x20);
    HTTP_ASSERT(sizeIncrement > 0, sStr_SizeIncrementGt0, sStr_GhttpBufferC, sStr_ghiResizeBuffer, 0x21);
    if (!buffer) {
        return 0;
    }
    if (sizeIncrement <= 0) {
        return 0;
    }
    newSize = buffer->size + sizeIncrement;
    tmp = DWCi_GsRealloc(buffer->data, newSize);
    if (!tmp) {
        return 0;
    }
    buffer->data = tmp;
    buffer->size = newSize;
    return 1;
}

int ghiInitBuffer(GHIConnection *connection, GHIBuffer *buffer, int initialSize, int sizeIncrement) {
    HTTP_ASSERT(connection, sStr_connection_3, sStr_GhttpBufferC, sStr_ghiInitBuffer, 0x43);
    HTTP_ASSERT(buffer, sStr_buffer_2, sStr_GhttpBufferC, sStr_ghiInitBuffer, 0x44);
    HTTP_ASSERT(initialSize > 0, sStr_InitialSizeGt0, sStr_GhttpBufferC, sStr_ghiInitBuffer, 0x45);
    HTTP_ASSERT(sizeIncrement > 0, sStr_SizeIncrementGt0, sStr_GhttpBufferC, sStr_ghiInitBuffer, 0x46);
    if (!connection) {
        return 0;
    }
    if (!buffer) {
        return 0;
    }
    if (initialSize <= 0) {
        return 0;
    }
    if (sizeIncrement <= 0) {
        return 0;
    }
    buffer->connection = connection;
    buffer->data = NULL;
    buffer->size = 0;
    buffer->len = 0;
    buffer->pos = 0;
    buffer->sizeIncrement = sizeIncrement;
    buffer->fixed = 0;
    buffer->dontFree = 0;
    buffer->encrypted = 0;
    if (!ghiResizeBuffer(buffer, initialSize)) {
        return 0;
    }
    buffer->data[0] = '\0';
    return 1;
}

int ghiInitFixedBuffer(GHIConnection *connection, GHIBuffer *buffer, char *userBuffer, int size) {
    HTTP_ASSERT(connection, sStr_connection_3, sStr_GhttpBufferC, sStr_ghiInitFixedBuffer, 0x74);
    HTTP_ASSERT(buffer, sStr_buffer_2, sStr_GhttpBufferC, sStr_ghiInitFixedBuffer, 0x75);
    HTTP_ASSERT(userBuffer, sStr_userBuffer, sStr_GhttpBufferC, sStr_ghiInitFixedBuffer, 0x76);
    HTTP_ASSERT(size > 0, sStr_SizeGt0, sStr_GhttpBufferC, sStr_ghiInitFixedBuffer, 0x77);
    if (!connection) {
        return 0;
    }
    if (!buffer) {
        return 0;
    }
    if (!userBuffer) {
        return 0;
    }
    if (size <= 0) {
        return 0;
    }
    buffer->connection = connection;
    buffer->data = userBuffer;
    buffer->size = size;
    buffer->len = 0;
    buffer->sizeIncrement = 0;
    buffer->fixed = 1;
    buffer->dontFree = 1;
    buffer->encrypted = 0;
    buffer->data[0] = '\0';
    return 1;
}

void ghiFreeBuffer(GHIBuffer *buffer) {
    HTTP_ASSERT(buffer, sStr_buffer_2, sStr_GhttpBufferC, sStr_ghiFreeBuffer, 0x9b);
    if (!buffer || !buffer->data) {
        return;
    }
    if (!buffer->dontFree) {
        DWCi_GsFree(buffer->data);
    }
    memset(buffer, 0, sizeof(GHIBuffer));
}

int ghiAppendDataToBuffer(GHIBuffer *buffer, const char *data, int len) {
    GHIConnection *connection = buffer->connection;
    int newLen;
    HTTP_ASSERT(buffer, sStr_buffer_2, sStr_GhttpBufferC, sStr_ghiAppendDataToBuffer, 0xb7);
    HTTP_ASSERT(data, sStr_data_2, sStr_GhttpBufferC, sStr_ghiAppendDataToBuffer, 0xb8);
    HTTP_ASSERT(len >= 0, sStr_DataLenGe0, sStr_GhttpBufferC, sStr_ghiAppendDataToBuffer, 0xb9);
    if (!buffer) {
        return 0;
    }
    if (!data) {
        return 0;
    }
    if (len < 0) {
        return 0;
    }
    if (len == 0) {
        len = strlen(data);
    }
    if (buffer->encrypted == 1) {
        int result;
        HTTP_ASSERT(connection->encryptor.engine, sStr_ConnectionEncryptorMEngineNe, sStr_GhttpBufferC, sStr_ghiAppendDataToBuffer, 0xce);
        do {
            int outLen = buffer->size - buffer->len;
            result = connection->encryptor.encryptFunc(connection, &connection->encryptor, data, &len, buffer->data + buffer->len, &outLen);
            if (result == 2) {
                if (buffer->fixed) {
                    buffer->connection->completed = 1;
                    buffer->connection->result = GHTTPBufferOverflow;
                    return 0;
                }
                if (ghiResizeBuffer(buffer, buffer->sizeIncrement)) {
                    buffer->connection->completed = 1;
                    buffer->connection->result = GHTTPOutOfMemory;
                    return 0;
                }
            } else {
                buffer->len += outLen;
            }
        } while (result == 2);
    } else {
        newLen = buffer->len + len;
        while (newLen >= buffer->size) {
            if (buffer->fixed) {
                buffer->connection->completed = 1;
                buffer->connection->result = GHTTPBufferOverflow;
                return 0;
            }
            if (!ghiResizeBuffer(buffer, buffer->sizeIncrement)) {
                buffer->connection->completed = 1;
                buffer->connection->result = GHTTPOutOfMemory;
                return 0;
            }
        }
        memcpy(buffer->data + buffer->len, data, len);
        buffer->len = newLen;
        buffer->data[newLen] = '\0';
    }
    return 1;
}

int ghiAppendHeaderToBuffer(GHIBuffer *buffer, const char *name, const char *value) {
    if (!ghiAppendDataToBuffer(buffer, name, 0)) {
        return 0;
    }
    if (!ghiAppendDataToBuffer(buffer, sStr_ColonSpace_2, 2)) {
        return 0;
    }
    if (!ghiAppendDataToBuffer(buffer, value, 0)) {
        return 0;
    }
    if (!ghiAppendDataToBuffer(buffer, sStr_CrLf_2, 2)) {
        return 0;
    }
    return 1;
}

int ghiAppendCharToBuffer(GHIBuffer *buffer, int c) {
    char ch = c;
    HTTP_ASSERT(buffer, sStr_buffer_2, sStr_GhttpBufferC, sStr_ghiAppendCharToBuffer, 0x131);
    if (!buffer) {
        return 0;
    }
    return ghiAppendDataToBuffer(buffer, &ch, 1);
}

int ghiAppendIntToBuffer(GHIBuffer *buffer, int i) {
    char buf[16];
    sprintf(buf, sFmt_Int_8, i);
    return ghiAppendDataToBuffer(buffer, buf, 0);
}

void ghiResetBuffer(GHIBuffer *buffer) {
    HTTP_ASSERT(buffer, sStr_buffer_2, sStr_GhttpBufferC, sStr_ghiResetBuffer, 0x16c);
    buffer->len = 0;
    buffer->pos = 0;
    buffer->data[0] = '\0';
}

int ghiSendBufferedData(GHIConnection *c) {
    int writeFlag;
    int exceptFlag;
    int n;
    do {
        if (GSISocketSelect(c->socket, 0, &writeFlag, &exceptFlag) == -1 || exceptFlag) {
            c->completed = 1;
            c->result = GHTTPSocketFailed;
            c->socketError = gsSocketGetLastError(c->socket);
            return 0;
        }
        if (!writeFlag) {
            return 1;
        }
        n = ghiDoSend(c, c->sendBuffer.data + c->sendBuffer.pos, c->sendBuffer.len - c->sendBuffer.pos);
        if (n == -1) {
            return 0;
        }
        c->sendBuffer.pos += n;
    } while (c->sendBuffer.pos < c->sendBuffer.len);
    return 1;
}

int ghiReadDataFromBuffer(GHIBuffer *buffer, char *out, int *len) {
    int n;
    int avail;
    HTTP_ASSERT(buffer, sStr_BufferInNeNULL, sStr_GhttpBufferC, sStr_ghiReadDataFromBuffer, 0x1b7);
    HTTP_ASSERT(len, sStr_LenNeNULL, sStr_GhttpBufferC, sStr_ghiReadDataFromBuffer, 0x1b8);
    n = *len;
    if (n == 0) {
        return 0;
    }
    avail = buffer->len - buffer->pos;
    if (avail <= 0) {
        return 0;
    }
    if (n >= avail) {
        n = avail;
    }
    memcpy(out, buffer->data + buffer->pos, n);
    out[n] = '\0';
    *len = n;
    buffer->pos += n;
    return 1;
}

void ghiCallCompletedCallback(GHIConnection *c) {
    char *buffer;
    int len;
    int r;
    HTTP_ASSERT(c, sStr_connection_4, sStr_GhttpCallbacksC, sStr_ghiCallCompletedCallback, 0x1b);
    if (!c->completedCallback) {
        return;
    }
    if (c->type) {
        buffer = NULL;
        len = 0;
    } else {
        buffer = c->getFileBuffer.data;
        len = c->fileBytesReceived;
    }
    r = c->completedCallback(c->request, c->result, buffer, len, c->callbackParam);
    if (buffer && !r) {
        c->getFileBuffer.dontFree = 1;
    }
}

void ghiCallProgressCallback(GHIConnection *c, const char *buffer, int len) {
    HTTP_ASSERT(c, sStr_connection_4, sStr_GhttpCallbacksC, sStr_ghiCallProgressCallback, 0x45);
    if (!c->progressCallback) {
        return;
    }
    c->progressCallback(c->request, c->state, buffer, len, c->fileBytesReceived, c->totalSize, c->callbackParam);
}

void ghiCallPostCallback(GHIConnection *c) {
    HTTP_ASSERT(c, sStr_connection_4, sStr_GhttpCallbacksC, sStr_ghiCallPostCallback, 0x5e);
    if (!c->postCallback) {
        return;
    }
    c->postCallback(c->request, c->bytesPosted, c->totalBytes, c->index, ArrayLength(c->states), c->callbackParam);
}

void ghiCreateLock(void) {
}

void ghiFreeLock(void) {
}

void ghiLock(void) {
}

void ghiUnlock(void) {
}

int ghiDecryptReceivedData(GHIConnection *c) {
    int inLen = 0;
    int outLen = 0;
    int result;
    int remain;
    char *inData;
    char *outData;
    do {
        inData = c->recvBuffer.data + c->recvBuffer.pos;
        inLen = c->recvBuffer.len - c->recvBuffer.pos;
        outData = c->encodeBuffer.data + c->encodeBuffer.len;
        outLen = c->encodeBuffer.size - c->encodeBuffer.len;
        result = c->encryptor.decryptFunc(c, &c->encryptor, inData, &inLen, outData, &outLen);
        if (result == 2) {
            if (!ghiResizeBuffer(&c->encodeBuffer, c->encodeBuffer.sizeIncrement)) {
                return 0;
            }
        }
    } while (result == 2 && outLen == 0);
    c->recvBuffer.pos += inLen;
    c->encodeBuffer.len += outLen;
    if (c->recvBuffer.pos > 0xff) {
        remain = c->recvBuffer.len - c->recvBuffer.pos;
        if (remain == 0) {
            ghiResetBuffer(&c->recvBuffer);
        } else {
            memmove(c->recvBuffer.data, c->recvBuffer.data + c->recvBuffer.pos, remain);
            c->recvBuffer.pos = 0;
            c->recvBuffer.len = remain;
        }
    }
    if (result == 3) {
        c->completed = 1;
        c->result = GHTTPEncryptionError;
        return 0;
    }
    return 1;
}

int ghiDoReceive(GHIConnection *c, char *buffer, int *bufferLen) {
    int rcode;
    int len = *bufferLen - 1;
    if (c->throttle) {
        u32 now = current_time();
        if (now < c->lastThrottleRecv + ghiThrottleSettings.delay) {
            return 1;
        }
        c->lastThrottleRecv = now;
        if (len >= ghiThrottleSettings.bytesPerRecv) {
            len = ghiThrottleSettings.bytesPerRecv;
        }
    }
    if (c->encodeBuffer.pos < c->encodeBuffer.len) {
        ghiReadDataFromBuffer(&c->encodeBuffer, buffer, bufferLen);
        if (c->encodeBuffer.pos == c->encodeBuffer.len) {
            c->encodeBuffer.len = c->headerLength;
            c->encodeBuffer.pos = c->headerLength;
        }
        return 0;
    }
    rcode = gsSocketRecv(c->socket, buffer, len, 0);
    if (rcode == -1) {
        int err = gsSocketGetLastError(c->socket);
        if (err == -6 || err == -26 || err == -76) {
            return 1;
        }
        c->completed = 1;
        c->result = GHTTPSocketFailed;
        c->socketError = err;
        c->connectionClosed = 1;
        return 3;
    }
    if (rcode == 0) {
        c->connectionClosed = 1;
        return 2;
    }
    if (c->encryptor.engine) {
        if (!ghiAppendDataToBuffer(&c->recvBuffer, buffer, rcode)) {
            return 3;
        }
        if (!ghiDecryptReceivedData(c)) {
            c->completed = 1;
            c->result = GHTTPEncryptionError;
            return 3;
        }
        if (c->encodeBuffer.len - c->encodeBuffer.pos <= 0) {
            buffer[0] = '\0';
            *bufferLen = 0;
            return 1;
        }
        rcode = *bufferLen - 1;
        if (!ghiReadDataFromBuffer(&c->encodeBuffer, buffer, &rcode)) {
            return 3;
        }
        if (c->encodeBuffer.pos == c->encodeBuffer.len) {
            c->encodeBuffer.len = c->headerLength;
            c->encodeBuffer.pos = c->headerLength;
        }
        if (rcode <= 0) {
            return 1;
        }
    }
    buffer[rcode] = '\0';
    *bufferLen = rcode;
    if (rcode <= 0) {
        return 1;
    }
    return 0;
}

int ghiDoSend(GHIConnection *c, const char *buf, int len) {
    int n = gsSocketSend(c->socket, buf, len, 0);
    if (n == -1) {
        int err = gsSocketGetLastError(c->socket);
        if (err == -6 || err == -26 || err == -76) {
            return 0;
        }
        c->completed = 1;
        c->result = GHTTPSocketFailed;
        c->socketError = err;
        return -1;
    }
    if (c->state == GHI_STATE_POSTING) {
        c->bytesPosted += n;
    }
    return n;
}

int ghiTrySendThenBuffer(GHIConnection *c, const char *data, int len) {
    int n = 0;
    if (c->sendBuffer.len == 0) {
        n = ghiDoSend(c, data, len);
        if (n == -1) {
            return 0;
        }
        if (n == len) {
            return 1;
        }
    }
    if (!ghiAppendDataToBuffer(&c->sendBuffer, data + n, len - n)) {
        return 0;
    }
    return 2;
}

int ghiFindFreeSlot(void) {
    int i;
    int oldCap;
    int newCap;
    GHIConnection **tmp;
    for (i = 0; i < ghiConnectionList.capacity; i++) {
        if (!ghiConnectionList.list[i]->inUse) {
            return i;
        }
    }
    HTTP_ASSERT(ghiConnectionList.count == ghiConnectionList.capacity, sStr_GhiNumConnectionsEqGhiConnectionsLen, sStr_GhttpConnectionC, sStr_ghiFindFreeSlot, 0x33);
    oldCap = ghiConnectionList.capacity;
    newCap = ghiConnectionList.capacity + 4;
    tmp = DWCi_GsRealloc(ghiConnectionList.list, newCap * sizeof(GHIConnection *));
    if (!tmp) {
        return -1;
    }
    ghiConnectionList.list = tmp;
    for (i = oldCap; i < newCap; i++) {
        ghiConnectionList.list[i] = DWCi_GsMalloc(sizeof(GHIConnection));
        if (!ghiConnectionList.list[i]) {
            for (i--; i >= oldCap; i--) {
                DWCi_GsFree(ghiConnectionList.list[i]);
            }
            return -1;
        }
        ghiConnectionList.list[i]->inUse = 0;
    }
    ghiConnectionList.capacity = newCap;
    return oldCap;
}

GHIConnection *ghiNewConnection(void) {
    int slot;
    GHIConnection *c;
    int ok;
    ghiLock();
    slot = ghiFindFreeSlot();
    if (slot == -1) {
        ghiUnlock();
        return NULL;
    }
    c = ghiConnectionList.list[slot];
    memset(c, 0, sizeof(GHIConnection));
    c->inUse = 1;
    c->request = slot;
    c->uniqueID = ghiConnectionList.nextUniqueID++;
    c->type = 0;
    c->state = GHI_STATE_HOST_LOOKUP;
    c->URL = NULL;
    c->serverAddress = NULL;
    c->serverIP = 0;
    c->serverPort = 0;
    c->requestPath = NULL;
    c->sendHeaders = NULL;
    c->unk_2C = 0;
    c->blocking = 0;
    c->keepAlive = 0;
    c->result = GHTTPSuccess;
    c->progressCallback = NULL;
    c->completedCallback = NULL;
    c->callbackParam = NULL;
    c->socket = INVALID_SOCKET;
    c->socketError = 0;
    c->userBufferSupplied = 0;
    c->statusMajor = 0;
    c->statusMinor = 0;
    c->statusCode = 0;
    c->statusStringIndex = 0;
    c->headerIndex = 0;
    c->headerLength = 0;
    c->completed = 0;
    c->fileBytesReceived = 0;
    c->totalSize = -1;
    c->redirectURL = NULL;
    c->redirectCount = 0;
    c->chunked = 0;
    c->processing = 0;
    c->throttle = 0;
    c->lastThrottleRecv = 0;
    c->post = NULL;
    c->maxRecvTime = 0x1f4;
    c->proxyPort = 0x50;
    c->proxyAddress = NULL;
    c->encryptor.unk_00 = 0;
    ok = ghiInitBuffer(c, &c->sendBuffer, 0x800, 0x1000);
    if (ok) {
        ok = ghiInitBuffer(c, &c->encodeBuffer, 0x800, 0x800);
    }
    if (ok) {
        ok = ghiInitBuffer(c, &c->recvBuffer, 0x800, 0x400);
    }
    if (!ok) {
        ghiFreeConnection(c);
        ghiUnlock();
        return NULL;
    }
    ghiConnectionList.count++;
    ghiUnlock();
    return c;
}

int ghiFreeConnection(GHIConnection *c) {
    HTTP_ASSERT(c, sStr_connection_5, sStr_GhttpConnectionC, sStr_ghiFreeConnection, 0xb3);
    HTTP_ASSERT(c->request >= 0, sStr_ConnectionRequestGe0, sStr_GhttpConnectionC, sStr_ghiFreeConnection, 0xb4);
    HTTP_ASSERT(c->request < ghiConnectionList.capacity, sStr_ConnectionRequestLtGhiConnectionsLen, sStr_GhttpConnectionC, sStr_ghiFreeConnection, 0xb5);
    HTTP_ASSERT(c->inUse, sStr_ConnectionInUse, sStr_GhttpConnectionC, sStr_ghiFreeConnection, 0xb6);
    if (!c) {
        return 0;
    }
    if (!c->inUse) {
        return 0;
    }
    if (c->request < 0) {
        return 0;
    }
    if (c->request >= ghiConnectionList.capacity) {
        return 0;
    }
    ghiLock();
    DWCi_GsFree(c->URL);
    DWCi_GsFree(c->serverAddress);
    DWCi_GsFree(c->requestPath);
    DWCi_GsFree(c->sendHeaders);
    DWCi_GsFree(c->redirectURL);
    DWCi_GsFree(c->proxyAddress);
    if (c->socket != INVALID_SOCKET) {
        gsSocketShutdown(c->socket, 2);
        gsSocketClose(c->socket);
    }
    ghiFreeBuffer(&c->sendBuffer);
    ghiFreeBuffer(&c->encodeBuffer);
    ghiFreeBuffer(&c->recvBuffer);
    ghiFreeBuffer(&c->getFileBuffer);
    if (c->states) {
        ghiPostCleanupState(c);
    }
    if (c->post) {
        if (ghiIsPostAutoFree(c->post)) {
            ghiFreePost(c->post);
            c->post = NULL;
        }
    }
    if (c->encryptor.initialized) {
        if (c->encryptor.cleanupFunc) {
            c->encryptor.cleanupFunc(c, &c->encryptor);
        }
        c->encryptor.initialized = 0;
    }
    c->inUse = 0;
    ghiConnectionList.count--;
    ghiUnlock();
    return 1;
}

GHIConnection *ghiRequestToConnection(int request) {
    GHIConnection *c;
    HTTP_ASSERT(request >= 0, sStr_RequestGe0, sStr_GhttpConnectionC, sStr_ghiRequestToConnection, 0x101);
    HTTP_ASSERT(request < ghiConnectionList.capacity, sStr_RequestLtGhiConnectionsLen, sStr_GhttpConnectionC, sStr_ghiRequestToConnection, 0x102);
    ghiLock();
    if (request < 0 || request >= ghiConnectionList.capacity) {
        ghiUnlock();
        return NULL;
    }
    c = ghiConnectionList.list[request];
    if (!c->inUse) {
        c = NULL;
    }
    ghiUnlock();
    return c;
}

void ghiEnumConnections(void (*func)(GHIConnection *)) {
    int i;
    if (ghiConnectionList.count <= 0) {
        return;
    }
    ghiLock();
    for (i = 0; i < ghiConnectionList.capacity; i++) {
        GHIConnection *c = ghiConnectionList.list[i];
        if (c->inUse) {
            func(c);
        }
    }
    ghiUnlock();
}

void ghiRedirectConnection(GHIConnection *c) {
    HTTP_ASSERT(c, sStr_connection_5, sStr_GhttpConnectionC, sStr_ghiRedirectConnection, 0x132);
    HTTP_ASSERT(c->redirectURL, sStr_ConnectionRedirectURL, sStr_GhttpConnectionC, sStr_ghiRedirectConnection, 0x133);
    c->state = GHI_STATE_HOST_LOOKUP;
    DWCi_GsFree(c->URL);
    c->URL = c->redirectURL;
    c->redirectURL = NULL;
    DWCi_GsFree(c->serverAddress);
    c->serverAddress = NULL;
    c->serverIP = 0;
    c->serverPort = 0;
    DWCi_GsFree(c->requestPath);
    c->requestPath = NULL;
    gsSocketShutdown(c->socket, 2);
    gsSocketClose(c->socket);
    c->socket = INVALID_SOCKET;
    ghiResetBuffer(&c->sendBuffer);
    ghiResetBuffer(&c->encodeBuffer);
    ghiResetBuffer(&c->recvBuffer);
    c->statusMajor = 0;
    c->statusMinor = 0;
    c->statusCode = 0;
    c->statusStringIndex = 0;
    c->headerIndex = 0;
    c->headerLength = 0;
    c->connectionClosed = 0;
    c->redirectCount++;
}

void ghiCleanupConnections(void) {
    int i;
    if (!ghiConnectionList.list) {
        return;
    }
    ghiEnumConnections((void (*)(GHIConnection *))ghiFreeConnection);
    for (i = 0; i < ghiConnectionList.capacity; i++) {
        DWCi_GsFree(ghiConnectionList.list[i]);
    }
    DWCi_GsFree(ghiConnectionList.list);
    ghiConnectionList.list = NULL;
    ghiConnectionList.capacity = 0;
    ghiConnectionList.count = 0;
}

void ghiHandleStatus(GHIConnection *c) {
    switch (c->statusCode / 100) {
    case 1:
    case 2:
    case 3:
        return;
    case 4:
        switch (c->statusCode) {
        case 401:
            c->result = GHTTPUnauthorized;
            return;
        case 403:
            c->result = GHTTPForbidden;
            return;
        case 404:
        case 410:
            c->result = GHTTPFileNotFound;
            return;
        default:
            c->result = GHTTPRequestRejected;
            return;
        }
    case 5:
        c->result = GHTTPServerError;
        return;
    }
}

int ghiProcessConnection(GHIConnection *c) {
    int completed;
    HTTP_ASSERT(c, sStr_connection_6, sStr_GhttpMainC, sStr_ghiProcessConnection, 0x5b);
    HTTP_ASSERT(ghiRequestToConnection(c->request) == c, sStr_GhiRequestToConnectionConnectionRequestEq, sStr_GhttpMainC, sStr_ghiProcessConnection, 0x5c);
    if (c->processing) {
        return 0;
    }
    c->processing = 1;
    if (c->state == GHI_STATE_HOST_LOOKUP) {
        ghiDoHostLookup(c);
    }
    if (c->state == GHI_STATE_CONNECTING) {
        ghiDoConnecting(c);
    }
    if (c->state == GHI_STATE_SECURING_SESSION) {
        ghiDoSecuringSession(c);
    }
    if (c->state == GHI_STATE_SENDING_REQUEST) {
        ghiDoSendingRequest(c);
    }
    if (c->state == GHI_STATE_POSTING) {
        ghiDoPosting(c);
    }
    if (c->state == GHI_STATE_WAITING) {
        ghiDoWaiting(c);
    }
    if (c->state == GHI_STATE_RECEIVING_STATUS) {
        ghiDoReceivingStatus(c);
    }
    if (c->state == GHI_STATE_RECEIVING_HEADERS) {
        ghiDoReceivingHeaders(c);
    }
    if (c->state == GHI_STATE_RECEIVING_FILE) {
        ghiDoReceivingFile(c);
    }
    if (c->redirectURL) {
        ghiRedirectConnection(c);
    }
    completed = c->completed;
    if (completed) {
        ghiHandleStatus(c);
        ghiCallCompletedCallback(c);
        ghiFreeConnection(c);
    } else {
        c->processing = 0;
    }
    return completed;
}

void ghttpStartup(void) {
    ghiLock();
    if (++ghiReferenceCount == 1) {
        ghiCreateLock();
        ghiThrottleBufferSize = 0x7d;
        ghiThrottleSettings.delay = 0xfa;
        return;
    }
    ghiUnlock();
}

void ghttpCleanup(void) {
    ghiLock();
    if (--ghiReferenceCount == 0) {
        ghiCleanupConnections();
        if (ghiProxyAddress) {
            DWCi_GsFree(ghiProxyAddress);
            ghiProxyAddress = NULL;
        }
        ghiUnlock();
        ghiFreeLock();
        return;
    }
    ghiUnlock();
}

int ghttpGetA(const char *url, int blocking, CompletedCallback completed, void *param) {
    return ghttpGetExA(url, NULL, NULL, 0, NULL, 0, blocking, NULL, completed, param);
}

int ghttpGetExA(const char *url, const char *headers, char *buffer, int bufferSize, GHIPost *post, int throttle, int blocking, ProgressCallback progress, CompletedCallback completed, void *param) {
    GHIConnection *c;
    int ok;
    HTTP_ASSERT(url && *url, sStr_URL_AndURL_0, sStr_GhttpMainC, sStr_ghttpGetExA, 0x128);
    HTTP_ASSERT(bufferSize >= 0, sStr_BufferSizeGe0_2, sStr_GhttpMainC, sStr_ghttpGetExA, 0x129);
    HTTP_ASSERT(!buffer || bufferSize, sStr_NotBufferOrBufferSize, sStr_GhttpMainC, sStr_ghttpGetExA, 0x12a);
    if (!url || !*url) {
        return -1;
    }
    if (bufferSize < 0) {
        return -1;
    }
    if (buffer && !bufferSize) {
        return -1;
    }
    if (!ghiReferenceCount) {
        ghttpStartup();
    }
    c = ghiNewConnection();
    if (!c) {
        return -1;
    }
    c->type = 0;
    c->URL = goastrdup(url);
    if (!c->URL) {
        ghiFreeConnection(c);
        return -1;
    }
    if (headers && *headers) {
        c->sendHeaders = goastrdup(headers);
        if (!c->sendHeaders) {
            ghiFreeConnection(c);
            return -1;
        }
    }
    c->post = post;
    c->blocking = blocking;
    c->progressCallback = progress;
    c->completedCallback = completed;
    c->callbackParam = param;
    c->throttle = throttle;
    c->userBufferSupplied = buffer != NULL;
    if (c->userBufferSupplied) {
        ok = ghiInitFixedBuffer(c, &c->getFileBuffer, buffer, bufferSize);
    } else {
        ok = ghiInitBuffer(c, &c->getFileBuffer, 0x800, 0x800);
    }
    if (!ok) {
        ghiFreeConnection(c);
        return -1;
    }
    if (post) {
        if (!ghiPostInitState(c)) {
            ghiFreeConnection(c);
            return -1;
        }
    }
    if (blocking) {
        while (!ghiProcessConnection(c)) {
            msleep(10);
        }
        return 0;
    }
    return c->request;
}

void ghttpThink(void) {
    ghiEnumConnections((void (*)(GHIConnection *))ghiProcessConnection);
}

int ghiIsPostAutoFree(GHIPost *post) {
    return post->autoFree;
}

void ghiFreePost(GHIPost *post) {
    ArrayFree(post->data);
    DWCi_GsFree(post);
}

char *ghiPostGetContentType(GHIConnection *c) {
    GHIPost *post = c->post;
    HTTP_ASSERT(post, sStr_post, sStr_GhttpPostC, sStr_ghiPostGetContentType, 0x192);
    if (!post) {
        return sStr_Empty_22;
    }
    if (post->hasFiles) {
        return sStr_MultipartFormDataBoundaryQr4G823s23d7d118e0536;
    }
    return sStr_ApplicationX_WwwFormUrlencoded;
}

int ghiPostGetNoFilesContentLength(GHIConnection *c) {
    GHIPost *post = c->post;
    GHIPostData *d;
    int i;
    int num;
    int total = 0;
    num = ArrayLength(post->data);
    if (!num) {
        return 0;
    }
    for (i = 0; i < num; i++) {
        d = ArrayNth(post->data, i);
        HTTP_ASSERT(d->type == 0, sStr_DataTypeEqGHIString, sStr_GhttpPostC, sStr_ghiPostGetNoFilesContentLength, 0x1b0);
        total += strlen(d->name);
        total += d->u.string.len;
        total += d->u.string.numEscaped * 2;
        total++;
    }
    total += num - 1;
    return total;
}

int ghiPostGetHasFilesContentLength(GHIConnection *c) {
    GHIPost *post = c->post;
    GHIPostData *d;
    int i;
    int num;
    int total = 0;
    GHIPostState *st;
    if (!ghiMultipartLengths.boundary) {
        ghiMultipartLengths.boundary = strlen(sStr_Qr4G823s23d7d118e0536);
        ghiMultipartLengths.stringField = ghiMultipartLengths.boundary + 0x2f;
        ghiMultipartLengths.fileField = ghiMultipartLengths.boundary + 0x4c;
        ghiMultipartLengths.footer = ghiMultipartLengths.boundary + 4;
    }
    num = ArrayLength(post->data);
    for (i = 0; i < num; i++) {
        d = ArrayNth(post->data, i);
        if (d->type == GHI_POST_DATA_STRING) {
            total += ghiMultipartLengths.stringField;
            total += strlen(d->name);
            total += d->u.string.len;
        } else if (d->type == GHI_POST_DATA_FILE_DISK) {
            total += ghiMultipartLengths.fileField;
            total += strlen(d->name);
            total += strlen(d->u.disk.fileName);
            total += strlen(d->u.disk.contentType);
            st = ArrayNth(c->states, i);
            HTTP_ASSERT(st, sStr_state, sStr_GhttpPostC, sStr_ghiPostGetHasFilesContentLength, 0x1ec);
            total += st->len;
        } else if (d->type == GHI_POST_DATA_FILE_MEMORY) {
            total += ghiMultipartLengths.fileField;
            total += strlen(d->name);
            total += strlen(d->u.memory.fileName);
            total += strlen(d->u.memory.contentType);
            total += d->u.memory.len;
        } else {
            HTTP_ASSERT(0, sStr_0_13, sStr_GhttpPostC, sStr_ghiPostGetHasFilesContentLength, 0x1f9);
            return 0;
        }
    }
    return total + ghiMultipartLengths.footer;
}

int ghiPostGetContentLength(GHIConnection *c) {
    GHIPost *post = c->post;
    HTTP_ASSERT(post, sStr_post, sStr_GhttpPostC, sStr_ghiPostGetContentLength, 0x20c);
    if (!post) {
        return 0;
    }
    if (post->hasFiles) {
        return ghiPostGetHasFilesContentLength(c);
    }
    return ghiPostGetNoFilesContentLength(c);
}

int ghiPostStateInit(GHIPostState *s) {
    int type = s->data->type;
    s->pos = -1;
    if (type == 0) {
    } else if (type == 1) {
        if (!s->file) {
            return 0;
        }
        if (fseek(s->file, 0, 2)) {
            return 0;
        }
        s->len = ftell(s->file);
        if (s->len == -1) {
            return 0;
        }
        rewind(s->file);
    } else if (type != 2) {
        HTTP_ASSERT(0, sStr_0_13, sStr_GhttpPostC, sStr_ghiPostStateInit, 0x244);
        return 0;
    }
    return 1;
}

void ghiPostStateCleanup(GHIPostState *s) {
    int type = s->data->type;
    if (type == 0) {
    } else if (type == 1) {
        if (s->file) {
            fclose(s->file);
        }
        s->file = NULL;
    } else if (type != 2) {
        HTTP_ASSERT(0, sStr_0_13, sStr_GhttpPostC, sStr_ghiPostStateCleanup, 0x269);
    }
}

int ghiPostInitState(GHIConnection *c) {
    int i;
    int num;
    GHIPostState state;
    GHIPostData *d;
    HTTP_ASSERT(c->post, sStr_ConnectionPost, sStr_GhttpPostC, sStr_ghiPostInitState, 0x278);
    if (!c->post) {
        return 0;
    }
    c->index = 0;
    c->bytesPosted = 0;
    c->totalBytes = 0;
    c->postCallback = c->post->callback;
    c->postParam = c->post->param;
    num = ArrayLength(c->post->data);
    c->states = ArrayNew(sizeof(GHIPostState), num, 0);
    if (!c->states) {
        return 0;
    }
    for (i = 0; i < num; i++) {
        d = ArrayNth(c->post->data, i);
        ClearPostState(&state);
        state.data = d;
        if (!ghiPostStateInit(&state)) {
            for (i--; i >= 0; i--) {
                ghiPostStateCleanup(ArrayNth(c->states, i));
            }
            ArrayFree(c->states);
            c->states = NULL;
            return 0;
        }
        ArrayAppend(c->states, &state);
    }
    HTTP_ASSERT(ArrayLength(c->post->data) == ArrayLength(c->states), sStr_ArrayLengthConnectionPostDataEqArrayLength, sStr_GhttpPostC, sStr_ghiPostInitState, 0x2b1);
    c->totalBytes = ghiPostGetContentLength(c);
    return 1;
}

void ghiPostCleanupState(GHIConnection *c) {
    int i;
    int num;
    if (c->states) {
        num = ArrayLength(c->states);
        for (i = 0; i < num; i++) {
            ghiPostStateCleanup(ArrayNth(c->states, i));
        }
        ArrayFree(c->states);
        c->states = NULL;
    }
    if (c->post && c->post->autoFree) {
        ghiFreePost(c->post);
        c->post = NULL;
    }
}

int ghiPostStringStateDoPosting(GHIPostState *state, GHIConnection *c) {
    HTTP_ASSERT(state->pos >= 0, sStr_StatePosGe0, sStr_GhttpPostC, sStr_ghiPostStringStateDoPosting, 743);
    if (state->data->u.string.len == 0) {
        return 1;
    }
    HTTP_ASSERT(state->pos < state->data->u.string.len, sStr_StatePosLtStateDataDataStringLen, sStr_GhttpPostC, sStr_ghiPostStringStateDoPosting, 750);
    if (!c->post->hasFiles && state->data->u.string.encode) {
        int i;
        int ch;
        char *input;
        GHIPercentEscape escape;
        input = state->data->u.string.data;
        escape = ghiPercentEscape;
        i = 0;
        ch = input[0];
        while (ch) {
            if (strchr(sStr_AbcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV, ch)) {
                ghiAppendCharToBuffer(&c->sendBuffer, ch);
            } else if (ch == ' ') {
                ghiAppendCharToBuffer(&c->sendBuffer, '+');
            } else {
                int high = ch / 16;
                HTTP_ASSERT(high < 16, sStr_C_16_Lt16, sStr_GhttpPostC, sStr_ghiPostStringStateDoPosting, 781);
                escape.chars[1] = sStr_0123456789ABCDEF[high];
                escape.chars[2] = sStr_0123456789ABCDEF[ch % 16];
                ghiAppendDataToBuffer(&c->sendBuffer, escape.chars, 3);
            }
            ch = input[++i];
        }
        return 1;
    } else {
        int left = state->data->u.string.len - state->pos;
        int sent = ghiDoSend(c, state->data->u.string.data, left);
        if (sent == -1) {
            return 0;
        }
        state->pos += sent;
        return sent == left ? 1 : 2;
    }
}

int ghiPostFileDiskStateDoPosting(GHIPostState *state, GHIConnection *c) {
    char buf[0x1000];
    int n;
    int r;
    HTTP_ASSERT(state->pos >= 0, sStr_StatePosGe0, sStr_GhttpPostC, sStr_ghiPostFileDiskStateDoPosting, 0x336);
    HTTP_ASSERT(state->pos < state->len, sStr_StatePosLtStateStateFileDiskLen, sStr_GhttpPostC, sStr_ghiPostFileDiskStateDoPosting, 0x337);
    HTTP_ASSERT(state->pos == ftell(state->file), sStr_StatePosEqIntFtellStateStateFileDiskFile, sStr_GhttpPostC, sStr_ghiPostFileDiskStateDoPosting, 0x338);
    do {
        n = fread(buf, 1, 0x1000, state->file);
        if (n <= 0) {
            c->completed = 1;
            c->result = 0xe;
            return 0;
        }
        state->pos += n;
        if (state->pos > state->len) {
            c->completed = 1;
            c->result = 0xe;
            return 0;
        }
        r = ghiTrySendThenBuffer(c, buf, n);
        if (!r) {
            return 0;
        }
        if (state->pos == state->len) {
            return 1;
        }
    } while (r == 1);
    return 2;
}

int ghiPostFileMemoryStateDoPosting(GHIPostState *state, GHIConnection *c) {
    HTTP_ASSERT(state->pos >= 0, sStr_StatePosGe0, sStr_GhttpPostC, sStr_ghiPostFileMemoryStateDoPosting, 0x36e);
    if (state->data->u.memory.len == 0) {
        return 1;
    }
    HTTP_ASSERT(state->pos < state->data->u.memory.len, sStr_StatePosLtStateDataDataFileMemoryLen, sStr_GhttpPostC, sStr_ghiPostFileMemoryStateDoPosting, 0x375);
    for (;;) {
        GHIPostData *data = state->data;
        int pos = state->pos;
        int len = data->u.memory.len - pos;
        int sent;
        if (len >= 0x8000) {
            len = 0x8000;
        }
        sent = ghiDoSend(c, data->u.memory.data + pos, len);
        if (sent == -1) {
            return 0;
        }
        state->pos += sent;
        if (state->data->u.memory.len == state->pos) {
            return 1;
        }
        if (sent == 0) {
            return 2;
        }
    }
}

int ghiPostStateDoPosting(GHIPostState *state, GHIConnection *c, int first) {
    char buffer[2048];
    int status;
    if (state->pos == -1) {
        state->pos = 0;
        if (c->post->hasFiles == 0) {
            HTTP_ASSERT(state->data->type == GHI_POST_DATA_STRING, sStr_StateDataTypeEqGHIString, sStr_GhttpPostC, sStr_ghiPostStateDoPosting, 937);
            if (first) {
                sprintf(buffer, sFmt_StrEq_2, state->data->name);
            } else {
                sprintf(buffer, sFmt_AmpStrEq_2, state->data->name);
            }
        } else if (state->data->type == GHI_POST_DATA_STRING) {
            sprintf(buffer, sFmt_ContentDispositionFormDataName, first ? sStr_Qr4G823s23d7d118e0536_2 : sStr_Qr4G823s23d7d118e0536_3, state->data->name);
        } else if (state->data->type == GHI_POST_DATA_FILE_DISK || state->data->type == GHI_POST_DATA_FILE_MEMORY) {
            char *fileName;
            char *contentType;
            if (state->data->type == GHI_POST_DATA_FILE_DISK) {
                fileName = state->data->u.disk.fileName;
                contentType = state->data->u.disk.contentType;
            } else {
                fileName = state->data->u.memory.fileName;
                contentType = state->data->u.memory.contentType;
            }
            sprintf(buffer, sFmt_ContentDispositionFormDataNameFilenameContent, first ? sStr_Qr4G823s23d7d118e0536_2 : sStr_Qr4G823s23d7d118e0536_3, state->data->name, fileName, contentType);
        } else {
            __msl_assertion_failed(sStr_0_13, sStr_GhttpPostC, sStr_ghiPostStateDoPosting, 988);
        }
        status = ghiTrySendThenBuffer(c, buffer, strlen(buffer));
        if (status == 0) {
            return 0;
        }
        if (status == 2) {
            return 2;
        }
    }
    if (state->data->type == GHI_POST_DATA_STRING) {
        return ghiPostStringStateDoPosting(state, c);
    }
    if (state->data->type == GHI_POST_DATA_FILE_DISK) {
        return ghiPostFileDiskStateDoPosting(state, c);
    }
    HTTP_ASSERT(state->data->type == GHI_POST_DATA_FILE_MEMORY, sStr_StateDataTypeEqGHIFileMemory, sStr_GhttpPostC, sStr_ghiPostStateDoPosting, 1013);
    return ghiPostFileMemoryStateDoPosting(state, c);
}

int ghiPostDoPosting(GHIConnection *c) {
    int count;
    int status;
    HTTP_ASSERT(c, sStr_connection_7, sStr_GhttpPostC, sStr_ghiPostDoPosting, 1028);
    HTTP_ASSERT(c->post, sStr_ConnectionPost, sStr_GhttpPostC, sStr_ghiPostDoPosting, 1029);
    HTTP_ASSERT(c->states, sStr_ConnectionPostingStateStates, sStr_GhttpPostC, sStr_ghiPostDoPosting, 1030);
    count = ArrayLength(c->post->data);
    HTTP_ASSERT(count == ArrayLength(c->states), sStr_ArrayLengthConnectionPostDataEqArrayLength, sStr_GhttpPostC, sStr_ghiPostDoPosting, 1031);
    HTTP_ASSERT(c->index >= 0, sStr_ConnectionPostingStateIndexGe0, sStr_GhttpPostC, sStr_ghiPostDoPosting, 1032);
    HTTP_ASSERT(c->index <= ArrayLength(c->states), sStr_ConnectionPostingStateIndexLeArrayLength, sStr_GhttpPostC, sStr_ghiPostDoPosting, 1033);
    count = ArrayLength(c->states);
    if (c->sendBuffer.len) {
        if (!ghiSendBufferedData(c)) {
            return 0;
        }
        if (c->sendBuffer.pos < c->sendBuffer.len) {
            return 2;
        }
        ghiResetBuffer(&c->sendBuffer);
        if (c->index == count) {
            return 1;
        }
    }
    for (; c->index < count; c->index++) {
        GHIPostState *state = ArrayNth(c->states, c->index);
        HTTP_ASSERT(state, sStr_postState, sStr_GhttpPostC, sStr_ghiPostDoPosting, 1071);
        status = ghiPostStateDoPosting(state, c, c->index == 0);
        if (status == 0) {
            HTTP_ASSERT(c->completed && c->result, sStr_ConnectionCompletedAndConnectionResult, sStr_GhttpPostC, sStr_ghiPostDoPosting, 1083);
            return 0;
        }
        if (status == 2) {
            return 2;
        }
    }
    if (c->post->hasFiles) {
        int length = strlen(sStr_Qr4G823s23d7d118e0536_4);
        if (!ghiTrySendThenBuffer(c, sStr_Qr4G823s23d7d118e0536_4, length)) {
            return 0;
        }
    }
    return c->sendBuffer.len ? 2 : 1;
}
