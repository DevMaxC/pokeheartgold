#include "CTRDG_flash_internal.h"
#include "MI_exMemory.h"
#include "OS_interrupt.h"
#include "OS_spinLock.h"
#include "code32.h"

// MX29L010 flash backup (1 MB in two 64 KB banks, used by the MX29L010, LE26FV10N1TS_10 and default
// 1 MB tables): erase, program, the synchronous wrappers and the asynchronous requests.

// The wrappers pass task infos with only the fields the core function reads set.
#pragma warn_uninitializedvar off

#pragma force_active on

u32 CTRDGi_EraseFlashChipCoreMX(CTRDGTaskInfo *arg) {
    MICartridgeRamCycle ramCycle;
    u16 result;

    OS_LockCartridge(ctrdgi_flash_lock_id);
    ramCycle = MI_GetCartridgeRamCycle();
    MI_SetCartridgeRamCycle(AgbFlash->agbWait[0]);
    ctrdgi_backup_irq = OS_DisableIrq();
    *(vu8 *)CTRDG_BACKUP_COM_ADR1 = 0xAA;
    *(vu8 *)CTRDG_BACKUP_COM_ADR2 = 0x55;
    *(vu8 *)CTRDG_BACKUP_COM_ADR1 = 0x80;
    *(vu8 *)CTRDG_BACKUP_COM_ADR1 = 0xAA;
    *(vu8 *)CTRDG_BACKUP_COM_ADR2 = 0x55;
    *(vu8 *)CTRDG_BACKUP_COM_ADR1 = 0x10;
    (void)OS_RestoreIrq(ctrdgi_backup_irq);
    result = CTRDGi_PollingSR(CTRDG_BACKUP_PHASE_CHIP_ERASE, (u8 *)CTRDG_AGB_FLASH_ADR, 0xFF);
    MI_SetCartridgeRamCycle(ramCycle);
    OS_UnlockCartridge(ctrdgi_flash_lock_id);
    return result;
}

// Selects the sector's bank; one retry when the erase reports a timeout / failure (0xA000 bits).
u32 CTRDGi_EraseFlashSectorCoreMX(CTRDGTaskInfo *arg) {
    CTRDGTaskInfo task;
    u16 secNo;
    MICartridgeRamCycle ramCycle;
    u16 retry;
    u16 result;

    task = *arg;
    secNo = task.sec_num;
    if (secNo >= AgbFlash->sector.count) {
        return CTRDG_BACKUP_RESULT_ERROR | CTRDG_BACKUP_PHASE_PARAMETER_CHECK;
    }
    OS_LockCartridge(ctrdgi_flash_lock_id);
    ramCycle = MI_GetCartridgeRamCycle();
    MI_SetCartridgeRamCycle(AgbFlash->agbWait[0]);
    CTRDGi_SetFlashBankMx((u16)(secNo >> 4));
    secNo &= 0xF;
    retry = 0;
    for (;;) {
        u32 offset;
        offset = secNo << AgbFlash->sector.shift;
        ctrdgi_backup_irq = OS_DisableIrq();
        *(vu8 *)CTRDG_BACKUP_COM_ADR1 = 0xAA;
        *(vu8 *)CTRDG_BACKUP_COM_ADR2 = 0x55;
        *(vu8 *)CTRDG_BACKUP_COM_ADR1 = 0x80;
        *(vu8 *)CTRDG_BACKUP_COM_ADR1 = 0xAA;
        *(vu8 *)CTRDG_BACKUP_COM_ADR2 = 0x55;
        *(vu8 *)(CTRDG_AGB_FLASH_ADR + offset) = 0x30;
        (void)OS_RestoreIrq(ctrdgi_backup_irq);
        result = CTRDGi_PollingSR(CTRDG_BACKUP_PHASE_SECTOR_ERASE, (u8 *)(CTRDG_AGB_FLASH_ADR + offset), 0xFF);
        if (!(result & 0xA000) || retry != 0) {
            break;
        }
        retry++;
    }
    MI_SetCartridgeRamCycle(ramCycle);
    OS_UnlockCartridge(ctrdgi_flash_lock_id);
    return result;
}

u16 CTRDGi_ProgramFlashByteMX(u8 *src, u8 *dst) {
    *(vu8 *)CTRDG_BACKUP_COM_ADR1 = 0xAA;
    *(vu8 *)CTRDG_BACKUP_COM_ADR2 = 0x55;
    *(vu8 *)CTRDG_BACKUP_COM_ADR1 = 0xA0;
    *(vu8 *)dst = *src;
    return CTRDGi_PollingSR(CTRDG_BACKUP_PHASE_PROGRAM, dst, *src);
}

u32 CTRDGi_WriteFlashSectorCoreMX(CTRDGTaskInfo *arg) {
    CTRDGTaskInfo task;
    u16 secNo;
    MICartridgeRamCycle ramCycle;
    u16 result;
    u8 *src;
    u8 *dst;

    task = *arg;
    secNo = task.sec_num;
    src = task.data;
    if (secNo >= AgbFlash->sector.count) {
        return CTRDG_BACKUP_RESULT_ERROR | CTRDG_BACKUP_PHASE_PARAMETER_CHECK;
    }
    result = CTRDGi_EraseFlashSectorMX(secNo);
    if (result) {
        return result;
    }
    OS_LockCartridge(ctrdgi_flash_lock_id);
    ramCycle = MI_GetCartridgeRamCycle();
    MI_SetCartridgeRamCycle(AgbFlash->agbWait[0]);
    CTRDGi_SetFlashBankMx((u16)(secNo >> 4));
    secNo &= 0xF;
    ctrdg_flash_remainder = (u16)AgbFlash->sector.size;
    dst = (u8 *)(CTRDG_AGB_FLASH_ADR + (secNo << AgbFlash->sector.shift));
    ctrdgi_backup_irq = OS_DisableIrq();
    while (ctrdg_flash_remainder) {
        result = CTRDGi_ProgramFlashByteMX(src, dst);
        if (result) {
            break;
        }
        src++;
        dst++;
        ctrdg_flash_remainder--;
    }
    (void)OS_RestoreIrq(ctrdgi_backup_irq);
    MI_SetCartridgeRamCycle(ramCycle);
    OS_UnlockCartridge(ctrdgi_flash_lock_id);
    return result;
}

u16 CTRDGi_EraseFlashChipMX(void) {
    CTRDGTaskInfo task;

    return (u16)CTRDGi_EraseFlashChipCoreMX(&task);
}

u16 CTRDGi_EraseFlashSectorMX(u16 secNo) {
    CTRDGTaskInfo task;

    task.sec_num = secNo;
    return (u16)CTRDGi_EraseFlashSectorCoreMX(&task);
}

u16 CTRDGi_WriteFlashSectorMX(u16 secNo, u8 *src) {
    CTRDGTaskInfo task;

    task.sec_num = secNo;
    task.data = src;
    return (u16)CTRDGi_WriteFlashSectorCoreMX(&task);
}

void CTRDGi_EraseFlashChipAsyncMX(CTRDG_TASK_FUNC callback) {
    CTRDGTaskInfo task;

    CTRDGi_SetTask(&task, CTRDGi_EraseFlashChipCoreMX, callback);
}

void CTRDGi_EraseFlashSectorAsyncMX(u16 secNo, CTRDG_TASK_FUNC callback) {
    CTRDGTaskInfo task;

    task.sec_num = secNo;
    CTRDGi_SetTask(&task, CTRDGi_EraseFlashSectorCoreMX, callback);
}

void CTRDGi_WriteFlashSectorAsyncMX(u16 secNo, u8 *src, CTRDG_TASK_FUNC callback) {
    CTRDGTaskInfo task;

    task.data = src;
    task.sec_num = secNo;
    CTRDGi_SetTask(&task, CTRDGi_WriteFlashSectorCoreMX, callback);
}
