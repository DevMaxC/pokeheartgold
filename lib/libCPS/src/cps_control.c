#include "cps/cps_internal.h"

#pragma force_active on

// Asks the scavenger thread to stop; TRUE once it has.
int CPS_CalmDown(void) {
    OSIntrMode enabled = OS_DisableInterrupts();
    int terminated = OS_IsThreadTerminated(&gCpsScavengerThread);
    if (!terminated && !gCpsState.calmDown) {
        gCpsState.calmDown = 1;
        OS_WakeupThreadDirect(&gCpsScavengerThread);
    }
    OS_RestoreInterrupts(enabled);
    return terminated;
}

void CPS_SetScavengerCallback(void *callback) {
    gCpsState.scavengerCallback = callback;
}

void CPS_Cleanup(void) {
    CPS_CalmDown();
    OS_JoinThread(&gCpsScavengerThread);
    OS_DestroyThread(&gCpsTcpipThread);
    gCpsState.recvWaiter = NULL;
    reset_network_vars(0);
    gCpsState.recvRing = NULL;
    gCpsState.recvRingSize = 0;
}

void CPS_SetThreadPriority(u32 priority) {
    gCpsThreadPriority = priority;
    OS_SetThreadPriority(&gCpsTcpipThread, priority);
    OS_SetThreadPriority(&gCpsScavengerThread, priority);
}
