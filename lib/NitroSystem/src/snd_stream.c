#include <nitro.h>
#include <nnsys/snd_internal.h>
#include <stddef.h>

#pragma force_active on

void NNS_SndStrmInit(SndStrm *strm) {
    if (!gSndStrmListInitialized) {
        NNS_FndInitList(&gSndStrmList, offsetof(SndStrm, link));
        gSndStrmListInitialized = TRUE;
    }
    strm->preSleep.func = BeginSleep__Strm;
    strm->preSleep.arg = strm;
    strm->postSleep.func = EndSleep__Strm;
    strm->postSleep.arg = strm;
    strm->chBitFlag = 0;
    strm->numChannels = 0;
    strm->isActive = FALSE;
    strm->isPlaying = FALSE;
}

BOOL NNS_SndStrmAllocChannel(SndStrm *strm, int numChannels, const u8 *chNo) {
    u32 chBitFlag = 0;
    int i;
    for (i = 0; i < numChannels; i++) {
        strm->chNo[i] = chNo[i];
        chBitFlag |= 1 << chNo[i];
    }
    if (!NNS_SndLockChannel(chBitFlag)) {
        return FALSE;
    }
    strm->numChannels = numChannels;
    strm->chBitFlag = chBitFlag;
    return TRUE;
}

#pragma force_active off

void NNS_SndStrmFreeChannel(SndStrm *strm) {
    u32 chBitFlag = strm->chBitFlag;
    if (chBitFlag == 0) {
        return;
    }
    NNS_SndUnlockChannel(chBitFlag);
    strm->chBitFlag = 0;
    strm->numChannels = 0;
}

#pragma force_active on

// splits `buffer` into one looping buffer per channel and fills the first block through `callback`
BOOL NNS_SndStrmSetup(SndStrm *strm, int format, void *buffer, u32 bufSize, u32 timer, u32 numBlocks, SndStrmCallback callback, void *arg) {
    u32 alarmPeriod, chBufSize;
    u32 blocks = numBlocks;
    int i;
    OSIntrMode intrMode;

    if (strm->isActive) {
        NNS_SndStrmStop(strm);
    }
    // per channel, a multiple of 32 bytes per block
    chBufSize = bufSize / (strm->numChannels * (blocks << 5));
    chBufSize *= blocks;
    chBufSize <<= 5;
    strm->bufSize = chBufSize;
    alarmPeriod = (timer * (format == NNS_SND_WAVE_FORMAT_PCM16 ? (chBufSize >> 1) : chBufSize)) / blocks;
    strm->alarmNo = NNS_SndAllocAlarm();
    if (strm->alarmNo < 0) {
        return FALSE;
    }
    for (i = 0; i < strm->numChannels; i++) {
        int chNo = strm->chNo[i];
        gSndStrmChannels[chNo].buffer = (u8 *)buffer + strm->bufSize * i;
        gSndStrmChannels[chNo].volume = 0;
        SND_SetupChannelPcm(chNo, format, gSndStrmChannels[chNo].buffer, 1, 0, strm->bufSize >> 2, 127, 0, timer << 5, 64);
    }
    SND_SetupAlarm(strm->alarmNo, alarmPeriod, alarmPeriod, AlarmCallback, strm);
    NNS_FndAppendListObject(&gSndStrmList, strm);
    strm->format = format;
    strm->numBlocks = numBlocks;
    strm->callback = callback;
    strm->arg = arg;
    strm->curBlock = 0;
    strm->volume = 0;
    strm->isActive = TRUE;
    intrMode = OS_DisableInterrupts();
    strm->numBlocks = 1; // fill the whole buffer at once
    StrmCallback(strm, FALSE);
    strm->numBlocks = numBlocks;
    OS_RestoreInterrupts(intrMode);
    return TRUE;
}

void NNS_SndStrmStart(SndStrm *strm) {
    SND_StartTimer(strm->chBitFlag, 0, 1 << strm->alarmNo, 0);
    if (strm->isPlaying) {
        return;
    }
    PM_PrependPreSleepCallback(&strm->preSleep);
    PM_AppendPostSleepCallback(&strm->postSleep);
    strm->isPlaying = TRUE;
}

#pragma force_active off

void NNS_SndStrmStop(SndStrm *strm) {
    if (strm->isActive) {
        ForceStopStrm(strm);
    }
}

#pragma force_active on

void NNS_SndStrmSetVolume(SndStrm *strm, int volume) {
    int chNo, i;
    strm->volume = volume;
    for (i = 0; i < strm->numChannels; i++) {
        chNo = strm->chNo[i];
        int chVolume = SND_CalcChannelVolume(strm->volume + gSndStrmChannels[chNo].volume);
        SND_SetChannelVolume(1 << chNo, chVolume & 0xFF, chVolume >> 8);
    }
}

void ForceStopStrm(SndStrm *strm) {
    u32 tag;
    if (strm->isPlaying) {
        SND_StopTimer(strm->chBitFlag, 0, 1 << strm->alarmNo, 0);
        PM_DeletePreSleepCallback(&strm->preSleep);
        PM_DeletePostSleepCallback(&strm->postSleep);
        strm->isPlaying = FALSE;
        tag = SND_GetCurrentCommandTag();
        SND_FlushCommand(SND_CMD_FLAG_BLOCK);
        SND_WaitForCommandProc(tag);
    }
    ShutdownStrm(strm);
}

void ShutdownStrm(SndStrm *strm) {
    NNS_SndFreeAlarm(strm->alarmNo);
    NNS_FndRemoveListObject(&gSndStrmList, strm);
    strm->isActive = FALSE;
}

#pragma force_active off

void AlarmCallback(void *arg) {
    StrmCallback(arg, TRUE);
}

#pragma force_active on

// hands the next block of every channel buffer to the user callback
void StrmCallback(SndStrm *strm, BOOL isAlarm) {
    u32 blockSize = strm->bufSize / strm->numBlocks;
    u32 offset = blockSize * strm->curBlock;
    int i;
    for (i = 0; i < strm->numChannels; i++) {
        gSndStrmCallbackBuffers[i] = (u8 *)gSndStrmChannels[strm->chNo[i]].buffer + offset;
    }
    strm->callback(isAlarm, strm->numChannels, gSndStrmCallbackBuffers, blockSize, strm->format, strm->arg);
    strm->curBlock++;
    if (strm->curBlock >= strm->numBlocks) {
        strm->curBlock = 0;
    }
}

void BeginSleep__Strm(void *arg) {
    SndStrm *strm = arg;
    u32 tag;
    if (!strm->isPlaying) {
        return;
    }
    SND_StopTimer(strm->chBitFlag, 0, 1 << strm->alarmNo, 0);
    tag = SND_GetCurrentCommandTag();
    SND_FlushCommand(SND_CMD_FLAG_BLOCK);
    SND_WaitForCommandProc(tag);
}

// refills the buffers up to the end of the loop before restarting
void EndSleep__Strm(void *arg) {
    SndStrm *strm = arg;
    if (!strm->isPlaying) {
        return;
    }
    while (strm->curBlock != 0) {
        OSIntrMode intrMode = OS_DisableInterrupts();
        StrmCallback(strm, TRUE);
        OS_RestoreInterrupts(intrMode);
    }
    SND_StartTimer(strm->chBitFlag, 0, 1 << strm->alarmNo, 0);
}
