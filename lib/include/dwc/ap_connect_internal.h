#ifndef POKEHEARTGOLD_LIB_INCLUDE_DWC_AP_CONNECT_INTERNAL_H
#define POKEHEARTGOLD_LIB_INCLUDE_DWC_AP_CONNECT_INTERNAL_H

// Access point search and connection of OVY_0 (lib/NitroDWC/src/ap_connect_control.c, ap_connect.c): the
// user's three connection settings, the SSIDs to look for, and the scanned access points.

// One user connection setting, 0x100 bytes.
typedef struct ApProfile {
    u8 unk_00[0x40];
    u8 ssid[32];     // 0x40
    u8 ssid2[32];    // 0x60
    u8 wepKey[0x40]; // 0x80
    u8 ip[4];        // 0xC0
    u8 gateway[4];   // 0xC4
    u8 dns1[4];      // 0xC8
    u8 dns2[4];      // 0xCC
    u8 prefix;       // 0xD0
    u8 unk_D1[0x15];
    u8 wepKeyType : 2; // 0xE6
    u8 unk_E6_2 : 6;
    u8 wepMode; // 0xE7
    u8 unk_E8[0x18];
} ApProfile;

typedef struct ApSsidEntry {
    u8 flags : 4;
    u8 flagsHi : 4;
    u8 index;
    u8 unk_02;
    u8 len;
    char ssid[32];
} ApSsidEntry;

typedef struct ApStatus {
    u8 status;
    u8 index;
    u8 rssi;
    u8 channel : 7;
    u8 done : 1;
} ApStatus;

// Scanned BSS description, 0xC0 bytes.
typedef struct ApBss {
    u16 length;
    u16 rssi;
    u8 bssid[6];
    u16 ssidLength; // 0x0A
    u8 ssid[32];    // 0x0C
    u16 capability; // 0x2C
    u8 unk_2E[8];
    u16 channel; // 0x36
    u8 unk_38[0x88];
} ApBss;

typedef struct ApConnectWork {
    ApProfile profiles[3];
    ApSsidEntry entries[9]; // 0x300
    ApStatus ap[11];        // 0x444
    ApBss bss[11];          // 0x470
    OSTick tick;            // 0xCB0
    u8 connectConfig[0x52]; // 0xCB8
    u8 dmaNo;
    u8 powerMode : 2;
    u8 sharedKeyAuth : 2;
    u8 retry : 4;
    u8 profileSel : 4; // 0xD0C
    u8 skipNetCheck : 2;
    u8 mode : 2;
    u8 profileIdx; // 0xD0D
    u8 nextState;
    u8 cur; // 0xD0F
    u8 numEntries;
    s8 channel; // 0xD11
    u8 numAps;
    u8 selAp; // 0xD13
    u8 connectFailure;
    u8 chIter;
    u16 chMask; // 0xD16
} ApConnectWork;

#endif // POKEHEARTGOLD_LIB_INCLUDE_DWC_AP_CONNECT_INTERNAL_H
