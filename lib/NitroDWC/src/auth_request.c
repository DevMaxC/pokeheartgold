#pragma force_active on
#include <string.h>

#include "global.h"

#include "dwc/auth_internal.h"
#include "dwc/net_common_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

typedef struct AuthDate {
    int year;
    int month;
    int day;
    int week;
} AuthDate;

typedef struct AuthTime {
    int hour;
    int minute;
    int second;
} AuthTime;

// DWCi_Auth_FormatFields reads the WiFi info as words.
typedef struct AuthWiFiInfoWords {
    u32 userIdLo;
    u32 userIdHi;
    volatile u32 pseudoUserIdLo;
    volatile u32 pseudoUserIdHi;
    u16 password;
} AuthWiFiInfoWords;

typedef struct HexChars {
    char byte[2];
} HexChars;

extern int errno;
extern u8 ov00_0221A6A0[];
extern u32 ov00_0221A6BC;
extern char sStr_ALLOC_Bmwork[];
extern char sStr_FREE_Bmwork[];
extern char sStr_Date[];
extern char sStr_httpresult[];
extern char sStr_returncd[];
extern char sStr_token[];
extern char sStr_locator[];
extern char sStr_challenge[];
extern char sStr_datetime[];
extern char sStr_SetCookie[];
extern char sStr_acctcreate[];
extern char sStr_action[];
extern char sStr_login[];
extern char sStr_gsbrcd[];
extern char sStr_Y[];
extern char sStr_iswfc[];
extern char sStr_ingamesn[];
extern char sFmt_Uint64[];
extern char sFmt_Uint[];
extern char sFmt_Hex[];
extern char sFmt_HexHex[];
extern char sFmt_IntIntIntIntIntInt[];
extern char sFmt_IntColon0000000_Dash00[];
extern char sFmt_IntInt[];
extern char sStr_sdkver[];
extern char sStr_userid[];
extern char sStr_passwd[];
extern char sStr_bssid[];
extern char sStr_apinfo[];
extern char sStr_gamecd[];
extern char sStr_makercd[];
extern char sStr_unitcd[];
extern char sStr_macadr[];
extern char sStr_lang[];
extern char sStr_birth[];
extern char sStr_devtime[];
extern char sStr_devname[];
extern char sStr_ssid[];
extern char sFmt_NitroWiFiSDK[];
extern char sStr_UserAgent[];
extern char sStr_HTTP_X_GAMECD[];
extern char sStr_ALLOC_HttpLowrecvbuf[];
extern char sStr_ALLOC_HttpLowsendbuf[];

extern int DWCi_AUTH_UpDateWiFiID(void *, void *);
extern void DWCi_AUTH_RemakeWiFiID(void *);
extern void DWCi_AUTH_MakeWiFiID(void *);
extern void DWCi_BM_GetWiFiInfo(void *);
extern void OS_GetMacAddress(u8 *);
extern void *WCM_GetApMacAddress(void);
extern void *WCM_GetApEssid(u16 *);
extern RTCResult RTC_GetDateTime(RTCDate *, RTCTime *);
extern long atol(const char *s);
extern long strtol(const char *s, char **end, int base);
extern u32 wcslen(const u16 *s);
extern int DWC_AC_GetApType(void);
extern void DWC_AC_GetApSpotInfo(char *);

// Auth thread: waits for the server request, retries up to three times.
void DWCi_Auth_Thread(void *arg) {
    int retries = 0;
    for (;;) {
        int restart, status;
        OSTick start;
        if (gDwcAuthState.work->request->thread.id) {
            OS_JoinThread(&gDwcAuthState.work->request->thread);
        }
        if (gDwcAuthState.work->request->result != 8) {
            gDwcAuthState.work->response.error = 20100;
            status = gDwcAuthState.work->request->result;
            if (status == 7) {
                DWCi_Auth_SetState(20);
                return;
            }
            if (retries > 2) {
                if (status == 2) {
                    DWCi_Auth_SetState(9);
                    return;
                }
                if (status == 3) {
                    DWCi_Auth_SetState(11);
                    return;
                }
                DWCi_Auth_SetState(13);
                return;
            }
            restart = 1;
            retries++;
        } else {
            status = DWCi_Auth_HandleResponse();
            switch (status) {
            case 21:
                DWCi_Auth_SetState(21);
                return;
            case 16:
                if (retries > 2) {
                    DWCi_Auth_SetState(16);
                    return;
                }
                restart = 0;
                retries++;
                break;
            case 17:
                DWCi_Auth_SetState(status);
                return;
            default:
                if (retries >= 2) {
                    DWCi_Auth_SetState(status);
                    return;
                }
                restart = 1;
                retries++;
                break;
            }
        }
        start = OS_GetTick();
        while (((OS_GetTick() - start) << 6) / 33514 < 5000) {
            OS_LockMutex(&gDwcAuthState.work->mutex);
            if (gDwcAuthState.work->cancelled == 1) {
                gDwcAuthState.work->response.error = 20100;
                OS_UnlockMutex(&gDwcAuthState.work->mutex);
                DWCi_Auth_SetState(20);
                return;
            }
            OS_UnlockMutex(&gDwcAuthState.work->mutex);
            OS_Sleep(5000);
        }
        DWCi_Http_Destroy(gDwcAuthState.work->request);
        OS_LockMutex(&gDwcAuthState.work->mutex);
        gDwcAuthState.work->result = DWCi_Auth_SendRequest(restart);
        if (gDwcAuthState.work->result) {
            gDwcAuthState.work->response.error = 20100;
            OS_UnlockMutex(&gDwcAuthState.work->mutex);
            return;
        }
        OS_UnlockMutex(&gDwcAuthState.work->mutex);
        continue;
    }
}

int DWCi_Auth_HandleResponse(void) {
    NasAllocFunc alloc = gDwcAuthState.work->params.alloc;
    NasFreeFunc free = gDwcAuthState.work->params.free;
    void *block;
    s32 error;
    if (DWCi_Http_ParseResponse(gDwcAuthState.work->request, 0) != 1) {
        gDwcAuthState.work->response.error = 20100;
        return 14;
    }
    if (DWCi_Auth_ReadResponse() != 0) {
        return 14;
    }
    error = gDwcAuthState.work->response.error;
    if (error < 20100) {
        if (error == 20002) {
            block = alloc(sStr_ALLOC_Bmwork, 0x71f);
            if (!block) {
                gDwcAuthState.work->response.error = 20100;
                return 2;
            }
            if (DWCi_AUTH_UpDateWiFiID(ov00_0221A6A0, (void *)(((u32)block + 31) & ~31u)) != 1) {
                free(sStr_FREE_Bmwork, block, 0);
                gDwcAuthState.work->response.error = 20100;
                return 15;
            }
            free(sStr_FREE_Bmwork, block, 0);
        }
        return 21;
    }
    switch (error) {
    case 20104: {
        DWCi_AUTH_RemakeWiFiID(ov00_0221A6A0);
        gDwcAuthState.work->response.error = 20104;
        return 16;
    }
    case 20108: {
        block = alloc(sStr_ALLOC_Bmwork, 0x700);
        if (!block) {
            gDwcAuthState.work->response.error = 20108;
            return 17;
        }
        DWCi_AUTH_MakeWiFiID((void *)(((u32)block + 31) & ~31u));
        free(sStr_FREE_Bmwork, block, 0);
        gDwcAuthState.work->response.error = 20108;
        return 17;
    }
    default:
        return 18;
    }
}

// Reads httpresult, returncd and the auth fields of the response.
int DWCi_Auth_ReadResponse(void) {
    char *end = NULL;
    long code;
    long value;
    AuthWork *work;
    end = DWCi_Http_GetEntry(gDwcAuthState.work->request, sStr_Date);
    if (end != NULL) {
        DWCi_ParseServerDate(end);
    }
    end = NULL;
    errno = 0;
    code = atol(DWCi_Http_GetEntry(gDwcAuthState.work->request, sStr_httpresult));
    if (errno == 0x22) {
        gDwcAuthState.work->response.error = 20101;
        return 12;
    }
    if (code != 200) {
        gDwcAuthState.work->response.error = code + 23000;
        return 18;
    }
    if ((int)DWCi_Http_GetBase64Entry(gDwcAuthState.work->request, sStr_returncd, gDwcAuthState.work->response.returncd, 4) <= 0) {
        gDwcAuthState.work->response.error = 20101;
        return 14;
    }
    value = strtol(gDwcAuthState.work->response.returncd, &end, 10);
    work = gDwcAuthState.work;
    if (end != work->response.returncd + strlen(work->response.returncd)) {
        work->response.error = 20101;
        return 12;
    }
    work->response.error = value + 20000;
    if (value < 100) {
        gDwcAuthState.work->response.token[0] = 0;
        gDwcAuthState.work->response.locator[0] = 0;
        gDwcAuthState.work->response.challenge[0] = 0;
        gDwcAuthState.work->response.datetime[0] = 0;
        gDwcAuthState.work->response.cookie[0] = 0;
        DWCi_Http_GetBase64Entry(gDwcAuthState.work->request, sStr_token, gDwcAuthState.work->response.token, 0x12d);
        DWCi_Http_GetBase64Entry(gDwcAuthState.work->request, sStr_locator, gDwcAuthState.work->response.locator, 0x33);
        DWCi_Http_GetBase64Entry(gDwcAuthState.work->request, sStr_challenge, gDwcAuthState.work->response.challenge, 9);
        DWCi_Http_GetBase64Entry(gDwcAuthState.work->request, sStr_datetime, gDwcAuthState.work->response.datetime, 0xf);
        DWCi_Http_GetStringEntry(gDwcAuthState.work->request, sStr_SetCookie, gDwcAuthState.work->response.cookie, 0x41);
        gDwcAuthState.work->response.cookie[0x2B] = 0;
        if (value != 40) {
            gDwcAuthState.state = 1;
        } else {
            gDwcAuthState.state = 2;
        }
    }
    return 0;
}

// Adds the POST fields of an "acctcreate" or "login" request.
int DWCi_Auth_AddPostFields(NasHttp *http, const char *gsbrcd, const u16 *ingamesn) {
    AuthFields fields;
    if (gDwcAuthState.userId == 0) {
        if (DWCi_Http_AddPostItem(http, sStr_action, sStr_acctcreate, strlen(sStr_acctcreate)) != 0) {
            return 8;
        }
    } else {
        if (DWCi_Http_AddPostItem(http, sStr_action, sStr_login, strlen(sStr_login)) != 0) {
            return 8;
        }
        if (DWCi_Http_AddPostItem(http, sStr_gsbrcd, gsbrcd, strlen(gsbrcd)) != 0) {
            return 8;
        }
    }
    if (!DWCi_Auth_FormatFields(&fields, (AuthWiFiInfo *)ov00_0221A6A0)) {
        return 5;
    }
    if (!DWCi_Auth_AddCommonPostFields(http, &fields, ov00_0221A6BC)) {
        return 8;
    }
    if (gDwcAuthState.mode == 1) {
        if (DWCi_Http_AddPostItem(http, sStr_iswfc, sStr_Y, strlen(sStr_Y)) != 0) {
            return 8;
        }
    }
    if (wcslen(ingamesn) != 0) {
        if (DWCi_Http_AddPostItem(http, sStr_ingamesn, ingamesn, wcslen(ingamesn) * 2) != 0) {
            return 8;
        }
    }
    return 0;
}

void DWCi_Auth_SetState(int result) {
    OS_LockMutex(&gDwcAuthState.work->mutex);
    gDwcAuthState.work->result = result;
    OS_UnlockMutex(&gDwcAuthState.work->mutex);
}

int DWCi_Auth_FormatFieldsFromBM(AuthFields *fields) {
    char info[20];
    DWCi_BM_GetWiFiInfo(info);
    return DWCi_Auth_FormatFields(fields, (AuthWiFiInfo *)info);
}

static inline void MacString(char *dest, u8 *src) {
    int index;
    HexChars *output = (HexChars *)dest;
    for (index = 0; index < 6; index++, output++) {
        OS_SPrintf(output->byte, sFmt_Hex, *src++);
    }
}

// Formats the request fields from the WiFi info, the console and the access point.
int DWCi_Auth_FormatFields(AuthFields *fields, AuthWiFiInfo *wifiInfo) {
    char owner[84];
    AuthDate date;
    AuthTime time;
    u8 mac[6];
    u16 essidLen;
    int i;
    s32 source;
    OSIntrMode irq;
    u8 *ap;
    char *essid, *cursor;
    u32 a, b;
    char *out = (char *)fields;
    AuthWiFiInfoWords *info = (AuthWiFiInfoWords *)wifiInfo;
    MI_CpuFill8(out, 0, 0x94);
    a = info->userIdLo;
    b = info->userIdHi;
    if (b || a) {
        OS_SNPrintf(out, 14, sFmt_Uint64, a, b);
    } else {
        a = info->pseudoUserIdLo;
        b = info->pseudoUserIdHi;
        OS_SNPrintf(out, 14, sFmt_Uint64, a, b);
    }
    OS_SNPrintf(out + 14, 7, sFmt_Uint, info->password);
    if (!*(volatile u8 *)0x27ffe0c) {
        OS_Terminate();
    }
    MI_CpuCopy8((void *)0x27ffe0c, out + 21, 4);
    if (!*(volatile u8 *)0x27ffe10) {
        OS_Terminate();
    }
    MI_CpuCopy8((void *)0x27ffe10, out + 26, 2);
    out[29] = 48;
    OS_GetMacAddress(mac);
    source = (s32)mac;
    cursor = out + 31;
    for (i = 0; i < 6; i++, cursor += 2, source++) {
        OS_SPrintf(cursor, sFmt_Hex, *(u8 *)source);
    }
    OS_GetOwnerInfo((OSOwnerInfo *)owner);
    if ((u8)owner[0] >= 8) {
        owner[0] = 1;
    }
    OS_SNPrintf(out + 44, 3, sFmt_Hex, (u8)owner[0]);
    MI_CpuCopy8(owner + 4, out + 126, 20);
    OS_SNPrintf(out + 47, 5, sFmt_HexHex, (u8)owner[2], (u8)owner[3]);
    if (RTC_GetDateTime((RTCDate *)&date, (RTCTime *)&time) != 0) {
        return 0;
    }
    OS_SNPrintf(out + 52, 13, sFmt_IntIntIntIntIntInt, date.year, date.month, date.day, time.hour, time.minute, time.second);
    irq = OS_DisableInterrupts();
    ap = WCM_GetApMacAddress();
    DC_InvalidateRange(ap, 6);
    if (!ap) {
        OS_RestoreInterrupts(irq);
        return 0;
    }
    for (i = 0, cursor = out + 65; i < 6; i++, cursor += 2) {
        OS_SPrintf(cursor, sFmt_Hex, ap[i]);
    }
    {
        unsigned strength = DWC_AC_GetApType();
        if (strength == 255 || strength > 99) {
            strength = 99;
        }
        OS_SNPrintf(out + 111, 14, sFmt_IntColon0000000_Dash00, strength);
    }
    essid = WCM_GetApEssid(&essidLen);
    DC_InvalidateRange(essid, 32);
    if (!essid) {
        OS_RestoreInterrupts(irq);
        return 0;
    }
    MI_CpuCopy8(essid, out + 78, 32);
    DWC_AC_GetApSpotInfo(out + 114);
    OS_RestoreInterrupts(irq);
    return 1;
}

int DWCi_Auth_AddCommonPostFields(NasHttp *http, AuthFields *fields, int withSsid) {
    char temp[33];
    OS_SNPrintf(temp, 33, sFmt_IntInt, 2, 2);
    if (DWCi_Http_AddPostItem(http, sStr_sdkver, temp, strlen(temp))) {
        return 0;
    }
    if (DWCi_Http_AddPostItem(http, sStr_userid, fields->userid, strlen(fields->userid))) {
        return 0;
    }
    if (DWCi_Http_AddPostItem(http, sStr_passwd, fields->passwd, strlen(fields->passwd))) {
        return 0;
    }
    if (DWCi_Http_AddPostItem(http, sStr_bssid, fields->bssid, strlen(fields->bssid))) {
        return 0;
    }
    if (DWCi_Http_AddPostItem(http, sStr_apinfo, fields->apinfo, strlen(fields->apinfo))) {
        return 0;
    }
    if (DWCi_Http_AddPostItem(http, sStr_gamecd, fields->gamecd, strlen(fields->gamecd))) {
        return 0;
    }
    if (DWCi_Http_AddPostItem(http, sStr_makercd, fields->makercd, strlen(fields->makercd))) {
        return 0;
    }
    if (DWCi_Http_AddPostItem(http, sStr_unitcd, fields->unitcd, strlen(fields->unitcd))) {
        return 0;
    }
    if (DWCi_Http_AddPostItem(http, sStr_macadr, fields->macadr, strlen(fields->macadr))) {
        return 0;
    }
    if (DWCi_Http_AddPostItem(http, sStr_lang, fields->lang, strlen(fields->lang))) {
        return 0;
    }
    if (DWCi_Http_AddPostItem(http, sStr_birth, fields->birth, strlen(fields->birth))) {
        return 0;
    }
    if (DWCi_Http_AddPostItem(http, sStr_devtime, fields->devtime, strlen(fields->devtime))) {
        return 0;
    }
    if (DWCi_Http_AddPostItem(http, sStr_devname, fields->devname, wcslen(fields->devname) * 2)) {
        return 0;
    }
    if (withSsid == 1) {
        if (DWCi_Http_AddPostItem(http, sStr_ssid, fields->ssid, strlen(fields->ssid))) {
            return 0;
        }
    }
    OS_SNPrintf(temp, 33, sFmt_NitroWiFiSDK, 2, 2);
    if (DWCi_Http_AddHeaderItem(http, sStr_UserAgent, temp)) {
        return 0;
    }
    return DWCi_Http_AddHeaderItem(http, sStr_HTTP_X_GAMECD, fields->gamecd) == 0;
}

// Sets up a connection: receive/send buffers, response buffer, URL, request line.
int DWCi_Http_Create(NasHttp *http, NasHttpParams *params) {
    NasAllocFunc alloc = params->alloc;
    MI_CpuFill8(http, 0, 0x1C14);
    http->contentLength = -1;
    http->received = -1;
    http->params = *params;
    http->lowRecvBuf = alloc(sStr_ALLOC_HttpLowrecvbuf, 0xB68);
    if (!http->lowRecvBuf) {
        http->result = 1;
        return 1;
    }
    http->lowSendBuf = alloc(sStr_ALLOC_HttpLowsendbuf, 0x5EA);
    if (!http->lowSendBuf) {
        http->result = 1;
        return 1;
    }
    if (!DWCi_Http_AllocBuffer(http, &http->response, http->params.bufferSize)) {
        http->result = 1;
        return 1;
    }
    if (!DWCi_Http_ParseUrl(http, params->url)) {
        http->result = 1;
        return 1;
    }
    http->result = DWCi_Http_AddRequestLine(http);
    if (!http->result) {
        http->status = 255;
    }
    return http->result;
}
