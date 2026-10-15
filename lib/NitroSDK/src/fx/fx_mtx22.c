#include <nitro/fx/fx.h>

void MTX_Identity22_(MtxFx22 *mtx);
void MTX_Rot22_(MtxFx22 *mtx, fx16 sinphi, fx16 cosphi);
void MTX_ScaleApply22(const MtxFx22 *mtx, MtxFx22 *dst, fx32 x, fx32 y);

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

// clang-format off
asm void MTX_Identity22_(MtxFx22 *mtx) {
    mov r1, #0x0
    mov r2, #0x1000
    mov r3, #0x0
    stmia r0!, {r2-r3}
    stmia r0!, {r1-r2}
    bx lr
}
// clang-format on

#pragma force_active on

// The code below is compiled as Thumb code.
#include <nitro/code16.h>

void MTX_Rot22_(MtxFx22 *mtx, fx16 sinphi, fx16 cosphi) {
    mtx->a[0] = cosphi;
    mtx->a[1] = sinphi;
    mtx->a[2] = (fx32)(0u - (u32)sinphi);
    mtx->a[3] = cosphi;
}

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

void MTX_ScaleApply22(const MtxFx22 *mtx, MtxFx22 *dst, fx32 x, fx32 y) {
    dst->a[0] = (fx32)(((fx64)x * mtx->a[0]) >> FX32_SHIFT);
    dst->a[1] = (fx32)(((fx64)x * mtx->a[1]) >> FX32_SHIFT);
    dst->a[2] = (fx32)(((fx64)y * mtx->a[2]) >> FX32_SHIFT);
    dst->a[3] = (fx32)(((fx64)y * mtx->a[3]) >> FX32_SHIFT);
}
