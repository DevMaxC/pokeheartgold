#pragma force_active on
#include <nitro/types.h>

void OSi_ArrangeTimer(void);
void OSi_AlarmHandler(void *arg);

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

// clang-format off
asm void OSi_AlarmHandler(void *arg) {
    stmfd sp!, {r0, lr}
    bl OSi_ArrangeTimer
    ldmfd sp!, {r0, lr}
    bx lr
}
// clang-format on
