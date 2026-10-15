#include "cps/cps_internal.h"

// Sending: Ethernet (ARP resolution of the next hop) and IP (fragmentation; datagrams to ourselves go
// straight into the receive ring). A packet is built in front of its payload: each layer writes its
// header just below the data pointer it gets.

#pragma force_active on

void send_ether(u8 *packet, int length, void *extra, int extraLength, u32 ip, u16 type) {
    u8 *mac;
    *(u16 *)(packet - 2) = CpsSwap16(type);
    if (!is_multicast(ip)) {
        ip = get_targetip(ip);
        if (!ip) {
            return;
        }
        mac = inq_arpcache(ip);
        if (!mac) {
            mac = arprequest(ip);
        }
        if (!mac) {
            return;
        }
        MI_CpuCopy8(mac, packet - 14, 6);
    } else {
        // 01:00:5E + the low 23 bits of the group address
        packet[-14] = 1;
        packet[-13] = 0;
        packet[-12] = 0x5E;
        packet[-11] = (ip >> 16) & 0x7F;
        packet[-10] = ip >> 8;
        packet[-9] = ip;
    }
    MI_CpuCopy8(gCpsMacAddress, packet - 8, 6);
    send_packet(packet - 14, length + 14, extra, extraLength);
}

// data: end of the IP header built by send_ip (length bytes of it, then extraLength bytes at extra)
void send_ip_frag(u8 *data, int length, void *extra, int extraLength, u32 ip, u32 fragment) {
    u16 total;
    u16 fragmentField;
    int checksum;
    OSIntrMode enabled;
    total = length + 20 + extraLength;
    fragmentField = fragment;
    *(u16 *)(data - 18) = (total >> 8) | (total << 8);
    *(u16 *)(data - 14) = (fragmentField >> 8) | (fragmentField << 8);
    *(u16 *)(data - 10) = 0;
    checksum = calc_checksum(data - 20, 20);
    *(u16 *)(data - 10) = (checksum >> 8) | (checksum << 8);
    if (ip != CPS_LOOPBACK && ip != gCpsState.hostIp) {
        send_ether(data - 20, length + 20, extra, extraLength, ip, 0x800);
    }
    if (ip != CPS_LOOPBACK && ip != gCpsState.hostIp && !is_multicast(ip)) {
        return;
    }
    // to ourselves (or a group we are in): loop back through the receive ring
    MI_CpuCopy8(gCpsLlcSnapHeader, data - 28, 8);
    enabled = OS_DisableInterrupts();
    put_in_buffer(gCpsMacAddress, gCpsMacAddress, data - 28, length + 28, extra, extraLength);
    OS_RestoreInterrupts(enabled);
}

// Sends length bytes at data (the transport header) and extraLength bytes at extra, in fragments of
// up to 1480 bytes.
void send_ip(u8 *data, u32 length, u8 *extra, u32 extraLength, u32 ip, u8 protocol) {
    u16 offset = 0;
    u8 *p;
    u32 chunk;
    data[-20] = 0x45;
    data[-19] = 0;
    gCpsState.ipId++;
    *(u16 *)(data - 16) = CpsSwap16(gCpsState.ipId);
    data[-12] = 128;
    data[-11] = protocol;
    *(u16 *)(data - 8) = CpsSwap16((u16)(gCpsState.hostIp >> 16));
    *(u16 *)(data - 6) = CpsSwap16((u16)gCpsState.hostIp);
    *(u16 *)(data - 4) = CpsSwap16((u16)(ip >> 16));
    *(u16 *)(data - 2) = CpsSwap16((u16)ip);
    if (length > 1480) {
        p = data;
        while (length > 1480) {
            send_ip_frag(data, 0, p, 1480, ip, offset | 0x2000);
            p += 1480;
            length -= 1480;
            offset += 185;
        }
        if (length) {
            if (extraLength) {
                send_ip_frag(data, 0, p, length, ip, offset | 0x2000);
            } else {
                send_ip_frag(data, 0, p, length, ip, offset);
            }
            offset += length >> 3;
            length = 0;
        }
    }
    while (length + extraLength > 1480) {
        chunk = 1480 - length;
        send_ip_frag(data, length, extra, chunk, ip, offset | 0x2000);
        length = 0;
        extra += chunk;
        extraLength -= chunk;
        offset += 185;
    }
    if (length + extraLength) {
        send_ip_frag(data, length, extra, extraLength, ip, offset);
    }
}
