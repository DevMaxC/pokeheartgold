#include "CTRDG_init.h"
#include "MI_dma.h"
#include "MI_memory.h"
#include "OS_cache.h"
#include "OS_interrupt.h"
#include "OS_terminate_proc.h"
#include "code32.h"
#include "mmap.h"
#include "syscall.h"

// CTRDGi_InitModuleInfo is not force_active; MWCC gives the TU's .bss (its static flag) the force_active state
// of the first function, so it has a file of its own apart from CTRDG_Init.

// Copies the cartridge header and the module information for the subprocessor and waits until it has
// taken them.
#pragma push
#pragma optimization_level 2
#pragma opt_propagation off

void CTRDGi_InitModuleInfo(void) {
    CTRDGLockByProc lockInfo;
    CTRDGRomCycle romCycle;
    OSIrqMask lastIrqMask;
    BOOL lastIme;
    int priority;
    int i;
    static BOOL isInitialized;

    if (isInitialized) {
        return;
    }
    {
        BOOL initialized = TRUE;
        u16 postFlag = reg_OS_PAUSE;
        isInitialized = initialized;
        if (!(postFlag & 1)) {
            return;
        }
    }
    lastIrqMask = OS_SetIrqMask(OS_IE_SPFIFO_RECV);
    lastIme = OS_EnableIrq();
    CTRDGi_LockByProcessor(CTRDGi_Work.lockID, &lockInfo);
    priority = (reg_MI_EXMEMCNT & 0x8000) >> 15;
    CTRDGi_ChangeLatestAccessCycle(&romCycle);
    reg_MI_EXMEMCNT = (u16)(reg_MI_EXMEMCNT & ~0x8000);
    DC_InvalidateRange((u8 *)&gCtrdgHeader + 0x80, 0x40);
    MI_DmaCopy16(1, (void *)(HW_CTRDG_ROM + 0x80), (void *)((u32)&gCtrdgHeader + 0x80), 0x40);
    reg_MI_EXMEMCNT = (u16)((reg_MI_EXMEMCNT & ~0x8000) | (priority << 15));
    CTRDGi_RestoreAccessCycle(&romCycle);
    CTRDGi_UnlockByProcessor(CTRDGi_Work.lockID, &lockInfo);
    if (*(u8 *)0x027FFF9B != 0 || *(u8 *)0x027FFF9A == 0) {
        CTRDGHeader *header = &gCtrdgHeader;
        CTRDGModuleInfo *info = CTRDGi_GetModuleInfoAddr();
        info->moduleID.raw = header->moduleID;
        for (i = 0; i < 3; i++) {
            info->exLsiID[i] = header->exLsiID[i];
        }
        info->makerCode = header->makerCode;
        info->gameCode = header->gameCode;
        *(u8 *)0x027FFF9B = CTRDG_IsExisting() ? 1 : 0;
        *(u8 *)0x027FFF9A = 1;
    }
    MIi_CpuCopy32((void *)(HW_BIOS + 0x20), gCtrdgHeaderLogo, 0x9C);
    DC_FlushAll();
    CTRDGi_SendtoPxi((((u32)((u8 *)&gCtrdgHeader - HW_MAIN_MEM)) >> 5) << 6 | 1);
    while (CTRDGi_Work.subpInitialized != 1) {
        SVC_WaitByLoop(1);
    }
    (void)OS_RestoreIrq(lastIme);
    OS_SetIrqMask(lastIrqMask);
}

#pragma pop

#pragma force_active on

void CTRDGi_CallbackForInitModuleInfo(PXIFifoTag tag, u32 data, BOOL err) {
    if ((data & 0x3F) == 1) {
        CTRDGi_Work.subpInitialized = 1;
    } else {
        OS_Terminate();
    }
}

void CTRDGi_PulledOutCallback(PXIFifoTag tag, u32 data, BOOL err) {
    BOOL terminate;
    BOOL (*callback)(void);

    if ((data & 0x3F) == 0x11) {
        if (gCtrdgInitWork.pulledOut) {
            return;
        }
        callback = gCtrdgInitWork.pulledOutCallback;
        terminate = FALSE;
        if (callback) {
            terminate = callback();
        }
        if (terminate) {
            CTRDG_TerminateForPulledOut();
        }
        gCtrdgInitWork.pulledOut = TRUE;
    } else {
        OS_Terminate();
    }
}

void CTRDG_TerminateForPulledOut(void) {
    CTRDGi_SendtoPxi(2);
    OS_Terminate();
}

void CTRDGi_CallbackForSetPhi(PXIFifoTag tag, u32 data, BOOL err) {
    gCtrdgInitWork.settingPhi = FALSE;
}
