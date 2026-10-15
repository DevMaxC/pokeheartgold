#include <nitro.h>
#include <nnsys/g3d_anm_mat_internal.h>

#pragma force_active on

// XSI texture matrix: rotation and translation (scale one)
void texmtxCalc_flagS___xsi(MtxFx44 *pMtx, const G3dMatAnmResult *pResult) {
    int w = pResult->origWidth << FX32_SHIFT, h = pResult->origHeight << FX32_SHIFT;
    FX_DivAsync(h, w);
    pMtx->_00 = pResult->cosR;
    pMtx->_11 = pResult->cosR;
    pMtx->_01 = (pResult->sinR * FX_GetDivResult()) >> FX32_SHIFT;
    FX_DivAsync(w, h);
    {
        // the translation rotated
        int transT = pResult->transT, sinR = pResult->sinR, cosR = pResult->cosR, transS = pResult->transS;
        int rotTransS = (int)(((s64)transS * cosR + (s64)transT * sinR) >> FX32_SHIFT);
        int rotTransT = (int)(((s64)transS * sinR - (s64)transT * cosR) >> FX32_SHIFT);
        pMtx->_30 = (pResult->origWidth * (sinR - rotTransS)) << 4;
        pMtx->_31 = (-pResult->origHeight * (pResult->cosR + rotTransT - FX32_ONE)) << 4;
    }
    pMtx->_10 = (-pResult->sinR * FX_GetDivResult()) >> FX32_SHIFT;
}

// XSI texture matrix: scale and translation (no rotation); unsigned arithmetic needed for the match
void texmtxCalc_flagR___xsi(MtxFx44 *pMtx, const G3dMatAnmResult *pResult) {
    u32 zero = 0;
    pMtx->_00 = pResult->scaleS;
    pMtx->_11 = pResult->scaleT;
    pMtx->_01 = zero;
    s32 ofsS = (s32)(((s64)pResult->transS * pResult->scaleS) >> FX32_SHIFT);
    s32 ofsT = (s32)(((s64)(s32)(0u - (u32)pResult->transT) * pResult->scaleT) >> FX32_SHIFT);
    pMtx->_30 = (s32)((pResult->origWidth * (0u - (u32)ofsS)) << 4);
    pMtx->_31 = (s32)(((0u - pResult->origHeight) * ((u32)pResult->scaleT + (u32)ofsT - 4096u)) << 4);
    pMtx->_10 = zero;
}

// XSI texture matrix: translation only (no rotation, scale one)
void texmtxCalc_flagRS___xsi(MtxFx44 *pMtx, const G3dMatAnmResult *pResult) {
    u32 zero = 0;
    pMtx->_00 = FX32_ONE;
    pMtx->_11 = FX32_ONE;
    pMtx->_01 = zero;
    u32 x = 0u - (u32)pResult->transS;
    u32 width = pResult->origWidth;
    u32 y = 0u - (u32)pResult->transT;
    pMtx->_30 = (s32)((width * x) << 4);
    pMtx->_31 = (s32)(((0u - pResult->origHeight) * y) << 4);
    pMtx->_10 = zero;
}
