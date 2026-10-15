#include <nitro.h>
#include <nnsys/g3d_anm_mat_internal.h>

#pragma force_active on

// Maya texture matrix: scale, rotation and translation (the matrix works on texel coordinates of the
// original texture size)
void texmtxCalc_flag_(MtxFx44 *pMtx, const G3dMatAnmResult *pResult) {
    s32 w = pResult->origWidth << FX32_SHIFT, h = pResult->origHeight << FX32_SHIFT;
    s32 ssin, scos, tsin, tcos;
    FX_DivAsync(h, w);
    ssin = ((s64)pResult->scaleS * pResult->sinR) >> FX32_SHIFT;
    scos = ((s64)pResult->scaleS * pResult->cosR) >> FX32_SHIFT;
    tsin = ((s64)pResult->scaleT * pResult->sinR) >> FX32_SHIFT;
    tcos = ((s64)pResult->scaleT * pResult->cosR) >> FX32_SHIFT;
    pMtx->_00 = scos;
    pMtx->_11 = tcos;
    pMtx->_01 = (-tsin * FX_GetDivResult()) >> FX32_SHIFT;
    FX_DivAsync(w, h);
    pMtx->_30 = ((pResult->scaleS - (ssin + scos)) * pResult->origWidth << 3) - (s32)(((s64)pResult->scaleS * pResult->transS) >> 8) * pResult->origWidth;
    pMtx->_31 = ((tsin - tcos - pResult->scaleT + 0x2000) * pResult->origHeight << 3) + (s32)(((s64)pResult->scaleT * pResult->transT) >> 8) * pResult->origHeight;
    pMtx->_10 = (ssin * FX_GetDivResult()) >> FX32_SHIFT;
}
