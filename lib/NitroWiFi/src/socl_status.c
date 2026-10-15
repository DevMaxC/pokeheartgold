#include "nitrowifi/socl_internal.h"

// SOCL_GetStatus: readable / writable / connection state bits of a socket.

#pragma force_active on

int SOCL_GetStatus(int handle) {
    SoclSocket *socket = (SoclSocket *)handle;
    int result = 0;
    OSIntrMode enabled;
    if (SOCL_SocketIsInvalid(socket)) {
        result |= 0x80;
    } else {
        if (socket->state & 0x40) {
            result |= 0x20;
        }
        if (socket->type == 1 || (socket->state & 4)) {
            enabled = OS_DisableInterrupts();
            if (SOCLi_GetReadBufferOccpiedSize(socket) > 0) {
                result |= 1;
            }
            if (SOCLi_GetWriteBufferFreeSize(socket) > 0) {
                result |= 8;
            }
            OS_RestoreInterrupts(enabled);
        }
        if (SoclSocket_IsStream(socket)) {
            if ((socket->state & 4) && socket->cps.state != 4) {
                if (!(result & 1)) {
                    socket->state &= ~6;
                }
            }
            if (!(socket->state & 2)) {
                if (!(socket->state & 4)) {
                    result |= 0x40;
                }
            }
        }
    }
    return result;
}

#pragma force_active off

int SOCLi_GetReadBufferOccpiedSize(SoclSocket *socket) {
    SoclRecvPipe *recvPipe = socket->recvPipe;
    int size = 0;
    if (recvPipe != NULL) {
        s8 type = socket->type;
        if (type == 1) {
            SoclUdpPacket *packet = recvPipe->udpHead;
            if (packet != NULL) {
                size = packet->length;
            }
        } else if (type == 0 || type == 4) {
            size = socket->cps.recvLength - recvPipe->consumed;
        }
    }
    return size;
}

int SOCLi_RoundUp4(int size) {
    return (size + 3) & ~3;
}
