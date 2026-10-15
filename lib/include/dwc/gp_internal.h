#ifndef POKEHEARTGOLD_LIB_INCLUDE_DWC_GP_INTERNAL_H
#define POKEHEARTGOLD_LIB_INCLUDE_DWC_GP_INTERNAL_H

// GameSpy socket layer (BSD names).
#ifndef INVALID_SOCKET
#define INVALID_SOCKET (-1)
#define SOCKET_ERROR   (-1)
#define AF_INET        2
#define SOCK_STREAM    1
#define SOCK_DGRAM     2
#endif

// Presence / buddy connection of OVY_0 (lib/NitroDWC/src/gp_*.c): the connection state shared by the GP
// modules (asserts name it "iconnection"), its operations, profiles, buddies and peers.

// A user callback and its parameter.
typedef struct GpCallback {
    void *callback;
    void *param;
} GpCallback;

// Result of the GP functions (GPResult).
enum {
    GP_NO_ERROR,
    GP_MEMORY_ERROR,
    GP_PARAMETER_ERROR,
    GP_NETWORK_ERROR,
    GP_SERVER_ERROR,
};

// gpiCallErrorCallback fatal flag.
#define GP_NON_FATAL 0
#define GP_FATAL     1

// Error codes passed to gpiSetError (GPErrorCode), the ones this code uses.
#define GP_PARSE                    0x0001
#define GP_NETWORK                  0x0005
#define GP_CONNECTION_CLOSED        0x0007
#define GP_LOGIN_CONNECTION_FAILED  0x0107
#define GP_LOGIN_SERVER_AUTH_FAILED 0x0108
#define GP_SEARCH_CONNECTION_FAILED 0x0D01

// GpOperation.state
#define GPI_START      0
#define GPI_CONNECTING 1
#define GPI_LOGIN      2
#define GPI_REQUESTING 3
#define GPI_WAITING    4
#define GPI_FINISHING  5

// Type of a queued callback (gpiAddCallback, GpCallbackData.type): selects what gpiCallCallback frees
#define GPI_ADD_NORMAL            0
#define GPI_ADD_ERROR             1
#define GPI_ADD_MESSAGE           2
#define GPI_ADD_NICKS             3
#define GPI_ADD_PMATCH            4
#define GPI_ADD_STATUS            5
#define GPI_ADD_TRANSFER_CALLBACK 7
#define GPI_ADD_REVERSE_BUDDIES   8
#define GPI_ADD_SUGGESTED_UNIQUE  9

// Index of GpConnection.callbacks.
enum {
    GP_CALLBACK_ERROR,
    GP_CALLBACK_BUDDY_REQUEST,
    GP_CALLBACK_BUDDY_STATUS,
    GP_CALLBACK_BUDDY_MESSAGE,
    GP_CALLBACK_GAME_INVITE,
    GP_CALLBACK_5,
    GP_CALLBACK_COUNT,
};

// connectState
enum {
    GP_NOT_CONNECTED,
    GP_CONNECTING,
    GP_NEGOTIATING,
    GP_CONNECTED,
    GP_DISCONNECTED,
};

// Growable buffer ("outputBuffer" / "inputBuffer").
typedef struct GpBuffer {
    char *buffer;
    int size;
    int len;
    int pos;
} GpBuffer;

// GpOperation.type
enum {
    GP_OPERATION_CONNECT,
    GP_OPERATION_NEW_PROFILE,
    GP_OPERATION_GET_INFO,
    GP_OPERATION_SEARCH,
    GP_OPERATION_4,
};

// GpSearchData.type
enum {
    GP_SEARCH_PROFILE = 1,
    GP_SEARCH_IS_VALID,
    GP_SEARCH_NICKS,
    GP_SEARCH_PLAYERS,
    GP_SEARCH_CHECK,
    GP_SEARCH_NEW_USER,
    GP_SEARCH_OTHERS,
    GP_SEARCH_SUGGEST_UNIQUE,
};

// A pending request to the server.
typedef struct GpOperation {
    int type;                 // 0x00
    void *data;               // 0x04, GpSearchData for searches
    int blocking;             // 0x08
    GpCallback callback;      // 0x0C
    int state;                // 0x14, 5 = skip
    int id;                   // 0x18
    int result;               // 0x1C, error of the last processing; nonzero = done
    struct GpOperation *next; // 0x20
} GpOperation;

typedef struct GpSearchData {
    int type;              // 0x000, GP_SEARCH_*
    int sock;              // 0x004, connection to the search manager
    GpBuffer inputBuffer;  // 0x008
    GpBuffer outputBuffer; // 0x018
    char nick[31];         // 0x028
    char uniquenick[21];   // 0x047
    char email[51];        // 0x05C
    char firstname[31];    // 0x08F
    char lastname[31];     // 0x0AE
    char password[31];     // 0x0CD
    char cdkey[68];        // 0x0EC
    int icquin;            // 0x130
    int skip;              // 0x134
    int productId;         // 0x138
    int busy;              // 0x13C, set while the searches are being processed
    int done;              // 0x140, the reply has been handled
} GpSearchData;

// Status of a buddy.
typedef struct GpBuddyStatus {
    int buddyIndex;       // 0x00
    int status;           // 0x04
    char *statusString;   // 0x08
    char *locationString; // 0x0C
    u32 ip;               // 0x10
    int port;             // 0x14
} GpBuddyStatus;

// Argument of the connect callback.
typedef struct GpConnectArg {
    int result;
    int profile;
    char uniquenick[21];
} GpConnectArg;

// Profile info parsed from a "\pi\" reply.
typedef struct GpInfo {
    char *nick;
    char *uniquenick;
    char *email;
    char *firstname;
    char *lastname;
    char *homepage;
    int icquin;
    char zipcode[11];
    char countrycode[3];
    float longitude;
    float latitude;
    char place[128];
    int birthday;
    int birthmonth;
    int birthyear;
    int sex;
    int publicmask;
    char *aimname;
    int pic;
    int occupationid;
    int industryid;
    int incomeid;
    int marriedid;
    int childcount;
    int interests1;
    int ownership1;
    int conntypeid;
} GpInfo;

// Argument of the get-info callback.
typedef struct GpInfoArg {
    int result;
    int profile;
    char nick[31];
    char uniquenick[21];
    char email[51];
    char firstname[31];
    char lastname[31];
    char homepage[76];
    int icquin;
    char zipcode[11];
    char countrycode[3];
    float longitude;
    float latitude;
    char place[128];
    int birthday;
    int birthmonth;
    int birthyear;
    int sex;
    int publicmask;
    char aimname[51];
    int pic;
    int occupationid;
    int industryid;
    int incomeid;
    int marriedid;
    int childcount;
    int interests1;
    int ownership1;
    int conntypeid;
} GpInfoArg;

// An entry of the profile table.
typedef struct GpProfile {
    int profileId;              // 0x00
    int userId;                 // 0x04
    GpBuddyStatus *buddyStatus; // 0x08, only for buddies
    GpInfo *cache;              // 0x0C, cached profile info
    char *authSig;              // 0x10, signature of a pending buddy request
    int requestCount;           // 0x14
    char *peerSig;              // 0x18
} GpProfile;

// GpPeer.state
enum {
    GP_PEER_NOT_CONNECTED = 100,
    GP_PEER_GETTING_SIG,
    GP_PEER_GOT_SIG,
    GP_PEER_CONNECTING,
    GP_PEER_WAITING,
    GP_PEER_CONNECTED,
    GP_PEER_DISCONNECTED,
};

// A direct connection to another profile.
typedef struct GpPeer {
    int state;             // 0x00
    int initiated;         // 0x04, we connected to it (else it connected to us)
    int sock;              // 0x08
    int profile;           // 0x0C
    int timeout;           // 0x10, tick after which the idle peer is dropped
    int nackCount;         // 0x14
    GpBuffer inputBuffer;  // 0x18
    GpBuffer outputBuffer; // 0x28
    void *messages;        // 0x38, DArray of GpPeerMessage still to send
    struct GpPeer *next;   // 0x3C
} GpPeer;

// A message queued for a peer.
typedef struct GpPeerMessage {
    GpBuffer buffer;
    int type;
    int start; // offset of the message text in buffer
} GpPeerMessage;

typedef struct GpCallbackData GpCallbackData;

typedef struct GpConnection {
    char errorString[0x100]; // 0x000
    int cacheProfileInfo;    // 0x100, keep received profile info after use
    int cacheBuddyOnly;
    int simulation;                          // 0x108, no network: the API calls succeed without doing anything
    int firewall;                            // 0x10C, no peer listening socket
    char nick[31];                           // 0x110
    char uniquenick[21];                     // 0x12F
    char email[51];                          // 0x144
    char password[31];                       // 0x177
    int sessKey;                             // 0x198, sent as "\sesskey\"
    int userId;                              // 0x19C
    int profileId;                           // 0x1A0
    GpCallback callbacks[GP_CALLBACK_COUNT]; // 0x1A4
    int sock;                                // 0x1D4, connection to the server
    int connectState;                        // 0x1D8
    GpBuffer inputBuffer;                    // 0x1DC
    char *lineBuffer;                        // 0x1EC, the server message being handled
    int lineBufferSize;                      // 0x1F0
    GpBuffer outputBuffer;                   // 0x1F4
    int peerSocket;                          // 0x204, listening socket for peers
    int peerPort;                            // 0x208
    int nextOperationId;                     // 0x20C
    int numSearches;                         // 0x210
    int lastStatus;                          // 0x214, last status sent ("\status\")
    char lastStatusString[0x100];            // 0x218
    char lastLocationString[0x100];          // 0x318
    int errorCode;                           // 0x418
    int fatalError;                          // 0x41C
    int unk_420;
    GpOperation *operations;       // 0x424
    void *profileTable;            // 0x428, hash table of GpProfile
    int numProfiles;               // 0x42C
    int numBuddies;                // 0x430
    GpPeer *peers;                 // 0x434
    GpCallbackData *callbacksHead; // 0x438, queued callbacks
    GpCallbackData *callbacksTail; // 0x43C
    GpBuffer updateproBuffer;      // 0x440, pending "\updatepro\" fields
    GpBuffer updateuiBuffer;       // 0x450, pending "\updateui\" fields
    void *unk_460;
    int unk_464;
    int unk_468;
    int productId;        // 0x46C
    int namespaceId;      // 0x470
    char loginTicket[25]; // 0x474, "\lt\" of the login reply
} GpConnection;           // 0x490

// A queued callback (gpiAddCallback); type tells which parts of arg it owns.
struct GpCallbackData {
    void *callback;
    void *param;
    void *arg;
    int type;
    int operationId;
    struct GpCallbackData *next;
};

// Argument of the error callback.
typedef struct GpErrorArg {
    int result;
    int errorCode;
    char *errorString;
    int fatal;
} GpErrorArg;

// Callback argument of type 3: two string lists.
typedef struct GpListArg {
    u32 unk_00[14];
    int count;
    void **a;
    void **b;
} GpListArg;

// The GpCallback pair as gp_utility.c passes it by value to gpiAddCallback.
typedef struct GpPair {
    int a;
    int b;
} GpPair;

// gp_utility.c
int gpiProcessSearches(GpConnection **connection);
int gpiSendTransferReply(GpConnection **connection, int *values, void *operation, int result, const char *message);
void gpiHandleTransferMessage(GpConnection **connection, void *peer, int type, const char *headers, char *buffer, int len);
int gpiProcessRegisterUniqueNick(GpConnection **connection, GpOperation *operation, char *message);
void strzcpy(char *dest, const char *src, int len);
void gpiDebug(GpConnection **connection, const char *format, ...);
int gpiCheckForError(GpConnection **connection, const char *message, int callback);
int gpiValueForKey(const char *command, const char *key, char *value, int len);
int gpiCheckSocketConnect(GpConnection **connection, int socket, int *result);
int gpiReadKeyAndValue(GpConnection **connection, const char *buffer, int *index, char *key, char *value);
// persist_data.c
void gpiSetError(GpConnection **connection, int code, const char *message);
void gpiSetErrorString(GpConnection **connection, const char *message);

// gp_buffer.c (gpiSendOrBufferString, gpiCallErrorCallback and gpiAddCallback are declared by their users)
int gpiAppendCharToBuffer(GpConnection **connection, GpBuffer *outputBuffer, int c);
int gpiAppendStringToBufferLen(GpConnection **connection, GpBuffer *outputBuffer, const char *string, int stringLen);
int gpiAppendStringToBuffer(GpConnection **connection, GpBuffer *outputBuffer, const char *string);
int gpiAppendIntToBuffer(GpConnection **connection, GpBuffer *outputBuffer, int n);
int gpiSendData(GpConnection **connection, int sock, void *data, int len, int *connClosed, int *bytesSent, const char *tag);
int gpiSendOrBufferChar(GpConnection **connection, GpPeer *peer, char c, ...);
int gpiSendOrBufferStringLen(GpConnection **connection, GpPeer *peer, char *string, int stringLen);
int gpiRecvToBuffer(GpConnection **connection, int sock, GpBuffer *inputBuffer, int *bytesRead, int *connClosed, const char *tag);
int gpiSendFromBuffer(GpConnection **connection, int sock, GpBuffer *outputBuffer, int *connClosed, int clear, const char *tag);
int gpiReadMessage(GpConnection **connection, GpBuffer *inputBuffer, char **message, int *type, int *len);
int gpiClipBufferToPosition(GpConnection **connection, GpBuffer *inputBuffer);
void gpiCallCallback(GpConnection **connection, GpCallbackData *data);

// gp_main.c
int gpSendBuddyMessageA(GpConnection **connection, int profile, const char *message);
int gpiInitialize(GpConnection **connection, int arg1, int arg2);
void gpiDestroy(GpConnection **connection);
int gpiResetProfile(GpConnection **connection, GpProfile *profile, void *data);
int gpiReset(GpConnection **connection);
int gpiProcessConnectionManager(GpConnection **connection);
int gpiProcess(GpConnection **connection, int blocking);
int gpiSendAuthBuddyRequest(GpConnection **connection, GpProfile *profile);
int gpiProcessRecvBuddyMessage(GpConnection **connection, char *input);
int gpiSendServerBuddyMessage(GpConnection **connection, int profile, int type, const char *message);
int gpiSendBuddyMessage(GpConnection **connection, int profileId, int type, const char *message);
int gpiAuthBuddyRequest(GpConnection **connection, int profileId);
int gpiFixBuddyIndices(GpConnection **connection, GpProfile *profile, void *index);
int gpiDeleteBuddy(GpConnection **connection, int profileId);
// gp_connect.c
int gpiProcessCallbacks(GpConnection **connection, int operationId);
void randomString(char *out, int count);
int gpiStartConnect(GpConnection **connection, GpOperation *operation);
int gpiConnect(GpConnection **connection, char *nick, char *uniquenick, char *email, char *password, char *authtoken, char *partnerChallenge, char *cdkey, int firewall, int newUser, int blocking, void *callback, void *param);
int gpiProcessConnect(GpConnection **connection, GpOperation *operation, char *input);
int gpiCheckConnect(GpConnection **connection);
int gpiDisconnectCleanupProfile(GpConnection **connection, GpProfile *profile, void *data);
void gpiDisconnect(GpConnection **connection, int tearDown);
int gpiIsValidDate(int day, int month, int year);
int gpiIntToDate(GpConnection **connection, int date, int *day, int *month, int *year);
void gpiInfoCacheToArg(GpInfo *info, GpInfoArg *arg);
int gpiProcessGetInfo(GpConnection **connection, GpOperation *operation, char *input);
// gp_operation.c
int gpiAddLocalInfo(GpConnection **connection, GpBuffer *outputBuffer);
int gpiSendLocalInfo(GpConnection **connection, const char *key, const char *value);
int gpiSendUserInfo(GpConnection **connection, const char *key, const char *value);
int gpiSetInfoi(GpConnection **connection, int info, int value);
int gpiSetInfos(GpConnection **connection, int info, const char *value);
int gpiSendGetInfo(GpConnection **connection, int profileId, int id);
int gpiGetInfo(GpConnection **connection, int profileId, int checkCache, int blocking, void *callback, void *param);
int gpiSetInfoCache(GpConnection **connection, GpProfile *profile, GpInfo *info);
void gpiFreeInfoCache(GpProfile *profile);
int gpiFailedOpCallback(GpConnection **connection, GpOperation *operation);
int gpiAddOperation(GpConnection **connection, int type, void *data, GpOperation **operation, int blocking, void *callback, void *param);
void gpiDestroyOperation(GpConnection **connection, GpOperation *operation);
void gpiRemoveOperation(GpConnection **connection, GpOperation *operation);
int gpiFindOperationByID(GpConnection **connection, GpOperation **operation, int id);
int gpiOperationsAreBlocking(GpConnection **connection);
int gpiProcessOperation(GpConnection **connection, GpOperation *operation, char *input);
// gp_peer.c (gpiPeerStartTransferMessage and gpiPeerFinishTransferMessage are declared by gp_utility.c)
int gpiProcessPeerInitiatingConnection(GpConnection **connection, GpPeer *peer);
int gpiProcessPeerAcceptingConnection(GpConnection **connection, GpPeer *peer);
int gpiPeerSendMessages(GpConnection **connection, GpPeer *peer);
int gpiProcessPeerConnected(GpConnection **connection, GpPeer *peer);
int gpiProcessPeer(GpConnection **connection, GpPeer *peer);
void gpiDestroyPeer(GpConnection **connection, GpPeer *peer);
void gpiRemovePeer(GpConnection **connection, GpPeer *peer);
void gpiSetPeerSocketSizes(int sock);
int gpiProcessPeers(GpConnection **connection);
GpPeer *gpiGetPeerByProfile(GpConnection **connection, int profile);
void gpiFreeMessage(void *message);
GpPeer *gpiAddPeer(GpConnection **connection, int profile, int initiated);
int gpiPeerGetSig(GpConnection **connection, GpPeer *peer);
int gpiPeerStartConnect(GpConnection **connection, GpPeer *peer);
int gpiPeerAddMessage(GpConnection **connection, GpPeer *peer, int type, const char *message);
int gpiProfilesTableHash(GpProfile *profile, int numBuckets);
int gpiProfilesTableCompare(GpProfile *a, GpProfile *b);
void gpiProfilesTableFree(GpProfile *profile);
int gpiInitProfiles(GpConnection **connection);
int gpiProcessNewProfile(GpConnection **connection, GpOperation *operation, char *input);
// gp_search.c
GpProfile *gpiProfileListAdd(GpConnection **connection, int profileId);
int gpiGetProfile(GpConnection **connection, int profileId, GpProfile **profile);
void gpiRemoveProfileByID(GpConnection **connection, int profileId);
void gpiRemoveProfile(GpConnection **connection, GpProfile *profile);
int gpiFindProfileByUser(GpConnection **connection, char *nick, char *email, GpProfile **profile);
int gpiProfileMap(GpConnection **connection, int (*func)(GpConnection **, GpProfile *, void *), void *data);
GpProfile *gpiFindBuddy(GpConnection **connection, int index);
int gpiCanFreeProfile(GpProfile *profile);
int gpiStartProfileSearch(GpConnection **connection, GpOperation *operation);
int gpiInitSearchData(GpConnection **connection, GpSearchData **data, int type);
int gpiStartSearch(GpConnection **connection, GpSearchData *data, int blocking, void *callback, void *param);
int gpiProfileSearch(GpConnection **connection, char *nick, char *uniquenick, char *email, char *firstname, char *lastname, int icquin, int skip, int blocking, void *callback, void *param);
int gpiProcessSearch(GpConnection **connection, GpOperation *operation);

#endif // POKEHEARTGOLD_LIB_INCLUDE_DWC_GP_INTERNAL_H
