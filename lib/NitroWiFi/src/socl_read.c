#include "nitrowifi/socl_internal.h"

// Reading: TCP data straight from the CPS receive buffer (consumed in chunks of consumeMin bytes),
// datagrams from the receive pipe's packet queue. Blocking reads run on the receive pipe.
// The force_active regions are those of the original objects.

#pragma force_active on

int SOCL_ReadFrom(int handle, void *buffer, int length, u16 *remotePort, u32 *remoteIp, int flags) {
    SoclSocket *socket = (SoclSocket *)handle;
    SoclRecvPipe *recvPipe;
    int block;
    if (SOCL_SocketIsInvalid(socket)) {
        return -28;
    }
    if ((flags & 4) || !socket->blocking) {
        if (socket->type == 4) {
            return -28;
        }
        block = 0;
    } else {
        if (OS_GetProcMode() == OS_PROCMODE_IRQ) {
            return -28;
        }
        block = 1;
    }
    if (SoclSocket_IsCreated(socket) == FALSE) {
        return -39;
    }
    if (SoclSocket_IsStream(socket)) {
        if (!(socket->state & 4) || (socket->state & 8)) {
            return -56;
        }
    }
    recvPipe = socket->recvPipe;
    if (!(block & 1)) {
        if (!OS_TryLockMutex(&recvPipe->cmd.mutex)) {
            return -6;
        }
    } else {
        OS_LockMutex(&recvPipe->cmd.mutex);
    }
    int result = SOCLi_ReadAndConsumeBuffer(socket, buffer, length, remotePort, remoteIp, block, flags);
    OS_UnlockMutex(&recvPipe->cmd.mutex);
    return result;
}

#pragma force_active off

int SOCLi_ReadAndConsumeBuffer(SoclSocket *socket, void *buffer, int length, u16 *remotePort, u32 *remoteIp, int block, int flags) {
    SoclRecvPipe *recvPipe = socket->recvPipe;
    int peek = (flags & 2) != 0 && recvPipe != NULL;
    s8 oldPeek;
    int result;
    if (peek) {
        oldPeek = recvPipe->peek;
        recvPipe->peek = 1;
    }
    if (socket->type == 1) {
        result = SOCLi_ReadUdpBuffer(socket, buffer, length, remotePort, remoteIp, block);
    } else {
        result = SOCLi_ReadBuffer(socket, buffer, length, remotePort, remoteIp, block);
        if (result >= 0) {
            SOCLi_ConsumeBuffer(socket);
        }
    }
    if (peek) {
        recvPipe->peek = oldPeek;
    }
    return result;
}

int SOCLi_ReadBuffer(SoclSocket *socket, void *buffer, int length, u16 *remotePort, u32 *remoteIp, int block) {
    if (socket->type == 4) {
        return SOCLi_ExecReadCommand(socket, buffer, length, remotePort, remoteIp);
    }
    int result = SOCLi_CopyCPSBuffer(socket, buffer, length, remotePort, remoteIp);
    if (result != -6 || (block & 1) == 0) {
        return result;
    }
    return SOCLi_ExecReadCommand(socket, buffer, length, remotePort, remoteIp);
}

#pragma force_active on

static inline void AddConsumed(SoclRecvPipe *recvPipe, int length) {
    if (recvPipe->peek == 0) {
        recvPipe->consumed += (u32)length;
    }
}

static inline int CopyData(SoclSocket *socket, const void *src, void *dest, int length, int available) {
    int result = available;
    if (length > result) {
        length = result;
    }
    if (SoclSocket_IsStream(socket)) {
        result = length;
    }
    MI_CpuCopy8(src, dest, length);
    AddConsumed(socket->recvPipe, result);
    return result;
}

int SOCLi_CopyCPSBuffer(SoclSocket *socket, void *buffer, int length, u16 *remotePort, u32 *remoteIp) {
    OSIntrMode enabled;

    struct {
        u16 remotePort;
        u16 localPort;
        u32 remoteIp;
        int available;
    } info;

    int result;
    u8 *data;
    enabled = OS_DisableInterrupts();
    data = SOCLi_ReadCPSBuffer(socket, &info.available, &info.localPort, &info.remotePort, &info.remoteIp);
    if (data) {
        result = info.available;
        if (result == 0) {
            result = -6;
        } else {
            result = CopyData(socket, data, buffer, length, result);
        }
    } else {
        result = info.available == 0 ? 0 : -28;
        socket->state &= ~6;
    }
    if (result >= 0) {
        if (remotePort && remoteIp) {
            *remotePort = info.remotePort;
            *remoteIp = info.remoteIp;
        }
        if (!socket->localPort) {
            socket->localPort = info.localPort;
        }
    }
    OS_RestoreInterrupts(enabled);
    return result;
}

#pragma force_active off

u8 *SOCLi_ReadCPSBuffer(SoclSocket *socket, s32 *available, u16 *localPort, u16 *remotePort, u32 *remoteIp) {
    SoclRecvPipe *recvPipe = socket->recvPipe;
    CpsSocket *cps = recvPipe->cmd.thread.specific[0];
    s32 consumed = recvPipe->consumed;
    s32 left = cps->recvLength - consumed;
    if (left >= 0) {
        *localPort = cps->localPort;
        *remotePort = cps->remotePort;
        *remoteIp = cps->remoteIp;
        *available = left;
        if (left == 0 && cps->state != 4) {
            return NULL;
        }
    } else {
        *available = -1;
        return NULL;
    }
    return cps->recvBuf.data + consumed;
}

int SOCLi_ExecReadCommand(SoclSocket *socket, void *buffer, int length, u16 *remotePort, u32 *remoteIp) {
    SoclCommandPacket *packet = SOCLi_CreateCommandPacket(SOCLi_ReadCallBack, socket, 1);
    packet->param.read.buffer = buffer;
    packet->param.read.length = length;
    packet->param.read.remotePort = remotePort;
    packet->param.read.remoteIp = remoteIp;
    return SOCLi_ExecCommandPacketInRecvPipe(socket, packet);
}

#pragma force_active on

// Blocking read on the receive pipe: waits until there is more than the consumed data (or the
// connection is gone), then copies it.
int SOCLi_ReadCallBack(SoclCommandPacket *packet) {
    SoclSocket *socket = packet->socket;
    void *buffer = packet->param.read.buffer;
    SoclRecvPipe *recvPipe = socket->recvPipe;
    u32 consumed = recvPipe->consumed;
    u16 *remotePort = packet->param.read.remotePort;
    u32 length = packet->param.read.length;
    u32 *remoteIp = packet->param.read.remoteIp;
    u32 available;
    u8 *data;
    for (;;) {
        data = CPS_SocRead(&available);
        if (data == NULL) {
            break;
        }
        if ((s32)(available - consumed) > 0) {
            break;
        }
        if (SoclSocket_IsStream(socket) && socket->cps.state != 4) {
            data = NULL;
            break;
        }
        OS_Sleep(10);
    }
    if (socket->state & 0x80) {
        return -15;
    }
    if (socket->type == 4) {
        if (data == NULL) {
            return 0;
        }
        if (length > available) {
            length = available;
        }
        MI_CpuCopy8(data, buffer, length);
        CPS_SocConsume(length);
        return length;
    }
    int result;
    if (data == NULL) {
        result = 0;
    } else {
        result = SOCLi_CopyCPSBuffer(socket, buffer, (s32)length, remotePort, remoteIp);
    }
    if (result <= 0) {
        return result;
    }
    if (recvPipe->consumed >= recvPipe->consumeMin) {
        SOCLi_ConsumeCPSBuffer(socket);
    }
    return result;
}

#pragma force_active off

int SOCLi_ConsumeBuffer(SoclSocket *socket) {
    SoclRecvPipe *recvPipe = socket->recvPipe;
    if (recvPipe->consumed < recvPipe->consumeMin) {
        return 0;
    }
    SoclCommandPacket *packet = SOCLi_CreateCommandPacket(SOCLi_ConsumeCallBack, socket, 0);
    if (packet == NULL) {
        return -33;
    }
    return SOCLi_ExecCommandPacketInRecvPipe(socket, packet);
}

int SOCLi_ConsumeCallBack(SoclCommandPacket *packet) {
    return SOCLi_ConsumeCPSBuffer(packet->socket);
}

int SOCLi_ConsumeCPSBuffer(SoclSocket *socket) {
    SoclRecvPipe *recvPipe = socket->recvPipe;
    OSIntrMode enabled = OS_DisableInterrupts();
    s32 consumed = recvPipe->consumed;
    if (consumed != 0) {
        recvPipe->consumed = 0;
        CPS_SocConsume(consumed);
    }
    OS_RestoreInterrupts(enabled);
    return consumed;
}

#pragma force_active on

int SOCLi_ReadUdpBuffer(SoclSocket *socket, void *buffer, int length, u16 *remotePort, u32 *remoteIp, int block) {
    SoclRecvPipe *recvPipe = socket->recvPipe;
    SoclUdpPacket *packet;
    int result;
    OSIntrMode enabled;
    (void)recvPipe->udpHead;
    enabled = OS_DisableInterrupts();
    packet = recvPipe->udpHead;
    if (packet == NULL) {
        do {
            if (!(block & 1)) {
                result = -6;
                break;
            }
            OS_SleepThread(&recvPipe->udpWait);
            if (SOCL_SocketIsInvalid(socket) || !SoclSocket_IsCreated(socket)) {
                result = -56;
                break;
            }
            packet = recvPipe->udpHead;
        } while (packet == NULL);
    }
    if (packet != NULL) {
        if (length > packet->length) {
            length = packet->length;
        }
        MI_CpuCopy8(packet->data, buffer, length);
        if (remotePort) {
            *remotePort = packet->remotePort;
        }
        if (remoteIp) {
            *remoteIp = packet->remoteIp;
        }
        result = packet->length;
        if (recvPipe->peek == 0) {
            recvPipe->udpHead = packet->next;
            if (packet->next == NULL) {
                recvPipe->udpTail = NULL;
            }
            gSoclConfig->free(packet);
            recvPipe->udpBytes -= result;
        }
    }
    OS_RestoreInterrupts(enabled);
    return result;
}

// CPS UDP callback (receive pipe thread): queues the datagram unless the queue is full.
int SOCLi_UdpRecvCallback(const void *data, u32 length, SoclSocket *socket) {
    SoclRecvPipe *recvPipe = socket->recvPipe;
    SoclUdpPacket *packet = NULL;
    OSIntrMode enabled = OS_DisableInterrupts();
    if (recvPipe->udpMax >= recvPipe->udpBytes + length) {
        void *(*alloc)(int) = (void *(*)(int))gSoclConfig->alloc;
        if ((packet = alloc(length + sizeof(SoclUdpPacket))) != NULL) {
            recvPipe->udpBytes += length;
            packet->next = NULL;
            packet->length = length;
            packet->remotePort = socket->cps.remotePort;
            packet->remoteIp = socket->cps.remoteIp;
            MI_CpuCopy8(data, packet->data, length);
            if (*(SoclUdpPacket *volatile *)&recvPipe->udpTail) {
                recvPipe->udpTail->next = packet;
            }
            recvPipe->udpTail = packet;
            if (!recvPipe->udpHead) {
                recvPipe->udpHead = packet;
            }
        } else {
            ++gSoclUdpDropCount[0];
        }
    } else {
        ++gSoclUdpDropCount[1];
    }
    if (!socket->localPort) {
        socket->localPort = socket->cps.localPort;
    }
    socket->cps.remotePort = socket->cps.boundRemotePort;
    socket->cps.remoteIp = socket->cps.boundRemoteIp;
    OS_WakeupThread(&recvPipe->udpWait);
    OS_RestoreInterrupts(enabled);
    return 1;
}
