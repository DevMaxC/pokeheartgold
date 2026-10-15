#pragma force_active on
#include <nitro/types.h>

u32 OSi_CpuClear32(register u32 value, register void *ptr, register u32 size);

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>
#include <nitro/itcm_begin.h>

// clang-format off
asm u32 OSi_CpuClear32(register u32 value, register void *ptr, register u32 size) {
    add r12, r1, r2
@loop:
    cmp r1, r12
    stmltia r1!, {r0}
    blt @loop
    bx lr
}
// clang-format on

#include <nitro/itcm_end.h>
