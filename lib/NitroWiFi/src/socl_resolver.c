#include "nitrowifi/socl_internal.h"

// Name resolution through CPS (DNS), host address and DNS server settings.

#pragma force_active on

// CPS_Resolve needs a registered socket: a temporary one with its own buffers.
u32 SOCL_Resolve(const char *name) {
    CpsSocket cps;
    u8 *buffer;
    u32 result;
    if (!name) {
        return 0;
    }
    buffer = gSoclConfig->alloc(0xFD0);
    if (!buffer) {
        return 0;
    }
    MI_CpuFill8(&cps, 0, sizeof(CpsSocket));
    cps.recvBuf.data = buffer;
    cps.recvBuf.size = 0xB68;
    cps.sendBuf.data = buffer + 0xB68;
    cps.sendBuf.size = 0x466;
    CPS_SocRegister(&cps);
    result = CPS_Resolve((char *)name);
    CPS_SocUnRegister();
    gSoclConfig->free(buffer);
    return result;
}

#pragma force_active off

// Converts a dotted address without asking the DNS servers.
u32 SOCL_InetAtoH(const char *name) {
    OSIntrMode enabled = OS_DisableInterrupts();

    struct {
        u32 primary;
        u32 secondary;
    } dns = { gCpsDnsServers[0], gCpsDnsServers[1] };

    gCpsDnsServers[0] = 0;
    gCpsDnsServers[1] = 0;
    u32 result = CPS_Resolve((char *)name);
    gCpsDnsServers[0] = dns.primary;
    gCpsDnsServers[1] = dns.secondary;
    OS_RestoreInterrupts(enabled);
    return result;
}

int SOCL_SetResolver(u32 primary, u32 secondary) {
    if (SOCL_GetHostID() == 0) {
        return -39;
    }
    gCpsDnsServers[0] = primary;
    gCpsDnsServers[1] = secondary;
    return 0;
}

u32 SOCL_GetHostID(void) {
    u32 hostIp = gSoclHostAddress;
    if (hostIp == 0) {
        if ((gSoclAddressState & 3) == 1 && OS_GetProcMode() != OS_PROCMODE_IRQ) {
            OS_Sleep(10);
        }
    } else if (gSoclLastIp == 0) {
        gSoclLastIp = hostIp;
    }
    return gSoclHostAddress;
}
