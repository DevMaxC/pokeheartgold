#ifndef POKEHEARTGOLD_CTRDG_FLASH_INTERNAL_H
#define POKEHEARTGOLD_CTRDG_FLASH_INTERNAL_H

#include "CTRDG_backup.h"
#include "CTRDG_task.h"
#include "OS_thread.h"

// AGB flash backup: the routines all chip drivers share (ctrdg_flash_common.c), the drivers of the
// LE39FW512, MX29L010 / LE26FV10N1TS_10 / defaultFlash1M and MN63F805MNP tables of
// CTRDG_IdentifyAgbBackup, and the task thread that runs their asynchronous requests.
// lib/NitroSDK/src/ctrdg/ctrdg_flash_*.c, ctrdg_task.c.

#define CTRDG_BACKUP_COM_ADR1 (CTRDG_AGB_FLASH_ADR + 0x00005555)
#define CTRDG_BACKUP_COM_ADR2 (CTRDG_AGB_FLASH_ADR + 0x00002AAA)

// The task thread object (CTRDG_Init passes it to CTRDGi_InitTaskThread).
typedef struct CTRDGiTaskThread {
    OSThread thread;
    CTRDGTaskInfo *volatile task; // 0xC0: request to run, NULL when idle (set by CTRDGi_SetTask)
    CTRDGTaskInfo info;           // 0xC4: setting this one as the request ends the thread
} CTRDGiTaskThread;

typedef struct CTRDGiTaskWork {
    CTRDGiTaskThread *thread;
    CTRDGTaskInfo nextTask; // copy of the request being run
    u8 stack[0x400];
} CTRDGiTaskWork;

extern u16 ctrdgi_flash_lock_id;
extern BOOL ctrdgi_backup_irq;
extern CTRDGiTaskWork gCtrdgTaskWork;
extern CTRDGTaskInfo gCtrdgNextTask; // label of gCtrdgTaskWork.nextTask
extern u8 gCtrdgTaskStack[];         // label of gCtrdgTaskWork.stack

// Flash driver state that starts at ctrdgi_flash_lock_id (the labels CTRDGi_WriteAgbFlashSector ...
// ctrdgi_backup_irq lie inside it); ctrdg_flash_common.c accesses it through this view.
typedef struct CTRDGiFlashWork {
    u16 lockID;        // 0x00: ctrdgi_flash_lock_id
    u16 timerExpired;  // 0x02: set by CheckFlashTimer once timerLimit milliseconds have passed
    u16 (*writeAgbFlashSector)(u16 secNo, u8 *src);                                 // 0x04
    void (*writeAgbFlashSectorAsync)(u16 secNo, u8 *src, CTRDG_TASK_FUNC callback); // 0x08
    void (*eraseAgbFlashChipAsync)(CTRDG_TASK_FUNC callback);                       // 0x0C
    u16 (*eraseAgbFlashSector)(u16 secNo);                                          // 0x10
    void (*eraseAgbFlashSectorAsync)(u16 secNo, CTRDG_TASK_FUNC callback);          // 0x14
    u16 (*eraseAgbFlashChip)(void);                                                 // 0x18
    u32 savedIme;   // 0x1C: ctrdgi_backup_irq; IME while a command sequence is sent
    u64 timerLimit; // 0x20: milliseconds
    u64 timerStart; // 0x28: tick
} CTRDGiFlashWork;

// The identified chip: AgbFlash and ctrdgi_fl_maxtime (per-phase time limits, milliseconds).
typedef struct CTRDGiFlashChip {
    const CTRDGFlashType *type;
    const u16 *maxtime;
} CTRDGiFlashChip;

void CTRDGi_SetFlashBankMx(u16 bank);
u16 CTRDGi_ReadFlashID(void);
void StartFlashTimer(u16 phase);
void CheckFlashTimer(void);
u8 CTRDGi_ReadSrFunc(const u8 *adr);
u16 CTRDGi_PollingSR512kCOMMON(u16 phase, const u8 *adr, u8 lastData);
u16 CTRDGi_PollingSR1MCOMMON(u16 phase, const u8 *adr, u8 lastData);
u32 CTRDGi_ReadAgbFlashCore(CTRDGTaskInfo *arg);
u32 CTRDGi_VerifyFlashSectorCore(const u8 *src, const u8 *tgt, u32 size);
u32 CTRDGi_VerifyAgbFlashCore(CTRDGTaskInfo *arg);
u32 CTRDGi_WriteAndVerifyAgbFlashSectorCore(CTRDGTaskInfo *arg);
void CTRDG_ReadAgbFlash(u16 secNo, u32 offset, void *dst, u32 size);
u32 CTRDG_WriteAgbFlashSector(u16 secNo, const void *src);
u32 CTRDG_VerifyAgbFlash(u16 secNo, const void *src, u32 size);
void CTRDG_WriteAndVerifyAgbFlashAsync(u16 secNo, const void *src, u32 size, CTRDG_TASK_FUNC callback);

u32 CTRDGi_EraseFlashChipCoreLE(CTRDGTaskInfo *arg);
u32 CTRDGi_EraseFlashSectorCoreLE(CTRDGTaskInfo *arg);
u16 CTRDGi_ProgramFlashByteLE(u8 *src, u8 *dst);
u32 CTRDGi_WriteFlashSectorCoreLE(CTRDGTaskInfo *arg);
u32 CTRDGi_VerifyFlashCoreFF(u8 *adr);
u32 CTRDGi_VerifyFlashErase(u8 *adr, u32 (*verify)(u8 *adr));
u16 CTRDGi_EraseFlashChipLE(void);
u16 CTRDGi_EraseFlashSectorLE(u16 secNo);
u16 CTRDGi_WriteFlashSectorLE(u16 secNo, u8 *src);
void CTRDGi_EraseFlashChipAsyncLE(CTRDG_TASK_FUNC callback);
void CTRDGi_EraseFlashSectorAsyncLE(u16 secNo, CTRDG_TASK_FUNC callback);
void CTRDGi_WriteFlashSectorAsyncLE(u16 secNo, u8 *src, CTRDG_TASK_FUNC callback);

u32 CTRDGi_EraseFlashChipCoreMX(CTRDGTaskInfo *arg);
u32 CTRDGi_EraseFlashSectorCoreMX(CTRDGTaskInfo *arg);
u16 CTRDGi_ProgramFlashByteMX(u8 *src, u8 *dst);
u32 CTRDGi_WriteFlashSectorCoreMX(CTRDGTaskInfo *arg);
u16 CTRDGi_EraseFlashChipMX(void);
u16 CTRDGi_EraseFlashSectorMX(u16 secNo);
u16 CTRDGi_WriteFlashSectorMX(u16 secNo, u8 *src);
void CTRDGi_EraseFlashChipAsyncMX(CTRDG_TASK_FUNC callback);
void CTRDGi_EraseFlashSectorAsyncMX(u16 secNo, CTRDG_TASK_FUNC callback);
void CTRDGi_WriteFlashSectorAsyncMX(u16 secNo, u8 *src, CTRDG_TASK_FUNC callback);

u32 CTRDGi_WriteFlashSectorCoreMX5(CTRDGTaskInfo *arg);
u16 CTRDGi_WriteFlashSectorMX5(u16 secNo, u8 *src);
void CTRDGi_WriteFlashSectorAsyncMX5(u16 secNo, u8 *src, CTRDG_TASK_FUNC callback);

void CTRDGi_InitTaskThread(void *thread);
BOOL CTRDGi_IsTaskAvailable(void);
void CTRDGi_InitTaskInfo(CTRDGTaskInfo *info);
void CTRDGi_TaskThread(void *arg);
void CTRDGi_SetTask(CTRDGTaskInfo *info, CTRDG_TASK_FUNC task, CTRDG_TASK_FUNC callback);

#endif // POKEHEARTGOLD_CTRDG_FLASH_INTERNAL_H
