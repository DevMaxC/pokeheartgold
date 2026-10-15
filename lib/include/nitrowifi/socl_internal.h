#ifndef POKEHEARTGOLD_NITROWIFI_SOCL_INTERNAL_H
#define POKEHEARTGOLD_NITROWIFI_SOCL_INTERNAL_H

#include <nitro.h>

#include "cps/cps_types.h"

// NitroWiFi socket layer (SOCL) on top of the libCPS TCP/IP stack. Every socket owns a receive and/or a
// send command pipe: a thread that runs the command packets posted to its message queue.

// SOCL_Startup parameters (owned by the caller, gSoclConfig points at them).
typedef struct SoclConfig {
    int useDhcp;              // 0x00
    u32 hostIp;               // 0x04, fixed address (useDhcp == 0)
    u32 netmask;              // 0x08
    u32 gateway;              // 0x0C
    u32 dns[2];               // 0x10
    void *(*alloc)(u32 size); // 0x18
    void (*free)(void *ptr);  // 0x1C
    u32 commandPacketCount;   // 0x20
    u32 cpsWorkSize;          // 0x24, 0: 0x4000
    void *cpsWork;            // 0x28, NULL: allocated (and freed by SOCL_Cleanup)
    int threadPriority;       // 0x2C, 0: 11
    int mtu;                  // 0x30, 0: 576
    int recvBufSize;          // 0x34, 0: 0x10C0 (TCP sockets)
} SoclConfig;

// Stack size, priority and queue length of a command pipe thread.
typedef struct SoclPipeParam {
    u16 stackSize;
    u8 priority;
    u8 queueLength;
} SoclPipeParam;

// Socket creation parameters (SOCL_CreateSocket).
typedef struct SoclSocketParam {
    s8 type;                // 0x00, SoclSocket.type
    s8 blocking;            // 0x01
    u16 recvBufSize;        // 0x02, 0: no receive pipe
    u16 consumeMin;         // 0x04
    u16 sendBufSize;        // 0x06, 0: no send pipe (uses the control socket's)
    u16 unk_08;             // 0x08, size of CpsSocket.unk_50
    u16 writeBufSize;       // 0x0A, size of CpsSocket.writeBuf
    u16 sendRingSize;       // 0x0C
    u16 udpMax;             // 0x0E
    SoclPipeParam recvPipe; // 0x10
    SoclPipeParam sendPipe; // 0x14
} SoclSocketParam;

// Socket address of the SOC_* interface (network byte order).
typedef struct SocAddress {
    u8 length;
    u8 family;
    u16 port;
    u32 ip;
} SocAddress;

typedef struct SocInAddr {
    u32 addr;
} SocInAddr;

typedef struct SocPollFd {
    int fd;
    s16 events;
    s16 revents;
} SocPollFd;

typedef struct SocHostEnt {
    char *name;
    char **aliases;
    s16 addrType;
    s16 length;
    char **addrList;
} SocHostEnt;

// SOC_Startup parameters
typedef struct SocConfig {
    u32 unk_00;
    void *(*alloc)(int id, u32 size);          // 0x04
    void (*free)(int id, void *ptr, u32 size); // 0x08
    int mode;                                  // 0x0C, 1: DHCP
    u32 hostIp;                                // 0x10
    u32 netmask;                               // 0x14
    u32 gateway;                               // 0x18
    u32 dns[2];                                // 0x1C
    u32 unk_24[2];
    int mtu;         // 0x2C
    int recvBufSize; // 0x30
} SocConfig;

typedef struct SocState {
    u32 hostIp;                                // SOC_GetHostByName result
    void (*free)(int id, void *ptr, u32 size); // 0x04, SocConfig.free
    u32 unk_08;
    void *(*alloc)(int id, u32 size); // 0x0C, SocConfig.alloc
    u32 unk_10[2];
} SocState;

typedef struct SocHostEntWork {
    char *addrList[2];
    SocHostEnt hostEnt;
    u8 unk_18[0x10];
} SocHostEntWork;

struct SoclSocket;
struct SoclCommandPacket;

typedef int (*SoclCommandHandler)(struct SoclCommandPacket *packet);

// Command packet (0x2C bytes), taken from gSoclCommandPacketQueue and run by a pipe thread.
typedef struct SoclCommandPacket {
    SoclCommandHandler handler; // 0x00
    struct SoclSocket *socket;  // 0x04
    OSMessageQueue *reply;      // 0x08, receives the handler's result (blocking commands)
    s8 socketType;              // 0x0C
    s8 flags;                   // 0x0D, 1: blocking, 3: blocking write of a stream socket
    u8 unk_0E[2];

    union {
        struct {
            u16 localPort;
            u16 remotePort;
            u32 remoteIp;
        } bind;

        struct {
            u16 localPort;
            u16 *remotePort;
            u32 *remoteIp;
        } accept;

        struct {
            void *buffer;
            u32 length;
            u16 *remotePort;
            u32 *remoteIp;
        } read;

        struct {
            u8 *data;       // 0x10, first part (up to the end of the ring)
            int length;     // 0x14
            u8 *wrapData;   // 0x18, second part (from the start of the ring)
            int wrapLength; // 0x1C
            u16 ringEnd;    // 0x20, write index after this packet
            u16 unk_22;
            u16 localPort;  // 0x24
            u16 remotePort; // 0x26
            u32 remoteIp;   // 0x28, 0: connected socket
        } write;

        void *ssl;
    } param;
} SoclCommandPacket;

typedef struct SoclCommandPipe {
    OSMessageQueue queue; // 0x00
    OSThread thread;      // 0x20, its specific[0] is the CpsSocket the thread works on
    OSMutex mutex;        // 0xE0
} SoclCommandPipe;

// Received datagram, queued on the receive pipe.
typedef struct SoclUdpPacket {
    struct SoclUdpPacket *next;
    u16 length;
    u16 remotePort;
    u32 remoteIp;
    u8 data[];
} SoclUdpPacket;

typedef struct SoclRecvPipe {
    SoclCommandPipe cmd; // 0x000
    s32 consumed;        // 0x0F8, bytes read from CpsSocket.recvBuf, not yet consumed
    u16 consumeMin;      // 0x0FC
    s8 peek;             // 0x0FE, read without consuming
    u8 unk_FF;
    SoclUdpPacket *udpTail;          // 0x100
    SoclUdpPacket *volatile udpHead; // 0x104
    u16 udpBytes;                    // 0x108
    u16 udpMax;                      // 0x10A
    OSThreadQueue udpWait;           // 0x10C
} SoclRecvPipe;

typedef struct SoclSendPipe {
    SoclCommandPipe cmd;       // 0x000
    CpsSocketBuffer ring;      // 0x0F8
    u16 ringWrite;             // 0x100
    u16 ringRead;              // 0x102
    OSThreadQueue ringWait;    // 0x104
    struct SoclSocket *socket; // 0x10C
} SoclSendPipe;

// type: 0 TCP, 1 UDP, 2 control (send pipe only), 4 TCP over SSL.
// state bits: 1 created, 2 bind/connect/listen issued, 4 connected, 8 shut down, 0x10 closing,
// 0x20 closed, 0x40 connect failed, 0x80 reset.
typedef struct SoclSocket {
    CpsSocket cps;           // 0x00
    SoclRecvPipe *recvPipe;  // 0x64
    SoclSendPipe *sendPipe;  // 0x68
    int result;              // 0x6C, result of the last command
    volatile s16 state;      // 0x70
    s8 blocking;             // 0x72
    s8 type;                 // 0x73
    u16 localPort;           // 0x74
    u16 remotePort;          // 0x76
    u32 remoteIp;            // 0x78
    struct SoclSocket *next; // 0x7C, gSoclSockets / gSoclTrash list
} SoclSocket;

// SOCL state (asm .bss, in this order). Some functions address the whole block through its first label.
typedef struct SoclState {
    u32 yieldSleep;         // CpsConfig.yieldSleep
    u32 lastIp;             // 0x04, address to ask DHCP for again
    u32 addressState;       // 0x08, bit 0: DHCP, bit 1: address known
    SoclSocket *ctrlSocket; // 0x0C
    CpsConfig cpsConfig;    // 0x10
} SoclState;

typedef struct SoclCommandPacketPool {
    void *memory;
    OSMessageQueue queue;
} SoclCommandPacketPool;

extern SoclState gSoclState;
extern u32 gSoclLastIp;
extern u32 gSoclAddressState;
extern SoclSocket *gSoclCtrlSocket;
extern CpsConfig gSoclCpsConfig;
extern SoclCommandPacketPool gSoclCommandPackets;
extern OSMessageQueue gSoclCommandPacketQueue; // gSoclCommandPackets.queue
extern u32 gSoclUdpDropCount[2];               // no memory, receive pipe full
extern SoclSocket *gSoclSockets;
extern SoclSocket *gSoclTrash;

extern SoclConfig *gSoclConfig;
extern int _0211062C;
extern SoclSocketParam gSoclUdpSocketParam;
extern SoclSocketParam gSoclTcpSocketParam;
extern SoclSocketParam gSoclCtrlSocketParam;
extern u8 _version_NINTENDO_WiFi[];

// SOC state: gSocState and gSocHostEntWork (soc_gethostbyname.c), then asm .bss. SOC_Startup addresses
// all of it through gSocState.
typedef struct SocStatics {
    SocState state;          // 0x00
    SocHostEntWork hostEnt;  // 0x18
    SoclConfig soclConfig;   // 0x40
    char inetNtoABuffer[16]; // 0x78
    char hostName[0x101];    // 0x88
} SocStatics;

extern SocState gSocState;
extern SocHostEntWork gSocHostEntWork;
extern SoclConfig gSocSoclConfig;
extern char gSocInetNtoABuffer[16];
extern char gSocHostName[0x101];
extern char sFmt_IntDotIntDotIntDotInt[]; // "%d.%d.%d.%d"

// libCPS addresses (asm .bss)
extern u32 gSoclHostAddress;    // host address
extern u32 gSoclNetmask;    // netmask
extern u32 gSoclGateway;    // gateway
extern u32 gCpsDnsServers[2]; // DNS servers

static inline BOOL SoclSocket_IsCreated(SoclSocket *socket) {
    BOOL result = FALSE;
    if (socket == NULL) {
        goto end;
    }
    if (socket->state & 1) {
        result = TRUE;
    }
end:
    return result;
}

static inline BOOL SoclSocket_IsStream(SoclSocket *socket) {
    BOOL result = TRUE;
    if (socket->type != 0 && socket->type != 4) {
        result = FALSE;
    }
    return result;
}

static inline u16 Socl_Swap16(u16 value) {
    return ((value >> 8) & 0xFF) | ((value << 8) & 0xFF00);
}

static inline u32 Socl_Swap32(u32 value) {
    return ((value >> 24) & 0xFF) | ((value >> 8) & 0xFF00) | ((value << 8) & 0xFF0000) | ((value << 24) & 0xFF000000);
}

// socl_startup.c
int SOCL_Startup(SoclConfig *config);
int SOCLi_StartupSOCL(void);
void SOCLi_StartupCPS(void);
void SOCLi_SetMyIP(void);
void SOCLi_DhcpTimeout(void);
int SOCL_LinkIsOn(void);

// socl_command.c
int SOCLi_StartupCommandPacketQueue(int count);
int SOCLi_CleanupCommandPacketQueue(void);
SoclCommandPacket *SOCLi_AllocCommandPacket(int flags);
SoclCommandPacket *SOCLi_CreateCommandPacket(SoclCommandHandler handler, SoclSocket *socket, int flags);
void SOCLi_FreeCommandPacket(SoclCommandPacket *packet);
SoclCommandPipe *SOCLi_GetCtrlPipe(SoclSocket *socket);
int SOCLi_SendCommandPacket(SoclCommandPipe *pipe, SoclCommandPacket *packet);
int SOCLi_SendCommandPacketToCtrlPipe(SoclSocket *socket, SoclCommandPacket *packet);
int SOCLi_ExecCommandPacket(SoclCommandPipe *pipe, SoclCommandPacket *packet);
int SOCLi_ExecCommandPacketInRecvPipe(SoclSocket *socket, SoclCommandPacket *packet);
int SOCLi_ExecCommandPacketInSendPipe(SoclSocket *socket, SoclCommandPacket *packet);
int SOCLi_ExecCommandPacketInCtrlPipe(SoclSocket *socket, SoclCommandPacket *packet);
void SOCLi_CommandPacketHandler(void *pipe);

// socl_socket.c
int SOCL_CreateSocket(const SoclSocketParam *param);
int SOCLi_CreateSocketCallBack(SoclCommandPacket *packet);
SoclSocket *SOCLi_StartupSocket(const SoclSocketParam *param);
int SOCLi_GetSizeSocket(const SoclSocketParam *param);
int SOCLi_GetSizeCommandPipe(const SoclPipeParam *param);
u8 *SOCLi_InitSocket(SoclSocket *socket, const SoclSocketParam *param);
u8 *SOCLi_InitSocketBuffer(u8 *cursor, CpsSocketBuffer *buffer, u32 size);
u8 *SOCLi_InitCommandPipe(u8 *cursor, SoclCommandPipe *pipe, const SoclPipeParam *param);
int SOCL_Listen(int socket);
int SOCL_Accept(int socket, u16 *remotePort, u32 *remoteIp);
int SOCL_ListenAccept(int socket, u16 *remotePort, u32 *remoteIp);
int SOCLi_ListenAcceptCallBack(SoclCommandPacket *packet);
int SOCL_Bind(int socket, u16 localPort);
int SOCL_Connect(int socket, u16 remotePort, u32 remoteIp);
int SOCLi_ExecBindCommand(SoclSocket *socket);
int SOCLi_BindCallBack(SoclCommandPacket *packet);

// socl_read.c
int SOCL_ReadFrom(int socket, void *buffer, int length, u16 *remotePort, u32 *remoteIp, int flags);
int SOCLi_ReadAndConsumeBuffer(SoclSocket *socket, void *buffer, int length, u16 *remotePort, u32 *remoteIp, int block, int flags);
int SOCLi_ReadBuffer(SoclSocket *socket, void *buffer, int length, u16 *remotePort, u32 *remoteIp, int block);
int SOCLi_CopyCPSBuffer(SoclSocket *socket, void *buffer, int length, u16 *remotePort, u32 *remoteIp);
u8 *SOCLi_ReadCPSBuffer(SoclSocket *socket, s32 *available, u16 *localPort, u16 *remotePort, u32 *remoteIp);
int SOCLi_ExecReadCommand(SoclSocket *socket, void *buffer, int length, u16 *remotePort, u32 *remoteIp);
int SOCLi_ReadCallBack(SoclCommandPacket *packet);
int SOCLi_ConsumeBuffer(SoclSocket *socket);
int SOCLi_ConsumeCallBack(SoclCommandPacket *packet);
int SOCLi_ConsumeCPSBuffer(SoclSocket *socket);
int SOCLi_ReadUdpBuffer(SoclSocket *socket, void *buffer, int length, u16 *remotePort, u32 *remoteIp, int block);
int SOCLi_UdpRecvCallback(const void *data, u32 length, SoclSocket *socket);

// socl_write.c
int SOCL_WriteTo(int socket, const void *data, int length, u16 remotePort, u32 remoteIp, int flags);
int SOCLi_WriteBuffer(SoclSocket *socket, const void *data, int length, u16 remotePort, u32 remoteIp, int block);
int SOCLi_AllocWriteBuffer(SoclSocket *socket, int length, int minimum, int *offset, int block);
int SOCLi_GetWriteBufferFreeSize(SoclSocket *socket);
int SOCLi_ExecWriteCommand(SoclSocket *socket, const void *data, int length, int offset, u16 remotePort, u32 remoteIp, int flags);
int SOCLi_WriteCallBack(SoclCommandPacket *packet);
int SOCLi_GetOptimumSendBufLen(int size);
int SOCLi_MemCpy(u8 *dest, int size, SoclCommandPacket *packet);

// socl_close.c
int SOCL_Shutdown(int socket);
int SOCLi_ShutdownCallBack(SoclCommandPacket *packet);
int SOCL_IsClosed(int socket);
int SOCL_Close(int socket);
int SOCLi_CloseCallBack(SoclCommandPacket *packet);
void SOCLi_CleanupSocket(SoclSocket *socket);
void SOCLi_FreeCommandPipe(SoclCommandPipe *pipe);
void SOCLi_TrashSocket(void);
int SOCL_Cleanup(void);
int SOCL_CloseAll(void);
int SOCL_CalmDown(void);

// socl_resolver.c, socl_status.c, socl_list.c
u32 SOCL_Resolve(const char *name);
u32 SOCL_InetAtoH(const char *name);
int SOCL_SetResolver(u32 primary, u32 secondary);
u32 SOCL_GetHostID(void);
int SOCL_GetStatus(int socket);
int SOCLi_GetReadBufferOccpiedSize(SoclSocket *socket);
int SOCLi_RoundUp4(int size);
void SOCLi_SocketRegister(SoclSocket *socket);
void SOCLi_SocketRegisterList(SoclSocket **list, SoclSocket *socket);
void SOCLi_SocketRegisterTrash(SoclSocket *socket);
void SOCLi_SocketUnregister(SoclSocket *socket);
void SOCLi_SocketUnregisterList(SoclSocket **list, SoclSocket *socket);
SoclSocket **SOCLi_SocketGetNextPtr(SoclSocket **list, SoclSocket *socket);
void SOCLi_SocketUnregisterTrash(SoclSocket *socket);
int SOCL_SocketIsInvalid(SoclSocket *socket);
int SOCL_SocketIsInTrash(SoclSocket *socket);

// soc.c
int SOC_Socket(int domain, int type, int protocol);
int SOC_Bind(int socket, SocAddress *address, int length);
int SOC_Connect(int socket, SocAddress *address, int length);
int SOC_Recv(int socket, void *buffer, int length, int flags);
int SOC_RecvFrom(int socket, void *buffer, int length, int flags, SocAddress *volatile from, int fromLength);
int SOC_Send(int socket, const void *data, int length, int flags);
int SOC_SendTo(int socket, const void *data, int length, int flags, SocAddress *to);
int SOC_Shutdown(int socket, int how);
int SOC_Close(int socket);
SocHostEnt *SOC_GetHostByName(const char *name);
int SOC_GetSockName(int socket, SocAddress *address, int length);
u32 SOC_GetHostID(void);
int SOC_SetResolver(u32 *primary, u32 *secondary);
int SOC_Listen(int socket, int backlog);
int SOC_Accept(int socket, SocAddress *address, int length);
int SOC_Fcntl(int socket, int command, int flags);
void *AllocFunc_SOCL(u32 size);
void FreeFunc_SOCL(u32 *block);
int SOC_Startup(SocConfig *config);
int SOC_Cleanup(void);
char *SOC_InetNtoA(SocInAddr address);
int SOC_InetAtoN(const char *name, u32 *ip);
char *SOC_InetNtoP(int family, const void *address, char *buffer, u32 length);
void SOC_U32to4U8(u32 value, u8 *bytes);
int SOC_Poll(SocPollFd *fds, u32 count, s64 timeout);

// socl_ssl.c
int SOCL_EnableSsl(int socket, void *ssl);
int SOCLi_ExecEnableSslCommand(SoclSocket *socket, void *ssl);
int SOCLi_EnableSslCallBack(SoclCommandPacket *packet);

void OSi_ReferSymbol(const void *symbol);
int STD_CopyLString(char *dest, const char *src, int length);

// libCPS / WCM functions used by SOCL
void CPS_Startup(CpsConfig *config);
void CPS_Cleanup(void);
int CPS_CalmDown(void);
void CPS_SetThreadPriority(u32 priority);
void CPS_SetScavengerCallback(void *callback);
void CPS_SetUdpCallback(void *callback);
void CPSi_RecvCallbackFunc(void *a, void *b, void *c, u32 d);
void CPS_SocRegister(CpsSocket *socket);
void CPS_SocUnRegister(void);
void CPS_SocDup(OSThread *thread);
void CPS_SocUse(void);
void CPS_SocRelease(void);
void CPS_SocDatagramMode(void);
void CPS_SocBind(u16 localPort, u16 remotePort, u32 remoteIp);
u32 CPS_SocWho(u16 *remotePort, u32 *remoteIp);
u16 CPS_SocGetEport(void);
void *CPS_SocRead(u32 *length);
void CPS_SocConsume(u32 length);
u32 CPS_SocWrite(void *data, u32 length);
void CPS_TcpListen(void);
int CPS_TcpConnect(void);
void CPS_TcpShutdown(void);
void CPS_TcpClose(void);
u32 CPS_Resolve(char *name);
void CPS_SetSsl(int enable);
u8 *WCM_GetApMacAddress(void);
void WCM_SetRecvDCFCallback(void (*callback)(void *, void *, void *, u32));

#endif // POKEHEARTGOLD_NITROWIFI_SOCL_INTERNAL_H
