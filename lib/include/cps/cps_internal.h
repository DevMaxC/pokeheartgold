#ifndef POKEHEARTGOLD_CPS_INTERNAL_H
#define POKEHEARTGOLD_CPS_INTERNAL_H

#include <nitro.h>

#include "cps/cps_types.h"

// libCPS TCP/IP stack internals: the stack state, the ARP cache, the IP fragment table and the packet
// headers. Two threads run the stack: tcpip (receives and dispatches the frames the wireless driver
// put into the receive ring) and scavenger (time-outs, DHCP lease). A thread that uses a socket keeps
// its CpsSocket in OSThread.specific[0]; the receive side finds sockets by walking the thread list.
// Packets are in network byte order and only 2-byte aligned: 32-bit fields are read as two u16 halves.

// gCpsState: the stack state (the receive ring offsets are shared with the WCM callback). Some of its fields have their own labels (gCpsAlloc, gCpsFree and the
// address-named ones in the asm .bss) that other code uses directly.
typedef struct CpsState {
    u8 sendFailed;                   // 0x00, the last WCM send failed
    u8 addressConflict;              // 0x01, another host answered an ARP for our address
    u16 mss;                         // 0x02, MTU - 40 (CpsConfig.mss, default 1460)
    u16 pingSeq;                     // 0x04
    u16 ipId;                        // 0x06, identification of the last IP datagram sent
    u16 ephemeralPort;               // 0x08, last local port handed out
    u8 unk_0A[2];                    //
    int status;                      // 0x0C, CPS_STATUS_* (the argument of the last reset_network_vars)
    u32 staticIp;                    // 0x10, CpsConfig.staticIp
    void *(*alloc)(u32 size);        // 0x14 (label gCpsAlloc)
    void (*addressCallback)(void);   // 0x18
    u32 netmask;                     // 0x1C
    u32 dhcpServer;                  // 0x20, DHCP server identifier
    u32 yieldSleep;                  // 0x24, CpsConfig.yieldSleep: OS_Sleep time of OS_YieldThread__ (0: yield)
    volatile u32 recvHead;           // 0x28, write offset in the receive ring
    u32 gateway;                     // 0x2C
    volatile u32 recvTail;           // 0x30, read offset in the receive ring
    u32 requestedIp;                 // 0x34, CpsConfig.dhcpRequestIp
    u32 dhcpRetry;                   // 0x38, seconds to the next renewal attempt
    void (*scavengerCallback)(void); // 0x3C
    void (*free)(void *ptr);         // 0x40 (label gCpsFree)
    u32 calmDown;                    // 0x44, the scavenger is asked to stop
    int (*linkIsOn)(void);           // 0x48
    u32 leaseTime;                   // 0x4C, DHCP lease (seconds)
    u32 hostIp;                      // 0x50, 0: no address (yet)
    OSThread *recvWaiter;            // 0x54, the tcpip thread while it waits for a frame
    u8 *recvRing;                    // 0x58, CpsConfig.work: received frames, u16 size + frame each
    volatile u32 recvRingSize;       // 0x5C
    u32 dns[2];                      // 0x60
    u64 random;                      // 0x68, linear congruential generator state
    u64 randomMul;                   // 0x70
    u64 randomAdd;                   // 0x78
} CpsState;

// ARP cache entry (gCpsArpCache, 8 entries). The tick column has its own label, gCpsArpCacheTick
// (index 6 * entry as u16).
typedef struct CpsArpEntry {
    u32 ip;    // 0x00, 0: free
    u8 mac[6]; // 0x04
    u16 tick;  // 0x0A, OS_GetTick() >> 16 at the last use
} CpsArpEntry;

// Reassembly of a fragmented IP datagram (gCpsFragments, 8 entries).
typedef struct CpsFragment {
    u32 source;   // 0x00, sender address
    u16 count;    // 0x04, fragments received (0: entry free)
    u16 id;       // 0x06, IP identification
    u16 end;      // 0x08, end of the datagram in 8-byte units, known once the last fragment arrived
    u16 total;    // 0x0A, payload length
    u16 start[8]; // 0x0C, received ranges in 8-byte units
    u16 stop[8];  // 0x1C
    s32 tick;     // 0x2C, OS_GetTick() >> 16 at the first fragment
    u8 *data;     // 0x30, payload in buffer
    u8 *buffer;   // 0x34, alloc'ed: 14 bytes link header room, the IP header, the payload
} CpsFragment;

// Frame headers (network byte order).
typedef struct CpsArpPacket {
    u16 hardware;    // 0x00, 1 (Ethernet)
    u16 protocol;    // 0x02, 0x0800
    u16 sizes;       // 0x04, hardware size 6, protocol size 4
    u16 operation;   // 0x06, 1 request, 2 reply
    u8 senderMac[6]; // 0x08
    u16 senderIp[2]; // 0x0E
    u8 targetMac[6]; // 0x12
    u16 targetIp[2]; // 0x18
} CpsArpPacket;

typedef struct CpsIpHeader {
    u8 versionAndLength; // 0x00, 0x45: version 4, header length in words
    u8 tos;              // 0x01
    u16 totalLength;     // 0x02
    u16 id;              // 0x04
    u16 fragment;        // 0x06, flags (0x2000 more fragments) and offset in 8-byte units
    u8 ttl;              // 0x08
    u8 protocol;         // 0x09, 1 ICMP, 6 TCP, 17 UDP
    u16 checksum;        // 0x0A
    u16 source[2];       // 0x0C
    u16 dest[2];         // 0x10
} CpsIpHeader;

typedef struct CpsIcmpHeader {
    u8 type; // 0 echo reply, 8 echo request
    u8 code;
    u16 checksum;
    u16 id;
    u16 sequence;
} CpsIcmpHeader;

typedef struct CpsUdpHeader {
    u16 sourcePort;
    u16 destPort;
    u16 length;
    u16 checksum;
} CpsUdpHeader;

typedef struct CpsTcpHeader {
    u16 sourcePort; // 0x00
    u16 destPort;   // 0x02
    u16 seq[2];     // 0x04
    u16 ack[2];     // 0x08
    u8 dataOffset;  // 0x0C, header length in words << 4
    u8 flags;       // 0x0D, CPS_TCP_*
    u16 window;     // 0x0E
    u16 checksum;   // 0x10
    u16 urgent;     // 0x12
    u8 options[];   // 0x14
} CpsTcpHeader;

#define CPS_TCP_FIN 0x01
#define CPS_TCP_SYN 0x02
#define CPS_TCP_RST 0x04
#define CPS_TCP_PSH 0x08
#define CPS_TCP_ACK 0x10

// CpsSocket.state
#define CPS_STATE_CLOSED      0
#define CPS_STATE_LISTEN      1
#define CPS_STATE_SYN_SENT    2
#define CPS_STATE_SYN_RCVD    3
#define CPS_STATE_ESTABLISHED 4
#define CPS_STATE_CLOSE_WAIT  6
#define CPS_STATE_FIN_WAIT_1  7
#define CPS_STATE_FIN_WAIT_2  8
#define CPS_STATE_LAST_ACK    9
#define CPS_STATE_DATAGRAM    10 // UDP socket
#define CPS_STATE_PING        11 // ICMP echo

// CpsSocket.waiting: what its thread sleeps on
#define CPS_WAIT_CONNECT  1
#define CPS_WAIT_DATA     2
#define CPS_WAIT_DATAGRAM 3

#define CPS_LOOPBACK 0x7F000001

// CpsState.status
#define CPS_STATUS_NO_LINK    1
#define CPS_STATUS_DHCP       2
#define CPS_STATUS_LEASE_LOST 3
#define CPS_STATUS_CONFLICT   4

// How a module declares gCpsState changes the code the compiler generates; three modules use the
// declaration of their original objects: cps_ping.c sees a const object (its reads may move across
// the packet stores; its one write goes through a cast), cps_ip_frag.c a const array, cps_resolve.c
// a byte array.
#if defined(CPS_STATE_BYTES)
extern u8 gCpsState[];
#elif defined(CPS_STATE_CONST_ARRAY)
extern const CpsState gCpsState[];
#elif defined(CPS_STATE_CONST)
extern const CpsState gCpsState;
#else
extern CpsState gCpsState;
#endif
extern CpsArpEntry gCpsArpCache[8];
extern u16 gCpsArpCacheTick[];
extern CpsFragment gCpsFragments[8];
extern u8 gCpsMacAddress[6];
extern u8 gCpsBroadcastMac[6];
extern u8 gCpsLlcSnapHeader[8]; // AA AA 03 00 00 00 08 00 (IPv4 over 802.11)
extern u32 gCpsThreadPriority;
extern OSThread gCpsTcpipThread;
extern OSThread gCpsScavengerThread;
extern CpsSocket gCpsRstSocket;
extern u8 gCpsTcpipStack[0x800]; // the scavenger's stack ends here
// SSL random generator state (cps_ssl_random.c); the tcpip thread's stack ends at its address
typedef struct CpsSslRandomState {
    u8 seeded;        // CPS_SslAddRandomSeed was called
    u32 sessionCount; // SSL server: session ids handed out
} CpsSslRandomState;
extern CpsSslRandomState gCpsSslRandomState;
extern u16 _021D4720[]; // see tcp_send_rst
extern u8 gCpsTcpSendHeader[];  // TCP header of the segments the tcpip thread sends
extern const char _version_UBIQUITOUS_CPS[];
void OSi_ReferSymbol(const void *symbol);
int WCM_SendDCFDataEx(const u8 *destination, const void *header, int headerSize, const void *data, int dataSize);

static inline u16 CpsSwap16(u16 value) {
    return (value >> 8) | (value << 8);
}

// 32-bit field of a packet (two network-order halves)
static inline u32 CpsRead32(const u16 *p) {
    return ((u32)CpsSwap16(p[0]) << 16) | CpsSwap16(p[1]);
}

static inline CpsSocket *CpsThread_GetSocket(OSThread *thread) {
    return thread->specific[0];
}

// cps_reset.c / cps_util.c / cps_startup.c
void reset_network_vars(int value);
void OS_YieldThread__(void);
void empty_func(void);
int default_link_is_on(void);
void CPS_Startup(CpsConfig *config);

// cps_control.c
int CPS_CalmDown(void);
void CPS_SetScavengerCallback(void *callback);
void CPS_Cleanup(void);
void CPS_SetThreadPriority(u32 priority);

// cps_link.c
u32 calc_checksum_do(const void *data, u32 length, u32 sum);
u16 invert_checksum(u16 sum);
u16 calc_checksum(const void *data, u32 length);
int check_tcpudpsum(const void *data, u32 length, const CpsIpHeader *ip, u32 protocol);
int ip_islocal(u32 ip);
u32 get_targetip(u32 ip);
int is_broadcast(u32 ip);
int is_multicast(u32 ip);
int ip_isme(u32 ip);
int maccmp(const u16 *a, const u16 *b);
void send_packet(u8 *frame, int length, void *extra, int extraLength);
void put_in_buffer(const void *dest, const void *source, u8 *data, u32 length, const void *extra, u32 extraLength);
void CPSi_RecvCallbackFunc(void *dest, void *source, void *data, u32 length);
u8 *receive_packet(u32 *length);
void throw_packet(void);

// cps_arp.c
u8 *inq_arpcache(u32 ip);
void send_arprequest(u32 ip);
u8 *arprequest(u32 ip);
void reg_arpcache(const u8 *mac, u32 ip, int create);

// cps_send.c / cps_ping.c / cps_send_transport.c
void send_ether(u8 *packet, int length, void *extra, int extraLength, u32 ip, u16 type);
void send_ip_frag(u8 *data, int length, void *extra, int extraLength, u32 ip, u32 fragment);
void send_ip(u8 *data, u32 length, u8 *extra, u32 extraLength, u32 ip, u8 protocol);
void send_ping(u8 *data, u32 length, CpsSocket *socket);
void send_udp(const void *data, int length, CpsSocket *socket);
void send_tcp(void *data, u32 length, CpsSocket *socket, int flags, int arg); // arg: unused

// cps_recv.c
void reply_arp(CpsArpPacket *arp);
void dispatch_arp(CpsArpPacket *arp, u32 length);
void reply_icmp(CpsIpHeader *ip, CpsIcmpHeader *icmp, u32 length);
void process_icmp_reply(CpsIpHeader *ip, CpsIcmpHeader *icmp, u32 length);
int valid_IP(u32 source, u32 dest);
void dispatch_icmp(CpsIpHeader *ip, CpsIcmpHeader *icmp, u32 length);

// cps_tcp.c
CpsSocket *check_listener(CpsIpHeader *ip, CpsTcpHeader *tcp);
int check_socket(CpsIpHeader *ip, CpsTcpHeader *tcp, CpsSocket *socket);
CpsSocket *find_socket(CpsIpHeader *ip, CpsTcpHeader *tcp);
void parse_mss(CpsTcpHeader *tcp, CpsSocket *socket);
int no_need_inq(u32 ip);
void tcp_send_handshake(CpsSocket *socket, int flags, int arg);
void tcp_send_ack(CpsSocket *socket, int arg);
void tcp_send_finack(CpsSocket *socket, int arg);
void tcp_send_rst(CpsIpHeader *ip, CpsTcpHeader *tcp, u32 length, int arg);
void dt_syn_LISTEN(CpsIpHeader *ip, CpsTcpHeader *tcp, CpsSocket *socket);
int find_specific_socket(CpsIpHeader *ip, CpsTcpHeader *tcp, u32 length);
void dt_syn(CpsIpHeader *ip, CpsTcpHeader *tcp, u32 length);
void dt_synack(CpsIpHeader *ip, CpsTcpHeader *tcp, u32 length);
void dt_ack(CpsIpHeader *ip, CpsTcpHeader *tcp, u32 length);
void dt_fin(CpsIpHeader *ip, CpsTcpHeader *tcp, u32 length);
void dt_rst(CpsIpHeader *ip, CpsTcpHeader *tcp);
void dispatch_tcp(CpsIpHeader *ip, CpsTcpHeader *tcp, u32 length);

// cps_udp.c / cps_ip_frag.c / cps_ip.c
void dispatch_udp(CpsIpHeader *ip, CpsUdpHeader *udp, u32 length);
CpsIpHeader *check_frag(CpsIpHeader *ip, int *allocated);
void dispatch_ip(CpsIpHeader *ip, u32 length);
void tcpip(void *arg);
void scavenger(void *arg);

// socket API (cps_socket.c, cps_tcp_write.c)
u16 CPS_SocGetEport(void);
u32 get_seqno(void);
void CPS_SocRegister(CpsSocket *socket);
void CPS_SocUnRegister(void);
void CPS_SocDatagramMode(void);
void CPS_SocBind(u16 localPort, u16 remotePort, u32 remoteIp);
void CPS_SocUse(void);
void CPS_SocRelease(void);
void CPS_SocDup(OSThread *thread);
void CPSi_TcpListenRaw(CpsSocket *socket);
void CPS_SetUdpCallback(void *callback);
void CPS_TcpListen(void);
int CPSi_TcpConnectRaw(CpsSocket *socket);
int CPS_TcpConnect(void);
u32 CPS_SocWho(u16 *remotePort, u32 *localIp);
void CPSi_TcpShutdownRaw(CpsSocket *socket);
void CPS_TcpShutdown(void);
void CPS_TcpClose(void);
void *udp_read_raw(u32 *length, CpsSocket *socket);
void *CPSi_TcpReadRaw(u32 *length, CpsSocket *socket);
void *CPS_SocRead(u32 *length);
void CPSi_SocConsumeRaw(u32 length, CpsSocket *socket);
void CPS_SocConsume(u32 length);
u32 tcp_write_do(void *data, u32 length, CpsSocket *socket, int force);
int tcp_write_do2(void *data, u32 length, void *data2, u32 length2, CpsSocket *socket, int force);
u32 CPSi_TcpWrite2Raw(const u8 *data, u32 length, const u8 *data2, u32 length2, CpsSocket *socket);
u32 CPSi_SocWrite2(void *data, u32 length, void *data2, u32 length2);
u32 CPS_SocWrite(void *data, u32 length);
int CPS_SocGetLength(void);
void CPS_SocFlush(void);
u32 CPS_Resolve(char *name);

// SSL (cps_ssl*.c)
void CPSi_SslListen(CpsSocket *socket);
int CPSi_SslConnect(CpsSocket *socket);
void *CPSi_SslRead(u32 *length, CpsSocket *socket);
void CPSi_SslConsume(u32 length, CpsSocket *socket);
int CPSi_SslGetLength(CpsSocket *socket);
int CPSi_SslWrite2(u8 *data, u32 length, u8 *data2, int length2, CpsSocket *socket);
void CPSi_SslShutdown(CpsSocket *socket);
void CPSi_SslClose(CpsSocket *socket);
void CPS_SetSsl(int enable);
void CPSi_SslPeriodical(int now);
void CPSi_SslCleanup(void);

#endif // POKEHEARTGOLD_CPS_INTERNAL_H
