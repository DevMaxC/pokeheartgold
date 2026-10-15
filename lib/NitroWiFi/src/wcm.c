#include "nitrowifi/wcm_internal.h"

// WCM API: initialisation on the caller's work area and the asynchronous start-up, search, connect,
// disconnect, clean-up and terminate requests.

#pragma force_active on

int WCM_Init(WcmWork *work, u32 size) {
    OSIntrMode enabled = OS_DisableInterrupts();
    if (gWcmWork) {
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_FAILURE;
    }
    if (!work) {
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_FAILURE;
    }
    if ((u32)work & 31) {
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_FAILURE;
    }
    if (size < sizeof(WcmWork)) {
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_NOT_ENOUGH_MEM;
    }
    gWcmWork = work;
    work->phase = WCM_PHASE_WAIT;
    gWcmWork->notify = WCM_NOTIFY_COMMON;
    gWcmWork->scanPeriod = 0;
    gWcmWork->apListLocked = 0;
    gWcmWork->resetting = 0;
    gWcmWork->aid = 0;
    gWcmWork->reason = 0;
    WcmInitOption();
    WCMi_InitCpsif();
    if (!OS_IsTickAvailable()) {
        OS_InitTick();
    }
    if (!OS_IsAlarmAvailable()) {
        OS_InitAlarm();
    }
    OS_CreateAlarm(&gWcmWork->keepAliveAlarm);
    OS_RestoreInterrupts(enabled);
    return WCM_RESULT_SUCCESS;
}

int WCM_Finish(void) {
    OSIntrMode enabled = OS_DisableInterrupts();
    if (!gWcmWork) {
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_FAILURE;
    }
    if (gWcmWork->phase != WCM_PHASE_WAIT) {
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_FAILURE;
    }
    gWcmWork = NULL;
    OS_RestoreInterrupts(enabled);
    return WCM_RESULT_SUCCESS;
}

int WCM_StartupAsync(WcmConfig *config, WcmCallback callback) {
    OSIntrMode enabled = OS_DisableInterrupts();
    if (!gWcmWork) {
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_FAILURE;
    }
    switch (gWcmWork->phase) {
    case WCM_PHASE_WAIT:
        WcmConfigure(config, callback);
        break;
    case WCM_PHASE_WAIT_TO_IDLE:
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_PROGRESS;
    case WCM_PHASE_IDLE:
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_SUCCESS;
    default:
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_FAILURE;
    }
    switch (WM_Init(gWcmWork->wmWork, (u16)gWcmWork->dmaNo)) {
    case WM_ERRCODE_SUCCESS:
        break;
    case WM_ERRCODE_ILLEGAL_STATE:
        WcmSetPhase(WCM_PHASE_FATAL_ERROR);
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_FATAL_ERROR;
    case WM_ERRCODE_WM_DISABLE:
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_WMDISABLE;
    case WM_ERRCODE_FAILED:
    case WM_ERRCODE_OPERATING:
    case 5:
    case WM_ERRCODE_INVALID_PARAM:
    default:
        WcmSetPhase(WCM_PHASE_FATAL_ERROR);
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_FATAL_ERROR;
    }
    if (WM_GetAllowedChannel() == WM_ERRCODE_SUCCESS) {
        if (WM_Finish() != WM_ERRCODE_SUCCESS) {
            WcmSetPhase(WCM_PHASE_FATAL_ERROR);
            OS_RestoreInterrupts(enabled);
            return WCM_RESULT_FATAL_ERROR;
        }
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_WMDISABLE;
    }
    if (WM_SetIndCallback((void (*)(void *))WcmWmcbIndication) != WM_ERRCODE_SUCCESS) {
        WcmSetPhase(WCM_PHASE_FATAL_ERROR);
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_FATAL_ERROR;
    }
    switch (WM_Enable((void (*)(void *))WcmWmcbCommon)) {
    case WM_ERRCODE_OPERATING:
        WcmSetPhase(WCM_PHASE_WAIT_TO_IDLE);
        gWcmWork->notify = WCM_NOTIFY_STARTUP;
        break;
    case WM_ERRCODE_FIFO_ERROR:
        WcmSetPhase(WCM_PHASE_IRREGULAR);
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_FAILURE;
    case WM_ERRCODE_ILLEGAL_STATE:
    default:
        WcmSetPhase(WCM_PHASE_FATAL_ERROR);
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_FATAL_ERROR;
    }
    OS_RestoreInterrupts(enabled);
    return WCM_RESULT_ACCEPT;
}

int WCM_CleanupAsync(void) {
    OSIntrMode enabled = OS_DisableInterrupts();
    if (!gWcmWork) {
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_FAILURE;
    }
    switch (gWcmWork->phase) {
    case WCM_PHASE_IDLE_TO_WAIT:
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_PROGRESS;
    case WCM_PHASE_WAIT:
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_SUCCESS;
    default:
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_FAILURE;
    case WCM_PHASE_IDLE:
        break;
    }
    switch (WM_PowerOff((void (*)(void *))WcmWmcbCommon)) {
    case WM_ERRCODE_OPERATING:
        WcmSetPhase(WCM_PHASE_IDLE_TO_WAIT);
        gWcmWork->notify = WCM_NOTIFY_CLEANUP;
        break;
    case WM_ERRCODE_FIFO_ERROR:
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_REJECT;
    case WM_ERRCODE_ILLEGAL_STATE:
    default:
        WcmSetPhase(WCM_PHASE_FATAL_ERROR);
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_FATAL_ERROR;
    }
    OS_RestoreInterrupts(enabled);
    return WCM_RESULT_ACCEPT;
}

// NULL filters end the search
int WCM_SearchAsync(const u8 *bssid, const u8 *ssid, u32 option) {
    if (!bssid || !ssid) {
        return WCM_EndSearchAsync();
    }
    return WCM_BeginSearchAsync(bssid, ssid, option);
}

int WCM_BeginSearchAsync(const u8 *bssid, const u8 *ssid, u32 option) {
    OSIntrMode enabled = OS_DisableInterrupts();
    if (!gWcmWork) {
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_FAILURE;
    }
    switch (gWcmWork->phase) {
    case WCM_PHASE_IDLE:
        break;
    case WCM_PHASE_IDLE_TO_SEARCH:
        WcmEditScanExParam(bssid, ssid, option);
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_PROGRESS;
    case WCM_PHASE_SEARCH:
        WcmEditScanExParam(bssid, ssid, option);
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_SUCCESS;
    default:
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_FAILURE;
    }
    WcmEditScanExParam(bssid, ssid, option);
    DC_InvalidateRange(gWcmWork->scanParam.buffer, gWcmWork->scanParam.bufferSize);
    gWcmWork->scanCount++;
    switch (WM_StartScanEx((void (*)(void *))WcmWmcbScanEx, &gWcmWork->scanParam)) {
    case WM_ERRCODE_OPERATING:
        WcmSetPhase(WCM_PHASE_IDLE_TO_SEARCH);
        gWcmWork->notify = WCM_NOTIFY_BEGIN_SEARCH;
        break;
    case WM_ERRCODE_FIFO_ERROR:
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_REJECT;
    case WM_ERRCODE_ILLEGAL_STATE:
    default:
        WcmSetPhase(WCM_PHASE_FATAL_ERROR);
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_FATAL_ERROR;
    }
    OS_RestoreInterrupts(enabled);
    return WCM_RESULT_ACCEPT;
}

int WCM_EndSearchAsync(void) {
    OSIntrMode enabled = OS_DisableInterrupts();
    if (!gWcmWork) {
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_FAILURE;
    }
    switch (gWcmWork->phase) {
    case WCM_PHASE_SEARCH:
        WcmSetPhase(WCM_PHASE_SEARCH_TO_IDLE);
        gWcmWork->notify = WCM_NOTIFY_END_SEARCH;
        break;
    case WCM_PHASE_SEARCH_TO_IDLE:
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_PROGRESS;
    case WCM_PHASE_IDLE:
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_SUCCESS;
    default:
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_FAILURE;
    }
    OS_RestoreInterrupts(enabled);
    return WCM_RESULT_ACCEPT;
}

int WCM_ConnectAsync(WcmBssDesc *ap, WcmWepKey *key, u32 option) {
    OSIntrMode enabled = OS_DisableInterrupts();
    if (!gWcmWork) {
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_FAILURE;
    }
    switch (gWcmWork->phase) {
    case WCM_PHASE_IDLE:
        if (!ap) {
            OS_RestoreInterrupts(enabled);
            return WCM_RESULT_FAILURE;
        }
        if (ap->gameInfoLength) {
            OS_RestoreInterrupts(enabled);
            return WCM_RESULT_FAILURE;
        }
        if (key) {
            if (key->mode >= 4 || key->keyId >= 4) {
                OS_RestoreInterrupts(enabled);
                return WCM_RESULT_FAILURE;
            }
            gWcmWork->wepMode = key->mode;
            gWcmWork->wepKeyId = key->keyId;
            if (gWcmWork->wepMode == 0) {
                MI_CpuFill8(gWcmWork->wepKey, 0, sizeof(gWcmWork->wepKey));
            } else {
                MI_CpuCopy8(key->key, gWcmWork->wepKey, sizeof(gWcmWork->wepKey));
            }
        } else {
            // key, mode and key id
            MI_CpuFill8(gWcmWork->wepKey, 0, 82);
        }
        MI_CpuCopy8(ap, &gWcmWork->ap, sizeof(WcmBssDesc));
        gWcmWork->ap.capability = gWcmWork->ap.unk_2E | 3;
        WCM_UpdateOption(option);
        break;
    case WCM_PHASE_IDLE_TO_DCF:
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_PROGRESS;
    case WCM_PHASE_DCF:
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_SUCCESS;
    default:
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_FAILURE;
    }
    switch (WM_SetLifeTime((void (*)(void *))WcmWmcbCommon, 0xFFFF, 80, 0xFFFF, 0xFFFF)) {
    case WM_ERRCODE_OPERATING:
        WcmSetPhase(WCM_PHASE_IDLE_TO_DCF);
        gWcmWork->notify = WCM_NOTIFY_CONNECT;
        break;
    case WM_ERRCODE_FIFO_ERROR:
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_REJECT;
    case WM_ERRCODE_ILLEGAL_STATE:
    default:
        WcmSetPhase(WCM_PHASE_FATAL_ERROR);
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_FATAL_ERROR;
    }
    OS_RestoreInterrupts(enabled);
    return WCM_RESULT_ACCEPT;
}

int WCM_DisconnectAsync(void) {
    OSIntrMode enabled = OS_DisableInterrupts();
    if (!gWcmWork) {
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_FAILURE;
    }
    switch (gWcmWork->phase) {
    case WCM_PHASE_DCF_TO_IDLE:
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_PROGRESS;
    case WCM_PHASE_IDLE:
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_SUCCESS;
    default:
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_FAILURE;
    case WCM_PHASE_DCF:
        break;
    }
    if (gWcmWork->resetting == 1) {
        WcmSetPhase(WCM_PHASE_DCF_TO_IDLE);
        gWcmWork->notify = WCM_NOTIFY_DISCONNECT;
    } else {
        switch (WM_EndDCF((void (*)(void *))WcmWmcbEndDCF)) {
        case WM_ERRCODE_OPERATING:
            WcmSetPhase(WCM_PHASE_DCF_TO_IDLE);
            gWcmWork->notify = WCM_NOTIFY_DISCONNECT;
            break;
        case WM_ERRCODE_FIFO_ERROR:
            OS_RestoreInterrupts(enabled);
            return WCM_RESULT_REJECT;
        case WM_ERRCODE_ILLEGAL_STATE:
        default:
            WcmSetPhase(WCM_PHASE_FATAL_ERROR);
            OS_RestoreInterrupts(enabled);
            return WCM_RESULT_FATAL_ERROR;
        }
    }
    OS_RestoreInterrupts(enabled);
    return WCM_RESULT_ACCEPT;
}

// Stops whatever WM is doing (by its state) and finishes it.
int WCM_TerminateAsync(void) {
    OSIntrMode enabled = OS_DisableInterrupts();
    int result;
    u16 *status;
    if (gWcmWork == NULL) {
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_FAILURE;
    }
    switch (gWcmWork->phase) {
    case WCM_PHASE_TERMINATING:
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_PROGRESS;
    case WCM_PHASE_WAIT:
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_SUCCESS;
    case WCM_PHASE_SEARCH:
        WcmSetPhase(WCM_PHASE_TERMINATING);
        gWcmWork->notify = WCM_NOTIFY_TERMINATE;
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_ACCEPT;
    case WCM_PHASE_IDLE:
    case WCM_PHASE_DCF:
    case WCM_PHASE_IRREGULAR:
        break;
    case WCM_PHASE_NULL:
    case WCM_PHASE_WAIT_TO_IDLE:
    case WCM_PHASE_IDLE_TO_WAIT:
    case WCM_PHASE_IDLE_TO_SEARCH:
    case WCM_PHASE_SEARCH_TO_IDLE:
    case WCM_PHASE_IDLE_TO_DCF:
    case WCM_PHASE_DCF_TO_IDLE:
    case WCM_PHASE_FATAL_ERROR:
    default:
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_FAILURE;
    }
    if (gWcmWork->resetting == 1) {
        WcmSetPhase(WCM_PHASE_TERMINATING);
        gWcmWork->notify = WCM_NOTIFY_TERMINATE;
        goto accepted;
    }
    status = WMi_GetStatusAddress();
    DC_InvalidateRange(status, 2);
    switch (*status) {
    case 0:
        result = WM_Finish();
        if (result == WM_ERRCODE_SUCCESS) {
            WcmSetPhase(WCM_PHASE_WAIT);
            gWcmWork->notify = WCM_NOTIFY_COMMON;
            OS_RestoreInterrupts(enabled);
            return WCM_RESULT_SUCCESS;
        }
        break;
    case 1:
        result = WM_Disable((void (*)(void *))WcmWmcbCommon);
        break;
    case 2:
        result = WM_PowerOff((void (*)(void *))WcmWmcbCommon);
        break;
    default:
        gWcmWork->resetting = 1;
        result = WM_Reset((void (*)(void *))WcmWmcbReset);
        break;
    }
    switch (result) {
    case WM_ERRCODE_OPERATING:
        WcmSetPhase(WCM_PHASE_TERMINATING);
        gWcmWork->notify = WCM_NOTIFY_TERMINATE;
        break;
    case WM_ERRCODE_FIFO_ERROR:
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_REJECT;
    case WM_ERRCODE_ILLEGAL_STATE:
    default:
        WcmSetPhase(WCM_PHASE_FATAL_ERROR);
        OS_RestoreInterrupts(enabled);
        return WCM_RESULT_FATAL_ERROR;
    }
accepted:
    OS_RestoreInterrupts(enabled);
    return WCM_RESULT_ACCEPT;
}

int WCM_GetPhase(void) {
    OSIntrMode enabled = OS_DisableInterrupts();
    int phase = WCM_PHASE_NULL;
    if (gWcmWork) {
        phase = gWcmWork->phase;
    }
    OS_RestoreInterrupts(enabled);
    return phase;
}

// Sets the option fields given in option (bit 15: channel mask 0x3FFE, 17: 0x10000, 19: 0x40000,
// 21: 0x100000, 23: 0x400000) and returns the old options.
u32 WCM_UpdateOption(u32 option) {
    OSIntrMode enabled = OS_DisableInterrupts();
    u32 mask = 0;
    WcmWork *work = gWcmWork;
    u32 old = work->option;
    if (!work) {
        OS_RestoreInterrupts(enabled);
        return 0;
    }
    if (option & 0x8000) {
        mask |= 0x3FFE;
        if (!(option & 0x3FFE)) {
            option |= 0xA082;
        }
    }
    if (option & 0x20000) {
        mask |= 0x10000;
    }
    if (option & 0x80000) {
        mask |= 0x40000;
    }
    if (option & 0x200000) {
        mask |= 0x100000;
    }
    if (option & 0x800000) {
        mask |= 0x400000;
    }
    work->option = option | (old & ~mask);
    OS_RestoreInterrupts(enabled);
    return old;
}

WcmWork *WCMi_GetSystemWork(void) {
    return gWcmWork;
}
