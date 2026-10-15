#include "CTRDG_flash_internal.h"
#include "MI_exMemory.h"
#include "OS_interrupt.h"
#include "OS_spinLock.h"
#include "code32.h"

// LE39FW512 flash backup (512 KB, 16 sectors): erase, program and verify, the synchronous wrappers and
// the asynchronous requests (run on the CTRDG task thread).

// The wrappers pass task infos with only the fields the core function reads set.
#pragma warn_uninitializedvar off

#pragma force_active on

u32 CTRDGi_EraseFlashChipCoreLE(CTRDGTaskInfo *arg) {
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

u32 CTRDGi_EraseFlashSectorCoreLE(CTRDGTaskInfo *arg) {
    CTRDGTaskInfo task;
    u16 secNo;
    MICartridgeRamCycle ramCycle;
    u32 offset;
    u16 result;

    task = *arg;
    secNo = task.sec_num;
    if (secNo >= 16) {
        return CTRDG_BACKUP_RESULT_ERROR | CTRDG_BACKUP_PHASE_PARAMETER_CHECK;
    }
    OS_LockCartridge(ctrdgi_flash_lock_id);
    ramCycle = MI_GetCartridgeRamCycle();
    MI_SetCartridgeRamCycle(AgbFlash->agbWait[0]);
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
    MI_SetCartridgeRamCycle(ramCycle);
    OS_UnlockCartridge(ctrdgi_flash_lock_id);
    return result;
}

u16 CTRDGi_ProgramFlashByteLE(u8 *src, u8 *dst) {
    *(vu8 *)CTRDG_BACKUP_COM_ADR1 = 0xAA;
    *(vu8 *)CTRDG_BACKUP_COM_ADR2 = 0x55;
    *(vu8 *)CTRDG_BACKUP_COM_ADR1 = 0xA0;
    *(vu8 *)dst = *src;
    return CTRDGi_PollingSR(CTRDG_BACKUP_PHASE_PROGRAM, dst, *src);
}

// Erases the sector (up to 80 tries until it reads back erased, then 1 or 6 more erases) and programs it.
u32 CTRDGi_WriteFlashSectorCoreLE(CTRDGTaskInfo *arg) {
    CTRDGTaskInfo task;
    u8 *dst;
    u16 secNo;
    MICartridgeRamCycle ramCycle;
    u16 result;
    u8 *src;
    u16 retry;
    u16 extraErases;

    task = *arg;
    secNo = task.sec_num;
    src = task.data;
    if (secNo >= 16) {
        return CTRDG_BACKUP_RESULT_ERROR | CTRDG_BACKUP_PHASE_PARAMETER_CHECK;
    }
    dst = (u8 *)(CTRDG_AGB_FLASH_ADR + (secNo << AgbFlash->sector.shift));
    retry = 0;
    for (;;) {
        result = CTRDGi_EraseFlashSectorLE(secNo);
        if (result == 0) {
            result = (u16)CTRDGi_VerifyFlashErase(dst, CTRDGi_VerifyFlashCoreFF);
            if (result == 0) {
                break;
            }
        }
        if (retry++ == 80) {
            return result;
        }
    }
    extraErases = 1;
    if (retry != 0) {
        extraErases = 6;
    }
    for (retry = 1; retry <= extraErases; retry++) {
        CTRDGi_EraseFlashSectorLE(secNo);
    }
    OS_LockCartridge(ctrdgi_flash_lock_id);
    ramCycle = MI_GetCartridgeRamCycle();
    MI_SetCartridgeRamCycle(AgbFlash->agbWait[0]);
    ctrdg_flash_remainder = (u16)AgbFlash->sector.size;
    ctrdgi_backup_irq = OS_DisableIrq();
    while (ctrdg_flash_remainder) {
        result = CTRDGi_ProgramFlashByteLE(src, dst);
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

// Number of bytes left to check when a byte other than 0xFF is found (0: the sector is erased).
u32 CTRDGi_VerifyFlashCoreFF(u8 *adr) {
    int count = AgbFlash->sector.size;

    while (count) {
        if (*adr++ != 0xFF) {
            break;
        }
        count--;
    }
    return count;
}

#pragma push
#pragma opt_propagation off

u32 CTRDGi_VerifyFlashErase(u8 *adr, u32 (*verify)(u8 *adr)) {
    u32 result;
    const CTRDGFlashType *flash;
    u32 ramCycle;

    OS_LockCartridge(ctrdgi_flash_lock_id);
    ramCycle = reg_MI_EXMEMCNT & 3;
    flash = AgbFlash;
    {
        u32 exmemcnt = reg_MI_EXMEMCNT, wait = flash->agbWait[0];
        reg_MI_EXMEMCNT = (exmemcnt & ~3u) | wait;
    }
    result = 0;
    if (verify(adr)) {
        result = CTRDG_BACKUP_RESULT_ERROR | 4;
    }
    reg_MI_EXMEMCNT = (reg_MI_EXMEMCNT & ~3) | ramCycle;
    OS_UnlockCartridge(ctrdgi_flash_lock_id);
    return result;
}

#pragma pop

u16 CTRDGi_EraseFlashChipLE(void) {
    CTRDGTaskInfo task;

    return (u16)CTRDGi_EraseFlashChipCoreLE(&task);
}

u16 CTRDGi_EraseFlashSectorLE(u16 secNo) {
    CTRDGTaskInfo task;

    task.sec_num = secNo;
    return (u16)CTRDGi_EraseFlashSectorCoreLE(&task);
}

u16 CTRDGi_WriteFlashSectorLE(u16 secNo, u8 *src) {
    CTRDGTaskInfo task;

    task.sec_num = secNo;
    task.data = src;
    return (u16)CTRDGi_WriteFlashSectorCoreLE(&task);
}

void CTRDGi_EraseFlashChipAsyncLE(CTRDG_TASK_FUNC callback) {
    CTRDGTaskInfo task;

    CTRDGi_SetTask(&task, CTRDGi_EraseFlashChipCoreLE, callback);
}

void CTRDGi_EraseFlashSectorAsyncLE(u16 secNo, CTRDG_TASK_FUNC callback) {
    CTRDGTaskInfo task;

    task.sec_num = secNo;
    CTRDGi_SetTask(&task, CTRDGi_EraseFlashSectorCoreLE, callback);
}

void CTRDGi_WriteFlashSectorAsyncLE(u16 secNo, u8 *src, CTRDG_TASK_FUNC callback) {
    CTRDGTaskInfo task;

    task.data = src;
    task.sec_num = secNo;
    CTRDGi_SetTask(&task, CTRDGi_WriteFlashSectorCoreLE, callback);
}
