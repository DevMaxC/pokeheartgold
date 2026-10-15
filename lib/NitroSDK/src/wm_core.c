#include <nitro.h>

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>
#include <nitro/wm/wm_internal.h>
#include <stdarg.h>

// WM core: initialisation of the shared buffers, request buffers sent to the ARM7 over the PXI FIFO,
// state checks, the FIFO reply handler that dispatches to the request / port callbacks, and status
// getters.

#define WM_FIFO_RECV_FLAGS (*(vu16 *)0x027FFF96)
#define WM_ALLOWED_CHANNEL (*(vu16 *)0x027FFCFA)
#define WM_VBLANK_COUNT    (*(vu32 *)HW_VBLANK_COUNT_BUF)

#pragma force_active on

WMErrCode WM_Init(void *buffer, u32 dma) {
    WMErrCode result = WmInitCore(buffer, dma, 0xF00);

    if (result) {
        return result;
    }
    gWmWork.sys->statusNoInvalidate = 0;
    return result;
}

#pragma push
#pragma opt_rotateloops off
#pragma opt_strength_reduction off

WMErrCode WmInitCore(WmSystemWork *buffer, u32 dma, u32 size) {
    OSIntrMode enabled = OS_DisableInterrupts();
    int i;

    if (gWmWork.initialized) {
        OS_RestoreInterrupts(enabled);
        return WM_ERRCODE_ILLEGAL_STATE;
    }
    if (!buffer) {
        OS_RestoreInterrupts(enabled);
        return WM_ERRCODE_INVALID_PARAM;
    }
    if (dma > 3) {
        OS_RestoreInterrupts(enabled);
        return WM_ERRCODE_INVALID_PARAM;
    }
    if ((u32)buffer & 31) {
        OS_RestoreInterrupts(enabled);
        return WM_ERRCODE_INVALID_PARAM;
    }
    PXI_Init();
    if (!PXI_IsCallbackReady(PXI_FIFO_TAG_WM, PXI_PROC_ARM7)) {
        OS_RestoreInterrupts(enabled);
        return WM_ERRCODE_WM_DISABLE;
    }
    DC_InvalidateRange(buffer, size);
    MI_DmaFill32(dma, buffer, 0, size);
    gWmWork.sys = buffer;
    buffer->arm7Work = (u8 *)buffer + 0x200;
    gWmWork.sys->status = (WmStatus *)((u8 *)gWmWork.sys->arm7Work + 0x300);
    gWmWork.sys->arm7Buffer = (u8 *)gWmWork.sys->status + WM_SIZE_STATUS;
    gWmWork.sys->fifoBuffer = (u8 *)gWmWork.sys->arm7Buffer + 0x100;
    WmClearFifoRecvFlag();
    gWmWork.sys->dma = dma;
    gWmWork.sys->connectedAids = 0;
    gWmWork.sys->aid = 0;
    for (i = 0; i < WM_PORT_COUNT; i++) {
        gWmWork.sys->portCallbacks[i] = NULL;
        gWmWork.sys->portCallbackArgs[i] = NULL;
    }
    OS_InitMessageQueue(&gWmCommandQueue, gWmCommandMessages, WM_COMMAND_BUFFER_COUNT);
    int j;
    for (j = 0; j < WM_COMMAND_BUFFER_COUNT; j++) {
        gWmCommandBuffers[j].apiid = 0x8000;
        DC_StoreRange(&gWmCommandBuffers[j], 2);
        OS_SendMessage(&gWmCommandQueue, &gWmCommandBuffers[j], OS_MESSAGE_BLOCK);
    }
    PXI_SetFifoRecvCallback(PXI_FIFO_TAG_WM, WmReceiveFifo);
    gWmWork.initialized = 1;
    OS_RestoreInterrupts(enabled);
    return WM_ERRCODE_SUCCESS;
}

#pragma pop

WMErrCode WM_Finish(void) {
    OSIntrMode enabled = OS_DisableInterrupts();
    WMErrCode result;

    if (WMi_CheckInitialized()) {
        OS_RestoreInterrupts(enabled);
        return WM_ERRCODE_ILLEGAL_STATE;
    }
    result = WMi_CheckStateEx(1, WM_STATE_INIT);
    if (result) {
        return result;
    }
    WmClearFifoRecvFlag();
    PXI_SetFifoRecvCallback(PXI_FIFO_TAG_WM, NULL);
    gWmWork.sys = NULL;
    gWmWork.initialized = 0;
    OS_RestoreInterrupts(enabled);
    return WM_ERRCODE_SUCCESS;
}

void WMi_SetCallbackTable(int apiid, WmCallback callback) {
    gWmWork.sys->callbacks[apiid] = callback;
}

// A free request buffer (bit 15 of its first halfword set by the ARM7), or NULL.
void *WmGetCommandBuffer4Arm7(void) {
    OSMessage message;

    if (!OS_ReceiveMessage(&gWmCommandQueue, &message, OS_MESSAGE_NOBLOCK)) {
        return NULL;
    }
    DC_InvalidateRange(message, 2);
    if (*(u16 *)message & 0x8000) {
        return message;
    }
    OS_JamMessage(&gWmCommandQueue, message, OS_MESSAGE_BLOCK);
    return NULL;
}

// Request `apiid` with `paramNum` u32 parameters.
WMErrCode WMi_SendCommand(u16 apiid, u16 paramNum, ...) {
    va_list vlist;
    int i;
    u32 *buf;
    s32 result;

    buf = WmGetCommandBuffer4Arm7();
    if (buf == NULL) {
        return WM_ERRCODE_FIFO_ERROR;
    }
    *(u16 *)buf = apiid;
    va_start(vlist, paramNum);
    for (i = 0; i < paramNum; i++) {
        buf[i + 1] = *(u32 *)((vlist += 4) - 4);
    }
    va_end(vlist);
    DC_StoreRange(buf, 0x100);
    result = PXI_SendWordByFifo(PXI_FIFO_TAG_WM, (u32)buf, FALSE);
    OS_SendMessage(&gWmCommandQueue, buf, OS_MESSAGE_BLOCK);
    if (result < 0) {
        return WM_ERRCODE_FIFO_ERROR;
    }
    return WM_ERRCODE_OPERATING;
}

// Request with a request block built by the caller (starting with the API id).
WMErrCode WMi_SendCommandDirect(const void *data, u32 size) {
    void *buffer = WmGetCommandBuffer4Arm7();
    int result;

    if (!buffer) {
        return WM_ERRCODE_FIFO_ERROR;
    }
    MI_CpuCopy8(data, buffer, size);
    DC_StoreRange(buffer, size);
    result = PXI_SendWordByFifo(PXI_FIFO_TAG_WM, (u32)buffer, FALSE);
    OS_SendMessage(&gWmCommandQueue, buffer, OS_MESSAGE_BLOCK);
    return result < 0 ? WM_ERRCODE_FIFO_ERROR : WM_ERRCODE_OPERATING;
}

WmSystemWork *WMi_GetSystemWork(void) {
    return gWmWork.sys;
}

WMErrCode WMi_CheckInitialized(void) {
    return gWmWork.initialized ? WM_ERRCODE_SUCCESS : WM_ERRCODE_ILLEGAL_STATE;
}

WMErrCode WMi_CheckIdle(void) {
    WMErrCode result = WMi_CheckInitialized();

    if (result) {
        return result;
    }
    DC_InvalidateRange(&gWmWork.sys->status->state, 2);
    return gWmWork.sys->status->state <= WM_STATE_ENABLED ? WM_ERRCODE_ILLEGAL_STATE : WM_ERRCODE_SUCCESS;
}

// WM_ERRCODE_SUCCESS if the state is one of the `count` states that follow.
WMErrCode WMi_CheckStateEx(int count, ...) {
    va_list ap;
    WMErrCode result = WMi_CheckInitialized();
    u16 state;

    if (result) {
        return result;
    }
    DC_InvalidateRange(&gWmWork.sys->status->state, 2);
    state = gWmWork.sys->status->state;
    va_start(ap, count);
    result = WM_ERRCODE_ILLEGAL_STATE;
    while (count) {
        if (*(int *)((ap += 4) - 4) == state) {
            result = WM_ERRCODE_SUCCESS;
        }
        count--;
    }
    va_end(ap);
    return result;
}

// PXI FIFO handler: a reply of the ARM7 (u16 API id first). Calls the request's callback; parent
// connect / child connect replies are also passed to every port callback as a WmPortEvent.
void WmReceiveFifo(PXIFifoTag tag, u32 data, BOOL err) {
    WmSystemWork *sys = gWmWork.sys;
    u8 *reply = (u8 *)data;
    u16 state, aid, myAid, unk_3C;
    u8 *info;
    u16 size1, size2, i;
    u8 *macAddress;
    WmCallback callback;

    if (err) {
        return;
    }
    DC_InvalidateRange(sys->fifoBuffer, 0x100);
    if (sys->statusNoInvalidate == 0) {
        DC_InvalidateRange(sys->status, WM_SIZE_STATUS);
    }
    if (reply != sys->fifoBuffer) {
        DC_InvalidateRange(reply, 0x100);
    }

    if (*(u16 *)reply >= WM_API_REQUEST_COUNT) {
        if (*(u16 *)reply == WM_API_INDICATION) {
            if (*(u16 *)(reply + 2) == 19) {
                OS_Terminate();
            }
            if (sys->callbacks[WM_API_REQUEST_COUNT]) {
                sys->callbacks[WM_API_REQUEST_COUNT](reply);
            }
        } else if (*(u16 *)reply == WM_API_PORT_RECEIVE) {
            WmPortEvent *event = (WmPortEvent *)reply;
            if (sys->portCallbacks[event->port]) {
                event->arg = sys->portCallbackArgs[event->port];
                event->connectedAids = sys->connectedAids;
                DC_InvalidateRange(event->recvBuf, sys->status->mpReceiveDataSize);
                sys->portCallbacks[event->port](reply);
            }
        } else if (*(u16 *)reply == WM_API_CALL_CALLBACK) {
            *(u16 *)reply = WM_API_SET_MP_DATA;
            callback = *(WmCallback *)(reply + 0x1C);
            if (callback) {
                callback(reply);
            }
        }
        goto end;
    }
    if (*(u16 *)reply == WM_API_START_MP && (u16)(*(u16 *)(reply + 4) + 0xFFF5) <= 1 && *(u16 *)(reply + 2) == 0) {
        DC_InvalidateRange(*(void **)(reply + 8), sys->status->mpReceiveDataSize);
    }
    if (*(u16 *)reply == WM_API_END && *(u16 *)(reply + 2) == 0) {
        callback = sys->callbacks[*(u16 *)reply];
        WM_Finish();
        if (callback) {
            callback(reply);
        }
        return;
    }
    if (sys->callbacks[*(u16 *)reply]) {
        sys->callbacks[*(u16 *)reply](reply);
        if (gWmWork.initialized == 0) {
            return;
        }
    }
    if (*(u16 *)reply != WM_API_START_PARENT && *(u16 *)reply != WM_API_START_CONNECT) {
        goto end;
    }
    if (*(u16 *)reply == WM_API_START_PARENT) {
        macAddress = reply + 10;
        state = *(u16 *)(reply + 8);
        aid = *(u16 *)(reply + 16);
        unk_3C = *(u16 *)(reply + 18);
        info = reply + 20;
        myAid = 0;
        size1 = *(u16 *)(reply + 44);
        size2 = *(u16 *)(reply + 46);
    } else if (*(u16 *)reply == WM_API_START_CONNECT) {
        state = *(u16 *)(reply + 8);
        myAid = *(u16 *)(reply + 10);
        unk_3C = *(u16 *)(reply + 12);
        aid = 0;
        info = NULL;
        macAddress = reply + 16;
        size1 = *(u16 *)(reply + 22);
        size2 = *(u16 *)(reply + 24);
    }
    if (state != WM_EVENT_CONNECTED && state != WM_EVENT_DISCONNECTED && state != WM_EVENT_26) {
        goto end;
    }
    if (state == WM_EVENT_CONNECTED) {
        sys->connectedAids |= 1 << aid;
    } else {
        sys->connectedAids &= ~(1 << aid);
    }
    sys->aid = myAid;
    MI_CpuFill8(&gWmPortEvent, 0, sizeof(WmPortEvent));
    gWmWork.portEvent.apiid = WM_API_PORT_RECEIVE;
    gWmWork.portEvent.errcode = WM_ERRCODE_SUCCESS;
    gWmWork.portEvent.state = state;
    gWmWork.portEvent.recvBuf = NULL;
    gWmWork.portEvent.data = NULL;
    gWmWork.portEvent.length = 0;
    gWmWork.portEvent.aid = aid;
    gWmWork.portEvent.myAid = myAid;
    gWmWork.portEvent.connectedAids = sys->connectedAids;
    gWmWork.portEvent.seqNo = 0xFFFF;
    gWmWork.portEvent.reason = unk_3C;
    MI_CpuCopy8(macAddress, gWmPortEventMacAddress, 6);
    if (info) {
        MIi_CpuCopy16((const u16 *)info, gWmPortEventData, 24);
    } else {
        MIi_CpuClear16(0, gWmPortEventData, 24);
    }
    gWmWork.portEvent.maxSendDataSize = myAid == 0 ? size1 : size2;
    gWmWork.portEvent.maxRecvDataSize = myAid == 0 ? size2 : size1;
    for (i = 0; i < WM_PORT_COUNT; i++) {
        gWmWork.portEvent.port = i;
        if (sys->portCallbacks[i]) {
            gWmWork.portEvent.arg = sys->portCallbackArgs[i];
            sys->portCallbacks[i](&gWmPortEvent);
        }
    }
end:
    DC_InvalidateRange(sys->fifoBuffer, 0x100);
    WmClearFifoRecvFlag();
    if (reply != sys->fifoBuffer) {
        *(u16 *)reply |= 0x8000;
        DC_StoreRange(reply, 0x100);
    }
}

void WmClearFifoRecvFlag(void) {
    u16 flags = WM_FIFO_RECV_FLAGS;

    if (flags & 1) {
        WM_FIFO_RECV_FLAGS = flags & ~1;
    }
}

WmStatus *WMi_GetStatusAddress(void) {
    if (WMi_CheckInitialized()) {
        return NULL;
    }
    return gWmWork.sys->status;
}

u16 WM_GetAID(void) {
    u16 aid;
    OSIntrMode enabled = OS_DisableInterrupts();
    WmSystemWork *sys = gWmWork.sys;

    if (sys) {
        aid = sys->aid;
    } else {
        aid = 0;
    }
    OS_RestoreInterrupts(enabled);
    return aid;
}

u16 WM_GetConnectedAIDs(void) {
    int aids;
    OSIntrMode enabled = OS_DisableInterrupts();
    WmSystemWork *sys = gWmWork.sys;

    if (sys) {
        aids = sys->connectedAids;
    } else {
        aids = 0;
    }
    OS_RestoreInterrupts(enabled);
    return aids;
}

WMErrCode WM_SetIndCallback(WmCallback callback) {
    OSIntrMode enabled = OS_DisableInterrupts();
    WMErrCode result = WMi_CheckInitialized();

    if (result) {
        OS_RestoreInterrupts(enabled);
        return result;
    }
    WMi_GetSystemWork()->callbacks[WM_API_REQUEST_COUNT] = callback;
    OS_RestoreInterrupts(enabled);
    return WM_ERRCODE_SUCCESS;
}

// Sets the callback of a port; a new callback is called at once with a WM_EVENT_PORT_INIT event.
WMErrCode WM_SetPortCallback(u16 port, WmCallback callback, void *arg) {
    WmPortEvent event;
    OSIntrMode enabled;
    WMErrCode result;
    WmSystemWork *sys;

    if (callback) {
        MI_CpuFill8(&event, 0, sizeof(event));
        event.apiid = WM_API_PORT_RECEIVE;
        event.errcode = WM_ERRCODE_SUCCESS;
        event.state = WM_EVENT_PORT_INIT;
        event.port = port;
        event.recvBuf = NULL;
        event.data = NULL;
        event.length = 0;
        event.seqNo = 0xFFFF;
        event.arg = arg;
        event.aid = 0;
        OS_GetMacAddress(event.macAddress);
    }
    enabled = OS_DisableInterrupts();
    result = WMi_CheckInitialized();
    if (result) {
        OS_RestoreInterrupts(enabled);
        return result;
    }
    sys = WMi_GetSystemWork();
    sys->portCallbacks[port] = callback;
    sys->portCallbackArgs[port] = arg;
    if (callback) {
        event.connectedAids = WM_GetConnectedAIDs();
        event.myAid = WM_GetAID();
        callback(&event);
    }
    OS_RestoreInterrupts(enabled);
    return WM_ERRCODE_SUCCESS;
}

WMErrCode WM_ReadStatus(WmStatus *status) {
    WmSystemWork *sys = WMi_GetSystemWork();
    WMErrCode result = WMi_CheckInitialized();

    if (result) {
        return result;
    }
    if (!status) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    DC_InvalidateRange(sys->status, 0x7D0);
    MIi_CpuCopyFast((u32 *)sys->status, (u32 *)status, 0x7D0);
    return WM_ERRCODE_SUCCESS;
}

int WM_GetMPSendBufferSize(void) {
    WmSystemWork *sys = WMi_GetSystemWork();
    WmStatus *status;

    if (WMi_CheckStateEx(2, WM_STATE_PARENT, WM_STATE_CHILD)) {
        return 0;
    }
    DC_InvalidateRange(&sys->status->mpStarted, 4);
    status = sys->status;
    if (status->mpStarted == 1) {
        return 0;
    }
    DC_InvalidateRange(&status->mpSendSize, 4);
    return (sys->status->mpSendSize + 31) & ~31;
}

int WM_GetMPReceiveBufferSize(void) {
    WmSystemWork *sys = WMi_GetSystemWork();
    WmStatus *status;
    int isParent, size;

    if (WMi_CheckStateEx(2, WM_STATE_PARENT, WM_STATE_CHILD)) {
        return 0;
    }
    DC_InvalidateRange(&sys->status->mpStarted, 4);
    status = sys->status;
    if (status->mpStarted == 1) {
        return 0;
    }
    DC_InvalidateRange(&status->isChild, 2);
    status = sys->status;
    isParent = status->isChild == 0;
    DC_InvalidateRange(&status->mpReceiveSize, 2);
    status = sys->status;
    size = status->mpReceiveSize;
    if (isParent == 1) {
        DC_InvalidateRange(&status->mpChildCount, 2);
        return (((size + 12) * sys->status->mpChildCount + 0x29) & ~31) * 2;
    } else {
        return ((size + 0x51) & ~31) * 2;
    }
}

// Entry of child `aid` in an MP receive buffer, or NULL.
void *WM_ReadMPData(WmMPReceiveBuffer *buffer, u16 aid) {
    WmSystemWork *sys = WMi_GetSystemWork();
    u8 *entry[15];
    int i;

    if (WMi_CheckInitialized()) {
        return NULL;
    }
    if (aid < 1 || aid > 15) {
        return NULL;
    }
    DC_InvalidateRange(&sys->status->childBitmap, 2);
    if (!(sys->status->childBitmap & (1 << aid))) {
        return NULL;
    }
    if (buffer->count == 0) {
        return NULL;
    }
    entry[0] = buffer->data;
    i = 0;
    do {
        if (*(u16 *)(entry[i] + 4) == aid) {
            return entry[i];
        }
        i++;
        entry[i] = (u8 *)(buffer->stride + (u32)entry[i - 1]);
    } while (i < buffer->count);
    return NULL;
}

u16 WM_GetAllowedChannel(void) {
    if (WMi_CheckInitialized()) {
        return 0x8000;
    }
    return WM_ALLOWED_CHANNEL;
}

u16 WM_GetLinkLevel(void) {
    WmSystemWork *sys = WMi_GetSystemWork();
    WmStatus *status;

    if (WMi_CheckInitialized()) {
        return 0;
    }
    DC_InvalidateRange(sys->status, 2);
    status = sys->status;
    switch (status->state) {
    case WM_STATE_MP_PARENT:
        DC_InvalidateRange(&status->childBitmap, 2);
        status = sys->status;
        if (!status->childBitmap) {
            return 0;
        }
    case WM_STATE_MP_CHILD:
    case WM_STATE_DCF_CHILD:
        DC_InvalidateRange(&status->linkLevel, 2);
        return sys->status->linkLevel;
    default:
        return 0;
    }
}

// Beacon period spread by the MAC address and the VBlank count: 200..219.
u16 WM_GetDispersionBeaconPeriod(void) {
    u8 macAddress[6];
    u16 sum;
    int i;

    OS_GetMacAddress(macAddress);
    i = 0;
    sum = i;
    for (; i < 6; i++) {
        sum += macAddress[i];
    }
    sum += WM_VBLANK_COUNT;
    sum *= 7;
    return (sum % 20) + 200;
}

// Scan period spread the same way: 30..39.
u16 WM_GetDispersionScanPeriod(void) {
    u8 macAddress[6];
    u16 sum;
    int i;

    OS_GetMacAddress(macAddress);
    i = 0;
    sum = 0;
    for (; i < 6; i++) {
        sum += macAddress[i];
    }
    sum += WM_VBLANK_COUNT;
    sum *= 13;
    return (sum % 10) + 30;
}

WMOtherElementResults WM_GetOtherElements(WMBssDescView *bss) {
    WMBssDescView *desc = bss;
    u8 *p;
    WMOtherElementResults elems;
    int i;
    u8 elemLen;
    u8 total;

    if (desc->gameInfoLength != 0) {
        elems.count = 0;
        return elems;
    }
    elems.count = (u8)desc->otherElementCount;
    if (elems.count == 0) {
        return elems;
    }
    if (elems.count > 16) {
        elems.count = 16;
    }
    p = desc->elements;
    elemLen = (u8)(desc->length * 2 - 0x40);
    total = 0;
    i = 0;
    if (i < elems.count) {
        do {
            u8 len;
            elems.element[i].id = p[0];
            elems.element[i].length = p[1];
            elems.element[i].body = p + 2;
            len = (u8)(elems.element[i].length + 2);
            total = (u8)(total + len);
            if (total > elemLen) {
                elems.count = 0;
                return elems;
            }
            p += len;
            i++;
        } while (i < elems.count);
    }
    return elems;
}
