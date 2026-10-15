#pragma force_active on
#include <nitro/types.h>
u32 MI_SwapWord(register u32 setData, register vu32 *destp);

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

// clang-format off
asm u32 MI_SwapWord(register u32 setData, register vu32 *destp) {
    swp r0, r0, [r1]
    bx lr
}
// clang-format on
