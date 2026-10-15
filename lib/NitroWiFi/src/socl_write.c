#include "nitrowifi/socl_internal.h"

// Writing: the data is copied into the send pipe's ring buffer and a write packet is posted to the send
// pipe, whose thread passes it to CPS in segments. The force_active regions are those of the original
// objects.

#pragma force_active on

int SOCL_WriteTo(int handle, const void *data, int length, u16 remotePort, u32 remoteIp, int flags) {
    SoclSocket *socket = (SoclSocket *)handle;
    SoclSendPipe *sendPipe;
    int block;
    int result;
    int ok;
    if (SOCL_SocketIsInvalid(socket)) {
        return -28;
    }
    ok = 0;
    if (socket) {
        ok = (socket->state & 1) != 0;
    }
    if (!ok) {
        return -39;
    }
    if (SoclSocket_IsStream(socket)) {
        if (!(socket->state & 4) || (socket->state & 8)) {
            return -56;
        }
    }
    sendPipe = socket->sendPipe;
    if ((flags & 4) || socket->blocking == 0) {
        if (!OS_TryLockMutex(&sendPipe->cmd.mutex)) {
            return -6;
        }
        block = 0;
    } else {
        OS_LockMutex(&sendPipe->cmd.mutex);
        block = 1;
    }
    result = SOCLi_WriteBuffer(socket, data, length, remotePort, remoteIp, block);
    OS_UnlockMutex(&sendPipe->cmd.mutex);
    return result;
}

// Splits the data into packets of at most one segment (TCP) or one datagram (UDP, larger is an error).
int SOCLi_WriteBuffer(SoclSocket *socket, const void *data, int length, u16 remotePort, u32 remoteIp, int block) {
    int offset;
    int maximum;
    int count;
    u32 written;
    SoclSendPipe *sendPipe = socket->sendPipe;
    s8 type = socket->type;
    SoclSocket *pipeSocket = sendPipe->socket;
    int bufSize = pipeSocket->cps.sendBuf.size;
    written = 0;
    if (type == 1) {
        if (length > (s32)((u32)bufSize - 42)) {
            return -35;
        }
        maximum = length;
    } else {
        maximum = (s32)((u32)bufSize - 54);
        if (length <= maximum) {
            maximum = length;
        }
    }
    while (length > 0) {
        count = SOCLi_AllocWriteBuffer(socket, length, maximum, &offset, block);
        if (count > 0) {
            if (SOCLi_ExecWriteCommand(socket, data, count, offset, remotePort, remoteIp, block) <= 0) {
                return -6;
            }
            data = (const u8 *)data + count;
            length = (s32)((u32)length - (u32)count);
            written += (u32)count;
        }
        if (!(block & 1)) {
            if (count > 0) {
                break;
            }
            return -6;
        }
    }
    return (s32)written;
}

// Reserves up to length bytes (at least minimum) of the send ring, waiting for space when blocking.
int SOCLi_AllocWriteBuffer(SoclSocket *socket, int length, int minimum, int *offset, int block) {
    SoclSendPipe *sendPipe = socket->sendPipe;
    int size;
    OSIntrMode enabled;
    if (minimum > length) {
        minimum = length;
    }
    enabled = OS_DisableInterrupts();
    for (;;) {
        size = SOCLi_GetWriteBufferFreeSize(socket);
        if (size >= minimum) {
            *offset = sendPipe->ringWrite;
            if (size >= length) {
                size = length;
            }
            break;
        }
        if (!(block & 1)) {
            size = 0;
            break;
        }
        OS_SleepThread(&sendPipe->ringWait);
    }
    OS_RestoreInterrupts(enabled);
    return size;
}

static inline int GetRingFreeSize(SoclSendPipe *sendPipe, int size) {
    int write = sendPipe->ringWrite;
    int free = sendPipe->ringRead - write - 1;
    if (free < 0) {
        free += size;
    }
    return free;
}

#pragma push
#pragma opt_propagation off

int SOCLi_GetWriteBufferFreeSize(SoclSocket *socket) {
    SoclSendPipe *sendPipe = socket->sendPipe;
    return GetRingFreeSize(sendPipe, sendPipe->ring.size);
}

#pragma pop

int SOCLi_ExecWriteCommand(SoclSocket *socket, const void *data, int length, int offset, u16 remotePort, u32 remoteIp, int flags) {
    SoclSendPipe *sendPipe = socket->sendPipe;
    SoclCommandPacket *packet;
    int end;
    int size;
    u8 *ring;
    u16 oldWrite;
    packet = SOCLi_CreateCommandPacket(SOCLi_WriteCallBack, sendPipe->socket, flags);
    if (!packet) {
        return -33;
    }
    if ((flags & 1) && socket->type != 1) {
        packet->flags = 3;
    } else {
        packet->flags = 0;
    }
    ring = sendPipe->ring.data;
    size = sendPipe->ring.size;
    end = offset + length;
    if (end < size) {
        packet->param.write.data = ring + offset;
        packet->param.write.length = length;
        packet->param.write.wrapData = NULL;
        offset = end;
        packet->param.write.wrapLength = 0;
    } else {
        packet->param.write.data = ring + offset;
        packet->param.write.length = size - offset;
        packet->param.write.wrapData = ring;
        offset = length - packet->param.write.length;
        packet->param.write.wrapLength = offset;
        MI_CpuCopy8((const u8 *)data + packet->param.write.length, packet->param.write.wrapData, offset);
    }
    MI_CpuCopy8(data, packet->param.write.data, packet->param.write.length);
    oldWrite = sendPipe->ringWrite;
    packet->param.write.ringEnd = offset;
    sendPipe->ringWrite = packet->param.write.ringEnd;
    if (socket->type == 1) {
        if (!socket->localPort) {
            socket->localPort = CPS_SocGetEport();
            socket->cps.localPort = socket->localPort;
        }
        packet->param.write.localPort = socket->localPort;
        if (!socket->remoteIp || remoteIp) {
            packet->param.write.remoteIp = remoteIp;
            packet->param.write.remotePort = remotePort;
        } else {
            packet->param.write.remoteIp = socket->remoteIp;
            packet->param.write.remotePort = socket->remotePort;
        }
    } else {
        packet->param.write.remoteIp = 0;
    }
    if (SOCLi_ExecCommandPacketInSendPipe(sendPipe->socket, packet)) {
        sendPipe->ringWrite = oldWrite;
        length = 0;
    }
    return length;
}

// Send pipe thread: writes the packet's data in segments, then frees its part of the ring.
int SOCLi_WriteCallBack(SoclCommandPacket *packet) {
    u8 *buffer;
    SoclSocket *socket = packet->socket;
    SoclSendPipe *sendPipe;
    int total = 0;
    int header;
    int limit;
    int result;
    sendPipe = socket->sendPipe;
    if (((socket->type == 0 || socket->type == 4) ? 1 : 0) && !(socket->state & 4)) {
        goto error;
    }
    if (packet->param.write.remoteIp) {
        CPS_SocBind(packet->param.write.localPort, packet->param.write.remotePort, packet->param.write.remoteIp);
    }
    buffer = socket->cps.sendBuf.data;
    header = (socket->type == 0 || socket->type == 4) ? 54 : 42; // Ethernet + IP + TCP / UDP headers
    if (socket->type != 0 && socket->type != 4) {
        limit = socket->cps.sendBuf.size - header;
    } else {
        limit = SOCLi_GetOptimumSendBufLen(socket->cps.sendBuf.size - header);
    }
    for (;;) {
        result = SOCLi_MemCpy(buffer + header, limit, packet);
        if (result <= 0) {
            break;
        }
        result = CPS_SocWrite(buffer + header, result);
        if (result <= 0) {
            if ((socket->type == 0 || socket->type == 4) ? 1 : 0) {
                socket->state &= ~14;
                socket->state |= 0x80;
                CPS_TcpClose();
            }
            total = -76;
            break;
        }
        total += result;
    }
    goto done;
error:
    total = -76;
done:
    sendPipe->ringRead = packet->param.write.ringEnd;
    OS_WakeupThread(&sendPipe->ringWait);
    return total;
}

#pragma force_active off

// Largest multiple of twice the segment size (the peer's, if smaller) that fits into size.
int SOCLi_GetOptimumSendBufLen(int size) {
    CpsSocket *cps = OSi_ThreadInfo.current->specific[0];
    OSIntrMode enabled = OS_DisableInterrupts();
    int limit;
    if (cps != NULL) {
        int segment = cps->mss;
        if (segment != 0 && cps->sendWindow != 0) {
            int window = cps->sendWindow;
            int mss = gSoclCpsConfig.mss;
            if (segment > window) {
                segment = window;
            }
            if (segment > mss) {
                segment = mss;
            }
            limit = segment * 2;
        } else {
            limit = gSoclCpsConfig.mss * 2;
        }
    } else {
        limit = gSoclCpsConfig.mss * 2;
    }
    OS_RestoreInterrupts(enabled);
    if (limit > 0) {
        int count = size / limit;
        if (count > 0) {
            return limit * count;
        }
    }
    return size;
}

// Copies up to size bytes of the packet's data (both parts of the ring) and advances it.
int SOCLi_MemCpy(u8 *dest, int size, SoclCommandPacket *packet) {
    int length = packet->param.write.length;
    int wrapLength = packet->param.write.wrapLength;
    if (length > size) {
        length = size;
        wrapLength = 0;
    } else if (wrapLength > size - length) {
        wrapLength = size - length;
    }
    if (length > 0) {
        MI_CpuCopy8(packet->param.write.data, dest, length);
        packet->param.write.data += length;
        packet->param.write.length -= length;
    }
    if (wrapLength > 0) {
        MI_CpuCopy8(packet->param.write.wrapData, dest + length, wrapLength);
        packet->param.write.wrapData += wrapLength;
        packet->param.write.wrapLength -= wrapLength;
    }
    return length + wrapLength;
}
