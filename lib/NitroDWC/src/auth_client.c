#include <string.h>

#include "global.h"

#include "dwc/auth_internal.h"
#include "dwc/net_common_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

#pragma force_active on

extern char ov00_0221A69C[];
extern AuthWiFiInfo ov00_0221A6A0;
extern char sStr_HttpsNasTestNintendowifiNetAc[];
extern char sStr_ALLOC_DWCauth[];
extern char sStr_FREE_DWCauth[];
extern char sStr_HttpsNasNintendowifiNetAc[];

extern void DWCi_BM_GetWiFiInfo(AuthWiFiInfo *info);

void DWCi_Auth_SetServerUrl(const char *url) {
    ov00_02216420.url = url;
}

int DWCi_Auth_Start(AuthParams *params, NasHttp *request) {
    AuthWork *work;
    NasAllocFunc alloc = params->alloc;
    if (gDwcAuthState.work) {
        return 2;
    }
    gDwcAuthState.work = alloc(sStr_ALLOC_DWCauth, 0x13F4);
    if (!gDwcAuthState.work) {
        return 2;
    }
    MI_CpuFill8(gDwcAuthState.work, 0, 0x13F4);
    gDwcAuthState.work->request = request;
    gDwcAuthState.state = 0;
    MI_CpuFill8(&gDwcAuthState.work->response, 0, 0x1C4);
    gDwcAuthState.work->response.error = 20100;
    work = gDwcAuthState.work;
    work->params = *params;
    work->params.ingamesn[25] = 0;
    gDwcAuthState.work->params.gsbrcd[11] = 0;
    gDwcAuthState.work->result = DWCi_Auth_SendRequest(1);
    if (gDwcAuthState.work->result) {
        return gDwcAuthState.work->result;
    }
    gDwcAuthState.mode = 0;
    DWCi_Auth_StartThread();
    return 0;
}

void DWCi_Auth_StartThread(void) {
    AuthWork *work;
    OS_InitMutex(&gDwcAuthState.work->mutex);
    gDwcAuthState.work->cancelled = 0;
    work = gDwcAuthState.work;
    if (work->thread.id && !OS_IsThreadTerminated(&work->thread)) {
        return;
    }
    work = gDwcAuthState.work;
    OS_CreateThread(&work->thread, DWCi_Auth_Thread, ov00_0221A69C, work->threadStack + 0x1000, 0x1000, 16);
    OS_WakeupThreadDirect(&gDwcAuthState.work->thread);
}

void DWCi_Auth_Abort(void) {
    AuthWork *work;
    if (!gDwcAuthState.work) {
        return;
    }
    OS_LockMutex(&gDwcAuthState.work->mutex);
    gDwcAuthState.work->cancelled = 1;
    OS_UnlockMutex(&gDwcAuthState.work->mutex);
    if (gDwcAuthState.work->request) {
        DWCi_Http_Abort(gDwcAuthState.work->request);
    }
    work = gDwcAuthState.work;
    if (work->thread.id) {
        OS_JoinThread(&work->thread);
    }
}

void DWCi_Auth_Destroy(void) {
    AuthWork *work = gDwcAuthState.work;
    NasFreeFunc free;
    if (!work) {
        return;
    }
    free = work->params.free;
    if (work->request) {
        DWCi_Http_Destroy(work->request);
    }
    free(sStr_FREE_DWCauth, gDwcAuthState.work, 0);
    gDwcAuthState.work = NULL;
}

void DWCi_Auth_Join(void) {
    AuthWork *work = gDwcAuthState.work;
    if (work->thread.id) {
        OS_JoinThread(&work->thread);
    }
}

int DWCi_Auth_GetState(void) {
    AuthWork *work;
    int result;
    if (!gDwcAuthState.work) {
        return 22;
    }
    OS_LockMutex(&gDwcAuthState.work->mutex);
    work = gDwcAuthState.work;
    result = work->result;
    OS_UnlockMutex(&work->mutex);
    return result;
}

// Copies the response; result codes outside 20000-29999 become 20998, codes from 20100 on are negated.
void DWCi_Auth_GetResult(AuthResult *out) {
    int code;
    if (!gDwcAuthState.work) {
        MI_CpuFill8(out, 0, 0x1c4);
    }
    MI_CpuCopy8(&gDwcAuthState.work->response, out, 0x1c4);
    code = out->error;
    if (code < 20000 || code >= 30000) {
        out->error = 20998;
    }
    code = out->error;
    if (code >= 20100) {
        out->error = -code;
    }
}

NasHttpParams ov00_02216420 = { sStr_HttpsNasTestNintendowifiNetAc, 0, 0x1000, NULL, NULL, 0, 20000 };

int DWCi_Auth_SendRequest(int mode) {
    if (strcmp(ov00_02216420.url, sStr_HttpsNasNintendowifiNetAc) != 0) {
        ov00_02216420.testServer = 1;
    }
    ov00_02216420.alloc = gDwcAuthState.work->params.alloc;
    ov00_02216420.free = gDwcAuthState.work->params.free;
    if (DWCi_Http_Create(gDwcAuthState.work->request, &ov00_02216420) != 0) {
        return 4;
    }
    if (mode == 1) {
        DWCi_BM_GetWiFiInfo(&ov00_0221A6A0);
    }
    gDwcAuthState.work->result = DWCi_Auth_AddPostFields(gDwcAuthState.work->request, gDwcAuthState.work->params.gsbrcd, gDwcAuthState.work->params.ingamesn);
    if (gDwcAuthState.work->result != 0) {
        return 4;
    }
    if (DWCi_Http_FinishHeader(gDwcAuthState.work->request) != 0) {
        return 4;
    }
    DWCi_Http_StartThread(gDwcAuthState.work->request, OS_GetThreadPriority(OSi_ThreadInfo.current) - 1);
    return 0;
}
