#include "dwc/dwc_bm_internal.h"

// Wi-Fi user id: the pseudo user id is derived from the MAC address and a random salt (seeded from
// the RTC), scrambled with fixed tables; the user id proper is assigned at the first log-in.

#define NINTENDO_OUI 0x0009BF

#pragma force_active on

// Scrambles salt (16 bits), the NIC part of the MAC address (24 bits) and two flag bits into a
// 43-bit pseudo user id.
u64 DWCi_Util_WiFiId_scrambleUid(u32 salt, u32 macNic, u8 nonNintendoOui, u32 zero) {
    union Word {
        u64 value;

        struct {
            u32 low, high;
        } words;

        u8 bytes[8];
    };
    union Word current, snapshot;
    u8 *p;
    int i;

    current.value = ((u64)zero & 3) | (((u64)nonNintendoOui & 1) << 2) | (((u64)macNic & 0xFFFFFF) << 3) | (((u64)salt & 0xFFFF) << 27);
    p = current.bytes;
    for (i = 0; i < 6; i++) {
        *p ^= 0xD6;
        p++;
    };
    p = current.bytes;
    for (i = 0; i < 5; i++) {
        u8 x = *p;

        *p++ = (DWCi_util_wifiid_ttable[(x >> 4) & 15] << 4) | DWCi_util_wifiid_ttable[x & 15];
    }
    MI_CpuCopy8(&current, &snapshot, 8);
    for (i = 0; i < 5; i++) {
        current.bytes[DWCi_util_wifiid_exctable[i]] = snapshot.bytes[i];
    }
    p = current.bytes;
    current.bytes[5] &= 7;
    current.bytes[7] = 0;
    current.bytes[6] = 0;
    current.value <<= 1;
    current.bytes[0] |= (current.bytes[5] >> 3) & 1;
    for (i = 0; i < 6; i++) {
        *p ^= 0x67;
        p++;
    };
    (current.bytes)[7] = 0;
    (current.bytes)[6] = 0;
    (current.bytes)[5] &= 7;
    return current.value;
}

static inline u32 Mac24b(u8 a, u8 b, u8 c) {
    return (a << 16) | (b << 8) | c;
}

#pragma opt_propagation off

// Makes a new pseudo user id (new salt) and clears the user id. FALSE if the clock is unusable.
BOOL DWCi_AUTH_GetNewWiFiInfo(DwcWiFiInfo *info) {
    u8 mac[6];
    RTCDate date;
    RTCTime time;
    s64 sec;
    u32 mul;
    u32 add;
    u8 nonNintendoOui;
    u32 macNic;
    u32 macOui;
    u32 seed;

    DWCi_BM_GetWiFiInfo(info);
    RTC_Init();
    if (RTC_GetDate(&date) != RTC_RESULT_SUCCESS) {
        return FALSE;
    }
    if (RTC_GetTime(&time) != RTC_RESULT_SUCCESS) {
        return FALSE;
    }
    sec = RTC_ConvertDateTimeToSecond(&date, &time);
    if (sec < 0) {
        return FALSE;
    }
    if (OS_IsTickAvailable()) {
        sec += (u32)OS_GetTick; // the function's address, not the tick count
    }
    OS_GetMacAddress(mac);
    mul = 0x5D588B65;
    add = 0x269EC3;
    macOui = Mac24b(mac[0], mac[1], mac[2]);
    nonNintendoOui = (macOui != NINTENDO_OUI) ? 1 : 0;
    macNic = Mac24b(mac[3], mac[4], mac[5]);
    seed = (u32)sec * mul + add;
    info->random = ((seed >> 16) * 1000) >> 16;
    info->userId = 0;
    if (info->salt == 0) {
        info->pseudoUserId = 0;
        while (info->pseudoUserId == 0) {
            seed = seed * mul;
            seed += add;
            while (seed == 0) {
                seed = seed * mul;
                seed += add;
            }
            info->salt = (u16)seed;
            info->pseudoUserId = DWCi_Util_WiFiId_scrambleUid(info->salt, macNic, nonNintendoOui, 0);
        }
    } else {
        info->pseudoUserId = 0;
        while (info->pseudoUserId == 0) {
            info->salt++;
            info->pseudoUserId = DWCi_Util_WiFiId_scrambleUid(info->salt, macNic, nonNintendoOui, 0);
        }
    }
    return TRUE;
}

#pragma opt_propagation reset

#pragma force_active off

BOOL DWCi_AUTH_MakeWiFiID(DwcBackupPageWork *work) {
    DwcWiFiInfo info;

    if (DWCi_AUTH_GetNewWiFiInfo(&info) == FALSE) {
        return FALSE;
    }
    return DWCi_BM_SetWiFiInfo(&info, work) != FALSE;
}

// Keeps the pseudo user id as the user id and stores info.
BOOL DWCi_AUTH_UpDateWiFiID(DwcWiFiInfo *info, DwcBackupPageWork *work) {
    DwcWiFiInfo current;

    DWCi_BM_GetWiFiInfo(&current);
    info->userId = info->pseudoUserId;
    info->pseudoUserId = current.pseudoUserId;
    return DWCi_BM_SetWiFiInfo(info, work) != FALSE;
}

#pragma force_active on
#pragma opt_propagation off

// Makes a new pseudo user id with a salt different from the current one.
BOOL DWCi_AUTH_RemakeWiFiID(DwcWiFiInfo *info) {
    u8 mac[6] = { 0, 0, 0, 0, 0, 0 };
    RTCDate date;
    RTCTime time;
    s64 sec;
    u32 mul;
    u32 add;
    u8 nonNintendoOui;
    u32 macNic;
    u32 macOui;
    u32 seed;

    DWCi_BM_GetWiFiInfo(info);
    RTC_Init();
    if (RTC_GetDate(&date) != RTC_RESULT_SUCCESS) {
        return FALSE;
    }
    if (RTC_GetTime(&time) != RTC_RESULT_SUCCESS) {
        return FALSE;
    }
    sec = RTC_ConvertDateTimeToSecond(&date, &time);
    if (sec < 0) {
        return FALSE;
    }
    if (OS_IsTickAvailable()) {
        sec += (u32)OS_GetTick; // the function's address, not the tick count
    }
    OS_GetMacAddress(mac);
    mul = 0x5D588B65;
    add = 0x269EC3;
    macOui = (mac[0] << 16) | (mac[1] << 8) | mac[2];
    nonNintendoOui = (macOui != NINTENDO_OUI) ? 1 : 0;
    macNic = (mac[3] << 16) | (mac[4] << 8) | mac[5];
    seed = (u32)sec * mul + add;
    info->random = ((seed >> 16) * 1000) >> 16;
    info->pseudoUserId = 0;
    while (info->pseudoUserId == 0) {
        seed = mul * seed + add;
        while (seed == 0 || info->salt == (u16)seed) {
            seed = mul * seed + add;
        }
        info->salt = (u16)seed;
        info->pseudoUserId = DWCi_Util_WiFiId_scrambleUid(info->salt, macNic, nonNintendoOui, 0);
    }
    return TRUE;
}

#pragma opt_propagation reset
#pragma force_active off

// id: u32[5] = user id, pseudo user id (2 words each), TRUE if the user id is set.
void DWC_Auth_GetId(u32 *id) {
    DwcWiFiInfo info;
    u32 high;
    u32 low;
    int valid;

    DWCi_BM_GetWiFiInfo(&info);
    ((u64 *)id)[0] = info.userId;
    ((u64 *)id)[1] = info.pseudoUserId;
    high = info.userId >> 32;
    low = (u32)info.userId;
    valid = 0;
    if (high != 0 || low != 0) {
        valid = 1;
    }
    id[4] = valid;
}

#pragma force_active on

// TRUE while neither id has been made yet.
BOOL DWC_Auth_CheckPseudoWiFiID(void) {
    DwcWiFiInfo info;

    DWCi_BM_GetWiFiInfo(&info);
    if (info.pseudoUserId == 0 && info.userId == 0) {
        return TRUE;
    }
    return FALSE;
}
