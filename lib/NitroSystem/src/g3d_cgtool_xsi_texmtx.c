#include <nitro.h>
#include <nnsys/g3d_anm_mat_internal.h>

#pragma force_active on

// XSI texture matrix: scale, rotation and translation
void texmtxCalc_flag___xsi(MtxFx44 *pMtx, const G3dMatAnmResult *pResult) {
    s32 w = pResult->origWidth << FX32_SHIFT, h = pResult->origHeight << FX32_SHIFT;
    s32 scaleS, scaleT, sinR, cosR, ssin, tcos, scos;
    s64 rotTransT, rotTransS;
    s32 x, y;
    FX_DivAsync(h, w);
    cosR = pResult->cosR;
    scaleS = pResult->scaleS;
    sinR = pResult->sinR;
    scaleT = pResult->scaleT;
    scos = ((s64)scaleS * cosR) >> FX32_SHIFT;
    ssin = ((s64)scaleS * sinR) >> FX32_SHIFT;
    tcos = ((s64)scaleT * cosR) >> FX32_SHIFT;
    pMtx->_00 = scos;
    pMtx->_11 = tcos;
    pMtx->_01 = ((s32)(((s64)scaleT * sinR) >> FX32_SHIFT) * FX_GetDivResult()) >> FX32_SHIFT;
    FX_DivAsync(w, h);
    // the translation rotated
    rotTransT = ((s64)pResult->transS * pResult->sinR - (s64)pResult->transT * pResult->cosR) >> FX32_SHIFT;
    rotTransS = ((s64)pResult->transS * pResult->cosR + (s64)pResult->transT * pResult->sinR) >> FX32_SHIFT;
    y = tcos + (s32)((rotTransT * pResult->scaleT) >> FX32_SHIFT);
    x = ssin - (s32)((rotTransS * pResult->scaleS) >> FX32_SHIFT);
    pMtx->_30 = (pResult->origWidth * x) << 4;
    pMtx->_31 = (-pResult->origHeight * (y - FX32_ONE)) << 4;
    pMtx->_10 = (-ssin * FX_GetDivResult()) >> FX32_SHIFT;
}
