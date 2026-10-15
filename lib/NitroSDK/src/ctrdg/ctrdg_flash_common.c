// The flash driver state at ctrdgi_flash_lock_id and the chip pointers at AgbFlash are accessed here
// through their struct views (CTRDGiFlashWork, CTRDGiFlashChip) like the original, which addressed them
// from one base; the headers' declarations of the two labels are hidden.
#define ctrdgi_flash_lock_id ctrdgi_flash_lock_id_HeaderDeclaration
#define AgbFlash             AgbFlash_HeaderDeclaration
#include "CTRDG_flash_internal.h"
#undef ctrdgi_flash_lock_id
#undef AgbFlash
#include "CTRDG_common.h"
#include "OS_spinLock.h"
#include "OS_tick.h"
#include "code32.h"
#include "registers.h"

// Flash routines shared by all chip drivers: MX bank select, chip ID, operation timer, status polling,
// read and verify, and the public read / write / verify entry points.

extern CTRDGiFlashWork ctrdgi_flash_lock_id;
extern CTRDGiFlashChip AgbFlash[]; // one entry; declared as an array like the original (load scheduling)

// The wrappers pass task infos with only the fields the core function reads set.
#pragma warn_uninitializedvar off

#pragma force_active on

void CTRDGi_SetFlashBankMx(u16 bank) {
    *(vu8 *)CTRDG_BACKUP_COM_ADR1 = 0xAA;
    *(vu8 *)CTRDG_BACKUP_COM_ADR2 = 0x55;
    *(vu8 *)CTRDG_BACKUP_COM_ADR1 = 0xB0;
    *(vu8 *)CTRDG_AGB_FLASH_ADR = bank;
}

// Sends a command with interrupts disabled (IME saved in the driver state).
static inline void SendFlashCommand(u8 command) {
    u16 ime = reg_OS_IME;
    reg_OS_IME = 0;
    ctrdgi_flash_lock_id.savedIme = ime;
    *(vu8 *)CTRDG_BACKUP_COM_ADR1 = 0xAA;
    *(vu8 *)CTRDG_BACKUP_COM_ADR2 = 0x55;
    *(vu8 *)CTRDG_BACKUP_COM_ADR1 = command;
}

static inline void RestoreFlashIme(void) {
    u16 ime = reg_OS_IME;
    (void)ime;
    reg_OS_IME = ctrdgi_flash_lock_id.savedIme;
}

u16 CTRDGi_ReadFlashID(void) {
    u16 id;

    SendFlashCommand(0x90);
    RestoreFlashIme();
    StartFlashTimer(0);
    while (!ctrdgi_flash_lock_id.timerExpired) {
        CheckFlashTimer();
    }
    id = (u16)((u32)CTRDGi_ReadSrFunc((const u8 *)(CTRDG_AGB_FLASH_ADR + 1)) << 8);
    id |= CTRDGi_ReadSrFunc((const u8 *)CTRDG_AGB_FLASH_ADR);
    SendFlashCommand(0xF0);
    *(vu8 *)CTRDG_BACKUP_COM_ADR1 = 0xF0;
    RestoreFlashIme();
    StartFlashTimer(0);
    while (!ctrdgi_flash_lock_id.timerExpired) {
        CheckFlashTimer();
    }
    return id;
}

void StartFlashTimer(u16 phase) {
    ctrdgi_flash_lock_id.timerExpired = 0;
    ctrdgi_flash_lock_id.timerLimit = AgbFlash->maxtime[phase];
    ctrdgi_flash_lock_id.timerStart = OS_GetTick();
}

void CheckFlashTimer(void) {
    // elapsed time in milliseconds (the tick runs at the system clock / 64)
    u64 elapsed = ((OS_GetTick() - ctrdgi_flash_lock_id.timerStart) << 6) / 33514;

    if (ctrdgi_flash_lock_id.timerLimit <= elapsed) {
        ctrdgi_flash_lock_id.timerExpired = 1;
    }
}

u8 CTRDGi_ReadSrFunc(const u8 *adr) {
    return *adr;
}

u16 CTRDGi_PollingSR512kCOMMON(u16 phase, const u8 *adr, u8 lastData) {
    u16 result = 0;

    StartFlashTimer(phase);
    for (;;) {
        u8 status = CTRDGi_ReadSrFunc(adr);
        if (status == lastData) {
            break;
        }
        if (!ctrdgi_flash_lock_id.timerExpired) {
            continue;
        }
        if (lastData == CTRDGi_ReadSrFunc(adr)) {
            break;
        }
        if (AgbFlash->type->makerID == 0xC2) {
            *(vu8 *)CTRDG_BACKUP_COM_ADR1 = 0xF0;
        }
        result = phase | 0xC000;
        break;
    }
    if (!CTRDG_IsExisting()) {
        result = 0x1000;
    }
    return result;
}

u16 CTRDGi_PollingSR1MCOMMON(u16 phase, const u8 *adr, u8 lastData) {
    u16 result = 0;

    StartFlashTimer(phase);
    for (;;) {
        u8 status;
        CheckFlashTimer();
        status = CTRDGi_ReadSrFunc(adr);
        if (status == lastData) {
            break;
        }
        if (status & 0x20) {
            if (CTRDGi_ReadSrFunc(adr) == lastData) {
                break;
            }
            result = phase | 0xA000;
            *(vu8 *)CTRDG_BACKUP_COM_ADR1 = 0xF0;
            break;
        }
        if (ctrdgi_flash_lock_id.timerExpired) {
            if (CTRDGi_ReadSrFunc(adr) == lastData) {
                break;
            }
            result = phase | 0xC000;
            *(vu8 *)CTRDG_BACKUP_COM_ADR1 = 0xF0;
            break;
        }
    }
    if (!CTRDG_IsExisting()) {
        result = 0x1000;
    }
    return result;
}

u32 CTRDGi_ReadAgbFlashCore(CTRDGTaskInfo *arg) {
    CTRDGTaskInfo *p = arg;
    CTRDGTaskInfo task = *p;
    u32 ramCycle;
    u16 secNo = task.sec_num;
    u32 offset = task.offset;
    u8 *dst = task.dst;
    u32 size = task.size;
    const u8 *src;

    OS_LockCartridge(ctrdgi_flash_lock_id.lockID);
    ramCycle = reg_MI_EXMEMCNT & 3;
    reg_MI_EXMEMCNT = (reg_MI_EXMEMCNT & ~3) | 3;
    if (AgbFlash->type->romSize == 0x20000) {
        CTRDGi_SetFlashBankMx(secNo >> 4);
        secNo &= 15;
    }
    src = (const u8 *)(offset + (CTRDG_AGB_FLASH_ADR + (secNo << AgbFlash->type->sector.shift)));
    while (size--) {
        *dst++ = *src++;
    }
    reg_MI_EXMEMCNT = (reg_MI_EXMEMCNT & ~3) | ramCycle;
    OS_UnlockCartridge(ctrdgi_flash_lock_id.lockID);
    return 0;
}

// Returns the address in flash of the first byte that differs, 0 when all match.
u32 CTRDGi_VerifyFlashSectorCore(const u8 *src, const u8 *tgt, u32 size) {
    while (size--) {
        if (*tgt++ != *src++) {
            return (u32)(tgt - 1);
        }
    }
    return 0;
}

u32 CTRDGi_VerifyAgbFlashCore(CTRDGTaskInfo *arg) {
    CTRDGTaskInfo task = *arg;
    u32 ramCycle;
    u16 secNo = task.sec_num;
    const u8 *src = task.data;
    u32 size = task.size;
    u32 result;

    OS_LockCartridge(ctrdgi_flash_lock_id.lockID);
    ramCycle = reg_MI_EXMEMCNT & 3;
    reg_MI_EXMEMCNT = (reg_MI_EXMEMCNT & ~3) | 3;
    if (AgbFlash->type->romSize == 0x20000) {
        CTRDGi_SetFlashBankMx(secNo >> 4);
        secNo &= 15;
    }
    result = CTRDGi_VerifyFlashSectorCore(src, (const u8 *)(CTRDG_AGB_FLASH_ADR + (secNo << AgbFlash->type->sector.shift)), size);
    reg_MI_EXMEMCNT = (reg_MI_EXMEMCNT & ~3) | ramCycle;
    OS_UnlockCartridge(ctrdgi_flash_lock_id.lockID);
    return result;
}

// Writes and verifies a sector, up to three tries.
u32 CTRDGi_WriteAndVerifyAgbFlashSectorCore(CTRDGTaskInfo *arg) {
    CTRDGTaskInfo *p = arg;
    CTRDGTaskInfo task = *p;
    u16 i = 0;
    u16 secNo = task.sec_num;
    const void *src = task.data;
    u32 size = task.size;
    u32 result;

    do {
        result = CTRDG_WriteAgbFlashSector(secNo, src);
        if (!result) {
            result = CTRDG_VerifyAgbFlash(secNo, src, size);
            if (!result) {
                return result;
            }
        }
        i++;
    } while (i < 3);
    return result;
}

void CTRDG_ReadAgbFlash(u16 secNo, u32 offset, void *dst, u32 size) {
    CTRDGTaskInfo task;

    task.sec_num = secNo;
    task.offset = offset;
    task.dst = dst;
    task.size = size;
    CTRDGi_ReadAgbFlashCore(&task);
}

u32 CTRDG_WriteAgbFlashSector(u16 secNo, const void *src) {
    return ((u32(*)(u16, const void *))ctrdgi_flash_lock_id.writeAgbFlashSector)(secNo, src);
}

u32 CTRDG_VerifyAgbFlash(u16 secNo, const void *src, u32 size) {
    CTRDGTaskInfo task;

    task.sec_num = secNo;
    task.data = (u8 *)src;
    task.size = size;
    return CTRDGi_VerifyAgbFlashCore(&task);
}

void CTRDG_WriteAndVerifyAgbFlashAsync(u16 secNo, const void *src, u32 size, CTRDG_TASK_FUNC callback) {
    CTRDGTaskInfo task;

    task.data = (u8 *)src;
    task.sec_num = secNo;
    task.size = size;
    CTRDGi_SetTask(&task, CTRDGi_WriteAndVerifyAgbFlashSectorCore, callback);
}
