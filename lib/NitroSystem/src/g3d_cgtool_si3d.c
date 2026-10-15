#include <nitro.h>
#include <nnsys/g3d_anm_mat_internal.h>

#pragma force_active on

// multiplies the joint's matrices to the current matrix with Softimage 3D's hierarchical scaling: the
// accumulated scale of the parents (scaleEx1) and its inverse (scaleEx0) are applied around the
// rotation
void NNSi_G3dSendJointSRTSi3d(const G3dJntAnmResult *pResult) {
    VecFx32 trans;
    BOOL doTrans = FALSE;
    u32 noScaleEx = pResult->flag & (G3D_JNTANM_FLAG_SCALEEX0_ONE | G3D_JNTANM_FLAG_SCALEEX1_ONE);
    if (!noScaleEx) {
        NNS_G3dGeBufferOP_N(G3OP_MTX_SCALE, (u32 *)&pResult->scaleEx1, G3OP_MTX_SCALE_NPARAMS);
    }
    if (!(pResult->flag & G3D_JNTANM_FLAG_TRANS_ZERO)) {
        if (noScaleEx) {
            doTrans = TRUE;
        } else {
            trans.x = (fx32)(((s64)pResult->trans.x * pResult->scaleEx0.x) >> FX32_SHIFT);
            trans.y = (fx32)(((s64)pResult->trans.y * pResult->scaleEx0.y) >> FX32_SHIFT);
            trans.z = (fx32)(((s64)pResult->trans.z * pResult->scaleEx0.z) >> FX32_SHIFT);
            NNS_G3dGeBufferOP_N(G3OP_MTX_TRANS, (u32 *)&trans, G3OP_MTX_TRANS_NPARAMS);
        }
    }
    if (!(pResult->flag & G3D_JNTANM_FLAG_ROT_ZERO)) {
        if (doTrans) {
            NNS_G3dGeBufferOP_N(G3OP_MTX_MULT_4x3, (u32 *)&pResult->rot, G3OP_MTX_MULT_4x3_NPARAMS);
        } else {
            NNS_G3dGeBufferOP_N(G3OP_MTX_MULT_3x3, (u32 *)&pResult->rot, G3OP_MTX_MULT_3x3_NPARAMS);
        }
    } else if (doTrans) {
        NNS_G3dGeBufferOP_N(G3OP_MTX_TRANS, (u32 *)&pResult->trans, G3OP_MTX_TRANS_NPARAMS);
    }
    if (!noScaleEx) {
        NNS_G3dGeBufferOP_N(G3OP_MTX_SCALE, (u32 *)&pResult->scaleEx0, G3OP_MTX_SCALE_NPARAMS);
    }
    if (!(pResult->flag & G3D_JNTANM_FLAG_SCALE_ONE)) {
        NNS_G3dGeBufferOP_N(G3OP_MTX_SCALE, (u32 *)&pResult->scale, G3OP_MTX_SCALE_NPARAMS);
    }
}

// scale of a node (pData: scale, inverse scale); gScaleCache keeps the accumulated scale and inverse
// scale of every node, the node gets its parent's in scaleEx1 / scaleEx0
void NNSi_G3dGetJointScaleSi3d(G3dJntAnmResult *pResult, const fx32 *pData, const u8 *pCmd, u32 srtFlag) {
    u32 nodeID = pCmd[1], parentID = pCmd[2];
    if (srtFlag & G3D_RESNODE_FLAG_SCALE_ONE) {
        pResult->flag |= G3D_JNTANM_FLAG_SCALE_ONE;
        if (gCurrentRenderState->scaleCached[parentID >> 5] & (1u << (parentID & 31))) {
            // the parent's accumulated scale is one
            gCurrentRenderState->scaleCached[nodeID >> 5] |= 1u << (nodeID & 31);
            pResult->flag |= G3D_JNTANM_FLAG_SCALEEX0_ONE | G3D_JNTANM_FLAG_SCALEEX1_ONE;
        } else {
            MIi_CpuCopy32((const u32 *)((u8 *)gScaleCache + parentID * sizeof(G3dScaleCacheEntry)), (u32 *)((u8 *)gScaleCache + nodeID * sizeof(G3dScaleCacheEntry)), sizeof(G3dScaleCacheEntry));
            MIi_CpuCopy32((const u32 *)((u8 *)gScaleCache + parentID * sizeof(G3dScaleCacheEntry)), (u32 *)&pResult->scaleEx0, sizeof(G3dScaleCacheEntry));
        }
    } else {
        pResult->scale.x = pData[0];
        pResult->scale.y = pData[1];
        pResult->scale.z = pData[2];
        if (gCurrentRenderState->scaleCached[parentID >> 5] & (1u << (parentID & 31))) {
            MIi_CpuCopy32((const u32 *)pData, (u32 *)((u8 *)gScaleCache + nodeID * sizeof(G3dScaleCacheEntry)), sizeof(G3dScaleCacheEntry));
            gCurrentRenderState->scaleCached[nodeID >> 5] &= ~(1u << (nodeID & 31));
            pResult->flag |= G3D_JNTANM_FLAG_SCALEEX0_ONE | G3D_JNTANM_FLAG_SCALEEX1_ONE;
        } else {
            gCurrentRenderState->scaleCached[nodeID >> 5] &= ~(1u << (nodeID & 31));
            // volatile accesses needed for the match
            ((volatile fx32 *)gScaleCache)[nodeID * 6] = (s64)pData[0] * ((volatile fx32 *)gScaleCache)[parentID * 6] >> FX32_SHIFT;
            ((volatile fx32 *)gScaleCacheScaleY)[nodeID * 6] = (s64)pData[1] * ((volatile fx32 *)gScaleCacheScaleY)[parentID * 6] >> FX32_SHIFT;
            ((volatile fx32 *)gScaleCacheScaleZ)[nodeID * 6] = (s64)pData[2] * ((volatile fx32 *)gScaleCacheScaleZ)[parentID * 6] >> FX32_SHIFT;
            ((volatile fx32 *)gScaleCacheInvScale)[nodeID * 6] = (s64)pData[3] * ((volatile fx32 *)gScaleCacheInvScale)[parentID * 6] >> FX32_SHIFT;
            ((volatile fx32 *)gScaleCacheInvScaleY)[nodeID * 6] = (s64)pData[4] * ((volatile fx32 *)gScaleCacheInvScaleY)[parentID * 6] >> FX32_SHIFT;
            ((volatile fx32 *)gScaleCacheInvScaleZ)[nodeID * 6] = (s64)pData[5] * ((volatile fx32 *)gScaleCacheInvScaleZ)[parentID * 6] >> FX32_SHIFT;
            MIi_CpuCopy32((const u32 *)((u8 *)gScaleCache + parentID * sizeof(G3dScaleCacheEntry)), (u32 *)&pResult->scaleEx0, sizeof(G3dScaleCacheEntry));
        }
    }
}

// texture matrix packet: MTX_MODE texture, MTX_LOAD_4x3 / MTX_MULT_4x3, MTX_MODE position-vector
typedef struct TexMtx43Packet {
    u32 cmd;
    u32 params[14]; // [0] mtxMode, [1..12] the matrix (_00 = [1], _11 = [5], _30 = [10], _31 = [11]), [13] restoreMtxMode
} TexMtx43Packet;

static inline u32 MulFx32(s32 a, s32 b) {
    return (u32)((s64)a * b >> FX32_SHIFT);
}

// sends the texture matrix of a material (Softimage 3D: scale and translation only)
void NNSi_G3dSendTexSRTSi3d(const G3dMatAnmResult *pResult) {
    TexMtx43Packet packet;
    if (pResult->flag & G3D_MATANM_FLAG_TEXMTX_SET) {
        packet.cmd = G3D_GE_PACK_OP3(G3OP_MTX_MODE, G3OP_MTX_LOAD_4x3, G3OP_MTX_MODE);
    } else {
        packet.cmd = G3D_GE_PACK_OP3(G3OP_MTX_MODE, G3OP_MTX_MULT_4x3, G3OP_MTX_MODE);
    }
    packet.params[0] = GX_MTXMODE_TEXTURE;
    packet.params[12] = 0;
    packet.params[9] = 0;
    packet.params[8] = 0;
    packet.params[7] = 0;
    packet.params[6] = 0;
    packet.params[4] = 0;
    packet.params[3] = 0;
    packet.params[2] = 0;
    packet.params[13] = GX_MTXMODE_POSITION_VECTOR;
    if (pResult->flag & G3D_MATANM_FLAG_TEXMTX_TRANSZERO) {
        packet.params[10] = 0;
        packet.params[11] = 0;
        if (pResult->flag & G3D_MATANM_FLAG_TEXMTX_SCALEONE) {
            packet.params[1] = FX32_ONE;
            packet.params[5] = FX32_ONE;
        } else {
            packet.params[1] = pResult->scaleS;
            packet.params[5] = pResult->scaleT;
        }
    } else if (pResult->flag & G3D_MATANM_FLAG_TEXMTX_SCALEONE) {
        packet.params[10] = (0u - ((u32)pResult->transS << 4)) * pResult->origWidth;
        packet.params[11] = (0u - ((u32)pResult->transT << 4)) * pResult->origHeight;
        packet.params[1] = FX32_ONE;
        packet.params[5] = FX32_ONE;
    } else {
        packet.params[10] = (0u - (u32)((s64)pResult->scaleS * pResult->transS >> 8)) * pResult->origWidth;
        packet.params[11] = (0u - (u32)((s64)pResult->scaleT * pResult->transT >> 8)) * pResult->origHeight;
        packet.params[1] = pResult->scaleS;
        packet.params[5] = pResult->scaleT;
    }
    if (pResult->magW != FX32_ONE) {
        packet.params[1] = MulFx32(pResult->magW, (s32)packet.params[1]);
        packet.params[10] = MulFx32(pResult->magW, (s32)packet.params[10]);
    }
    if (pResult->magH != FX32_ONE) {
        packet.params[5] = MulFx32(pResult->magH, (s32)packet.params[5]);
        packet.params[11] = MulFx32(pResult->magH, (s32)packet.params[11]);
    }
    NNS_G3dGeBufferOP_N(packet.cmd, (u32 *)&packet + 1, G3OP_MTX_MODE_NPARAMS + G3OP_MTX_LOAD_4x3_NPARAMS + G3OP_MTX_MODE_NPARAMS);
}
