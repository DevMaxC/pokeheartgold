#include <nitro.h>
#include <nitro/code32.h>

void MI_Copy48B(const void *pSrc, void *pDest);

void MTX_TransApply44(const MtxFx44 *mtx, MtxFx44 *dst, fx32 x, fx32 y, fx32 z) {
    if (mtx != dst) {
        MI_Copy48B(mtx, dst);
    }
    dst->a[12] = mtx->a[12] + (fx32)(((fx64)x * mtx->a[0] + (fx64)y * mtx->a[4] + (fx64)z * mtx->a[8]) >> FX32_SHIFT);
    dst->a[13] = mtx->a[13] + (fx32)(((fx64)x * mtx->a[1] + (fx64)y * mtx->a[5] + (fx64)z * mtx->a[9]) >> FX32_SHIFT);
    dst->a[14] = mtx->a[14] + (fx32)(((fx64)x * mtx->a[2] + (fx64)y * mtx->a[6] + (fx64)z * mtx->a[10]) >> FX32_SHIFT);
    dst->a[15] = mtx->a[15] + (fx32)(((fx64)x * mtx->a[3] + (fx64)y * mtx->a[7] + (fx64)z * mtx->a[11]) >> FX32_SHIFT);
}
