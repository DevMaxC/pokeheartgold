#include "cps/cps_internal.h"

// Receiving TCP: the segment is matched to a socket (by the thread walk) and drives its state machine.
// There is no retransmission queue: the socket owner resends (see the socket functions).

#pragma force_active on

static inline u16 Swap(int value) {
    return (value >> 8) | (value << 8);
}

static inline OSThread *ThreadList(void) {
    return OSi_ThreadInfo.list;
}

// a listening socket for the segment's destination port (and source, if it was bound to one)
CpsSocket *check_listener(CpsIpHeader *ip, CpsTcpHeader *tcp) {
    CpsSocket *socket;
    OSThread *thread = ThreadList();
    while (thread) {
        socket = thread->specific[0];
        if (socket && socket->thread && socket->state == CPS_STATE_LISTEN && socket->localPort == Swap(tcp->destPort)) {
            if (socket->remotePort == 0 || socket->remotePort == Swap(tcp->sourcePort)) {
                if (socket->remoteIp == 0 || socket->remoteIp == (((u32)Swap(ip->source[0]) << 16) | Swap(ip->source[1]))) {
                    return socket;
                }
            }
        }
        thread = thread->next;
    }
    return NULL;
}

// the socket is the connection of the segment
int check_socket(CpsIpHeader *ip, CpsTcpHeader *tcp, CpsSocket *socket) {
    int result = FALSE, valid = FALSE, remote = FALSE, port = FALSE;
    if (socket->state != CPS_STATE_DATAGRAM && socket->state != CPS_STATE_PING) {
        valid = TRUE;
    }
    if (valid) {
        if (socket->localPort == Swap(tcp->destPort)) {
            port = TRUE;
        }
    }
    if (port) {
        if (socket->remotePort == Swap(tcp->sourcePort)) {
            remote = TRUE;
        }
    }
    if (remote) {
        if (socket->remoteIp == (((u32)Swap(ip->source[0]) << 16) | Swap(ip->source[1]))) {
            result = TRUE;
        }
    }
    return result;
}

CpsSocket *find_socket(CpsIpHeader *ip, CpsTcpHeader *tcp) {
    CpsSocket *socket;
    OSThread *thread = ThreadList();
    while (thread) {
        socket = thread->specific[0];
        if (socket && socket->thread) {
            if (check_socket(ip, tcp, socket)) {
                return socket;
            }
        }
        thread = thread->next;
    }
    return NULL;
}

// MSS option of a SYN (default 536)
void parse_mss(CpsTcpHeader *tcp, CpsSocket *socket) {
    int length;
    u8 *p;
    socket->mss = 536;
    p = tcp->options;
    length = (tcp->dataOffset & 0xF0) / 4 - 20;
    if (length--) {
        do {
            int option = *p++;
            switch (option) {
            case 0: // end
                return;
            case 1: // no operation
                break;
            case 2:
                socket->mss = (p[1] << 8) | p[2];
                p += 3;
                length -= 3;
                break;
            default: {
                int count = *p - 1;
                length -= count;
                p += count;
                break;
            }
            }
        } while (length--);
    }
}

// the next hop's MAC address is known (or there is no next hop)
int no_need_inq(u32 ip) {
    ip = get_targetip(ip);
    if (ip == 0) {
        return TRUE;
    }
    return (int)inq_arpcache(ip);
}

// The tcpip thread must not wait for an ARP answer: it only asks, and the segment is lost.
void tcp_send_handshake(CpsSocket *socket, int flags, int arg) {
    if (no_need_inq(socket->remoteIp) || OSi_ThreadInfo.current != &gCpsTcpipThread) {
        send_tcp(NULL, 0, socket, flags, arg);
    } else {
        send_arprequest(get_targetip(socket->remoteIp));
    }
}

void tcp_send_ack(CpsSocket *socket, int arg) {
    tcp_send_handshake(socket, CPS_TCP_ACK, arg);
}

void tcp_send_finack(CpsSocket *socket, int arg) {
    tcp_send_handshake(socket, CPS_TCP_FIN | CPS_TCP_ACK, arg);
}

// Resets the connection of a segment that matches no socket, through gCpsRstSocket. (Its state is
// CLOSED, so send_tcp drops the reset.) Some fields are written through neighbouring labels:
// _021D4720 + 0x4E = gCpsRstSocket.localPort, + 0x5C = .remotePort; gCpsState + 0x160 = .remoteIp.
void tcp_send_rst(CpsIpHeader *ip, CpsTcpHeader *tcp, u32 length, int arg) {
    CpsSocket *socket = &gCpsRstSocket;
    MI_CpuFill8(socket, 0, sizeof(CpsSocket));
    _021D4720[0x27] = CpsSwap16(tcp->destPort);
    _021D4720[0x2E] = CpsSwap16(tcp->sourcePort);
    ((u32 *)&gCpsState)[0x58] = CpsRead32(ip->source);
    if (tcp->flags & CPS_TCP_ACK) {
        socket->sendNext = CpsRead32(tcp->ack);
        tcp_send_handshake(socket, CPS_TCP_RST, arg);
        return;
    }
    socket->sendNext = 0;
    socket->recvNext = length + CpsRead32(tcp->seq);
    if (tcp->flags & (CPS_TCP_SYN | CPS_TCP_FIN)) {
        socket->recvNext++;
    }
    tcp_send_handshake(socket, CPS_TCP_RST | CPS_TCP_ACK, arg);
}

// SYN for a listening socket: answer with SYN+ACK
void dt_syn_LISTEN(CpsIpHeader *ip, CpsTcpHeader *tcp, CpsSocket *socket) {
    socket->state = CPS_STATE_SYN_RCVD;
    socket->tick = OS_GetTick() >> 16;
    socket->localIp = CpsRead32(ip->dest);
    socket->remotePort = CpsSwap16(tcp->sourcePort);
    socket->remoteIp = CpsRead32(ip->source);
    socket->recvNext = CpsRead32(tcp->seq) + 1;
    parse_mss(tcp, socket);
    tcp_send_handshake(socket, CPS_TCP_SYN | CPS_TCP_ACK, 0);
}

// SYN for an existing connection: a repeated SYN is answered again, anything else is reset
int find_specific_socket(CpsIpHeader *ip, CpsTcpHeader *tcp, u32 length) {
    CpsSocket *socket = find_socket(ip, tcp);
    if (socket) {
        if (socket->state == CPS_STATE_LISTEN) {
            dt_syn_LISTEN(ip, tcp, socket);
        } else if ((u8)(socket->state + 253) <= 1) { // SYN_RCVD or ESTABLISHED
            socket->sendNext--;
            dt_syn_LISTEN(ip, tcp, socket);
        } else {
            tcp_send_rst(ip, tcp, length, 0);
        }
        return TRUE;
    }
    return FALSE;
}

void dt_syn(CpsIpHeader *ip, CpsTcpHeader *tcp, u32 length) {
    CpsSocket *socket;
    if (!valid_IP(CpsRead32(ip->source), CpsRead32(ip->dest))) {
        return;
    }
    if (find_specific_socket(ip, tcp, length)) {
        return;
    }
    socket = check_listener(ip, tcp);
    if (socket) {
        dt_syn_LISTEN(ip, tcp, socket);
        return;
    }
    // the listener may be about to call CPS_TcpListen
    OS_YieldThread();
    socket = check_listener(ip, tcp);
    if (socket) {
        dt_syn_LISTEN(ip, tcp, socket);
    }
}

// SYN+ACK: our connect succeeded
void dt_synack(CpsIpHeader *ip, CpsTcpHeader *tcp, u32 length) {
    CpsSocket *socket = find_socket(ip, tcp);
    if (!socket || socket->state != CPS_STATE_SYN_SENT) {
        tcp_send_rst(ip, tcp, length, 0);
        return;
    }
    OS_YieldThread();
    socket->recvNext = CpsRead32(tcp->seq) + 1;
    socket->sendAcked = CpsRead32(tcp->ack);
    socket->sendWindow = CpsSwap16(tcp->window);
    parse_mss(tcp, socket);
    tcp_send_ack(socket, 0);
    socket->state = CPS_STATE_ESTABLISHED;
    if (socket->waiting != CPS_WAIT_CONNECT) {
        return;
    }
    socket->waiting = 0;
    OS_WakeupThreadDirect(socket->thread);
}

// ACK (with data and / or FIN)
void dt_ack(CpsIpHeader *ip, CpsTcpHeader *tcp, u32 length) {
    CpsSocket *socket = find_socket(ip, tcp);
    u32 ack, seq;
    u8 flags;
    int complete;
    if (!socket) {
        tcp_send_rst(ip, tcp, length, 0);
        return;
    }
    ack = (u32)CpsSwap16(tcp->ack[0]) << 16 | CpsSwap16(tcp->ack[1]);
    flags = tcp->flags;
    if ((s32)(ack - socket->sendAcked) > 0) {
        socket->sendAcked = ack;
    }
    seq = (u32)CpsSwap16(tcp->seq[0]) << 16 | CpsSwap16(tcp->seq[1]);
    if (socket->state == CPS_STATE_ESTABLISHED && socket->recvNext != seq) {
        // out of order: acknowledge what we have
        tcp_send_ack(socket, 0);
        return;
    }
    socket->sendWindow = CpsSwap16(tcp->window);
    switch (socket->state) {
    case CPS_STATE_CLOSED:
    case CPS_STATE_SYN_SENT:
        tcp_send_rst(ip, tcp, length, 0);
        break;
    case CPS_STATE_SYN_RCVD:
        socket->state = CPS_STATE_ESTABLISHED;
        if (socket->waiting == CPS_WAIT_CONNECT) {
            socket->waiting = 0;
            OS_WakeupThreadDirect(socket->thread);
        }
        if (!length) {
            break;
        }
    case CPS_STATE_ESTABLISHED:
        socket->recvSegments++;
        {
            u32 room = socket->recvBuf.size - socket->recvLength;
            if (length > room) {
                complete = FALSE;
                length = room;
            } else {
                complete = TRUE;
            }
        }
        if (length) {
            OSIntrMode enabled = OS_DisableInterrupts();
            MI_CpuCopy8((u8 *)tcp + (int)(tcp->dataOffset & 0xF0) / 4, socket->recvBuf.data + socket->recvLength, length);
            socket->recvLength += length;
            socket->recvNext += length;
            OS_RestoreInterrupts(enabled);
            if (socket->waiting == CPS_WAIT_DATA) {
                socket->waiting = 0;
                OS_WakeupThreadDirect(socket->thread);
            }
        }
        if (complete && (flags & CPS_TCP_FIN)) {
            socket->state = CPS_STATE_CLOSE_WAIT;
            socket->recvNext++;
            tcp_send_finack(socket, 0);
            if (length == 0 && socket->waiting == CPS_WAIT_DATA) {
                socket->waiting = 0;
                OS_WakeupThreadDirect(socket->thread);
            }
        } else if (length) {
            tcp_send_ack(socket, 0);
        }
        break;
    case CPS_STATE_FIN_WAIT_1:
    case CPS_STATE_FIN_WAIT_2:
        if (flags & CPS_TCP_FIN) {
            socket->recvNext += length + 1;
            tcp_send_ack(socket, 0);
            socket->state = CPS_STATE_CLOSED;
            if (socket->waiting == CPS_WAIT_DATA) {
                socket->waiting = 0;
                OS_WakeupThreadDirect(socket->thread);
            }
        } else {
            if (length) {
                socket->recvNext += length;
                tcp_send_ack(socket, 0);
            }
            socket->state = CPS_STATE_FIN_WAIT_2;
        }
        break;
    case CPS_STATE_CLOSE_WAIT:
    case CPS_STATE_LAST_ACK:
        socket->state = CPS_STATE_CLOSED;
        if (socket->waiting == CPS_WAIT_DATA) {
            socket->waiting = 0;
            OS_WakeupThreadDirect(socket->thread);
        }
        break;
    default:
        if (flags & CPS_TCP_FIN) {
            socket->recvNext++;
        }
        tcp_send_ack(socket, 0);
        break;
    }
    OS_YieldThread();
}

// FIN without ACK
void dt_fin(CpsIpHeader *ip, CpsTcpHeader *tcp, u32 length) {
    CpsSocket *socket = find_socket(ip, tcp);
    if (!socket) {
        return;
    }
    switch (socket->state) {
    case CPS_STATE_FIN_WAIT_1:
        socket->recvNext++;
        tcp_send_ack(socket, 0);
        socket->state = CPS_STATE_LAST_ACK;
        return;
    case CPS_STATE_FIN_WAIT_2:
        socket->recvNext++;
        tcp_send_ack(socket, 0);
        socket->state = CPS_STATE_CLOSED;
        if (socket->waiting != CPS_WAIT_DATA) {
            return;
        }
        socket->waiting = 0;
        OS_WakeupThreadDirect(socket->thread);
        return;
    case CPS_STATE_ESTABLISHED:
        socket->recvNext++;
        tcp_send_finack(socket, 0);
        socket->state = CPS_STATE_CLOSE_WAIT;
        return;
    }
    tcp_send_rst(ip, tcp, length, 0);
}

void dt_rst(CpsIpHeader *ip, CpsTcpHeader *tcp) {
    CpsSocket *socket = find_socket(ip, tcp);
    if (!socket) {
        return;
    }
    OS_YieldThread();
    socket->state = CPS_STATE_CLOSED;
    if (socket->waiting - 1 > 1) { // neither CPS_WAIT_CONNECT nor CPS_WAIT_DATA
        return;
    }
    socket->waiting = 0;
    OS_WakeupThreadDirect(socket->thread);
}

void dispatch_tcp(CpsIpHeader *ip, CpsTcpHeader *tcp, u32 length) {
    int flags;
    if (check_tcpudpsum(tcp, length, ip, 6)) {
        return;
    }
    length -= (tcp->dataOffset & 0xF0) / 4;
    flags = tcp->flags;
    switch (flags & (CPS_TCP_FIN | CPS_TCP_SYN | CPS_TCP_RST | CPS_TCP_ACK)) {
    case CPS_TCP_SYN:
        if (flags & 0x28) { // PSH or URG
            return;
        }
        dt_syn(ip, tcp, length);
        return;
    case CPS_TCP_SYN | CPS_TCP_ACK:
        if (flags & 0x28) {
            return;
        }
        dt_synack(ip, tcp, length);
        return;
    case CPS_TCP_ACK:
    case CPS_TCP_FIN | CPS_TCP_ACK:
        dt_ack(ip, tcp, length);
        return;
    case CPS_TCP_FIN:
        dt_fin(ip, tcp, length);
        return;
    }
    if (flags & CPS_TCP_RST) {
        dt_rst(ip, tcp);
    } else {
        tcp_send_rst(ip, tcp, length, 0);
    }
}
