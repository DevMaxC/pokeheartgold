#include <nitro.h>

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>
#include <nitro/wm/wm_internal.h>

// WM requests that move the wireless state machine: enable / power / initialise, parent setup, scan,
// connect / disconnect, MP and DCF communication. Each checks the state, stores the callback for its
// API id and sends the request; the result arrives in the callback (WM_ERRCODE_OPERATING until then).

typedef struct WmConnectRequest {
    u16 apiid;
    u16 pad;
    const u16 *bssDesc;
    u8 data[24];
    u32 powerSave;
    u16 unk_24;
    u16 authMode;
} WmConnectRequest;

typedef struct WmScanRequest {
    u16 apiid;
    u16 channel;
    void *buffer;
    u16 time;
    u8 address[6];
} WmScanRequest;

typedef struct WmScanExRequest {
    u16 apiid;
    u16 channel;
    void *buffer;
    u16 bufferSize;
    u16 dwell;
    u8 address[6];
    u16 type;
    u16 length;
    u8 ssid[32];
    u16 matchLength;
    u8 unk_3C[4];
} WmScanExRequest;

typedef struct WmStartMPRequest {
    u16 apiid;
    u16 pad;
    void *recvBuf;
    u32 recvBufSize; // in halfwords
    void *sendBuf;
    u32 sendBufSize;
    u8 unk_14[28];
    WmMPParam param;
} WmStartMPRequest;

#pragma force_active on

// Transmission group id: seeded from the RTC time on first use, then counted up.
u16 WM_GetNextTgid(void) {
    RTCTime time;

    if (gWmNextTgid == 0x10000) {
        RTC_Init();
        if (RTC_GetTime(&time) == RTC_RESULT_SUCCESS) {
            gWmNextTgid = (u16)(time.second + (time.minute << 8));
        }
    }
    gWmNextTgid = (u16)(gWmNextTgid + 1);
    return (u16)gWmNextTgid;
}

WMErrCode WM_Enable(WmCallback callback) {
    return WMi_EnableEx(callback, 0);
}

WMErrCode WMi_EnableEx(WmCallback callback, u32 flags) {
    WMErrCode result = WMi_CheckStateEx(1, WM_STATE_INIT);
    WmSystemWork *sys;

    if (result) {
        return result;
    }
    WMi_SetCallbackTable(WM_API_ENABLE, callback);
    sys = WMi_GetSystemWork();
    result = WMi_SendCommand(WM_API_ENABLE, 4, sys->arm7Work, sys->status, sys->fifoBuffer, flags);
    if (!result) {
        result = WM_ERRCODE_OPERATING;
    }
    return result;
}

WMErrCode WM_Disable(WmCallback callback) {
    WMErrCode result = WMi_CheckStateEx(1, WM_STATE_ENABLED);

    if (result) {
        return result;
    }
    WMi_SetCallbackTable(WM_API_DISABLE, callback);
    result = WMi_SendCommand(WM_API_DISABLE, 0);
    if (!result) {
        result = WM_ERRCODE_OPERATING;
    }
    return result;
}

WMErrCode WM_PowerOn(WmCallback callback) {
    WMErrCode result = WMi_CheckStateEx(1, WM_STATE_ENABLED);

    if (result) {
        return result;
    }
    WMi_SetCallbackTable(WM_API_POWER_ON, callback);
    result = WMi_SendCommand(WM_API_POWER_ON, 0);
    if (!result) {
        result = WM_ERRCODE_OPERATING;
    }
    return result;
}

WMErrCode WM_PowerOff(WmCallback callback) {
    WMErrCode result = WMi_CheckStateEx(1, WM_STATE_POWER_ON);

    if (result) {
        return result;
    }
    WMi_SetCallbackTable(WM_API_POWER_OFF, callback);
    result = WMi_SendCommand(WM_API_POWER_OFF, 0);
    if (!result) {
        result = WM_ERRCODE_OPERATING;
    }
    return result;
}

WMErrCode WM_Initialize(void *buffer, WmCallback callback, u32 dma) {
    return WMi_InitializeEx(buffer, callback, dma, 0);
}

WMErrCode WM_InitializeForListening(void *buffer, WmCallback callback, u32 dma, BOOL unk) {
    int flags = 1;

    if (!unk) {
        flags |= 2;
    }
    return WMi_InitializeEx(buffer, callback, dma, flags);
}

// WM_Init + enable + power on in one request.
WMErrCode WMi_InitializeEx(void *buffer, WmCallback callback, u32 dma, u32 flags) {
    WMErrCode result = WM_Init(buffer, dma);
    WmSystemWork *sys;

    if (result) {
        return result;
    }
    WMi_SetCallbackTable(WM_API_INITIALIZE, callback);
    sys = WMi_GetSystemWork();
    result = WMi_SendCommand(WM_API_INITIALIZE, 4, sys->arm7Work, sys->status, sys->fifoBuffer, flags);
    if (!result) {
        result = WM_ERRCODE_OPERATING;
    }
    return result;
}

WMErrCode WM_Reset(WmCallback callback) {
    WMErrCode result = WMi_CheckIdle();

    if (result) {
        return result;
    }
    WMi_SetCallbackTable(WM_API_RESET, callback);
    result = WMi_SendCommand(WM_API_RESET, 0);
    if (!result) {
        result = WM_ERRCODE_OPERATING;
    }
    return result;
}

WMErrCode WM_End(WmCallback callback) {
    WMErrCode result = WMi_CheckStateEx(1, WM_STATE_POWER_ON);

    if (result) {
        return result;
    }
    WMi_SetCallbackTable(WM_API_END, callback);
    result = WMi_SendCommand(WM_API_END, 0);
    if (!result) {
        result = WM_ERRCODE_OPERATING;
    }
    return result;
}

WMErrCode WM_SetParentParameter(WmCallback callback, WmParentParam *param) {
    WMErrCode result = WMi_CheckStateEx(1, WM_STATE_POWER_ON);
    u16 unk_14;

    if (result) {
        return result;
    }
    if (!param) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    if (param->gameInfoLength && !param->gameInfo) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    unk_14 = param->KS_Flag;
    if (param->parentMaxSize + (unk_14 ? 42 : 0) > 512 || param->childMaxSize + (unk_14 ? 6 : 0) > 512) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    WmCheckParentParameter(param);
    WMi_SetCallbackTable(WM_API_SET_PARENT_PARAM, callback);
    DC_StoreRange(param, sizeof(WmParentParam));
    if (param->gameInfoLength) {
        DC_StoreRange(param->gameInfo, param->gameInfoLength);
    }
    result = WMi_SendCommand(WM_API_SET_PARENT_PARAM, 1, param);
    if (!result) {
        result = WM_ERRCODE_OPERATING;
    }
    return result;
}

BOOL WmCheckParentParameter(WmParentParam *param) {
    if (param->gameInfoLength > 112) {
        return FALSE;
    }
    if (param->beaconPeriod < 10 || param->beaconPeriod > 1000) {
        return FALSE;
    }
    if (param->channel < 1 || param->channel > 14) {
        return FALSE;
    }
    return TRUE;
}

WMErrCode WMi_StartParentEx(WmCallback callback, u32 unk) {
    WMErrCode result = WMi_CheckStateEx(1, WM_STATE_POWER_ON);
    WmSystemWork *sys;

    if (result) {
        return result;
    }
    sys = WMi_GetSystemWork();
    sys->aid = 0;
    sys->connectedAids = 0;
    WMi_SetCallbackTable(WM_API_START_PARENT, callback);
    result = WMi_SendCommand(WM_API_START_PARENT, 1, unk);
    if (!result) {
        result = WM_ERRCODE_OPERATING;
    }
    return result;
}

WMErrCode WM_StartParent(WmCallback callback) {
    return WMi_StartParentEx(callback, 1);
}

WMErrCode WM_EndParent(WmCallback callback) {
    WMErrCode result = WMi_CheckStateEx(1, WM_STATE_PARENT);

    if (result) {
        return result;
    }
    WMi_SetCallbackTable(WM_API_END_PARENT, callback);
    result = WMi_SendCommand(WM_API_END_PARENT, 0);
    if (!result) {
        result = WM_ERRCODE_OPERATING;
    }
    return result;
}

WMErrCode WM_StartScan(WmCallback callback, WmScanParam *param) {
    WmScanRequest request;
    WMErrCode result = WMi_CheckStateEx(3, WM_STATE_POWER_ON, 3, WM_STATE_SCANNING);

    if (result) {
        return result;
    }
    if (!param) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    if (!param->buffer) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    if (param->channel < 1 || param->channel > 14) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    WMi_SetCallbackTable(WM_API_START_SCAN, callback);
    request.apiid = WM_API_START_SCAN;
    request.channel = param->channel;
    request.buffer = param->buffer;
    request.time = param->time;
    request.address[0] = param->address[0];
    request.address[1] = param->address[1];
    request.address[2] = param->address[2];
    request.address[3] = param->address[3];
    request.address[4] = param->address[4];
    request.address[5] = param->address[5];
    result = WMi_SendCommandDirect(&request, sizeof(request));
    if (result) {
        return result;
    }
    return WM_ERRCODE_OPERATING;
}

WMErrCode WM_StartScanEx(WmCallback callback, WmScanExParam *param) {
    WmScanExParam *p = param;
    WmScanExRequest request;
    WMErrCode result = WMi_CheckStateEx(3, WM_STATE_POWER_ON, 3, WM_STATE_SCANNING);

    if (result) {
        return result;
    }
    if (!p) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    if (!p->buffer) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    if (p->bufferSize > 1024) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    if (p->length > 32) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    if (p->type != 0 && p->type != 1 && p->type != 2 && p->type != 3) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    if ((u16)(p->type + 0xFFFEu) <= 1 && p->matchLength > 32) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    WMi_SetCallbackTable(WM_API_START_SCAN_EX, callback);
    request.apiid = WM_API_START_SCAN_EX;
    request.channel = p->channel;
    request.buffer = p->buffer;
    request.bufferSize = p->bufferSize;
    request.dwell = p->dwell;
    MI_CpuCopy8(p->address, request.address, 6);
    request.type = p->type;
    request.matchLength = p->matchLength;
    request.length = p->length;
    MI_CpuCopy8(p->ssid, request.ssid, 32);
    result = WMi_SendCommandDirect(&request, sizeof(request));
    if (!result) {
        result = WM_ERRCODE_OPERATING;
    }
    return result;
}

WMErrCode WM_EndScan(WmCallback callback) {
    WMErrCode result = WMi_CheckStateEx(1, WM_STATE_SCANNING);

    if (result) {
        return result;
    }
    WMi_SetCallbackTable(WM_API_END_SCAN, callback);
    result = WMi_SendCommand(WM_API_END_SCAN, 0);
    if (!result) {
        result = WM_ERRCODE_OPERATING;
    }
    return result;
}

WMErrCode WM_StartConnectEx(WmCallback callback, const u16 *bssDesc, const void *data, u32 unk, u16 unk2) {
    WmConnectRequest request;
    WMErrCode result = WMi_CheckStateEx(1, WM_STATE_POWER_ON);
    WmSystemWork *sys;

    if (result) {
        return result;
    }
    if (!bssDesc) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    DC_StoreRange(bssDesc, *bssDesc * 2);
    sys = WMi_GetSystemWork();
    sys->aid = 0;
    sys->connectedAids = 0;
    WMi_SetCallbackTable(WM_API_START_CONNECT, callback);
    request.apiid = WM_API_START_CONNECT;
    request.bssDesc = bssDesc;
    if (data) {
        MI_CpuCopy8(data, request.data, 24);
    } else {
        MI_CpuFill8(request.data, 0, 24);
    }
    request.powerSave = unk;
    request.authMode = unk2;
    result = WMi_SendCommandDirect(&request, sizeof(request));
    if (result == WM_ERRCODE_SUCCESS) {
        return WM_ERRCODE_OPERATING;
    }
    return result;
}

// A parent disconnects child `aid`, a child (aid 0) itself.
WMErrCode WM_Disconnect(WmCallback callback, u16 aid) {
    WmSystemWork *sys = WMi_GetSystemWork();
    WMErrCode result = WMi_CheckStateEx(5, WM_STATE_PARENT, WM_STATE_MP_PARENT, WM_STATE_CHILD, WM_STATE_MP_CHILD, WM_STATE_DCF_CHILD);

    if (result) {
        return result;
    }
    if (sys->status->state == WM_STATE_PARENT || sys->status->state == WM_STATE_MP_PARENT) {
        if (aid < 1 || aid > 15) {
            return WM_ERRCODE_INVALID_PARAM;
        }
        DC_InvalidateRange(&sys->status->childBitmap, 2);
        if (!(sys->status->childBitmap & (1 << aid))) {
            return WM_ERRCODE_NO_CHILD;
        }
    } else if (aid != 0) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    WMi_SetCallbackTable(WM_API_DISCONNECT, callback);
    result = WMi_SendCommand(WM_API_DISCONNECT, 1, 1 << aid);
    if (result == WM_ERRCODE_SUCCESS) {
        result = WM_ERRCODE_OPERATING;
    }
    return result;
}

WMErrCode WMi_StartMP(WmCallback callback, void *recvBuf, u16 recvBufSize, void *sendBuf, u16 sendBufSize, const WmMPParam *param) {
    WmStartMPRequest request;
    WmStatus *status = WMi_GetSystemWork()->status;
    WMErrCode result;

    result = WMi_CheckStateEx(2, WM_STATE_PARENT, WM_STATE_CHILD);
    if (result) {
        return result;
    }
    DC_InvalidateRange(&status->isChild, 2);
    DC_InvalidateRange(&status->pwrMgtMode, 2);
    if (status->isChild && status->pwrMgtMode != 1) {
        return WM_ERRCODE_ILLEGAL_STATE;
    }
    DC_InvalidateRange(&status->mpStarted, 4);
    if (status->mpStarted == 1) {
        return WM_ERRCODE_ILLEGAL_STATE;
    }
    if (recvBufSize & 63) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    if (sendBufSize & 31) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    DC_InvalidateRange(&status->ignoreSizePrecheckMode, 2);
    if (!status->ignoreSizePrecheckMode) {
        if (recvBufSize < WM_GetMPReceiveBufferSize()) {
            return WM_ERRCODE_INVALID_PARAM;
        }
        if (sendBufSize < WM_GetMPSendBufferSize()) {
            return WM_ERRCODE_INVALID_PARAM;
        }
    }
    WMi_SetCallbackTable(WM_API_START_MP, callback);
    MIi_CpuClear32(0, (u32 *)&request, sizeof(request));
    request.apiid = WM_API_START_MP;
    request.recvBuf = recvBuf;
    request.recvBufSize = (u32)recvBufSize >> 1;
    request.sendBuf = sendBuf;
    request.sendBufSize = sendBufSize;
    MIi_CpuClear32(0, (u32 *)request.unk_14, sizeof(request.unk_14));
    MIi_CpuCopy32((const u32 *)param, (u32 *)&request.param, sizeof(WmMPParam));
    result = WMi_SendCommandDirect(&request, sizeof(request));
    if (result == WM_ERRCODE_SUCCESS) {
        result = WM_ERRCODE_OPERATING;
    }
    return result;
}

WMErrCode WM_StartMPEx(WmCallback callback, void *recvBuf, u16 recvBufSize, void *sendBuf, u16 sendBufSize, u16 frequency, u16 defaultRetryCount, u32 minPollBmpMode, u32 singlePacketMode, BOOL fixFrequency, u32 ignoreFatalErrorMode) {
    WmMPParam param;

    MI_CpuClear32(&param, sizeof(param));
    param.flags = 0x1E03;
    param.minFrequency = frequency;
    param.frequency = frequency;
    param.defaultRetryCount = defaultRetryCount;
    param.minPollBmpMode = minPollBmpMode;
    param.singlePacketMode = singlePacketMode;
    param.ignoreFatalErrorMode = ignoreFatalErrorMode;
    if (fixFrequency && frequency) {
        param.flags |= 4;
        param.maxFrequency = frequency;
    }
    return WMi_StartMP(callback, recvBuf, recvBufSize, sendBuf, sendBufSize, &param);
}

WMErrCode WM_StartMP(WmCallback callback, void *recvBuf, u16 recvBufSize, void *sendBuf, u16 sendBufSize, u16 frequency) {
    WmMPParam param;

    MI_CpuClear32(&param, sizeof(param));
    param.flags = 3;
    param.minFrequency = frequency;
    param.frequency = frequency;
    return WMi_StartMP(callback, recvBuf, recvBufSize, sendBuf, sendBufSize, &param);
}

// Queues `length` bytes for the AIDs in aidBitmap on a port; `callback(arg)` reports the send.
WMErrCode WM_SetMPDataToPortEx(WmCallback callback, void *arg, const void *data, u16 length, u16 aidBitmap, u16 port, u16 priority) {
    int connected = 1;
    WmStatus *status = WMi_GetSystemWork()->status;
    WMErrCode result = WMi_CheckStateEx(2, WM_STATE_MP_PARENT, WM_STATE_MP_CHILD);

    if (result) {
        return result;
    }
    DC_InvalidateRange(&status->isChild, 2);
    if (!status->isChild) {
        DC_InvalidateRange(&status->childBitmap, 2);
        connected = status->childBitmap;
        DC_InvalidateRange(&status->readyBitmap, 2);
    }
    if (!data) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    if (!connected) {
        return WM_ERRCODE_NO_CHILD;
    }
    DC_InvalidateRange(&status->mpSendData, 2);
    if (data == status->mpSendData) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    if (length > 512) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    if (!length) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    DC_StoreRange(data, length);
    result = WMi_SendCommand(WM_API_SET_MP_DATA, 7, data, length, aidBitmap, port, priority, callback, arg);
    if (!result) {
        return WM_ERRCODE_OPERATING;
    }
    return result;
}

WMErrCode WM_EndMP(WmCallback callback) {
    WmSystemWork *sys = WMi_GetSystemWork();
    WMErrCode result = WMi_CheckStateEx(2, WM_STATE_MP_PARENT, WM_STATE_MP_CHILD);

    if (result) {
        return result;
    }
    DC_InvalidateRange(&sys->status->mpStarted, 4);
    if (!sys->status->mpStarted) {
        return WM_ERRCODE_ILLEGAL_STATE;
    }
    WMi_SetCallbackTable(WM_API_END_MP, callback);
    result = WMi_SendCommand(WM_API_END_MP, 0);
    if (!result) {
        result = WM_ERRCODE_OPERATING;
    }
    return result;
}

WMErrCode WM_StartDCF(WmCallback callback, void *recvBuf, u32 recvBufSize) {
    WmSystemWork *sys = WMi_GetSystemWork();
    WMErrCode result = WMi_CheckStateEx(1, WM_STATE_CHILD);

    if (result) {
        return result;
    }
    DC_InvalidateRange(&sys->status->dcfStarted, 4);
    if (sys->status->dcfStarted == 1) {
        return WM_ERRCODE_ILLEGAL_STATE;
    }
    if (recvBufSize < 16) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    if (!recvBuf) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    DC_StoreRange(recvBuf, recvBufSize);
    WMi_SetCallbackTable(WM_API_START_DCF, callback);
    result = WMi_SendCommand(WM_API_START_DCF, 2, recvBuf, recvBufSize);
    if (!result) {
        result = WM_ERRCODE_OPERATING;
    }
    return result;
}

WMErrCode WM_SetDCFData(WmCallback callback, const u8 *destAdr, const u16 *sendData, u16 sendDataSize) {
    WMErrCode result;
    WmSystemWork *sys;
    u32 wMac[2];

    sys = WMi_GetSystemWork();
    result = WMi_CheckStateEx(1, WM_STATE_DCF_CHILD);
    if (result != WM_ERRCODE_SUCCESS) {
        return result;
    }
    DC_InvalidateRange(&sys->status->dcfStarted, 4);
    if (sys->status->dcfStarted == 0) {
        return WM_ERRCODE_ILLEGAL_STATE;
    }
    if (sendDataSize > 0x5E4) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    DC_StoreRange((void *)sendData, sendDataSize);
    WMi_SetCallbackTable(WM_API_SET_DCF_DATA, callback);
    MI_CpuCopy8(destAdr, wMac, 6);
    result = WMi_SendCommand(WM_API_SET_DCF_DATA, 4, wMac[0], wMac[1], sendData, sendDataSize);
    if (result != WM_ERRCODE_SUCCESS) {
        return result;
    }
    return WM_ERRCODE_OPERATING;
}

WMErrCode WM_EndDCF(WmCallback callback) {
    WmSystemWork *sys = WMi_GetSystemWork();
    WMErrCode result = WMi_CheckStateEx(1, WM_STATE_DCF_CHILD);

    if (result) {
        return result;
    }
    DC_InvalidateRange(&sys->status->dcfStarted, 4);
    if (!sys->status->dcfStarted) {
        return WM_ERRCODE_ILLEGAL_STATE;
    }
    WMi_SetCallbackTable(WM_API_END_DCF, callback);
    result = WMi_SendCommand(WM_API_END_DCF, 0);
    if (!result) {
        result = WM_ERRCODE_OPERATING;
    }
    return result;
}
