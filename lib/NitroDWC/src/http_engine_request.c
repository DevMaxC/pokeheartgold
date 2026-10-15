#include "global.h"

#include "dwc/http_socket_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

#pragma force_active on

// Requests of the HTTP engine (http_engine_init.c) over the socket HTTP client: every request
// is a POST with the engine's account fields and an "action"; the response is parsed by type.

enum {
    HTTP_ENGINE_REQUEST_COUNT = 1,    // NdEngine_GetFileListNumAsync
    HTTP_ENGINE_REQUEST_LIST = 2,     // NdEngine_GetFileListAsync
    HTTP_ENGINE_REQUEST_CONTENTS = 3, // NdEngine_GetFileAsync
};

typedef void (*HttpEngineCallback)(int type, int result, int value);

typedef struct HttpEngineRequest {
    int jobId;                   // 0x00
    int type;                    // 0x04, HTTP_ENGINE_REQUEST_*
    HttpEngineCallback callback; // 0x08
    int notify;                  // 0x0C
    void *output;                // 0x10
    int size;                    // 0x14
    void *buffer;                // 0x18
    char *offsetParam;           // 0x1C
    char *numParam;              // 0x20
} HttpEngineRequest;

// One line of the file list.
typedef struct HttpEngineFileInfo {
    char name[34];   // 0x00
    u16 explain[51]; // 0x22
    char param1[11]; // 0x88
    char param2[11]; // 0x93
    char param3[11]; // 0x9E
    u8 unk_A9[3];
    int size; // 0xAC
} HttpEngineFileInfo;

typedef struct HttpEngineWiFiInfo {
    u64 userId;
    u8 unk_08[12];
} HttpEngineWiFiInfo;

extern u32 STD_GetStringLength(const char *str);
extern int STD_CompareNString(const char *a, const char *b, u32 n);
extern void DWCi_BM_GetWiFiInfo(HttpEngineWiFiInfo *info);

// fields of gNdWork (Ov38Work, http_engine_init.c)
extern int ov38_02226054;
extern char *ov38_02226058;
extern void *(*ov38_0222605C)(int size, int align);
extern char *ov38_02226060;
extern void (*ov38_02226068)(int type, int result, int value);
extern int ov38_0222606C;
extern void (*ov38_02226070)(void *ptr);
extern int ov38_02226074;
extern void *ov38_02226078[3];

extern int gNdBusy;
extern OSMutex gNdBusyMutex;
extern OSMutex gNdMutex;
extern u64 gNdPowersOfTen[];  // 10^16, 10^15, ..., 10
extern char gNdActionList[]; // "list", base64
extern char gNdActionCount[]; // "count", base64
extern char gNdActionContents[]; // "contents", base64
extern char sFmt_NitroWiFiSDK_2[]; // "Nitro WiFi SDK/%d.%d"
extern char gNdCaList[];
extern char sStr_HTTPSTATUSCODE[]; // "HTTPSTATUSCODE"
extern char sStr_returncd_4[]; // "returncd"
extern char sStr_UserAgent_3[]; // "User-Agent"
extern char sStr_gamecd_2[]; // "gamecd"
extern char sStr_rhgamecd[]; // "rhgamecd"
extern char sStr_passwd_2[]; // "passwd"
extern char sStr_token_2[]; // "token"
extern char sStr_userid_2[]; // "userid"
extern char sStr_macadr_2[]; // "macadr"
extern char sStr_action_4[]; // "action"
extern char sStr_attr1[]; // "attr1"
extern char sStr_attr2[]; // "attr2"
extern char sStr_attr3[]; // "attr3"
extern char sStr_apinfo_2[]; // "apinfo"
extern char sStr_offset[]; // "offset"
extern char sStr_num[]; // "num"
extern char sStr_contents[]; // "contents"
extern char sStr_ContentLength_5[]; // "Content-Length"
extern char gNdGameCode[];
extern char gNdMacAddress[];
extern char gNdApInfo[];
extern char gNdPassword[];
extern char gNdUserAgent[];
extern char gNdRhGameCode[];
extern char gNdUserId[];
extern char gNdFileListNumBuffer[];

int NdEngine_GetUserIdAndGameCode(char *gameCode, char *userId);
int NdEngine_FormatSdkVersion(char *buf);
void NdEngine_RequestCallback(int error, HttpResponse *response, HttpEngineRequest *req);
void NdEngine_FreeRequest(HttpEngineRequest *req, HttpRequest *request);
int NdEngine_CreateRequest(HttpEngineRequest **outReq, HttpRequest **outRequest, const char *action, void *body, int bodyCapacity);
int NdEngine_SendRequest(HttpEngineRequest *req, HttpRequest *request);
int NdEngine_GetFileListNumAsync(int *count);
int NdEngine_GetFileListAsync(HttpEngineFileInfo *list, int offset, int count);
int NdEngine_GetFileAsync(HttpEngineFileInfo *info, void *out, u32 capacity);
int NdEngine_GetProgress(int *received, int *total);
int NdEngine_ParseCount(HttpResponse *response, HttpEngineRequest *req);
int NdEngine_CheckFileSize(HttpResponse *response, HttpEngineRequest *req);
int NdEngine_ParseFileList(HttpResponse *response, HttpEngineRequest *req);
int NdEngine_InitLock(void);
void NdEngine_DestroyLock(void);
void NdEngine_Lock(void);
void NdEngine_Unlock(void);
int NdEngine_InitBusyFlag(void);
void NdEngine_DestroyBusyFlag(void);
int NdEngine_TrySetBusy(void);
void NdEngine_ClearBusy(void);
int NdEngine_SendMessage(OSMessageQueue *queue);
int NdEngine_FormatMacAddress(char *out);
u32 NdEngine_StrLen(const char *s);
int NdEngine_StrNCmp(const char *a, const char *b, u32 n);
void NdEngine_MemClear(void *p, int n);
void NdEngine_MemCopy(void *p, const void *s, int n);
int NdEngine_ParseDecimal(char *p, int n);
int NdEngine_FormatDecimal(char *p, int n);
int NdEngine_FormatDecimalWidth(char *buf, u64 val, int width);
int NdEngine_FormatHex(char *buf, u32 val, int n);

// Copies the Wi-Fi user ID (13 decimal digits) to userId and 4 bytes from 0x027FFE0C to gameCode.
int NdEngine_GetUserIdAndGameCode(char *gameCode, char *userId) {
    HttpEngineWiFiInfo info;
    char buf[13];
    NdEngine_MemClear(&info, 20);
    DWCi_BM_GetWiFiInfo(&info);
    if (info.userId == 0) {
        return 0;
    }
    if (NdEngine_FormatDecimalWidth(buf, info.userId, 13) < 0) {
        return 0;
    }
    NdEngine_Base64Encode(userId, buf, 13);
    NdEngine_Base64Encode(gameCode, (const char *)0x027FFE0C, 4);
    return 1;
}

int NdEngine_FormatSdkVersion(char *buf) {
    return OS_SNPrintf(buf, 33, sFmt_NitroWiFiSDK_2, 2, 2);
}

void NdEngine_RequestCallback(int error, HttpResponse *response, HttpEngineRequest *req) {
    HttpEngineCallback callback = req->callback;
    int notify = req->notify;
    int type = req->type;
    int value = -1;
    int result;
    char *status;
    char *body;
    char dec[4];

    switch (error) {
    case 0:
        if (NHTTP_GetHeaderField(response, sStr_HTTPSTATUSCODE, &status) != 3) {
            result = 3;
            break;
        } else {
            int code = NdEngine_ParseDecimal(status, 3);
            if (code == 302) {
                BOOL found = FALSE;
                int len = NHTTP_GetBodyAll(response, &body);
                int i;
                if (len < 0) {
                    result = 3;
                    break;
                }
                for (i = 0; i < len;) {
                    int start = i;
                    char *p = body + i;
                    int n;
                    int vstart;
                    char *q;
                    int vlen;
                    while (*p != '=' && i < len) {
                        p++;
                        i++;
                    }
                    n = i - start;
                    i++;
                    if (n == 8) {
                        found = NdEngine_StrNCmp(body + start, sStr_returncd_4, 8) == 0;
                    }
                    vstart = i;
                    q = body + i;
                    while (*q != '&' && *q != '\r' && *q != '\0' && i < len) {
                        q++;
                        i++;
                    }
                    vlen = i - vstart;
                    i++;
                    if (found) {
                        if (vlen == 4) {
                            int m = NdEngine_Base64Decode(dec, body + vstart, vlen);
                            dec[m] = '\0';
                            value = NdEngine_ParseDecimal(dec, m);
                        }
                        break;
                    }
                }
                result = value < 0 ? 3 : 5;
            } else if (code <= 0 || code != 200) {
                result = 3;
            } else {
                switch (type) {
                case 1:
                    result = NdEngine_ParseCount(response, req) ? 0 : 3;
                    break;
                case 2:
                    result = NdEngine_ParseFileList(response, req) ? 0 : 3;
                    break;
                case 3:
                    result = NdEngine_CheckFileSize(response, req) ? 0 : 3;
                    break;
                }
            }
        }
        break;
    case 8:
        result = 6;
        break;
    case 6:
        result = 4;
        break;
    default:
        result = 3;
        break;
    }

    switch (type) {
    case 1:
        break;
    case 2:
        if (req->numParam != NULL) {
            ov38_02226070(req->numParam);
        }
        if (req->offsetParam != NULL) {
            ov38_02226070(req->offsetParam);
        }
        ov38_02226070(req->buffer);
        break;
    case 3:
        ov38_02226070(req->output);
        break;
    }
    NdEngine_Lock();
    ov38_02226074 = -1;
    NdEngine_Unlock();
    NHTTP_DestroyResponse(response);
    ov38_02226070(req);
    NdEngine_ClearBusy();
    if (result != 0) {
        ov38_0222606C = result;
    }
    if (callback != NULL) {
        callback(type, result, value);
    }
    if (notify != 0) {
        // called without the queue argument
        ((void (*)(void))NdEngine_SendMessage)();
    }
}

void NdEngine_FreeRequest(HttpEngineRequest *req, HttpRequest *request) {
    NHTTPi_DestroyRequestAndResponse(request);
    NdEngine_ClearBusy();
    ov38_02226070(req);
}

int NdEngine_CreateRequest(HttpEngineRequest **outReq, HttpRequest **outRequest, const char *action, void *body, int bodyCapacity) {
    HttpEngineRequest *r;
    HttpRequest *d;
    if (!NdEngine_GetUserIdAndGameCode(gNdRhGameCode, gNdUserId)) {
        ov38_0222606C = 8;
        return 0;
    }
    r = ov38_0222605C(36, 4);
    if (!r) {
        ov38_0222606C = 1;
        return 0;
    }
    r->callback = ov38_02226068;
    r->notify = 0;
    if (!NdEngine_TrySetBusy()) {
        ov38_02226070(r);
        ov38_0222606C = 2;
        return 0;
    }
    d = NHTTP_CreateRequest(ov38_02226060, HTTP_SOCKET_METHOD_POST, body, bodyCapacity, (HttpSocketCallback)NdEngine_RequestCallback, r);
    if (!d) {
        NdEngine_ClearBusy();
        ov38_02226070(r);
        ov38_0222606C = 3;
        return 0;
    }
    *outReq = r;
    *outRequest = d;
    if (!NHTTPi_SetSslCaInfo(d, (int)gNdCaList, 1)) {
        goto fail;
    }
    if (!NHTTP_AddHeaderField(d, sStr_UserAgent_3, gNdUserAgent)) {
        goto fail;
    }
    if (!NHTTP_AddPostDataAscii(d, sStr_gamecd_2, gNdGameCode)) {
        goto fail;
    }
    if (!NHTTP_AddPostDataAscii(d, sStr_rhgamecd, gNdRhGameCode)) {
        goto fail;
    }
    if (!NHTTP_AddPostDataAscii(d, sStr_passwd_2, gNdPassword)) {
        goto fail;
    }
    if (!NHTTP_AddPostDataAscii(d, sStr_token_2, ov38_02226058)) {
        goto fail;
    }
    if (!NHTTP_AddPostDataAscii(d, sStr_userid_2, gNdUserId)) {
        goto fail;
    }
    if (!NHTTP_AddPostDataAscii(d, sStr_macadr_2, gNdMacAddress)) {
        goto fail;
    }
    if (!NHTTP_AddPostDataAscii(d, sStr_action_4, action)) {
        goto fail;
    }
    if (ov38_02226078[0] && !NHTTP_AddPostDataAscii(d, sStr_attr1, ov38_02226078[0])) {
        goto fail;
    }
    if (ov38_02226078[1] && !NHTTP_AddPostDataAscii(d, sStr_attr2, ov38_02226078[1])) {
        goto fail;
    }
    if (ov38_02226078[2] && !NHTTP_AddPostDataAscii(d, sStr_attr3, ov38_02226078[2])) {
        goto fail;
    }
    if (ov38_02226054 && !NHTTP_AddPostDataAscii(d, sStr_apinfo_2, gNdApInfo)) {
        goto fail;
    }
    return 1;
fail:
    NdEngine_FreeRequest(r, d);
    ov38_0222606C = 1;
    return 0;
}

int NdEngine_SendRequest(HttpEngineRequest *req, HttpRequest *request) {
    int id;
    NdEngine_Lock();
    id = NHTTP_SendRequestAsync(request);
    req->jobId = id;
    ov38_02226074 = id;
    NdEngine_Unlock();
    if (req->jobId >= 0) {
        return 1;
    }
    NdEngine_FreeRequest(req, request);
    ov38_0222606C = 3;
    return 0;
}

int NdEngine_GetFileListNumAsync(int *count) {
    HttpEngineRequest *req;
    HttpRequest *request;
    if (!NdEngine_CreateRequest(&req, &request, gNdActionCount, gNdFileListNumBuffer, 128)) {
        return 0;
    }
    req->type = HTTP_ENGINE_REQUEST_COUNT;
    req->output = count;
    return NdEngine_SendRequest(req, request) != 0;
}

int NdEngine_GetFileListAsync(HttpEngineFileInfo *list, int offset, int count) {
    int size = count << 8, n;
    char *buffer, *first, *second;
    HttpEngineRequest *r;
    HttpRequest *d;
    char number[12];
    if (size < 128) {
        size = 128;
    }
    buffer = ov38_0222605C(size, 4);
    if (!buffer) {
        ov38_0222606C = 1;
        return 0;
    }
    n = NdEngine_FormatDecimal(number, offset);
    first = ov38_0222605C(NdEngine_Base64EncodedSize(n) + 1, 4);
    if (!first) {
        ov38_02226070(buffer);
        ov38_0222606C = 1;
        return 0;
    }
    first[NdEngine_Base64Encode(first, number, n)] = 0;
    n = NdEngine_FormatDecimal(number, count);
    second = ov38_0222605C(NdEngine_Base64EncodedSize(n) + 1, 4);
    if (!second) {
        ov38_02226070(first);
        ov38_02226070(buffer);
        ov38_0222606C = 1;
        return 0;
    }
    second[NdEngine_Base64Encode(second, number, n)] = 0;
    if (!NdEngine_CreateRequest(&r, &d, gNdActionList, buffer, size)) {
        ov38_02226070(second);
        ov38_02226070(first);
        ov38_02226070(buffer);
        return 0;
    }
    if (NHTTP_AddPostDataAscii(d, sStr_offset, first) && NHTTP_AddPostDataAscii(d, sStr_num, second)) {
        r->type = HTTP_ENGINE_REQUEST_LIST;
        r->output = list;
        r->offsetParam = first;
        r->numParam = second;
        r->size = count;
        r->buffer = buffer;
        if (NdEngine_SendRequest(r, d)) {
            return 1;
        }
        ov38_02226070(second);
        ov38_02226070(first);
        ov38_02226070(buffer);
        return 0;
    }
    ov38_02226070(second);
    ov38_02226070(first);
    ov38_02226070(buffer);
    NdEngine_FreeRequest(r, d);
    ov38_0222606C = 1;
    return 0;
}

int NdEngine_GetFileAsync(HttpEngineFileInfo *info, void *out, u32 capacity) {
    int len, encoded;
    HttpEngineRequest *p;
    HttpRequest *q;
    char *b;
    if (capacity < (u32)info->size) {
        ov38_0222606C = 7;
        return 0;
    }
    len = NdEngine_StrLen(info->name);
    if (len > 32) {
        ov38_0222606C = 7;
        return 0;
    }
    if (len <= 0) {
        encoded = 0;
    } else {
        encoded = NdEngine_Base64EncodedSize(len);
    }
    b = ov38_0222605C(encoded + 1, 4);
    if (!b) {
        ov38_0222606C = 1;
        return 0;
    }
    if (!NdEngine_CreateRequest(&p, &q, gNdActionContents, out, info->size)) {
        ov38_02226070(b);
        return 0;
    }
    if (encoded > 0) {
        b[NdEngine_Base64Encode(b, info->name, len)] = 0;
        if (NHTTP_AddPostDataAscii(q, sStr_contents, b) == 0) {
            goto failed;
        }
    }
    p->type = HTTP_ENGINE_REQUEST_CONTENTS;
    p->output = b;
    p->size = info->size;
    if (NdEngine_SendRequest(p, q) != 0) {
        return 1;
    }
    ov38_02226070(b);
    return 0;
failed:
    NdEngine_FreeRequest(p, q);
    ov38_02226070(b);
    ov38_0222606C = 1;
    return 0;
}

int NdEngine_GetProgress(int *received, int *total) {
    return NHTTP_GetProgress(received, total);
}

int NdEngine_ParseCount(HttpResponse *response, HttpEngineRequest *req) {
    char *body[1];
    int n = NHTTP_GetBodyAll(response, body);
    if (n >= 0) {
        *(int *)req->output = NdEngine_ParseDecimal(body[0], n);
        return *(int *)req->output >= 0;
    }
    return 0;
}

int NdEngine_CheckFileSize(HttpResponse *response, HttpEngineRequest *req) {
    char *body;
    int size = NHTTP_GetBodyAll(response, &body);
    return size == req->size;
}

// Parses the tab-separated file list (one line per file) into req->output.
int NdEngine_ParseFileList(HttpResponse *response, HttpEngineRequest *req) {
    int result = 0, len, i, row, offset;
    char *text, *header;
    NdEngine_MemClear(req->output, req->size * sizeof(HttpEngineFileInfo));
    if (NHTTP_GetHeaderField(response, sStr_ContentLength_5, &header) > 0 && header[0] == '0' && header[1] == 0) {
        return 1;
    }
    len = NHTTP_GetBodyAll(response, &text);
    if (len <= 0) {
        goto done;
    }
    i = 0;
    row = 0;
    if (req->size <= 0) {
        goto done;
    }
    offset = 0;
    do {
        int field, start, cr, n, value;
        HttpEngineFileInfo *rec;
        if (i >= len) {
            result = 1;
            goto done;
        }
        rec = (HttpEngineFileInfo *)((u8 *)req->output + offset);
        field = 0;
        start = i;
        cr = 0;
        result = 0;
        while (i < len) {
            int ch = text[i];
            if (ch == 13) {
                cr = 1;
                goto advance;
            }
            if (cr) {
                if (ch == 10) {
                    if (field == 5) {
                        n = i - 1 - start;
                        if (n > 8) {
                            goto done;
                        }
                        value = NdEngine_ParseDecimal(text + start, n);
                        if (value < 0) {
                            goto done;
                        }
                        rec->size = value;
                    }
                    i++;
                    result = field >= 5;
                    break;
                }
            } else if (ch == 9) {
                switch (field) {
                case 0:
                    n = i - start;
                    if ((u32)n > 32) {
                        goto done;
                    }
                    NdEngine_MemCopy(rec->name, text + start, n);
                    break;
                case 1:
                    n = i - start;
                    if ((u32)NdEngine_Base64DecodedSize(n) > 102) {
                        goto done;
                    }
                    NdEngine_Base64Decode((char *)rec->explain, text + start, n);
                    rec->explain[50] = 0;
                    break;
                case 2:
                    n = i - start;
                    if ((u32)n > 10) {
                        goto done;
                    }
                    NdEngine_MemCopy(rec->param1, text + start, n);
                    break;
                case 3:
                    n = i - start;
                    if ((u32)n > 10) {
                        goto done;
                    }
                    NdEngine_MemCopy(rec->param2, text + start, n);
                    break;
                case 4:
                    n = i - start;
                    if ((u32)n > 10) {
                        goto done;
                    }
                    NdEngine_MemCopy(rec->param3, text + start, n);
                    break;
                case 5:
                    n = i - start;
                    if (n > 8) {
                        goto done;
                    }
                    value = NdEngine_ParseDecimal(text + start, n);
                    if (value < 0) {
                        goto done;
                    }
                    rec->size = value;
                    break;
                }
                field++;
                start = i + 1;
            }
            cr = 0;
advance:
            i++;
        }
        row++;
        offset += sizeof(HttpEngineFileInfo);
    } while (row < req->size);
done:
    return result;
}

int NdEngine_InitLock(void) {
    OS_InitMutex(&gNdMutex);
    return 1;
}

void NdEngine_DestroyLock(void) {
}

void NdEngine_Lock(void) {
    OS_LockMutex(&gNdMutex);
}

void NdEngine_Unlock(void) {
    OS_UnlockMutex(&gNdMutex);
}

int NdEngine_InitBusyFlag(void) {
    OS_InitMutex(&gNdBusyMutex);
    gNdBusy = 0;
    return 1;
}

void NdEngine_DestroyBusyFlag(void) {
}

int NdEngine_TrySetBusy(void) {
    int ok;
    OS_LockMutex(&gNdBusyMutex);
    ok = gNdBusy == 0;
    if (ok) {
        gNdBusy = 1;
    }
    OS_UnlockMutex(&gNdBusyMutex);
    return ok;
}

void NdEngine_ClearBusy(void) {
    OS_LockMutex(&gNdBusyMutex);
    gNdBusy = 0;
    OS_UnlockMutex(&gNdBusyMutex);
}

int NdEngine_SendMessage(OSMessageQueue *queue) {
    return OS_SendMessage(queue, 0, 0);
}

// Writes the MAC address as 12 hex digits.
int NdEngine_FormatMacAddress(char *out) {
    u8 mac[6];
    char b[12];
    int i;
    OS_GetMacAddress(mac);
    for (i = 0; i < 6; i++) {
        NdEngine_FormatHex(b + i * 2, mac[i], 2);
    }
    return NdEngine_Base64Encode(out, b, 12);
}

u32 NdEngine_StrLen(const char *s) {
    return STD_GetStringLength(s);
}

int NdEngine_StrNCmp(const char *a, const char *b, u32 n) {
    return STD_CompareNString(a, b, n);
}

void NdEngine_MemClear(void *p, int n) {
    MI_CpuFill8(p, 0, n);
}

void NdEngine_MemCopy(void *p, const void *s, int n) {
    MI_CpuCopy8(s, p, n);
}

int NdEngine_ParseDecimal(char *p, int n) {
    return NHTTPi_ParseDecimal(p, n);
}

int NdEngine_FormatDecimal(char *p, int n) {
    return NHTTPi_FormatDecimal(p, n);
}

// Writes val in decimal, zero-padded to width digits; returns the length, -1 if val >= 10^17.
int NdEngine_FormatDecimalWidth(char *buf, u64 val, int width) {
    int i;
    int len = 0;
    BOOL started;
    if (val >= 100000000000000000ULL) {
        return len - 1;
    }
    i = 0;
    started = FALSE;
    for (; i < 16; i++) {
        u64 p = gNdPowersOfTen[i];
        if (val >= p) {
            u32 q = val / p;
            val -= q * p;
            buf[len] = q + '0';
            started = TRUE;
            len++;
        } else if (started || 17 - i <= width) {
            buf[len] = '0';
            len++;
        }
    }
    buf[len] = val + '0';
    return len + 1;
}

// Writes the low n hex digits of val (lowercase).
int NdEngine_FormatHex(char *buf, u32 val, int n) {
    int len = 0;
    int i;
    if (n > 8) {
        return -1;
    }
    for (i = 1; i <= n; i++) {
        u32 d = (val >> ((n - i) * 4)) & 0xF;
        if (d < 10) {
            buf[len++] = d + '0';
        } else {
            buf[len++] = d + 'a' - 10;
        }
    }
    return len;
}
