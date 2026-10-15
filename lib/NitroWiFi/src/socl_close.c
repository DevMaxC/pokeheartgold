#include "nitrowifi/socl_internal.h"

// Shutdown and close: a closed socket moves to the trash list; the CPS scavenger callback
// (SOCLi_TrashSocket) frees it. SOCL_Cleanup / SOCL_CalmDown take the whole layer down.
// The force_active regions are those of the original objects.

#pragma force_active on

// matches the original's logical expressions
#pragma push
#pragma opt_rebuildlogicals off

int SOCL_Shutdown(int handle) {
    SoclSocket *socket = (SoclSocket *)handle;
    BOOL created;
    SoclSendPipe *sendPipe;
    SoclCommandPacket *packet;
    if (SOCL_SocketIsInvalid(socket)) {
        return -28;
    }
    created = SoclSocket_IsCreated(socket);
    if (!created) {
        return -39;
    }
    if (!(socket->state & 4) || (socket->state & 8)) {
        return -56;
    }
    socket->state |= 8;
    sendPipe = socket->sendPipe;
    if (sendPipe && sendPipe->socket) {
        packet = SOCLi_CreateCommandPacket(SOCLi_ShutdownCallBack, sendPipe->socket, socket->blocking);
        if (!packet) {
            return -33;
        }
        return SOCLi_ExecCommandPacketInSendPipe(sendPipe->socket, packet);
    }
    return 0;
}

#pragma pop

#pragma force_active off

int SOCLi_ShutdownCallBack(SoclCommandPacket *packet) {
    if (SoclSocket_IsStream(packet->socket)) {
        CPS_TcpShutdown();
    }
    return 0;
}

int SOCL_IsClosed(int handle) {
    SoclSocket *socket = (SoclSocket *)handle;
    if (handle >= 0 && SOCL_SocketIsInvalid(socket)) {
        if (!SOCL_SocketIsInTrash(socket)) {
            return 1;
        }
    }
    return 0;
}

#pragma force_active on

int SOCL_Close(int handle) {
    SoclSocket *socket = (SoclSocket *)handle;
    SoclCommandPacket *packet;
    int created;
    int stream;
    if (handle <= 0) {
        return -28;
    }
    if (SOCL_SocketIsInTrash(socket)) {
        return -26;
    }
    if (SOCL_SocketIsInvalid(socket)) {
        return 0;
    }
    created = 0;
    if (socket) {
        created = (socket->state & 1) != 0;
    }
    if (!created) {
        return -39;
    }
    if (socket->state & 0x10) {
        return -26;
    }
    socket->state |= 0x18;
    stream = socket->type == 0 || socket->type == 4;
    if (stream) {
        // ends the send pipe thread
        SOCLi_SendCommandPacket(&socket->sendPipe->cmd, NULL);
    }
    packet = SOCLi_CreateCommandPacket(SOCLi_CloseCallBack, socket, 1);
    packet->reply = NULL;
    SOCLi_SendCommandPacketToCtrlPipe(socket, packet);
    return 0;
}

int SOCLi_CloseCallBack(SoclCommandPacket *packet) {
    SoclSocket *socket = packet->socket;
    OSIntrMode enabled;
    int stream = (socket->type == 0 || socket->type == 4);
    if (stream) {
        OS_JoinThread(&socket->sendPipe->cmd.thread);
        CPS_TcpShutdown();
        CPS_TcpClose();
        CPS_SocRelease();
    }
    CPS_SocUnRegister();
    socket->state &= ~6;
    // ends the thread of the pipe that is not running this packet
    SOCLi_SendCommandPacket(socket->type == 2 ? &socket->sendPipe->cmd : &socket->recvPipe->cmd, NULL);
    enabled = OS_DisableInterrupts();
    SOCLi_SocketUnregister(socket);
    SOCLi_SocketRegisterTrash(socket);
    OS_RestoreInterrupts(enabled);
    socket->state |= 0x20;
    return 0;
}

void SOCLi_CleanupSocket(SoclSocket *socket) {
    OSIntrMode enabled;
    if (!socket) {
        return;
    }
    socket->state = 0;
    if ((socket->type == 0 || socket->type == 4) ? TRUE : FALSE) {
        SOCLi_FreeCommandPipe(&socket->sendPipe->cmd);
        SOCLi_FreeCommandPipe(&socket->recvPipe->cmd);
    } else if (socket->type == 1) {
        SoclUdpPacket *packet = socket->recvPipe->udpHead;
        while (packet) {
            SoclUdpPacket *next = packet->next;
            gSoclConfig->free(packet);
            packet = next;
        }
        socket->recvPipe->udpBytes = 0;
        socket->recvPipe->udpTail = NULL;
        socket->recvPipe->udpHead = NULL;
        OS_WakeupThread(&socket->recvPipe->udpWait);
        SOCLi_FreeCommandPipe(&socket->recvPipe->cmd);
    } else if (socket->type == 2) {
        SOCLi_FreeCommandPipe(&socket->sendPipe->cmd);
    }
    enabled = OS_DisableInterrupts();
    SOCLi_SocketUnregister(socket);
    SOCLi_SocketUnregisterTrash(socket);
    gSoclConfig->free(socket);
    OS_RestoreInterrupts(enabled);
}

// Waits for the pipe's thread to end and fails the packets still queued.
void SOCLi_FreeCommandPipe(SoclCommandPipe *pipe) {
    SoclCommandPacket *packet;
    OSIntrMode enabled;
    if (!pipe) {
        return;
    }
    OS_JoinThread(&pipe->thread);
    enabled = OS_DisableInterrupts();
    OS_DisableScheduler();
    while (OS_ReceiveMessage(&pipe->queue, (OSMessage *)&packet, OS_MESSAGE_NOBLOCK)) {
        if (packet) {
            OSMessageQueue *reply = packet->reply;
            if (reply) {
                OS_SendMessage(reply, (OSMessage)-11, OS_MESSAGE_NOBLOCK);
            }
            SOCLi_FreeCommandPacket(packet);
        }
    }
    OS_EnableScheduler();
    OS_RescheduleThread();
    OS_RestoreInterrupts(enabled);
}

#pragma force_active off

void SOCLi_TrashSocket(void) {
    OSIntrMode enabled = OS_DisableInterrupts();
    while (gSoclTrash != NULL) {
        SOCLi_CleanupSocket(gSoclTrash);
    }
    OS_RestoreInterrupts(enabled);
}

#pragma force_active on

int SOCL_Cleanup(void) {
    int result;
    if (!gSoclLastIp) {
        gSoclLastIp = gSoclHostAddress;
    }
    while (SOCL_CalmDown() == -26) {
        OS_Sleep(100);
    }
    result = SOCLi_CleanupCommandPacketQueue();
    if (result >= 0) {
        CPS_Cleanup();
        CPS_SetScavengerCallback(NULL);
        if (!gSoclConfig->cpsWork) {
            gSoclConfig->free(gSoclCpsConfig.work);
        }
        gSoclConfig = NULL;
    }
    return result;
}

int SOCL_CloseAll(void) {
    SoclSocket *socket;
    while (1) {
        OSIntrMode enabled = OS_DisableInterrupts();
        socket = gSoclSockets;
        while (socket) {
            if (socket != gSoclCtrlSocket && !(socket->state & 0x10)) {
                break;
            }
            socket = socket->next;
        }
        OS_RestoreInterrupts(enabled);
        if (!socket) {
            break;
        }
        SOCL_Close((int)socket);
    }
    if (!gSoclSockets || (gSoclSockets == gSoclCtrlSocket && !gSoclSockets->next)) {
        if (!gSoclTrash) {
            return 0;
        }
    }
    return -26;
}

#pragma force_active off

// Closes every socket, then the control socket, then stops CPS; -26 while still in progress.
int SOCL_CalmDown(void) {
    int result;
    if (gSoclCtrlSocket != NULL) {
        result = SOCL_CloseAll();
        if (result == 0) {
            SOCL_Close((int)gSoclCtrlSocket);
            if (SOCL_IsClosed((int)gSoclCtrlSocket)) {
                gSoclCtrlSocket = NULL;
            }
            result = -26;
        }
        SOCLi_TrashSocket();
    } else {
        if (CPS_CalmDown() == 0) {
            result = -26;
        } else {
            WCM_SetRecvDCFCallback(NULL);
            result = 0;
        }
    }
    return result;
}
