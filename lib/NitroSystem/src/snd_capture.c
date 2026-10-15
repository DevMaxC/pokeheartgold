#include <nitro.h>
#include <nnsys/snd_internal.h>

#define SND_CAPTURE_TYPE_REVERB 0
#define SND_CAPTURE_TYPE_EFFECT 1

#pragma force_active on

void NNS_SndCaptureStopReverb(int frames) {
    SndCaptureState *state = &gSndCaptureState;
    if (!gSndCaptureWork.state.isActive) {
        return;
    }
    if (state->type != SND_CAPTURE_TYPE_REVERB) {
        return;
    }
    if (frames == 0) {
        NNSi_SndCaptureStop();
    } else {
        NNSi_SndFaderSet(&state->fader, 0, frames);
        state->isStopping = TRUE;
    }
}

#pragma force_active off

BOOL NNS_SndCaptureIsActive(void) {
    return gSndCaptureWork.state.isActive;
}

int NNS_SndCaptureGetCaptureType(void) {
    return gSndCaptureWork.state.type;
}

void NNSi_SndCaptureInit(void) {
    gSndCaptureWork.unk_00 = 0;
    gSndCaptureWork.state.isActive = FALSE;
}

#pragma force_active on

// fades the reverb out
void NNSi_SndCaptureMain(void) {
    SndCaptureState *state = &gSndCaptureState;
    int volume;
    if (!gSndCaptureWork.state.isActive) {
        return;
    }
    if (state->type != SND_CAPTURE_TYPE_REVERB) {
        return;
    }
    NNSi_SndFaderUpdate(&state->fader);
    if (state->isStopping && NNSi_SndFaderIsFinished(&state->fader)) {
        NNSi_SndCaptureStop();
        return;
    }
    volume = NNSi_SndFaderGet(&state->fader) >> 8;
    if (volume == state->volume) {
        return;
    }
    SND_SetChannelVolume(state->chBitFlag, volume, 0);
    state->volume = volume;
}

void NNSi_SndCaptureStop(void) {
    SndCaptureState *state = &gSndCaptureState;
    BOOL hasAlarm;
    u32 alarmBitFlag;
    if (!gSndCaptureWork.state.isActive) {
        return;
    }
    hasAlarm = state->alarmNo >= 0;
    alarmBitFlag = hasAlarm ? (1 << state->alarmNo) : 0;
    SND_StopTimer(state->chBitFlag, state->capBitFlag, alarmBitFlag, 0);
    if (hasAlarm) {
        u32 tag = SND_GetCurrentCommandTag();
        SND_FlushCommand(SND_CMD_FLAG_BLOCK);
        SND_WaitForCommandProc(tag);
        while (OS_ReceiveMessage(&gSndCaptureMsgQueue, NULL, OS_MESSAGE_NOBLOCK)) {
        }
    }
    if (state->capBitFlag) {
        NNS_SndUnlockCapture(state->capBitFlag);
    }
    if (state->lockedChBitFlag) {
        NNS_SndUnlockChannel(state->lockedChBitFlag);
    }
    if (hasAlarm) {
        NNS_SndFreeAlarm(state->alarmNo);
    }
    if (state->type == SND_CAPTURE_TYPE_EFFECT) {
        SND_SetOutputSelector(0, 0, 0, 0);
    }
    state->isActive = FALSE;
}

void NNSi_SndCaptureBeginSleep(void) {
    SndCaptureState *state = &gSndCaptureState;
    u32 tag;
    if (!gSndCaptureWork.state.isActive) {
        return;
    }
    SND_StopTimer(state->chBitFlag, state->capBitFlag, state->alarmNo >= 0 ? (1 << state->alarmNo) : 0, 0);
    tag = SND_GetCurrentCommandTag();
    SND_FlushCommand(SND_CMD_FLAG_BLOCK);
    SND_WaitForCommandProc(tag);
}

// restarts with silent capture buffers
void NNSi_SndCaptureEndSleep(void) {
    SndCaptureState *state = &gSndCaptureState;
    if (!gSndCaptureWork.state.isActive) {
        return;
    }
    state->pos = 0;
    MIi_CpuClear32(0, state->bufferL, state->bufSize);
    MIi_CpuClear32(0, state->bufferR, state->bufSize);
    DC_FlushRange(state->bufferL, state->bufSize);
    DC_FlushRange(state->bufferR, state->bufSize);
    SND_StartTimer(state->chBitFlag, state->capBitFlag, state->alarmNo >= 0 ? (1 << state->alarmNo) : 0, 0);
}
