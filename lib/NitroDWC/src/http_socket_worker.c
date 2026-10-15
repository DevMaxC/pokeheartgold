#include "global.h"

#include "dwc/http_socket_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

#pragma force_active on

typedef struct HttpSocketPoll {
    int fd;
    short events;
    short revents;
} HttpSocketPoll;

typedef struct HttpDecimalDivisors {
    u32 v[9];
} HttpDecimalDivisors;

extern int SOC_Poll(HttpSocketPoll *fds, int count, int timeout, int unused);

extern int gNhttpDeferredCloseIndices[2];
extern char gNhttpLineBuffer[];                    // 1024-byte send/line buffer
extern char ov38_02226C61[];                    // gNhttpLineBuffer + 9: status code of the response line
extern const HttpDecimalDivisors gNhttpDecimalDivisors; // 1000000000, 100000000, ..., 10

extern const char gNhttpFormDataHeader[]; // "Content-Disposition: form-data; name=\""
extern const char gNhttpOctetStreamHeader[]; // "Content-Type: application/octet-stream..." of a file part
extern const char sStr_GET_2[]; // "GET "
extern const char sStr_POST_2[]; // "POST "
extern const char sStr_HEAD_2[]; // "HEAD "
extern const char sStr_Slash_3[]; // "/"
extern const char sStr_HTTP_1_1_2[]; // " HTTP/1.1\r\n"
extern const char sStr_Host_3[]; // "Host: "
extern const char sStr_CrLf_4[]; // "\r\n"
extern const char sStr_ColonSpace_3[]; // ": "
extern const char sStr_ContentTypeMultipartFormDataBoundary[]; // "Content-Type: multipart/form-data; boundary="
extern const char sStr_ContentTypeApplicationX_WwwFormUrlencoded[]; // "Content-Type: application/x-www-form-urlencoded\r\n"
extern const char sStr_ContentLength_6[]; // "Content-Length: "
extern const char sStr_QuoteCrLf[]; // "\"\r\n"
extern const char sStr_DashDashCrLf[]; // "--\r\n"
extern const char sStr_Eq_2[]; // "="
extern const char sStr_Amp_2[]; // "&"
extern const char sStr_HTTP[]; // "HTTP/"
extern const char sStr_ContentLength_7[]; // "Content-Length"
extern const char sStr_Connection_3[]; // "Connection"
extern const char sStr_KeepAlive_2[]; // "Keep-Alive"
extern const char sStr_TransferEncoding[]; // "Transfer-Encoding"
extern const char sStr_chunked[]; // "chunked"

static inline BOOL IsUpper(int c) {
    BOOL ret = FALSE;
    if (c >= 'A' && c <= 'Z') {
        ret = TRUE;
    }
    return ret;
}

static inline int ToLower(char c) {
    return IsUpper(c) ? c + 0x20 : c;
}

static inline int ToLowerAt(const char *p) {
    int upper = 0;
    if (*p >= 'A' && *p <= 'Z') {
        upper = 1;
    }
    return upper ? *p + 0x20 : *p;
}

// Sends n bytes through the gNhttpLineBuffer buffer; a socket error completes the job, a closed
// connection retries it on a new one.
#define SEND(p, n)                                           \
    do {                                                     \
        int sent = NHTTPi_BufferedSend(req, socket, &count, p, n); \
        if (sent < 0)                                        \
            goto complete;                                   \
        if (sent == 0)                                       \
            goto retry;                                      \
    } while (0)

void NHTTPi_ThreadMain(void *arg) {
    int socket = -1;
    int urlLength;
    int length;
    char temp[12];
    HttpSslConnection *ssl;
    int count, parsed, status;
    HttpSocketPoll poll;
    char version[3];
    int invalid;
    int host;
    int lastHost;
    int lastPort;
    int multipart;
    int lastSecure;
    int connected;
    int error;
    int n;
    int offset;
    int remaining;

    ssl = NULL;
    gNhttpDeferredCloseIndices[0] = 0;
    gNhttpDeferredCloseIndices[1] = 0;
    multipart = 0;
    lastHost = socket;
    lastPort = socket;
    connected = 0;
    lastSecure = 0;
    HttpField *entry;
    HttpRequest *req;
    HttpResponse *response;
    while (!ov38_02226224) {
        int jobId;

        NHTTPi_Lock();
        {
            HttpJob *job = NHTTPi_PopJob();
            if (!job) {
                jobId = -1;
            } else {
                jobId = job->id;
                req = job->request;
                ov38_02226220 = job;
            }
        }
        NHTTPi_Unlock();
        if (jobId < 0) {
            NHTTPi_WaitForJob();
            continue;
        }
        response = req->response;
        if (req->cancel) {
            goto complete;
        }
        host = NHTTPi_ResolveHost(req);
        if (!host) {
            error = 4;
            goto complete;
        }
        invalid = -1;
        {
            int equal = 0;
            if (host == lastHost && req->port == lastPort && req->secure == lastSecure) {
                equal = 1;
            }
            lastPort = req->port;
            lastSecure = req->secure;
            lastHost = host;
            connected &= equal;
        }
retry:
        error = 0;
        if (socket >= 0) {
            poll.events = 9;
            poll.fd = socket;
            if (SOC_Poll(&poll, 1, 52365, 0) <= 0) {
                connected = 0;
            } else if (poll.revents & 0xe0) {
                connected = 0;
            }
        }
        if (!connected) {
            if (socket >= 0) {
                if (NHTTPi_CloseSocket(req, socket) < 0) {
                    error = 10;
                }
                NHTTPi_DeferSocketClose(socket, &ssl);
                socket = invalid;
                if (error) {
                    goto complete;
                }
            }
            socket = NHTTPi_CreateSocket(req);
            if (socket < 0) {
                error = 3;
                goto complete;
            }
            if (req->secure) {
                ssl = req->ssl;
                req->ssl = NULL;
            }
            NHTTPi_Lock();
            ov38_02226220->socket = socket;
            NHTTPi_Unlock();
            if (req->cancel) {
                goto complete;
            }
            connected = NHTTPi_Connect(req, socket, host, req->port) >= 0;
        } else {
            if (req->secure) {
                NHTTPi_FreeSslConnection(req->ssl);
                req->ssl = NULL;
            }
            NHTTPi_AddSslRandomSeed();
            NHTTPi_Lock();
            ov38_02226220->socket = socket;
            NHTTPi_Unlock();
        }
        if (req->cancel) {
            goto complete;
        }
        if (!connected) {
            error = 5;
            goto complete;
        }
        count = 0;
        connected = 0;
        urlLength = NHTTPi_StrLen(req->url);
        error = 10;
        switch (req->method) {
        case 0:
            SEND(sStr_GET_2, 4);
            break;
        case 1:
            SEND(sStr_POST_2, 5);
            break;
        case 2:
            SEND(sStr_HEAD_2, 5);
            break;
        }
        offset = req->pathStart;
        if (urlLength > offset) {
            n = urlLength - offset;
            if (n) {
                SEND(req->url + offset, n);
            }
        } else {
            SEND(sStr_Slash_3, 1);
        }
        SEND(sStr_HTTP_1_1_2, 11);
        parsed = req->secure ? 8 : 7;
        SEND(sStr_Host_3, 6);
        offset = parsed;
        n = req->hostEnd - offset;
        if (n) {
            SEND(req->url + offset, n);
        }
        SEND(sStr_CrLf_4, 2);
        entry = NHTTPi_PopListHead(&req->headers);
        while (entry) {
            n = NHTTPi_StrLen(entry->name);
            if (n) {
                SEND(entry->name, n);
            }
            SEND(sStr_ColonSpace_3, 2);
            n = NHTTPi_StrLen(entry->value);
            if (n) {
                SEND(entry->value, n);
            }
            SEND(sStr_CrLf_4, 2);
            ov38_0222621C(entry);
            entry = NHTTPi_PopListHead(&req->headers);
        }
        if (req->method == 1) {
            length = 0;
            multipart = 0;
            entry = req->posts;
            {
                HttpField *p = entry;
                while (p) {
                    if (p->isFile) {
                        multipart = 1;
                        break;
                    }
                    if (p == req->posts->prev) {
                        break;
                    }
                    p = p->next;
                }
            }
            if (multipart) {
                while (entry) {
                    length += 22;
                    length += NHTTPi_StrLen(entry->name) + 41;
                    if (entry->isFile) {
                        length += 75;
                    }
                    length = length + 2;
                    length = length + entry->length;
                    length = length + 2;
                    if (entry == req->posts->prev) {
                        break;
                    }
                    entry = entry->next;
                }
                length += 24;
                SEND(sStr_ContentTypeMultipartFormDataBoundary, 44);
                SEND(req->boundary + 2, 18);
                SEND(sStr_CrLf_4, 2);
            } else {
                while (entry) {
                    length += NHTTPi_UrlEncodedLength(entry->name);
                    length++;
                    length += NHTTPi_UrlEncodedLength(entry->value);
                    if (entry == req->posts->prev) {
                        break;
                    }
                    entry = entry->next;
                    length++;
                }
                SEND(sStr_ContentTypeApplicationX_WwwFormUrlencoded, 49);
            }
            SEND(sStr_ContentLength_6, 16);
            n = NHTTPi_FormatDecimal(temp, length);
            parsed = n;
            if (n) {
                SEND(temp, n);
            }
            SEND(sStr_CrLf_4, 2);
        }
        SEND(sStr_CrLf_4, 2);
        if (req->method == 1) {
            if (multipart) {
                entry = req->posts;
                while (entry) {
                    SEND(req->boundary, 20);
                    SEND(sStr_CrLf_4, 2);
                    SEND(gNhttpFormDataHeader, 38);
                    n = NHTTPi_StrLen(entry->name);
                    if (n) {
                        SEND(entry->name, n);
                    }
                    SEND(sStr_QuoteCrLf, 3);
                    if (entry->isFile) {
                        SEND(gNhttpOctetStreamHeader, 75);
                    }
                    SEND(sStr_CrLf_4, 2);
                    n = entry->length;
                    if (n) {
                        SEND(entry->value, n);
                    }
                    SEND(sStr_CrLf_4, 2);
                    if (entry == req->posts->prev) {
                        break;
                    }
                    entry = entry->next;
                }
                SEND(req->boundary, 20);
                SEND(sStr_DashDashCrLf, 4);
            } else {
                int index;
                HttpField *form = req->posts;
                while (form) {
                    for (index = 0; form->name[index]; index++) {
                        n = NHTTPi_UrlEncodeChar(temp, form->name[index]);
                        parsed = n;
                        if (n) {
                            SEND(temp, n);
                        }
                    }
                    SEND(sStr_Eq_2, 1);
                    for (index = 0; form->value[index]; index++) {
                        n = NHTTPi_UrlEncodeChar(temp, form->value[index]);
                        parsed = n;
                        if (n) {
                            SEND(temp, n);
                        }
                    }
                    if (form == req->posts->prev) {
                        break;
                    }
                    SEND(sStr_Amp_2, 1);
                    form = form->next;
                }
            }
        }
        if (count > 0) {
            n = NHTTPi_Send(req, socket, gNhttpLineBuffer, count, 0);
            if (n < 0) {
                goto complete;
            }
            if (!n) {
                goto retry;
            }
        }
        response->headerLength = 0;
        temp[0] = 0;
        temp[1] = 0;
        temp[2] = 0;
        temp[3] = 0;
        {
            HttpResponseChunk *chunk = response->chunks;
            error = 7;
            count = 0;
            do {
                if (req->cancel) {
                    goto complete;
                }
                if (count < 1024) {
                    n = NHTTPi_Recv(req, socket, response->bytes + count, 1, 0);
                    temp[count & 3] = response->bytes[count];
                } else {
                    offset = count & 511;
                    if (!offset) {
                        if (chunk) {
                            chunk->next = ov38_02226218(516, 4);
                            chunk = chunk->next;
                        } else {
                            chunk = ov38_02226218(516, 4);
                            response->chunks = chunk;
                        }
                        if (!chunk) {
                            error = 1;
                            goto complete;
                        }
                        chunk->next = NULL;
                    }
                    n = NHTTPi_Recv(req, socket, chunk->bytes + offset, 1, 0);
                    temp[count & 3] = chunk->bytes[offset];
                }
                if (n <= 0) {
                    error = 10;
                    goto complete;
                }
                count += n;
            } while (temp[(count - 4) & 3] != 13 || temp[(count - 3) & 3] != 10 || temp[(count - 2) & 3] != 13 || temp[(count - 1) & 3] != 10);
        }
        response->headerLength = count;
        if (!response->headerLength) {
            goto complete;
        }
        if (!NHTTPi_CopyHeader(response, gNhttpLineBuffer, 0, 14)) {
            goto complete;
        }
        if (NHTTPi_CompareStringNoCase(gNhttpLineBuffer, sStr_HTTP, 5) || gNhttpLineBuffer[8] != ' ') {
            goto complete;
        }
        if (NHTTPi_ParseDecimal(ov38_02226C61, 3) < 0) {
            goto complete;
        }
        if (NHTTPi_FindNextLine(response, 12, response->headerLength, &status) < 0) {
            goto complete;
        }
        remaining = NHTTPi_FindHeaderField(response, sStr_ContentLength_7, &parsed);
        if (!remaining) {
            error = 0;
            goto complete;
        }
        if (remaining > 1024) {
            goto complete;
        }
        if (remaining > 0) {
            if (!NHTTPi_CopyHeader(response, gNhttpLineBuffer, parsed, remaining)) {
                goto complete;
            }
            remaining = NHTTPi_ParseDecimal(gNhttpLineBuffer, remaining);
            if (remaining < 0) {
                goto complete;
            }
            req->contentLength = remaining;
        } else {
            req->contentLength = -1;
        }
        connected = NHTTPi_FindHeaderField(response, sStr_Connection_3, &parsed);
        if (!connected) {
            goto complete;
        }
        if (connected < 0) {
            version[0] = gNhttpLineBuffer[5];
            version[1] = gNhttpLineBuffer[7];
            version[2] = 0;
            connected = NHTTPi_ParseDecimal(version, 2) >= 11;
        } else if (connected > 1024) {
            connected = 0;
        } else {
            connected = NHTTPi_CompareHeader(response, parsed, parsed + connected, sStr_KeepAlive_2, 0) == 0;
        }
        n = NHTTPi_FindHeaderField(response, sStr_TransferEncoding, &parsed);
        if (!n) {
            goto complete;
        }
        {
            int chunked;
            if (n > 1024) {
                chunked = 0;
            } else if (n > 0) {
                chunked = NHTTPi_CompareHeader(response, parsed, parsed + n, sStr_chunked, 59) == 0;
            } else {
                chunked = 0;
            }
            if (req->method == 2) {
                goto complete;
            }
            if (remaining >= 0) {
                while (remaining > 0 && !NHTTPi_IsBodyFull(response, response->bodyLength)) {
                    n = NHTTPi_RecvBodySize(req, socket, response->bodyLength, remaining, 0);
                    if (n < 0) {
                        goto complete;
                    }
                    if (!n) {
                        break;
                    }
                    remaining -= n;
                    response->bodyLength += n;
                }
                if (remaining) {
                    error = NHTTPi_IsBodyFull(response, response->bodyLength) ? 6 : 10;
                    goto complete;
                }
                error = 0;
                goto complete;
            }
            error = 10;
            if (chunked) {
                int chunkRemaining;
                for (;;) {
                    temp[0] = 0;
                    temp[1] = 0;
                    count = 0;
                    while (count < 1024) {
                        n = NHTTPi_Recv(req, socket, gNhttpLineBuffer + count, 1, 0);
                        if (n < 0) {
                            goto complete;
                        }
                        temp[count & 1] = gNhttpLineBuffer[count];
                        if (gNhttpLineBuffer[count] == ';' || (gNhttpLineBuffer[count] == 10 && temp[(count - 1) & 1] == 13)) {
                            if (gNhttpLineBuffer[count] == 10) {
                                parsed = count - 1;
                            } else {
                                parsed = count;
                                if (NHTTPi_SkipLine(req, socket) <= 0) {
                                    goto complete;
                                }
                            }
                            if (!parsed) {
                                goto complete;
                            }
                            chunkRemaining = NHTTPi_ParseHex(gNhttpLineBuffer, parsed);
                            if (chunkRemaining < 0) {
                                goto complete;
                            }
                            break;
                        }
                        count++;
                    }
                    if (count == 1024) {
                        error = 7;
                        goto complete;
                    }
                    if (chunkRemaining > 0) {
                        while (chunkRemaining > 0) {
                            n = NHTTPi_RecvBodySize(req, socket, response->bodyLength, chunkRemaining, 0);
                            if (n <= 0) {
                                goto complete;
                            }
                            response->bodyLength += n;
                            chunkRemaining -= n;
                            if (!chunkRemaining) {
                                if (NHTTPi_Recv(req, socket, gNhttpLineBuffer, 1, 0) <= 0) {
                                    goto complete;
                                }
                                if (NHTTPi_Recv(req, socket, gNhttpLineBuffer, 1, 0) <= 0) {
                                    goto complete;
                                }
                            }
                        }
                    } else {
                        NHTTPi_SkipLine(req, socket);
                        error = 0;
                        goto complete;
                    }
                }
            } else {
                if (NHTTPi_IsBodyFull(response, response->bodyLength)) {
                    goto complete;
                }
                do {
                    n = NHTTPi_RecvBody(req, socket, response->bodyLength, 0);
                    if (n < 0) {
                        goto complete;
                    }
                    if (!n) {
                        error = 0;
                        goto complete;
                    }
                    response->bodyLength += n;
                    if (NHTTPi_IsBodyFull(response, response->bodyLength)) {
                        n = NHTTPi_Recv(req, socket, gNhttpLineBuffer, 1, 0);
                        if (n < 0) {
                            goto complete;
                        }
                        if (n) {
                            error = 6;
                            goto complete;
                        }
                    }
                } while (!NHTTPi_IsBodyFull(response, response->bodyLength));
            }
        }
complete:
        NHTTPi_Lock();
        ov38_0222621C(ov38_02226220);
        ov38_02226220 = NULL;
        NHTTPi_Unlock();
        if (req->cancel) {
            error = 8;
        }
        if (socket >= 0 && (!connected || error)) {
            if (NHTTPi_CloseSocket(req, socket) < 0) {
                error = 10;
            }
            NHTTPi_DeferSocketClose(socket, &ssl);
            socket = -1;
            connected = 0;
        }
        if (!error) {
            response->success = 1;
        } else {
            response->success = 0;
            ov38_02226214 = error;
        }
        {
            void *user = req->param;
            void (*callback)(int, HttpResponse *, void *) = req->callback;
            NHTTPi_DestroyRequest(req);
            callback(error, response, user);
        }
    }
    if (socket >= 0) {
        NHTTPi_CloseSocket(req, socket);
        NHTTPi_DeferSocketClose(socket, &ssl);
    }
    NHTTPi_CloseDeferredSockets();
}

#undef SEND

int NHTTPi_UrlEncodedLength(const char *s) {
    int n = 0, c = *s++;
    while (c) {
        if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c == 32) {
            n++;
        } else {
            n += 3;
        }
        c = *s++;
    }
    return n;
}

int NHTTPi_UrlEncodeChar(char *p, int c) {
    int hi, lo;
    if (c == 32) {
        *p = 43;
        return 1;
    }
    if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122)) {
        *p = c;
        return 1;
    }
    hi = (c >> 4) & 15;
    *p = 37;
    if (hi < 10) {
        p[1] = hi + 48;
    } else {
        p[1] = hi + 55;
    }
    lo = c & 15;
    if (lo < 10) {
        p[2] = lo + 48;
    } else {
        p[2] = lo + 55;
    }
    return 3;
}

int NHTTPi_ParseHex(const char *s, int n) {
    int i;
    int val;
    BOOL started;
    if (n > 8) {
        return -1;
    }
    if (n == 8 && s[0] > '7') {
        return -1;
    }
    i = 0;
    val = 0;
    started = FALSE;
    for (; i < n; i++) {
        char c = s[i];
        c = IsUpper(c) ? c + 0x20 : c;
        if (c >= '0' && c <= '9') {
            started = TRUE;
            val = val * 16 + c - '0';
        } else if (c >= 'a' && c <= 'f') {
            started = TRUE;
            val = val * 16 + c - 'a' + 10;
        } else {
            if (started && (c == ' ' || c == '\0')) {
                break;
            }
            if (!started && c == ' ') {
                continue;
            }
            return -1;
        }
    }
    return val;
}

int NHTTPi_ParseDecimal(const char *s, int n) {
    int i;
    int val;
    BOOL started;
    if (n > 10) {
        return -1;
    }
    i = 0;
    val = 0;
    started = FALSE;
    for (; i < n; i++) {
        char c = s[i];
        if (started && (c == ' ' || c == '\0')) {
            break;
        }
        if (!started && c == ' ') {
            continue;
        }
        if (c < '0' || c > '9') {
            return -1;
        }
        started = TRUE;
        {
            int prev = val;
            val = val * 10 + c - '0';
            if (prev > val) {
                return -1;
            }
        }
    }
    return val;
}

int NHTTPi_FormatDecimal(char *out, u32 val) {
    HttpDecimalDivisors d = gNhttpDecimalDivisors;
    int i;
    int len = 0;
    BOOL started;
    i = 0;
    started = FALSE;
    for (; i < 9; i++) {
        u32 p = d.v[i];
        if (val >= p) {
            u32 q = val / p;
            started = TRUE;
            val -= q * p;
            if (out != NULL) {
                out[len] = q + '0';
            }
            len++;
        } else if (started) {
            if (out != NULL) {
                out[len] = '0';
            }
            len++;
        }
    }
    if (out != NULL) {
        out[len] = val + '0';
    }
    return len + 1;
}

int NHTTPi_CompareFieldName(const char *a, const char *b) {
    int lb, la;
    while (lb = ToLower(*b), la = ToLowerAt(a), la == lb) {
        if (*a == '\0' || *a == ' ') {
            return 0;
        }
        a++;
        b++;
    }
    return -1;
}

int NHTTPi_ParsePort(const char *p, int n) {
    int count = 0, total = 0;
    while (n--) {
        int c = *p;
        if (c != 32 && c >= 48 && c <= 57) {
            total = total * 10 + c - 48;
            if (++count > 9) {
                return -1;
            }
        }
        p++;
    }
    if (!count) {
        total = -1;
    }
    return total;
}

int NHTTPi_FindBytes(const char *hay, int hlen, const char *needle, int nlen) {
    int i;
    int j;
    if (hlen < nlen) {
        return -1;
    }
    for (i = 0; i < hlen - nlen + 1; i++) {
        if (needle[0] == hay[i]) {
            const char *p = hay + i;
            for (j = 1; j < nlen; j++) {
                if (p[j] != needle[j]) {
                    break;
                }
            }
            if (j == nlen) {
                return 0;
            }
        }
    }
    return -1;
}
