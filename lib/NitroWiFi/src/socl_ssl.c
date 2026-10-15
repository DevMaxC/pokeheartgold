#include "nitrowifi/socl_internal.h"

// SOCL_EnableSsl: switches a TCP socket to SSL (type 4) or back, on its receive pipe.

#pragma force_active on

int SOCL_EnableSsl(int handle, void *ssl) {
    SoclSocket *socket = (SoclSocket *)handle;
    int valid;
    if (SOCL_SocketIsInvalid(socket)) {
        return -28;
    }
    if (!SoclSocket_IsStream(socket)) {
        return -28;
    }
    valid = 0;
    if (socket) {
        valid = (socket->state & 1) != 0;
    }
    if (!valid) {
        return -39;
    }
    if (socket->state & 2) {
        return -28;
    }
    return SOCLi_ExecEnableSslCommand(socket, ssl);
}

int SOCLi_ExecEnableSslCommand(SoclSocket *socket, void *ssl) {
    SoclCommandPacket *packet = SOCLi_CreateCommandPacket(SOCLi_EnableSslCallBack, socket, 1);
    if (!packet) {
        return -33;
    }
    packet->param.ssl = ssl;
    return SOCLi_ExecCommandPacketInRecvPipe(socket, packet);
}

int SOCLi_EnableSslCallBack(SoclCommandPacket *packet) {
    SoclSocket *socket = packet->socket;
    SoclRecvPipe *recvPipe = socket->recvPipe;
    CpsSocket *cps = recvPipe->cmd.thread.specific[0];
    void *ssl;
    OS_LockMutex(&recvPipe->cmd.mutex);
    ssl = packet->param.ssl;
    if (ssl) {
        cps->ssl = ssl;
        CPS_SetSsl(1);
        socket->type = 4;
    } else {
        socket->type = 0;
        CPS_SetSsl(0);
        cps->ssl = NULL;
    }
    OS_UnlockMutex(&recvPipe->cmd.mutex);
    return 0;
}
