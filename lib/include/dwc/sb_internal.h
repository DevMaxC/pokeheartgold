#ifndef POKEHEARTGOLD_LIB_INCLUDE_DWC_SB_INTERNAL_H
#define POKEHEARTGOLD_LIB_INCLUDE_DWC_SB_INTERNAL_H

// GameSpy socket layer (BSD names).
#ifndef INVALID_SOCKET
#define INVALID_SOCKET (-1)
#define SOCKET_ERROR   (-1)
#define AF_INET        2
#define SOCK_STREAM    1
#define SOCK_DGRAM     2
#endif

// Server browser of OVY_0 (lib/NitroDWC/src/sb_query_engine.c, sb_server.c, sb_serverlist.c): the server objects, the server
// list and its TCP connection to the master server, the UDP query engine and the browser that owns both.

#include "global.h"

typedef struct SBServer SBServer;
typedef struct SBServerList SBServerList;

// One server known to the browser (0x24 bytes, allocated by SBAllocServer). Addresses and ports are
// kept in network byte order.
struct SBServer {
    u32 publicIp;    // 0x00
    u16 publicPort;  // 0x04
    u32 privateIp;   // 0x08
    u16 privatePort; // 0x0C
    u32 icmpIp;      // 0x10
    u8 state;        // 0x14, flags: 1 basic keys, 2 all keys, 4/8 query sent, 0x40 has keys
    u8 flags;        // 0x15, first byte of the master server's server record
    void *keyValues; // 0x18, hash table of string key / value pairs
    u32 updateTime;  // 0x1C
    SBServer *next;  // 0x20, free list of SBServerList.deadList
};

// Key of the list request (SBServerList.keyList elements)
typedef struct SBKeyInfo {
    char *name;
    int type; // 0: string (or index into SBServerList.popularValues), 1: byte, 2: big-endian u16
} SBKeyInfo;

typedef void (*SBListCallback)(SBServerList *list, int reason, SBServer *server, void *param);
typedef void (*SBStringsCallback)(SBServerList *list, SBServer *server, u32 value, int count, char **strings, void *param);
typedef void (*SBEntryCallback)(SBServerList *list, char *name, u32 ip, u16 port, u32 value, char *string, void *param);

// Server browser reasons passed to SBServerList.callback (slc_*), ServerBrowser.callback (sbc_*) and
// SBQueryEngine.callback (qe_*).
enum {
    slc_serveradded,
    slc_serverupdated,
    slc_serverdeleted,
    slc_initiallistcomplete,
    slc_disconnected,
    slc_queryerror,
    slc_publicipdetermined,
};
enum {
    sbc_serveradded,
    sbc_serverupdated,
    sbc_serverupdatefailed,
    sbc_serverdeleted,
    sbc_updatecomplete,
    sbc_queryerror,
};
enum {
    qe_updatesuccess,
    qe_updatefailed,
    qe_engineidle,
};

// Server browser results.
enum {
    sbe_noerror,
    sbe_socketerror,
    sbe_dnserror,
    sbe_connecterror,
    sbe_dataerror,
    sbe_allocerror,
    sbe_paramerror,
};

// ServerBrowserState results.
enum {
    sb_disconnected,
    sb_listxfer,
    sb_querying,
    sb_connected,
};

// SBServerListSort compare modes.
enum {
    sbcm_int,
    sbcm_float,
    sbcm_strcase,
    sbcm_stricase,
};

// SBQueryEngineUpdateServer query types.
enum {
    QTYPE_BASIC,
    QTYPE_FULL,
    QTYPE_ICMP,
};

// SBServerList.readStage: parts of the server list reply.
enum {
    pi_cryptheader,
    pi_fixedheader,
    pi_keylist,
    pi_uniquevaluelist,
    pi_servers,
    pi_finished,
};

// SBKeyInfo.type
enum {
    KEYTYPE_STRING,
    KEYTYPE_BYTE,
    KEYTYPE_SHORT,
};

// SBServer.state bits
#define STATE_BASICKEYS         (1 << 0)
#define STATE_FULLKEYS          (1 << 1)
#define STATE_PENDINGBASICQUERY (1 << 2)
#define STATE_PENDINGFULLQUERY  (1 << 3)
#define STATE_QUERYFAILED       (1 << 4)
#define STATE_PENDINGICMPQUERY  (1 << 5)
#define STATE_VALIDPING         (1 << 6)

// SBServer.flags bits (first byte of a server record of the master server)
#define UNSOLICITED_UDP_FLAG          (1 << 0)
#define PRIVATE_IP_FLAG               (1 << 1)
#define CONNECT_NEGOTIATE_FLAG        (1 << 2)
#define ICMP_IP_FLAG                  (1 << 3)
#define NONSTANDARD_PORT_FLAG         (1 << 4)
#define NONSTANDARD_PRIVATE_PORT_FLAG (1 << 5)
#define HAS_KEYS_FLAG                 (1 << 6)
#define HAS_FULL_RULES_FLAG           (1 << 7)

// Messages of the master server connection
#define PUSH_KEYS_MESSAGE     1
#define PUSH_SERVER_MESSAGE   2
#define KEEPALIVE_MESSAGE     3
#define DELETE_SERVER_MESSAGE 4
#define MAPLOOP_MESSAGE       5
#define PLAYERSEARCH_MESSAGE  6

// Values of SBServerList.state
enum {
    SB_LIST_LAN,          // waiting for LAN answers
    SB_LIST_DISCONNECTED, // no master server connection
    SB_LIST_CONNECTED,    // reading messages from the master server
    SB_LIST_LIST,         // reading the server list reply
};

struct SBServerList {
    int state;                 // 0x000
    void *servers;             // 0x004, DArray of SBServer *
    void *keyList;             // 0x008, DArray of SBKeyInfo
    char targetGameName[36];   // 0x00C, also selects the master server host
    char gameName[36];         // 0x030
    char secretKey[32];        // 0x054
    s8 challenge[8];           // 0x074
    u8 *inBuffer;              // 0x07C, 4096 bytes
    int inBufferLen;           // 0x080
    char *popularValues[255];  // 0x084
    int numPopularValues;      // 0x480
    int expectedElements;      // 0x484
    SBListCallback callback;   // 0x488
    SBStringsCallback maploopCallback; // 0x48C, message 5
    SBEntryCallback playerSearchCallback;   // 0x490, message 6
    void *param;               // 0x494
    const char *sortKey;       // 0x498
    int sortAscending;         // 0x49C
    u32 publicIp;              // 0x4A0, own address as seen by the master server
    u32 alternateSourceIp;               // 0x4A4
    u16 defaultPort;           // 0x4A8
    char *errorMessage;        // 0x4AC
    int socket;                // 0x4B0
    u32 lanStartTime;          // 0x4B4
    int queryFromVersion;               // 0x4B8
    u8 cryptState[0x108];      // 0x4BC, see GOACryptInit / GOADecrypt
    u32 queryOptions;          // 0x5C4
    int readStage;             // 0x5C8
    u32 unk_5CC;               // 0x5CC
    SBServer *deadList;        // 0x5D0
};

// Queue of servers (linked through SBServer.next)
typedef struct SBServerQueue {
    SBServer *first;
    SBServer *last;
    int count;
} SBServerQueue;

typedef struct SBQueryEngine SBQueryEngine;
typedef void (*SBEngineCallback)(SBQueryEngine *engine, int reason, SBServer *server, void *param);

// Sends UDP queries to the listed servers, at most maxUpdates at a time
struct SBQueryEngine {
    int queryVersion;          // 0x00, 1: binary queries, else "\\basic\\" / "\\status\\" text queries
    int maxUpdates;            // 0x04
    SBServerQueue querying;    // 0x08
    SBServerQueue pending;     // 0x14
    int socket;                // 0x20
    int icmpSocket;                // 0x24
    u32 publicIp;              // 0x28, servers behind this address are queried at their private address
    u8 keys[20];               // 0x2C
    int numKeys;               // 0x40
    SBEngineCallback callback; // 0x44
    void *param;               // 0x48
};

typedef struct ServerBrowser ServerBrowser;
typedef void (*ServerBrowserCallback)(ServerBrowser *browser, int reason, SBServer *server, void *param);

struct ServerBrowser {
    SBQueryEngine engine;           // 0x000
    SBServerList list;              // 0x04C
    int disconnectOnComplete;                    // 0x620, disconnect from the master server once the list is complete
    int dontUpdate;                    // 0x624
    u32 triggerIp;                  // 0x628
    u16 triggerPort;                // 0x62C
    ServerBrowserCallback callback; // 0x630
    void *param;                    // 0x634
};

// sb_server.c globals (asm data, overlapping sbNoServer)
typedef struct SBServerGlobals {
    char *tokenNext; // mytok
    SBServer *nullServer;
    void *refStrings; // SBRefStrHash
} SBServerGlobals;

extern SBServerGlobals sbServerGlobals;

// sb_serverlist.c globals (asm data): the list being sorted and an optional master server host name
typedef struct SBListGlobals {
    SBServerList *sortList;
    char *masterHost;
} SBListGlobals;

extern SBServer *sbNoServer; // the "no server" value passed to the list callback

// sb_serverlist.c
int IntKeyCompare(SBServer **a, SBServer **b);
int FloatKeyCompare(SBServer **a, SBServer **b);
int StrCaseKeyCompare(SBServer **a, SBServer **b);
int StrNoCaseKeyCompare(SBServer **a, SBServer **b);
void SBServerListSort(SBServerList *list, int ascending, const char *key, u32 type);
int SBServerListFindServer(SBServerList *list, SBServer *server);
int SBServerListFindServerByIP(SBServerList *list, u32 ip, u16 port);
void SBServerListAddToDeadList(SBServerList *list, SBServer *server);
void SBServerListRemoveAt(SBServerList *list, int index);
int SBServerListCount(SBServerList *list);
SBServer *SBServerListNth(SBServerList *list, int index);
void SBServerListFreeDeadList(SBServerList *list);
void SBServerListClear(SBServerList *list);
void SBServerListInitServers(SBServerList *list);
char *SBRefStr(SBServerList *list, const char *str);
void SBReleaseStr(SBServerList *list, const char *str);
int NTSLengthSB(const char *str, int len);
void SBServerListInit(SBServerList *list, const char *targetGameName, const char *gameName, const char *secretKey, int queryFromVersion, int force, SBListCallback callback, void *param);
void ErrorDisconnect(SBServerList *list);
u32 ServerListStringHash(const char *str, u32 mod);
int ServerListConnect(SBServerList *list);
void SetupListChallenge(SBServerList *list);
int SendWithRetry(SBServerList *list, const void *data, int size);
int SBServerListConnectAndQuery(SBServerList *list, const char *keys, const char *filter, u32 options, int maxServers);
void FreePopularValues(SBServerList *list);
void FreeKeyList(SBServerList *list);
void SBServerListDisconnect(SBServerList *list);
void SBServerListCleanup(SBServerList *list);
int ServerSizeForFlags(int flags);
int IncomingListParseServer(SBServerList *list, const u8 *data, int len);
void SBSetLastListErrorPtr(SBServerList *list, char *message);
int ProcessMainListData(SBServerList *list);
int ProcessAdHocData(SBServerList *list);
int ProcessIncomingData(SBServerList *list);
int SBSendMessageToServer(SBServerList *list, u32 ip, u16 port, void *data, int len);
int SBSendNatNegotiateCookieToServer(SBServerList *list, u32 ip, u16 port, u32 value);
int ProcessLanData(SBServerList *list);
int SBListThink(SBServerList *list);

// sb_server.c
void TimeoutOldQueries(SBQueryEngine *engine);
void QueueNextQueries(SBQueryEngine *engine);
void SBQueryEngineThink(SBQueryEngine *engine);
void SBQueryEngineAddQueryKey(SBQueryEngine *engine, int key);
void SBEngineRemoveServerFromFIFOs(SBQueryEngine *engine, SBServer *server);
u32 RefStringHash(const void *elem, u32 buckets);
int RefStringCompare(const void *a, const void *b);
void RefStringFree(void *elem);
void *SBRefStrHash(SBServerList *list);
void SBRefStrHashCleanup(SBServerList *list);
void SBServerFree(SBServer **server);
void SBServerAddKeyValue(SBServer *server, const char *key, const char *value);
void SBServerAddIntKeyValue(SBServer *server, const char *key, int value);
char *SBServerGetStringValueA(SBServer *server, const char *key, char *fallback);
int SBServerGetIntValueA(SBServer *server, const char *key, int fallback);
double SBServerGetFloatValueA(SBServer *server, const char *key, double fallback);
u32 SBServerGetPublicInetAddress(SBServer *server);
u16 SBServerGetPublicQueryPort(SBServer *server);
int SBServerGetPublicQueryPortNBO(SBServer *server);
int SBServerHasPrivateAddress(SBServer *server);
u32 SBServerGetPrivateInetAddress(SBServer *server);
u16 SBServerGetPrivateQueryPort(SBServer *server);
void SBServerSetNext(SBServer *server, SBServer *next);
SBServer *SBServerGetNext(SBServer *server);
int CheckValidKey(const char *key);
char *mytok(char *input, int delim);
void SBServerParseKeyVals(SBServer *server, char *str);
void SBServerParseQR2FullKeysSingle(SBServer *server, const char *data, int len);
u32 StringHash(const char *str, u32 mod);
void KeyValFree(char **pair);
u32 KeyValHashKey(char **pair, u32 mod);
int KeyValCompareKey(char **a, char **b);
u32 SBServerGetPing(SBServer *server);
SBServer *SBAllocServer(SBServerList *list, u32 ip, u16 port);
void SBServerSetFlags(SBServer *server, u8 flags);
void SBServerSetPrivateAddr(SBServer *server, u32 ip, u16 port);
void SBServerSetICMPIP(SBServer *server, u32 ip);
void SBServerSetState(SBServer *server, u8 state);
u8 SBServerGetState(SBServer *server);
int SBIsNullServer(SBServer *server);
void ListCallback(SBServerList *list, int reason, SBServer *server, ServerBrowser *browser);
void EngineCallback(SBQueryEngine *engine, int reason, SBServer *server, ServerBrowser *browser);
ServerBrowser *ServerBrowserNewA(const char *targetGameName, const char *gameName, const char *secretKey, int queryFromVersion, int maxUpdates, int queryVersion, int force, ServerBrowserCallback callback, void *param);
void ServerBrowserFree(ServerBrowser *browser);
int ServerBrowserBeginUpdate2(ServerBrowser *browser, int async, int disconnectOnComplete, u8 *keys, int numKeys, const char *filter, u32 options, int maxServers);
int ServerBrowserLimitUpdateA(ServerBrowser *browser, int async, int disconnectOnComplete, u8 *keys, int numKeys, const char *filter, int maxServers);
int ServerBrowserSendMessageToServerA(ServerBrowser *browser, const char *address, int port, void *data, int len);
int ServerBrowserSendNatNegotiateCookieToServerA(ServerBrowser *browser, const char *address, int port, u32 value);
void ServerBrowserRemoveServer(ServerBrowser *browser, SBServer *server);
int ServerBrowserThink(ServerBrowser *browser);
void ServerBrowserHalt(ServerBrowser *browser);
void ServerBrowserClear(ServerBrowser *browser);
int ServerBrowserState(ServerBrowser *browser);
SBServer *ServerBrowserGetServer(ServerBrowser *browser, int index);
int ServerBrowserCount(ServerBrowser *browser);
void ServerBrowserSortA(ServerBrowser *browser, int ascending, const char *key, u32 type);
u32 ServerBrowserGetMyPublicIP(ServerBrowser *browser);

// sb_query_engine.c
u8 keyrand(u8 *state, u32 max, u8 *key, u32 len, u8 *value, u32 *pos);
void GOAHashInit(u8 *state);
u8 GOADecryptByte(u8 *state, u8 value);
void FIFOAddRear(SBServerQueue *queue, SBServer *server);
void FIFOAddFront(SBServerQueue *queue, SBServer *server);
SBServer *FIFOGetFirst(SBServerQueue *queue);
int FIFORemove(SBServerQueue *queue, SBServer *server);
void FIFOClear(SBServerQueue *queue);
void QEStartQuery(SBQueryEngine *engine, SBServer *server);
void SBQueryEngineInit(SBQueryEngine *engine, int maxUpdates, int queryVersion, int force, SBEngineCallback callback, void *param);
void SBQueryEngineSetPublicIP(SBQueryEngine *engine, u32 publicIp);
void SBEngineHaltUpdates(SBQueryEngine *engine);
void SBEngineCleanup(SBQueryEngine *engine);
void SBQueryEngineUpdateServer(SBQueryEngine *engine, SBServer *server, int first, int mode);
void ParseSingleQR2Reply(SBQueryEngine *engine, SBServer *server, s8 *data, int len);
void ParseSingleGOAReply(SBQueryEngine *engine, SBServer *server, char *data, int len);
int ParseSingleICMPReply(SBQueryEngine *engine, SBServer *server, char *data, int len);
void ProcessIncomingReplies(SBQueryEngine *engine, int second);

// list request encryption state (GOACryptInit initialises it with the challenge, GOADecrypt decodes)
void GOACryptInit(u8 *state, s8 *key, u32 len);
void GOADecrypt(u8 *state, u8 *data, int len);

#endif // POKEHEARTGOLD_LIB_INCLUDE_DWC_SB_INTERNAL_H
