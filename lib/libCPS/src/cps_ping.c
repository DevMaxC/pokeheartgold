#define CPS_STATE_CONST
#include "cps/cps_internal.h"

#pragma force_active on

// ICMP echo request; the identifier is the sending thread, the sequence number goes into localPort
void send_ping(u8 *data, u32 length, CpsSocket *socket) {
    u32 sum;
    u8 *packet;
    int checksum;
    u16 seq;
    packet = socket->sendBuf.data;
    *(u16 *)(packet + 0x22) = 8;
    *(u16 *)(packet + 0x26) = (u32)OS_GetCurrentThread();
    *(u16 *)(packet + 0x24) = 0;
    seq = gCpsState.pingSeq;
    socket->localPort = seq;
    ((CpsState *)&gCpsState)->pingSeq = seq + 1;
    *(u16 *)(packet + 0x28) = seq;
    sum = calc_checksum_do(packet + 0x22, 8, 0);
    sum = calc_checksum_do(data, length, sum);
    checksum = invert_checksum((u16)sum);
    *(u16 *)(packet + 0x24) = (checksum >> 8) | (checksum << 8);
    send_ip(packet + 0x22, 8, data, length, socket->remoteIp, 1);
}
