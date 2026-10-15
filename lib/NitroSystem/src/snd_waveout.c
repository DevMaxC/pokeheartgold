#include <nitro.h>
#include <nnsys/snd_internal.h>

#define SND_TIMER_CLOCK_X64K 0x7FD87F8000ULL // sound timer clock (Hz) << 16
#define SND_TIMER_MIN        16
#define SND_TIMER_MAX        65535

#define SND_CHANNEL_LOOP_REPEAT 1
#define SND_CHANNEL_LOOP_1SHOT  2

NNSSndWaveOutHandle NNS_SndWaveOutAllocChannel(int chNo) {
    if (!NNS_SndLockChannel(1 << chNo)) {
        return NULL;
    }
    NNSSndWaveOutHandle waveOut = &gSndWaveOuts[chNo];
    waveOut->chNo = chNo;
    waveOut->isPlaying = FALSE;
    return waveOut;
}

void NNS_SndWaveOutFreeChannel(NNSSndWaveOutHandle handle) {
    NNS_SndUnlockChannel(1 << handle->chNo);
}

#pragma force_active on

BOOL NNS_SndWaveOutStart(NNSSndWaveOutHandle handle, NNSSndWaveFormat format, const void *data, BOOL loopFlag, int loopStartSample, int samples, int sampleRate, int volume, int speed, int pan) {
    int loopStart, loopLen;
    switch (format) {
    case NNS_SND_WAVE_FORMAT_PCM8:
        loopStart = loopStartSample >> 2;
        loopLen = (samples >> 2) - loopStart;
        break;
    case NNS_SND_WAVE_FORMAT_PCM16:
        loopStart = loopStartSample >> 1;
        loopLen = (samples >> 1) - loopStart;
        break;
    }
    u64 timer = SND_TIMER_CLOCK_X64K / sampleRate / speed;
    if (timer < SND_TIMER_MIN) {
        timer = SND_TIMER_MIN;
    } else if (timer > SND_TIMER_MAX) {
        timer = SND_TIMER_MAX;
    }
    SND_SetupChannelPcm(handle->chNo, format, data, loopFlag ? SND_CHANNEL_LOOP_REPEAT : SND_CHANNEL_LOOP_1SHOT, loopStart, loopLen, volume, 0, (u32)timer, pan);
    SND_StartTimer(1 << handle->chNo, 0, 0, 0);
    handle->isPlaying = TRUE;
    handle->isStarted = FALSE;
    handle->startTag = SND_GetCurrentCommandTag();
    handle->sampleRate = sampleRate;
    return TRUE;
}

#pragma force_active off

void NNS_SndWaveOutStop(NNSSndWaveOutHandle handle) {
    if (!handle->isPlaying) {
        return;
    }
    SND_StopTimer(1 << handle->chNo, 0, 0, 0);
    handle->isPlaying = FALSE;
}

void NNS_SndWaveOutSetVolume(NNSSndWaveOutHandle handle, int volume) {
    if (!handle->isPlaying) {
        return;
    }
    SND_SetChannelVolume(1 << handle->chNo, volume, 0);
}

#pragma force_active on

void NNS_SndWaveOutSetSpeed(NNSSndWaveOutHandle handle, int speed) {
    if (handle->isPlaying) {
        u64 timer = SND_TIMER_CLOCK_X64K / handle->sampleRate / speed;
        if (timer < SND_TIMER_MIN) {
            timer = SND_TIMER_MIN;
        } else if (timer > SND_TIMER_MAX) {
            timer = SND_TIMER_MAX;
        }
        SND_SetChannelTimer(1 << handle->chNo, (u32)timer);
    }
}

#pragma force_active off

void NNS_SndWaveOutSetPan(NNSSndWaveOutHandle handle, int pan) {
    if (!handle->isPlaying) {
        return;
    }
    SND_SetChannelPan(1 << handle->chNo, pan);
}

BOOL NNS_SndWaveOutIsPlaying(NNSSndWaveOutHandle handle) {
    if (!handle->isPlaying) {
        return FALSE;
    }
    if (!handle->isStarted) {
        if (!SND_IsFinishedCommandTag(handle->startTag)) {
            return TRUE;
        }
        handle->isStarted = TRUE;
    }
    u32 chStatus = SND_GetChannelStatus();
    if (chStatus & (1 << handle->chNo)) {
        return TRUE;
    }
    handle->isPlaying = FALSE;
    return FALSE;
}
