#include "nitrowifi/wcm_internal.h"

// WCM internals: configuration, scan parameters, notifications, phase changes with the keep-alive
// alarm of a connection, bit helpers.

#pragma force_active on

void WcmConfigure(WcmConfig *config, WcmCallback callback) {
    if (!config) {
        gWcmWork->dmaNo = 3;
        gWcmWork->apList = NULL;
        gWcmWork->apListSize = 0;
        gWcmWork->apListMode = 0;
    } else {
        gWcmWork->dmaNo = config->dmaNo & 3;
        // the list starts at the first 4-byte boundary of the buffer
        if ((((4 - ((u32)config->apListBuffer & 3)) & 3) + sizeof(WcmApList)) > config->apListBufferSize) {
            gWcmWork->apList = NULL;
            gWcmWork->apListSize = 0;
        } else {
            gWcmWork->apList = (WcmApList *)(((u32)config->apListBuffer + 3) & ~3);
            gWcmWork->apListSize = config->apListBufferSize - ((4 - ((u32)config->apListBuffer & 3)) & 3);
            MI_CpuFill8(gWcmWork->apList, 0, gWcmWork->apListSize);
        }
        gWcmWork->apListMode = config->apListMode;
    }
    gWcmWork->callback = callback;
}

void WcmEditScanExParam(const u8 *bssid, const u8 *ssid, u32 option) {
    u16 period;
    WCM_UpdateOption(option);
    gWcmWork->scanParam.buffer = gWcmWork->recvBuffer;
    gWcmWork->scanParam.bufferSize = 0x400;
    gWcmWork->scanParam.channels = (1 << WcmGetNextScanChannel(0)) >> 1;
    period = gWcmWork->scanPeriod;
    if (period == 0) {
        period = WM_GetDispersionScanPeriod();
    }
    gWcmWork->scanParam.duration = period;
    gWcmWork->scanParam.scanType = (gWcmWork->option & 0x300000) != 0x300000;
    if (bssid == NULL) {
        MI_CpuCopy8(WCM_Bssid_Any, gWcmWork->scanParam.bssid, 6);
    } else {
        MI_CpuCopy8(bssid, gWcmWork->scanParam.bssid, 6);
    }
    if (ssid == NULL || ssid == WCM_Essid_Any) {
        MI_CpuCopy8(WCM_Essid_Any, gWcmWork->scanParam.ssid, 32);
        gWcmWork->scanParam.ssidLength = 0;
    } else {
        int length;
        MI_CpuCopy8(ssid, gWcmWork->scanParam.ssid, 32);
        for (length = 0; length < 32; length++, ssid++) {
            if (*ssid == 0) {
                break;
            }
        }
        gWcmWork->scanParam.ssidLength = length;
    }
    gWcmWork->scanCount = 0;
}

void WcmInitOption(void) {
    gWcmWork->option = 0xAAA082;
}

// First channel (1-13) of the option's channel mask after channel, wrapping around.
u16 WcmGetNextScanChannel(int channel) {
    int i;
    u32 mask = gWcmWork->option;
    int next = channel;
    for (i = 0; i < 13; i++, next++) {
        if (mask & (1 << ((next % 13) + 1))) {
            break;
        }
    }
    return ((channel + i) % 13) + 1;
}

// Notifies the result of the request being processed.
void WcmNotify(int result, void *param0, void *param1, int line) {
    int notify = gWcmWork->notify;
    gWcmWork->notify = WCM_NOTIFY_COMMON;
    WcmNotifyEx(notify, result, param0, param1, line);
}

void WcmNotifyEx(int notify, int result, void *param0, void *param1, int line) {
    WcmNotice notice;
    if (!gWcmWork->callback) {
        return;
    }
    notice.notify = notify;
    notice.result = result;
    notice.param0 = param0;
    notice.param1 = param1;
    notice.line = line;
    gWcmWork->callback(&notice);
}

// The keep-alive alarm runs while connected (phase 9); fatal error (11) is final.
void WcmSetPhase(int phase) {
    OSIntrMode enabled = OS_DisableInterrupts();
    if (gWcmWork->phase == WCM_PHASE_DCF && phase != WCM_PHASE_DCF) {
        OS_CancelAlarm(&gWcmWork->keepAliveAlarm);
    }
    if (gWcmWork->phase != WCM_PHASE_FATAL_ERROR) {
        gWcmWork->phase = phase;
    }
    if (phase == WCM_PHASE_DCF) {
        OS_SetAlarm(&gWcmWork->keepAliveAlarm, 0x22F5341, WcmKeepAliveAlarm, NULL);
    }
    OS_RestoreInterrupts(enabled);
}

void WCMi_ResetKeepAliveAlarm(void) {
    OSIntrMode enabled = OS_DisableInterrupts();
    OS_CancelAlarm(&gWcmWork->keepAliveAlarm);
    if (gWcmWork->phase == WCM_PHASE_DCF) {
        OS_SetAlarm(&gWcmWork->keepAliveAlarm, 0x22F5341, WcmKeepAliveAlarm, NULL);
    }
    OS_RestoreInterrupts(enabled);
}

void WcmKeepAliveAlarm(void *arg) {
    WCMi_CpsifSendNullPacket();
    WCMi_ResetKeepAliveAlarm();
}

// clang-format off
asm u32 WcmCountBits(u32 value) {
    mov r1, r0
    mov r0, #0
    mov r3, #1
@loop:
    clz r2, r1
    rsbs r2, r2, #0x1f
    bcc @done
    b @clear
@done:
    bx lr
@clear:
    bic r1, r1, r3, lsl r2
    add r0, r0, #1
    b @loop
}
// clang-format on

// clang-format off
asm u32 WcmCountLeadingZero(u32 value) {
    clz r0, r0
    bx lr
}
// clang-format on
