#include <nitro.h>
#include <nnsys/g3d_anm_mat_internal.h>

#pragma force_active on

// like NNSi_G3dSendJointSRTBasic, with Maya's segment scale compensation: the inverse scale of the
// parent is applied between the translation and the rotation
void NNSi_G3dSendJointSRTMaya(const G3dJntAnmResult *pResult) {
    BOOL doTrans = FALSE;
    if (!(pResult->flag & G3D_JNTANM_FLAG_TRANS_ZERO)) {
        doTrans = TRUE;
    }
    if ((pResult->flag & G3D_JNTANM_FLAG_MAYA_SSC_APPLY) && !(pResult->flag & G3D_JNTANM_FLAG_SCALEEX0_ONE)) {
        if (doTrans) {
            NNS_G3dGeBufferOP_N(G3OP_MTX_TRANS, (u32 *)&pResult->trans, G3OP_MTX_TRANS_NPARAMS);
            doTrans = FALSE;
        }
        NNS_G3dGeBufferOP_N(G3OP_MTX_SCALE, (u32 *)&pResult->scaleEx0, G3OP_MTX_SCALE_NPARAMS);
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
    if (!(pResult->flag & G3D_JNTANM_FLAG_SCALE_ONE)) {
        NNS_G3dGeBufferOP_N(G3OP_MTX_SCALE, (u32 *)&pResult->scale, G3OP_MTX_SCALE_NPARAMS);
    }
}

// scale of a node (pData: scale, inverse scale); the inverse scale of a node whose children compensate
// its scale goes to gScaleCache, a compensating node takes its parent's from there
void NNSi_G3dGetJointScaleMaya(G3dJntAnmResult *pResult, const fx32 *pData, const u8 *pCmd, u32 srtFlag) {
    u8 nodeFlag = pCmd[3];
    if (srtFlag & G3D_RESNODE_FLAG_SCALE_ONE) {
        pResult->flag |= G3D_JNTANM_FLAG_SCALE_ONE;
        if (nodeFlag & G3D_NODEDESC_FLAG_MAYA_SSC_PARENT) {
            u32 nodeID = pCmd[1];
            u32 *pCached = gCurrentRenderState->scaleCached;
            pCached[nodeID >> 5] |= 1u << (nodeID & 31);
        }
    } else {
        pResult->scale.x = pData[0];
        pResult->scale.y = pData[1];
        pResult->scale.z = pData[2];
        if (nodeFlag & G3D_NODEDESC_FLAG_MAYA_SSC_PARENT) {
            u32 nodeID = pCmd[1];
            u32 *pCached = gCurrentRenderState->scaleCached;
            int ofs = (s16)nodeID * (s16)sizeof(G3dScaleCacheEntry);
            pCached[nodeID >> 5] &= ~(1u << (nodeID & 31));
            *(fx32 *)((u8 *)gScaleCacheInvScale + ofs) = pData[3];
            *(fx32 *)((u8 *)gScaleCacheInvScaleY + ofs) = pData[4];
            *(fx32 *)((u8 *)gScaleCacheInvScaleZ + ofs) = pData[5];
        }
    }
    if (nodeFlag & G3D_NODEDESC_FLAG_MAYA_SSC_APPLY) {
        u32 parentID = pCmd[2];
        pResult->flag |= G3D_JNTANM_FLAG_MAYA_SSC_APPLY;
        if (gCurrentRenderState->scaleCached[parentID >> 5] & (1u << (parentID & 31))) {
            pResult->flag |= G3D_JNTANM_FLAG_SCALEEX0_ONE; // the parent's scale is one
        } else {
            pResult->scaleEx0 = gScaleCacheInvScale[parentID * 2];
        }
    }
    pResult->flag |= G3D_JNTANM_FLAG_SCALEEX1_ONE;
}
