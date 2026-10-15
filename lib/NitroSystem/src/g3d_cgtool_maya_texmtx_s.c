#include <nitro.h>
#include <nnsys/g3d_anm_mat_internal.h>

#pragma force_active on

// Maya texture matrix: rotation and translation (scale one)
void texmtxCalc_flagS_(MtxFx44 *pMtx, const G3dMatAnmResult *pResult) {
    s32 w = pResult->origWidth << FX32_SHIFT, h = pResult->origHeight << FX32_SHIFT;
    FX_DivAsync(h, w);
    pMtx->_00 = pResult->cosR;
    pMtx->_11 = pResult->cosR;
    pMtx->_01 = (-pResult->sinR * FX_GetDivResult()) >> FX32_SHIFT;
    FX_DivAsync(w, h);
    pMtx->_30 = (pResult->origWidth * (-(pResult->sinR + pResult->cosR) + FX32_ONE) << 3) - (pResult->transS * pResult->origWidth << 4);
    pMtx->_31 = (pResult->origHeight * (pResult->sinR - pResult->cosR + FX32_ONE) << 3) + (pResult->transT * pResult->origHeight << 4);
    pMtx->_10 = (pResult->sinR * FX_GetDivResult()) >> FX32_SHIFT;
}
