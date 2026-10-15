#include <nitro.h>
#include <nnsys/g3d_anm_mat_internal.h>

#pragma force_active on

// 3ds Max texture matrix: translation only (no rotation, scale one)
void texmtxCalc_flagRS___3dsmax(MtxFx44 *pMtx, const G3dMatAnmResult *pResult) {
    pMtx->_00 = FX32_ONE;
    pMtx->_11 = FX32_ONE;
    pMtx->_01 = 0;
    pMtx->_30 = ((-pResult->transS) * pResult->origWidth) << 4;
    pMtx->_31 = (pResult->transT * pResult->origHeight) << 4;
    pMtx->_10 = 0;
}

// 3ds Max texture matrix: scale and rotation (no translation)
void texmtxCalc_flagT___3dsmax(MtxFx44 *pMtx, const G3dMatAnmResult *pResult) {
    int w = pResult->origWidth << FX32_SHIFT, h = pResult->origHeight << FX32_SHIFT;
    int scos, ssin, tcos, tsin, x, y;
    FX_DivAsync(h, w);
    scos = (s64)pResult->scaleS * pResult->cosR >> FX32_SHIFT;
    ssin = (s64)pResult->scaleS * pResult->sinR >> FX32_SHIFT;
    tcos = (s64)pResult->scaleT * pResult->cosR >> FX32_SHIFT;
    tsin = (s64)pResult->scaleT * pResult->sinR >> FX32_SHIFT;
    pMtx->_00 = scos;
    pMtx->_11 = tcos;
    pMtx->_01 = (tsin * FX_GetDivResult()) >> FX32_SHIFT;
    FX_DivAsync(w, h);
    w = -(int)pResult->origWidth << 11; // w, h reused for the centre offset
    h = -(int)pResult->origHeight << 11;
    x = ((s64)scos * w - (s64)ssin * h) >> 8;
    y = ((s64)tsin * w + (s64)tcos * h) >> 8;
    pMtx->_30 = x + (pResult->origWidth << 15);
    pMtx->_31 = y + (pResult->origHeight << 15);
    pMtx->_10 = (-ssin * FX_GetDivResult()) >> FX32_SHIFT;
}

// 3ds Max texture matrix: rotation only (scale one, no translation); unsigned arithmetic needed for the
// match
void texmtxCalc_flagTS___3dsmax(MtxFx44 *pMtx, const G3dMatAnmResult *pResult) {
    int w = pResult->origWidth << FX32_SHIFT, h = pResult->origHeight << FX32_SHIFT;
    FX_DivAsync(h, w);
    pMtx->_00 = pResult->cosR;
    pMtx->_11 = pResult->cosR;
    pMtx->_01 = ((s32)((u32)(s32)pResult->sinR * (u32)FX_GetDivResult())) >> FX32_SHIFT;
    FX_DivAsync(w, h);
    w = (s32)((0u - (u32)pResult->origWidth) << 11);
    h = (s32)((0u - (u32)pResult->origHeight) << 11);
    pMtx->_30 = (s32)((u32)(((s64)pResult->cosR * w - (s64)pResult->sinR * h) >> 8) + ((u32)pResult->origWidth << 15));
    pMtx->_31 = (s32)((u32)(((s64)pResult->sinR * w + (s64)pResult->cosR * h) >> 8) + ((u32)pResult->origHeight << 15));
    pMtx->_10 = ((s32)((0u - (u32)(s32)pResult->sinR) * (u32)FX_GetDivResult())) >> FX32_SHIFT;
}

// 3ds Max texture matrix: scale only (no rotation, no translation)
void texmtxCalc_flagTR___3dsmax(MtxFx44 *pMtx, const G3dMatAnmResult *pResult) {
    pMtx->_00 = pResult->scaleS;
    pMtx->_11 = pResult->scaleT;
    pMtx->_01 = 0;
    pMtx->_30 = ((FX32_ONE - pResult->scaleS) * pResult->origWidth) << 3;
    pMtx->_31 = ((FX32_ONE - pResult->scaleT) * pResult->origHeight) << 3;
    pMtx->_10 = 0;
}

// identity texture matrix
void texmtxCalc_flagTRS___3dsmax(MtxFx44 *pMtx, const G3dMatAnmResult *pResult) {
    pMtx->_00 = FX32_ONE;
    pMtx->_01 = 0;
    pMtx->_10 = 0;
    pMtx->_11 = FX32_ONE;
    pMtx->_30 = 0;
    pMtx->_31 = 0;
}

// sends the texture matrix of a material (3ds Max), loaded or multiplied (G3D_MATANM_FLAG_TEXMTX_SET)
void NNSi_G3dSendTexSRT3dsMax(const G3dMatAnmResult *pResult) {
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
    gTexMtxCalcFuncs3dsMax[pResult->flag & (G3D_MATANM_FLAG_TEXMTX_SCALEONE | G3D_MATANM_FLAG_TEXMTX_ROTZERO | G3D_MATANM_FLAG_TEXMTX_TRANSZERO)](&packet.mtx, pResult);
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
