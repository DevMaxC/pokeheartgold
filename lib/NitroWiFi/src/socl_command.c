#include "nitrowifi/socl_internal.h"

// Command packets: a fixed pool of 0x2C-byte packets kept in a message queue, posted to the message
// queue of a socket's pipe and run by the pipe's thread (SOCLi_CommandPacketHandler).

typedef struct SoclCommandReply {
    OSMessage message[1];
    OSMessage result;
    OSMessageQueue queue;
} SoclCommandReply;

int SOCLi_StartupCommandPacketQueue(int count) {
    int packetBytes = (count * sizeof(SoclCommandPacket) + 3) & ~3;
    int arrayBytes = ((count << 2) + 3) & ~3;
    u8 *memory;
    u8 *packet;
    void *(*alloc)(int) = (void *(*)(int))gSoclConfig->alloc;

    memory = alloc(packetBytes + arrayBytes);
    if (memory == NULL) {
        return -1;
    }
    OS_InitMessageQueue(&gSoclCommandPacketQueue, (OSMessage *)memory, count);
    packet = memory + arrayBytes;
    while (count > 0) {
        SOCLi_FreeCommandPacket((SoclCommandPacket *)packet);
        count--;
        packet += sizeof(SoclCommandPacket);
    }
    gSoclCommandPackets.memory = memory;
    return 0;
}

int SOCLi_CleanupCommandPacketQueue(void) {
    void (*free)(void *);
    if (gSoclCommandPackets.queue.usedCount < gSoclCommandPackets.queue.msgCount) {
        return -1;
    }
    free = gSoclConfig->free;
    free(gSoclCommandPackets.memory);
    gSoclCommandPackets.memory = NULL;
    return 0;
}

SoclCommandPacket *SOCLi_AllocCommandPacket(int flags) {
    SoclCommandPacket *packet;
    if (OS_ReceiveMessage(&gSoclCommandPacketQueue, (OSMessage *)&packet, flags)) {
        return packet;
    }
    return NULL;
}

SoclCommandPacket *SOCLi_CreateCommandPacket(SoclCommandHandler handler, SoclSocket *socket, int flags) {
    SoclCommandPacket *packet = SOCLi_AllocCommandPacket(flags);
    if (packet == NULL) {
        return packet;
    }
    packet->handler = handler;
    packet->socket = socket;
    packet->reply = NULL;
    packet->socketType = socket->type;
    packet->flags = flags;
    return packet;
}

void SOCLi_FreeCommandPacket(SoclCommandPacket *packet) {
    if (packet != NULL) {
        OS_SendMessage(&gSoclCommandPacketQueue, packet, OS_MESSAGE_NOBLOCK);
    }
}

SoclCommandPipe *SOCLi_GetCtrlPipe(SoclSocket *socket) {
    SoclCommandPipe *pipe = &socket->recvPipe->cmd;
    if (pipe == NULL) {
        pipe = &socket->sendPipe->cmd;
    }
    return pipe;
}

int SOCLi_SendCommandPacket(SoclCommandPipe *pipe, SoclCommandPacket *packet) {
    int flags;
    int result;
    if (packet == NULL || (packet->flags & 1) != 0) {
        flags = OS_MESSAGE_BLOCK;
    } else {
        flags = OS_MESSAGE_NOBLOCK;
    }
    result = OS_SendMessage(&pipe->queue, packet, flags);
    if (result == 0) {
        SOCLi_FreeCommandPacket(packet);
    }
    return result ? 0 : -42;
}

int SOCLi_SendCommandPacketToCtrlPipe(SoclSocket *socket, SoclCommandPacket *packet) {
    return SOCLi_SendCommandPacket(SOCLi_GetCtrlPipe(socket), packet);
}

int SOCLi_ExecCommandPacket(SoclCommandPipe *pipe, SoclCommandPacket *packet) {
    SoclCommandReply reply;
    if (packet->flags == 1) {
        OS_InitMessageQueue(&reply.queue, reply.message, 1);
        packet->reply = &reply.queue;
        SOCLi_SendCommandPacket(pipe, packet);
        OS_ReceiveMessage(&reply.queue, &reply.result, OS_MESSAGE_BLOCK);
    } else {
        packet->reply = NULL;
        reply.result = (OSMessage)SOCLi_SendCommandPacket(pipe, packet);
    }
    return (int)reply.result;
}

int SOCLi_ExecCommandPacketInRecvPipe(SoclSocket *socket, SoclCommandPacket *packet) {
    return SOCLi_ExecCommandPacket(&socket->recvPipe->cmd, packet);
}

int SOCLi_ExecCommandPacketInSendPipe(SoclSocket *socket, SoclCommandPacket *packet) {
    return SOCLi_ExecCommandPacket(&socket->sendPipe->cmd, packet);
}

int SOCLi_ExecCommandPacketInCtrlPipe(SoclSocket *socket, SoclCommandPacket *packet) {
    return SOCLi_ExecCommandPacket(SOCLi_GetCtrlPipe(socket), packet);
}

// Thread of a command pipe: runs the posted packets until it reads a NULL packet. The packet stays in
// the queue while it runs (OS_ReadMessage), so a full queue blocks the senders.
void SOCLi_CommandPacketHandler(void *arg) {
    OSMessageQueue *queue = arg;
    SoclCommandPacket *packet;
    int noblock = OS_MESSAGE_NOBLOCK;
    int block = OS_MESSAGE_BLOCK;
    OSIntrMode enabled;
    int result;

    for (;;) {
        OS_ReadMessage(queue, (OSMessage *)&packet, block);
        if (packet == NULL) {
            return;
        }
        result = packet->handler(packet);
        enabled = OS_DisableInterrupts();
        OS_DisableScheduler();
        OS_ReceiveMessage(queue, NULL, noblock);
        if (packet->socket != NULL) {
            packet->socket->result = result;
        }
        if (packet->reply != NULL) {
            OS_SendMessage(packet->reply, (OSMessage)result, noblock);
        }
        SOCLi_FreeCommandPacket(packet);
        OS_EnableScheduler();
        OS_RestoreInterrupts(enabled);
    }
}
