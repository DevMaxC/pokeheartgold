#include "cps/cps_internal.h"

// ARP: the cache of known MAC addresses and the requests that fill it.

#pragma force_active on

// MAC address of ip (NULL: not known yet)
u8 *inq_arpcache(u32 ip) {
    OSIntrMode enabled;
    u32 i;
    u8 *mac;
    enabled = OS_DisableInterrupts();
    mac = NULL;
    if (ip == CPS_LOOPBACK || ip == gCpsState.hostIp) {
        mac = gCpsMacAddress;
    } else if (is_broadcast(ip) || is_multicast(ip)) {
        mac = gCpsBroadcastMac;
    } else {
        for (i = 0; i < 8; i++) {
            if (gCpsArpCache[i].ip == ip) {
                u32 offset;
                ip = (u32)(OS_GetTick() >> 16); // now the tick
                offset = i * sizeof(CpsArpEntry);
                *(u16 *)((u8 *)gCpsArpCacheTick + offset) = ip;
                mac = (u8 *)gCpsArpCache + offset + 4;
                break;
            }
        }
    }
    OS_RestoreInterrupts(enabled);
    return mac;
}

void send_arprequest(u32 ip) {
    u8 frame[42];
    u16 targetHigh;
    u16 targetLow;
    u16 senderHigh;
    u16 senderLow;
    u32 hostIp;
    MI_CpuFill8(frame, 0, 42);
    MI_CpuFill8(frame, 0xFF, 6);
    MI_CpuCopy8(gCpsMacAddress, frame + 6, 6);
    *(u16 *)(frame + 12) = 0x608; // type ARP
    frame[15] = 1;                // Ethernet
    frame[16] = 8;                // IPv4
    *(u16 *)(frame + 18) = 0x406;
    frame[21] = 1; // request
    MI_CpuCopy8(gCpsMacAddress, frame + 22, 6);
    targetHigh = (u16)(ip >> 16);
    targetLow = (u16)ip;
    hostIp = gCpsState.hostIp;
    senderHigh = (u16)(hostIp >> 16);
    senderLow = (u16)hostIp;
    *(u16 *)(frame + 28) = (senderHigh >> 8) | (senderHigh << 8);
    *(u16 *)(frame + 30) = (senderLow >> 8) | (senderLow << 8);
    *(u16 *)(frame + 38) = (targetHigh >> 8) | (targetHigh << 8);
    *(u16 *)(frame + 40) = (targetLow >> 8) | (targetLow << 8);
    send_packet(frame, 42, NULL, 0);
}

// Asks for the MAC address of ip, 8 times, waiting up to 2 s each (NULL: no answer or address lost).
u8 *arprequest(u32 ip) {
    u32 i, j;
    u8 *mac;
    for (i = 0; i < 8; i++) {
        send_arprequest(ip);
        for (j = 0; j < 20; j++) {
            if (gCpsState.hostIp == 0) {
                return NULL;
            }
            OS_Sleep(100);
            mac = inq_arpcache(ip);
            if (mac) {
                return mac;
            }
        }
    }
    return NULL;
}

// Updates the entry of ip; with create, adds it (replacing a free or the least recently used entry).
void reg_arpcache(const u8 *mac, u32 ip, int create) {
    u16 tick;
    u32 i, best;
    int age;
    CpsArpEntry *entry;
    if (ip == CPS_LOOPBACK || ip == ((u32 *)&gCpsState)[20]) {
        return;
    }
    if (!ip_islocal(ip)) {
        return;
    }
    if (is_multicast(ip)) {
        return;
    }
    tick = (u16)(OS_GetTick() >> 16);
    entry = gCpsArpCache;
    for (i = 0; i < 8; i++, entry++) {
        if (ip == entry->ip) {
            gCpsArpCacheTick[i * 6] = tick;
            MI_CpuCopy8(mac, gCpsArpCache[i].mac, 6);
            return;
        }
    }
    if (!create) {
        return;
    }
    age = 0;
    entry = gCpsArpCache;
    best = 0;
    for (i = 0; i < 8; i++, entry++) {
        if (!entry->ip) {
            best = i;
            break;
        }
        if (age < (s16)(tick - entry->tick)) {
            best = i;
            age = (u16)(tick - entry->tick);
        }
    }
    gCpsArpCache[best].ip = ip;
    MI_CpuCopy8(mac, gCpsArpCache[best].mac, 6);
    gCpsArpCacheTick[best * 6] = tick;
}
