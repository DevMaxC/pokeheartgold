#include "nitrowifi/wcm_internal.h"

// WM callbacks: each step of a request starts the next WM call from the callback of the previous
// one; errors reset WM (WcmWmReset) or end in the fatal phase 11. WM returns 2 when a call was
// accepted, 8 when it cannot be issued now.

#pragma force_active on

void WcmWmReset(void) {
    if (gWcmWork->resetting) {
        return;
    }
    gWcmWork->resetting = 1;
    if (WM_Reset((void (*)(void *))WcmWmcbReset) == WM_ERRCODE_OPERATING) {
        return;
    }
    WcmSetPhase(WCM_PHASE_FATAL_ERROR);
    WcmNotify(WCM_RESULT_FATAL_ERROR, NULL, NULL, 0x610);
}

// the access point has gone (beacon lost)
void WcmWmcbIndication(WcmWmCallbackArg *arg) {
    if (arg->errCode != WM_ERRCODE_FIFO_ERROR || arg->state != 22 || arg->reason != 37) {
        return;
    }
    switch (gWcmWork->phase) {
    case WCM_PHASE_IDLE_TO_DCF:
        WcmSetPhase(WCM_PHASE_IRREGULAR);
        return;
    case WCM_PHASE_DCF:
    case WCM_PHASE_IRREGULAR:
        WcmWmReset();
        return;
    case WCM_PHASE_DCF_TO_IDLE:
        WcmSetPhase(WCM_PHASE_IRREGULAR);
        return;
    }
}

static inline u16 GetPowerSave(u32 option) {
    return (option & 0xC0000) == 0xC0000;
}

// Start-up (enable, power on), clean-up (disable, power off, finish) and connection set-up
// (life time, beacon indication, WEP key, connect) sequences.
void WcmWmcbCommon(WcmWmStateArg *arg) {
    int result = WM_ERRCODE_MAX;
    switch (arg->errCode) {
    case WM_ERRCODE_SUCCESS:
        switch (arg->apiId) {
        case 3:
            result = WM_PowerOn((void (*)(void *))WcmWmcbCommon);
            break;
        case 4:
            result = WM_Finish();
            switch (result) {
            case WM_ERRCODE_SUCCESS: {
                WcmSetPhase(WCM_PHASE_WAIT);
                WcmNotify(WCM_RESULT_SUCCESS, NULL, NULL, 0x663);
                return;
            }
            case WM_ERRCODE_WM_DISABLE:
            default: {
                WcmSetPhase(WCM_PHASE_FATAL_ERROR);
                WcmNotify(WCM_RESULT_FATAL_ERROR, NULL, NULL, 0x66C);
                return;
            }
            }
        case 5:
            WcmSetPhase(WCM_PHASE_IDLE);
            WcmNotify(WCM_RESULT_SUCCESS, NULL, NULL, 0x673);
            return;
        case 6:
            result = WM_Disable((void (*)(void *))WcmWmcbCommon);
            break;
        case 29:
            result = WM_SetBeaconIndication((void (*)(void *))WcmWmcbCommon, 0);
            break;
        case 25:
            result = WM_SetWEPKeyEx((void (*)(void *))WcmWmcbCommon, gWcmWork->wepMode, gWcmWork->wepKeyId, gWcmWork->wepKey);
            break;
        case 39: {
            u16 powerSave;
            u32 authMode;
            powerSave = GetPowerSave(gWcmWork->option);
            authMode = (gWcmWork->option & 0x30000) == 0x30000 ? 0 : 1;
            result = WM_StartConnectEx((void (*)(void *))WcmWmcbConnect, &gWcmWork->ap, NULL, authMode, powerSave);
            break;
        }
        }
        if (result == WM_ERRCODE_OPERATING) {
            return;
        }
        if (result != WM_ERRCODE_ILLEGAL_STATE && result == WM_ERRCODE_FIFO_ERROR) {
            WcmSetPhase(WCM_PHASE_IRREGULAR);
            WcmNotify(WCM_RESULT_FAILURE, gWcmWork->notify == WCM_NOTIFY_CONNECT ? &gWcmWork->ap : NULL, NULL, 0x6AF);
        } else {
            WcmSetPhase(WCM_PHASE_FATAL_ERROR);
            WcmNotify(WCM_RESULT_FATAL_ERROR, gWcmWork->notify == WCM_NOTIFY_CONNECT ? &gWcmWork->ap : NULL, NULL, 0x6B8);
        }
        return;
    case WM_ERRCODE_FAILED:
        WcmSetPhase(WCM_PHASE_IRREGULAR);
        WcmNotify(WCM_RESULT_FAILURE, gWcmWork->notify == WCM_NOTIFY_CONNECT ? &gWcmWork->ap : NULL, NULL, 0x6DE);
        return;
    case WM_ERRCODE_OPERATING:
    case WM_ERRCODE_ILLEGAL_STATE:
    case WM_ERRCODE_WM_DISABLE:
    default:
        WcmSetPhase(WCM_PHASE_FATAL_ERROR);
        WcmNotify(WCM_RESULT_FATAL_ERROR, gWcmWork->notify == WCM_NOTIFY_CONNECT ? &gWcmWork->ap : NULL, NULL, 0x6E8);
        return;
    }
}

// Scan round done: enters the access points found, then scans the next channel of the mask.
void WcmWmcbScanEx(WcmWmStateArg *arg) {
    int result = WM_ERRCODE_MAX, i;
    switch (arg->errCode) {
    case WM_ERRCODE_SUCCESS:
        if (gWcmWork->phase == WCM_PHASE_IDLE_TO_SEARCH) {
            WcmSetPhase(WCM_PHASE_SEARCH);
            WcmNotify(WCM_RESULT_SUCCESS, NULL, NULL, 0x704);
        }
        switch (gWcmWork->phase) {
        case WCM_PHASE_SEARCH:
            gWcmWork->notify = WCM_NOTIFY_FOUND_AP;
            if (arg->state == 5) {
                DC_InvalidateRange(gWcmWork->scanParam.buffer, gWcmWork->scanParam.bufferSize);
                for (i = 0; i < arg->count; i++) {
                    WCMi_EntryApList(arg->bssDesc[i], arg->linkLevel[i]);
                    WcmNotifyEx(WCM_NOTIFY_FOUND_AP, WCM_RESULT_SUCCESS, arg->bssDesc[i], arg, 0x71A);
                }
            }
            if ((gWcmWork->option & 0xC00000) == 0xC00000) {
                int channels = WcmCountBits(gWcmWork->option & 0x3FFE);
                if (channels) {
                    u32 scanCount = gWcmWork->scanCount;
                    if (scanCount % channels == 0) {
                        WcmNotifyEx(WCM_NOTIFY_SEARCH_AROUND, WCM_RESULT_SUCCESS, (void *)scanCount, NULL, 0x728);
                    }
                }
            }
            gWcmWork->scanParam.channels = (1 << WcmGetNextScanChannel((u16)(32 - WcmCountLeadingZero(arg->aid)))) >> 1;
            DC_InvalidateRange(gWcmWork->scanParam.buffer, gWcmWork->scanParam.bufferSize);
            gWcmWork->scanCount++;
            result = WM_StartScanEx((void (*)(void *))WcmWmcbScanEx, &gWcmWork->scanParam);
            break;
        case WCM_PHASE_SEARCH_TO_IDLE:
            result = WM_EndScan((void (*)(void *))WcmWmcbEndScan);
            break;
        case WCM_PHASE_TERMINATING:
            WcmWmReset();
            return;
        }
        if (result == WM_ERRCODE_OPERATING) {
            return;
        }
        if (result != WM_ERRCODE_ILLEGAL_STATE && result == WM_ERRCODE_FIFO_ERROR) {
            WcmSetPhase(WCM_PHASE_IRREGULAR);
            WcmNotify(WCM_RESULT_FAILURE, NULL, NULL, 0x753);
        } else {
            WcmSetPhase(WCM_PHASE_FATAL_ERROR);
            WcmNotify(WCM_RESULT_FATAL_ERROR, NULL, NULL, 0x75C);
        }
        return;
    case WM_ERRCODE_FAILED:
        WcmWmReset();
        return;
    case WM_ERRCODE_OPERATING:
    case WM_ERRCODE_ILLEGAL_STATE:
    case WM_ERRCODE_WM_DISABLE:
    default:
        WcmSetPhase(WCM_PHASE_FATAL_ERROR);
        WcmNotify(WCM_RESULT_FATAL_ERROR, NULL, NULL, 0x76D);
        return;
    }
}

void WcmWmcbEndScan(WcmWmCallbackArg *arg) {
    switch (arg->errCode) {
    case WM_ERRCODE_SUCCESS:
        WcmSetPhase(WCM_PHASE_IDLE);
        WcmNotify(WCM_RESULT_SUCCESS, NULL, NULL, 0x783);
        return;
    case WM_ERRCODE_FAILED:
        WcmWmReset();
        return;
    case WM_ERRCODE_OPERATING:
    case WM_ERRCODE_ILLEGAL_STATE:
    case WM_ERRCODE_WM_DISABLE:
    default:
        WcmSetPhase(WCM_PHASE_FATAL_ERROR);
        WcmNotify(WCM_RESULT_FATAL_ERROR, NULL, NULL, 0x793);
        return;
    }
}

// Connection state changes: connected (7) starts DCF, disconnected (8, 9) resets.
void WcmWmcbConnect(WcmWmStateArg *arg) {
    int result;
    switch (arg->errCode) {
    case WM_ERRCODE_SUCCESS:
        switch (arg->state) {
        case 6:
            goto done;
        case 26:
            goto done;
        case 8:
        case 9:
            switch (gWcmWork->phase) {
            case WCM_PHASE_DCF_TO_IDLE:
                gWcmWork->aid = 0;
            case WCM_PHASE_IDLE_TO_DCF:
                WcmSetPhase(WCM_PHASE_IRREGULAR);
                return;
            case WCM_PHASE_DCF:
                gWcmWork->aid = 0;
                gWcmWork->notify = WCM_NOTIFY_DISCONNECT;
            case WCM_PHASE_IRREGULAR:
                WcmWmReset();
                return;
            default:
                goto done;
            }
        case 7:
            if (gWcmWork->phase == WCM_PHASE_IRREGULAR) {
                WcmSetPhase(WCM_PHASE_IDLE_TO_DCF);
                WcmWmReset();
                return;
            }
            if (arg->aid >= 1 && arg->aid <= 2007) {
                gWcmWork->aid = arg->aid;
                result = WM_StartDCF((void (*)(void *))WcmWmcbStartDCF, gWcmWork->recvBuffer, 0x620);
                if (result == WM_ERRCODE_OPERATING) {
                    return;
                }
                if (result != WM_ERRCODE_ILLEGAL_STATE && result == WM_ERRCODE_FIFO_ERROR) {
                    WcmSetPhase(WCM_PHASE_IRREGULAR);
                    WcmNotify(WCM_RESULT_FAILURE, &gWcmWork->ap, NULL, 0x7ED);
                } else {
                    WcmSetPhase(WCM_PHASE_FATAL_ERROR);
                    WcmNotify(WCM_RESULT_FATAL_ERROR, &gWcmWork->ap, NULL, 0x7F6);
                }
                return;
            }
            WcmWmReset();
            return;
        default:
            WcmSetPhase(WCM_PHASE_FATAL_ERROR);
            WcmNotify(WCM_RESULT_FATAL_ERROR, &gWcmWork->ap, (void *)arg->state, 0x804);
            return;
        }
        return;
    case WM_ERRCODE_FAILED:
        gWcmWork->reason = arg->count;
    case WM_ERRCODE_INVALID_PARAM:
    case WM_ERRCODE_NO_ENTRY:
    case WM_ERRCODE_OVER_MAX_ENTRY:
        WcmSetPhase(WCM_PHASE_IDLE_TO_DCF);
        WcmWmReset();
        return;
    case WM_ERRCODE_OPERATING:
    case WM_ERRCODE_ILLEGAL_STATE:
    case WM_ERRCODE_WM_DISABLE:
    case 5:
    case WM_ERRCODE_NO_CHILD:
    case WM_ERRCODE_FIFO_ERROR:
    case WM_ERRCODE_TIMEOUT:
    case WM_ERRCODE_SEND_QUEUE_FULL:
    default:
        WcmSetPhase(WCM_PHASE_FATAL_ERROR);
        WcmNotify(WCM_RESULT_FATAL_ERROR, &gWcmWork->ap, NULL, 0x81B);
        return;
    }
done:
    return;
}

void WcmWmcbDisconnect(WcmWmCallbackArg *arg) {
    switch (arg->errCode) {
    case WM_ERRCODE_SUCCESS:
        if (gWcmWork->phase == WCM_PHASE_IRREGULAR) {
            WcmSetPhase(WCM_PHASE_DCF_TO_IDLE);
            WcmWmReset();
            return;
        }
        gWcmWork->aid = 0;
        WcmSetPhase(WCM_PHASE_IDLE);
        WcmNotify(WCM_RESULT_SUCCESS, &gWcmWork->ap, NULL, 0x83D);
        return;
    case WM_ERRCODE_FAILED:
    case WM_ERRCODE_ILLEGAL_STATE:
        WcmSetPhase(WCM_PHASE_DCF_TO_IDLE);
        WcmWmReset();
        return;
    case WM_ERRCODE_OPERATING:
    case WM_ERRCODE_WM_DISABLE:
    default:
        WcmSetPhase(WCM_PHASE_FATAL_ERROR);
        WcmNotify(WCM_RESULT_FATAL_ERROR, &gWcmWork->ap, NULL, 0x84F);
        return;
    }
}

// DCF started (14) / a data frame received (15: to libCPS, with its RSSI)
void WcmWmcbStartDCF(WcmWmCallbackArg *arg) {
    switch (arg->errCode) {
    case WM_ERRCODE_SUCCESS:
        switch (arg->state) {
        case 14:
            if (gWcmWork->phase == WCM_PHASE_IRREGULAR) {
                WcmSetPhase(WCM_PHASE_IDLE_TO_DCF);
                WcmWmReset();
                return;
            }
            WcmSetPhase(WCM_PHASE_DCF);
            WcmNotify(WCM_RESULT_SUCCESS, &gWcmWork->ap, NULL, 0x872);
            return;
        case 15:
            WCMi_ShelterRssi(((*(u16 *)(arg->data + 14)) >> 8) & 0xFF);
            DC_InvalidateRange(arg->data, 0x620);
            WCMi_CpsifRecvCallback(arg->data);
            return;
        default:
            WcmSetPhase(WCM_PHASE_FATAL_ERROR);
            WcmNotify(WCM_RESULT_FATAL_ERROR, &gWcmWork->ap, (void *)arg->state, 0x881);
            return;
        }
    case WM_ERRCODE_WM_DISABLE:
    default:
        WcmSetPhase(WCM_PHASE_FATAL_ERROR);
        WcmNotify(WCM_RESULT_FATAL_ERROR, &gWcmWork->ap, NULL, 0x88C);
        return;
    }
}

void WcmWmcbEndDCF(WcmWmCallbackArg *arg) {
    switch (arg->errCode) {
    case WM_ERRCODE_SUCCESS:
        if (gWcmWork->phase == WCM_PHASE_IRREGULAR) {
            WcmSetPhase(WCM_PHASE_DCF_TO_IDLE);
            WcmWmReset();
            return;
        }
        switch (WM_Disconnect((void (*)(void *))WcmWmcbDisconnect, 0)) {
        case WM_ERRCODE_OPERATING:
            return;
        case WM_ERRCODE_FIFO_ERROR:
            WcmSetPhase(WCM_PHASE_IRREGULAR);
            WcmNotify(WCM_RESULT_FAILURE, &gWcmWork->ap, NULL, 0x8B4);
            return;
        case WM_ERRCODE_ILLEGAL_STATE:
            WcmSetPhase(WCM_PHASE_DCF_TO_IDLE);
            WcmWmReset();
            return;
        default:
            WcmSetPhase(WCM_PHASE_FATAL_ERROR);
            WcmNotify(WCM_RESULT_FATAL_ERROR, &gWcmWork->ap, NULL, 0x8C0);
            return;
        }
    case WM_ERRCODE_FAILED:
    case WM_ERRCODE_ILLEGAL_STATE:
        WcmSetPhase(WCM_PHASE_DCF_TO_IDLE);
        WcmWmReset();
        return;
    case WM_ERRCODE_OPERATING:
    case WM_ERRCODE_WM_DISABLE:
    default:
        WcmSetPhase(WCM_PHASE_FATAL_ERROR);
        WcmNotify(WCM_RESULT_FATAL_ERROR, &gWcmWork->ap, NULL, 0x8D3);
        return;
    }
}

#pragma opt_propagation on

static inline int Connect(void) {
    WcmWork *work = gWcmWork;
    u32 option = work->option;
    u16 powerSave;
    u32 authMode;
    powerSave = (u16)((option & 0xC0000) == 0xC0000);
    authMode = (option & 0x30000) != 0x30000;
    return WM_StartConnectEx((void (*)(void *))WcmWmcbConnect, &work->ap, NULL, authMode, powerSave);
}

#pragma opt_propagation off

// Reset done: reports the end of the request that needed it; a connection refused with reason 18
// is retried once with capability bits 0x24 set.
void WcmWmcbReset(WcmWmStateArg *arg) {
    u16 reason;
    int result;
    if (arg->errCode == WM_ERRCODE_SUCCESS) {
        gWcmWork->resetting = 0;
        gWcmWork->aid = 0;
        switch (gWcmWork->phase) {
        case WCM_PHASE_IDLE_TO_SEARCH:
        case WCM_PHASE_SEARCH:
            WcmSetPhase(WCM_PHASE_IDLE);
            WcmNotify(WCM_RESULT_FAILURE, NULL, NULL, 0x8F5);
            return;
        case WCM_PHASE_SEARCH_TO_IDLE:
            WcmSetPhase(WCM_PHASE_IDLE);
            WcmNotify(WCM_RESULT_SUCCESS, NULL, NULL, 0x8FB);
            return;
        case WCM_PHASE_IDLE_TO_DCF:
            reason = gWcmWork->reason;
            gWcmWork->reason = 0;
            if (reason == 18 && (gWcmWork->ap.capability & 0x24) != 0x24) {
                gWcmWork->ap.capability |= 0x24;
                {
                    result = Connect();
                }
                if (result == WM_ERRCODE_OPERATING) {
                    return;
                }
                if (result != WM_ERRCODE_ILLEGAL_STATE && result == WM_ERRCODE_FIFO_ERROR) {
                    WcmSetPhase(WCM_PHASE_IRREGULAR);
                    WcmNotify(WCM_RESULT_FAILURE, &gWcmWork->ap, (void *)reason, 0x91C);
                } else {
                    WcmSetPhase(WCM_PHASE_FATAL_ERROR);
                    WcmNotify(WCM_RESULT_FATAL_ERROR, &gWcmWork->ap, (void *)reason, 0x925);
                }
                return;
            }
            WcmSetPhase(WCM_PHASE_IDLE);
            WcmNotify(WCM_RESULT_FAILURE, &gWcmWork->ap, (void *)reason, 0x92D);
            return;
        case WCM_PHASE_DCF:
        case WCM_PHASE_IRREGULAR:
            WcmSetPhase(WCM_PHASE_IDLE);
            WcmNotify(WCM_RESULT_SUCCESS, &gWcmWork->ap, (void *)1, 0x935);
            return;
        case WCM_PHASE_DCF_TO_IDLE:
            WcmSetPhase(WCM_PHASE_IDLE);
            WcmNotify(WCM_RESULT_SUCCESS, &gWcmWork->ap, NULL, 0x93C);
            return;
        case WCM_PHASE_TERMINATING:
            result = WM_PowerOff((void (*)(void *))WcmWmcbCommon);
            if (result == WM_ERRCODE_OPERATING) {
                return;
            }
            if (result != WM_ERRCODE_ILLEGAL_STATE && result == WM_ERRCODE_FIFO_ERROR) {
                WcmSetPhase(WCM_PHASE_IRREGULAR);
                WcmNotify(WCM_RESULT_FAILURE, NULL, NULL, 0x94A);
            } else {
                WcmSetPhase(WCM_PHASE_FATAL_ERROR);
                WcmNotify(WCM_RESULT_FATAL_ERROR, NULL, NULL, 0x953);
            }
            return;
        default:
            WcmSetPhase(WCM_PHASE_FATAL_ERROR);
            WcmNotify(WCM_RESULT_FATAL_ERROR, NULL, (void *)gWcmWork->phase, 0x959);
            return;
        }
    }
    WcmSetPhase(WCM_PHASE_FATAL_ERROR);
    WcmNotify(WCM_RESULT_FATAL_ERROR, NULL, NULL, 0x960);
}

#pragma opt_propagation reset
