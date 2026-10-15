#pragma force_active on
#include "global.h"

#include "dwc/http_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

typedef struct HostEnt {
    char *h_name;
    char **h_aliases;
    s16 h_addrtype;
    s16 h_length;
    u8 **h_addr_list;
} HostEnt;

typedef struct SocketAddress {
    u8 len;
    u8 family;
    u16 port; // network byte order
    u32 ip;
} SocketAddress;

// "2147483647": longest accepted Content-Length
typedef struct GHIMaxLengthString {
    char chars[11];
} GHIMaxLengthString;

HostEnt *SOC_GetHostByName(const char *name);
int gsSocketConnect(int socket, const SocketAddress *address, int len);

extern char *ghiProxyAddress; // proxy server address
extern u16 ghiProxyPort;       // proxy server port
extern int ghiThrottleBufferSize;   // socket receive buffer size while throttled
extern const GHIMaxLengthString ghiMaxContentLengthString;
extern char sStr_ghiParseURL[];
extern char sStr_ghiDoPosting[];
extern char sStr_ghiParseStatus[];
extern char sStr_ghiParseChunkSize[];
extern char sStr_ghiDoSecuringSession[];
extern char sStr_ghiProcessIncomingFileData[];
extern char sStr_ghiAppendToChunkHeaderBuffer[];
extern char sStr_connection_8[];
extern char sStr_GhttpProcessC[];
extern char sStr_ConnectionURL[];
extern char sStr_Http_2[];
extern char sStr_Https_2[];
extern char sStr_ColonSlash[];
extern char sStr_Slash_2[];
extern char sStr_0_14[];
extern char sStr_POST[];
extern char sStr_HEAD[];
extern char sStr_GET[];
extern char sStr_HTTP_1_1[];
extern char sStr_Host[];
extern char sStr_Host_2[];
extern char sStr_CrLf_3[];
extern char sStr_UserAgent_2[];
extern char sStr_GameSpyHTTP_1_0[];
extern char sStr_Connection_2[];
extern char sStr_KeepAlive[];
extern char sStr_close_2[];
extern char sFmt_Int_9[];
extern char sStr_ContentLength_3[];
extern char sStr_ContentType[];
extern char sStr_ConnectionCompletedAndConnectionResult_2[];
extern char sStr_ConnectionRecvBufferLenGt0[];
extern char sFmt_HTTP[];
extern char sStr_len_2[];
extern char sFmt_Hex_4[];
extern char sStr_data_3[];
extern char sStr_LenGe0_3[];
extern char sStr_LenGt0_3[];
extern char sStr_CrLfCrLf_2[];
extern char sStr_LfLf[];
extern char sStr_Location[];
extern char sFmt_Http[];
extern char sStr_ContentLength_4[];
extern char sStr_TransferEncodingChunked[];

static inline int IsStatusSpace(int ch) {
    int invalid = 1;
    if (ch >= 0 && ch < 128) {
        invalid = 0;
    }
    return invalid ? 0 : __msl_digit[ch] & 0x100;
}

static inline int IsHeaderSpace(int ch) {
    return (ch < 0 || ch >= 128) ? 0 : __msl_digit[ch] & 0x100;
}

int ghiParseURL(GHIConnection *c) {
    char *p;
    char saved;
    size_t n;
    int secure;
    char *path;
    char *space;
    HTTP_ASSERT(c, sStr_connection_8, sStr_GhttpProcessC, sStr_ghiParseURL, 37);
    if (!c) {
        return 0;
    }
    HTTP_ASSERT(c->URL, sStr_ConnectionURL, sStr_GhttpProcessC, sStr_ghiParseURL, 43);
    p = c->URL;
    if (!p) {
        return 0;
    }
    if (strncmp(p, sStr_Http_2, 7) == 0) {
        p += 7;
        secure = 0;
    } else if (strncmp(p, sStr_Https_2, 8) == 0) {
        p += 8;
        secure = 1;
    } else {
        return 0;
    }
    n = strspn(p, sStr_ColonSlash);
    saved = p[n];
    p[n] = '\0';
    c->serverAddress = goastrdup(p);
    if (!c->serverAddress) {
        return 0;
    }
    p[n] = saved;
    p += n;
    if (*p == ':') {
        p++;
        c->serverPort = atol(p);
        if (c->serverPort == 0) {
            return 0;
        }
        while (*++p && *p != '/') {
        }
    } else {
        if (secure) {
            c->serverPort = 443;
        } else {
            c->serverPort = 80;
        }
    }
    if (!*p) {
        p = sStr_Slash_2;
    }
    path = c->requestPath = goastrdup(p);
    space = strchr(path, ' ');
    while (space) {
        *space = '+';
        path = c->requestPath;
        space = strchr(path, ' ');
    }
    if (!path) {
        return 0;
    }
    return 1;
}

void ghiDoHostLookup(GHIConnection *c) {
    char *server;
    ghiCallProgressCallback(c, NULL, 0);
    SocketStartUp();
    if (!ghiParseURL(c)) {
        c->completed = 1;
        c->result = GHTTPParseURLFailed;
        return;
    }
    if (c->proxyAddress != NULL) {
        server = c->proxyAddress;
    } else if (ghiProxyAddress != NULL) {
        server = ghiProxyAddress;
    } else {
        server = c->serverAddress;
    }
    c->serverIP = gsSocketInetAddr(server);
    if (c->serverIP == -1) {
        HostEnt *he = SOC_GetHostByName(server);
        if (he == NULL) {
            c->completed = 1;
            c->result = GHTTPHostLookupFailed;
            return;
        }
        c->serverIP = *(int *)he->h_addr_list[0];
    }
    c->state = GHI_STATE_CONNECTING;
    ghiCallProgressCallback(c, NULL, 0);
}

#pragma push
#pragma opt_propagation off

void ghiDoConnecting(GHIConnection *c) {
    SocketAddress address;
    int writable;
    int except;
    BOOL result;
    if (c->socket == INVALID_SOCKET) {
        c->socket = gsSocketCreate(AF_INET, SOCK_STREAM, 0);
        if (c->socket == INVALID_SOCKET) {
            c->completed = 1;
            c->result = GHTTPSocketFailed;
            c->socketError = gsSocketGetLastError(c->socket);
            return;
        }
        if (!SetSockBlocking(c->socket, 0)) {
            c->completed = 1;
            c->result = GHTTPSocketFailed;
            c->socketError = gsSocketGetLastError(c->socket);
            return;
        }
        if (c->throttle) {
            SetReceiveBufferSize(c->socket, ghiThrottleBufferSize);
        }
        {
            SocketAddress *a = &address;
            *(u32 *)a = 0;
            *(u32 *)((u8 *)a + 4) = 0;
        }
        address.family = AF_INET;
        if (c->proxyAddress) {
            int port = c->proxyPort;
            address.port = ((port >> 8) & 0xff) | ((port << 8) & 0xff00);
        } else if (ghiProxyAddress) {
            int port = ghiProxyPort;
            address.port = ((port >> 8) & 0xff) | ((port << 8) & 0xff00);
        } else {
            int port = c->serverPort;
            address.port = ((port >> 8) & 0xff) | ((port << 8) & 0xff00);
        }
        address.ip = c->serverIP;
        if (gsSocketConnect(c->socket, &address, 8) == SOCKET_ERROR) {
            int error = gsSocketGetLastError(c->socket);
            if (error != -6 && error != -26 && error != -76) {
                c->completed = 1;
                c->result = GHTTPConnectFailed;
                c->socketError = error;
                return;
            }
        }
    }
    result = GSISocketSelect(c->socket, NULL, &writable, &except) > 0;
    if (result == -1 || except) {
        c->completed = 1;
        c->result = GHTTPConnectFailed;
        if (result == 0) {
            c->socketError = gsSocketGetLastError(c->socket);
        }
        return;
    }
    if (writable) {
        c->state = GHI_STATE_SECURING_SESSION;
        ghiCallProgressCallback(c, NULL, 0);
    }
}

#pragma pop

void ghiDoSecuringSession(GHIConnection *c) {
    char buf[1024];
    int len;
    if (!c->encryptor.engine) {
        // https without an encryption engine
        if (!strncmp(c->URL, sStr_Https_2, 8)) {
            c->completed = 1;
            c->result = GHTTPEncryptionError;
            return;
        }
        c->state = GHI_STATE_SENDING_REQUEST;
        ghiCallProgressCallback(c, NULL, 0);
        return;
    }
    if (c->encryptor.sessionReady) {
        c->state = GHI_STATE_SENDING_REQUEST;
        ghiCallProgressCallback(c, NULL, 0);
        return;
    }
    if (!c->encryptor.initialized) {
        if (c->encryptor.initFunc(c, &c->encryptor) == 3) {
            __msl_assertion_failed(sStr_0_14, sStr_GhttpProcessC, sStr_ghiDoSecuringSession, 0x146);
            return;
        }
    }
    if (c->sendBuffer.pos < c->sendBuffer.len) {
        if (!ghiSendBufferedData(c)) {
            return;
        }
        if (c->sendBuffer.pos < c->sendBuffer.len) {
            return;
        }
        ghiResetBuffer(&c->sendBuffer);
    }
    len = 1024;
    ghiDoReceive(c, buf, &len);
}

void ghiDoSendingRequest(GHIConnection *c) {
    GHIBuffer *buffer;
    char text[16];
    if (c->sendBuffer.len == 0) {
        buffer = &c->sendBuffer;
        ghiAppendDataToBuffer(buffer, c->post ? sStr_POST : c->type == 3 ? sStr_HEAD
                                                                             : sStr_GET,
            0);
        if (c->proxyAddress || ghiProxyAddress) {
            // through a proxy the request line carries the absolute URL
            ghiAppendDataToBuffer(buffer, c->URL, 0);
        } else {
            ghiAppendDataToBuffer(buffer, c->requestPath, 0);
        }
        ghiAppendDataToBuffer(buffer, sStr_HTTP_1_1, 0);
        if (c->serverPort == 80) {
            ghiAppendHeaderToBuffer(buffer, sStr_Host, c->serverAddress);
        } else {
            ghiAppendDataToBuffer(buffer, sStr_Host_2, 0);
            ghiAppendDataToBuffer(buffer, c->serverAddress, 0);
            ghiAppendCharToBuffer(buffer, ':');
            ghiAppendIntToBuffer(buffer, c->serverPort);
            ghiAppendDataToBuffer(buffer, sStr_CrLf_3, 2);
        }
        if (c->sendHeaders == NULL || strstr(c->sendHeaders, sStr_UserAgent_2) == NULL) {
            ghiAppendHeaderToBuffer(buffer, sStr_UserAgent_2, sStr_GameSpyHTTP_1_0);
        }
        if (c->keepAlive) {
            ghiAppendHeaderToBuffer(buffer, sStr_Connection_2, sStr_KeepAlive);
        } else {
            ghiAppendHeaderToBuffer(buffer, sStr_Connection_2, sStr_close_2);
        }
        if (c->post) {
            sprintf(text, sFmt_Int_9, c->totalBytes);
            ghiAppendHeaderToBuffer(buffer, sStr_ContentLength_3, text);
            ghiAppendHeaderToBuffer(buffer, sStr_ContentType, ghiPostGetContentType(c));
        }
        if (c->sendHeaders) {
            ghiAppendDataToBuffer(buffer, c->sendHeaders, 0);
        }
        ghiAppendDataToBuffer(buffer, sStr_CrLf_3, 2);
        if (buffer != &c->sendBuffer) {
            ghiAppendDataToBuffer(&c->sendBuffer, buffer->data, buffer->len);
        }
    }
    if (!ghiSendBufferedData(c)) {
        return;
    }
    if (c->sendBuffer.pos < c->sendBuffer.len) {
        return;
    }
    ghiResetBuffer(&c->sendBuffer);
    if (c->post) {
        c->state = GHI_STATE_POSTING;
    } else {
        c->state = GHI_STATE_WAITING;
    }
    ghiCallProgressCallback(c, NULL, 0);
}

void ghiDoPosting(GHIConnection *c) {
    int result;
    int bytesPosted = c->bytesPosted;
    result = ghiPostDoPosting(c);
    if (result == 0) {
        HTTP_ASSERT(c->completed && c->result, sStr_ConnectionCompletedAndConnectionResult_2, sStr_GhttpProcessC, sStr_ghiDoPosting, 0x200);
        ghiPostCleanupState(c);
        return;
    }
    if (bytesPosted != c->bytesPosted) {
        ghiCallPostCallback(c);
    }
    if (result != 1) {
        return;
    }
    ghiPostCleanupState(c);
    c->state = GHI_STATE_WAITING;
    ghiCallProgressCallback(c, NULL, 0);
}

void ghiDoWaiting(GHIConnection *c) {
    int readable;
    if (GSISocketSelect(c->socket, &readable, NULL, NULL) == -1) {
        c->completed = 1;
        c->result = GHTTPSocketFailed;
        c->socketError = gsSocketGetLastError(c->socket);
        return;
    }
    if (readable == 0) {
        return;
    }
    c->state = GHI_STATE_RECEIVING_STATUS;
    ghiCallProgressCallback(c, NULL, 0);
}

int ghiParseStatus(GHIConnection *c) {
    int major;
    int minor;
    int status;
    int end;
    int count;
    int i;
    HTTP_ASSERT(c, sStr_connection_8, sStr_GhttpProcessC, sStr_ghiParseStatus, 590);
    HTTP_ASSERT(c->encodeBuffer.len > 0, sStr_ConnectionRecvBufferLenGt0, sStr_GhttpProcessC, sStr_ghiParseStatus, 591);
    count = sscanf(c->encodeBuffer.data, sFmt_HTTP, &major, &minor, &status, &end);
    i = end;
    while (c->encodeBuffer.data[i] && IsStatusSpace((signed char)c->encodeBuffer.data[i])) {
        i++;
        end = i;
    }
    if (count != 3 || major < 1 || status < 100 || status >= 600) {
        c->completed = 1;
        c->result = GHTTPBadResponse;
        return 0;
    }
    c->statusMajor = major;
    c->statusMinor = minor;
    c->statusCode = status;
    c->statusStringIndex = end;
    return 1;
}

void ghiDoReceivingStatus(GHIConnection *c) {
    char buf[1024];
    char *end;
    int len = 1024;
    int result = ghiDoReceive(c, buf, &len);
    if (result == 3) {
        return;
    }
    if (result == 1 && c->encodeBuffer.pos == c->encodeBuffer.len) {
        return;
    }
    if (result == 0) {
        if (!ghiAppendDataToBuffer(&c->encodeBuffer, buf, len)) {
            return;
        }
    }
    end = strstr(c->encodeBuffer.data, sStr_CrLf_3);
    if (end) {
        *end = '\0';
        result = end - c->encodeBuffer.data;
        c->headerLength = result + 1;
        if (!ghiParseStatus(c)) {
            return;
        }
        c->encodeBuffer.pos = result + 2;
        c->state = GHI_STATE_RECEIVING_HEADERS;
        ghiCallProgressCallback(c, NULL, 0);
        return;
    }
    if (result != 2) {
        return;
    }
    c->completed = 1;
    c->result = GHTTPBadResponse;
    c->socketError = gsSocketGetLastError(c->socket);
}

int ghiFileDataReceived(GHIConnection *c, const char *data, int len) {
    const char *outData = NULL;
    int outLen = 0;
    c->fileBytesReceived += len;
    if (c->fileBytesReceived == c->totalSize || c->connectionClosed) {
        c->completed = 1;
    }
    if (c->type == 0) {
        if (!ghiAppendDataToBuffer(&c->getFileBuffer, data, len)) {
            return 0;
        }
        outData = c->getFileBuffer.data;
        outLen = c->getFileBuffer.len;
    } else if (c->type == 1) {
        if (len != 0) {
            c->completed = 1;
            c->result = GHTTPFileWriteFailed;
            return 0;
        }
        outData = data;
        outLen = len;
    } else if (c->type == 2) {
        outData = data;
        outLen = len;
    }
    ghiCallProgressCallback(c, outData, outLen);
    return 1;
}

int ghiParseChunkSize(GHIConnection *c) {
    int size;
    HTTP_ASSERT(c->chunkHeaderLen, sStr_len_2, sStr_GhttpProcessC, sStr_ghiParseChunkSize, 0x321);
    if (sscanf(c->chunkHeader, sFmt_Hex_4, &size) != 1) {
        return -1;
    }
    return size;
}

void ghiAppendToChunkHeaderBuffer(GHIConnection *c, const char *data, int len) {
    int n;
    HTTP_ASSERT(c, sStr_connection_8, sStr_GhttpProcessC, sStr_ghiAppendToChunkHeaderBuffer, 0x333);
    HTTP_ASSERT(data, sStr_data_3, sStr_GhttpProcessC, sStr_ghiAppendToChunkHeaderBuffer, 0x334);
    HTTP_ASSERT(len >= 0, sStr_LenGe0_3, sStr_GhttpProcessC, sStr_ghiAppendToChunkHeaderBuffer, 0x335);
    if (!len) {
        return;
    }
    if (c->chunkHeaderLen >= 10) {
        return;
    }
    n = 10 - c->chunkHeaderLen;
    if (n >= len) {
        n = len;
    }
    memcpy(c->chunkHeader + c->chunkHeaderLen, data, n);
    c->chunkHeaderLen += n;
    c->chunkHeader[c->chunkHeaderLen] = '\0';
}

int ghiProcessIncomingFileData(GHIConnection *c, char *data, int len) {
    char *lineEnd;
    int amount;
    HTTP_ASSERT(c, sStr_connection_8, sStr_GhttpProcessC, sStr_ghiProcessIncomingFileData, 0x35d);
    HTTP_ASSERT(data, sStr_data_3, sStr_GhttpProcessC, sStr_ghiProcessIncomingFileData, 0x35e);
    HTTP_ASSERT(len > 0, sStr_LenGt0_3, sStr_GhttpProcessC, sStr_ghiProcessIncomingFileData, 0x35f);
    if (c->chunked) {
        while (len > 0) {
            if (c->chunkReadingState == GHI_CHUNK_HEADER) {
                lineEnd = strchr(data, '\n');
                if (lineEnd) {
                    ghiAppendToChunkHeaderBuffer(c, data, lineEnd - data);
                    amount = lineEnd + 1 - data;
                    len -= amount;
                    data = lineEnd + 1;
                    c->chunkBytesLeft = ghiParseChunkSize(c);
                    if (c->chunkBytesLeft == -1) {
                        c->completed = 1;
                        c->result = GHTTPBadResponse;
                        return 0;
                    }
                    if (c->chunkBytesLeft == 0) {
                        c->chunkReadingState = GHI_CHUNK_DONE;
                    } else {
                        c->chunkReadingState = GHI_CHUNK_DATA;
                    }
                } else {
                    ghiAppendToChunkHeaderBuffer(c, data, len);
                    return 1;
                }
            } else if (c->chunkReadingState == GHI_CHUNK_DATA) {
                amount = c->chunkBytesLeft;
                if (amount >= len) {
                    amount = len;
                }
                if (!ghiFileDataReceived(c, data, amount)) {
                    return 0;
                }
                c->chunkBytesLeft -= amount;
                data += amount;
                len -= amount;
                if (c->chunkBytesLeft == 0) {
                    c->chunkReadingState = GHI_CHUNK_END;
                }
            } else if (c->chunkReadingState == GHI_CHUNK_END) {
                lineEnd = strchr(data, '\n');
                if (!lineEnd) {
                    return 1;
                }
                c->chunkHeader[0] = '\0';
                c->chunkHeaderLen = 0;
                c->chunkBytesLeft = 0;
                c->chunkReadingState = GHI_CHUNK_HEADER;
                amount = lineEnd + 1 - data;
                data = lineEnd + 1;
                len -= amount;
            } else if (c->chunkReadingState == GHI_CHUNK_DONE) {
                c->completed = 1;
                return 1;
            } else {
                __msl_assertion_failed(sStr_0_14, sStr_GhttpProcessC, sStr_ghiProcessIncomingFileData, 0x3e3);
                return 0;
            }
        }
        return 1;
    }
    return ghiFileDataReceived(c, data, len);
}

void ghiDoReceivingHeaders(GHIConnection *c) {
    char *receive;
    int size;
    int status;
    char *base;
    int position;
    char *p;
    char *body;
    int remaining;
    int group;
    char *lengthHeader;
    GHIMaxLengthString maximum;
    char *value;
    char *end;
    int n;
    receive = DWCi_GsMalloc(4096);
    if (!receive) {
        c->completed = 1;
        c->result = GHTTPOutOfMemory;
        return;
    }
    size = 4096;
    status = ghiDoReceive(c, receive, &size);
    if (status == 3 || (status == 1 && c->encodeBuffer.pos == c->encodeBuffer.len)) {
        goto finish;
    }
    if (status == 0 && !ghiAppendDataToBuffer(&c->encodeBuffer, receive, size)) {
        goto finish;
    }
    position = c->encodeBuffer.pos;
    base = c->encodeBuffer.data;
    c->headerIndex = position;
    p = strstr(base + position, sStr_CrLfCrLf_2);
    if (!p) {
        p = strstr(base + position, sStr_LfLf);
    }
    if (p) {
        int oldLength;
        char *headerBase;
        char *headerEnd = p + 2;
        headerEnd[0] = '\0';
        headerBase = c->encodeBuffer.data;
        oldLength = c->encodeBuffer.len;
        c->encodeBuffer.len = headerEnd - headerBase;
        body = p + 4;
        remaining = oldLength - (body - headerBase);
        c->headerLength = headerEnd - c->encodeBuffer.data;
        c->encodeBuffer.pos = c->headerLength;
        group = c->statusCode / 100;
        if (group == 1) {
            if (remaining) {
                memmove(c->encodeBuffer.data, body, remaining + 1);
                c->encodeBuffer.len = remaining;
                c->encodeBuffer.pos = 0;
            } else {
                ghiResetBuffer(&c->encodeBuffer);
            }
            c->state = GHI_STATE_RECEIVING_STATUS;
            ghiCallProgressCallback(c, NULL, 0);
            goto finish;
        }
        if (group == 3) {
            if (c->redirectCount > 10) {
                c->completed = 1;
                c->result = GHTTPFileNotFound;
                goto finish;
            }
            p = strstr(base + position, sStr_Location);
            if (p) {
                value = p + 9;
                while (IsHeaderSpace(*value)) {
                    ++value;
                }
                end = value;
                while (*end && !IsHeaderSpace(*end)) {
                    ++end;
                }
                *end = '\0';
                if (*value == '/') {
                    n = strlen(c->serverAddress);
                    n = (n + 14) + strlen(value);
                    c->redirectURL = DWCi_GsMalloc(n);
                    if (!c->redirectURL) {
                        c->completed = 1;
                        c->result = GHTTPOutOfMemory;
                    }
                    sprintf(c->redirectURL, sFmt_Http, c->serverAddress, c->serverPort, value);
                } else {
                    c->redirectURL = goastrdup(value);
                    if (!c->redirectURL) {
                        c->completed = 1;
                        c->result = GHTTPOutOfMemory;
                    }
                }
                goto finish;
            }
        }
        lengthHeader = strstr(base + position, sStr_ContentLength_4);
        if (lengthHeader) {
            maximum = ghiMaxContentLengthString;
            value = lengthHeader + 16;
            end = value;
            n = strlen(maximum.chars);
            while (end && *end && *end != '\n' && *end != '\r' && *end != ' ') {
                ++end;
            }
            {
                int tokenLength = end - value;
                if (tokenLength > n) {
                    c->completed = 1;
                    c->result = GHTTPFileToBig;
                    goto finish;
                }
                if (n == tokenLength && strncmp(value, maximum.chars, tokenLength) >= 0) {
                    c->completed = 1;
                    c->result = GHTTPFileToBig;
                    goto finish;
                }
            }
            c->totalSize = atol(value);
        }
        c->chunked = strstr(base + position, sStr_TransferEncodingChunked) != 0;
        if (c->chunked) {
            c->chunkHeader[0] = '\0';
            c->chunkHeaderLen = 0;
            c->chunkBytesLeft = 0;
            c->chunkReadingState = GHI_CHUNK_HEADER;
        }
        if (c->type == 3 || c->type == 4) {
            c->completed = 1;
            goto finish;
        }
        c->state = GHI_STATE_RECEIVING_FILE;
        if (lengthHeader && c->totalSize == 0) {
            c->completed = 1;
            goto finish;
        }
        if (remaining > 0) {
            ghiProcessIncomingFileData(c, body, remaining);
        }
    } else if (status == 2) {
        c->completed = 1;
        c->result = GHTTPBadResponse;
        c->socketError = gsSocketGetLastError(c->socket);
    }
finish:
    DWCi_GsFree(receive);
}

void ghiDoReceivingFile(GHIConnection *c) {
    void *buffer;
    u32 start = current_time();
    u32 elapsed = 0;
    int length;
    int result;
    buffer = DWCi_GsMalloc(8192);
    if (!buffer) {
        c->completed = 1;
        c->result = GHTTPOutOfMemory;
        return;
    }
    while (!c->completed && elapsed < c->maxRecvTime) {
        length = 8192;
        result = ghiDoReceive(c, buffer, &length);
        if (result == 3 || result == 1) {
            break;
        }
        if (result == 2) {
            c->completed = 1;
            if (c->totalSize > 0 && c->fileBytesReceived < c->totalSize) {
                c->result = GHTTPFileIncomplete;
            }
            break;
        }
        if (!ghiProcessIncomingFileData(c, buffer, length)) {
            break;
        }
        elapsed = current_time() - start;
    }
    DWCi_GsFree(buffer);
}
