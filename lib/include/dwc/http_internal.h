#ifndef POKEHEARTGOLD_LIB_INCLUDE_DWC_HTTP_INTERNAL_H
#define POKEHEARTGOLD_LIB_INCLUDE_DWC_HTTP_INTERNAL_H

// GameSpy socket layer (BSD names).
#ifndef INVALID_SOCKET
#define INVALID_SOCKET (-1)
#define SOCKET_ERROR   (-1)
#define AF_INET        2
#define SOCK_STREAM    1
#define SOCK_DGRAM     2
#endif

// HTTP client of OVY_38 (lib/NitroDWC/src/http_connection.c, http_request.c): connection slots,
// growable text buffers, request/response state machine and POST bodies.

typedef struct GHIConnection GHIConnection;

typedef struct GHIBuffer {
    GHIConnection *connection;
    char *data;
    int size;
    int len;
    int pos;
    int sizeIncrement;
    int fixed;    // user-supplied storage, never grows
    int dontFree; // data is not owned by the buffer
    int encrypted;
} GHIBuffer;

typedef struct GHIEncryptor {
    int unk_00;
    int engine; // 0 = plain HTTP
    int initialized;
    int sessionReady;
    int (*initFunc)(GHIConnection *, struct GHIEncryptor *);
    void (*cleanupFunc)(GHIConnection *, struct GHIEncryptor *);
    int (*encryptFunc)(GHIConnection *, struct GHIEncryptor *, const char *, int *, char *, int *);
    int (*decryptFunc)(GHIConnection *, struct GHIEncryptor *, const char *, int *, char *, int *);
} GHIEncryptor;

enum {
    GHI_POST_DATA_STRING = 0,
    GHI_POST_DATA_FILE_DISK = 1,
    GHI_POST_DATA_FILE_MEMORY = 2,
};

// One field of a POST body.
typedef struct GHIPostData {
    int type;
    char *name;
    union {
        struct {
            char *data;
            int len;
            int encode;     // url-encode unless the body is multipart
            int numEscaped; // characters that become %XX
        } string;
        struct {
            void *unk_08;
            char *fileName;
            char *contentType;
        } disk;
        struct {
            char *data;
            int len;
            char *fileName;
            char *contentType;
        } memory;
    } u;
} GHIPostData;

typedef struct GHIPostState {
    GHIPostData *data;
    int pos;
    void *file;
    int len;
} GHIPostState;

typedef struct GHIPost {
    void *data; // array of GHIPostData
    void *callback;
    void *param;
    int hasFiles; // multipart/form-data body
    int autoFree;
} GHIPost;

typedef int (*CompletedCallback)(int, int, char *, int, void *);
typedef void (*ProgressCallback)(int, int, const char *, int, int, int, void *);
typedef void (*PostCallback)(int, int, int, int, int, void *);

// ghttp request results (GHIConnection.result).
enum {
    GHTTPSuccess,
    GHTTPOutOfMemory,
    GHTTPBufferOverflow,
    GHTTPParseURLFailed,
    GHTTPHostLookupFailed,
    GHTTPSocketFailed,
    GHTTPConnectFailed,
    GHTTPBadResponse,
    GHTTPRequestRejected,
    GHTTPUnauthorized,
    GHTTPForbidden,
    GHTTPFileNotFound,
    GHTTPServerError,
    GHTTPFileWriteFailed,
    GHTTPFileReadFailed,
    GHTTPFileIncomplete,
    GHTTPFileToBig,
    GHTTPEncryptionError,
};

enum {
    GHI_STATE_HOST_LOOKUP = 0,
    GHI_STATE_CONNECTING = 1,
    GHI_STATE_SECURING_SESSION = 2,
    GHI_STATE_SENDING_REQUEST = 3,
    GHI_STATE_POSTING = 4,
    GHI_STATE_WAITING = 5,
    GHI_STATE_RECEIVING_STATUS = 6,
    GHI_STATE_RECEIVING_HEADERS = 7,
    GHI_STATE_RECEIVING_FILE = 8,
};

enum {
    GHI_CHUNK_HEADER = 0,
    GHI_CHUNK_DATA = 1,
    GHI_CHUNK_END = 2,
    GHI_CHUNK_DONE = 3,
};

struct GHIConnection {
    int inUse;                           // 0x00
    int request;                         // 0x04
    int uniqueID;                        // 0x08
    int type;                            // 0x0C, 3 = HEAD
    int state;                           // 0x10
    char *URL;                           // 0x14
    char *serverAddress;                 // 0x18
    int serverIP;                        // 0x1C
    u16 serverPort;                      // 0x20
    char *requestPath;                   // 0x24
    char *sendHeaders;                   // 0x28
    int unk_2C;                          // 0x2C
    int blocking;                        // 0x30
    int keepAlive;                       // 0x34
    int result;                          // 0x38
    ProgressCallback progressCallback;   // 0x3C
    CompletedCallback completedCallback; // 0x40
    void *callbackParam;                 // 0x44
    int socket;                          // 0x48
    int socketError;                     // 0x4C
    GHIBuffer sendBuffer;                // 0x50
    GHIBuffer encodeBuffer;              // 0x74, decoded response text
    GHIBuffer recvBuffer;                // 0x98
    GHIBuffer getFileBuffer;             // 0xBC
    int userBufferSupplied;              // 0xE0
    int statusMajor;                     // 0xE4
    int statusMinor;                     // 0xE8
    int statusCode;                      // 0xEC
    int statusStringIndex;               // 0xF0
    int headerIndex;                     // 0xF4
    int headerLength;                    // 0xF8
    int completed;                       // 0xFC
    int fileBytesReceived;               // 0x100
    int totalSize;                       // 0x104
    char *redirectURL;                   // 0x108
    int redirectCount;                   // 0x10C
    int chunked;                         // 0x110
    char chunkHeader[12];                // 0x114
    int chunkHeaderLen;                  // 0x120
    int chunkBytesLeft;                  // 0x124
    int chunkReadingState;               // 0x128
    int processing;                      // 0x12C
    int connectionClosed;                // 0x130
    int throttle;                        // 0x134
    int lastThrottleRecv;                // 0x138
    GHIPost *post;                       // 0x13C
    void *states;                        // 0x140
    int index;                           // 0x144
    int bytesPosted;                     // 0x148
    int totalBytes;                      // 0x14C
    PostCallback postCallback;           // 0x150
    void *postParam;                     // 0x154
    int maxRecvTime;                     // 0x158, ms per ghiProcessConnection call
    char *proxyAddress;                  // 0x15C
    u16 proxyPort;                       // 0x160
    GHIEncryptor encryptor;              // 0x164
};

typedef struct GHIConnList {
    int count;
    GHIConnection **list;
    int nextUniqueID;
    int capacity;
} GHIConnList;

#define HTTP_ASSERT(expr, exprStr, file, func, line) \
    if (!(expr))                                     \
    __msl_assertion_failed(exprStr, file, func, line)

// MSL_C functions without a header in lib/include
void __msl_assertion_failed(const char *expr, const char *file, const char *func, int line);
char *strchr(const char *str, int c);
int strncmp(const char *a, const char *b, size_t n);
long atol(const char *str);
int sprintf(char *buf, const char *fmt, ...);
int sscanf(const char *str, const char *fmt, ...);
int fseek(void *file, long offset, int whence);
long ftell(void *file);
void rewind(void *file);
int fclose(void *file);
unsigned fread(void *buf, unsigned size, unsigned count, void *file);
extern const u16 __msl_digit[];

// OVY_0 network library functions used by the client
void *DWCi_GsMalloc(int size);
void *DWCi_GsRealloc(void *ptr, int size);
void DWCi_GsFree(void *ptr);
void *ArrayNew(int elemSize, int count, int unused);
void ArrayFree(void *array);
void *ArrayNth(void *array, int i);
void ArrayAppend(void *array, void *elem);
int ArrayLength(void *array);
u32 current_time(void);
void msleep(int ms);
void SocketStartUp(void);
char *goastrdup(const char *str);
int SetSockBlocking(int socket, int blocking);
void SetReceiveBufferSize(int socket, int size);
int GSISocketSelect(int socket, int *readable, int *writable, int *except);
int gsSocketCreate(int domain, int type, int protocol);
void gsSocketClose(int socket);
void gsSocketShutdown(int socket, int how);
int gsSocketRecv(int socket, char *buf, int len, int flags);
int gsSocketSend(int socket, const char *buf, int len, int flags);
int gsSocketInetAddr(const char *address);
int gsSocketGetLastError(int socket);

// http_connection.c
int ghiResizeBuffer(GHIBuffer *buffer, int sizeIncrement);
int ghiInitBuffer(GHIConnection *connection, GHIBuffer *buffer, int initialSize, int sizeIncrement);
int ghiInitFixedBuffer(GHIConnection *connection, GHIBuffer *buffer, char *userBuffer, int size);
void ghiFreeBuffer(GHIBuffer *buffer);
int ghiAppendDataToBuffer(GHIBuffer *buffer, const char *data, int len);
int ghiAppendHeaderToBuffer(GHIBuffer *buffer, const char *name, const char *value);
int ghiAppendCharToBuffer(GHIBuffer *buffer, int c);
int ghiAppendIntToBuffer(GHIBuffer *buffer, int i);
void ghiResetBuffer(GHIBuffer *buffer);
int ghiSendBufferedData(GHIConnection *c);
int ghiReadDataFromBuffer(GHIBuffer *buffer, char *out, int *len);
void ghiCallCompletedCallback(GHIConnection *c);
void ghiCallProgressCallback(GHIConnection *c, const char *buffer, int len);
void ghiCallPostCallback(GHIConnection *c);
void ghiCreateLock(void);
void ghiFreeLock(void);
void ghiLock(void);
void ghiUnlock(void);
int ghiDecryptReceivedData(GHIConnection *c);
int ghiDoReceive(GHIConnection *c, char *buffer, int *bufferLen);
int ghiDoSend(GHIConnection *c, const char *buf, int len);
int ghiTrySendThenBuffer(GHIConnection *c, const char *data, int len);
int ghiFindFreeSlot(void);
GHIConnection *ghiNewConnection(void);
int ghiFreeConnection(GHIConnection *c);
GHIConnection *ghiRequestToConnection(int request);
void ghiEnumConnections(void (*func)(GHIConnection *));
void ghiRedirectConnection(GHIConnection *c);
void ghiCleanupConnections(void);
void ghiHandleStatus(GHIConnection *c);
int ghiProcessConnection(GHIConnection *c);
void ghttpStartup(void);
void ghttpCleanup(void);
int ghttpGetA(const char *url, int blocking, CompletedCallback completed, void *param);
int ghttpGetExA(const char *url, const char *headers, char *buffer, int bufferSize, GHIPost *post, int throttle, int blocking, ProgressCallback progress, CompletedCallback completed, void *param);
void ghttpThink(void);
int ghiIsPostAutoFree(GHIPost *post);
void ghiFreePost(GHIPost *post);
char *ghiPostGetContentType(GHIConnection *c);
int ghiPostGetNoFilesContentLength(GHIConnection *c);
int ghiPostGetHasFilesContentLength(GHIConnection *c);
int ghiPostGetContentLength(GHIConnection *c);
int ghiPostStateInit(GHIPostState *s);
void ghiPostStateCleanup(GHIPostState *s);
int ghiPostInitState(GHIConnection *c);
void ghiPostCleanupState(GHIConnection *c);
int ghiPostStringStateDoPosting(GHIPostState *state, GHIConnection *c);
int ghiPostFileDiskStateDoPosting(GHIPostState *state, GHIConnection *c);
int ghiPostFileMemoryStateDoPosting(GHIPostState *state, GHIConnection *c);
int ghiPostStateDoPosting(GHIPostState *state, GHIConnection *c, int first);
int ghiPostDoPosting(GHIConnection *c);

// http_request.c
int ghiParseURL(GHIConnection *c);
void ghiDoHostLookup(GHIConnection *c);
void ghiDoConnecting(GHIConnection *c);
void ghiDoSecuringSession(GHIConnection *c);
void ghiDoSendingRequest(GHIConnection *c);
void ghiDoPosting(GHIConnection *c);
void ghiDoWaiting(GHIConnection *c);
void ghiDoReceivingStatus(GHIConnection *c);
int ghiParseStatus(GHIConnection *c);
int ghiFileDataReceived(GHIConnection *c, const char *data, int len);
int ghiParseChunkSize(GHIConnection *c);
void ghiAppendToChunkHeaderBuffer(GHIConnection *c, const char *data, int len);
int ghiProcessIncomingFileData(GHIConnection *c, char *data, int len);
void ghiDoReceivingHeaders(GHIConnection *c);
void ghiDoReceivingFile(GHIConnection *c);

#endif // POKEHEARTGOLD_LIB_INCLUDE_DWC_HTTP_INTERNAL_H
