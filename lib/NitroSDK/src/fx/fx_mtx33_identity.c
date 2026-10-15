#pragma force_active on
#include <nitro/fx/fx.h>
void MTX_Identity33_(register MtxFx33 *pDst);

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

// clang-format off
asm void MTX_Identity33_(register MtxFx33 *pDst) {
    mov r2, #0x1000
    str r2, [r0, #0x20]
    mov r3, #0
    stmia r0!, {r2, r3}
    mov r1, #0
    stmia r0!, {r1, r3}
    stmia r0!, {r2, r3}
    stmia r0!, {r1, r3}
    bx lr
}
// clang-format on
