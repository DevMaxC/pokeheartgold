#include "nitrowifi/socl_internal.h"

// Socket lists, linked through SoclSocket.next: gSoclSockets (open) and gSoclTrash (closed).

void SOCLi_SocketRegister(SoclSocket *socket) {
    SOCLi_SocketRegisterList(&gSoclSockets, socket);
}

void SOCLi_SocketRegisterList(SoclSocket **list, SoclSocket *socket) {
    socket->next = *list;
    *list = socket;
}

void SOCLi_SocketRegisterTrash(SoclSocket *socket) {
    SOCLi_SocketRegisterList(&gSoclTrash, socket);
}

void SOCLi_SocketUnregister(SoclSocket *socket) {
    SOCLi_SocketUnregisterList(&gSoclSockets, socket);
}

void SOCLi_SocketUnregisterList(SoclSocket **list, SoclSocket *socket) {
    SoclSocket **link = SOCLi_SocketGetNextPtr(list, socket);
    if (link != NULL) {
        *link = socket->next;
    }
}

// Returns the link that points at socket, NULL if it is not in the list.
SoclSocket **SOCLi_SocketGetNextPtr(SoclSocket **list, SoclSocket *socket) {
    SoclSocket *next = *list;
    while (next != NULL) {
        if (next == socket) {
            return list;
        }
        list = &next->next;
        next = next->next;
    }
    return NULL;
}

void SOCLi_SocketUnregisterTrash(SoclSocket *socket) {
    SOCLi_SocketUnregisterList(&gSoclTrash, socket);
}

int SOCL_SocketIsInvalid(SoclSocket *socket) {
    if ((s32)socket <= 0 || SOCLi_SocketGetNextPtr(&gSoclSockets, socket) == NULL) {
        return 1;
    }
    return 0;
}

#pragma force_active on

int SOCL_SocketIsInTrash(SoclSocket *socket) {
    return SOCLi_SocketGetNextPtr(&gSoclTrash, socket) != NULL;
}
