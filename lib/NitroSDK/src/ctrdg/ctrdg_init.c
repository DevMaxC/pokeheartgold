#include "CTRDG_init.h"

#include "PXI_init.h"
#include "code32.h"

#pragma force_active on

void CTRDG_Init(void) {
    if (gCtrdgInitWork.initialized) {
        return;
    }
    gCtrdgInitWork.initialized = TRUE;
    CTRDGi_InitCommon();
    gCtrdgInitWork.pulledOut = FALSE;
    PXI_Init();
    while (!PXI_IsCallbackReady(PXI_FIFO_TAG_CTRDG, PXI_PROC_ARM7)) {}
    PXI_SetFifoRecvCallback(PXI_FIFO_TAG_CTRDG, CTRDGi_CallbackForInitModuleInfo);
    CTRDGi_InitModuleInfo();
    PXI_SetFifoRecvCallback(PXI_FIFO_TAG_CTRDG, NULL);
    PXI_SetFifoRecvCallback(PXI_FIFO_TAG_CTRDG, CTRDGi_PulledOutCallback);
    gCtrdgInitWork.pulledOutCallback = NULL;
    CTRDGi_InitTaskThread(&gCtrdgTaskThread);
    PXI_SetFifoRecvCallback(17, CTRDGi_CallbackForSetPhi);
    CTRDG_Enable(FALSE);
}
