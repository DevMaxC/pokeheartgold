#include "cps/cps_internal.h"

#pragma force_active on

typedef struct CpsRandom {
    u64 x;
    u64 mul;
    u64 add;
} CpsRandom;

static inline void InitRand64(CpsRandom *random, u64 seed) {
    random->x = seed;
    random->mul = 0x5D588B656C078965ULL;
    random->add = 0x269EC3ULL;
}

static inline u32 Rand32(CpsRandom *random, u32 max) {
    random->x = random->mul * random->x + random->add;
    return (u32)(((random->x >> 32) * max) >> 32);
}

// Starts the stack: copies the configuration and starts the tcpip and scavenger threads.
void CPS_Startup(CpsConfig *config) {
    OSi_ReferSymbol(_version_UBIQUITOUS_CPS);
    if (config->randomSeed) {
        InitRand64((CpsRandom *)&gCpsState.random, config->randomSeed);
    } else {
        InitRand64((CpsRandom *)&gCpsState.random, OS_GetTick());
    }
    if (config->alloc && config->free) {
        gCpsState.alloc = config->alloc;
        gCpsState.free = config->free;
    } else {
        gCpsState.alloc = (void *(*)(u32))empty_func;
        gCpsState.free = (void (*)(void *))empty_func;
    }
    gCpsState.staticIp = config->staticIp;
    if (config->mss) {
        gCpsState.mss = config->mss;
    } else {
        gCpsState.mss = 1460;
    }
    gCpsState.requestedIp = config->dhcpRequestIp;
    gCpsState.yieldSleep = config->yieldSleep;
    if (config->addressCallback) {
        gCpsState.addressCallback = config->addressCallback;
    } else {
        gCpsState.addressCallback = empty_func;
    }
    if (config->linkIsOn) {
        gCpsState.linkIsOn = config->linkIsOn;
    } else {
        gCpsState.linkIsOn = default_link_is_on;
    }
    gCpsState.recvRing = config->work;
    gCpsState.recvRingSize = config->workSize;
    gCpsState.recvTail = 0;
    gCpsState.recvHead = 0;
    gCpsState.ephemeralPort = Rand32((CpsRandom *)&gCpsState.random, 3976) + 1024;
    OS_GetMacAddress(gCpsMacAddress);
    gCpsState.addressConflict = 0;
    // the stacks are 0x800-byte .bss blocks; a stack is passed by its end (the stack ends where gCpsSslRandomState begins)
    OS_CreateThread(&gCpsTcpipThread, tcpip, NULL, &gCpsSslRandomState, 2048, gCpsThreadPriority);
    OS_CreateThread(&gCpsScavengerThread, scavenger, NULL, gCpsTcpipStack, 2048, gCpsThreadPriority);
    OS_WakeupThreadDirect(&gCpsTcpipThread);
    OS_WakeupThreadDirect(&gCpsScavengerThread);
}
