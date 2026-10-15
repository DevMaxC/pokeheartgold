#include <MSL.h>
#include <nitro.h>
#include <nnsys/g2d_internal.h>

static inline NNSG2dAnimationPlayMode GetPlayMode(const NNSG2dAnimController *pAnimCtrl) {
    return pAnimCtrl->overriddenPlayMode ? pAnimCtrl->overriddenPlayMode : pAnimCtrl->pAnimSequence->playMode;
}

static inline void ClampCurrentFrame(NNSG2dAnimController *pAnimCtrl) {
    const NNSG2dAnimSequence *seq = pAnimCtrl->pAnimSequence;
    const NNSG2dAnimFrame *current = pAnimCtrl->pCurrent;
    const NNSG2dAnimFrame *first = seq->pAnmFrameArray;
    const NNSG2dAnimFrame *last = first + seq->numFrames - 1;
    if (current > last) {
        pAnimCtrl->pCurrent = last;
    } else if (current < first) {
        pAnimCtrl->pCurrent = first;
    }
}

#pragma force_active on

// called when the current frame ran past either end of the sequence
void SequenceEdgeHandle_(NNSG2dAnimController *pAnimCtrl) {
    NNSG2dAnimationPlayMode mode = GetPlayMode(pAnimCtrl);
    // the casts keep two separate compares: needed for the match
    if ((s32)mode == NNS_G2D_ANIMATIONPLAYMODE_REVERSE || (u32)mode == NNS_G2D_ANIMATIONPLAYMODE_REVERSE_LOOP) {
        pAnimCtrl->bReverse ^= TRUE;
        if (pAnimCtrl->pCurrent <= pAnimCtrl->pAnimSequence->pAnmFrameArray + pAnimCtrl->pAnimSequence->loopStartFrameIdx - 1) {
            if (pAnimCtrl->callbackFunctor.type == NNS_G2D_ANMCALLBACKTYPE_LAST_FRM) {
                pAnimCtrl->callbackFunctor.pFunc(pAnimCtrl->callbackFunctor.param, pAnimCtrl->currentTime);
            }
            mode = GetPlayMode(pAnimCtrl);
            if (mode == NNS_G2D_ANIMATIONPLAYMODE_FORWARD_LOOP || mode == NNS_G2D_ANIMATIONPLAYMODE_REVERSE_LOOP) {
                NNS_G2dResetAnimCtrlState(pAnimCtrl);
            } else {
                pAnimCtrl->bActive = FALSE;
            }
        }
    } else {
        if (pAnimCtrl->callbackFunctor.type == NNS_G2D_ANMCALLBACKTYPE_LAST_FRM) {
            pAnimCtrl->callbackFunctor.pFunc(pAnimCtrl->callbackFunctor.param, pAnimCtrl->currentTime);
        }
        mode = GetPlayMode(pAnimCtrl);
        if (mode == NNS_G2D_ANIMATIONPLAYMODE_FORWARD_LOOP || mode == NNS_G2D_ANIMATIONPLAYMODE_REVERSE_LOOP) {
            NNS_G2dResetAnimCtrlState(pAnimCtrl);
        } else {
            pAnimCtrl->bActive = FALSE;
        }
    }
    ClampCurrentFrame(pAnimCtrl);
}

#pragma force_active off

BOOL SetAnimCtrlCurrentFrameImpl_(NNSG2dAnimController *pAnimCtrl, u16 frameIndex) {
    const NNSG2dAnimSequence *seq = pAnimCtrl->pAnimSequence;
    if (frameIndex < seq->numFrames) {
        pAnimCtrl->pCurrent = &seq->pAnmFrameArray[frameIndex];
        if (pAnimCtrl->pCurrent->frames != 0) {
            pAnimCtrl->pActiveCurrent = pAnimCtrl->pCurrent;
        }
        return TRUE;
    }
    return FALSE;
}

void *NNS_G2dGetAnimCtrlCurrentElement(NNSG2dAnimController *pAnimCtrl) {
    return pAnimCtrl->pActiveCurrent->pContent;
}

#pragma force_active on

static inline BOOL IsSpeedPositive(const NNSG2dAnimController *pAnimCtrl) {
    return pAnimCtrl->speed > 0;
}

static inline BOOL IsPlayingForward(const NNSG2dAnimController *pAnimCtrl) {
    BOOL speedPositive = IsSpeedPositive(pAnimCtrl);
    return speedPositive ^ pAnimCtrl->bReverse;
}

static inline void AdvanceFrame(NNSG2dAnimController *pAnimCtrl) {
    if (IsPlayingForward(pAnimCtrl)) {
        pAnimCtrl->pCurrent++;
    } else {
        pAnimCtrl->pCurrent--;
    }
}

static inline BOOL IsSequenceEdgeReached(const NNSG2dAnimController *pAnimCtrl) {
    const NNSG2dAnimFrame *current = pAnimCtrl->pCurrent;
    const NNSG2dAnimSequence *seq;
    if (IsPlayingForward(pAnimCtrl)) {
        seq = pAnimCtrl->pAnimSequence;
        return current >= seq->pAnmFrameArray + seq->numFrames;
    } else {
        seq = pAnimCtrl->pAnimSequence;
        return current <= seq->pAnmFrameArray + seq->loopStartFrameIdx - 1;
    }
}

static inline BOOL IsFrameTimeOver(const NNSG2dAnimController *pAnimCtrl) {
    if (pAnimCtrl->bActive && pAnimCtrl->currentTime >= (pAnimCtrl->pCurrent->frames << FX32_SHIFT)) {
        return TRUE;
    }
    return FALSE;
}

static inline u16 GetCurrentFrameIndex(const NNSG2dAnimController *pAnimCtrl) {
    return (u16)(((u32)pAnimCtrl->pCurrent - (u32)pAnimCtrl->pAnimSequence->pAnmFrameArray) / sizeof(NNSG2dAnimFrame));
}

static inline BOOL HasCallback(const NNSG2dAnimCallBackFunctor *pCallback) {
    return pCallback->type != NNS_G2D_ANMCALLBACKTYPE_NONE;
}

static inline void InvokeFrameCallback(NNSG2dAnimController *pAnimCtrl, u16 frameIndex) {
    switch (pAnimCtrl->callbackFunctor.type) {
    case NNS_G2D_ANMCALLBACKTYPE_SPEC_FRM:
        if (frameIndex == pAnimCtrl->callbackFunctor.frameIdx) {
            pAnimCtrl->callbackFunctor.pFunc(pAnimCtrl->callbackFunctor.param, frameIndex);
        }
        break;
    case NNS_G2D_ANMCALLBACKTYPE_EVER_FRM:
        pAnimCtrl->callbackFunctor.pFunc(pAnimCtrl->callbackFunctor.param, frameIndex);
        break;
    default:
        break;
    }
}

BOOL NNS_G2dTickAnimCtrl(NNSG2dAnimController *pAnimCtrl, fx32 frames) {
    BOOL frameChanged = FALSE;
    if (pAnimCtrl->bActive != TRUE) {
        return FALSE;
    }
    pAnimCtrl->currentTime += abs(FX_Mul(pAnimCtrl->speed, frames));
    while (IsFrameTimeOver(pAnimCtrl)) {
        frameChanged = TRUE;
        pAnimCtrl->currentTime -= pAnimCtrl->pCurrent->frames << FX32_SHIFT;
        AdvanceFrame(pAnimCtrl);
        if (IsSequenceEdgeReached(pAnimCtrl)) {
            SequenceEdgeHandle_(pAnimCtrl);
        }
        if (pAnimCtrl->pCurrent->frames != 0) {
            pAnimCtrl->pActiveCurrent = pAnimCtrl->pCurrent;
        }
        if (HasCallback(&pAnimCtrl->callbackFunctor)) {
            InvokeFrameCallback(pAnimCtrl, GetCurrentFrameIndex(pAnimCtrl));
        }
    }
    return frameChanged;
}

#pragma force_active off

BOOL NNS_G2dSetAnimCtrlCurrentFrame(NNSG2dAnimController *pAnimCtrl, u16 frameIndex) {
    BOOL result = SetAnimCtrlCurrentFrameImpl_(pAnimCtrl, frameIndex);
    if (result) {
        pAnimCtrl->currentTime = 0;
    }
    return result;
}

u16 NNS_G2dGetAnimCtrlCurrentFrame(const NNSG2dAnimController *pAnimCtrl) {
    return ((u32)pAnimCtrl->pCurrent - (u32)pAnimCtrl->pAnimSequence->pAnmFrameArray) >> 3;
}

void NNS_G2dInitAnimCtrl(NNSG2dAnimController *pAnimCtrl) {
    NNS_G2dInitAnimCallBackFunctor(&pAnimCtrl->callbackFunctor);
    pAnimCtrl->pCurrent = NULL;
    pAnimCtrl->pActiveCurrent = NULL;
    pAnimCtrl->bReverse = FALSE;
    pAnimCtrl->bActive = TRUE;
    pAnimCtrl->currentTime = 0;
    pAnimCtrl->speed = FX32_ONE;
    pAnimCtrl->overriddenPlayMode = NNS_G2D_ANIMATIONPLAYMODE_INVALID;
    pAnimCtrl->pAnimSequence = NULL;
}

void NNS_G2dInitAnimCallBackFunctor(NNSG2dAnimCallBackFunctor *pCallback) {
    pCallback->type = NNS_G2D_ANMCALLBACKTYPE_NONE;
    pCallback->param = 0;
    pCallback->pFunc = NULL;
    pCallback->frameIdx = 0;
}

void NNS_G2dResetAnimCtrlState(NNSG2dAnimController *pAnimCtrl) {
    if ((pAnimCtrl->speed > 0) ^ pAnimCtrl->bReverse) {
        pAnimCtrl->pCurrent = pAnimCtrl->pAnimSequence->pAnmFrameArray + pAnimCtrl->pAnimSequence->loopStartFrameIdx;
    } else {
        pAnimCtrl->pCurrent = pAnimCtrl->pAnimSequence->pAnmFrameArray + pAnimCtrl->pAnimSequence->numFrames - 1;
    }
    pAnimCtrl->pActiveCurrent = pAnimCtrl->pCurrent;
    pAnimCtrl->currentTime = 0;
    NNS_G2dTickAnimCtrl(pAnimCtrl, 0);
}

void NNS_G2dBindAnimCtrl(NNSG2dAnimController *pAnimCtrl, const NNSG2dAnimSequence *pAnimSeq) {
    pAnimCtrl->pAnimSequence = pAnimSeq;
    NNS_G2dResetAnimCtrlState(pAnimCtrl);
}

BOOL NNSi_G2dIsAnimCtrlLoopAnim(const NNSG2dAnimController *pAnimCtrl) {
    NNSG2dAnimationPlayMode mode = pAnimCtrl->overriddenPlayMode;
    if (mode == NNS_G2D_ANIMATIONPLAYMODE_INVALID) {
        mode = pAnimCtrl->pAnimSequence->playMode;
    }
    return mode == NNS_G2D_ANIMATIONPLAYMODE_FORWARD_LOOP || mode == NNS_G2D_ANIMATIONPLAYMODE_REVERSE_LOOP;
}
