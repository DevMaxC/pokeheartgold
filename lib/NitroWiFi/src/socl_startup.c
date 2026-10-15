#include "nitrowifi/socl_internal.h"

// SOCL_Startup: starts the TCP/IP stack with the caller's configuration and creates the control socket.

#pragma force_active on

int SOCL_Startup(SoclConfig *config) {
    OSi_ReferSymbol(_version_NINTENDO_WiFi);
    if (gSoclConfig) {
        return 0;
    }
    gSoclConfig = config;
    SOCLi_StartupCPS();
    return SOCLi_StartupSOCL();
}

int SOCLi_StartupSOCL(void) {
    int result = SOCLi_StartupCommandPacketQueue(gSoclConfig->commandPacketCount);
    if (result >= 0) {
        gSoclState.ctrlSocket = (SoclSocket *)SOCL_CreateSocket(&gSoclCtrlSocketParam);
    }
    return result;
}

// keeps the shared constant 1 in one register across the DHCP branch
#pragma opt_propagation off

void SOCLi_StartupCPS(void) {
    CpsConfig *cpsConfig = &gSoclState.cpsConfig;
    SoclConfig *config = gSoclConfig;
    void *work;
    int mtu;
    int priority;
    int recvBufSize;
    int mss;
    int consumeMin;
    SoclSocketParam *tcpParam;
    u32 *hostIp;

    MI_CpuFill8(cpsConfig, 0, sizeof(CpsConfig));
    gSoclState.cpsConfig.alloc = config->alloc;
    gSoclState.cpsConfig.free = config->free;
    gSoclState.cpsConfig.linkIsOn = SOCL_LinkIsOn;
    gSoclState.cpsConfig.randomSeed = 0;
    gSoclState.cpsConfig.yieldSleep = gSoclState.yieldSleep;
    if (config->cpsWorkSize) {
        cpsConfig->workSize = config->cpsWorkSize;
    } else {
        cpsConfig->workSize = 0x4000;
    }
    work = config->cpsWork;
    if (!work) {
        work = gSoclConfig->alloc(cpsConfig->workSize);
    }
    cpsConfig->work = work;
    mtu = config->mtu;
    recvBufSize = config->recvBufSize;
    if (!mtu) {
        mtu = 0x240;
    }
    if (!recvBufSize) {
        recvBufSize = 0x10C0;
    }
    mss = mtu - 40;
    tcpParam = &gSoclTcpSocketParam;
    hostIp = &gSoclHostAddress;
    consumeMin = recvBufSize / 2;
    gSoclTcpSocketParam.recvBufSize = recvBufSize;
    tcpParam->consumeMin = consumeMin;
    cpsConfig->mss = mss;
    *hostIp = 0;
    {
        u32 on = 1;
        if (config->useDhcp) {
            cpsConfig->staticIp = 0;
            cpsConfig->addressCallback = SOCLi_DhcpTimeout;
            gSoclState.addressState = on;
            cpsConfig->dhcpRequestIp = gSoclState.lastIp;
        } else {
            gSoclState.addressState = 0;
            cpsConfig->staticIp = on;
            cpsConfig->addressCallback = SOCLi_SetMyIP;
        }
    }
    priority = config->threadPriority;
    if (!priority) {
        priority = 11;
    }
    CPS_SetThreadPriority(priority);
    WCM_SetRecvDCFCallback(CPSi_RecvCallbackFunc);
    CPS_SetScavengerCallback(SOCLi_TrashSocket);
    CPS_Startup(cpsConfig);
}

#pragma opt_propagation reset

void SOCLi_SetMyIP(void) {
    SoclConfig *config = gSoclConfig;
    gSoclHostAddress = config->hostIp;
    gSoclNetmask = config->netmask;
    gSoclGateway = config->gateway;
    gCpsDnsServers[0] = config->dns[0];
    gCpsDnsServers[1] = config->dns[1];
    gSoclState.addressState |= 2;
}

void SOCLi_DhcpTimeout(void) {
    gSoclState.addressState |= 2;
}

int SOCL_LinkIsOn(void) {
    return WCM_GetApMacAddress() != NULL;
}
