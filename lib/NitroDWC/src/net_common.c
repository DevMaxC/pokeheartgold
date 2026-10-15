#pragma force_active on
#include <string.h>

#include "global.h"

#include "dwc/auth_internal.h"
#include "dwc/net_common_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

#pragma warn_unusedvar off
#pragma warn_uninitializedvar off

extern signed char *gDwcBase64Alphabet; // encoding alphabet
extern char sStr_HttpsNasTestNintendowifiNetAc_2[];
extern char sStr_HttpsNasDevNintendowifiNetAc[];
extern char sStr_HttpsNasNintendowifiNetAc_4[];
extern char sStr_0000[];
extern const u8 sStr_Empty[];
extern char sStr_HttpsDownload[];
extern char sFmt_HttpsDownload[];
extern char sStr_9000[];
extern char sFmt_CharStrCharStr[];
extern NetErrorState gDwcNetError;
extern NetAllocator gDwcNetAllocator;
extern NetConnectionState gDwcNetConnection;
extern NetAuthWork *gDwcNasLoginWork;
extern NetDownloadWork *gDwcNdWork;
extern int gDwcServerTime;
extern s64 ov00_0221A738;
extern s64 ov00_0221A740;

extern RTCResult RTC_GetDateTime(RTCDate *, RTCTime *);
extern int strncmp(const char *, const char *, u32);
extern char *strchr(const char *, int);
extern int OS_SNPrintf(char *, u32, const char *, ...);
extern void OS_GetMacAddress(u8 *mac);
extern u64 OS_GetTick(void);
extern void CPS_SetSslHandshakePriority(u16);
extern int CPS_GetSslHandshakePriority(void);
extern int WCM_GetLinkLevel(void);
extern int WCM_GetPhase(void);
extern u8 *WCM_GetApMacAddress(void);
extern u8 *WCM_GetApEssid(u16 *);
extern int DWC_AC_Create(NetStartParams *);
extern int DWC_AC_Process(void);
extern s32 DWC_AC_GetStatus(void);
extern int DWC_AC_GetApType(void);
extern int DWC_AC_GetApSpotInfo(void *);
extern int DWC_AC_Destroy(void);
extern int DWCi_AC_SetSpecifiedApEx(void *, void *, u32, void *, int);
extern void DWCi_Beacon_StartApSearch(void *);
extern int DWCi_Beacon_ProcessApSearch(void);
extern void DWCi_Beacon_FreeApSearch(void);
extern int NdEngine_SetAttrs(int, int, int);
extern int NdEngine_Init(void *(*)(u32, int), void (*)(void *), char *, char *, char *, char *, int);
extern void NdEngine_CleanupAsync(void (*)(void));
extern int NdEngine_CancelAsync(void);
extern int NdEngine_GetFileListNumAsync(int);
extern int NdEngine_GetFileListAsync(void *, int, int);
extern int NdEngine_GetFileAsync(int, int, int);
extern int NdEngine_GetProgress(int, int);

// Encodes len bytes in 4-character groups of 6 bits each ('*' pads); returns the length, or with
// dest == NULL the length needed.
int DWCi_Base64Encode(const u8 *src, u32 len, char *dest, u32 destSize) {
    int count;
    const u8 *next, *end;
    char *nextOut;
    char *out;

    struct {
        u8 first, second, third;
    } in;

    u32 outLen = (len / 3) * 4 + (len % 3 ? 4 : 0);
    if (!dest) {
        return outLen;
    }
    if (destSize < outLen) {
        return -1;
    }
    next = src;
    end = src + len;
    nextOut = dest;
    while (next != end) {
        int rem = end - next;
        int bits = rem * 8;
        count = bits / 6 + (bits % 6 != 0);
        if (rem >= 3) {
            rem = 3;
        }
        MI_CpuFill8((void *)&in, 0, 3);
        out = nextOut;
        MI_CpuCopy8(next, (void *)&in, rem);
        out[0] = gDwcBase64Alphabet[in.first >> 2];
        if (count < 2) {
            out[1] = '*';
        } else {
            int a = in.first, b = in.second;
            out[1] = gDwcBase64Alphabet[((a << 4) & 63) | (b >> 4)];
        }
        if (count < 3) {
            out[2] = '*';
        } else {
            int a = in.second, b = in.third;
            out[2] = gDwcBase64Alphabet[((a << 2) & 63) | (b >> 6)];
        }
        if (count < 4) {
            out[3] = '*';
        } else {
            int a = in.third;
            out[3] = gDwcBase64Alphabet[a & 63];
        }
        next += rem;
        nextOut += 4;
    }
    return nextOut - dest;
}

// Decodes DWCi_Base64Encode's encoding.
u32 DWCi_Base64Decode(char *src, u32 len, char *dest, u32 destSize) {
    int bits, bytes, count;
    u32 i;
    char *dst;
    char tmp[4];
    char *q;
    int j;
    if (len & 3) {
        return -1;
    }
    bits = 0;
    for (i = 0; i < len; i++) {
        if (src[i] != '*') {
            bits += 6;
        }
    }
    bytes = bits / 8;
    if (!dest) {
        return bytes;
    }
    if (destSize < (u32)bytes) {
        return -1;
    }
    if (!len) {
        *dest = 0;
        return 0;
    }
    dst = dest;
    do {
        for (j = 0, q = tmp; j < 4; j++, q++) {
            int c = src[j];
            if (c >= 'A' && c <= 'Z') {
                *q = c - 'A';
            } else if (c >= 'a' && c <= 'z') {
                *q = c - 'G';
            } else if (c >= '0' && c <= '9') {
                *q = c + 4;
            } else if (c == '.') {
                *q = 62;
            } else if (c == '-') {
                *q = 63;
            } else {
                *q = 0;
            }
        }
        dst[0] = (tmp[0] << 2) | (tmp[1] >> 4);
        src += 4;
        count = dst + 1 - dest;
        if (count >= bytes) {
            break;
        }
        dst[1] = (tmp[1] << 4) | (tmp[2] >> 2);
        count = dst + 2 - dest;
        if (count >= bytes) {
            break;
        }
        dst[2] = (tmp[2] << 6) | tmp[3];
        dst += 3;
        count = dst - dest;
    } while (count < bytes);
    return count;
}

int DWC_GetLastError(int *code) {
    if (code) {
        *code = gDwcNetError.code;
    }
    return gDwcNetError.type;
}

int DWC_GetLastErrorEx(int *code, int *category) {
    if (code) {
        *code = gDwcNetError.code;
    }
    if (category) {
        switch ((u32)gDwcNetError.type) {
        case 2:
        case 3:
        case 4:
        case 5:
        case 8:
            *category = 6;
            break;
        case 6:
            *category = 3;
            break;
        case 7:
            *category = 4;
            break;
        case 10:
        case 11:
        case 12:
        case 13:
            *category = 1;
            break;
        case 1:
        case 9:
            *category = 7;
            break;
        case 14:
            *category = 5;
            break;
        case 15:
        case 17:
        case 19:
            *category = 6;
            break;
        case 16:
        case 18:
            *category = 2;
            break;
        default:
            *category = 0;
            break;
        }
    }
    return gDwcNetError.type;
}

void DWC_ClearError(void) {
    if (gDwcNetError.type != 9) {
        gDwcNetError.type = 0;
        gDwcNetError.code = 0;
    }
}

int DWCi_IsError(void) {
    return gDwcNetError.type != 0;
}

// Records an error; type 9 is fatal and is never overwritten.
void DWCi_SetError(int type, int code) {
    if (gDwcNetError.type != 9) {
        gDwcNetError.type = type;
        gDwcNetError.code = code;
    }
}

NetAllocHeader *DWCi_GetAllocHeader(void *p) {
    return (NetAllocHeader *)((u8 *)p - 32);
}

void *DWCi_InitAllocHeader(NetAllocHeader *p, u32 size) {
    p->magic = 0x4457434d;
    p->size = size;
    return (u8 *)p + 32;
}

u32 DWCi_GetAllocSize(void *p) {
    return DWCi_GetAllocHeader(p)->size;
}

void DWC_SetMemFunc(void *(*alloc)(int, u32, int), void (*free)(int, void *, u32)) {
    gDwcNetAllocator.alloc = alloc;
    gDwcNetAllocator.free = free;
}

void *DWC_Alloc(int heap, u32 size) {
    return DWC_AllocEx(heap, size, 32);
}

void *DWC_AllocEx(int heap, u32 size, int align) {
    NetAllocHeader *p = gDwcNetAllocator.alloc(heap, size + 32, align);
    if (p == 0) {
        return 0;
    }
    return DWCi_InitAllocHeader(p, size);
}

void DWC_Free(int heap, void *p, u32 size) {
    NetAllocHeader *h;
    if (p == 0) {
        return;
    }
    h = DWCi_GetAllocHeader(p);
    gDwcNetAllocator.free(heap, h, h->size + 32);
}

void *DWC_Realloc(int heap, void *p, u32 oldSize, u32 size) {
    return DWC_ReallocEx(heap, p, oldSize, size, 32);
}

// Reallocation: copies min(old, new) bytes and frees src.
void *DWC_ReallocEx(int heap, void *src, u32 oldSize, u32 size, int align) {
    void *buf = DWC_AllocEx(heap, size, align);
    if (buf == NULL) {
        return NULL;
    }
    if (src != NULL) {
        oldSize = DWCi_GetAllocSize(src);
        if (oldSize <= size) {
            size = oldSize;
        }
        MI_CpuCopy8(src, buf, size);
        DWC_Free(heap, src, oldSize);
    }
    return buf;
}

void *DWCi_GsMalloc(u32 size) {
    return DWC_Alloc(5, size);
}

void *DWCi_GsRealloc(void *p, u32 size) {
    return DWC_Realloc(5, p, size, size);
}

void DWCi_GsFree(void *p) {
    DWC_Free(5, p, 0);
}

void DWC_InitInetEx(NetConnection *connection, u16 priority, int unused, u16 sslPriority) {
    if (gDwcNetConnection.connection) {
        return;
    }
    MI_CpuFill8(connection, 0, 100);
    connection->priority = priority;
    connection->one = 1;
    connection->state = 1;
    connection->flag = 0;
    connection->unk_0C = 0;
    connection->phase = 0;
    gDwcNetConnection.connection = connection;
    CPS_SetSslHandshakePriority(sslPriority);
}

// Selects the auth server: 0 test, 1 development, 2 production.
void DWC_SetAuthServer(int server) {
    switch (server) {
    case 0:
        DWCi_Auth_SetServerUrl(sStr_HttpsNasTestNintendowifiNetAc_2);
        break;
    case 1:
        DWCi_Auth_SetServerUrl(sStr_HttpsNasDevNintendowifiNetAc);
        break;
    case 2:
        DWCi_Auth_SetServerUrl(sStr_HttpsNasNintendowifiNetAc_4);
        break;
    }
}

void DWC_ConnectInetAsync(void) {
    NetStartParams p;
    if (gDwcNetConnection.connection) {
        if (gDwcNetConnection.connection->state != 1) {
            return;
        }
        MI_CpuFill8(&p, 0, 12);
        p.priority = gDwcNetConnection.connection->priority;
        p.one = gDwcNetConnection.connection->one;
        p.alloc = DWC_Alloc;
        p.free = DWC_Free;
        gDwcNetConnection.connection->state = 2;
        if (DWC_AC_Create(&p)) {
            return;
        }
        DWCi_SetError(9, -50199);
    } else {
        DWCi_SetError(9, -50199);
    }
}

void DWCi_ConnectInetToAccessPointAsync(void *a, void *b, u32 c, void *d, int e) {
    DWC_ConnectInetAsync();
    if (gDwcNetConnection.connection) {
        gDwcNetConnection.connection->unk_0C = 1;
    }
    if (DWC_GetInetStatus() != 2) {
        return;
    }
    DWCi_AC_SetSpecifiedApEx(a, b, c, d, e);
}

int DWC_CheckInet(void) {
    if (!gDwcNetConnection.connection) {
        return 0;
    }
    if (gDwcNetConnection.connection->handle) {
        gDwcNetConnection.connection->state = 3;
        DWC_GetInetStatus();
        return gDwcNetConnection.connection->unk_0C != 0;
    }
    return 0;
}

void DWC_ProcessInet(void) {
    if (!gDwcNetConnection.connection) {
        return;
    }
    switch (gDwcNetConnection.connection->phase) {
    case 1:
        gDwcNetConnection.connection->handle = 0;
        gDwcNetConnection.connection->phase = DWCi_Beacon_ProcessApSearch();
        return;
    case 2:
        DWCi_Beacon_FreeApSearch();
        DWCi_ConnectInetToAccessPointAsync(gDwcNetConnection.connection->apSsid, gDwcNetConnection.connection->apKey, gDwcNetConnection.connection->apKeyType, gDwcNetConnection.connection->apSpotInfo, 8);
        gDwcNetConnection.connection->phase = 0;
        return;
    case 3:
        DWCi_Beacon_FreeApSearch();
        gDwcNetConnection.connection->handle = -1;
        gDwcNetConnection.connection->unk_0C = 1;
        return;
    case 4:
        return;
    default:
        break;
    }
    if (gDwcNetConnection.connection->state == 2) {
        gDwcNetConnection.connection->handle = DWC_AC_Process();
        return;
    }
    if (gDwcNetConnection.connection->state != 4) {
        return;
    }
    if (!gDwcNetConnection.connection->flag) {
        return;
    }
    if (WCM_GetPhase() == 9) {
        return;
    }
    gDwcNetConnection.connection->flag = 0;
    gDwcNetConnection.connection->state = 6;
}

int DWC_GetInetStatus(void) {
    s32 result;
    if (!gDwcNetConnection.connection) {
        return 0;
    }
    switch (gDwcNetConnection.connection->phase) {
    case 1:
        return 2;
    case 2:
        return 2;
    case 3:
        DWC_ProcessInet();
        DWCi_SetError(5, gDwcNetConnection.error);
        gDwcNetConnection.connection->state = 7;
        gDwcNetConnection.connection->phase = 4;
        return 7;
    case 4:
        return 7;
    }
    {
        u16 state = gDwcNetConnection.connection->state;
        if (state == 1) {
            return state;
        }
    }
    result = DWC_AC_GetStatus();
    if (result == 5) {
        gDwcNetConnection.connection->state = 4;
        gDwcNetConnection.connection->flag = 1;
        gDwcNetConnection.connection->unk_0C = 1;
        return 4;
    }
    if (result < 0) {
        if (result >= -10) {
            DWCi_SetError(9, (s32)0xffff3be9);
            gDwcNetConnection.connection->state = 8;
            return 8;
        }
        if (gDwcNetConnection.connection->unk_0C == 0) {
            NetConnection *connection = gDwcNetConnection.connection;
            u16 priority = connection->priority;
            int handshake = CPS_GetSslHandshakePriority();
            gDwcNetConnection.error = result;
            DWC_CleanupInet();
            DWC_InitInetEx(connection, priority, 1, (u16)handshake);
            DWCi_Beacon_StartApSearch(gDwcNetConnection.connection->apSsid);
            gDwcNetConnection.connection->phase = 1;
            gDwcNetConnection.connection->handle = 0;
            return 2;
        }
        if (gDwcNetConnection.error < result) {
            result = gDwcNetConnection.error;
        }
        DWCi_SetError(5, result);
        gDwcNetConnection.connection->state = 7;
        return 7;
    }
    return 2;
}

void DWC_CleanupInet(void) {
    if (!gDwcNetConnection.connection) {
        return;
    }
    if (gDwcNetConnection.connection->state == 1) {
        gDwcNetConnection.connection = 0;
        return;
    }
    if (DWC_AC_Destroy() == 0) {
        do {
            OS_Sleep(10);
        } while (DWC_AC_Destroy() == 0);
    }
    gDwcNetConnection.connection = 0;
}

int DWC_CleanupInetAsync(void) {
    if (!gDwcNetConnection.connection) {
        return 1;
    }
    if (gDwcNetConnection.connection->state == 8) {
        return 0;
    }
    if (gDwcNetConnection.connection->state == 1) {
        gDwcNetConnection.connection = 0;
        return 1;
    }
    gDwcNetConnection.connection->state = 5;
    if (DWC_AC_Destroy() == 0) {
        return 0;
    }
    gDwcNetConnection.connection = 0;
    return 1;
}

int DWCi_IsInetDisconnected(void) {
    if (gDwcNetConnection.connection && gDwcNetConnection.connection->state == 6) {
        return 1;
    }
    return 0;
}

int DWC_GetLinkLevel(void) {
    return WCM_GetLinkLevel();
}

static inline int selectType(int flag, u8 ch) {
    return flag ? ch - 48 : 255;
}

int DWC_GetApInfo(NetApInfo *info) {
    struct {
        u16 len;
        u8 id[10];
    } temp;

    OSIntrMode irq;
    u8 *p;
    BOOL digit;
    u8 ch;
    MI_CpuFill8(info, 0, 60);
    info->spotType = 255;
    if (DWC_GetInetStatus() != 4) {
        return 0;
    }
    info->apType = DWC_AC_GetApType();
    if (info->apType == 255 || info->apType > 99) {
        info->apType = 99;
        return 0;
    }
    irq = OS_DisableInterrupts();
    p = WCM_GetApMacAddress();
    DC_InvalidateRange(p, 6);
    if (!p) {
        OS_RestoreInterrupts(irq);
        return 0;
    }
    MI_CpuCopy8(p, info->bssid, 6);
    if (info->apType >= 0 && info->apType < 3) {
        p = WCM_GetApEssid(&temp.len);
        DC_InvalidateRange(p, 32);
        if (!p) {
            OS_RestoreInterrupts(irq);
            return 0;
        }
        MI_CpuCopy8(p, info->essid, temp.len);
    }
    OS_RestoreInterrupts(irq);
    if (DWC_AC_GetApSpotInfo(temp.id)) {
        digit = FALSE;
        ch = temp.id[0];
        if (ch < 48) {
            goto selected;
        }
        if (ch <= 57) {
            digit = TRUE;
        }
selected:
        info->spotType = selectType(digit, ch);
        MI_CpuCopy8(temp.id + 1, info->spotInfo, 9);
    } else {
        info->spotType = 255;
    }
    return 1;
}

int DWC_UpdateConnection(void) {
    unsigned n;
    DWC_ProcessInet();
    if (DWCi_IsInetDisconnected()) {
        n = DWC_AC_GetApType();
        if (n == 255 || n > 99) {
            n = 99;
        }
        DWCi_SetError(8, -54000 - n);
        return 1;
    }
    return 0;
}

// Current date and time, corrected by the server date read by DWCi_ParseServerDate.
int DWC_GetDateTime(RTCDate *date, RTCTime *time) {
    s64 n;
    if (!gDwcServerTime) {
        return 0;
    }
    if (RTC_GetDateTime(date, time) != 0) {
        return 0;
    }
    n = RTC_ConvertDateTimeToSecond(date, time);
    if (n == -1) {
        return 0;
    }
    if (n < ov00_0221A738) {
        n += 3155760000LL;
    }
    n -= ov00_0221A740;
    if (n < 0 || n > 3155759999LL) {
        return 0;
    }
    RTC_ConvertSecondToDateTime(date, time, n);
    return 1;
}

int DWC_SVLGetTokenAsync(const char *svc, SvcLocResult *output) {
    if (DWCi_Svl_Init((NasAllocFunc)DWC_Alloc, (NasFreeFunc)DWC_Free) == 0) {
        return 0;
    }
    {
        int ret;
        if (strlen(svc) == 0) {
            ret = DWCi_Svl_GetTokenAsync(sStr_0000, output);
        } else {
            ret = DWCi_Svl_GetTokenAsync(svc, output);
        }
        if (ret) {
            return 1;
        }
    }
    DWCi_Svl_Cleanup();
    return 0;
}

int DWC_SVLProcess(void) {
    int n = DWCi_Svl_Process();
    if ((unsigned)(n - 3) <= 2) {
        DWCi_Svl_Cleanup();
    }
    return n;
}

int DWC_NASLoginAsync(void) {
    void *allocated;
    if (gDwcNasLoginWork) {
        OS_Terminate();
    }
    allocated = DWC_Alloc(4, 7712);
    gDwcNasLoginWork = allocated;
    if (!allocated) {
        DWCi_SetError(9, -20100);
        return 0;
    }
    MI_CpuFill8(allocated, 0, 7712);
    MI_CpuCopy8(sStr_Empty, gDwcNasLoginWork->params.gsbrcd, 9);
    gDwcNasLoginWork->params.alloc = (NasAllocFunc)DWC_Alloc;
    gDwcNasLoginWork->params.free = (NasFreeFunc)DWC_Free;
    DWCi_Auth_Start(&gDwcNasLoginWork->params, &gDwcNasLoginWork->http);
    return 1;
}

int DWC_NASLoginProcess(void) {
    AuthResult result;
    if (!gDwcNasLoginWork) {
        return 0;
    }
    switch (DWCi_Auth_GetState()) {
    case 0:
        return 2;
    case 21:
        DWCi_Auth_Destroy();
        DWC_Free(4, gDwcNasLoginWork, 7712);
        gDwcNasLoginWork = 0;
        return 3;
    case 20:
        DWCi_Auth_Destroy();
        DWC_Free(4, gDwcNasLoginWork, 7712);
        gDwcNasLoginWork = 0;
        return 5;
    default:
        DWCi_Auth_GetResult(&result);
        DWCi_Auth_Destroy();
        DWC_Free(4, gDwcNasLoginWork, 7712);
        gDwcNasLoginWork = 0;
        DWCi_SetError(2, result.error);
        return 4;
    }
}

void DWC_NASLoginAbort(void) {
    DWCi_Auth_Abort();
}

void *DWCi_NdAlloc(u32 size, int align) {
    return DWC_AllocEx(6, size, align);
}

void DWCi_NdFree(void *p) {
    DWC_Free(6, p, 0);
}

void DWCi_NdCallback(int a, unsigned result, int c) {
    if (result == 0) {
        gDwcNdWork->callback(a, result, c);
        return;
    }
    switch (result) {
    case 1:
        DWCi_SetError(9, -31001);
        break;
    case 2:
        OS_Terminate();
        break;
    case 3:
        DWCi_SetError(15, -31020);
        break;
    case 4:
        DWCi_SetError(14, -31030);
        break;
    case 5:
        DWCi_SetError(14, -31000 - c);
        break;
    case 6:
        break;
    case 7:
        OS_Terminate();
        break;
    case 8:
        DWCi_SetError(9, -31009);
        break;
    default:
        OS_Terminate();
        break;
    }
    gDwcNdWork->callback(a, result, c);
}

void DWCi_NdCleanupFinish(void) {
    void (*end)(void);
    OS_JoinThread(&gDwcNdWork->thread);
    end = gDwcNdWork->end;
    DWCi_NdFree(gDwcNdWork);
    gDwcNdWork = 0;
    if (end) {
        end();
    }
}

// Download thread: waits for the service locator, then connects to "https://<svchost>/download".
void DWCi_NdInitThread(void *arg) {
    struct Frame {
        int value;
        char token[400], url[256];
    } f;

    int status;
    NetDownloadWork *s;
    for (;;) {
        status = DWC_SVLProcess();
        if (status == 3) {
            s = gDwcNdWork;
            if (strlen(s->svcloc.svchost) + strlen(sStr_HttpsDownload) > 255) {
                DWCi_NdCallback(0, 8, -1);
                return;
            }
            OS_SNPrintf(f.url, 256, sFmt_HttpsDownload, s->svcloc.svchost);
            s = gDwcNdWork;
            if (DWCi_Base64Encode((u8 *)s->svcloc.servicetoken, strlen(s->svcloc.servicetoken), f.token, 400) < 0) {
                DWCi_NdCallback(0, 8, -1);
                return;
            }
            s = gDwcNdWork;
            if (!NdEngine_Init(DWCi_NdAlloc, DWCi_NdFree, f.url, f.token, s->user, s->pass, (int)DWCi_NdCallback)) {
                DWCi_NdCallback(0, 8, -1);
                return;
            }
            gDwcNdWork->active = 1;
            DWCi_NdCallback(0, 0, -1);
            return;
        } else if (status == 4) {
            DWC_GetLastError(&f.value);
            DWCi_SetError(14, f.value);
            gDwcNdWork->callback(0, 3, -1);
            return;
        } else if (status == 5) {
            DWCi_NdCallback(0, 6, -1);
        }
        OS_Sleep(100);
    }
}

int DWC_NdInitAsync(NetDownloadCallback callback, char *user, char *pass) {
    if (DWCi_IsError() != 0) {
        return 0;
    }
    gDwcNdWork = DWCi_NdAlloc(2688, 32);
    gDwcNdWork->active = 0;
    MI_CpuFill8(gDwcNdWork, 0, 2688);
    gDwcNdWork->callback = callback;
    strncpy(gDwcNdWork->user, user, 31);
    strncpy(gDwcNdWork->pass, pass, 31);
    if (DWC_SVLGetTokenAsync(sStr_9000, &gDwcNdWork->svcloc) == 0) {
        DWCi_NdFree(gDwcNdWork);
        gDwcNdWork = 0;
        return 0;
    }
    OS_CreateThread(&gDwcNdWork->thread, DWCi_NdInitThread, 0, &gDwcNdWork->thread, 2048, 16);
    OS_WakeupThreadDirect(&gDwcNdWork->thread);
    return 1;
}

int DWC_NdCleanupAsync(void (*end)(void)) {
    if (!gDwcNdWork) {
        return 0;
    }
    gDwcNdWork->end = end;
    if (gDwcNdWork->active == 0) {
        DWCi_NdCleanupFinish();
    } else {
        NdEngine_CleanupAsync(DWCi_NdCleanupFinish);
    }
    return 1;
}

int DWC_NdSetAttr(int a, int b, int c) {
    if (DWCi_IsError()) {
        return 0;
    }
    return NdEngine_SetAttrs(a, b, c);
}

int DWC_NdGetFileListNumAsync(int a) {
    if (DWCi_IsError()) {
        return 0;
    }
    return NdEngine_GetFileListNumAsync(a);
}

int DWC_NdGetFileListAsync(void *a, int b, int c) {
    if (DWCi_IsError()) {
        return 0;
    }
    MI_CpuFill8(a, 0, c * 176);
    return NdEngine_GetFileListAsync(a, b, c);
}

int DWC_NdGetFileAsync(int a, int b, int c) {
    if (DWCi_IsError()) {
        return 0;
    }
    return NdEngine_GetFileAsync(a, b, c);
}

int DWC_NdCancelAsync(void) {
    if (DWCi_IsError()) {
        return 0;
    }
    return NdEngine_CancelAsync();
}

int DWC_NdGetProgress(int a, int b) {
    if (DWCi_IsError()) {
        return 0;
    }
    return NdEngine_GetProgress(a, b);
}

u32 DWC_SetCommonKeyValueString(const char *a, const char *b, char *dest, int separator) {
    OS_SNPrintf(dest, 4096, sFmt_CharStrCharStr, separator, a, separator, b);
    return strlen(dest);
}

u32 DWC_AddCommonKeyValueString(const char *a, const char *b, char *dest, int separator) {
    DWC_SetCommonKeyValueString(a, b, strchr(dest, 0), separator);
    return strlen(dest);
}

// Looks up key in "<sep>key<sep>value<sep>key<sep>value..." and copies its value to out.
int DWC_GetCommonValueString(char *key, char *out, char *input, int separator) {
    char *p, *q;
    int length;
    if (out == 0) {
        return -1;
    }
    p = strchr(input, separator);
    if (p == 0) {
        return -1;
    }
    for (;;) {
        if (strncmp(p + 1, key, strlen(key)) == 0 && *((char *)strlen(key) + (u32)p + 1) == separator) {
            break;
        }
        q = strchr(p + 1, separator);
        if (q == 0) {
            return -1;
        }
        p = strchr(q + 1, separator);
        if (p == 0) {
            return -1;
        }
    }
    p = strchr(p + 1, separator);
    if (p == 0) {
        return -1;
    }
    q = strchr(p + 1, separator);
    if (q != 0) {
        length = q - (p + 1);
    } else {
        length = strlen(p + 1);
    }
    strncpy(out, p + 1, length);
    out[length] = 0;
    return length;
}

NetRandom ov00_0221A76C;

// Linear congruential random number in [0, max) (max == 0: the full upper word), seeded from the
// MAC address and the tick count.
u32 DWCi_GetRandom(u32 max) {
    if (ov00_0221A76C.x == 0 && ov00_0221A76C.mul == 0 && ov00_0221A76C.add == 0) {
        u64 seed;
        OS_GetMacAddress((u8 *)&seed);
        seed = ((seed >> 24) & 0xffffff) | (OS_GetTick() << 24);
        ov00_0221A76C.x = seed;
        ov00_0221A76C.mul = 0x5D588B656C078965ULL;
        ov00_0221A76C.add = 0x269EC3;
    }
    ov00_0221A76C.x = ov00_0221A76C.mul * ov00_0221A76C.x + ov00_0221A76C.add;
    if (max == 0) {
        return (u32)(ov00_0221A76C.x >> 32);
    }
    return (u32)(((ov00_0221A76C.x >> 32) * max) >> 32);
}
