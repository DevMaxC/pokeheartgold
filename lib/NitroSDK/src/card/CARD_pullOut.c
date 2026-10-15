#include "CARD_common.h"
#include "CARD_pullOut.h"
#include "PXI_init.h"
#include "PXI_fifo.h"
#include "OS_terminate_proc.h"
#include "OS_system.h"
#include "PAD_pad.h"
#include "SPI_pm.h"
#include "syscall.h"
#include "mmap.h"
#include "code32.h"

static CARDPulledOutCallback CARD_UserCallback;
static BOOL CARDi_IsPulledOutFlag = FALSE;

void CARDi_PulledOutCallback(PXIFifoTag tag, u32 data, BOOL err);
void CARDi_SendtoPxi(u32 data, u32 wait);

void CARD_InitPulledOutCallback(void)
{
    PXI_Init();

    PXI_SetFifoRecvCallback(PXI_FIFO_TAG_CARD, CARDi_PulledOutCallback);

    CARD_UserCallback = NULL;
}

void CARDi_PulledOutCallback(PXIFifoTag tag, u32 data, BOOL err)
{
#pragma unused(tag, err)
    u32 command = data & CARD_PXI_COMMAND_MASK;

    if (command == CARD_PXI_COMMAND_PULLED_OUT)
    {
        if (!CARDi_IsPulledOutFlag)
        {
            BOOL isTerminateImm = TRUE;
            CARDi_IsPulledOutFlag = TRUE;

            if (CARD_UserCallback)
            {
                isTerminateImm = CARD_UserCallback();
            }

            if (isTerminateImm)
            {
                CARD_TerminateForPulledOut();
            }
        }
    }
    else
    {
        OS_Terminate();
    }
}

BOOL CARD_IsPulledOut(void)
{
    return CARDi_IsPulledOutFlag;
}

/* unmatched CARD_TerminateForPulledOut remains in assembly */


void CARDi_CheckPulledOutCore(u32 id)
{
    vu32 iplCardID = *(vu32 *)((*(u16 *)HW_CHECK_DEBUGGER_SW == 0) ? HW_RED_RESERVED : HW_BOOT_CHECK_INFO_BUF);

    if (id != (u32)iplCardID)
    {
        OSIntrMode bak_cpsr = OS_DisableInterrupts();
        CARDi_PulledOutCallback(PXI_FIFO_TAG_CARD, CARD_PXI_COMMAND_PULLED_OUT, FALSE);
        (void)OS_RestoreInterrupts(bak_cpsr);
    }
}

void CARDi_SendtoPxi(u32 data, u32 wait)
{
    while (PXI_SendWordByFifo(PXI_FIFO_TAG_CARD, data, FALSE) != PXI_FIFO_SUCCESS)
    {
        SVC_WaitByLoop((u32)wait);
    }
}
