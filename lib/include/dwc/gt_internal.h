#ifndef POKEHEARTGOLD_LIB_INCLUDE_DWC_GT_INTERNAL_H
#define POKEHEARTGOLD_LIB_INCLUDE_DWC_GT_INTERNAL_H

// GameSpy socket layer (BSD names).
#ifndef INVALID_SOCKET
#define INVALID_SOCKET (-1)
#define SOCKET_ERROR   (-1)
#define AF_INET        2
#define SOCK_STREAM    1
#define SOCK_DGRAM     2
#endif

// Reliable UDP sockets of OVY_0 (lib/NitroDWC/src/gt_socket.c): sockets, connections, their message
// buffers and the callbacks into the user code.

typedef struct GTSocket GTSocket;

// Why a connection was closed (passed to the closed callback).
typedef enum GTCloseReason {
    GT_CLOSE_LOCAL,  // closed by this side
    GT_CLOSE_REMOTE, // closed by the peer
    GT_CLOSE_ERROR,
    GT_CLOSE_ERROR_3,
    GT_CLOSE_FATAL_ERROR,
} GTCloseReason;

// GT2 connection states (GTConn.state).
enum {
    GTI2AwaitingServerChallenge, // client: sent the client challenge
    GTI2AwaitingAcceptReject,    // client: sent the client response
    GTI2AwaitingClientChallenge, // server: new incoming connection
    GTI2AwaitingClientResponse,  // server: sent the server challenge
    GTI2AwaitingAcceptance,      // server: waiting for the application to accept or reject
    GTI2Connected,
    GTI2Closing,
    GTI2Closed,
};

// GT2 protocol message types (third byte of a protocol message).
enum {
    GTI2MsgAppReliable,
    GTI2MsgClientChallenge,
    GTI2MsgServerChallenge,
    GTI2MsgClientResponse,
    GTI2MsgAccept,
    GTI2MsgReject,
    GTI2MsgClose,
    GTI2MsgKeepAlive,
    GTI2NumReliableMessages,
    GTI2MsgAck = 100,
    GTI2MsgNack,
    GTI2MsgPing,
    GTI2MsgPong,
    GTI2MsgClosed,
};

// GT2 results (connect / create socket results, connected callback result).
enum {
    GT2Success,
    GT2OutOfMemory,
    GT2Rejected,
    GT2NetworkError,
    GT2AddressError,
    GT2DuplicateAddress,
    GT2TimedOut,
    GT2NegotiationError,
};

typedef struct GTConn GTConn;

typedef struct GTCallbacks {
    void *connected;
    void *received;
    void *closed;
    void *ping;
} GTCallbacks;

typedef void (*GTConnectedCB)(GTConn *, int, u8 *, int);
typedef void (*GTReceivedCB)(GTConn *, u8 *, int, int);
typedef void (*GTClosedCB)(GTConn *, int);
typedef void (*GTPingCB)(GTConn *, int);
typedef void (*GTFilterCB)(GTConn *, int, u8 *, int, int);
typedef void (*GTSockErrCB)(GTSocket *, GTConn *, u32, u16, int, u8 *, int);
typedef int (*GTUnrecCB)(GTSocket *, u32, u16, u8 *, int);

struct GTSocket {
    int handle;                              // 0x00
    u32 ip;                                  // 0x04
    u16 port;                                // 0x08
    void *connections;                       // 0x0c
    void *closedConnections;                 // 0x10
    int close;                               // 0x14
    int error;                               // 0x18
    int callbackLevel;                       // 0x1c
    int (*connectAttemptCB)();               // 0x20, see gti2ConnectAttemptCallback
    void (*socketErrorCB)(GTSocket *socket); // 0x24, see gti2SocketErrorCallback
    GTSockErrCB sendDumpCallback;                       // 0x28
    GTSockErrCB receiveDumpCallback;                       // 0x2c
    GTUnrecCB unrecognizedCB;                // 0x30
    int unk_34;                              // 0x34
    int outgoingBufferSize;                  // 0x38
    int incomingBufferSize;                  // 0x3c
    u32 unk_40;                              // 0x40
};

typedef struct GTBuffer {
    u8 *buffer;
    int size;
    int len;
} GTBuffer;

typedef struct GTOutMsg {
    int start;  // 0x0
    int len;    // 0x4
    u16 serial; // 0x8
    u16 pad;
    u32 lastSend; // 0xc
} GTOutMsg;

typedef struct GTInMsg {
    int start;  // 0x0
    int len;    // 0x4
    int type;   // 0x8
    u16 serial; // 0xc
} GTInMsg;

struct GTConn {
    u32 ip;                         // 0x00
    u16 port;                       // 0x04
    GTSocket *socket;               // 0x08
    int state;                      // 0x0c
    int initiated;                  // 0x10
    int freeAtAcceptReject;         // 0x14
    int connectionResult;           // 0x18
    u32 startTime;                  // 0x1c
    u32 timeout;                    // 0x20
    int callbackLevel;              // 0x24
    GTCallbacks callbacks;          // 0x28
    u8 *initialMessage;             // 0x38
    int initialMessageLen;          // 0x3c
    void *data;                     // 0x40
    GTBuffer incomingBuffer;        // 0x44
    GTBuffer outgoingBuffer;        // 0x50
    void *incomingBufferedMessages; // 0x5c
    void *outgoingBufferedMessages; // 0x60
    u16 serialNumber;               // 0x64
    u16 expectedSerialNumber;       // 0x66
    u8 response[32];                // 0x68
    u32 lastSend;                   // 0x88
    u32 challengeTime;              // 0x8c
    int pendingAck;                 // 0x90
    u32 pendingAckTime;             // 0x94
    void *sendFilters;              // 0x98
    void *receiveFilters;           // 0x9c
};

typedef struct GTFilter {
    GTFilterCB callback;
} GTFilter;

typedef struct GTSockAddr {
    u8 len;
    u8 family;
    u16 port;
    u32 addr;
} GTSockAddr;

// gt_socket.c
int gti2ConnectedCallback(GTConn *conn, int result, u8 *msg, int len);
int gti2ReceivedCallback(GTConn *conn, u8 *msg, int len, int reliable);
int gti2ClosedCallback(GTConn *conn, int reason);
int gti2PingCallback(GTConn *conn, int latency);
int gti2SendFilterCallback(GTConn *conn, int index, u8 *msg, int len, int reliable);
int gti2ReceiveFilterCallback(GTConn *conn, int index, u8 *msg, int len, int reliable);
int gti2DumpCallback(GTSocket *socket, GTConn *conn, u32 ip, u16 port, int reset, u8 *msg, int len, int fatal);
int gti2UnrecognizedMessageCallback(GTSocket *socket, u32 ip, u16 port, u8 *msg, int len, int *handled);
int gti2NewOutgoingConnection(GTSocket *socket, GTConn **conn, u32 ip, u16 port);
int gti2NewIncomingConnection(GTSocket *socket, GTConn **conn, u32 ip, u16 port);
int gti2StartConnectionAttempt(GTConn *conn, u8 *msg, int len, GTCallbacks *callbacks);
int gti2AcceptConnection(GTConn *conn, GTCallbacks *callbacks);
void gti2RejectConnection(GTConn *conn, u8 *msg, int len);
int gti2ConnectionSendData(GTConn *conn, u8 *msg, int len);
int gti2CheckConnectionTimeout(GTConn *conn, u32 now);
int gti2ResendTimedOutMessages(GTConn *conn, u32 now);
int gti2SendPendingAck(GTConn *conn, u32 now);
int gti2SendKeepAliveIfIdle(GTConn *conn, u32 now);
int gti2ConnectionThink(GTConn *conn, u32 now);
void gti2CloseConnection(GTConn *conn, int hard);
void gti2ConnectionClosed(GTConn *conn);
void gti2ConnectionCleanup(GTConn *conn);
int gt2CreateSocket(void *a, void *b, void *c, void *d, void *e);
void gt2CloseSocket(GTSocket *socket);
void gt2Think(GTSocket *socket);
int gt2Listen(void *a, void *b, void *c, void *d);
int gt2Accept(GTConn *conn, GTCallbacks *callbacks);
void gt2Reject(GTConn *conn, u8 *msg, int len);
int gt2Connect(GTSocket *socket, GTConn **connp, const char *address, u8 *msg, int len, u32 timeout, GTCallbacks *callbacks, int blocking);
void gt2Send(GTConn *conn, u8 *msg, int len, int reliable);
void gt2CloseConnectionHard(GTConn *conn);
void gti2CloseConnectionHardMap(GTConn **conn);
void gt2CloseAllConnectionsHard(GTSocket *socket);
u16 gt2GetLocalPort(GTSocket *socket);
int gt2GetOutgoingBufferFreeSpace(GTConn *conn);
u32 gt2GetSocketSOCKET(GTConn *conn);
void gt2SetUnrecognizedMessageCallback(GTSocket *socket, GTUnrecCB cb);
void gt2SetConnectionData(GTConn *conn, void *data);
void *gt2GetConnectionData(GTConn *conn);
u16 gti2ReadUShort(u8 *buf, int off);
void gti2WriteUShort(u8 *buf, int off, u16 val);
s16 gti2SerialNumberDiff(u16 a, u16 b);
int gti2ConnectionError(GTConn *conn, int result, GTCloseReason reason);
int gti2ConnectionCommunicationError(GTConn *conn);
int gti2ConnectionOutOfMemoryError(GTConn *conn);
int gti2RemoveAckedMessages(GTConn *conn, u16 ack);
int gti2HandleAppUnreliable(GTConn *conn, u8 *msg, int len);
int gti2HandleAppReliable(GTConn *conn, u8 *msg, int len);
int gti2HandleClientChallenge(GTConn *conn, u8 *msg, int len);
int gti2HandleServerChallenge(GTConn *conn, u8 *msg, int len);
int gti2HandleClientResponse(GTConn *conn, u8 *msg, int len);
int gti2HandleAccept(GTConn *conn);
int gti2HandleReject(GTConn *conn, u8 *msg, int len);
int gti2HandleClose(GTConn *conn);
int gti2DeliverReliableMessage(GTConn *conn, int type, u8 *msg, int len);
s16 gti2IncomingMessageCompare(GTInMsg *a, GTInMsg *b);
int gti2BufferIncomingMessage(GTConn *conn, int type, u16 serial, u8 *msg, int len, int *overflow);
void gti2RemoveIncomingMessage(GTConn *conn, GTInMsg *msg, int index);
int gti2DeliverBufferedMessages(GTConn *conn);
void gti2QueueAck(GTConn *conn);
int gti2HandleReliableMessage(GTConn *conn, int type, u8 *msg, int len);
int gti2HandleAck(GTConn *conn, u8 *msg, int len);
int gti2HandleNack(GTConn *conn, u8 *msg, int len);
int gti2HandlePing(GTConn *conn, u8 *msg, int len);
int gti2HandlePong(GTConn *conn, u8 *msg, int len);
int gti2HandleClosed(GTConn *conn);
int gti2HandleUnreliableMessage(GTConn *conn, int type, u8 *msg, int len);
int gti2HandleMessage(GTSocket *socket, u8 *msg, int len, u32 ip, u16 port);
int gti2HandleConnectionReset(GTSocket *socket, u32 ip, u16 port);
int gti2ReceiveMessages(GTSocket *socket);

// gt_buffer.c (gti2ConnectAttemptCallback takes int arguments but gt_socket.c declares it with a u16 port)
BOOL gti2VerifyChallenge(const u8 *buf);
u8 *gti2GetChallenge(u8 *buf);
char *gti2GetResponse(char *out, const char *key);
int gti2CheckResponse(u8 *a, u8 *b);
int gti2AllocateBuffer(GTBuffer *buffer, int size);
int gti2GetBufferFreeSpace(GTBuffer *buffer);
void gti2BufferWriteByte(GTBuffer *buffer, u8 c);
void gti2BufferWriteUShort(GTBuffer *buffer, int v);
void gti2BufferWriteData(GTBuffer *buffer, const void *src, int n);
void gti2BufferShorten(GTBuffer *buffer, int pos, int n);
int gti2SocketErrorCallback(GTSocket *socket);

#endif // POKEHEARTGOLD_LIB_INCLUDE_DWC_GT_INTERNAL_H
