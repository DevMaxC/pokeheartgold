#include "dwc/dwc_bm_internal.h"

// NitroDWC backup manager start-up: checks the CRCs and contents of the settings pages, repairs or
// re-initialises broken pages (making a new Wi-Fi user id when none is left) and loads the user id.

#define BM_ERROR_WRITE    -10000
#define BM_ERROR_READ     -10001
#define BM_ERROR_REPAIRED -10002 // access point settings were lost
#define BM_ERROR_NEW_ID   -10003 // the Wi-Fi user id was lost and remade

#pragma force_active on

// Packs info into Wifi (see DWCi_BM_GetWiFiInfo).
u8 *DWCi_BACKUPlConvWifiInfo(const DwcWiFiInfo *info) {
    u64 id = info->pseudoUserId;

    MI_CpuCopy8(info, Wifi, 5);
    Wifi[5] = ((info->userId >> 40) & 7) | ((id & 0x1F) << 3);
    id >>= 5;
    MI_CpuCopy8(&id, Wifi + 6, 4);
    Wifi[10] = ((id >> 32) & 0x3F) | ((info->random & 3) << 6);
    Wifi[11] = info->random >> 2;
    MI_CpuCopy8(&info->salt, Wifi + 12, 2);
    return Wifi;
}

u8 *DWCi_BACKUPlGetWifi(void) {
    return Wifi;
}

int DWC_BM_Init(DwcBackupWork *work) {
    BOOL valid[BACKUP_PAGE_COUNT];
    int i;
    u8 *crcPage;
    u8 *apPage;
    BOOL changed;
    u8 *pages = (u8 *)work;

    MI_CpuFill8(work, 0, sizeof(DwcBackupWork));
    if (!DWCi_BACKUPlInit(work)) {
        return BM_ERROR_READ;
    }
    MATHi_CRC16InitTableRev(&work->crcTable, BACKUP_CRC_POLY);
    if (!DWCi_BACKUPlRead(work)) {
        return BM_ERROR_READ;
    }
    MI_CpuFill8(valid, 0, sizeof(valid));
    crcPage = pages;
    apPage = pages;
    for (i = 0; i < BACKUP_AP_COUNT; i++, crcPage += BACKUP_PAGE_SIZE, apPage += BACKUP_PAGE_SIZE) {
        u32 crc = MATH_CalcCRC16(&work->crcTable, crcPage, offsetof(DwcBackupPage, crc));

        if (crc == work->pages[i].crc) {
            if (checkAp((DwcBackupPage *)apPage)) {
                valid[i] = TRUE;
            }
        }
    }
    {
        u32 crc = MATH_CalcCRC16(&work->crcTable, &work->pages[3], offsetof(DwcBackupPage, crc));

        if (crc == work->pages[3].crc) {
            valid[3] = TRUE;
        }
    }
    if (valid[0] && valid[1] && valid[2] && valid[3]) {
        DWCi_BACKUPlSetWiFi(work->pages[0].wifiInfo);
        return 0;
    }
    if (!valid[0] && !valid[1] && !valid[2] && !valid[3]) {
        init(work);
        return DWCi_BACKUPlWriteAll(work) ? 0 : BM_ERROR_WRITE;
    }
    if (!(valid[0] && valid[1]) && !(valid[2] && valid[3])) {
        init(work);
        return DWCi_BACKUPlWriteAll(work) ? 0 : BM_ERROR_WRITE;
    }
    if (!valid[0] && !valid[1]) {
        init(work);
        return DWCi_BACKUPlWriteAll(work) ? BM_ERROR_NEW_ID : BM_ERROR_WRITE;
    }
    // pages 0 and 1 both hold the Wi-Fi user id: restore one from the other
    if (!valid[0]) {
        initPage(work, 0);
        MI_CpuCopy8(work->pages[1].wifiInfo, work->pages[0].wifiInfo, WIFI_INFO_SIZE);
        work->pages[0].apSetUp = work->pages[1].apSetUp;
    } else if (!valid[1]) {
        initPage(work, 1);
        MI_CpuCopy8(work->pages[0].wifiInfo, work->pages[1].wifiInfo, WIFI_INFO_SIZE);
        work->pages[1].apSetUp = work->pages[0].apSetUp;
    }
    DWCi_BACKUPlSetWiFi(work->pages[0].wifiInfo);
    if (!valid[2]) {
        initPage(work, 2);
    }
    if (!valid[3]) {
        MIi_CpuClear16(0, (u16 *)&work->pages[3], BACKUP_PAGE_SIZE);
    }
    changed = FALSE;
    for (i = 0; i < BACKUP_AP_COUNT; i++) {
        if (!valid[i] && (work->pages[0].apSetUp & (1 << i))) {
            work->pages[0].apSetUp &= ~(1 << i);
            changed = TRUE;
            work->pages[1].apSetUp = work->pages[0].apSetUp;
        }
    }
    if (!DWCi_BACKUPlWriteAll(work)) {
        return BM_ERROR_WRITE;
    }
    return changed ? BM_ERROR_REPAIRED : 0;
}

// Plausibility check of one access point's settings (unused entries pass).
BOOL checkAp(const DwcBackupPage *page) {
    u32 mask;

    if (page->state == BACKUP_AP_UNUSED) {
        return TRUE;
    }
    if (page->state > 2) {
        return FALSE;
    }
    if (!DWC_BACKUPlCheckSsid(page->ssid)) {
        return FALSE;
    }
    if (memcmp(page->ip, DWCi_SETTING_NONE, 4) != 0) {
        if (!DWC_BACKUPlCheckAddress(page->gateway)) {
            return FALSE;
        }
        if (page->subnetMaskLen > 32) {
            return FALSE;
        }
        DWCi_BACKUPlConvMaskAddr(page->subnetMaskLen, (u8 *)&mask);
        if (!DWC_BACKUPlCheckIp(page->ip, (u8 *)&mask)) {
            return FALSE;
        }
    }
    if (memcmp(page->dns[0], DWCi_SETTING_NONE, 4) != 0) {
        if (!DWC_BACKUPlCheckAddress(page->dns[0]) && !DWC_BACKUPlCheckAddress(page->dns[1])) {
            return FALSE;
        }
    }
    return TRUE;
}

// Clears all pages and stores a new Wi-Fi user id in pages 0 and 1.
int init(DwcBackupWork *work) {
    DwcWiFiInfo info;
    u8 *wifiInfo;
    int i;
    u8 *pages = (u8 *)work;

    MIi_CpuClear16(0, (u16 *)work, BACKUP_PAGE_COUNT * BACKUP_PAGE_SIZE);
    for (i = 0; i < BACKUP_AP_COUNT; i++) {
        pages[((u32)i << 8) + offsetof(DwcBackupPage, state)] = BACKUP_AP_UNUSED;
    }
    DWCi_AUTH_GetNewWiFiInfo(&info);
    wifiInfo = DWCi_BACKUPlConvWifiInfo(&info);
    for (i = 0; i < 2; i++) {
        MI_CpuCopy8(wifiInfo, pages + offsetof(DwcBackupPage, wifiInfo), WIFI_INFO_SIZE);
        pages += BACKUP_PAGE_SIZE;
    }
    return 0;
}

#pragma force_active off

void initPage(DwcBackupWork *work, int page) {
    MIi_CpuClear16(0, (u16 *)((u8 *)work + (page << 8)), BACKUP_PAGE_SIZE);
    ((u8 *)work + (page << 8))[offsetof(DwcBackupPage, state)] = BACKUP_AP_UNUSED;
}
