#include <nitro.h>
#include <nnsys/g2d_internal.h>

void NNSi_G2dSrtcSetTrans(NNSG2dSRTControl *pSrtCtrl, s16 x, s16 y) {
    if (pSrtCtrl->type != NNS_G2D_SRTCONTROLTYPE_SRT) {
        return;
    }
    pSrtCtrl->srtData.SRT_EnableFlag |= SRT_FLAG_TRANS;
    pSrtCtrl->srtData.trans.x = x;
    pSrtCtrl->srtData.trans.y = y;
}

void NNSi_G2dSrtcSetSRTRotZ(NNSG2dSRTControl *pSrtCtrl, u16 rotZ) {
    if (pSrtCtrl->type != NNS_G2D_SRTCONTROLTYPE_SRT) {
        return;
    }
    pSrtCtrl->srtData.SRT_EnableFlag |= SRT_FLAG_ROTATE;
    pSrtCtrl->srtData.rotZ = rotZ;
}

void NNSi_G2dSrtcSetSRTScale(NNSG2dSRTControl *pSrtCtrl, fx32 x, fx32 y) {
    if (pSrtCtrl->type != NNS_G2D_SRTCONTROLTYPE_SRT) {
        return;
    }
    pSrtCtrl->srtData.SRT_EnableFlag |= SRT_FLAG_SCALE;
    pSrtCtrl->srtData.scale.x = x;
    pSrtCtrl->srtData.scale.y = y;
}

void NNSi_G2dSrtcInitControl(NNSG2dSRTControl *pSrtCtrl, NNSG2dSRTControlType type) {
    pSrtCtrl->type = type;
    NNSi_G2dSrtcSetInitialValue(pSrtCtrl);
}

void NNSi_G2dSrtcSetInitialValue(NNSG2dSRTControl *pSrtCtrl) {
    MIi_CpuClear16(0, (u16 *)&pSrtCtrl->srtData, sizeof(NNSG2dSRTData));
    pSrtCtrl->srtData.scale.x = FX32_ONE;
    pSrtCtrl->srtData.scale.y = FX32_ONE;
}
