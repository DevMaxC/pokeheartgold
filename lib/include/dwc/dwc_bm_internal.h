#ifndef POKEHEARTGOLD_DWC_BM_INTERNAL_H
#define POKEHEARTGOLD_DWC_BM_INTERNAL_H

// NitroDWC backup manager: the Nintendo Wi-Fi Connection settings in the DS's NVRAM (four 0x100-byte
// pages: three access point settings, one spare; the Wi-Fi user id is kept in pages 0 and 1) and the
// generation of the Wi-Fi user id.

#include <nitro.h>
#include <stddef.h>
#include <string.h>

#define BACKUP_PAGE_SIZE  0x100
#define BACKUP_PAGE_COUNT 4
#define BACKUP_AP_COUNT   3
#define BACKUP_AP_UNUSED  0xFF // DwcBackupPage.state of an access point that was never set up
#define WIFI_INFO_SIZE    14   // packed DwcWiFiInfo in the backup pages and in Wifi
#define BACKUP_CRC_POLY   0xA001

// One NVRAM page of the settings.
typedef struct DwcBackupPage {
    u8 unk_00[0x40];
    u8 ssid[32]; // 0x40
    u8 unk_60[0x60];
    u8 ip[4];         // 0xC0
    u8 gateway[4];    // 0xC4
    u8 dns[2][4];     // 0xC8
    u8 subnetMaskLen; // 0xD0
    u8 unk_D1[0x16];
    u8 state; // 0xE7: BACKUP_AP_UNUSED or 0-2
    u8 unk_E8[7];
    u8 apSetUp;                  // 0xEF (pages 0 and 1): bit n set: access point n was set up
    u8 wifiInfo[WIFI_INFO_SIZE]; // 0xF0 (pages 0 and 1)
    u16 crc;                     // 0xFE: CRC-16 of the bytes before it
} DwcBackupPage;

// Work memory of DWC_BM_Init / DWCi_BACKUPlWriteAll (0x700 bytes, given by the game).
typedef struct DwcBackupWork {
    DwcBackupPage pages[BACKUP_PAGE_COUNT];
    u8 verifyBuffer[BACKUP_PAGE_SIZE];
    MATHCRC16Table crcTable;
} DwcBackupWork;

// Work memory of DWCi_BM_SetWiFiInfo.
typedef struct DwcBackupPageWork {
    DwcBackupPage page;
    u8 verifyBuffer[BACKUP_PAGE_SIZE];
    MATHCRC16Table crcTable;
} DwcBackupPageWork;

// Wi-Fi user id (unpacked; 43-bit ids). u64 is 4-aligned under MWCC: 20 bytes.
typedef struct DwcWiFiInfo {
    u64 userId;       // 0 until the first log-in
    u64 pseudoUserId; // made on this console from the MAC address, a salt and the clock
    u16 random;       // 0-999
    u16 salt;
} DwcWiFiInfo;

// lib/NitroDWC/asm/dwc_bm_data.s
typedef struct DwcBmNvramState {
    volatile u16 error; // last NVRAM command result from the ARM7, 0xFF on a PXI error
    u16 pad;
    volatile s32 ready; // set by Callback_NVRAM
    u32 backupAddress;  // NVRAM address of the settings pages
} DwcBmNvramState;

extern DwcBmNvramState gDwcBmNvramState;
extern u8 Wifi[];   // packed DwcWiFiInfo (WIFI_INFO_SIZE bytes)
extern u8 Work[32]; // NVRAM status register buffer
extern const u8 DWCi_SETTING_NONE[4];
extern const u8 DWCi_util_wifiid_exctable[];
extern const u8 DWCi_util_wifiid_ttable[16];

// NitroSDK functions the nitro headers do not declare
u16 MATH_CalcCRC16(const MATHCRC16Table *table, const void *data, u32 dataLength);
RTCResult RTC_GetDate(RTCDate *date);
RTCResult RTC_GetTime(RTCTime *time);

// dwc_bm.c
BOOL DWCi_BM_GetApInfo(void *dst);
void DWCi_BM_GetWiFiInfo(DwcWiFiInfo *info);
BOOL DWCi_BM_SetWiFiInfo(const DwcWiFiInfo *info, DwcBackupPageWork *work);
BOOL DWCi_BACKUPlInit(void *work);
BOOL DWCi_BACKUPlRead(void *dst);
BOOL DWCi_BACKUPlWritePage(u8 *pages, const BOOL *dirty, void *verifyBuffer);
BOOL DWCi_BACKUPlWriteAll(DwcBackupWork *work);
void DWCi_BACKUPlSetWiFi(const u8 *wifiInfo);
u8 DWCi_BACKUPlConvMaskCidr(const u8 *mask);
void DWCi_BACKUPlConvMaskAddr(u32 cidr, u8 *mask);
BOOL DWC_BACKUPlCheckSsid(const u8 *ssid);
BOOL DWC_BACKUPlCheckIp(const u8 *ip, const u8 *mask);
BOOL DWC_BACKUPlCheckAddress(const u8 *address);

// dwc_nvram.c
BOOL NVRAMm_ExecuteCommand(int command, u32 address, u32 size, void *buffer);
BOOL readNvram(u32 address, u32 size, void *dst);
void writeNvram(u32 address, u32 size, void *src);
BOOL verify(void *expected, u32 address, u32 size, void *scratch);
BOOL writeDisable(void);
u16 Callback_NVRAM(PXIFifoTag tag, u32 data, BOOL err);

// dwc_bm_init.c
u8 *DWCi_BACKUPlConvWifiInfo(const DwcWiFiInfo *info);
u8 *DWCi_BACKUPlGetWifi(void);
int DWC_BM_Init(DwcBackupWork *work);
BOOL checkAp(const DwcBackupPage *page);
int init(DwcBackupWork *work);
void initPage(DwcBackupWork *work, int page);

// dwc_auth_wifi_id.c
u64 DWCi_Util_WiFiId_scrambleUid(u32 salt, u32 macNic, u8 nonNintendoOui, u32 zero);
BOOL DWCi_AUTH_GetNewWiFiInfo(DwcWiFiInfo *info);
BOOL DWCi_AUTH_MakeWiFiID(DwcBackupPageWork *work);
BOOL DWCi_AUTH_UpDateWiFiID(DwcWiFiInfo *info, DwcBackupPageWork *work);
BOOL DWCi_AUTH_RemakeWiFiID(DwcWiFiInfo *info);
void DWC_Auth_GetId(u32 *id); // u32[5]: user id (2 words), pseudo user id (2 words), registered flag
BOOL DWC_Auth_CheckPseudoWiFiID(void);

#endif // POKEHEARTGOLD_DWC_BM_INTERNAL_H
