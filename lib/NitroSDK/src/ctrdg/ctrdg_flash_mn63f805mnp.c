// CTRDG_backup.h declares ctrdg_flash_remainder plain; this module's write loop accesses it as volatile (as the
// original was compiled), so the header declaration is hidden here.
#define ctrdg_flash_remainder ctrdg_flash_remainder_HeaderDeclaration
#include "CTRDG_flash_internal.h"
#undef ctrdg_flash_remainder
#include "OS_spinLock.h"
#include "code32.h"

// MN63F805MNP flash backup: LE-style erase and program (CTRDGi_EraseFlashSectorLE,
// CTRDGi_ProgramFlashByteLE) with the sector count of the identified chip; the erase functions of its
// table are the LE ones.

// The wrappers pass task infos with only the fields the core function reads set.
#pragma warn_uninitializedvar off

extern volatile u16 ctrdg_flash_remainder;

#pragma force_active on

#pragma push
#pragma opt_propagation off

u32 CTRDGi_WriteFlashSectorCoreMX5(CTRDGTaskInfo *arg) {
    CTRDGTaskInfo task = *arg;
    u16 secNo = task.sec_num;
    u32 ramCycle;
    u16 result;
    const u8 *src = task.data;
    u8 *dst;

    if (secNo >= AgbFlash->sector.count) {
        return CTRDG_BACKUP_RESULT_ERROR | CTRDG_BACKUP_PHASE_PARAMETER_CHECK;
    }
    result = CTRDGi_EraseFlashSectorLE(secNo);
    if (result) {
        return result;
    }
    OS_LockCartridge(ctrdgi_flash_lock_id);
    ramCycle = reg_MI_EXMEMCNT;
    {
        u32 wait = AgbFlash->agbWait[0];
        reg_MI_EXMEMCNT = (reg_MI_EXMEMCNT & ~3) | wait;
    }
    ramCycle &= 3;
    ctrdg_flash_remainder = AgbFlash->sector.size;
    dst = (u8 *)(CTRDG_AGB_FLASH_ADR + (secNo << AgbFlash->sector.shift));
    while (ctrdg_flash_remainder) {
        result = CTRDGi_ProgramFlashByteLE((u8 *)src, dst);
        if (result) {
            break;
        }
        ctrdg_flash_remainder--;
        src++;
        dst++;
    }
    reg_MI_EXMEMCNT = (reg_MI_EXMEMCNT & ~3) | ramCycle;
    OS_UnlockCartridge(ctrdgi_flash_lock_id);
    return result;
}

#pragma pop

u16 CTRDGi_WriteFlashSectorMX5(u16 secNo, u8 *src) {
    CTRDGTaskInfo task;

    task.sec_num = secNo;
    task.data = src;
    return (u16)CTRDGi_WriteFlashSectorCoreMX5(&task);
}

void CTRDGi_WriteFlashSectorAsyncMX5(u16 secNo, u8 *src, CTRDG_TASK_FUNC callback) {
    CTRDGTaskInfo task;

    task.data = src;
    task.sec_num = secNo;
    CTRDGi_SetTask(&task, CTRDGi_WriteFlashSectorCoreMX5, callback);
}
