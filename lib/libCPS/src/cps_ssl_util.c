#include "cps/cps_ssl_internal.h"

// SSL helpers: the time for the hello randoms, the thread priority of the RSA computations and the
// root CAs of the calling thread's socket.

#pragma force_active on

// seconds since 1970-01-01
u32 date2sec(void) {
    RTCDate date;
    RTCTime time;
    RTC_GetDate(&date);
    RTC_GetTime(&time);
    return (u32)RTC_ConvertDateTimeToSecond(&date, &time) + 946684800; // 1970 .. 2000
}

u32 CPS_GetSslHandshakePriority(void) {
    return gCpsSslConfig.handshakePriority;
}

void CPS_SetSslHandshakePriority(u32 priority) {
    gCpsSslConfig.handshakePriority = priority;
}

// sets the handshake priority; returns the old priority (-1: unchanged) for exit_computebound
u32 enter_computebound(void) {
    OSThread *thread;
    u32 priority;
    if (gCpsSslConfig.handshakePriority >= 32) {
        return -1;
    }
    thread = OS_GetCurrentThread();
    priority = OS_GetThreadPriority(thread);
    OS_SetThreadPriority(thread, gCpsSslConfig.handshakePriority);
    return priority;
}

void exit_computebound(u32 priority) {
    if (priority < 32) {
        OS_SetThreadPriority(OS_GetCurrentThread(), priority);
    }
}

void CPS_SetRootCa(CpsRootCa **rootCas, int count) {
    CpsSocket *socket = CpsThread_GetSocket(OS_GetCurrentThread());
    CpsSsl *ssl;
    if (socket && (ssl = socket->ssl)) {
        ssl->rootCas = rootCas;
        ssl->rootCaCount = count;
    }
}
