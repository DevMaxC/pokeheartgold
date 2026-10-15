#include "cps/cps_internal.h"

#pragma force_active on

static inline u16 Swap(u16 value) {
    int x = value;
    int high = x << 8;
    return (x >> 8) | high;
}

static inline u32 Address(u16 *p) {
    return ((u32)Swap(p[0]) << 16) | Swap(p[1]);
}

// Gives a datagram to the first datagram socket bound to its port (and to its sender, if connected).
// A socket learns the sender of its first datagram. A datagram is kept until the owner read the
// previous one; the socket's callback may consume it at once.
void dispatch_udp(CpsIpHeader *ip, CpsUdpHeader *udp, u32 length) {
    OSThread *thread;
    CpsSocket *socket;
    OSIntrMode enabled;
    if (udp->checksum && check_tcpudpsum(udp, length, ip, 17) != 0) {
        return;
    }
    enabled = OS_DisableInterrupts();
    for (thread = OSi_ThreadInfo.list; thread; thread = thread->next) {
        socket = thread->specific[0];
        if (socket && socket->thread) {
            if (socket->state == CPS_STATE_DATAGRAM && socket->localPort == Swap(udp->destPort)) {
                if (socket->remotePort && socket->remotePort != Swap(udp->sourcePort)) {
                    continue;
                }
                if (socket->remoteIp && socket->remoteIp != ~0U && socket->remoteIp != Address(ip->source)) {
                    continue;
                }
                socket->localIp = Address(ip->dest);
                if (socket->remoteIp == 0) {
                    socket->remoteIp = Address(ip->source);
                    socket->remotePort = Swap(udp->sourcePort);
                }
                if (socket->recvLength == 0) {
                    if (length - 8 > socket->recvBuf.size) {
                        socket->recvLength = socket->recvBuf.size;
                    } else {
                        socket->recvLength = length - 8;
                    }
                    MI_CpuCopy8(udp + 1, socket->recvBuf.data, socket->recvLength);
                    if (socket->waiting == CPS_WAIT_DATAGRAM) {
                        socket->waiting = 0;
                        OS_WakeupThreadDirect(socket->thread);
                    } else if (socket->udpCallback && socket->udpCallback(socket->recvBuf.data, socket->recvLength, socket) != 0) {
                        socket->recvLength = 0;
                    }
                }
                break;
            }
        }
    }
    OS_RestoreInterrupts(enabled);
}
