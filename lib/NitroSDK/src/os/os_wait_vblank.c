#include <nitro.h>

#pragma force_active on

void OS_WaitVBlankIntr(void) {
    SVC_WaitByLoop(1);
    OS_WaitIrq(TRUE, OS_IE_VBLANK);
}
