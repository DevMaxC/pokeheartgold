#include "cps/cps_internal.h"

// Receiving ARP and ICMP: ARP requests for our address are answered and senders are cached; echo
// requests are answered, echo replies go to the pinging socket.

#pragma force_active on

// turns the request into the reply, in place
void reply_arp(CpsArpPacket *arp) {
    u8 *p = (u8 *)arp;
    arp->operation = 0x200;
    MI_CpuCopy8(arp->senderMac, arp->targetMac, 10);
    MI_CpuCopy8(gCpsMacAddress, arp->senderMac, 6);
    arp->senderIp[0] = CpsSwap16((u16)(gCpsState.hostIp >> 16));
    arp->senderIp[1] = CpsSwap16((u16)gCpsState.hostIp);
    MI_CpuCopy8(arp->targetMac, p - 14, 6);
    MI_CpuCopy8(gCpsMacAddress, p - 8, 6);
    send_packet(p - 14, 42, NULL, 0);
}

static inline u32 ReadIp(const u16 *p) {
    u32 low = CpsSwap16(p[1]), high = CpsSwap16(p[0]);
    return (high << 16) | low;
}

void dispatch_arp(CpsArpPacket *arp, u32 length) {
    u16 operation;
    u32 sender, target;
    int fromUs, forUs;
    if (length < 28) {
        return;
    }
    if (maccmp((u16 *)arp->senderMac, (u16 *)gCpsMacAddress) == 0 || ((volatile CpsState *)&gCpsState)->hostIp == 0) {
        return;
    }
    if (arp->hardware != 0x100 || arp->protocol != 8 || arp->sizes != 0x406) {
        return;
    }
    operation = CpsSwap16(arp->operation);
    if (operation != 1 && operation != 2) {
        return;
    }
    sender = ReadIp(arp->senderIp);
    target = ReadIp(arp->targetIp);
    fromUs = sender == gCpsState.hostIp;
    forUs = gCpsState.hostIp == target;
    if (!fromUs) {
        reg_arpcache(arp->senderMac, sender, forUs);
    }
    if (operation == 1 && forUs) {
        reply_arp(arp);
        return;
    }
    if (operation == 2 && forUs && fromUs) {
        gCpsState.addressConflict = 1;
    }
}

// answers an echo request (in place) once the sender's MAC address is known
void reply_icmp(CpsIpHeader *ip, CpsIcmpHeader *icmp, u32 length) {
    u32 target = get_targetip(ReadIp(ip->source));
    int checksum;
    if (!target) {
        return;
    }
    if (!inq_arpcache(target)) {
        send_arprequest(target);
        return;
    }
    icmp->type = 0;
    icmp->checksum = 0;
    checksum = calc_checksum(icmp, length);
    icmp->checksum = (checksum >> 8) | (checksum << 8);
    send_ip((u8 *)icmp, length, NULL, 0, ReadIp(ip->source), 1);
}

static inline void SetReplyLength(u32 length, CpsSocket *socket) {
    if (length > socket->recvBuf.size) {
        *(volatile s32 *)&socket->recvLength = socket->recvBuf.size;
    } else {
        *(volatile s32 *)&socket->recvLength = length;
    }
}

// gives an echo reply to the socket that sent the request (identifier = its thread)
void process_icmp_reply(CpsIpHeader *ip, CpsIcmpHeader *icmp, u32 length) {
    CpsSocket *socket;
    OSIntrMode enabled = OS_DisableInterrupts();
    OSThread *thread = OSi_ThreadInfo.list;
    while (thread) {
        socket = thread->specific[0];
        if (socket && socket->thread && socket->state == CPS_STATE_PING && icmp->id == (u16)(u32)socket->thread && socket->localPort == icmp->sequence && *(volatile s32 *)&socket->recvLength == 0 && socket->remoteIp == ReadIp(ip->source)) {
            SetReplyLength(length - 8, socket);
            MI_CpuCopy8((u8 *)icmp + 8, socket->recvBuf.data, *(volatile s32 *)&socket->recvLength);
            if (socket->waiting == CPS_WAIT_DATAGRAM) {
                socket->waiting = 0;
                OS_WakeupThreadDirect(socket->thread);
            }
            break;
        }
        thread = thread->next;
    }
    OS_RestoreInterrupts(enabled);
}

int valid_IP(u32 source, u32 dest) {
    return source != 0 && source != ~0u && dest != 0 && dest != ~0u;
}

void dispatch_icmp(CpsIpHeader *ip, CpsIcmpHeader *icmp, u32 length) {
    if (calc_checksum(icmp, length) != 0xFFFF) {
        return;
    }
    if (!valid_IP(CpsRead32(ip->source), CpsRead32(ip->dest))) {
        return;
    }
    switch (icmp->type) {
    case 0:
        process_icmp_reply(ip, icmp, length);
        break;
    case 8:
        reply_icmp(ip, icmp, length);
        break;
    }
}
