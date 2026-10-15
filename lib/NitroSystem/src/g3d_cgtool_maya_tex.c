#include <nitro.h>
#include <nnsys/g3d_anm_mat_internal.h>

#pragma force_active on

// Maya texture matrix: translation only (no rotation, scale one)
void texmtxCalc_flagRS_(MtxFx44 *pMtx, const G3dMatAnmResult *pResult) {
    pMtx->_00 = FX32_ONE;
    pMtx->_11 = FX32_ONE;
    pMtx->_01 = 0;
    pMtx->_30 = (-(pResult->transS * pResult->origWidth)) << 4;
    pMtx->_31 = (pResult->transT * pResult->origHeight) << 4;
    pMtx->_10 = 0;
}

// Maya texture matrix: scale and rotation (no translation)
void texmtxCalc_flagT_(MtxFx44 *pMtx, const G3dMatAnmResult *pResult) {
    int w = pResult->origWidth << FX32_SHIFT, h = pResult->origHeight << FX32_SHIFT;
    int ssin, scos, tsin, tcos;
    FX_DivAsync(h, w);
    ssin = (s64)pResult->scaleS * pResult->sinR >> FX32_SHIFT;
    scos = (s64)pResult->scaleS * pResult->cosR >> FX32_SHIFT;
    tsin = (s64)pResult->scaleT * pResult->sinR >> FX32_SHIFT;
    tcos = (s64)pResult->scaleT * pResult->cosR >> FX32_SHIFT;
    pMtx->_00 = scos;
    pMtx->_11 = tcos;
    pMtx->_01 = (-tsin * FX_GetDivResult()) >> FX32_SHIFT;
    FX_DivAsync(w, h);
    pMtx->_30 = (pResult->origWidth * (pResult->scaleS - (ssin + scos))) << 3;
    pMtx->_31 = (pResult->origHeight * (tsin - tcos - pResult->scaleT + 8192L)) << 3;
    pMtx->_10 = (ssin * FX_GetDivResult()) >> FX32_SHIFT;
}

// Maya texture matrix: rotation only (scale one, no translation)
void texmtxCalc_flagTS_(MtxFx44 *pMtx, const G3dMatAnmResult *pResult) {
    int w = pResult->origWidth << FX32_SHIFT, h = pResult->origHeight << FX32_SHIFT;
    FX_DivAsync(h, w);
    pMtx->_00 = pResult->cosR;
    pMtx->_11 = pResult->cosR;
    pMtx->_01 = (-pResult->sinR * FX_GetDivResult()) >> FX32_SHIFT;
    FX_DivAsync(w, h);
    pMtx->_30 = (pResult->origWidth * ((-(pResult->sinR + pResult->cosR)) + 4096L)) << 3;
    pMtx->_31 = (pResult->origHeight * (pResult->sinR - pResult->cosR + 4096L)) << 3;
    pMtx->_10 = (pResult->sinR * FX_GetDivResult()) >> FX32_SHIFT;
}

// Maya texture matrix: scale only (no rotation, no translation)
void texmtxCalc_flagTR_(MtxFx44 *pMtx, const G3dMatAnmResult *pResult) {
    pMtx->_00 = pResult->scaleS;
    pMtx->_11 = pResult->scaleT;
    pMtx->_01 = 0;
    pMtx->_30 = 0;
    pMtx->_31 = (pResult->origHeight * (-(int)(pResult->scaleT << 1) + 8192L)) << 3; // int, then long (needed for the match)
    pMtx->_10 = 0;
}

// identity texture matrix (no scale, rotation or translation; the same for every tool)
void texmtxCalc_flagTRS_(MtxFx44 *pMtx, const G3dMatAnmResult *pResult) {
    pMtx->_00 = FX32_ONE;
    pMtx->_01 = 0;
    pMtx->_10 = 0;
    pMtx->_11 = FX32_ONE;
    pMtx->_30 = 0;
    pMtx->_31 = 0;
}

// sends the texture matrix of a material (Maya), loaded or multiplied (G3D_MATANM_FLAG_TEXMTX_SET)
void NNSi_G3dSendTexSRTMaya(const G3dMatAnmResult *pResult) {
    G3dTexMtx44Packet packet;
    int zero = 0;
    if (pResult->flag & G3D_MATANM_FLAG_TEXMTX_SET) {
        packet.cmd = G3D_GE_PACK_OP3(G3OP_MTX_MODE, G3OP_MTX_LOAD_4x4, G3OP_MTX_MODE);
    } else {
        packet.cmd = G3D_GE_PACK_OP3(G3OP_MTX_MODE, G3OP_MTX_MULT_4x4, G3OP_MTX_MODE);
    }
    packet.mtxMode = GX_MTXMODE_TEXTURE;
    packet.restoreMtxMode = GX_MTXMODE_POSITION_VECTOR;
    packet.mtx._02 = packet.mtx._03 = packet.mtx._12 = packet.mtx._13 = packet.mtx._20 = packet.mtx._21 = packet.mtx._22 = packet.mtx._23 = packet.mtx._32 = zero;
    packet.mtx._33 = FX32_ONE;
    gTexMtxCalcFuncsMaya[pResult->flag & (G3D_MATANM_FLAG_TEXMTX_SCALEONE | G3D_MATANM_FLAG_TEXMTX_ROTZERO | G3D_MATANM_FLAG_TEXMTX_TRANSZERO)](&packet.mtx, pResult);
    // the size ratio of the bound texture to the original one
    if (pResult->magW != FX32_ONE) {
        packet.mtx._00 = (s64)pResult->magW * packet.mtx._00 >> FX32_SHIFT;
        packet.mtx._01 = (s64)pResult->magW * packet.mtx._01 >> FX32_SHIFT;
        packet.mtx._30 = (s64)pResult->magW * packet.mtx._30 >> FX32_SHIFT;
    }
    if (pResult->magH != FX32_ONE) {
        packet.mtx._10 = (s64)pResult->magH * packet.mtx._10 >> FX32_SHIFT;
        packet.mtx._11 = (s64)pResult->magH * packet.mtx._11 >> FX32_SHIFT;
        packet.mtx._31 = (s64)pResult->magH * packet.mtx._31 >> FX32_SHIFT;
    }
    NNS_G3dGeBufferOP_N(packet.cmd, (const u32 *)&packet + 1, G3OP_MTX_MODE_NPARAMS + G3OP_MTX_LOAD_4x4_NPARAMS + G3OP_MTX_MODE_NPARAMS);
}
