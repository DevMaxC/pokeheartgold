#include <nitro/fx/fx.h>

void MTX_ScaleApply33(MtxFx33 *mtx, MtxFx33 *dst, fx32 x, fx32 y, fx32 z);
void MTX_RotX33_(MtxFx33 *p, fx32 sine, fx32 cosine);

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

void MTX_ScaleApply33(MtxFx33 *mtx, MtxFx33 *dst, fx32 x, fx32 y, fx32 z) {
    dst->a[0] = (fx32)(((fx64)x * mtx->a[0]) >> FX32_SHIFT);
    dst->a[1] = (fx32)(((fx64)x * mtx->a[1]) >> FX32_SHIFT);
    dst->a[2] = (fx32)(((fx64)x * mtx->a[2]) >> FX32_SHIFT);
    dst->a[3] = (fx32)(((fx64)y * mtx->a[3]) >> FX32_SHIFT);
    dst->a[4] = (fx32)(((fx64)y * mtx->a[4]) >> FX32_SHIFT);
    dst->a[5] = (fx32)(((fx64)y * mtx->a[5]) >> FX32_SHIFT);
    dst->a[6] = (fx32)(((fx64)z * mtx->a[6]) >> FX32_SHIFT);
    dst->a[7] = (fx32)(((fx64)z * mtx->a[7]) >> FX32_SHIFT);
    dst->a[8] = (fx32)(((fx64)z * mtx->a[8]) >> FX32_SHIFT);
}

#pragma force_active on

// The code below is compiled as Thumb code.
#include <nitro/code16.h>

// The matrix is written through a volatile pointer: every element is stored in order, as the original.
void MTX_RotX33_(MtxFx33 *p, fx32 sine, fx32 cosine) {
    volatile s32 *m = (volatile s32 *)p;
    m[0] = 4096;
    m[1] = 0;
    m[2] = 0;
    m[3] = 0;
    m[4] = cosine;
    m[5] = sine;
    m[6] = 0;
    m[7] = (s32)(0u - (u32)sine);
    m[8] = cosine;
}
