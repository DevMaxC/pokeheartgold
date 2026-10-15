#include <nitro.h>
#include <nnsys/snd_internal.h>

#define SND_ALARM_NUM 8

BOOL NNS_SndLockChannel(u32 chBitFlag) {
    if (chBitFlag == 0) {
        return TRUE;
    }
    if (chBitFlag & gSndResourceMgr.lockedChannels) {
        return FALSE;
    }
    SND_LockChannel(chBitFlag, 0);
    gSndResourceMgr.lockedChannels |= chBitFlag;
    return TRUE;
}

void NNS_SndUnlockChannel(u32 chBitFlag) {
    if (chBitFlag == 0) {
        return;
    }
    SND_UnlockChannel(chBitFlag, 0);
    gSndResourceMgr.lockedChannels &= ~chBitFlag;
}

void NNS_SndUnlockCapture(u32 capBitFlag) {
    gSndResourceMgr.lockedCaptures &= ~capBitFlag;
}

int NNS_SndAllocAlarm(void) {
    u32 mask = 1;
    int alarmNo = 0;
    u32 allocated = gSndResourceMgr.allocatedAlarms;
    for (; alarmNo < SND_ALARM_NUM; alarmNo++, mask <<= 1) {
        if (!(allocated & mask)) {
            gSndResourceMgr.allocatedAlarms |= mask;
            return alarmNo;
        }
    }
    return -1;
}

void NNS_SndFreeAlarm(int alarmNo) {
    gSndResourceMgr.allocatedAlarms &= ~(1 << alarmNo);
}

void NNSi_SndInitResourceMgr(void) {
    gSndResourceMgr.lockedChannels = 0;
    gSndResourceMgr.lockedCaptures = 0;
    gSndResourceMgr.allocatedAlarms = 0;
}
