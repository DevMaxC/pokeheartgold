#include "nitrowifi/wcm_internal.h"

// libCPS interface: received DCF frames go to the libCPS receive callback, frames from libCPS are
// sent with WM_SetDCFData (one at a time, under gWcmCpsifMutex), a null frame keeps the connection
// alive. Also the link level from the average RSSI of the last 16 frames.

#pragma force_active on

void WCMi_InitCpsif(void) {
    if (gWcmCpsif.initialized) {
        return;
    }
    gWcmCpsif.initialized = 1;
    gWcmCpsif.sendResult = WM_ERRCODE_SUCCESS;
    gWcmCpsif.sendQueue.tail = NULL;
    gWcmCpsif.sendQueue.head = NULL;
    OS_InitMutex(&gWcmCpsifMutex);
}

void WCMi_CpsifRecvCallback(u8 *frame) {
    if (gWcmCpsif.recvCallback) {
        gWcmCpsif.recvCallback(frame + 30, frame + 24, frame + 44, *(u16 *)(frame + 6));
    }
}

void WCMi_CpsifSendNullPacket(void) {
    WcmWork *work = WCMi_GetSystemWork();
    if (!work) {
        return;
    }
    if (work->phase != WCM_PHASE_DCF || work->resetting == 1) {
        return;
    }
    if (!WcmCpsifTryLockMutexInIRQ(&gWcmCpsifMutex)) {
        return;
    }
    if (WM_SetDCFData(WcmCpsifKACallback, work->ap.bssid, work->sendBuffer, 0) == WM_ERRCODE_OPERATING) {
        return;
    }
    WcmCpsifUnlockMutexInIRQ(&gWcmCpsifMutex);
}

u8 *WCM_GetApMacAddress(void) {
    u8 *bssid = NULL;
    WcmWork *work = WCMi_GetSystemWork();
    OSIntrMode enabled = OS_DisableInterrupts();
    if (work && work->phase == WCM_PHASE_DCF && !work->resetting) {
        bssid = work->ap.bssid;
    }
    OS_RestoreInterrupts(enabled);
    return bssid;
}

u8 *WCM_GetApEssid(u16 *length) {
    u8 *ssid = NULL;
    u16 ssidLength = 0;
    WcmWork *work = WCMi_GetSystemWork();
    OSIntrMode enabled = OS_DisableInterrupts();
    if (work && work->phase == WCM_PHASE_DCF && !work->resetting) {
        ssidLength = work->ap.ssidLength;
        ssid = work->ap.ssid;
    }
    OS_RestoreInterrupts(enabled);
    if (length) {
        *length = ssidLength;
    }
    return ssid;
}

void WCM_SetRecvDCFCallback(WcmRecvCallback callback) {
    OSIntrMode enabled = OS_DisableInterrupts();
    gWcmCpsif.recvCallback = callback;
    OS_RestoreInterrupts(enabled);
}

// Sends header + data as one frame and waits for the result; returns its size or a negative error.
int WCM_SendDCFDataEx(const u8 *destination, const void *header, int headerSize, const void *data, int dataSize) {
    OSIntrMode enabled;
    int total;
    WcmWork *work;
    enabled = OS_DisableInterrupts();
    if (!WCMi_GetSystemWork()) {
        OS_RestoreInterrupts(enabled);
        return -1;
    }
    OS_LockMutex(&gWcmCpsifMutex);
    work = WCMi_GetSystemWork();
    if (!work) {
        OS_UnlockMutex(&gWcmCpsifMutex);
        OS_RestoreInterrupts(enabled);
        return -1;
    }
    if (work->phase != WCM_PHASE_DCF || work->resetting == 1) {
        OS_UnlockMutex(&gWcmCpsifMutex);
        OS_RestoreInterrupts(enabled);
        return -4;
    }
    MI_CpuCopy8(header, work->sendBuffer, headerSize);
    if (dataSize > 0) {
        MI_CpuCopy8(data, work->sendBuffer + headerSize, dataSize);
    }
    total = headerSize + dataSize;
    switch (WM_SetDCFData((void (*)(void *))WcmCpsifWmCallback, destination, work->sendBuffer, (u16)total)) {
    case WM_ERRCODE_OPERATING:
        break;
    case WM_ERRCODE_SUCCESS:
    case WM_ERRCODE_FAILED:
    case WM_ERRCODE_ILLEGAL_STATE:
    case WM_ERRCODE_WM_DISABLE:
    case 5:
    case WM_ERRCODE_INVALID_PARAM:
    case WM_ERRCODE_NO_CHILD:
    case WM_ERRCODE_FIFO_ERROR:
    default:
        OS_UnlockMutex(&gWcmCpsifMutex);
        OS_RestoreInterrupts(enabled);
        return -5;
    }
    OS_SleepThread(&gWcmCpsifSendQueue);
    switch (gWcmCpsif.sendResult) {
    case WM_ERRCODE_SUCCESS:
        break;
    case WM_ERRCODE_FAILED:
    default:
        OS_UnlockMutex(&gWcmCpsifMutex);
        OS_RestoreInterrupts(enabled);
        return -5;
    }
    OS_UnlockMutex(&gWcmCpsifMutex);
    OS_RestoreInterrupts(enabled);
    return total;
}

void WcmCpsifWmCallback(WcmWmCallbackArg *arg) {
    if (arg->apiId != 18) {
        return;
    }
    gWcmCpsif.sendResult = arg->errCode;
    if (!arg->errCode) {
        WCMi_ResetKeepAliveAlarm();
    }
    OS_WakeupThread(&gWcmCpsifSendQueue);
}

void WcmCpsifKACallback(void *arg) {
    WcmCpsifUnlockMutexInIRQ(&gWcmCpsifMutex);
}

// Mutex for interrupt handlers: owned by "the IRQ handler" instead of a thread.
BOOL WcmCpsifTryLockMutexInIRQ(OSMutex *mutex) {
    if (!mutex->thread) {
        mutex->thread = (OSThread *)OS_IrqHandler;
        mutex->count++;
        return TRUE;
    }
    if (mutex->thread != (OSThread *)OS_IrqHandler) {
        return FALSE;
    }
    mutex->count++;
    return TRUE;
}

void WcmCpsifUnlockMutexInIRQ(OSMutex *mutex) {
    if (mutex->thread != (OSThread *)OS_IrqHandler) {
        return;
    }
    if (--mutex->count) {
        return;
    }
    mutex->thread = NULL;
    OS_WakeupThread(&mutex->queue);
}

BOOL WCM_CompareBssID(const u8 *a, const u8 *b) {
    int i;
    for (i = 0; i < 6; i++) {
        if (a[i] != b[i]) {
            return FALSE;
        }
    }
    return TRUE;
}

int WCM_GetLinkLevel(void) {
    OSIntrMode enabled = OS_DisableInterrupts();
    WcmWork *work = WCMi_GetSystemWork();
    int level = 0;
    if (work && work->phase == WCM_PHASE_DCF) {
        level = WcmGetLinkLevel();
    }
    OS_RestoreInterrupts(enabled);
    return level;
}

u8 WCMi_GetRssiAverage(void) {
    int total = 0, i, count = gWcmRssiCount;
    u8 *rssi;
    if ((u32)count > 16) {
        rssi = gWcmRssi;
        i = 0;
        do {
            total += *rssi++;
            i++;
        } while (i < 16);
        total /= 16;
    } else if (count) {
        i = 0;
        if (count > 0) {
            rssi = gWcmRssi;
            do {
                total += *rssi++;
                i++;
            } while (i < count);
        }
        total /= count;
    }
    return (u8)total;
}

int WcmGetLinkLevel(void) {
    u32 rssi = WCMi_GetRssiAverage();
    int level = 0;
    if (rssi >= 28) {
        level = 3;
    } else if (rssi >= 22) {
        level = 2;
    } else if (rssi >= 16) {
        level = 1;
    }
    return level;
}

static inline u8 CalibrateRssi(int sample) {
    if (sample & 2) {
        return (u8)(sample >> 2);
    }
    return (u8)((sample >> 2) + 25);
}

void WCMi_ShelterRssi(int sample) {
    u8 rssi = CalibrateRssi(sample);
    int index = gWcmRssiCount;
    gWcmRssi[index % 16] = rssi;
    if ((u32)index < 16) {
        gWcmRssiCount = index + 1;
    } else {
        gWcmRssiCount = (index + 1) % 16 + 16;
    }
}
