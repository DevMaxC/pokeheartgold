#include <nitro.h>
#include <nnsys/g2d_internal.h>

// applies the animation frame the controller now shows: cell, SRT and the VRAM transfer request
void ApplyCurrentAnimResult_(NNSG2dCellAnimation *pCellAnim) {
    const AnimFrameSRT *frameData;
    const NNSG2dCellDataBank *pCellBank;
    u32 animType;
    if (pCellAnim->animCtrl.pActiveCurrent->frames == 0) {
        return;
    }
    NNS_G2dGetAnimCtrlCurrentElement(&pCellAnim->animCtrl); // called twice: needed for the match
    frameData = NNS_G2dGetAnimCtrlCurrentElement(&pCellAnim->animCtrl);
    pCellBank = pCellAnim->pCellDataBank;
    pCellAnim->pCurrentCell = NNS_G2dGetCellDataByIdx(pCellBank, frameData->index);
    animType = pCellAnim->animCtrl.pAnimSequence->animType & 0xff;
    NNSi_G2dSrtcInitControl(&pCellAnim->srtCtrl, NNS_G2D_SRTCONTROLTYPE_SRT);
    if (animType != ANIM_ELEMENT_INDEX) {
        if (animType == ANIM_ELEMENT_INDEX_T) {
            const AnimFrameT *frameDataT = (const AnimFrameT *)frameData;
            NNSi_G2dSrtcSetTrans(&pCellAnim->srtCtrl, frameDataT->px, frameDataT->py);
        } else {
            NNSi_G2dSrtcSetSRTScale(&pCellAnim->srtCtrl, frameData->sx, frameData->sy);
            NNSi_G2dSrtcSetSRTRotZ(&pCellAnim->srtCtrl, frameData->rotZ);
            NNSi_G2dSrtcSetTrans(&pCellAnim->srtCtrl, frameData->px, frameData->py);
        }
    }
    u32 hasTransferData = pCellBank->pVramTransferData != NULL;
    if (!hasTransferData) {
        return;
    }
    s32 handle = (s32) * (volatile u32 *)&pCellAnim->cellTransferStateHandle;
    u32 isValidHandle = handle != -1;
    if (!isValidHandle) {
        return;
    }
    {
        const NNSG2dVramTransferData *transferData = pCellBank->pVramTransferData;
        const NNSG2dCellVramTransferData *cellTransfer = &transferData->pCellTransferDataArray[frameData->index];
        NNS_G2dSetCellTransferStateRequested(pCellAnim->cellTransferStateHandle, cellTransfer->srcDataOffset, cellTransfer->szByte);
    }
}

void NNS_G2dInitCellAnimation(NNSG2dCellAnimation *pCellAnim, const NNSG2dAnimSequence *pAnimSeq, const NNSG2dCellDataBank *pCellDataBank) {
    pCellAnim->pCellDataBank = pCellDataBank;
    pCellAnim->cellTransferStateHandle = -1;
    NNSi_G2dSrtcInitControl(&pCellAnim->srtCtrl, NNS_G2D_SRTCONTROLTYPE_SRT);
    NNS_G2dInitAnimCtrl(&pCellAnim->animCtrl);
    NNS_G2dSetCellAnimationSequence(pCellAnim, pAnimSeq);
}

void NNS_G2dInitCellAnimationVramTransfered(NNSG2dCellAnimation *pCellAnim, const NNSG2dAnimSequence *pAnimSeq, const NNSG2dCellDataBank *pCellBank, u32 vramSettingHandle, u32 dstAddr3D, u32 dstAddr2DMain, u32 dstAddr2DSub, const void *pSrcNCGR, const void *pSrcNCBR, u32 szSrcData) {
    NNSi_G2dInitCellTransferState(vramSettingHandle, dstAddr3D, dstAddr2DMain, dstAddr2DSub, pCellBank->pVramTransferData->szByteMax, pSrcNCGR, pSrcNCBR, szSrcData);
    pCellAnim->cellTransferStateHandle = vramSettingHandle;
    pCellAnim->pCellDataBank = pCellBank;
    *(volatile u32 *)&pCellAnim->cellTransferStateHandle = vramSettingHandle; // stored twice: needed for the match
    NNSi_G2dSrtcInitControl(&pCellAnim->srtCtrl, NNS_G2D_SRTCONTROLTYPE_SRT);
    NNS_G2dInitAnimCtrl(&pCellAnim->animCtrl);
    NNS_G2dSetCellAnimationSequence(pCellAnim, pAnimSeq);
}

void NNS_G2dSetCellAnimationSequence(NNSG2dCellAnimation *pCellAnim, const NNSG2dAnimSequence *pAnimSeq) {
    NNS_G2dBindAnimCtrl(&pCellAnim->animCtrl, pAnimSeq);
    ApplyCurrentAnimResult_(pCellAnim);
}

void NNS_G2dTickCellAnimation(NNSG2dCellAnimation *pCellAnim, fx32 frames) {
    if (NNS_G2dTickAnimCtrl(&pCellAnim->animCtrl, frames)) {
        ApplyCurrentAnimResult_(pCellAnim);
    }
}

void NNS_G2dSetCellAnimationCurrentFrame(NNSG2dCellAnimation *pCellAnim, u16 frameIndex) {
    if (NNS_G2dSetAnimCtrlCurrentFrame(&pCellAnim->animCtrl, frameIndex)) {
        ApplyCurrentAnimResult_(pCellAnim);
    }
}
