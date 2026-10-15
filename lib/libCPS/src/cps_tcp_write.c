#include <string.h>

#include "cps/cps_sock_internal.h"

// Writing: TCP data goes out in segments of up to the peer's MSS within its window; the writer waits
// for the acknowledgements and resends what was not acknowledged (there is no retransmission timer
// elsewhere). Datagram and ping sockets send at once.

#pragma force_active on

// Sends up to the window (force: one byte, to probe a zero window); the number of segments sent
// without anything received in between is limited. Returns the size of the last segment.
u32 tcp_write_do(void *data, u32 length, CpsSocket *socket, int force) {
    u32 count;
    u32 limit;
    u32 previous;
    u32 budget;
    u32 current;
    u32 available;
    if (force) {
        limit = 1;
    } else {
        limit = socket->sendWindow;
    }
    previous = socket->recvSegments;
    budget = previous * 2 + 4;
    while (length && socket->state == CPS_STATE_ESTABLISHED) {
        current = socket->recvSegments;
        count = socket->mss;
        if (count >= limit) {
            count = limit;
        }
        if (gCpsState.mss < count) {
            count = gCpsState.mss;
        }
        if (!force) {
            count &= ~1u;
        }
        if (length < count) {
            count = length;
        }
        available = budget + (current - previous);
        previous = current;
        budget = available - 1;
        if (!available) {
            count = 0;
        }
        if (count == 0) {
            break;
        }
        limit -= count;
        send_tcp(data, count, socket, CPS_TCP_PSH | CPS_TCP_ACK, 0);
        OS_YieldThread();
        data = (u8 *)data + count;
        length -= count;
    }
    return count;
}

// two buffers, the second only if the first went out completely
int tcp_write_do2(void *data, u32 length, void *data2, u32 length2, CpsSocket *socket, int force) {
    int n = tcp_write_do(data, length, socket, force);
    if (!n || !length2) {
        return n;
    }
    return tcp_write_do(data2, length2, socket, 0);
}

// Sends both buffers; gives up after 10 s without progress. Returns the bytes acknowledged.
u32 CPSi_TcpWrite2Raw(const u8 *data, u32 length, const u8 *data2, u32 length2, CpsSocket *socket) {
    u32 total = 0, start, sent, wait, done;
    int force = FALSE;
    socket->recvSegments = 0;
    start = (u32)(OS_GetTick() >> 16);
    while (gCpsState.linkIsOn() && length && socket->state == CPS_STATE_ESTABLISHED && (s32)((u32)(OS_GetTick() >> 16) - start) < 159) {
        sent = socket->sendNext;
        tcp_write_do2((void *)data, length, (void *)data2, length2, socket, force);
        // wait up to 1 s for everything to be acknowledged
        wait = (u32)(OS_GetTick() >> 16);
        do {
            OS_YieldThread__();
        } while (gCpsState.linkIsOn() && socket->state == CPS_STATE_ESTABLISHED && socket->sendNext != socket->sendAcked && (s32)((u32)(OS_GetTick() >> 16) - wait) < 15 && (!force || socket->sendWindow == 0));
        done = socket->sendAcked - sent;
        if (done > socket->sendNext - sent) {
            done = 0;
        }
        total += done;
        if (done) {
            start = (u32)(OS_GetTick() >> 16);
        }
        // resend from the first byte not acknowledged
        socket->sendNext = socket->sendAcked;
        if (socket->state == CPS_STATE_ESTABLISHED && socket->sendWindow == 0 && done == 0) {
            if (!force) {
                wait = (u32)(OS_GetTick() >> 16);
                while (gCpsState.linkIsOn() && (s32)((u32)(OS_GetTick() >> 16) - wait) < 15) {
                    OS_YieldThread__();
                    if (socket->sendWindow) {
                        break;
                    }
                }
                if (socket->sendWindow == 0) {
                    force = TRUE;
                }
            }
        } else {
            force = FALSE;
        }
        if (done < length) {
            data += done;
            length -= done;
        } else {
            u32 n = done - length;
            data = data2 + n;
            data2 = NULL;
            length = length2 - n;
            length2 = 0;
        }
    }
    return total;
}

u32 CPSi_SocWrite2(void *data, u32 length, void *data2, u32 length2) {
    CpsSocket *socket = OSi_ThreadInfo.current->specific[0];
    u32 written;
    if (socket) {
        if (socket->state == CPS_STATE_DATAGRAM) {
            if (length) {
                send_udp(data, length, socket);
            }
            if (length2) {
                send_udp(data2, length2, socket);
            }
            written = length + length2;
        } else if (socket->state == CPS_STATE_PING) {
            if (length) {
                send_ping(data, length, socket);
            }
            if (length2) {
                send_ping(data2, length2, socket);
            }
            written = length + length2;
        } else if (socket->sslEnabled) {
            written = CPSi_SslWrite2(data, length, data2, length2, socket);
        } else {
            written = CPSi_TcpWrite2Raw(data, length, data2, length2, socket);
        }
        if (!gCpsState.sendFailed) {
            return written;
        }
    }
    return 0;
}

// Sends the data after what CPS_SocWrite's caller collected in writeBuf; returns the bytes of data sent.
u32 CPS_SocWrite(void *data, u32 length) {
    CpsSocket *socket = OSi_ThreadInfo.current->specific[0];
    u32 n;
    if (socket) {
        n = socket->writeLength;
        if (n) {
            u32 written = CPSi_SocWrite2(socket->writeBuf.data, n, data, length);
            n = socket->writeLength;
            if (written < n) {
                memmove(socket->writeBuf.data, socket->writeBuf.data + written, n - written);
                socket->writeLength -= written;
                return 0;
            }
            socket->writeLength = 0;
            return written - n;
        }
        return CPSi_SocWrite2(data, length, NULL, 0);
    }
    return 0;
}

// bytes received; -1: the connection is closed
int CPS_SocGetLength(void) {
    CpsSocket *socket = OSi_ThreadInfo.current->specific[0];
    u32 n;
    if (socket) {
        if (socket->sslEnabled) {
            return CPSi_SslGetLength(socket);
        }
        n = socket->recvLength;
        if (n || socket->state == CPS_STATE_ESTABLISHED || (u8)(socket->state + 246) <= 1) { // DATAGRAM or PING
            return n;
        }
        return -1;
    }
    return 0;
}

void CPS_SocFlush(void) {
    CpsSocket *socket = OSi_ThreadInfo.current->specific[0];
    if (!socket || !socket->writeLength) {
        return;
    }
    CPSi_SocWrite2(socket->writeBuf.data, socket->writeLength, NULL, 0);
    socket->writeLength = 0;
}
