#include <nitro.h>
#include <nnsys/g3d_anm_mat_internal.h>

#pragma force_active on

// XSI texture matrix: scale and rotation (no translation)
void texmtxCalc_flagT___xsi(MtxFx44 *pMtx, const G3dMatAnmResult *pResult) {
    s32 w = pResult->origWidth << FX32_SHIFT, h = pResult->origHeight << FX32_SHIFT;
    s32 scaleS, scaleT, sinR, cosR, ssin, tcos, scos;
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
    pMtx->_30 = (pResult->origWidth * ssin) << 4;
    pMtx->_31 = (-pResult->origHeight * (tcos - FX32_ONE)) << 4;
    pMtx->_10 = (-ssin * FX_GetDivResult()) >> FX32_SHIFT;
}
