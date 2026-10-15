#include <nitro.h>
#include <nnsys/g3d_anm_mat_internal.h>

#pragma force_active on

// XSI texture matrix: rotation only (scale one, no translation); unsigned arithmetic needed for the match
void texmtxCalc_flagTS___xsi(MtxFx44 *pMtx, const G3dMatAnmResult *pResult) {
    s32 w = pResult->origWidth << FX32_SHIFT, h = pResult->origHeight << FX32_SHIFT;
    FX_DivAsync(h, w);
    pMtx->_00 = pResult->cosR;
    pMtx->_11 = pResult->cosR;
    pMtx->_01 = (s32)((u32)pResult->sinR * (u32)FX_GetDivResult()) >> FX32_SHIFT;
    FX_DivAsync(w, h);
    pMtx->_30 = (s32)(((u32)pResult->origWidth * (u32)pResult->sinR) << 4);
    pMtx->_31 = (s32)(((-(u32)pResult->origHeight) * (u32)(pResult->cosR - 4096)) << 4);
    pMtx->_10 = (s32)((u32)(-pResult->sinR) * (u32)FX_GetDivResult()) >> FX32_SHIFT;
}

// XSI texture matrix: scale only (no rotation, no translation)
void texmtxCalc_flagTR___xsi(MtxFx44 *pMtx, const G3dMatAnmResult *pResult) {
    pMtx->_00 = pResult->scaleS;
    pMtx->_11 = pResult->scaleT;
    pMtx->_01 = 0;
    pMtx->_30 = 0;
    pMtx->_31 = ((-pResult->origHeight) * (pResult->scaleT - FX32_ONE)) << 4;
    pMtx->_10 = 0;
}

// identity texture matrix
void texmtxCalc_flagTRS___xsi(MtxFx44 *pMtx, const G3dMatAnmResult *pResult) {
    pMtx->_00 = FX32_ONE;
    pMtx->_01 = 0;
    pMtx->_10 = 0;
    pMtx->_11 = FX32_ONE;
    pMtx->_30 = 0;
    pMtx->_31 = 0;
}

// sends the texture matrix of a material (XSI), loaded or multiplied (G3D_MATANM_FLAG_TEXMTX_SET); the
// parts the flags mark as unused are set to their identity values in the result first
void NNSi_G3dSendTexSRTXsi(G3dMatAnmResult *pResult) {
    G3dTexMtx44Packet packet;
    if (pResult->flag & G3D_MATANM_FLAG_TEXMTX_SET) {
        packet.cmd = G3D_GE_PACK_OP3(G3OP_MTX_MODE, G3OP_MTX_LOAD_4x4, G3OP_MTX_MODE);
    } else {
        packet.cmd = G3D_GE_PACK_OP3(G3OP_MTX_MODE, G3OP_MTX_MULT_4x4, G3OP_MTX_MODE);
    }
    packet.mtxMode = GX_MTXMODE_TEXTURE;
    packet.restoreMtxMode = GX_MTXMODE_POSITION_VECTOR;
    packet.mtx._33 = FX32_ONE;
    packet.mtx._32 = 0;
    packet.mtx._23 = 0;
    packet.mtx._22 = 0;
    packet.mtx._21 = 0;
    packet.mtx._20 = 0;
    packet.mtx._13 = 0;
    packet.mtx._12 = 0;
    packet.mtx._03 = 0;
    packet.mtx._02 = 0;
    if (pResult->flag & G3D_MATANM_FLAG_TEXMTX_SCALEONE) {
        pResult->scaleT = FX32_ONE;
        pResult->scaleS = FX32_ONE;
    }
    if (pResult->flag & G3D_MATANM_FLAG_TEXMTX_ROTZERO) {
        pResult->cosR = FX16_ONE;
        pResult->sinR = 0;
    }
    if (pResult->flag & G3D_MATANM_FLAG_TEXMTX_TRANSZERO) {
        pResult->transT = 0;
        pResult->transS = 0;
    }
    gTexMtxCalcFuncsXsi[pResult->flag & (G3D_MATANM_FLAG_TEXMTX_SCALEONE | G3D_MATANM_FLAG_TEXMTX_ROTZERO | G3D_MATANM_FLAG_TEXMTX_TRANSZERO)](&packet.mtx, pResult);
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
    NNS_G3dGeBufferOP_N(packet.cmd, (u32 *)&packet + 1, G3OP_MTX_MODE_NPARAMS + G3OP_MTX_LOAD_4x4_NPARAMS + G3OP_MTX_MODE_NPARAMS);
}
