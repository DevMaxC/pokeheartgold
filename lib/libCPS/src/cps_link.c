#include "cps/cps_internal.h"

// Checksums, address classes, and the link layer: frames go out through WCM, received frames are
// queued in the receive ring (CpsConfig.work) by the WCM callback and taken out by the tcpip thread.

#pragma force_active on

// one's complement sum of the data (big endian 16-bit words) added to sum
u32 calc_checksum_do(const void *data, u32 length, u32 sum) {
    const u8 *p = data;
    if ((u32)p & 1) {
        while (length > 1) {
            sum += (u16)((p[0] << 8) | p[1]);
            length -= 2;
            p += 2;
        }
    } else {
        // sum the halfwords as they are, with the start value swapped, and swap the result
        sum = (u16)(((u16)sum >> 8) | ((u16)sum << 8));
        while (length > 1) {
            sum += *(u16 *)p;
            p += 2;
            length -= 2;
        }
        sum = ((sum >> 8) & 0x00FF00FF) | ((sum << 8) & 0xFF00FF00);
        sum = (sum >> 16) | (sum << 16);
    }
    if (length) {
        sum += *p << 8;
    }
    sum = (u16)sum + (sum >> 16);
    sum += sum >> 16;
    return (u16)sum;
}

u16 invert_checksum(u16 sum) {
    sum ^= 0xFFFF;
    if (!sum) {
        sum = 0xFFFF;
    }
    return sum;
}

u16 calc_checksum(const void *data, u32 length) {
    return invert_checksum(calc_checksum_do(data, length, 0));
}

// TRUE if the TCP / UDP checksum (with the pseudo header) is wrong
int check_tcpudpsum(const void *data, u32 length, const CpsIpHeader *ip, u32 protocol) {
    u32 sum = calc_checksum_do(data, length, protocol);
    sum = calc_checksum_do(ip->source, 8, sum);
    sum += length;
    if (sum & 0x10000) {
        sum = (u16)(sum + 1);
    }
    return sum != 0xFFFF;
}

// on our subnet (or broadcast / loopback)
int ip_islocal(u32 ip) {
    int local = TRUE;
    if (ip != 0xFFFFFFFF && ip != CPS_LOOPBACK && ((ip & gCpsState.netmask) != (gCpsState.hostIp & gCpsState.netmask))) {
        local = FALSE;
    }
    return local;
}

// next hop
u32 get_targetip(u32 ip) {
    if (!ip_islocal(ip)) {
        ip = gCpsState.gateway;
    }
    return ip;
}

int is_broadcast(u32 ip) {
    int broadcast = FALSE;
    if (ip_islocal(ip)) {
        u32 hostMask = ~gCpsState.netmask;
        if ((ip & hostMask) == hostMask) {
            broadcast = TRUE;
        }
    }
    return broadcast;
}

int is_multicast(u32 ip) {
    return (ip & 0xF0000000) == 0xE0000000;
}

// a datagram to this address is for us
int ip_isme(u32 ip) {
    return gCpsState.hostIp == 0 || ip == gCpsState.hostIp || ip == CPS_LOOPBACK || is_broadcast(ip) || is_multicast(ip);
}

// nonzero if the MAC addresses differ
int maccmp(const u16 *a, const u16 *b) {
    int i;
    for (i = 0; i < 3; i++) {
        if (*a++ != *b++) {
            return 1;
        }
    }
    return 0;
}

// frame: destination MAC, room for the source MAC (overwritten with the LLC/SNAP header), payload
void send_packet(u8 *frame, int length, void *extra, int extraLength) {
    int result;
    MI_CpuCopy8(gCpsLlcSnapHeader, frame + 6, 6);
    result = WCM_SendDCFDataEx(frame, frame + 6, length - 6, extra, extraLength);
    gCpsState.sendFailed = result < 0;
}

// Queues a received IPv4 / ARP frame (LLC/SNAP + payload, plus an optional second part) in the
// receive ring as: u16 size, destination MAC, source MAC, type, payload. A size of 0 at the end of the
// ring means "continue at the start". Frames that do not fit are dropped.
void put_in_buffer(const void *dest, const void *source, u8 *data, u32 length, const void *extra, u32 extraLength) {
    u32 total, next;
    u16 size;
    if (gCpsState.recvRing == NULL || gCpsState.recvRingSize == 0) {
        return;
    }
    total = length + extraLength;
    if (total < 8 || total > 1508) {
        return;
    }
    if (data[0] != gCpsLlcSnapHeader[0] || data[1] != gCpsLlcSnapHeader[1] || data[2] != gCpsLlcSnapHeader[2] || data[6] != 8) {
        return;
    }
    if (data[7] != 0 && data[7] != 6) {
        return;
    }
    size = (total + 9) & ~1;
    next = gCpsState.recvHead + size;
    if (gCpsState.recvHead < gCpsState.recvTail && gCpsState.recvTail <= next) {
        return;
    }
    if (next == gCpsState.recvRingSize) {
        next = 0;
        if (gCpsState.recvTail == 0) {
            return;
        }
    } else if (next > gCpsState.recvRingSize) {
        next = size;
        if (gCpsState.recvTail <= size) {
            return;
        }
    }
    if (gCpsState.recvHead + size > gCpsState.recvRingSize) {
        if (gCpsState.recvRingSize - gCpsState.recvHead >= 2) {
            *(u16 *)(gCpsState.recvRing + gCpsState.recvHead) = 0;
        }
        gCpsState.recvHead = 0;
    }
    *(u16 *)(gCpsState.recvRing + gCpsState.recvHead) = size;
    MI_CpuCopy8(source, gCpsState.recvRing + gCpsState.recvHead + 2, 6);
    MI_CpuCopy8(dest, gCpsState.recvRing + gCpsState.recvHead + 8, 6);
    MI_CpuCopy8(data + 6, gCpsState.recvRing + gCpsState.recvHead + 14, length - 6);
    if (extra && extraLength) {
        MI_CpuCopy8(extra, gCpsState.recvRing + gCpsState.recvHead + 8 + length, extraLength);
    }
    gCpsState.recvHead = next;
}

// WCM receive callback
void CPSi_RecvCallbackFunc(void *dest, void *source, void *data, u32 length) {
    put_in_buffer(dest, source, data, length, NULL, 0);
    if (*(OSThread *volatile *)&gCpsState.recvWaiter == NULL) {
        return;
    }
    if (OS_IsThreadTerminated(gCpsState.recvWaiter)) {
        return;
    }
    OS_WakeupThreadDirect(gCpsState.recvWaiter);
}

// Waits for the next frame in the receive ring; returns it (from the destination MAC) and its size.
u8 *receive_packet(u32 *length) {
    OSIntrMode enabled = OS_DisableInterrupts();
    u8 *ring;
    u16 size;
    while (gCpsState.recvTail == gCpsState.recvHead) {
        gCpsState.recvWaiter = OSi_ThreadInfo.current;
        OS_SleepThread(NULL);
        gCpsState.recvWaiter = NULL;
    }
    OS_RestoreInterrupts(enabled);
    ring = gCpsState.recvRing;
    do {
        if (gCpsState.recvRingSize - gCpsState.recvTail < 2) {
            gCpsState.recvTail = 0;
        }
        size = *(u16 *)(ring + gCpsState.recvTail);
        if (!size) {
            gCpsState.recvTail = 0;
        }
    } while (!size);
    *length = size - 2;
    return gCpsState.recvRing + gCpsState.recvTail + 2;
}

// drops the frame receive_packet returned
void throw_packet(void) {
    OSIntrMode enabled = OS_DisableInterrupts();
    gCpsState.recvTail += *(u16 *)(gCpsState.recvRing + gCpsState.recvTail);
    if (gCpsState.recvTail >= gCpsState.recvRingSize) {
        gCpsState.recvTail = 0;
    }
    OS_RestoreInterrupts(enabled);
}
