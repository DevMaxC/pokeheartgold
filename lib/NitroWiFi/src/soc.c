#include "nitrowifi/socl_internal.h"

// SOC_* socket interface: SOCL calls with addresses in network byte order.

#pragma force_active on

int SOC_Socket(int domain, int type, int protocol) {
    if (type == 1) {
        return SOCL_CreateSocket(&gSoclTcpSocketParam);
    }
    return SOCL_CreateSocket(&gSoclUdpSocketParam);
}

int SOC_Bind(int socket, SocAddress *address, int length) {
    return SOCL_Bind(socket, Socl_Swap16(address->port));
}

int SOC_Connect(int socket, SocAddress *address, int length) {
    return SOCL_Connect(socket, Socl_Swap16(address->port), Socl_Swap32(address->ip));
}

int SOC_Recv(int socket, void *buffer, int length, int flags) {
    return SOCL_ReadFrom(socket, buffer, length, NULL, NULL, flags);
}

int SOC_RecvFrom(int socket, void *buffer, int length, int flags, SocAddress *volatile from, int fromLength) {
    u16 port;
    u32 ip;
    SocAddress *address;
    int result = SOCL_ReadFrom(socket, buffer, length, &port, &ip, flags);
    if (result < 0) {
        return result;
    }
    address = from;
    if (address == NULL) {
        return result;
    }
    address->port = Socl_Swap16(port);
    address->ip = Socl_Swap32(ip);
    return result;
}

int SOC_Send(int socket, const void *data, int length, int flags) {
    return SOCL_WriteTo(socket, data, length, 0, 0, flags);
}

int SOC_SendTo(int socket, const void *data, int length, int flags, SocAddress *to) {
    u16 port;
    u32 ip;
    if (to) {
        port = Socl_Swap16(to->port);
        ip = Socl_Swap32(to->ip);
    } else {
        port = 0;
        ip = 0;
    }
    return SOCL_WriteTo(socket, data, length, port, ip, flags);
}

int SOC_Shutdown(int socket, int how) {
    return SOCL_Shutdown(socket);
}

int SOC_Close(int socket) {
    return SOCL_Close(socket);
}
