#pragma force_active on
#include <string.h>

#include "global.h"

#include "dwc/auth_internal.h"
#include "dwc/net_common_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

extern int errno;
extern char *gDwcConnTestUrl; // connection test URL
extern char sStr_FREE_ArrayEntryI_Label[];
extern char sStr_FREE_ArrayEntryI_Value[];
extern char sStr_ALLOC_DWCnetcheck[];
extern char sStr_ALLOC_DWChttp[];
extern char sStr_FREE_DWChttp[];
extern char sStr_FREE_DWCnetcheckBody302[];
extern char sStr_FREE_DWCnetcheckBodyWayport[];
extern char sStr_FREE_DWCnetcheck[];
extern char sStr_ALLOC_DWCnetcheckBody302[];
extern char sStr_ALLOC_Url[];
extern char sStr_ALLOC_DataLen[];
extern char sStr_ALLOC_WaitLen[];
extern char sStr_ALLOC_DWCnetcheckBodyWayport[];
extern char sStr_httpresult_3[];
extern char sStr_HttpsNasNintendowifiNetAc_2[];
extern char sStr_action_2[];
extern char sStr_message[];
extern char sStr_HotSpotResponse[];
extern char sStr_parse[];
extern char sStr_HTML[];
extern char sStr_returncd_2[];
extern char sStr_url[];
extern char sStr_data[];
extern char sStr_wait[];
extern char sStr_FREE_Url[];
extern char sStr_FREE_Data[];
extern char sStr_FREE_Wait[];
extern char *gDwcMonthNames[12]; // month names
extern char sStr_Fri03_Mar2006_01_28_13_GMT[];
extern char sStr_ALLOC_Intwork[];
extern char sStr_FREE_Intwork[];
extern char sStr_HttpsNasNintendowifiNetAc_3[];
extern char sStr_action_3[];
extern char sStr_SVCLOC[];
extern char sStr_svc[];
extern char sStr_Date_2[];
extern char sStr_httpresult_4[];
extern char sStr_returncd_3[];
extern char sStr_svchost[];
extern char sStr_servicetoken[];
extern char sStr_statusdata[];
// int valid; s64 rtc seconds when the server date was read (+4); s64 rtc minus server seconds (+12)
extern char gDwcServerTime[];

extern long atol(const char *);
extern RTCResult RTC_GetDateTime(RTCDate *, RTCTime *);
extern void DWCi_BM_GetWiFiInfo(AuthWiFiInfo *info);

char *DWCi_Http_GetEntry(NasHttp *http, char *label) {
    int i;
    for (i = 0; i < 32; i++) {
        if (!http->entry[i].label) {
            break;
        }
        if (!strcmp(label, http->entry[i].label)) {
            return http->entry[i].value;
        }
    }
    return 0;
}

// Copies the base64-like decoded value of a response field; returns its length.
u32 DWCi_Http_GetBase64Entry(NasHttp *http, char *label, char *out, u32 size) {
    char *v = DWCi_Http_GetEntry(http, label);
    u32 r;
    if (!v) {
        return 0;
    }
    r = DWCi_Base64Decode(v, strlen(v), out, size);
    if (r == 0xffffffff || r >= size) {
        return r;
    }
    out[r] = 0;
    return r;
}

int DWCi_Http_GetStringEntry(NasHttp *http, char *label, char *out, int size) {
    char *v = DWCi_Http_GetEntry(http, label);
    if (!v) {
        return 0;
    }
    if ((int)strlen(v) >= size) {
        return 0;
    }
    strcpy(out, v);
    return 1;
}

void DWCi_Http_FreeEntries(NasHttp *http, NasHttpEntry *entry, int count) {
    NasFreeFunc cb = http->params.free;
    int i;
    char *label, *value;
    i = 0;
    if (count <= 0) {
        return;
    }
    label = sStr_FREE_ArrayEntryI_Label;
    value = sStr_FREE_ArrayEntryI_Value;
    do {
        if (entry[i].label) {
            cb(label, entry[i].label, 0);
            entry[i].label = 0;
        }
        if (entry[i].value) {
            cb(value, entry[i].value, 0);
            entry[i].value = 0;
        }
    } while (++i < count);
}

// Allocates the connection test work ("DWCnetcheck") and its connection ("DWChttp"), starts the thread.
int DWCi_NetCheck_Start(NetCheckCallbacks *callbacks) {
    NasAllocFunc alloc = callbacks->alloc;
    if (gDwcNetCheckState.work) {
        return 4;
    }
    gDwcNetCheckState.work = alloc(sStr_ALLOC_DWCnetcheck, 0x11f4);
    if (!gDwcNetCheckState.work) {
        return 4;
    }
    MI_CpuFill8(gDwcNetCheckState.work, 0, 0x11f4);
    gDwcNetCheckState.work->error = -99999;
    gDwcNetCheckState.work->callbacks = *callbacks;
    if (gDwcNetCheckState.http) {
        return 4;
    }
    gDwcNetCheckState.http = alloc(sStr_ALLOC_DWChttp, 0x1c14);
    if (!gDwcNetCheckState.http) {
        return 4;
    }
    gDwcNetCheckState.redirected = 0;
    OS_InitMutex(&gDwcNetCheckState.work->mutex);
    DWCi_NetCheck_StartThread();
    return 0;
}

void DWCi_NetCheck_Destroy(void) {
    NasFreeFunc cb = gDwcNetCheckState.work->callbacks.free;
    if (gDwcNetCheckState.http) {
        DWCi_Http_Destroy(gDwcNetCheckState.http);
        cb(sStr_FREE_DWChttp, gDwcNetCheckState.http, 0);
        gDwcNetCheckState.http = 0;
    }
    DWCi_Auth_Destroy();
    if (!gDwcNetCheckState.work) {
        return;
    }
    if (gDwcNetCheckState.work->body302) {
        cb(sStr_FREE_DWCnetcheckBody302, gDwcNetCheckState.work->body302, 0);
        gDwcNetCheckState.work->body302 = 0;
    }
    if (gDwcNetCheckState.work->bodyWayport) {
        cb(sStr_FREE_DWCnetcheckBodyWayport, gDwcNetCheckState.work->bodyWayport, 0);
        gDwcNetCheckState.work->bodyWayport = 0;
    }
    cb(sStr_FREE_DWCnetcheck, gDwcNetCheckState.work, 0);
    gDwcNetCheckState.work = 0;
}

void DWCi_NetCheck_Abort(void) {
    if (!gDwcNetCheckState.work) {
        return;
    }
    if (gDwcNetCheckState.http) {
        DWCi_Http_Abort(gDwcNetCheckState.http);
    }
    DWCi_Auth_Abort();
    if (gDwcNetCheckState.work->thread.id) {
        OS_JoinThread(&gDwcNetCheckState.work->thread);
    }
    gDwcNetCheckState.work->error = -7;
}

int DWCi_NetCheck_GetState(void) {
    int r;
    OS_LockMutex(&gDwcNetCheckState.work->mutex);
    r = gDwcNetCheckState.work->state;
    OS_UnlockMutex(&gDwcNetCheckState.work->mutex);
    return r;
}

int DWCi_NetCheck_GetError(void) {
    return gDwcNetCheckState.work->error;
}

void DWCi_NetCheck_StartThread(void) {
    if (gDwcNetCheckState.work->thread.id && !OS_IsThreadTerminated(&gDwcNetCheckState.work->thread)) {
        return;
    }
    OS_CreateThread(&gDwcNetCheckState.work->thread, DWCi_NetCheck_Thread, gDwcNetCheckState.work, gDwcNetCheckState.work->threadStack + 0x1000, 0x1000, 16);
    OS_WakeupThreadDirect(&gDwcNetCheckState.work->thread);
}

// Connection test thread: GETs the test page; a 302 means a hotspot login page, which is answered
// through the auth server ("HotSpotResponse"/"parse"), then the hotspot's own login is posted.
void DWCi_NetCheck_Thread(void *arg) {
    char *response;
    int status;
    char number[4];
    AuthWiFiInfo wifi;
    AuthResult result;
    AuthFields auth;
    NasAllocFunc allocFunc = gDwcNetCheckState.work->callbacks.alloc;
    NasFreeFunc freeFunc = gDwcNetCheckState.work->callbacks.free;
    char *url = NULL;
    char *post = NULL;
    char *wait = NULL;
    int urlLen, postLen, waitLen;
    int n;
    int waitMs;
    char *copy;
    char *str;

    while (TRUE) {
        gDwcNetCheckState.httpParams.url = gDwcConnTestUrl;
        gDwcNetCheckState.httpParams.method = 1;
        gDwcNetCheckState.httpParams.bufferSize = 0x1000;
        gDwcNetCheckState.httpParams.alloc = allocFunc;
        gDwcNetCheckState.httpParams.free = freeFunc;
        gDwcNetCheckState.httpParams.timeout = 20000;
        gDwcNetCheckState.work->error = -2;
        if (DWCi_Http_Create(gDwcNetCheckState.http, &ov00_0221A6D0)) {
            DWCi_Http_Destroy(gDwcNetCheckState.http);
            DWCi_NetCheck_SetState(1);
            goto done;
        }
        if (DWCi_Http_FinishHeader(gDwcNetCheckState.http)) {
            DWCi_Http_Destroy(gDwcNetCheckState.http);
            DWCi_NetCheck_SetState(1);
            goto done;
        }
        DWCi_Http_StartThread(gDwcNetCheckState.http, OS_GetThreadPriority(OSi_ThreadInfo.current) - 1);
        if (gDwcNetCheckState.http->thread.id != 0) {
            OS_JoinThread(&gDwcNetCheckState.http->thread);
        }
        switch (gDwcNetCheckState.http->result) {
        case 2:
            gDwcNetCheckState.work->error = -1;
        default:
            DWCi_Http_Destroy(gDwcNetCheckState.http);
            DWCi_NetCheck_SetState(3);
            goto done;
        case 8:
            break;
        }
        if (DWCi_Http_ParseResponse(gDwcNetCheckState.http, 0) != 1) {
            DWCi_Http_Destroy(gDwcNetCheckState.http);
            DWCi_NetCheck_SetState(2);
            goto done;
        }
        status = atol(DWCi_Http_GetEntry(gDwcNetCheckState.http, sStr_httpresult_3));
        if (errno == 34) {
            DWCi_NetCheck_SetState(2);
            goto done;
        }
        switch (status) {
        case 200:
            gDwcNetCheckState.ip = gDwcNetCheckState.http->ip;
            break;
        case 302:
            gDwcNetCheckState.redirected = 1;
            if (gDwcNetCheckState.work->bodyWayport != NULL) {
                gDwcNetCheckState.work->error = -6;
                DWCi_Http_Destroy(gDwcNetCheckState.http);
                gDwcNetCheckState.httpParams.url = ov00_02216420.url;
                gDwcNetCheckState.httpParams.method = 0;
                gDwcNetCheckState.httpParams.bufferSize = 0x200;
                gDwcNetCheckState.httpParams.alloc = allocFunc;
                gDwcNetCheckState.httpParams.free = freeFunc;
                gDwcNetCheckState.httpParams.timeout = 20000;
                if (strcmp(gDwcNetCheckState.httpParams.url, sStr_HttpsNasNintendowifiNetAc_2) != 0) {
                    gDwcNetCheckState.httpParams.testServer = 1;
                }
                if (DWCi_Http_Create(gDwcNetCheckState.http, &ov00_0221A6D0)) {
                    DWCi_Http_Destroy(gDwcNetCheckState.http);
                    DWCi_NetCheck_SetState(1);
                    goto done;
                }
                if (!DWCi_Auth_FormatFieldsFromBM(&auth) || !DWCi_Auth_AddCommonPostFields(gDwcNetCheckState.http, &auth, 1)) {
                    DWCi_Http_Destroy(gDwcNetCheckState.http);
                    DWCi_NetCheck_SetState(8);
                    goto done;
                }
                if (DWCi_Http_AddPostItem(gDwcNetCheckState.http, sStr_action_2, sStr_message, 7)
                    || (str = gDwcNetCheckState.work->bodyWayport, DWCi_Http_AddPostItem(gDwcNetCheckState.http, sStr_HotSpotResponse, str, strlen(str)))) {
                    DWCi_Http_Destroy(gDwcNetCheckState.http);
                    DWCi_NetCheck_SetState(8);
                    goto done;
                }
                freeFunc(sStr_FREE_DWCnetcheckBodyWayport, gDwcNetCheckState.work->bodyWayport, 0);
                gDwcNetCheckState.work->bodyWayport = NULL;
                if (DWCi_Http_FinishHeader(gDwcNetCheckState.http)) {
                    DWCi_Http_Destroy(gDwcNetCheckState.http);
                    DWCi_NetCheck_SetState(1);
                    goto done;
                }
                DWCi_Http_StartThread(gDwcNetCheckState.http, OS_GetThreadPriority(OSi_ThreadInfo.current) - 1);
                if (gDwcNetCheckState.http->thread.id != 0) {
                    OS_JoinThread(&gDwcNetCheckState.http->thread);
                }
                switch (gDwcNetCheckState.http->result) {
                case 2:
                    gDwcNetCheckState.work->error = -1;
                default:
                    DWCi_Http_Destroy(gDwcNetCheckState.http);
                    DWCi_NetCheck_SetState(3);
                    goto done;
                case 8:
                    DWCi_Http_Destroy(gDwcNetCheckState.http);
                    DWCi_NetCheck_SetState(7);
                    goto done;
                }
            } else {
                response = gDwcNetCheckState.http->response.buffer;
                if (response == NULL) {
                    DWCi_Http_Destroy(gDwcNetCheckState.http);
                    DWCi_NetCheck_SetState(2);
                    goto done;
                }
                gDwcNetCheckState.work->body302 = allocFunc(sStr_ALLOC_DWCnetcheckBody302, strlen(response) + 1);
                copy = gDwcNetCheckState.work->body302;
                if (copy == NULL) {
                    DWCi_Http_Destroy(gDwcNetCheckState.http);
                    DWCi_NetCheck_SetState(4);
                    goto done;
                }
                strncpy(copy, response, strlen(response) + 1);
            }
            break;
        default:
            DWCi_Http_Destroy(gDwcNetCheckState.http);
            DWCi_NetCheck_SetState(10);
            goto done;
        }
        DWCi_Http_Destroy(gDwcNetCheckState.http);
        DWCi_BM_GetWiFiInfo(&wifi);
        if (wifi.userId == 0) {
            gDwcNetCheckState.work->error = -3;
            gDwcNetCheckState.authParams.ingamesn[0] = 0;
            gDwcNetCheckState.authParams.gsbrcd[0] = 0;
            gDwcNetCheckState.authParams.alloc = gDwcNetCheckState.work->callbacks.alloc;
            gDwcNetCheckState.authParams.free = gDwcNetCheckState.work->callbacks.free;
            if (DWCi_Auth_Start(&ov00_0221A6EC, gDwcNetCheckState.http)) {
                DWCi_NetCheck_SetState(5);
                goto done;
            }
            DWCi_Auth_Join();
            if (DWCi_Auth_GetState() != 21) {
                if (DWCi_Auth_GetState() == 9) {
                    gDwcNetCheckState.work->error = -1;
                } else {
                    DWCi_Auth_GetResult(&result);
                    if (gDwcNetCheckState.mode == 1 && (result.error == -23302 || DWCi_Auth_GetState() == 11)) {
                        gDwcNetCheckState.work->error = 0;
                        DWCi_Auth_Destroy();
                        DWCi_NetCheck_SetState(11);
                        goto done;
                    }
                    gDwcNetCheckState.work->error = result.error;
                }
                DWCi_Auth_Destroy();
                DWCi_NetCheck_SetState(6);
                goto done;
            }
            DWCi_Auth_Destroy();
        }
        if (status == 200) {
            gDwcNetCheckState.work->error = 0;
            DWCi_NetCheck_SetState(11);
            goto done;
        }
        gDwcNetCheckState.work->error = -4;
        gDwcNetCheckState.httpParams.url = ov00_02216420.url;
        gDwcNetCheckState.httpParams.method = 0;
        gDwcNetCheckState.httpParams.bufferSize = 0x1000;
        gDwcNetCheckState.httpParams.alloc = allocFunc;
        gDwcNetCheckState.httpParams.free = freeFunc;
        gDwcNetCheckState.httpParams.timeout = 40000;
        if (strcmp(gDwcNetCheckState.httpParams.url, sStr_HttpsNasNintendowifiNetAc_2) != 0) {
            gDwcNetCheckState.httpParams.testServer = 1;
        }
        if (DWCi_Http_Create(gDwcNetCheckState.http, &ov00_0221A6D0)) {
            DWCi_Http_Destroy(gDwcNetCheckState.http);
            DWCi_NetCheck_SetState(1);
            goto done;
        }
        if (!DWCi_Auth_FormatFieldsFromBM(&auth) || !DWCi_Auth_AddCommonPostFields(gDwcNetCheckState.http, &auth, 1)) {
            DWCi_Http_Destroy(gDwcNetCheckState.http);
            DWCi_NetCheck_SetState(8);
            goto done;
        }
        if (DWCi_Http_AddPostItem(gDwcNetCheckState.http, sStr_action_2, sStr_parse, 5)
            || (str = gDwcNetCheckState.work->body302, DWCi_Http_AddPostItem(gDwcNetCheckState.http, sStr_HTML, str, strlen(str)))) {
            DWCi_Http_Destroy(gDwcNetCheckState.http);
            DWCi_NetCheck_SetState(8);
            goto done;
        }
        freeFunc(sStr_FREE_DWCnetcheckBody302, gDwcNetCheckState.work->body302, 0);
        gDwcNetCheckState.work->body302 = NULL;
        if (DWCi_Http_FinishHeader(gDwcNetCheckState.http)) {
            DWCi_Http_Destroy(gDwcNetCheckState.http);
            DWCi_NetCheck_SetState(1);
            goto done;
        }
        DWCi_Http_StartThread(gDwcNetCheckState.http, OS_GetThreadPriority(OSi_ThreadInfo.current) - 1);
        if (gDwcNetCheckState.http->thread.id != 0) {
            OS_JoinThread(&gDwcNetCheckState.http->thread);
        }
        switch (gDwcNetCheckState.http->result) {
        case 3:
            DWCi_Http_Destroy(gDwcNetCheckState.http);
            if (gDwcNetCheckState.mode == 1) {
                gDwcNetCheckState.work->error = 0;
                DWCi_NetCheck_SetState(11);
            } else {
                DWCi_NetCheck_SetState(3);
            }
            goto done;
        case 2:
            gDwcNetCheckState.work->error = -1;
        default:
            DWCi_Http_Destroy(gDwcNetCheckState.http);
            DWCi_NetCheck_SetState(3);
            goto done;
        case 8:
            break;
        }
        if (DWCi_Http_ParseResponse(gDwcNetCheckState.http, 0) != 1) {
            DWCi_Http_Destroy(gDwcNetCheckState.http);
            DWCi_NetCheck_SetState(2);
            goto done;
        }
        status = atol(DWCi_Http_GetEntry(gDwcNetCheckState.http, sStr_httpresult_3));
        if (errno == 34) {
            DWCi_Http_Destroy(gDwcNetCheckState.http);
            DWCi_NetCheck_SetState(2);
            goto done;
        }
        if (status != 200) {
            DWCi_Http_Destroy(gDwcNetCheckState.http);
            if (gDwcNetCheckState.mode == 1 && status == 302) {
                gDwcNetCheckState.work->error = 0;
                DWCi_NetCheck_SetState(11);
            } else {
                DWCi_NetCheck_SetState(2);
            }
            goto done;
        }
        if ((int)DWCi_Http_GetBase64Entry(gDwcNetCheckState.http, sStr_returncd_2, number, 4) <= 0) {
            DWCi_Http_Destroy(gDwcNetCheckState.http);
            DWCi_NetCheck_SetState(9);
            goto done;
        }
        n = atol(number);
        if (errno == 34) {
            DWCi_Http_Destroy(gDwcNetCheckState.http);
            DWCi_NetCheck_SetState(9);
            goto done;
        }
        if (gDwcNetCheckState.mode == 1 && n == 114) {
            gDwcNetCheckState.work->error = 0;
            DWCi_NetCheck_SetState(11);
            goto done;
        }
        if (n >= 100) {
            DWCi_Http_Destroy(gDwcNetCheckState.http);
            DWCi_NetCheck_SetState(6);
            goto done;
        }
        urlLen = DWCi_Http_GetBase64Entry(gDwcNetCheckState.http, sStr_url, NULL, 0);
        if (urlLen <= 0) {
            DWCi_Http_Destroy(gDwcNetCheckState.http);
            DWCi_NetCheck_SetState(9);
            goto done;
        }
        postLen = DWCi_Http_GetBase64Entry(gDwcNetCheckState.http, sStr_data, NULL, 0);
        if (postLen <= 0) {
            DWCi_Http_Destroy(gDwcNetCheckState.http);
            DWCi_NetCheck_SetState(9);
            goto done;
        }
        waitLen = DWCi_Http_GetBase64Entry(gDwcNetCheckState.http, sStr_wait, NULL, 0);
        url = allocFunc(sStr_ALLOC_Url, urlLen + 1);
        if (url == NULL) {
            DWCi_Http_Destroy(gDwcNetCheckState.http);
            DWCi_NetCheck_SetState(4);
            goto done;
        }
        post = allocFunc(sStr_ALLOC_DataLen, postLen + 1);
        if (post == NULL) {
            DWCi_Http_Destroy(gDwcNetCheckState.http);
            DWCi_NetCheck_SetState(4);
            goto done;
        }
        if (waitLen > 0) {
            wait = allocFunc(sStr_ALLOC_WaitLen, waitLen + 1);
            if (wait == NULL) {
                DWCi_Http_Destroy(gDwcNetCheckState.http);
                DWCi_NetCheck_SetState(4);
                goto done;
            }
        }
        n = DWCi_Http_GetBase64Entry(gDwcNetCheckState.http, sStr_url, url, urlLen + 1);
        if (n < 0) {
            DWCi_Http_Destroy(gDwcNetCheckState.http);
            DWCi_NetCheck_SetState(9);
            goto done;
        }
        url[n] = 0;
        n = DWCi_Http_GetBase64Entry(gDwcNetCheckState.http, sStr_data, post, postLen + 1);
        if (n < 0) {
            DWCi_Http_Destroy(gDwcNetCheckState.http);
            DWCi_NetCheck_SetState(9);
            goto done;
        }
        post[n] = 0;
        waitMs = 0;
        if (waitLen > 0) {
            n = DWCi_Http_GetBase64Entry(gDwcNetCheckState.http, sStr_wait, wait, waitLen + 1);
            if (n < 0) {
                DWCi_Http_Destroy(gDwcNetCheckState.http);
                DWCi_NetCheck_SetState(9);
                goto done;
            }
            wait[n] = 0;
            n = atol(wait);
            if (errno == 34) {
                DWCi_Http_Destroy(gDwcNetCheckState.http);
                DWCi_NetCheck_SetState(9);
                goto done;
            }
            waitMs = n * 1000;
            if (waitMs > 180000) {
                waitMs = 180000;
            }
        }
        DWCi_Http_Destroy(gDwcNetCheckState.http);
        gDwcNetCheckState.work->error = -5;
        gDwcNetCheckState.httpParams.url = url;
        gDwcNetCheckState.httpParams.method = 0;
        gDwcNetCheckState.httpParams.bufferSize = 0x1000;
        gDwcNetCheckState.httpParams.alloc = allocFunc;
        gDwcNetCheckState.httpParams.free = freeFunc;
        gDwcNetCheckState.httpParams.timeout = 120000;
        if (DWCi_Http_Create(gDwcNetCheckState.http, &ov00_0221A6D0)) {
            DWCi_Http_Destroy(gDwcNetCheckState.http);
            DWCi_NetCheck_SetState(1);
            goto done;
        }
        if (DWCi_Http_AddString(gDwcNetCheckState.http, post)) {
            DWCi_Http_Destroy(gDwcNetCheckState.http);
            DWCi_NetCheck_SetState(8);
            goto done;
        }
        if (DWCi_Http_FinishHeader(gDwcNetCheckState.http)) {
            DWCi_Http_Destroy(gDwcNetCheckState.http);
            DWCi_NetCheck_SetState(1);
            goto done;
        }
        DWCi_Http_StartThread(gDwcNetCheckState.http, OS_GetThreadPriority(OSi_ThreadInfo.current) - 1);
        if (gDwcNetCheckState.http->thread.id != 0) {
            OS_JoinThread(&gDwcNetCheckState.http->thread);
        }
        switch (gDwcNetCheckState.http->result) {
        case 2:
            gDwcNetCheckState.work->error = -1;
        default:
            DWCi_Http_Destroy(gDwcNetCheckState.http);
            DWCi_NetCheck_SetState(3);
            goto done;
        case 8:
            break;
        }
        if (DWCi_Http_ParseResponse(gDwcNetCheckState.http, 1) != 1) {
            DWCi_Http_Destroy(gDwcNetCheckState.http);
            DWCi_NetCheck_SetState(2);
            goto done;
        }
        response = gDwcNetCheckState.http->response.buffer;
        if (response == NULL) {
            DWCi_Http_Destroy(gDwcNetCheckState.http);
            DWCi_NetCheck_SetState(2);
            goto done;
        }
        gDwcNetCheckState.work->bodyWayport = allocFunc(sStr_ALLOC_DWCnetcheckBodyWayport, strlen(response) + 1);
        copy = gDwcNetCheckState.work->bodyWayport;
        if (copy == NULL) {
            DWCi_Http_Destroy(gDwcNetCheckState.http);
            DWCi_NetCheck_SetState(4);
            goto done;
        }
        strncpy(copy, response, strlen(response) + 1);
        DWCi_Http_Destroy(gDwcNetCheckState.http);
        OS_Sleep(waitMs);
    }
done:
    if (url != NULL) {
        freeFunc(sStr_FREE_Url, url, 0);
    }
    if (post != NULL) {
        freeFunc(sStr_FREE_Data, post, 0);
    }
    if (wait != NULL) {
        freeFunc(sStr_FREE_Wait, wait, 0);
    }
}

void DWCi_NetCheck_SetState(int state) {
    OS_LockMutex(&gDwcNetCheckState.work->mutex);
    gDwcNetCheckState.work->state = state;
    OS_UnlockMutex(&gDwcNetCheckState.work->mutex);
}

// Reads the server's "Date" header ("Fri, 03 Mar 2006 01:28:13 GMT") and stores the RTC offset.
int DWCi_ParseServerDate(char *s) {
    RTCDate date;
    RTCTime time;
    char buf[32];
    s64 now, then;
    int i;
    int n = strlen(s);
    if (n != (int)strlen(sStr_Fri03_Mar2006_01_28_13_GMT) || s[7] != 32 || s[11] != 32 || s[16] != 32 || s[19] != 58 || s[22] != 58 || s[25] != 32) {
        goto fail;
    }
    if (RTC_GetDateTime(&date, &time) != 0) {
        goto fail;
    }
    now = RTC_ConvertDateTimeToSecond(&date, &time);
    if (now == -1) {
        goto fail;
    }
    strcpy(buf, s);
    buf[7] = 0;
    buf[11] = 0;
    buf[16] = 0;
    buf[19] = 0;
    buf[22] = 0;
    buf[25] = 0;
    errno = 0;
    date.year = atol(buf + 12);
    if (errno == 34) {
        goto fail;
    }
    date.year -= 2000;
    date.month = 13;
    for (i = 0; i < 12; i++) {
        if (!strcmp(gDwcMonthNames[i], buf + 8)) {
            date.month = i + 1;
            break;
        }
    }
    if (date.month > 12) {
        goto fail;
    }
    errno = 0;
    date.day = atol(buf + 5);
    if (errno == 34) {
        goto fail;
    }
    errno = 0;
    time.hour = atol(buf + 17);
    if (errno == 34) {
        goto fail;
    }
    errno = 0;
    time.minute = atol(buf + 20);
    if (errno == 34) {
        goto fail;
    }
    errno = 0;
    time.second = atol(buf + 23);
    if (errno == 34) {
        goto fail;
    }
    then = RTC_ConvertDateTimeToSecond(&date, &time);
    if (then == -1) {
        goto fail;
    }
    *(s64 *)(gDwcServerTime + 12) = now - then;
    *(s64 *)(gDwcServerTime + 4) = now;
    *(int *)gDwcServerTime = 1;
    return 1;
fail:
    return 0;
}

// Service locator ("SVCLOC"): work block "intwork".
int DWCi_Svl_Init(NasAllocFunc alloc, NasFreeFunc free) {
    if (gDwcSvcLocWork) {
        DWCi_SetError(9, -24100);
        return 0;
    }
    gDwcSvcLocWork = alloc(sStr_ALLOC_Intwork, 0x1c20);
    if (!gDwcSvcLocWork) {
        DWCi_SetError(9, -24100);
        return 0;
    }
    MI_CpuFill8(gDwcSvcLocWork, 0, 0x1c20);
    gDwcSvcLocWork->alloc = alloc;
    gDwcSvcLocWork->free = free;
    return 1;
}

void DWCi_Svl_Cleanup(void) {
    if (!gDwcSvcLocWork) {
        return;
    }
    DWCi_Http_Destroy(&gDwcSvcLocWork->http);
    gDwcSvcLocWork->free(sStr_FREE_Intwork, gDwcSvcLocWork, 0);
    gDwcSvcLocWork = 0;
}

// Starts a service locator request for service svc (4 characters).
int DWCi_Svl_GetTokenAsync(const char *svc, SvcLocResult *output) {
    AuthFields auth;
    NasHttpParams param;
    register SvcLocWork *work;
    gDwcSvcLocWork->output = output;
    MI_CpuFill8(output, 0, 0x174);
    if (gDwcSvcLocWork->http.thread.id && !OS_IsThreadTerminated(&gDwcSvcLocWork->http.thread)) {
        OS_Terminate();
    }
    param.url = ov00_02216420.url;
    param.method = 0;
    param.bufferSize = 0x1000;
    work = gDwcSvcLocWork;
    param.alloc = work->alloc;
    param.free = work->free;
    if (strcmp(param.url, sStr_HttpsNasNintendowifiNetAc_3) != 0) {
        param.testServer = 1;
    } else {
        param.testServer = 0;
    }
    param.timeout = 20000;
    if (DWCi_Http_Create(&work->http, &param)) {
        DWCi_SetError(9, -24100);
        return 0;
    }
    if (!DWCi_Auth_FormatFieldsFromBM(&auth) || !DWCi_Auth_AddCommonPostFields(&gDwcSvcLocWork->http, &auth, 0)) {
        DWCi_Http_Destroy(&gDwcSvcLocWork->http);
        DWCi_SetError(9, -24100);
        return 0;
    }
    if (DWCi_Http_AddPostItem(&gDwcSvcLocWork->http, sStr_action_3, sStr_SVCLOC, 6) || DWCi_Http_AddPostItem(&gDwcSvcLocWork->http, sStr_svc, svc, 4)) {
        DWCi_Http_Destroy(&gDwcSvcLocWork->http);
        DWCi_SetError(9, -24100);
        return 0;
    }
    if (DWCi_Http_FinishHeader(&gDwcSvcLocWork->http)) {
        DWCi_Http_Destroy(&gDwcSvcLocWork->http);
        DWCi_SetError(9, -24100);
        return 0;
    }
    DWCi_Http_StartThread(&gDwcSvcLocWork->http, OS_GetThreadPriority(OS_GetCurrentThread()) - 1);
    if (gDwcSvcLocWork->http.thread.id) {
        return 1;
    }
    DWCi_Http_Destroy(&gDwcSvcLocWork->http);
    DWCi_SetError(9, -24100);
    return 0;
}

// 0: no request, 1: idle, 2: running, 3: done, 4: failed, 5: cancelled.
int DWCi_Svl_Process(void) {
    if (!gDwcSvcLocWork) {
        return 0;
    }
    if (!gDwcSvcLocWork->http.thread.id) {
        return 1;
    }
    if (OS_IsThreadTerminated(&gDwcSvcLocWork->http.thread) == 1) {
        switch (gDwcSvcLocWork->http.result) {
        case 8:
            if (!DWCi_Svl_ReadResponse()) {
                DWCi_Http_Destroy(&gDwcSvcLocWork->http);
                return 4;
            }
            DWCi_Http_Destroy(&gDwcSvcLocWork->http);
            return 3;
        case 7:
            DWCi_Http_Destroy(&gDwcSvcLocWork->http);
            return 5;
        default:
            DWCi_Http_Destroy(&gDwcSvcLocWork->http);
            DWCi_SetError(17, -24101);
            return 4;
        }
    }
    return 2;
}

int DWCi_Svl_ReadResponse(void) {
    SvcLocWork *p = gDwcSvcLocWork;
    char b[4];
    char *v;
    int n;
    if (!DWCi_Http_ParseResponse(&p->http, 0)) {
        DWCi_SetError(16, -25101);
        return 0;
    }
    v = DWCi_Http_GetEntry(&p->http, sStr_Date_2);
    if (v) {
        DWCi_ParseServerDate(v);
    }
    v = DWCi_Http_GetEntry(&p->http, sStr_httpresult_4);
    if (!v) {
        DWCi_SetError(16, -25101);
        return 0;
    }
    n = atol(v);
    if (errno == 34) {
        DWCi_SetError(16, -25101);
        return 0;
    }
    if (n != 200) {
        DWCi_SetError(16, -25000 - n);
        return 0;
    }
    if ((int)DWCi_Http_GetBase64Entry(&p->http, sStr_returncd_3, b, 4) <= 0) {
        DWCi_SetError(16, -25101);
        return 0;
    }
    n = atol(b);
    if (errno == 34) {
        DWCi_SetError(16, -25101);
        return 0;
    }
    if (n >= 100) {
        DWCi_SetError(16, -24000 - n);
        return 0;
    }
    DWCi_Http_GetBase64Entry(&p->http, sStr_svchost, gDwcSvcLocWork->output->svchost, 64);
    DWCi_Http_GetBase64Entry(&p->http, sStr_servicetoken, gDwcSvcLocWork->output->servicetoken, 300);
    DWCi_Http_GetBase64Entry(&p->http, sStr_statusdata, b, 1);
    if (b[0] == 'Y') {
        gDwcSvcLocWork->output->statusdata = 1;
    } else {
        gDwcSvcLocWork->output->statusdata = 0;
    }
    return 1;
}
