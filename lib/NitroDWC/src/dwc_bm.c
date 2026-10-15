#include "dwc/dwc_bm_internal.h"

// NitroDWC backup manager: reading / writing the settings pages and the Wi-Fi user id, and the
// checks of access point settings (SSID, IP address, subnet mask).

BOOL DWCi_BM_GetApInfo(void *dst) {
    return readNvram(gDwcBmNvramState.backupAddress, BACKUP_AP_COUNT * BACKUP_PAGE_SIZE, dst) != FALSE;
}

#pragma force_active on

// Unpacks Wifi: user id (43 bits), pseudo user id (43 bits), random (10 bits), salt (16 bits).
void DWCi_BM_GetWiFiInfo(DwcWiFiInfo *info) {
    MI_CpuCopy8(Wifi, info, 6);
    info->userId &= 0x7FFFFFFFFFFULL;
    MI_CpuCopy8(Wifi + 5, &info->pseudoUserId, 6);
    info->pseudoUserId >>= 3;
    info->pseudoUserId &= 0x7FFFFFFFFFFULL;
    MI_CpuCopy8(Wifi + 10, &info->random, 2);
    info->random >>= 6;
    info->random &= 0x3FF;
    MI_CpuCopy8(Wifi + 12, &info->salt, 2);
}

// Packs info into Wifi and writes it into settings pages 0 and 1.
BOOL DWCi_BM_SetWiFiInfo(const DwcWiFiInfo *info, DwcBackupPageWork *work) {
    int i;
    u32 address = gDwcBmNvramState.backupAddress;

    DWCi_BACKUPlConvWifiInfo(info);
    MATHi_CRC16InitTableRev(&work->crcTable, BACKUP_CRC_POLY);
    for (i = 0; i < 2; i++, address += BACKUP_PAGE_SIZE) {
        if (!readNvram(address, BACKUP_PAGE_SIZE, &work->page)) {
            OS_Terminate();
            return FALSE;
        }
        MI_CpuCopy8(Wifi, work->page.wifiInfo, WIFI_INFO_SIZE);
        work->page.crc = MATH_CalcCRC16(&work->crcTable, &work->page, offsetof(DwcBackupPage, crc));
        do {
            writeNvram(address, BACKUP_PAGE_SIZE, &work->page);
        } while (!verify(&work->page, address, BACKUP_PAGE_SIZE, work->verifyBuffer));
    }
    return writeDisable() != FALSE;
}

#pragma force_active off

// Reads the NVRAM header field that locates the settings (0x400 bytes below the given offset / 8).
BOOL DWCi_BACKUPlInit(void *work) {
    if (!readNvram(0x20, 0x20, work)) {
        return FALSE;
    }
    gDwcBmNvramState.backupAddress = (*(u16 *)work << 3) - BACKUP_PAGE_COUNT * BACKUP_PAGE_SIZE;
    return TRUE;
}

BOOL DWCi_BACKUPlRead(void *dst) {
    return readNvram(gDwcBmNvramState.backupAddress, BACKUP_PAGE_COUNT * BACKUP_PAGE_SIZE, dst) != FALSE;
}

#pragma force_active on

// Writes the pages flagged in dirty (without updating their CRCs).
BOOL DWCi_BACKUPlWritePage(u8 *pages, const BOOL *dirty, void *verifyBuffer) {
    int address = gDwcBmNvramState.backupAddress;
    int i;

    for (i = 0; i < BACKUP_PAGE_COUNT; i++, pages += BACKUP_PAGE_SIZE, address += BACKUP_PAGE_SIZE) {
        if (dirty[i]) {
            do {
                writeNvram(address, BACKUP_PAGE_SIZE, pages);
            } while (!verify(pages, address, BACKUP_PAGE_SIZE, verifyBuffer));
        }
    }
    return writeDisable() != FALSE;
}

// Updates the CRCs of all pages and writes them.
BOOL DWCi_BACKUPlWriteAll(DwcBackupWork *work) {
    struct {
        u32 address;
        DwcBackupPage *page;
    } cursor; // needed for the match

    int i;

    cursor.address = gDwcBmNvramState.backupAddress;
    cursor.page = work->pages;
    for (i = 0; i < BACKUP_PAGE_COUNT; i++, cursor.page++, cursor.address += BACKUP_PAGE_SIZE) {
        work->pages[i].crc = MATH_CalcCRC16(&work->crcTable, cursor.page, offsetof(DwcBackupPage, crc));
        do {
            writeNvram(cursor.address, BACKUP_PAGE_SIZE, cursor.page);
        } while (!verify(cursor.page, cursor.address, BACKUP_PAGE_SIZE, work->verifyBuffer));
    }
    return writeDisable() != FALSE;
}

#pragma force_active off

void DWCi_BACKUPlSetWiFi(const u8 *wifiInfo) {
    MI_CpuCopy8(wifiInfo, Wifi, WIFI_INFO_SIZE);
}

#pragma force_active on

// Subnet mask -> prefix length (counts the set bits).
u8 DWCi_BACKUPlConvMaskCidr(const u8 *mask) {
    int count;
    int i = 0;

    count = 0;
    for (; i < 4; i++) {
        int j;
        int b = mask[i];

        for (j = 0; j < 8; j++) {
            if ((b >> j) & 1) {
                count++;
            }
        }
    }
    return count;
}

#pragma force_active off

// Prefix length -> subnet mask.
void DWCi_BACKUPlConvMaskAddr(u32 cidr, u8 *mask) {
    u32 bits = ~0u ^ (~0u >> cidr);
    int i = 0;
    int shift = 0;

    for (; i < 4; i++) {
        mask[i] = bits >> (24 - shift);
        shift += 8;
    }
}

BOOL DWC_BACKUPlCheckSsid(const u8 *ssid) {
    int i;

    for (i = 0; i < 32; i++) {
        if (ssid[i] != 0) {
            return TRUE;
        }
    }
    return FALSE;
}

// The host part of ip must be neither all zeros nor all ones.
BOOL DWC_BACKUPlCheckIp(const u8 *ip, const u8 *mask) {
    u32 ipValue;
    u32 maskValue;

    if (!DWC_BACKUPlCheckAddress(ip)) {
        return FALSE;
    }
    MI_CpuCopy8(ip, &ipValue, 4);
    MI_CpuCopy8(mask, &maskValue, 4);
    if ((ipValue | maskValue) == ~1u) {
        return FALSE;
    }
    return (ipValue & ~maskValue) != 0;
}

// Class A-C, not loopback.
BOOL DWC_BACKUPlCheckAddress(const u8 *address) {
    u8 n = address[0];

    if (n == 127) {
        return FALSE;
    }
    if (n < 1) {
        return FALSE;
    }
    if (n <= 223) {
        return TRUE;
    }
    return FALSE;
}
