#pragma force_active on
#include <string.h>

#include "global.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

// NAT negotiation: a negotiator sends init packets (from its own socket and optionally the game socket)
// to the two negotiation servers, which pair it with the peer of the same cookie and send both sides
// each other's public address; the peers then ping each other until both have seen the other.
// Starts with the reliable UDP sockets' message size helper.

typedef void (*NatProgressCB)(int state, void *param);
typedef void (*NatCompletedCB)(int result, int socket, void *address, void *param);

typedef enum NatState {
    NAT_STATE_INIT_SENT,  // init packets sent, waiting for the servers' acks
    NAT_STATE_INIT_ACKED, // waiting for the peer's address
    NAT_STATE_CONNECTING, // pinging the peer
    NAT_STATE_CONNECTED,  // both sides have seen each other
    NAT_STATE_FINISHED,   // to be removed
} NatState;

// GameSpy socket layer (BSD names).
#ifndef INVALID_SOCKET
#define INVALID_SOCKET (-1)
#define SOCKET_ERROR   (-1)
#define AF_INET        2
#define SOCK_STREAM    1
#define SOCK_DGRAM     2
#endif

// NAT negotiation protocol version and packet types (byte 7 of a packet)
#define NN_PROTVER      2
#define NN_INIT         0
#define NN_INITACK      1
#define NN_ERTTEST      2
#define NN_ERTACK       3
#define NN_CONNECT      5
#define NN_CONNECT_ACK  6
#define NN_CONNECT_PING 7

// NatInitPacket.portType: which socket / server an init packet goes through
#define NN_PT_GP  0
#define NN_PT_NN1 1
#define NN_PT_NN2 2

// NatConnectPacket.finished
#define FINISHED_NOERROR                     0
#define FINISHED_ERROR_DEADBEAT_PARTNER      1
#define FINISHED_ERROR_INIT_PACKETS_TIMEDOUT 2

// NNBeginNegotiationWithSocket results
enum {
    ne_noerror,
    ne_allocerror,
    ne_socketerror,
    ne_dnserror,
};

typedef struct NatNegotiator {
    int socket;                 // 0x00
    int gameSocket;             // 0x04, -1: negotiate on socket only
    int cookie;                 // 0x08
    int clientIndex;            // 0x0C
    int state;                  // 0x10, NatState
    int initAcked[3];           // 0x14, per init packet
    int retries;                // 0x20
    int maxRetries;             // 0x24
    u32 deadline;               // 0x28
    u32 remoteIp;               // 0x2C
    u16 remotePort;             // 0x30
    u8 gotRemoteData;           // 0x32
    u8 sentAck;                 // 0x33
    NatProgressCB progressCB;   // 0x34
    NatCompletedCB completedCB; // 0x38
    void *param;                // 0x3C
} NatNegotiator;

typedef struct NatGlobals {
    const char *server2Name; // 0x00, NULL: default host name
    const char *server1Name; // 0x04
    u32 server2Ip;           // 0x08
    u32 server1Ip;           // 0x0C
    void *negotiators;       // 0x10, DArray of NatNegotiator
} NatGlobals;

typedef struct NatSockAddr {
    u8 len;
    u8 family;
    u16 port;
    u32 addr;
} NatSockAddr;

typedef struct NatHostEnt {
    char *name;
    char **aliases;
    s16 addrType;
    s16 length;
    u8 **addrList;
} NatHostEnt;

typedef struct NatHostList {
    u32 unk_00; // 0x0
    u32 unk_04; // 0x4
    u32 unk_08; // 0x8
    u32 **addresses;
} NatHostList;

// Init packet (type 0), 22 bytes + game name.
typedef struct NatInitPacket {
    u8 magic[6];
    u8 version;
    u8 type;
    u32 cookie;
    u8 portType; // which of the three init packets
    u8 clientIndex;
    u8 useGameSocket;
    u8 localIp[4];
    u8 localPort[2];
    char gameName[64];
} NatInitPacket;

// Init ack (type 1) and the address check (type 2) sent back as type 3, 21 bytes.
typedef struct NatAckPacket {
    u8 magic[6];
    u8 version;
    u8 type;
    u8 cookie[4];
    u8 portType;
} NatAckPacket;

// Connect (type 5, from the server) and connect ping (type 7, from the peer), 20 bytes.
typedef struct NatConnectPacket {
    u8 magic[6];
    u8 version;
    u8 type;
    u8 cookie[4];
    u32 remoteIp;
    u16 remotePort;
    u8 gotYourData;
    u8 finished; // connect: 0 = ok, 1 / 2 / other = error
} NatConnectPacket;

typedef struct NatPacket20 {
    u8 bytes[20];
} NatPacket20;

typedef struct NatPacket21 {
    u8 bytes[21];
} NatPacket21;

extern const char sStr_Empty_10[]; // ""
extern const u8 NNMagicData[6];  // packet magic
extern const char sFmt_StrDotStr[]; // "%s.%s"
extern const char sStr_Natneg1_GsNintendowifiNet[]; // "natneg1.gs.nintendowifi.net"
extern const char sStr_Natneg2_GsNintendowifiNet[]; // "natneg2.gs.nintendowifi.net"
extern int ov00_0221B0D0[];        // [0] == 1: network available
extern char __GSIACGamename[];       // game name
extern NatGlobals nnNegotiatorList[];
extern u8 nnRecvBuffer[512]; // receive buffer

#define NAT_HTONS(x) ((((x) >> 8) & 0xff) | (((x) << 8) & 0xff00))
#define NAT_HTONL(x) ((((x) >> 24) & 0xff) | (((x) >> 8) & 0xff00) | (((x) << 8) & 0xff0000) | (((x) << 24) & 0xff000000))

extern int snprintf(char *, unsigned int, const char *, ...);
extern int sprintf(char *, const char *, ...);
extern NatHostEnt *SOC_GetHostByName(const char *name);
extern int ArrayLength(void *);
extern void *ArrayNew(int, int, void *);
extern void ArrayFree(void *);
extern void *ArrayNth(void *, int);
extern int ArrayAppend(void *, void *);
extern void ArrayRemoveAt(void *, int);
extern u32 current_time(void);
extern int CanReceiveOnSocket(int);
extern NatHostList *getlocalhost(void);
extern int IsPrivateIP(u32 *);
extern int gsSocketCreate(int, int, int);
extern void gsSocketClose(int);
extern int gsSocketRecvFrom(int, void *, int, int, NatSockAddr *, int *);
extern int gsSocketSendTo(int, void *, int, int, void *, int);
extern int gsSocketGetSockName(int, void *, int *);
extern u32 gsSocketInetAddr(const char *name);

void gti2MessageCheck(char **message, int *len);
NatNegotiator *FindNegotiatorForCookie(int cookie);
void NatNegFreeNegotiator(NatNegotiator *negotiator);
NatNegotiator *AddNegotiator(void);
void RemoveNegotiator(NatNegotiator *negotiator);
void NNFreeNegotiateList(void);
int NatNegCheckMagic(const void *packet);
int NatNegSendPacket(int socket, u32 ip, int port, void *buf, int len);
u32 NatNegGetLocalIP(void);
u16 NatNegGetLocalPort(int socket);
void SendInitPackets(NatNegotiator *negotiator);
void SendPingPacket(NatNegotiator *negotiator);
u32 NatNegNameToIp(const char *name);
u32 NatNegResolveServer(const char *name, const char *defaultName);
int NatNegResolveServers(void);
int NNBeginNegotiationWithSocket(int gameSocket, int cookie, int clientIndex, NatProgressCB progressCB, NatCompletedCB completedCB, void *param);
void NNCancel(int cookie);
void NegotiateThink(void *arg);
void NNThink(void);
void SendConnectAck(NatNegotiator *negotiator, NatSockAddr *from);
void ProcessConnectPacket(NatNegotiator *negotiator, NatConnectPacket *packet, NatSockAddr *from);
void ProcessPingPacket(NatNegotiator *negotiator, NatConnectPacket *packet, NatSockAddr *from);
void NatNegProcessServerPacket(NatNegotiator *negotiator, NatAckPacket *packet, NatSockAddr *from);
void NNProcessData(const u8 *packet, int size, void *from);

// A NULL message is sent as an empty one; a length of -1 means a string including its terminator.
void gti2MessageCheck(char **message, int *len) {
    char *p = *message;
    if (!p) {
        *message = (char *)sStr_Empty_10;
        *len = 0;
        return;
    }
    if (*len == -1) {
        *len = strlen(p) + 1;
    }
}

NatNegotiator *FindNegotiatorForCookie(int cookie) {
    int i;
    NatNegotiator *negotiator;
    if (!nnNegotiatorList->negotiators) {
        return 0;
    }
    for (i = 0; i < ArrayLength(nnNegotiatorList->negotiators); i++) {
        negotiator = ArrayNth(nnNegotiatorList->negotiators, i);
        if (negotiator->cookie == cookie) {
            return negotiator;
        }
    }
    return 0;
}

void NatNegFreeNegotiator(NatNegotiator *negotiator) {
    if (negotiator->socket != INVALID_SOCKET) {
        gsSocketClose(negotiator->socket);
    }
    negotiator->socket = INVALID_SOCKET;
    negotiator->state = NAT_STATE_FINISHED;
}

NatNegotiator *AddNegotiator(void) {
    int buf[16] = { 0 };
    if (!nnNegotiatorList->negotiators) {
        nnNegotiatorList->negotiators = ArrayNew(sizeof(NatNegotiator), 4, NatNegFreeNegotiator);
    }
    ArrayAppend(nnNegotiatorList->negotiators, buf);
    return ArrayNth(nnNegotiatorList->negotiators, ArrayLength(nnNegotiatorList->negotiators) - 1);
}

void RemoveNegotiator(NatNegotiator *negotiator) {
    int i;
    for (i = 0; i < ArrayLength(nnNegotiatorList->negotiators); i++) {
        if (negotiator == ArrayNth(nnNegotiatorList->negotiators, i)) {
            ArrayRemoveAt(nnNegotiatorList->negotiators, i);
            return;
        }
    }
}

void NNFreeNegotiateList(void) {
    if (!nnNegotiatorList->negotiators) {
        return;
    }
    ArrayFree(nnNegotiatorList->negotiators);
    nnNegotiatorList->negotiators = 0;
}

int NatNegCheckMagic(const void *packet) {
    return memcmp(packet, NNMagicData, 6) == 0;
}

int NatNegSendPacket(int socket, u32 ip, int port, void *buf, int len) {
    NatSockAddr address;
    address.addr = ip;
    address.family = AF_INET;
    address.port = NAT_HTONS(port);
    return gsSocketSendTo(socket, buf, len, 0, &address, 8);
}

#pragma opt_propagation off

// The first local address that is not 127.0.0.1 and passes IsPrivateIP.
u32 NatNegGetLocalIP(void) {
    int i;
    NatHostList *host;
    u32 result = 0, value;
    host = getlocalhost();
    if (!host) {
        return result;
    }
    for (i = 0;; i++) {
        u32 *p = host->addresses[i];
        if (!p) {
            break;
        }
        value = *p;
        if (value != 0x0100007f) {
            result = value;
            if (IsPrivateIP(p) != 0) {
                return result;
            }
        }
    }
    return result;
}

#pragma opt_propagation reset

u16 NatNegGetLocalPort(int socket) {
    NatSockAddr address;
    int len = 8;
    if (gsSocketGetSockName(socket, &address, &len) == SOCKET_ERROR) {
        return 0;
    }
    return address.port;
}

// Sends the init packets the servers have not acknowledged yet.
void SendInitPackets(NatNegotiator *negotiator) {
    u8 buf[0x58];
    NatInitPacket *packet = (NatInitPacket *)buf;
    u32 a, b, c, d;
    int len;
    u16 port;
    memcpy(packet->magic, NNMagicData, 6);
    packet->version = NN_PROTVER;
    packet->type = NN_INIT;
    packet->clientIndex = negotiator->clientIndex;
    packet->cookie = NAT_HTONL((u32)negotiator->cookie);
    packet->useGameSocket = negotiator->gameSocket != INVALID_SOCKET;
    a = NatNegGetLocalIP();
    b = NatNegGetLocalIP();
    c = NatNegGetLocalIP();
    d = NatNegGetLocalIP();
    d = ((c >> 24) & 0xff) | ((d >> 8) & 0xff00) | ((b << 8) & 0xff0000) | ((a << 24) & 0xff000000);
    buf[15] = d >> 24;
    buf[16] = d >> 16;
    buf[17] = d >> 8;
    buf[18] = d;
    buf[19] = 0;
    buf[20] = 0;
    strcpy((char *)&buf[21], __GSIACGamename);
    len = strlen(__GSIACGamename) + 22;
    if (packet->useGameSocket && negotiator->initAcked[0] == 0) {
        packet->portType = NN_PT_GP;
        NatNegSendPacket(negotiator->gameSocket, nnNegotiatorList->server1Ip, 0x6cfd, packet, len);
    }
    if (negotiator->initAcked[1] == 0) {
        packet->portType = NN_PT_NN1;
        NatNegSendPacket(negotiator->socket, nnNegotiatorList->server1Ip, 0x6cfd, packet, len);
    }
    port = (u16)(((NatNegGetLocalPort(packet->useGameSocket ? negotiator->gameSocket : negotiator->socket) >> 8) & 0xff) | ((NatNegGetLocalPort(packet->useGameSocket ? negotiator->gameSocket : negotiator->socket) << 8) & 0xff00));
    buf[20] = port;
    buf[19] = port >> 8;
    if (negotiator->initAcked[2] == 0) {
        packet->portType = NN_PT_NN2;
        NatNegSendPacket(negotiator->socket, nnNegotiatorList->server2Ip, 0x6cfd, packet, len);
    }
    negotiator->deadline = current_time() + 500;
    negotiator->maxRetries = 30;
}

// Pings the peer (connect ping, type 7: address the peer is seen at, got its data, finished).
void SendPingPacket(NatNegotiator *negotiator) {
    u8 buf[20];
    int socket;
    memcpy(buf, NNMagicData, 6);
    buf[6] = NN_PROTVER;
    buf[7] = NN_CONNECT_PING;
    *(u32 *)(buf + 8) = NAT_HTONL((u32)negotiator->cookie);
    *(u32 *)(buf + 12) = negotiator->remoteIp;
    *(u16 *)(buf + 16) = NAT_HTONS(negotiator->remotePort);
    buf[18] = negotiator->gotRemoteData;
    buf[19] = (negotiator->state != NAT_STATE_CONNECTING);
    socket = negotiator->gameSocket;
    if (socket == INVALID_SOCKET) {
        socket = negotiator->socket;
    }
    NatNegSendPacket(socket, negotiator->remoteIp, negotiator->remotePort, buf, 20);
    negotiator->deadline = current_time() + 700;
    negotiator->maxRetries = 12;
    if (negotiator->gotRemoteData) {
        negotiator->sentAck = 1;
    }
}

u32 NatNegNameToIp(const char *name) {
    NatHostEnt *host;
    u32 addr = gsSocketInetAddr(name);
    if (addr != (u32)-1) {
        return addr;
    }
    host = SOC_GetHostByName(name);
    if (host == NULL) {
        return 0;
    }
    return *(u32 *)host->addrList[0];
}

// Resolves name, or "<game name>.<defaultName>" when name is NULL.
u32 NatNegResolveServer(const char *name, const char *defaultName) {
    char buf[128];
    if (!name) {
        snprintf(buf, 128, sFmt_StrDotStr, __GSIACGamename, defaultName);
        name = buf;
    }
    return NatNegNameToIp(name);
}

int NatNegResolveServers(void) {
    if (!nnNegotiatorList->server1Ip) {
        nnNegotiatorList->server1Ip = NatNegResolveServer(nnNegotiatorList->server1Name, sStr_Natneg1_GsNintendowifiNet);
    }
    if (!nnNegotiatorList->server2Ip) {
        nnNegotiatorList->server2Ip = NatNegResolveServer(nnNegotiatorList->server2Name, sStr_Natneg2_GsNintendowifiNet);
    }
    if (!nnNegotiatorList->server1Ip || !nnNegotiatorList->server2Ip) {
        return 0;
    }
    return 1;
}

int NNBeginNegotiationWithSocket(int gameSocket, int cookie, int clientIndex, NatProgressCB progressCB, NatCompletedCB completedCB, void *param) {
    NatNegotiator *negotiator;
    if (ov00_0221B0D0[0] != 1) {
        return ne_socketerror;
    }
    if (!NatNegResolveServers()) {
        return ne_dnserror;
    }
    negotiator = AddNegotiator();
    if (!negotiator) {
        return ne_allocerror;
    }
    negotiator->gameSocket = gameSocket;
    negotiator->clientIndex = clientIndex;
    negotiator->cookie = cookie;
    negotiator->progressCB = progressCB;
    negotiator->completedCB = completedCB;
    negotiator->param = param;
    negotiator->socket = gsSocketCreate(AF_INET, SOCK_DGRAM, 0);
    negotiator->retries = 0;
    negotiator->gotRemoteData = 0;
    negotiator->sentAck = 0;
    negotiator->remoteIp = 0;
    negotiator->remotePort = 0;
    negotiator->maxRetries = 0;
    if (negotiator->socket == INVALID_SOCKET) {
        RemoveNegotiator(negotiator);
        return ne_socketerror;
    }
    SendInitPackets(negotiator);
    return ne_noerror;
}

void NNCancel(int cookie) {
    NatNegotiator *negotiator = FindNegotiatorForCookie(cookie);
    if (!negotiator) {
        return;
    }
    if (negotiator->socket != INVALID_SOCKET) {
        gsSocketClose(negotiator->socket);
    }
    negotiator->socket = INVALID_SOCKET;
    negotiator->state = NAT_STATE_FINISHED;
}

void NegotiateThink(void *arg) {
    NatNegotiator *negotiator = arg;
    NatSockAddr remote;
    int size = 8;
    NatSockAddr address;
    if (negotiator->state == NAT_STATE_FINISHED) {
        RemoveNegotiator(negotiator);
        return;
    }
    if (negotiator->socket != size - 9) {
        for (;;) {
            if (CanReceiveOnSocket(negotiator->socket) == 0) {
                break;
            }
            int got = gsSocketRecvFrom(negotiator->socket, nnRecvBuffer, 512, 0, &remote, &size);
            if (got == SOCKET_ERROR) {
                break;
            }
            NNProcessData(nnRecvBuffer, got, &remote);
            if (negotiator->state == NAT_STATE_FINISHED || negotiator->socket == INVALID_SOCKET) {
                break;
            }
        }
    }
    if ((negotiator->state == NAT_STATE_INIT_SENT || negotiator->state == NAT_STATE_CONNECTING) && current_time() > negotiator->deadline) {
        if (negotiator->retries > negotiator->maxRetries) {
            negotiator->completedCB(2, -1, 0, negotiator->param);
            NNCancel(negotiator->cookie);
        } else {
            negotiator->retries++;
            if (negotiator->state == NAT_STATE_INIT_SENT) {
                SendInitPackets(negotiator);
            } else {
                SendPingPacket(negotiator);
            }
        }
    }
    if (negotiator->state == NAT_STATE_CONNECTED && current_time() > negotiator->deadline) {
        if (negotiator->gameSocket == INVALID_SOCKET) {
            address.family = AF_INET;
            address.port = (u16)((u8)(negotiator->remotePort >> 8) | ((negotiator->remotePort << 8) & 0xff00));
            address.addr = negotiator->remoteIp;
            negotiator->completedCB(0, negotiator->socket, &address, negotiator->param);
            negotiator->socket = INVALID_SOCKET;
        }
        NNCancel(negotiator->cookie);
    }
    if (negotiator->state == NAT_STATE_INIT_ACKED && current_time() > negotiator->deadline) {
        negotiator->completedCB(1, -1, 0, negotiator->param);
        NNCancel(negotiator->cookie);
    }
}

void NNThink(void) {
    int i;
    if (!nnNegotiatorList->negotiators) {
        return;
    }
    for (i = ArrayLength(nnNegotiatorList->negotiators) - 1; i >= 0; i--) {
        NegotiateThink(ArrayNth(nnNegotiatorList->negotiators, i));
    }
}

// Acknowledges the server's connect packet (type 6, with the client index).
void SendConnectAck(NatNegotiator *negotiator, NatSockAddr *from) {
    u8 buf[21];
    memcpy(buf, NNMagicData, 6);
    buf[6] = NN_PROTVER;
    buf[7] = NN_CONNECT_ACK;
    buf[13] = negotiator->clientIndex;
    *(u32 *)(buf + 8) = NAT_HTONL((u32)negotiator->cookie);
    NatNegSendPacket(negotiator->socket, from->addr, (u16)NAT_HTONS(from->port), buf, 21);
}

// Connect packet from the server: the peer's address, or an error.
void ProcessConnectPacket(NatNegotiator *negotiator, NatConnectPacket *packet, NatSockAddr *from) {
    int err;
    if (packet->finished == FINISHED_NOERROR) {
        SendConnectAck(negotiator, from);
    }
    if (negotiator->state >= NAT_STATE_CONNECTING) {
        return;
    }
    if (packet->finished != FINISHED_NOERROR) {
        err = 3;
        if (packet->finished == FINISHED_ERROR_DEADBEAT_PARTNER) {
            err = 1;
        } else if (packet->finished == FINISHED_ERROR_INIT_PACKETS_TIMEDOUT) {
            err = 2;
        }
        ((void (*)(int, int, int, void *))negotiator->completedCB)(err, -1, 0, negotiator->param);
        NNCancel(negotiator->cookie);
        return;
    }
    negotiator->remoteIp = packet->remoteIp;
    negotiator->remotePort = NAT_HTONS(packet->remotePort);
    negotiator->retries = 0;
    negotiator->state = NAT_STATE_CONNECTING;
    negotiator->progressCB(negotiator->state, negotiator->param);
    SendPingPacket(negotiator);
}

// Ping from the peer.
void ProcessPingPacket(NatNegotiator *negotiator, NatConnectPacket *packet, NatSockAddr *from) {
    if (negotiator->state < NAT_STATE_CONNECTING) {
        return;
    }
    negotiator->remoteIp = from->addr;
    negotiator->remotePort = NAT_HTONS(from->port);
    negotiator->gotRemoteData = 1;
    if (!packet->gotYourData) {
        SendPingPacket(negotiator);
        return;
    }
    if (negotiator->state == NAT_STATE_CONNECTING) {
        if (!negotiator->sentAck) {
            SendPingPacket(negotiator);
        }
        negotiator->state = NAT_STATE_CONNECTED;
        negotiator->deadline = current_time() + 5000;
        if (negotiator->gameSocket == INVALID_SOCKET) {
            return;
        }
        negotiator->completedCB(0, negotiator->gameSocket, from, negotiator->param);
        return;
    }
    if (!packet->finished) {
        SendPingPacket(negotiator);
    }
}

// Init ack (type 1) and address check (type 2) packets from the servers.
void NatNegProcessServerPacket(NatNegotiator *negotiator, NatAckPacket *packet, NatSockAddr *from) {
    switch (packet->type) {
    case NN_INITACK:
        if (packet->portType > 2) {
            return;
        }
        negotiator->initAcked[packet->portType] = 1;
        if (negotiator->state != NAT_STATE_INIT_SENT) {
            return;
        }
        if (negotiator->initAcked[1] == 0 || negotiator->initAcked[2] == 0) {
            return;
        }
        if (negotiator->gameSocket != INVALID_SOCKET && negotiator->initAcked[0] == 0) {
            return;
        }
        negotiator->state = NAT_STATE_INIT_ACKED;
        negotiator->deadline = current_time() + 10000;
        negotiator->progressCB(negotiator->state, negotiator->param);
        break;
    case NN_ERTTEST:
        packet->type = NN_ERTACK;
        NatNegSendPacket(negotiator->socket, from->addr, (u16)NAT_HTONS(from->port), packet, 0x15);
        break;
    }
}

// Handles a received negotiation packet.
void NNProcessData(const u8 *packet, int size, void *from) {
    struct {
        NatPacket21 large;
        u8 padding[3];
        NatPacket20 small;
    } locals;

    int type;
    NatNegotiator *negotiator;
    if (!NatNegCheckMagic(packet)) {
        return;
    }
    type = packet[7];
    if (type == NN_CONNECT || type == NN_CONNECT_PING) {
        if (size < 20) {
            return;
        }
        locals.small = *(const NatPacket20 *)packet;
        negotiator = FindNegotiatorForCookie(NAT_HTONL(*(u32 *)(locals.small.bytes + 8)));
        if (!negotiator) {
            return;
        }
        if (type == NN_CONNECT) {
            ProcessConnectPacket(negotiator, (NatConnectPacket *)&locals.small, from);
        } else {
            ProcessPingPacket(negotiator, (NatConnectPacket *)&locals.small, from);
        }
    } else {
        if (size < 21) {
            return;
        }
        locals.large = *(const NatPacket21 *)packet;
        negotiator = FindNegotiatorForCookie(NAT_HTONL(*(u32 *)(locals.large.bytes + 8)));
        if (!negotiator) {
            return;
        }
        NatNegProcessServerPacket(negotiator, (NatAckPacket *)&locals.large, from);
    }
}
