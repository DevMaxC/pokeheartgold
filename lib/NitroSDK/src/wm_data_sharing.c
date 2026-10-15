#include <nitro.h>

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>
#include <nitro/wm/wm_internal.h>

// WM data sharing: every station contributes `dataLength` bytes per frame; the parent collects them into
// a data set (WMDataSet: AID bitmaps + the stations' data in AID order) and sends it to all children
// over MP. Four data sets rotate (writeIndex / sendIndex / readIndex); WM_StepDataSharing advances one
// frame.

#define DATA_SHARING_STATE_READY 1
#define DATA_SHARING_STATE_RETRY 4 // the last send was refused (queue full): send again
#define DATA_SHARING_STATE_ERROR 5

// WM_SetMPDataToPortEx reply.
typedef struct WmSetMPDataEvent {
    u16 apiid;
    u16 errcode;
    u8 unk_04[6];
    u16 port; // 0x0A
    u8 unk_0C[0xE];
    u16 seqNo; // 0x1A
    u8 unk_1C[4];
    void *arg; // 0x20
} WmSetMPDataEvent;

#pragma force_active on

WMErrCode WM_StartDataSharing(WMDataSharingInfo *info, u16 port, u16 aidBitmap, u16 dataLength, BOOL doubleMode) {
    WMDataSet *dataSet;
    WMErrCode result;
    int i;
    u16 members;
    u32 stationNumber;
    u16 aid, connected;

    connected = 1;
    result = WMi_CheckStateEx(2, WM_STATE_MP_PARENT, WM_STATE_MP_CHILD);
    if (result) {
        return result;
    }
    if (!info) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    if (port >= WM_PORT_COUNT) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    if (!aidBitmap) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    aid = WM_GetAID();
    if (!aid) {
        connected = WM_GetConnectedAIDs();
    }
    MIi_CpuClearFast(0, (u32 *)info, sizeof(WMDataSharingInfo));
    info->writeIndex = 0;
    info->sendIndex = 0;
    info->readIndex = 0;
    info->dataLength = dataLength;
    info->port = port;
    info->aidBitmap = 0;
    info->doubleMode = doubleMode ? 1 : 0;
    members = aidBitmap | (1u << aid);
    info->aidBitmap = members;
    stationNumber = MATH_CountPopulation(members);
    info->stationNumber = stationNumber;
    info->dataSetLength = dataLength * stationNumber;
    if (info->dataSetLength > 508) {
        info->aidBitmap = 0;
        return WM_ERRCODE_INVALID_PARAM;
    }
    info->dataSetLength += 4;
    info->state = DATA_SHARING_STATE_READY;

    if (!aid) {
        u32 present = connected | 1;
        for (i = 0; i < 4; i++) {
            info->ds[i].aidBitmap = info->aidBitmap & present;
        }
        WM_SetPortCallback(port, WmDataSharingReceiveCallback_Parent, info);
        dataSet = info->ds;
        for (i = 0; i < (info->doubleMode == 1 ? 2 : 1); dataSet++, i++) {
            info->writeIndex = (info->writeIndex + 1) & 3;
            result = WM_SetMPDataToPortEx(WmDataSharingSetDataCallback, info, dataSet, info->dataSetLength, (u16)(info->aidBitmap & connected), info->port, 1);
            if (result == WM_ERRCODE_NO_CHILD) {
                info->seqNum[i] = 0xFFFF;
                info->sendIndex = (info->sendIndex + 1) & 3;
            } else if (result != WM_ERRCODE_SUCCESS && result != WM_ERRCODE_OPERATING) {
                info->state = DATA_SHARING_STATE_ERROR;
                return WM_ERRCODE_FAILED;
            }
        }
    } else {
        info->sendIndex = 3;
        WM_SetPortCallback(port, WmDataSharingReceiveCallback_Child, info);
    }
    return WM_ERRCODE_SUCCESS;
}

WMErrCode WM_EndDataSharing(WMDataSharingInfo *info) {
    if (!info) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    if (!info->aidBitmap) {
        return WM_ERRCODE_ILLEGAL_STATE;
    }
    WM_SetPortCallback(info->port, NULL, NULL);
    info->aidBitmap = 0;
    info->state = 0;
    return WM_ERRCODE_SUCCESS;
}

// Child: put its data into the data set it sends next.
static inline WMErrCode SubmitChildData(WMDataSharingInfo *info, const void *sendData, WMErrCode result) {
    int status;
    WMDataSet *dest = &info->ds[info->sendIndex];

    MIi_CpuCopy16(sendData, &dest->data[14], info->dataLength);
    status = WM_SetMPDataToPortEx(WmDataSharingSetDataCallback, info, &dest->data[14], info->dataLength, info->aidBitmap, info->port, 1);
    info->sendIndex = (info->sendIndex + 1u) & 3u;
    if (status != WM_ERRCODE_OPERATING && status != WM_ERRCODE_SUCCESS) {
        info->state = DATA_SHARING_STATE_ERROR;
        result = WM_ERRCODE_FAILED;
    }
    return result;
}

// One frame: copies the next complete data set to receiveData and contributes sendData.
// WM_ERRCODE_NO_DATASET if no data set is complete yet.
WMErrCode WM_StepDataSharing(WMDataSharingInfo *info, const void *sendData, void *receiveData) {
    WMErrCode status;
    u16 aid, connected;
    WMErrCode result;

    status = WMi_CheckStateEx(2, WM_STATE_MP_PARENT, WM_STATE_MP_CHILD);
    if (status) {
        return status;
    }
    if (!info) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    if (!sendData) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    if (!receiveData) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    aid = WM_GetAID();
    if (!aid) {
        connected = WM_GetConnectedAIDs();
    }
    if (info->state == DATA_SHARING_STATE_ERROR) {
        return WM_ERRCODE_FAILED;
    }
    if (info->state != DATA_SHARING_STATE_READY && info->state != DATA_SHARING_STATE_RETRY) {
        return WM_ERRCODE_ILLEGAL_STATE;
    }
    result = WM_ERRCODE_NO_DATASET;
    if (!aid) {
        int parentReceived = 0, empty = 0;
        if (info->state == DATA_SHARING_STATE_RETRY) {
            u32 index;
            info->state = DATA_SHARING_STATE_READY;
            index = (info->writeIndex + 3u) & 3u;
            status = WM_SetMPDataToPortEx(WmDataSharingSetDataCallback, info, &info->ds[index], info->dataSetLength, (u16)(info->aidBitmap & connected), info->port, 1);
            if (status == WM_ERRCODE_NO_CHILD) {
                info->seqNum[index] = 0xFFFF;
                info->sendIndex = (info->sendIndex + 1u) & 3u;
            } else if (status != WM_ERRCODE_SUCCESS && status != WM_ERRCODE_OPERATING) {
                info->state = DATA_SHARING_STATE_ERROR;
                return WM_ERRCODE_FAILED;
            }
        }
        if (info->readIndex != info->sendIndex) {
            info->ds[info->readIndex].aidBitmap |= 1;
            MIi_CpuCopy16((const u16 *)&info->ds[info->readIndex], receiveData, sizeof(WMDataSet));
            info->currentSeqNum = info->seqNum[info->readIndex];
            info->readIndex = (info->readIndex + 1u) & 3u;
            parentReceived = 1;
            result = WM_ERRCODE_SUCCESS;
            if (!info->doubleMode && connected && info->ds[info->writeIndex].aidBitmap == 1) {
                empty = 1;
            } else {
                empty = 0;
            }
        }
        WmDataSharingSendDataSet(info, FALSE);
        if (parentReceived) {
            WmDataSharingReceiveData(info, 0, sendData);
            if (!info->doubleMode) {
                WmDataSharingSendDataSet(info, empty);
            }
        }
    } else {
        int childSubmit = 0;
        if (info->state == DATA_SHARING_STATE_RETRY) {
            childSubmit = 1;
            info->state = DATA_SHARING_STATE_READY;
        } else if (info->readIndex != info->writeIndex) {
            if (!(info->ds[info->readIndex].aidBitmap & 1)) {
                info->ds[info->readIndex].aidBitmap |= 1;
            } else {
                MIi_CpuCopy16((const u16 *)&info->ds[info->readIndex], receiveData, sizeof(WMDataSet));
                info->currentSeqNum = info->seqNum[info->readIndex];
                info->readIndex = (info->readIndex + 1u) & 3u;
                childSubmit = 1;
                result = WM_ERRCODE_SUCCESS;
            }
        }
        if (childSubmit) {
            result = SubmitChildData(info, sendData, result);
        }
    }
    return result;
}

// WM_SetMPDataToPortEx callback: records the sequence number of the sent data set.
void WmDataSharingSetDataCallback(void *arg) {
    WmSetMPDataEvent *event = arg;
    WmSystemWork *sys = WMi_GetSystemWork();
    WMDataSharingInfo *info = sys->portCallbackArgs[event->port];
    WmCallback callback = sys->portCallbacks[event->port];
    u16 aid;

    if (callback != WmDataSharingReceiveCallback_Parent && callback != WmDataSharingReceiveCallback_Child) {
        return;
    }
    if (!info) {
        return;
    }
    if (info != event->arg) {
        return;
    }
    aid = WM_GetAID();
    if (event->errcode == WM_ERRCODE_SUCCESS) {
        if (aid != 0) {
            return;
        }
        info->seqNum[info->sendIndex] = event->seqNo >> 1;
        info->sendIndex = (info->sendIndex + 1) & 3;
    } else if (event->errcode == WM_ERRCODE_SEND_QUEUE_FULL) {
        if (aid != 0) {
            info->sendIndex = (info->sendIndex + 3) & 3;
        }
        info->state = DATA_SHARING_STATE_RETRY;
    } else {
        info->state = DATA_SHARING_STATE_ERROR;
    }
}

// Parent port callback: stores a child's data, drops a child that left from the pending data sets.
#pragma push
#pragma opt_propagation off
#pragma opt_dead_assignments off

void WmDataSharingReceiveCallback_Parent(void *arg) {
    WmPortEvent *event = arg;
    WMDataSharingInfo *info = event->arg;

    if (!info) {
        return;
    }
    if (!event->errcode) {
        switch (event->state) {
        case WM_EVENT_PORT_RECEIVE:
            WmDataSharingReceiveData(info, event->aid, event->data);
            WmDataSharingSendDataSet(info, FALSE);
            break;
        case WM_EVENT_CONNECTED:
            WmDataSharingSendDataSet(info, FALSE);
            break;
        case WM_EVENT_DISCONNECTED:
        case WM_EVENT_26: {
            u16 aid = event->aid;
            u32 one = 1;
            OSIntrMode enabled = OS_DisableInterrupts();
            u16 index = info->writeIndex;
            u32 mask = ~(one << aid);
            info->ds[index].aidBitmap &= mask;
            if (info->doubleMode == 1) {
                info->ds[(u16)((index + 1) & 3)].aidBitmap &= mask;
            }
            OS_RestoreInterrupts(enabled);
            WmDataSharingSendDataSet(info, FALSE);
            if (info->doubleMode == 1) {
                WmDataSharingSendDataSet(info, FALSE);
            }
            break;
        }
        case WM_EVENT_PORT_INIT:
            break;
        }
    } else {
        info->state = DATA_SHARING_STATE_ERROR;
    }
}

#pragma pop

// Child port callback: stores a data set from the parent that includes this child.
void WmDataSharingReceiveCallback_Child(void *arg) {
    WmPortEvent *event = arg;
    WMDataSharingInfo *info = event->arg;
    u16 length, aidBitmap;
    const u16 *data;
    u16 aid;

    if (!info) {
        return;
    }
    if (!event->errcode) {
        switch (event->state) {
        case WM_EVENT_CONNECTED:
        case WM_EVENT_DISCONNECTED:
        case WM_EVENT_PORT_INIT:
        case WM_EVENT_26:
        default:
            return;
        case WM_EVENT_PORT_RECEIVE:
            break;
        }
        data = event->data;
        length = event->length;
        aidBitmap = *data;
        aid = WM_GetAID();
        if (length != info->dataSetLength) {
            if (length > 512) {
                length = 512;
            }
        }
        if (length < 4) {
            return;
        }
        if (!(aidBitmap & (1 << aid))) {
            return;
        }
        MIi_CpuCopy16(data, (u16 *)&info->ds[info->writeIndex], length);
        info->seqNum[info->writeIndex] = event->seqNo >> 1;
        info->writeIndex = (info->writeIndex + 1) & 3;
    } else {
        info->state = DATA_SHARING_STATE_ERROR;
    }
}

// Parent: puts station `aid`'s data (NULL: zeros) into the data set being collected.
void WmDataSharingReceiveData(WMDataSharingInfo *info, u32 aid, const void *data) {
    u16 bit = (u16)(1U << aid);
    u32 aidBitmap = info->aidBitmap;
    u32 index;

    if (!(aidBitmap & bit)) {
        return;
    }
    index = info->writeIndex;
    if (!(info->ds[index].aidBitmap & bit)) {
        if (info->doubleMode != 1) {
            return;
        }
        index = (index + 1) & 3;
        if (!(info->ds[index].aidBitmap & bit)) {
            return;
        }
    }
    void *dest = WmGetSharedDataAddress(info, aidBitmap, info->ds[index].data, aid);
    if (data) {
        MIi_CpuCopy16(data, dest, info->dataLength);
    } else {
        MIi_CpuClear16(0, dest, info->dataLength);
    }
    OSIntrMode enabled = OS_DisableInterrupts();
    info->ds[index].aidBitmap &= ~bit;
    info->ds[index].receivedBitmap |= bit;
    OS_RestoreInterrupts(enabled);
}

// Parent: once every station's data is in the current data set, sends it and starts the next one.
void WmDataSharingSendDataSet(WMDataSharingInfo *info, BOOL excludeParent) {
    OSIntrMode enabled = OS_DisableInterrupts();
    int index, next, clear, status;
    u16 connected;

    if (!info->ds[info->writeIndex].aidBitmap) {
        connected = WM_GetConnectedAIDs();
        index = info->writeIndex;
        next = (index + 1) & 3;
        if (info->doubleMode == 1) {
            clear = (next + 1) & 3;
        } else {
            clear = next;
        }
        MI_CpuClear16(&info->ds[clear], sizeof(WMDataSet));
        info->ds[clear].aidBitmap = info->aidBitmap & (connected | 1);
        info->writeIndex = next;
        info->ds[index].aidBitmap = info->aidBitmap;
        if (excludeParent == TRUE) {
            info->ds[index].aidBitmap &= ~1;
        }
        OS_RestoreInterrupts(enabled);
        status = WM_SetMPDataToPortEx(WmDataSharingSetDataCallback, info, &info->ds[index], info->dataSetLength, info->aidBitmap & connected, info->port, 1);
        if (status == WM_ERRCODE_NO_CHILD) {
            info->seqNum[index] = 0xFFFF;
            info->sendIndex = (info->sendIndex + 1) & 3;
        } else {
            if (status == WM_ERRCODE_SUCCESS || status == WM_ERRCODE_OPERATING) {
                return;
            }
            info->state = DATA_SHARING_STATE_ERROR;
        }
    } else {
        OS_RestoreInterrupts(enabled);
    }
}

// Station `aid`'s data in a received data set, or NULL if it is not in it.
#pragma push
#pragma opt_propagation off

void *WM_GetSharedDataAddress(WMDataSharingInfo *info, WMDataSet *dataSet, int aid) {
    u32 aidBitmap = dataSet->aidBitmap, receivedBitmap = dataSet->receivedBitmap;
    int mask = 1;

    if (!info) {
        return NULL;
    }
    if (!dataSet) {
        return NULL;
    }
    if (!(aidBitmap & (mask << aid))) {
        return NULL;
    }
    if (!(receivedBitmap & (mask << aid))) {
        return NULL;
    }
    return WmGetSharedDataAddress(info, aidBitmap, dataSet->data, aid);
}

#pragma pop

// The stations' data follow each other in AID order.
void *WmGetSharedDataAddress(WMDataSharingInfo *info, u32 aidBitmap, void *data, int aid) {
    int count = MATH_CountPopulation(aidBitmap & ((1u << aid) - 1));

    return (u8 *)data + info->dataLength * count;
}
