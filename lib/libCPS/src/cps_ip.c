#include "cps/cps_internal.h"

// IP receive and the tcpip thread.

#pragma force_active on

static inline u16 Swap(u16 x) {
    int a = x;
    int high = a << 8;
    return (a >> 8) | high;
}

static inline u32 Address(u16 *p) {
    return ((u32)Swap(p[0]) << 16) | Swap(p[1]);
}

// Checks a datagram for us (our address, broadcast, multicast; loopback skips the checks),
// reassembles it and hands it to UDP, or (once we have an address) to ICMP / TCP.
void dispatch_ip(CpsIpHeader *ip, u32 length) {
    int allocated;
    u32 source = Address(ip->source), dest = Address(ip->dest);
    if (dest != source) {
        if (ip_isme(dest) == 0) {
            return;
        }
        if (length < Swap(ip->totalLength)) {
            return;
        }
        if (calc_checksum(ip, (ip->versionAndLength & 15) * 4) != 0xFFFF) {
            return;
        }
        if (gCpsState.hostIp == Address(ip->dest)) {
            // learn the sender's MAC address (the frame's source address is 8 bytes before)
            reg_arpcache((u8 *)ip - 8, Address(ip->source), TRUE);
        }
    }
    ip = check_frag(ip, &allocated);
    if (ip == NULL) {
        return;
    }
    {
        u32 header = (ip->versionAndLength & 15) * 4;
        void *payload = (u8 *)ip + header;
        u32 amount = Swap(ip->totalLength) - header;
        if (ip->protocol == 17) {
            dispatch_udp(ip, payload, amount);
        } else if (gCpsState.hostIp) {
            if (ip->protocol == 1) {
                dispatch_icmp(ip, payload, amount);
            } else if (ip->protocol == 6) {
                dispatch_tcp(ip, payload, amount);
            }
        }
    }
    if (allocated) {
        gCpsState.free((u8 *)ip - 14);
    }
}

// thread: dispatches the received frames
void tcpip(void *arg) {
    u32 length;
    for (;;) {
        u8 *frame = receive_packet(&length);
        if (length > 34) {
            switch (CpsSwap16(*(u16 *)(frame + 12))) {
            case 0x800:
                dispatch_ip((CpsIpHeader *)(frame + 14), length - 14);
                break;
            case 0x806:
                dispatch_arp((CpsArpPacket *)(frame + 14), length - 14);
                break;
            }
        }
        throw_packet();
    }
}
