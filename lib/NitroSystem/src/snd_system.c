#include <nitro.h>
#include <nnsys/snd_internal.h>

#pragma force_active on

void NNS_SndInit(void) {
    if (gSndMainState.initialized) {
        return;
    }
    gSndMainState.initialized = TRUE;
    SND_Init();
    gSndMainState.preSleep.func = BeginSleep;
    gSndMainState.preSleep.arg = NULL;
    gSndMainState.postSleep.func = EndSleep;
    gSndMainState.postSleep.arg = NULL;
    PM_PrependPreSleepCallback(&gSndMainPreSleepCallback);
    PM_AppendPostSleepCallback(&gSndMainPostSleepCallback);
    NNSi_SndInitResourceMgr();
    NNSi_SndCaptureInit();
    NNSi_SndPlayerInit();
    gSndMainState.driverInfoIdx = -1;
    gSndMainState.isFirstUpdate = TRUE;
}

#pragma force_active off

void NNS_SndMain(void) {
    while (SND_RecvCommandReply(0)) {
    }
    NNSi_SndPlayerMain();
    NNSi_SndCaptureMain();
    NNSi_SndArcStrmMain();
    SND_FlushCommand(0);
}

void NNS_SndSetMasterVolume(int volume) {
    SND_SetMasterVolume(volume);
}

void NNS_SndSetMonoFlag(BOOL flag) {
    if (flag) {
        SND_SetMasterPan(64);
    } else {
        SND_ResetMasterPan();
    }
}

#pragma force_active on

// requests the driver info into one buffer while the other one is read (double buffered)
BOOL NNS_SndUpdateDriverInfo(void) {
    if (!gSndMainState.isFirstUpdate) {
        while (SND_RecvCommandReply(0)) {
        }
        if (!SND_IsFinishedCommandTag(gSndMainState.driverInfoTag)) {
            return FALSE;
        }
        if (gSndMainState.driverInfoIdx < 0) {
            gSndMainState.driverInfoIdx = 1;
        }
        SND_ReadDriverInfo(&gSndDriverInfo[gSndMainState.driverInfoIdx]);
        gSndMainState.driverInfoTag = SND_GetCurrentCommandTag();
        if (gSndMainState.driverInfoIdx == 0) {
            gSndMainState.driverInfoIdx = 1;
        } else {
            gSndMainState.driverInfoIdx = 0;
        }
        DC_InvalidateRange(&gSndDriverInfo[gSndMainState.driverInfoIdx], sizeof(SndDriverInfo));
        SND_FlushCommand(0);
        return TRUE;
    } else {
        SND_ReadDriverInfo(&gSndDriverInfo[0]);
        gSndMainState.driverInfoTag = SND_GetCurrentCommandTag();
        gSndMainState.isFirstUpdate = FALSE;
        return FALSE;
    }
}

BOOL NNS_SndReadDriverChannelInfo(int chNo, SNDChannelInfo *info) {
    const SndDriverInfo *driverInfo = gSndMainState.driverInfoIdx < 0 ? NULL : &gSndDriverInfo[gSndMainState.driverInfoIdx];
    if (driverInfo == NULL) {
        return FALSE;
    }
    return SND_ReadChannelInfo(driverInfo, chNo, info);
}

BOOL NNSi_SndReadDriverTrackInfo(int playerNo, int trackNo, SNDTrackInfo *trackInfo) {
    const SndDriverInfo *driverInfo = gSndMainState.driverInfoIdx < 0 ? NULL : &gSndDriverInfo[gSndMainState.driverInfoIdx];
    if (driverInfo == NULL) {
        return FALSE;
    }
    return SND_ReadTrackInfo(driverInfo, playerNo, trackNo, trackInfo);
}

#pragma force_active off

void BeginSleep(void *arg) {
    NNSi_SndCaptureBeginSleep();
    SND_StopTimer(0, 0, 0, 0);
    u32 tag = SND_GetCurrentCommandTag();
    SND_FlushCommand(SND_CMD_FLAG_BLOCK);
    SND_WaitForCommandProc(tag);
}

void EndSleep(void *arg) {
    NNSi_SndCaptureEndSleep();
}
