#include "nitrowifi/socl_internal.h"

// SOC_GetHostByName: resolves a name into one static host entry.

SocState gSocState;
SocHostEntWork gSocHostEntWork;

#pragma force_active on

SocHostEnt *SOC_GetHostByName(const char *name) {
    u32 ip = SOCL_Resolve(name);
    if (ip == 0) {
        return NULL;
    }
    MI_CpuFill8(gSocHostName, 0, sizeof(gSocHostName));
    STD_CopyLString(gSocHostName, name, sizeof(gSocHostName));
    gSocHostEntWork.hostEnt.name = gSocHostName;
    gSocHostEntWork.hostEnt.aliases = NULL;
    gSocHostEntWork.hostEnt.addrType = 2;
    gSocHostEntWork.hostEnt.length = 4;
    gSocHostEntWork.hostEnt.addrList = gSocHostEntWork.addrList;
    gSocHostEntWork.addrList[0] = (char *)&gSocState.hostIp;
    gSocHostEntWork.addrList[1] = NULL;
    gSocState.hostIp = Socl_Swap32(ip);
    return &gSocHostEntWork.hostEnt;
}
