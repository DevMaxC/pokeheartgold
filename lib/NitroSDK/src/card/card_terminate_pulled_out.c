#pragma force_active on
#include "global.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>
#pragma force_active on
u32 PM_ForceToPowerOff(void);
void CARDi_SendtoPxi(u32, u32);
void CARD_TerminateForPulledOut(void);

void CARD_TerminateForPulledOut(void) {
    BOOL send = TRUE;
    u32 r;
    MI_StopDma(0);
    MI_StopDma(1);
    MI_StopDma(2);
    MI_StopDma(3);
    if ((*(vu16 *)HW_BUTTON_XY_BUF & 0x8000) >> 15) {
        r = PM_ForceToPowerOff();
        while (r == 4) {
            OS_SpinWait(0xA3A47);
            r = PM_ForceToPowerOff();
        }
        if (r == 0) {
            send = FALSE;
        }
    }
    if (send) {
        CARDi_SendtoPxi(1, 1);
    }
    OS_Terminate();
}
