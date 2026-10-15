#include <nitro.h>
#include <nnsys/g3d_anm_mat_internal.h>

#pragma force_active on

// 3ds Max texture matrix: scale, rotation (around the texture centre) and translation
void texmtxCalc_flag___3dsmax(MtxFx44 *pMtx, const G3dMatAnmResult *pResult) {
    s32 w = pResult->origWidth << FX32_SHIFT, h = pResult->origHeight << FX32_SHIFT;
    s32 scos, ssin, tcos, tsin, x, y;
    FX_DivAsync(h, w);
    scos = ((s64)pResult->scaleS * pResult->cosR) >> FX32_SHIFT;
    ssin = ((s64)pResult->scaleS * pResult->sinR) >> FX32_SHIFT;
    tcos = ((s64)pResult->scaleT * pResult->cosR) >> FX32_SHIFT;
    tsin = ((s64)pResult->scaleT * pResult->sinR) >> FX32_SHIFT;
    pMtx->_00 = scos;
    pMtx->_11 = tcos;
    pMtx->_01 = (tsin * FX_GetDivResult()) >> FX32_SHIFT;
    FX_DivAsync(w, h);
    x = (-pResult->origWidth << 11) - pResult->transS * pResult->origWidth;
    y = pResult->transT * pResult->origHeight + (-pResult->origHeight << 11);
    pMtx->_30 = (s32)(((s64)scos * x - (s64)ssin * y) >> 8) + (pResult->origWidth << 15);
    pMtx->_31 = (s32)(((s64)tsin * x + (s64)tcos * y) >> 8) + (pResult->origHeight << 15);
    pMtx->_10 = (-ssin * FX_GetDivResult()) >> FX32_SHIFT;
}

// 3ds Max texture matrix: rotation and translation (scale one)
void texmtxCalc_flagS___3dsmax(MtxFx44 *pMtx, const G3dMatAnmResult *pResult) {
    s32 w = pResult->origWidth << FX32_SHIFT, h = pResult->origHeight << FX32_SHIFT;
    s32 x, y;
    FX_DivAsync(h, w);
    pMtx->_00 = pResult->cosR;
    pMtx->_11 = pResult->cosR;
    pMtx->_01 = (pResult->sinR * FX_GetDivResult()) >> FX32_SHIFT;
    FX_DivAsync(w, h);
    x = (-pResult->origWidth << 11) - pResult->transS * pResult->origWidth;
    y = pResult->transT * pResult->origHeight + (-pResult->origHeight << 11);
    pMtx->_30 = (s32)(((s64)pResult->cosR * x - (s64)pResult->sinR * y) >> 8) + (pResult->origWidth << 15);
    pMtx->_31 = (s32)(((s64)pResult->sinR * x + (s64)pResult->cosR * y) >> 8) + (pResult->origHeight << 15);
    pMtx->_10 = (-pResult->sinR * FX_GetDivResult()) >> FX32_SHIFT;
}

// 3ds Max texture matrix: scale and translation (no rotation)
void texmtxCalc_flagR___3dsmax(MtxFx44 *pMtx, const G3dMatAnmResult *pResult) {
    s32 x, y;
    pMtx->_00 = pResult->scaleS;
    pMtx->_11 = pResult->scaleT;
    pMtx->_01 = 0;
    x = (-pResult->origWidth << 11) - pResult->transS * pResult->origWidth;
    y = pResult->transT * pResult->origHeight + (-pResult->origHeight << 11);
    pMtx->_30 = (s32)(((s64)pResult->scaleS * x) >> 8) + (pResult->origWidth << 15);
    pMtx->_31 = (s32)(((s64)pResult->scaleT * y) >> 8) + (pResult->origHeight << 15);
    pMtx->_10 = 0;
}
