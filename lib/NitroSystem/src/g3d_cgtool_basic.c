#include <nitro.h>
#include <nnsys/g3d_anm_mat_internal.h>

#pragma force_active on

// multiplies the joint's rotation, translation and scale to the current matrix
void NNSi_G3dSendJointSRTBasic(const G3dJntAnmResult *pResult) {
    if (!(pResult->flag & G3D_JNTANM_FLAG_TRANS_ZERO)) {
        if (!(pResult->flag & G3D_JNTANM_FLAG_ROT_ZERO)) {
            NNS_G3dGeBufferOP_N(G3OP_MTX_MULT_4x3, (u32 *)&pResult->rot, G3OP_MTX_MULT_4x3_NPARAMS); // rot, then trans
        } else {
            NNS_G3dGeBufferOP_N(G3OP_MTX_TRANS, (u32 *)&pResult->trans, G3OP_MTX_TRANS_NPARAMS);
        }
    } else if (!(pResult->flag & G3D_JNTANM_FLAG_ROT_ZERO)) {
        NNS_G3dGeBufferOP_N(G3OP_MTX_MULT_3x3, (u32 *)&pResult->rot, G3OP_MTX_MULT_3x3_NPARAMS);
    }
    if (!(pResult->flag & G3D_JNTANM_FLAG_SCALE_ONE)) {
        NNS_G3dGeBufferOP_N(G3OP_MTX_SCALE, (u32 *)&pResult->scale, G3OP_MTX_SCALE_NPARAMS);
    }
}

void NNSi_G3dGetJointScaleBasic(G3dJntAnmResult *pResult, const fx32 *pData, const u8 *pCmd, u32 srtFlag) {
    if (srtFlag & G3D_RESNODE_FLAG_SCALE_ONE) {
        pResult->flag |= G3D_JNTANM_FLAG_SCALE_ONE;
    } else {
        pResult->scale.x = pData[0];
        pResult->scale.y = pData[1];
        pResult->scale.z = pData[2];
    }
    pResult->flag |= G3D_JNTANM_FLAG_SCALEEX0_ONE | G3D_JNTANM_FLAG_SCALEEX1_ONE;
}
