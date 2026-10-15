#include <nitro.h>
#include <nnsys/g2d_internal.h>

static inline u32 GetSequenceDuration(const NNSG2dAnimSequence *pAnimSeq) {
    u32 duration = 0;
    u32 frame;
    for (frame = 0; frame < pAnimSeq->numFrames; frame++) {
        duration += pAnimSeq->pAnmFrameArray[frame].frames;
    }
    return duration;
}

// moves a cell animation that plays in sync with the multi cell to the multi cell's play time
static inline void SyncCellAnimation(NNSG2dCellAnimation *pCellAnim, const NNSG2dAnimSequence *pAnimSeq, u32 elapsed) {
    u32 duration = GetSequenceDuration(pAnimSeq);
    if (NNSi_G2dIsAnimCtrlLoopAnim(&pCellAnim->animCtrl)) {
        NNS_G2dTickCellAnimation(pCellAnim, (fx32)((elapsed % duration) << FX32_SHIFT));
    } else {
        if (elapsed < duration) {
            duration = elapsed;
        }
        NNS_G2dTickCellAnimation(pCellAnim, (fx32)(duration << FX32_SHIFT));
    }
}

#pragma force_active on

void SetMCDataToMCInstanceImpl_(NNSG2dMultiCellInstance *pMCInst, const NNSG2dMultiCellData *pMCData, u32 elapsed) {
    pMCInst->pCurrentMultiCell = pMCData;
    if (pMCInst->mcType == NNS_G2D_MCTYPE_SHARE_CELLANIM) {
        SharedCellAnim *cellAnims = pMCInst->pCellAnimInstasnces;
        const NNSG2dMultiCellHierarchyData *hierarchy;
        SharedCellAnim *cellAnim;
        const NNSG2dAnimSequence *pAnimSeq;
        u16 i;
        {
            u16 j;
            for (j = 0; j < pMCData->numCellAnim; j++) {
                cellAnims[j].isAssigned = FALSE;
            }
        }
        for (i = 0; i < pMCData->numNodes; i++) {
            hierarchy = &pMCData->pHierDataArray[i];
            cellAnim = &cellAnims[(u16)((hierarchy->nodeAttr & 0xff00) >> 8)];
            if (!cellAnim->isAssigned) {
                pAnimSeq = NNS_G2dGetAnimSequenceByIdx(pMCInst->pAnimDataBank, hierarchy->animSequenceIdx);
                NNS_G2dSetCellAnimationSequence(&cellAnim->cellAnim, pAnimSeq);
                cellAnim->cellAnim.animCtrl.bActive = TRUE;
                if ((hierarchy->nodeAttr & 15) == MC_NODE_PLAY_SYNC) {
                    SyncCellAnimation(&cellAnim->cellAnim, pAnimSeq, elapsed);
                }
                cellAnim->isAssigned = TRUE;
            }
        }
    } else {
        u16 i;
        u32 duration;
        NNSG2dNode *nodes = pMCInst->pCellAnimInstasnces;
        for (i = 0; i < pMCData->numNodes; i++) {
            const NNSG2dMultiCellHierarchyData *hierarchy = &pMCData->pHierDataArray[i];
            NNSG2dCellAnimation *pCellAnim = nodes[i].pContent;
            const NNSG2dAnimSequence *pAnimSeq = NNS_G2dGetAnimSequenceByIdx(pMCInst->pAnimDataBank, hierarchy->animSequenceIdx);
            NNS_G2dSetCellAnimationSequence(pCellAnim, pAnimSeq);
            pCellAnim->animCtrl.bActive = TRUE;
            if ((hierarchy->nodeAttr & 15) == MC_NODE_PLAY_SYNC) {
                duration = GetSequenceDuration(pAnimSeq);
                if (NNSi_G2dIsAnimCtrlLoopAnim(&pCellAnim->animCtrl)) {
                    NNS_G2dTickCellAnimation(pCellAnim, (fx32)((elapsed % duration) << FX32_SHIFT));
                } else {
                    NNS_G2dTickCellAnimation(pCellAnim, (fx32)((elapsed < duration ? elapsed : duration) << FX32_SHIFT));
                }
            }
            nodes[i].bVisible = TRUE;
            NNSi_G2dSrtcSetTrans(&nodes[i].srtCtrl, hierarchy->posX, hierarchy->posY);
        }
    }
}

#pragma force_active off

void NNS_G2dSetAnimSequenceToMCAnimation(NNSG2dMultiCellAnimation *pMultiCellAnim, const NNSG2dMultiCellAnimSequence *pAnimSeq) {
    NNS_G2dBindAnimCtrl(&pMultiCellAnim->animCtrl, pAnimSeq);
    pMultiCellAnim->totalVideoFrame = 0;
    if (pMultiCellAnim->animCtrl.pActiveCurrent->frames == 0) {
        return;
    }
    const AnimFrameSRT *frameData = NNS_G2dGetAnimCtrlCurrentElement(&pMultiCellAnim->animCtrl);
    u32 animType;
    const NNSG2dMultiCellData *pMCData = NNS_G2dGetMultiCellDataByIdx(pMultiCellAnim->pMultiCellDataBank, frameData->index);
    animType = pMultiCellAnim->animCtrl.pAnimSequence->animType & 0xff;
    NNSi_G2dSrtcInitControl(&pMultiCellAnim->srtCtrl, NNS_G2D_SRTCONTROLTYPE_SRT);
    if (animType != ANIM_ELEMENT_INDEX) {
        if (animType == ANIM_ELEMENT_INDEX_T) {
            NNSi_G2dSrtcSetTrans(&pMultiCellAnim->srtCtrl, ((const AnimFrameT *)frameData)->px, ((const AnimFrameT *)frameData)->py);
        } else {
            NNSi_G2dSrtcSetSRTScale(&pMultiCellAnim->srtCtrl, frameData->sx, frameData->sy);
            NNSi_G2dSrtcSetSRTRotZ(&pMultiCellAnim->srtCtrl, frameData->rotZ);
            NNSi_G2dSrtcSetTrans(&pMultiCellAnim->srtCtrl, frameData->px, frameData->py);
        }
    }
    SetMCDataToMCInstanceImpl_(&pMultiCellAnim->multiCellInstance, pMCData, pMultiCellAnim->totalVideoFrame);
}

u16 NNS_G2dGetMCBankNumNodesRequired(const NNSG2dMultiCellDataBank *pMultiCellDataBank) {
    u16 maxNodes = 0;
    u16 i = 0;
    if (pMultiCellDataBank->numMultiCellData > i) {
        do {
            const NNSG2dMultiCellData *pMCData = NNS_G2dGetMultiCellDataByIdx(pMultiCellDataBank, i);
            if (pMCData->numNodes > maxNodes) {
                maxNodes = pMCData->numNodes;
            }
            i++;
        } while (i < pMultiCellDataBank->numMultiCellData);
    }
    return maxNodes;
}

#pragma force_active on

static inline void TickSharedCellAnims(NNSG2dMultiCellInstance *pMCInst, fx32 frames) {
    const NNSG2dMultiCellData *pMCData = pMCInst->pCurrentMultiCell;
    SharedCellAnim *cellAnims = pMCInst->pCellAnimInstasnces;
    u16 i = 0;
    while (i < pMCData->numCellAnim) {
        NNS_G2dTickCellAnimation(&cellAnims[i].cellAnim, frames);
        pMCData = pMCInst->pCurrentMultiCell;
        i++;
    }
}

static inline void TickNodeCellAnims(NNSG2dMultiCellInstance *pMCInst, fx32 frames) {
    const NNSG2dMultiCellData *pMCData = pMCInst->pCurrentMultiCell;
    NNSG2dNode *nodes = pMCInst->pCellAnimInstasnces;
    u16 i = 0;
    while (i < pMCData->numNodes) {
        NNS_G2dTickCellAnimation(nodes[i].pContent, frames);
        pMCData = pMCInst->pCurrentMultiCell;
        i++;
    }
}

void NNS_G2dTickMCInstance(NNSG2dMultiCellInstance *pMCInst, fx32 frames) {
    if (pMCInst->mcType == NNS_G2D_MCTYPE_SHARE_CELLANIM) {
        TickSharedCellAnims(pMCInst, frames);
    } else {
        TickNodeCellAnims(pMCInst, frames);
    }
}

#pragma force_active off

void NNS_G2dTickMCAnimation(NNSG2dMultiCellAnimation *pMultiCellAnim, fx32 frames) {
    u16 currentFrames = pMultiCellAnim->animCtrl.pCurrent->frames;
    if (NNS_G2dTickAnimCtrl(&pMultiCellAnim->animCtrl, frames)) {
        pMultiCellAnim->totalVideoFrame += currentFrames;
        if (pMultiCellAnim->animCtrl.pActiveCurrent->frames == 0) {
            return;
        }
        const AnimFrameSRT *frameData = NNS_G2dGetAnimCtrlCurrentElement(&pMultiCellAnim->animCtrl);
        u32 animType;
        const NNSG2dMultiCellData *pMCData = NNS_G2dGetMultiCellDataByIdx(pMultiCellAnim->pMultiCellDataBank, frameData->index);
        animType = pMultiCellAnim->animCtrl.pAnimSequence->animType & 0xff;
        NNSi_G2dSrtcInitControl(&pMultiCellAnim->srtCtrl, NNS_G2D_SRTCONTROLTYPE_SRT);
        if (animType != ANIM_ELEMENT_INDEX) {
            if (animType == ANIM_ELEMENT_INDEX_T) {
                NNSi_G2dSrtcSetTrans(&pMultiCellAnim->srtCtrl, ((const AnimFrameT *)frameData)->px, ((const AnimFrameT *)frameData)->py);
            } else {
                NNSi_G2dSrtcSetSRTScale(&pMultiCellAnim->srtCtrl, frameData->sx, frameData->sy);
                NNSi_G2dSrtcSetSRTRotZ(&pMultiCellAnim->srtCtrl, frameData->rotZ);
                NNSi_G2dSrtcSetTrans(&pMultiCellAnim->srtCtrl, frameData->px, frameData->py);
            }
        }
        SetMCDataToMCInstanceImpl_(&pMultiCellAnim->multiCellInstance, pMCData, pMultiCellAnim->totalVideoFrame);
    } else {
        NNS_G2dTickMCInstance(&pMultiCellAnim->multiCellInstance, frames);
    }
}

void NNS_G2dSetMCAnimationCurrentFrame(NNSG2dMultiCellAnimation *pMultiCellAnim, u16 frameIndex) {
    if (!NNS_G2dSetAnimCtrlCurrentFrame(&pMultiCellAnim->animCtrl, frameIndex) || pMultiCellAnim->animCtrl.pActiveCurrent->frames == 0) {
        return;
    }
    const AnimFrameSRT *frameData = NNS_G2dGetAnimCtrlCurrentElement(&pMultiCellAnim->animCtrl);
    u32 animType;
    const NNSG2dMultiCellData *pMCData = NNS_G2dGetMultiCellDataByIdx(pMultiCellAnim->pMultiCellDataBank, frameData->index);
    animType = pMultiCellAnim->animCtrl.pAnimSequence->animType & 0xff;
    NNSi_G2dSrtcInitControl(&pMultiCellAnim->srtCtrl, NNS_G2D_SRTCONTROLTYPE_SRT);
    if (animType != ANIM_ELEMENT_INDEX) {
        if (animType == ANIM_ELEMENT_INDEX_T) {
            NNSi_G2dSrtcSetTrans(&pMultiCellAnim->srtCtrl, ((const AnimFrameT *)frameData)->px, ((const AnimFrameT *)frameData)->py);
        } else {
            NNSi_G2dSrtcSetSRTScale(&pMultiCellAnim->srtCtrl, frameData->sx, frameData->sy);
            NNSi_G2dSrtcSetSRTRotZ(&pMultiCellAnim->srtCtrl, frameData->rotZ);
            NNSi_G2dSrtcSetTrans(&pMultiCellAnim->srtCtrl, frameData->px, frameData->py);
        }
    }
    SetMCDataToMCInstanceImpl_(&pMultiCellAnim->multiCellInstance, pMCData, pMultiCellAnim->totalVideoFrame);
}

#pragma force_active on

void NNS_G2dInitMCAnimation(NNSG2dMultiCellAnimation *pMultiCellAnim, NNSG2dNode *pNodeArray, NNSG2dCellAnimation *pCellAnim, u16 numNode, const NNSG2dCellAnimBankData *pAnimBank, const NNSG2dCellDataBank *pCellDataBank, const NNSG2dMultiCellDataBank *pMultiCellDataBank) {
    u16 i = 0;
    pMultiCellAnim->multiCellInstance.mcType = NNS_G2D_MCTYPE_DONOT_SHARE_CELLANIM;
    pMultiCellAnim->multiCellInstance.pCurrentMultiCell = NULL;
    pMultiCellAnim->multiCellInstance.pAnimDataBank = pAnimBank;
    pMultiCellAnim->multiCellInstance.pCellAnimInstasnces = pNodeArray;
    for (; i < numNode; i++) {
        NNSi_G2dInitializeNode(&pNodeArray[i], NNS_G2D_NODETYPE_CELL);
        pNodeArray[i].pContent = &pCellAnim[i];
        NNS_G2dInitCellAnimation(&pCellAnim[i], NNS_G2dGetAnimSequenceByIdx(pAnimBank, 0), pCellDataBank);
    }
    NNS_G2dInitAnimCtrl(&pMultiCellAnim->animCtrl);
    pMultiCellAnim->pMultiCellDataBank = pMultiCellDataBank;
    NNSi_G2dSrtcInitControl(&pMultiCellAnim->srtCtrl, NNS_G2D_SRTCONTROLTYPE_SRT);
    pMultiCellAnim->totalVideoFrame = 0;
}

#pragma force_active off
