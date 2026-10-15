#include <nitro.h>

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>
#include <nitro/wm/wm_internal.h>

// WM settings: key sharing (data sharing of 2-byte keys), WEP keys, the parent's game info, beacon
// indications, life times, channel measurement and the parent's entry flag.

#pragma force_active on

WMErrCode WM_StartKeySharing(WMKeySetBuf *buf, u16 port) {
    return WM_StartDataSharing(buf, port, 0xFFFF, 2, TRUE);
}

WMErrCode WM_EndKeySharing(WMKeySetBuf *buf) {
    return WM_EndDataSharing(buf);
}

// mode 0: no WEP; 1..3: the 80-byte key.
WMErrCode WM_SetWEPKey(WmCallback callback, u32 mode, const void *key) {
    WMErrCode result = WMi_CheckIdle();

    if (result) {
        return result;
    }
    if (mode > 3) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    if (mode) {
        if (!key) {
            return WM_ERRCODE_INVALID_PARAM;
        }
        DC_StoreRange(key, 80);
    }
    WMi_SetCallbackTable(WM_API_SET_WEP_KEY, callback);
    result = WMi_SendCommand(WM_API_SET_WEP_KEY, 2, mode, key);
    if (!result) {
        result = WM_ERRCODE_OPERATING;
    }
    return result;
}

WMErrCode WM_SetWEPKeyEx(WmCallback callback, u32 mode, u32 keyId, const void *key) {
    WMErrCode result = WMi_CheckIdle();

    if (result) {
        return result;
    }
    if (mode > 3) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    if (mode) {
        if (!key) {
            return WM_ERRCODE_INVALID_PARAM;
        }
        DC_StoreRange(key, 80);
    }
    WMi_SetCallbackTable(WM_API_SET_WEP_KEY_EX, callback);
    result = WMi_SendCommand(WM_API_SET_WEP_KEY_EX, 3, mode, key, keyId);
    if (!result) {
        result = WM_ERRCODE_OPERATING;
    }
    return result;
}

// Replaces the game info the parent sends in its beacons (copied to gWmGameInfo, at most 112 bytes).
WMErrCode WM_SetGameInfo(WmCallback callback, const void *gameInfo, u16 size, u32 unk, u16 unk2, u8 unk3) {
    WMErrCode result = WMi_CheckStateEx(2, WM_STATE_PARENT, WM_STATE_MP_PARENT);

    if (result) {
        return result;
    }
    if (!gameInfo) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    if (size > 112) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    MIi_CpuCopy16(gameInfo, (u16 *)gWmGameInfo, size);
    DC_StoreRange(gWmGameInfo, size);
    WMi_SetCallbackTable(WM_API_SET_GAME_INFO, callback);
    result = WMi_SendCommand(WM_API_SET_GAME_INFO, 5, gWmGameInfo, size, unk, unk2, unk3);
    if (!result) {
        result = WM_ERRCODE_OPERATING;
    }
    return result;
}

WMErrCode WM_SetBeaconIndication(WmCallback callback, u32 flag) {
    WMErrCode result = WMi_CheckIdle();

    if (result) {
        return result;
    }
    if (flag != 0 && flag != 1) {
        return WM_ERRCODE_INVALID_PARAM;
    }
    WMi_SetCallbackTable(WM_API_SET_BEACON_IND, callback);
    result = WMi_SendCommand(WM_API_SET_BEACON_IND, 1, flag);
    if (!result) {
        result = WM_ERRCODE_OPERATING;
    }
    return result;
}

WMErrCode WM_SetLifeTime(WmCallback callback, u16 unk, u16 unk2, u16 unk3, u16 unk4) {
    WMErrCode result = WMi_CheckIdle();

    if (result) {
        return result;
    }
    WMi_SetCallbackTable(WM_API_SET_LIFE_TIME, callback);
    result = WMi_SendCommand(WM_API_SET_LIFE_TIME, 4, unk, unk2, unk3, unk4);
    if (!result) {
        result = WM_ERRCODE_OPERATING;
    }
    return result;
}

WMErrCode WM_MeasureChannel(WmCallback callback, u16 unk, u16 unk2, u16 unk3, u16 unk4) {
    u16 request[5];
    WMErrCode result;

    WMi_GetSystemWork();
    result = WMi_CheckStateEx(1, WM_STATE_POWER_ON);
    if (result) {
        return result;
    }
    WMi_SetCallbackTable(WM_API_MEASURE_CHANNEL, callback);
    request[0] = WM_API_MEASURE_CHANNEL;
    request[1] = unk;
    request[2] = unk2;
    request[3] = unk3;
    request[4] = unk4;
    result = WMi_SendCommandDirect(request, sizeof(request));
    if (!result) {
        result = WM_ERRCODE_OPERATING;
    }
    return result;
}

WMErrCode WM_SetEntry(WmCallback callback, u32 flag) {
    WMErrCode result = WMi_CheckStateEx(2, WM_STATE_PARENT, WM_STATE_MP_PARENT);

    if (result) {
        return result;
    }
    WMi_SetCallbackTable(WM_API_SET_ENTRY, callback);
    result = WMi_SendCommand(WM_API_SET_ENTRY, 1, flag);
    if (!result) {
        result = WM_ERRCODE_OPERATING;
    }
    return result;
}
