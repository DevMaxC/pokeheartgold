#include "nitrowifi/socl_internal.h"

// Socket creation (one allocation: the socket, its pipes, their thread stacks and the CPS buffers) and
// listen / accept / bind / connect, which run on the socket's receive pipe.

int SOCL_CreateSocket(const SoclSocketParam *param) {
    SoclSocket *socket = SOCLi_StartupSocket(param);
    SoclCommandPacket *packet;
    if (socket == NULL) {
        return -49;
    }
    packet = SOCLi_CreateCommandPacket(SOCLi_CreateSocketCallBack, socket, 1);
    SOCLi_ExecCommandPacketInCtrlPipe(socket, packet);
    return (int)socket;
}

int SOCLi_CreateSocketCallBack(SoclCommandPacket *packet) {
    SoclSocket *socket = packet->socket;
    CPS_SocRegister(&socket->cps);
    SoclSendPipe *sendPipe = socket->sendPipe;
    switch (socket->type) {
    case 0:
    case 4:
        CPS_SocDup(&sendPipe->cmd.thread);
        CPS_SocUse();
        break;
    case 1:
        CPS_SocUse();
        CPS_SocDatagramMode();
        CPS_SetUdpCallback(SOCLi_UdpRecvCallback);
        break;
    case 2:
        CPS_SocDatagramMode();
        break;
    }
    socket->state = 1;
    return 0;
}

SoclSocket *SOCLi_StartupSocket(const SoclSocketParam *param) {
    int size = SOCLi_GetSizeSocket(param);
    SoclSocket *socket;
    OSIntrMode enabled = OS_DisableInterrupts();
    socket = gSoclConfig->alloc(size);
    if (socket != NULL) {
        MI_CpuFill8(socket, 0, size);
        SOCLi_InitSocket(socket, param);
        SOCLi_SocketRegister(socket);
    }
    OS_RestoreInterrupts(enabled);
    return socket;
}

int SOCLi_GetSizeSocket(const SoclSocketParam *param) {
    int size = sizeof(SoclSocket);
    if (param->recvBufSize != 0) {
        size += sizeof(SoclRecvPipe);
        size += SOCLi_RoundUp4(param->recvBufSize);
        size += SOCLi_RoundUp4(param->unk_08);
        size += SOCLi_GetSizeCommandPipe(&param->recvPipe);
    }
    if (param->sendBufSize != 0) {
        size += sizeof(SoclSendPipe);
        size += SOCLi_RoundUp4(param->sendBufSize);
        size += SOCLi_RoundUp4(param->writeBufSize);
        size += SOCLi_RoundUp4(param->sendRingSize);
        size += SOCLi_GetSizeCommandPipe(&param->sendPipe);
    }
    return size;
}

// message array + thread stack
int SOCLi_GetSizeCommandPipe(const SoclPipeParam *param) {
    int size = SOCLi_RoundUp4(param->queueLength * sizeof(OSMessage));
    return size + SOCLi_RoundUp4(param->stackSize);
}

u8 *SOCLi_InitSocket(SoclSocket *socket, const SoclSocketParam *param) {
    u8 *cursor = (u8 *)socket + sizeof(SoclSocket);
    socket->type = param->type;
    socket->blocking = param->blocking;
    if (param->recvBufSize != 0) {
        SoclRecvPipe *recvPipe;
        socket->recvPipe = (SoclRecvPipe *)cursor;
        recvPipe = (SoclRecvPipe *)cursor;
        recvPipe->consumeMin = param->consumeMin;
        cursor = SOCLi_InitCommandPipe(cursor + sizeof(SoclRecvPipe), &recvPipe->cmd, &param->recvPipe);
        cursor = SOCLi_InitSocketBuffer(cursor, &socket->cps.recvBuf, param->recvBufSize);
        cursor = SOCLi_InitSocketBuffer(cursor, &socket->cps.unk_50, param->unk_08);
        recvPipe->udpMax = param->udpMax;
        recvPipe->udpWait.tail = NULL;
        recvPipe->udpWait.head = NULL;
    }
    if (param->sendBufSize != 0) {
        SoclSendPipe *sendPipe;
        socket->sendPipe = (SoclSendPipe *)cursor;
        sendPipe = (SoclSendPipe *)cursor;
        sendPipe->socket = socket;
        cursor = SOCLi_InitCommandPipe(cursor + sizeof(SoclSendPipe), &sendPipe->cmd, &param->sendPipe);
        cursor = SOCLi_InitSocketBuffer(cursor, &socket->cps.sendBuf, param->sendBufSize);
        cursor = SOCLi_InitSocketBuffer(cursor, &socket->cps.writeBuf, param->writeBufSize);
        cursor = SOCLi_InitSocketBuffer(cursor, &sendPipe->ring, param->sendRingSize);
        sendPipe->ringWait.tail = NULL;
        sendPipe->ringWait.head = NULL;
    } else {
        socket->sendPipe = gSoclCtrlSocket->sendPipe;
    }
    return cursor;
}

u8 *SOCLi_InitSocketBuffer(u8 *cursor, CpsSocketBuffer *buffer, u32 size) {
    u8 *data = cursor;
    if (size == 0) {
        data = NULL;
    }
    buffer->data = data;
    buffer->size = size;
    return cursor + SOCLi_RoundUp4(size);
}

// the message array is followed by the thread stack (the stack grows down from its end)
u8 *SOCLi_InitCommandPipe(u8 *cursor, SoclCommandPipe *pipe, const SoclPipeParam *param) {
    int size = SOCLi_GetSizeCommandPipe(param);
    OS_InitMessageQueue(&pipe->queue, (OSMessage *)cursor, param->queueLength);
    OS_InitMutex(&pipe->mutex);
    OS_CreateThread(&pipe->thread, SOCLi_CommandPacketHandler, pipe, cursor + size, param->stackSize, param->priority);
    OS_WakeupThreadDirect(&pipe->thread);
    return cursor + size;
}

int SOCL_Listen(int handle) {
    SoclSocket *socket = (SoclSocket *)handle;
    if (SOCL_SocketIsInvalid(socket)) {
        return -28;
    }
    if (!SoclSocket_IsCreated(socket)) {
        return -39;
    }
    if (socket->state & 2) {
        return -28;
    }
    if (!SoclSocket_IsStream(socket)) {
        return -28;
    }
    if (socket->blocking == 1) {
        return 0;
    }
    return -6;
}

int SOCL_Accept(int handle, u16 *remotePort, u32 *remoteIp) {
    SoclSocket *socket = (SoclSocket *)handle;
    int newSocket;
    int result;
    if (SOCL_SocketIsInvalid(socket)) {
        return -28;
    }
    if (!SoclSocket_IsCreated(socket)) {
        return -39;
    }
    if (socket->state & 2) {
        return -28;
    }
    if (!SoclSocket_IsStream(socket)) {
        return -28;
    }
    if (socket->blocking != 1) {
        return -6;
    }
    newSocket = SOCL_CreateSocket(&gSoclTcpSocketParam);
    if (newSocket < 0) {
        return newSocket;
    }
    result = SOCL_Bind(newSocket, socket->localPort);
    if (result < 0) {
        return result;
    }
    result = SOCL_ListenAccept(newSocket, remotePort, remoteIp);
    if (result >= 0) {
        result = newSocket;
    }
    return result;
}

int SOCL_ListenAccept(int handle, u16 *remotePort, u32 *remoteIp) {
    SoclSocket *socket = (SoclSocket *)handle;
    SoclCommandPacket *packet;
    int blocking;
    if (SOCL_SocketIsInvalid(socket)) {
        return -28;
    }
    if (!SoclSocket_IsCreated(socket)) {
        return -39;
    }
    if (socket->state & 2) {
        return -28;
    }
    if (!SoclSocket_IsStream(socket)) {
        return -28;
    }
    blocking = socket->blocking;
    if (blocking != 1) {
        return -6;
    }
    if (socket->localPort == 0) {
        return -28;
    }
    packet = SOCLi_CreateCommandPacket(SOCLi_ListenAcceptCallBack, socket, blocking);
    packet->param.accept.localPort = socket->localPort;
    packet->param.accept.remotePort = remotePort;
    packet->param.accept.remoteIp = remoteIp;
    socket->state |= 2;
    return SOCLi_ExecCommandPacketInRecvPipe(socket, packet);
}

int SOCLi_ListenAcceptCallBack(SoclCommandPacket *packet) {
    SoclSocket *socket = packet->socket;
    SoclRecvPipe *recvPipe = socket->recvPipe;
    u32 unused;
    u32 remotePort;
    int result;
    OS_LockMutex(&recvPipe->cmd.mutex);
    CPS_SocBind(packet->param.accept.localPort, 0, 0);
    CPS_TcpListen();
    recvPipe->consumed = 0;
    result = CPS_SocWho((u16 *)&remotePort, &unused);
    *packet->param.accept.remotePort = *(u16 *)&remotePort;
    *packet->param.accept.remoteIp = result;
    socket->state |= 4;
    OS_UnlockMutex(&recvPipe->cmd.mutex);
    return 0;
}

int SOCL_Bind(int handle, u16 localPort) {
    SoclSocket *socket = (SoclSocket *)handle;
    if (SOCL_SocketIsInvalid(socket)) {
        return -28;
    }
    if (!SoclSocket_IsCreated(socket)) {
        return -39;
    }
    if (socket->state & 2) {
        return -7;
    }
    socket->localPort = localPort;
    if (socket->type != 1) {
        return 0;
    }
    return SOCLi_ExecBindCommand(socket);
}

int SOCL_Connect(int handle, u16 remotePort, u32 remoteIp) {
    SoclSocket *socket = (SoclSocket *)handle;
    int result;
    if (SOCL_SocketIsInvalid(socket) || (socket->state & 8)) {
        return -28;
    }
    if (!SoclSocket_IsCreated(socket)) {
        return -39;
    }
    if (!SoclSocket_IsStream(socket)) {
        goto datagram; // placed after the stream case
    }
    if (socket->state & 4) {
        return socket->blocking == 1 ? -30 : 0;
    }
    if (socket->state & 2) {
        if (socket->state & 0x40) {
            return socket->result;
        }
        return _0211062C;
    }
    socket->remotePort = remotePort;
    socket->remoteIp = remoteIp;
    result = SOCLi_ExecBindCommand(socket);
    if (socket->blocking != 1) {
        return -26;
    }
    return result;
datagram:
    socket->remotePort = remotePort;
    socket->remoteIp = remoteIp;
    return 0;
}

int SOCLi_ExecBindCommand(SoclSocket *socket) {
    SoclCommandPacket *packet = SOCLi_CreateCommandPacket(SOCLi_BindCallBack, socket, socket->blocking);
    if (packet == NULL) {
        return -33;
    }
    packet->param.bind.localPort = socket->localPort;
    packet->param.bind.remotePort = socket->remotePort;
    packet->param.bind.remoteIp = socket->remoteIp;
    socket->state |= 2;
    return SOCLi_ExecCommandPacketInRecvPipe(socket, packet);
}

int SOCLi_BindCallBack(SoclCommandPacket *packet) {
    SoclSocket *socket = packet->socket;
    SoclRecvPipe *recvPipe = socket->recvPipe;
    int result = 0;
    OS_LockMutex(&recvPipe->cmd.mutex);
    CPS_SocBind(packet->param.bind.localPort, packet->param.bind.remotePort, packet->param.bind.remoteIp);
    recvPipe->consumed = 0;
    if (packet->socketType == 0 || packet->socketType == 4) {
        result = CPS_TcpConnect();
    }
    OS_UnlockMutex(&recvPipe->cmd.mutex);
    if (result != 0) {
        socket->state |= 0x40;
        return -76;
    }
    socket->state |= 4;
    return 0;
}
