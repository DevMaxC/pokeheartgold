#include <nitro/code32.h>
#include <nitro/fx.h>
#include <nitro/mi/memory.h>
#include <nitro/types.h>

#define FX32_INT_SHIFT FX32_SHIFT
#define _              a

void MI_Copy48B(const void *src, void *dst);
void MTX_ScaleApply33(const MtxFx33 *mtx, MtxFx33 *dst, fx32 x, fx32 y, fx32 z);
void MTX_ScaleApply43(const MtxFx43 *mtx, MtxFx43 *dst, fx32 x, fx32 y, fx32 z);
fx32 MTX_Inverse43(const MtxFx43 *mtx, MtxFx43 *inv);
void MTX_MultVec43(const VecFx32 *vec, const MtxFx43 *mtx, VecFx32 *dst);
void FX_InvAsync(fx32 denominator);
fx32 FX_GetDivResult(void);

void MTX_ScaleApply43(const MtxFx43 *mtx, MtxFx43 *dst, fx32 x, fx32 y, fx32 z) {
    // this works because matrices are indexed columns first
    MTX_ScaleApply33((MtxFx33 *)mtx, (MtxFx33 *)dst, x, y, z);
    dst->_[9] = mtx->_[9];
    dst->_[10] = mtx->_[10];
    dst->_[11] = mtx->_[11];
}
