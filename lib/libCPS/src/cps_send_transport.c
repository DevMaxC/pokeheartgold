#include "cps/cps_internal.h"

// Sending UDP datagrams and TCP segments.

#pragma force_active on

// UDP pseudo header, built over the end of the IP header
typedef struct CpsPseudoHeader {
    u16 sourceHigh, sourceLow;
    u16 destHigh, destLow;
    u16 protocol;
    u16 length;
} CpsPseudoHeader;

#pragma push
#pragma opt_common_subs off

void send_udp(const void *data, int length, CpsSocket *socket) {
    CpsUdpHeader *udp = (CpsUdpHeader *)(socket->sendBuf.data + 0x22);
    u32 checksum;
    volatile u32 *remoteIp = &socket->remoteIp;
    ((CpsPseudoHeader *)((u8 *)udp - 12))->sourceHigh = CpsSwap16((u16)(((volatile u32 *)&gCpsState)[0x50 / 4] >> 16));
    ((CpsPseudoHeader *)((u8 *)udp - 12))->sourceLow = CpsSwap16((u16)((volatile u32 *)&gCpsState)[0x50 / 4]);
    ((CpsPseudoHeader *)((u8 *)udp - 12))->destHigh = CpsSwap16((u16)(*remoteIp >> 16));
    ((CpsPseudoHeader *)((u8 *)udp - 12))->destLow = CpsSwap16((u16)*remoteIp);
    ((CpsPseudoHeader *)((u8 *)udp - 12))->protocol = 0x1100;
    udp->length = CpsSwap16((u16)(length + 8));
    ((CpsPseudoHeader *)((u8 *)udp - 12))->length = udp->length;
    udp->destPort = CpsSwap16(socket->remotePort);
    udp->sourcePort = CpsSwap16(socket->localPort);
    udp->checksum = 0;
    checksum = calc_checksum_do((u8 *)udp - 12, 20, 0);
    checksum = calc_checksum_do(data, length, checksum);
    udp->checksum = CpsSwap16(invert_checksum((u16)checksum));
    send_ip((u8 *)udp, 8, (u8 *)data, length, *remoteIp, 17);
}

#pragma pop

// Sends a segment with the socket's sequence / acknowledgement numbers. The tcpip thread builds its
// segments (ACK, RST) in its own buffer; flags & CPS_TCP_SYN adds the MSS option.
#define SWAP16(x) (((u16)(x) >> 8) | ((u16)(x) << 8))

void send_tcp(void *data, u32 length, CpsSocket *socket, int flags, int arg) {
    u8 *out;
    u32 header;
    u32 sum;
    if (socket->state == CPS_STATE_CLOSED) {
        return;
    }
    if (OSi_ThreadInfo.current == &gCpsTcpipThread) {
        out = gCpsTcpSendHeader;
    } else {
        out = socket->sendBuf.data + 34;
    }
    header = (flags & CPS_TCP_SYN) ? 24 : 20;
    // pseudo header
    *(u16 *)(out - 12) = SWAP16(gCpsState.hostIp >> 16);
    *(u16 *)(out - 10) = SWAP16(gCpsState.hostIp);
    *(u16 *)(out - 8) = SWAP16(socket->remoteIp >> 16);
    *(u16 *)(out - 6) = SWAP16(socket->remoteIp);
    *(u16 *)(out - 4) = 0x600;
    *(u16 *)(out - 2) = SWAP16(header + length);
    // TCP header
    *(u16 *)(out + 0) = SWAP16(socket->localPort);
    *(u16 *)(out + 2) = SWAP16(socket->remotePort);
    *(u16 *)(out + 4) = SWAP16(socket->sendNext >> 16);
    *(u16 *)(out + 6) = SWAP16(socket->sendNext);
    *(u16 *)(out + 8) = SWAP16(socket->recvNext >> 16);
    *(u16 *)(out + 10) = SWAP16(socket->recvNext);
    out[12] = (header / 4) << 4;
    out[13] = flags;
    *(u16 *)(out + 14) = SWAP16(socket->recvBuf.size - socket->recvLength);
    *(u16 *)(out + 16) = 0;
    *(u16 *)(out + 18) = 0;
    if (flags & CPS_TCP_SYN) {
        // option 2 (MSS), length 4
        *(u16 *)(out + 20) = SWAP16((gCpsState.mss + 0x2040000U) >> 16);
        *(u16 *)(out + 22) = SWAP16(gCpsState.mss + 0x2040000U);
    }
    sum = calc_checksum_do(out - 12, header + 12, 0);
    sum = calc_checksum_do(data, length, sum);
    {
        int checksum = invert_checksum((u16)sum);
        *(u16 *)(out + 16) = (checksum >> 8) | (checksum << 8);
    }
    send_ip(out, header, data, length, socket->remoteIp, 6);
    socket->sendNext += length;
    if (flags & (CPS_TCP_SYN | CPS_TCP_FIN)) {
        socket->sendNext++;
    }
}
