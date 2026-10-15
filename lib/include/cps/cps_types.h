#ifndef POKEHEARTGOLD_CPS_TYPES_H
#define POKEHEARTGOLD_CPS_TYPES_H

#include <nitro.h>

// libCPS types that the NitroWiFi socket layer (SOCL) shares with the TCP/IP stack.

// Buffer of a CPS socket (receive, send, ...), set up by SOCLi_InitSocketBuffer.
typedef struct CpsSocketBuffer {
    s32 size;
    u8 *data;
} CpsSocketBuffer;

// Socket of the TCP/IP stack, registered with CPS_SocRegister by the thread that uses it (it is that
// thread's OSThread.specific[0]). A SOCL socket starts with one. Sequence numbers are host order.
typedef struct CpsSocket {
    OSThread *thread;  // 0x00, the owner
    u32 waiting;       // 0x04, what the owner sleeps on (CPS_WAIT_*), 0: running
    u8 state;          // 0x08, TCP state (CPS_STATE_*), 4 = connection established
    u8 sslEnabled;     // 0x09
    u16 localPort;     // 0x0A (ping: sequence number of the echo request)
    void *ssl;         // 0x0C
    s32 tick;          // 0x10, OS_GetTick() >> 16 when the connection set-up started
    u32 localIp;       // 0x14
    u16 remotePort;    // 0x18, peer (datagram sockets: sender of the datagram being received)
    u16 boundRemotePort; // 0x1A, CPS_SocBind remote port: remotePort again after a datagram / failed accept
    u32 remoteIp;      // 0x1C
    u32 boundRemoteIp;   // 0x20, CPS_SocBind remote address
    u32 recvNext;      // 0x24, next sequence number expected from the peer
    u32 sendNext;      // 0x28, sequence number of the next byte sent
    u16 sendWindow;    // 0x2C, window the peer advertised
    u16 mss;           // 0x2E, maximum segment size of the peer
    u32 sendAcked;     // 0x30, highest sequence number the peer acknowledged
    u32 recvSegments;  // 0x34
    int (*udpCallback)(u8 *data, u32 length, struct CpsSocket *socket); // 0x38, nonzero: datagram consumed
    CpsSocketBuffer recvBuf;  // 0x3C
    s32 recvLength;           // 0x44, bytes received into recvBuf
    CpsSocketBuffer sendBuf;  // 0x48, frame being built (link, IP and TCP/UDP headers first)
    CpsSocketBuffer unk_50;   //
    CpsSocketBuffer writeBuf; // 0x58, CPS_SocWrite collects small writes here
    u32 writeLength;          // 0x60
} CpsSocket;

// Start-up parameters of the stack (CPS_Startup).
typedef struct CpsConfig {
    u32 staticIp;                  // 0x00, nonzero: fixed address, no DHCP
    void *(*alloc)(u32 size);      // 0x04
    void (*free)(void *ptr);       // 0x08
    void (*addressCallback)(void); // 0x0C, the address is known (or DHCP gave up)
    int (*linkIsOn)(void);         // 0x10
    u64 randomSeed;                // 0x14, 0: OS_GetTick()
    void *work;                    // 0x1C
    u32 workSize;                  // 0x20
    int mss;                       // 0x24, MTU - 40
    u32 dhcpRequestIp;             // 0x28
    u32 yieldSleep;                // 0x2C, OS_Sleep time when the stack yields (0: OS_YieldThread)
} CpsConfig;

#endif // POKEHEARTGOLD_CPS_TYPES_H
