#include <string.h>

#include "cps/cps_sock_internal.h"

// The socket API: every call works on the calling thread's socket (CPS_SocRegister). TCP connect,
// listen, read, consume and close; SSL sockets go through the SSL layer.

#pragma force_active on

// next free local port (1024 .. 4999)
u16 CPS_SocGetEport(void) {
    BOOL used;
    do {
        OSThread *thread;
        gCpsState.ephemeralPort++;
        used = FALSE;
        if (gCpsState.ephemeralPort < 1024 || gCpsState.ephemeralPort >= 5000) {
            gCpsState.ephemeralPort = 1024;
        }
        for (thread = OSi_ThreadInfo.list; thread; thread = thread->next) {
            CpsSocket *socket = thread->specific[0];
            if (socket && socket->thread && socket->localPort == gCpsState.ephemeralPort) {
                used = TRUE;
                break;
            }
        }
    } while (used);
    return gCpsState.ephemeralPort;
}

// initial sequence number
u32 get_seqno(void) {
    gCpsState.random = gCpsState.randomMul * gCpsState.random + gCpsState.randomAdd;
    return gCpsState.random >> 32;
}

void CPS_SocRegister(CpsSocket *socket) {
    OSi_ThreadInfo.current->specific[0] = socket;
}

void CPS_SocUnRegister(void) {
    OSi_ThreadInfo.current->specific[0] = NULL;
}

void CPS_SocDatagramMode(void) {
    CpsSocket *socket = OSi_ThreadInfo.current->specific[0];
    if (!socket) {
        return;
    }
    socket->state = CPS_STATE_DATAGRAM;
    socket->recvLength = 0;
}

// remotePort / remoteIp 0: any; localPort 0: an ephemeral port
void CPS_SocBind(u16 localPort, u16 remotePort, u32 remoteIp) {
    CpsSocket *socket = OSi_ThreadInfo.current->specific[0];
    if (!socket) {
        return;
    }
    if (remoteIp == CPS_LOOPBACK) {
        remoteIp = gCpsState.hostIp;
    }
    socket->boundRemotePort = remotePort;
    socket->remotePort = socket->boundRemotePort;
    socket->boundRemoteIp = remoteIp;
    socket->remoteIp = remoteIp;
    if (localPort) {
        socket->localPort = localPort;
    } else {
        socket->localPort = CPS_SocGetEport();
    }
}

void CPS_SocUse(void) {
    OSThread *thread = OSi_ThreadInfo.current;
    CpsSocket *socket = thread->specific[0];
    if (!socket) {
        return;
    }
    socket->thread = thread;
    socket->state = CPS_STATE_CLOSED;
    socket->recvLength = 0;
    socket->writeLength = 0;
    socket->udpCallback = NULL;
}

void CPS_SocRelease(void) {
    CpsSocket *socket = OSi_ThreadInfo.current->specific[0];
    if (socket) {
        socket->thread = NULL;
    }
}

// lets another thread use the caller's socket
void CPS_SocDup(OSThread *thread) {
    thread->specific[0] = OSi_ThreadInfo.current->specific[0];
}

// waits for a connection
void CPSi_TcpListenRaw(CpsSocket *socket) {
    OSIntrMode enabled;
    socket->sendNext = get_seqno();
    socket->sendAcked = socket->sendNext;
    socket->state = CPS_STATE_LISTEN;
    enabled = OS_DisableInterrupts();
    socket->waiting = CPS_WAIT_CONNECT;
    OS_SleepThread(NULL);
    OS_RestoreInterrupts(enabled);
}

void CPS_SetUdpCallback(void *callback) {
    CpsSocket *socket = OSi_ThreadInfo.current->specific[0];
    if (socket) {
        socket->udpCallback = callback;
    }
}

void CPS_TcpListen(void) {
    CpsSocket *socket = OSi_ThreadInfo.current->specific[0];
    if (!socket) {
        return;
    }
    if (socket->sslEnabled) {
        CPSi_SslListen(socket);
    } else {
        CPSi_TcpListenRaw(socket);
    }
}

// sends SYN up to 3 times (the scavenger wakes us after 4 s without answer); 0: connected
int CPSi_TcpConnectRaw(CpsSocket *socket) {
    u32 attempt;
    u32 seq = get_seqno();
    attempt = 0;
    do {
        OSIntrMode enabled;
        socket->sendNext = seq;
        socket->state = CPS_STATE_SYN_SENT;
        socket->tick = OS_GetTick() >> 16;
        tcp_send_handshake(socket, CPS_TCP_SYN, 24);
        enabled = OS_DisableInterrupts();
        if (socket->state == CPS_STATE_SYN_SENT && gCpsState.hostIp) {
            socket->waiting = CPS_WAIT_CONNECT;
            OS_SleepThread(NULL);
        }
        OS_RestoreInterrupts(enabled);
        if (socket->state == CPS_STATE_ESTABLISHED) {
            return 0;
        }
        if (!gCpsState.hostIp) {
            break;
        }
        attempt++;
    } while (attempt < 3);
    return 1;
}

int CPS_TcpConnect(void) {
    CpsSocket *socket = OSi_ThreadInfo.current->specific[0];
    if (socket) {
        if (socket->sslEnabled) {
            return CPSi_SslConnect(socket);
        }
        return CPSi_TcpConnectRaw(socket);
    }
    return 1;
}

// the peer of a connected socket (or the sender of the datagram)
u32 CPS_SocWho(u16 *remotePort, u32 *localIp) {
    CpsSocket *socket = OSi_ThreadInfo.current->specific[0];
    if (socket && (socket->state == CPS_STATE_ESTABLISHED || socket->state == CPS_STATE_DATAGRAM)) {
        if (remotePort) {
            *remotePort = socket->remotePort;
        }
        if (localIp) {
            *localIp = socket->localIp;
        }
        return socket->remoteIp;
    }
    return 0;
}

void CPSi_TcpShutdownRaw(CpsSocket *socket) {
    OS_YieldThread();
    if ((u8)(socket->state + 253) <= 1) { // SYN_RCVD or ESTABLISHED
        tcp_send_finack(socket, 25);
        socket->state = CPS_STATE_FIN_WAIT_1;
        return;
    }
    if (!socket->state) {
        return;
    }
    tcp_send_ack(socket, 26);
}

void CPS_TcpShutdown(void) {
    CpsSocket *socket = OSi_ThreadInfo.current->specific[0];
    if (!socket) {
        return;
    }
    if (socket->sslEnabled) {
        CPSi_SslShutdown(socket);
    }
    CPSi_TcpShutdownRaw(socket);
}

// waits up to 2.5 s for the connection to close
void CPS_TcpClose(void) {
    CpsSocket *socket = OSi_ThreadInfo.current->specific[0];
    int tick;
    if (!socket) {
        return;
    }
    if (socket->sslEnabled) {
        CPSi_SslClose(socket);
    }
    tick = OS_GetTick() >> 16;
    while (gCpsState.linkIsOn() && socket->state && ((int)(OS_GetTick() >> 16) - tick) < 39) {
        OS_YieldThread__();
    }
    socket->state = CPS_STATE_CLOSED;
}

void *udp_read_raw(u32 *length, CpsSocket *socket) {
    u32 n;
    OSIntrMode enabled = OS_DisableInterrupts();
    n = socket->recvLength;
    while (!n) {
        socket->waiting = CPS_WAIT_DATAGRAM;
        OS_SleepThread(NULL);
        n = socket->recvLength;
    }
    OS_RestoreInterrupts(enabled);
    *length = n;
    return socket->recvBuf.data;
}

// waits for data while the connection is up (NULL: closed)
void *CPSi_TcpReadRaw(u32 *length, CpsSocket *socket) {
    if (!socket->recvLength && socket->state == CPS_STATE_ESTABLISHED) {
        OSIntrMode enabled = OS_DisableInterrupts();
        while (!socket->recvLength && socket->state == CPS_STATE_ESTABLISHED) {
            socket->waiting = CPS_WAIT_DATA;
            OS_SleepThread(NULL);
        }
        OS_RestoreInterrupts(enabled);
    } else {
        OS_YieldThread();
    }
    *length = socket->recvLength;
    return *length ? socket->recvBuf.data : NULL;
}

void *CPS_SocRead(u32 *length) {
    CpsSocket *socket = OSi_ThreadInfo.current->specific[0];
    if (socket) {
        if ((u8)(socket->state + 246) <= 1) { // DATAGRAM or PING
            return udp_read_raw(length, socket);
        }
        if (socket->sslEnabled) {
            return CPSi_SslRead(length, socket);
        }
        return CPSi_TcpReadRaw(length, socket);
    }
    *length = 0;
    return NULL;
}

// drops length bytes of the received data; TCP: tells the peer about the new window
void CPSi_SocConsumeRaw(u32 length, CpsSocket *socket) {
    OSIntrMode enabled = OS_DisableInterrupts();
    int full = FALSE;
    if (socket->recvLength == socket->recvBuf.size && length) {
        full = TRUE;
    }
    if (length >= socket->recvLength) {
        socket->recvLength = 0;
    } else {
        u8 *data = socket->recvBuf.data;
        u32 left = socket->recvLength - length;
        socket->recvLength = left;
        memmove(data, data + length, left);
    }
    OS_RestoreInterrupts(enabled);
    switch (socket->state) {
    case CPS_STATE_DATAGRAM:
    case CPS_STATE_PING:
        return;
    }
    if (socket->recvLength && !full) {
        return;
    }
    tcp_send_ack(socket, 27);
}

void CPS_SocConsume(u32 length) {
    CpsSocket *socket = OSi_ThreadInfo.current->specific[0];
    if (!socket) {
        return;
    }
    if (socket->sslEnabled) {
        CPSi_SslConsume(length, socket);
    } else {
        CPSi_SocConsumeRaw(length, socket);
    }
}
