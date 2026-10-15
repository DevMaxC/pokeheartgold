#pragma force_active on
#include <string.h>

#include "global.h"

#include "dwc/sb_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

extern void __msl_assertion_failed(const char *expr, const char *file, const char *func, int line);
extern int strnicmp(const char *a, const char *b);
extern int strncmp(const char *a, const char *b, u32 n);
extern double atod(const char *str);
extern int sprintf(char *buf, const char *fmt, ...);
extern int rand(void);
extern void srand(unsigned seed);
extern u8 __lower_mapC[];

extern void *DWCi_GsMalloc(u32 size);
extern void DWCi_GsFree(void *p);
extern void *ArrayNew(int elemSize, int count, void *freeFunc);
extern void ArrayFree(void *array);
extern int ArrayLength(void *array);
extern void *ArrayNth(void *array, int index);
extern void ArrayAppend(void *array, void *elem);
extern void ArrayDeleteAt(void *array, int index);
extern void ArraySort(void *array, void *compare);
extern void ArrayClear(void *array);
extern void TableEnter(void *table, void *elem);
extern void TableRemove(void *table, void *elem);
extern void *TableLookup(void *table, void *elem);
extern u32 current_time(void);
extern void SocketStartUp(void);
extern char *goastrdup(const char *str);
extern int CanReceiveOnSocket(int socket);
extern int gsSocketCreate(int domain, int type, int protocol);
extern int gsSocketClose(int socket);
extern int gsSocketConnect(int socket, void *addr, int len);
extern int gsSocketRecv(int socket, void *buf, int len, int flags);
extern int gsSocketRecvFrom(int socket, void *buf, int len, int flags, void *addr, void *addrLen);
extern int gsSocketSend(int socket, const void *buf, int len, int flags);
extern u32 gsSocketInetAddr(const char *address);

typedef struct SockAddr {
    u8 len;
    u8 family;
    u16 port;
    u32 address;
} SockAddr;

typedef struct HostEnt {
    char *name;
    char **aliases;
    int type;
    u8 **addresses;
} HostEnt;

extern HostEnt *SOC_GetHostByName(const char *name);

extern int ov00_0221B0D0;
extern SBListGlobals sbListGlobals;
extern char *sbQueryErrorPrefix; // "Query Error: "
extern char sStr_SBReleaseStr[];
extern char sStr_AllKeysPresent[];
extern char sStr_SBServerListInit[];
extern char sStr_ProcessAdHocData[];
extern char sStr_ProcessMainListData[];
extern char sStr_SBServerListConnectAndQuery[];
extern char sStr_Empty_14[];
extern char sStr_ValNeNULL[];
extern char sStr_SbServerlistC[];
extern char sStr_SlistNeNULL[];
extern char sStr_CallbackNeNULL[];
extern const char sFmt_MsGsNintendowifiNet[];
extern char sStr_SlistStateEqSlDisconnected[];
extern char sStr_0_7[];
extern u8 sbInvalidServerIp[];
extern char sStr_InlenGe0[];
extern char sStr_SlistInbufferlenGe0[];

void SBServerListAppendServer(SBServerList *list, SBServer *server);
void BufferAddNTS(char **cursor, const char *str, int *len);
void BufferAddByte(char **cursor, int value, int *len);
void BufferAddInt(u8 **cursor, u32 value, u32 *len);
void BufferAddData(char **cursor, const void *data, int size, int *len);
void InitCryptKey(SBServerList *list, s8 *data, int count);
int FullRulesPresent(char *data, int len);
int AllKeysPresent(SBServerList *list, u8 *data, int len);
void ParseServerIPPort(SBServerList *list, const u8 *data, int len, u32 *ip, u16 *port);
int ParseServer(SBServerList *list, SBServer *server, const u8 *data, int len, int popular);
int ProcessPushKeysMessage(SBServerList *list, u8 *data, int len);
int ProcessPlayerSearchMessage(SBServerList *list, u8 *data, int len);
int ProcessMaploopMessage(SBServerList *list, u8 *data, int len);
int ProcessDeleteServerMessage(SBServerList *list, u8 *data, int len);
int ProcessPushServerMessage(SBServerList *list, void *data, int len);

int IntKeyCompare(SBServer **a, SBServer **b) {
    SBServer *serverA = *(SBServer *volatile *)a; // volatile keeps the original load order
    SBServerList *list = sbListGlobals.sortList;
    SBServer *serverB = *b;
    int valueA = SBServerGetIntValueA(serverA, list->sortKey, 0);
    int valueB = SBServerGetIntValueA(serverB, sbListGlobals.sortList->sortKey, 0);
    int diff = valueA - valueB;
    if (!sbListGlobals.sortList->sortAscending) {
        diff = -diff;
    }
    return diff;
}

int FloatKeyCompare(SBServer **a, SBServer **b) {
    SBServer *serverB = *b;
    double valueA = SBServerGetFloatValueA(*a, sbListGlobals.sortList->sortKey, 0);
    double diff = valueA - SBServerGetFloatValueA(serverB, sbListGlobals.sortList->sortKey, 0);
    if (!sbListGlobals.sortList->sortAscending) {
        diff = 0 - diff;
    }
    if ((float)diff > 0) {
        return 1;
    }
    return -((float)diff < 0);
}

int StrCaseKeyCompare(SBServer **a, SBServer **b) {
    char *valueA = SBServerGetStringValueA(*a, sbListGlobals.sortList->sortKey, sStr_Empty_14);
    char *valueB = SBServerGetStringValueA(*b, sbListGlobals.sortList->sortKey, sStr_Empty_14);
    int diff = strcmp(valueA, valueB);
    if (!sbListGlobals.sortList->sortAscending) {
        diff = -diff;
    }
    return diff;
}

int StrNoCaseKeyCompare(SBServer **a, SBServer **b) {
    char *valueA = SBServerGetStringValueA(*a, sbListGlobals.sortList->sortKey, sStr_Empty_14);
    char *valueB = SBServerGetStringValueA(*b, sbListGlobals.sortList->sortKey, sStr_Empty_14);
    int diff = strnicmp(valueA, valueB);
    if (!sbListGlobals.sortList->sortAscending) {
        diff = -diff;
    }
    return diff;
}

void SBServerListSort(SBServerList *list, int ascending, const char *key, u32 type) {
    void *compare;
    switch (type) {
    case sbcm_int:
        compare = IntKeyCompare;
        break;
    case sbcm_float:
        compare = FloatKeyCompare;
        break;
    case sbcm_strcase:
        compare = StrCaseKeyCompare;
        break;
    case sbcm_stricase:
        compare = StrNoCaseKeyCompare;
        break;
    default:
        compare = StrNoCaseKeyCompare;
        break;
    }
    list->sortKey = key;
    list->sortAscending = ascending;
    sbListGlobals.sortList = list;
    ArraySort(list->servers, compare);
}

void SBServerListAppendServer(SBServerList *list, SBServer *server) {
    ArrayAppend(list->servers, &server);
    list->callback(list, slc_serveradded, server, list->param);
}

int SBServerListFindServer(SBServerList *list, SBServer *server) {
    int count = ArrayLength(list->servers);
    int i;
    for (i = 0; i < count; i++) {
        if (server == *(SBServer **)ArrayNth(list->servers, i)) {
            return i;
        }
    }
    return -1;
}

int SBServerListFindServerByIP(SBServerList *list, u32 ip, u16 port) {
    int count = ArrayLength(list->servers);
    SBServer *server;
    int i;
    for (i = 0; i < count; i++) {
        server = *(SBServer **)ArrayNth(list->servers, i);
        if (ip == SBServerGetPublicInetAddress(server) && port == SBServerGetPublicQueryPortNBO(server)) {
            return i;
        }
    }
    return -1;
}

void SBServerListAddToDeadList(SBServerList *list, SBServer *server) {
    if (!list->deadList) {
        SBServerSetNext(server, NULL);
    } else {
        SBServerSetNext(server, list->deadList);
    }
    list->deadList = server;
}

void SBServerListRemoveAt(SBServerList *list, int index) {
    SBServer *server = *(SBServer **)ArrayNth(list->servers, index);
    list->callback(list, slc_serverdeleted, server, list->param);
    ArrayDeleteAt(list->servers, index);
    SBServerListAddToDeadList(list, server);
}

int SBServerListCount(SBServerList *list) {
    return ArrayLength(list->servers);
}

SBServer *SBServerListNth(SBServerList *list, int index) {
    return *(SBServer **)ArrayNth(list->servers, index);
}

void SBServerListFreeDeadList(SBServerList *list) {
    SBServer *server = list->deadList;
    SBServer *current;
    if (!server) {
        return;
    }
    current = server;
    while (server) {
        server = SBServerGetNext(server);
        SBServerFree(&current);
        current = server;
    }
    list->deadList = NULL;
}

void SBServerListClear(SBServerList *list) {
    int i;
    int count = ArrayLength(list->servers);
    for (i = 0; i < count; i++) {
        SBServer **server = ArrayNth(list->servers, i);
        SBServerListAddToDeadList(list, *server);
    }
    ArrayClear(list->servers);
    SBServerListFreeDeadList(list);
}

void SBServerListInitServers(SBServerList *list) {
    list->servers = ArrayNew(4, 100, NULL);
    list->deadList = NULL;
}

// Shared strings: a hash table of reference counted copies (SBRefStrHash)
typedef struct SBRefString {
    char *str;
    int refCount;
} SBRefString;

char *SBRefStr(SBServerList *list, const char *str) {
    SBRefString ref;
    SBRefString *found;
    ref.str = (char *)str;
    found = TableLookup(SBRefStrHash(list), &ref);
    if (found) {
        found->refCount++;
        return found->str;
    }
    ref.str = goastrdup(str);
    ref.refCount = 1;
    TableEnter(SBRefStrHash(list), &ref);
    return ref.str;
}

void SBReleaseStr(SBServerList *list, const char *str) {
    SBRefString ref;
    SBRefString *found;
    ref.str = (char *)str;
    found = TableLookup(SBRefStrHash(list), &ref);
    if (!found) {
        __msl_assertion_failed(sStr_ValNeNULL, sStr_SbServerlistC, sStr_SBReleaseStr, 244);
    }
    if (!found) {
        return;
    }
    if (--found->refCount != 0) {
        return;
    }
    TableRemove(SBRefStrHash(list), &ref);
}

// Length of the NUL-terminated string at str including the NUL, -1 if there is none within len bytes
int NTSLengthSB(const char *str, int len) {
    int i;
    for (i = 0; i < len; i++) {
        if (str[i] == 0) {
            return i + 1;
        }
    }
    return -1;
}

void SBServerListInit(SBServerList *list, const char *targetGameName, const char *gameName, const char *secretKey, int queryFromVersion, int force, SBListCallback callback, void *param) {
    if (!list) {
        __msl_assertion_failed(sStr_SlistNeNULL, sStr_SbServerlistC, sStr_SBServerListInit, 0x11C);
    }
    if (!force && ov00_0221B0D0 != 1) {
        return;
    }
    list->state = SB_LIST_DISCONNECTED;
    SBServerListInitServers(list);
    SBRefStrHash(list);
    strcpy(list->targetGameName, targetGameName);
    strcpy(list->gameName, gameName);
    strcpy(list->secretKey, secretKey);
    list->callback = callback;
    list->maploopCallback = NULL;
    if (!callback) {
        __msl_assertion_failed(sStr_CallbackNeNULL, sStr_SbServerlistC, sStr_SBServerListInit, 0x132);
    }
    list->param = param;
    list->sortKey = sStr_Empty_14;
    list->publicIp = 0;
    list->socket = INVALID_SOCKET;
    list->inBuffer = NULL;
    list->inBufferLen = 0;
    list->keyList = NULL;
    list->expectedElements = -1;
    list->numPopularValues = 0;
    list->alternateSourceIp = 0;
    list->queryFromVersion = queryFromVersion;
    SBSetLastListErrorPtr(list, sStr_Empty_14);
    list->unk_5CC = 0;
    srand(current_time());
    SocketStartUp();
}

void ErrorDisconnect(SBServerList *list) {
    int len = list->inBufferLen;
    if (len > 0) {
        char *prefix = sbQueryErrorPrefix;
        if ((u32)len > strlen(prefix)) {
            char *buffer = (char *)list->inBuffer;
            char *prefix2 = sbQueryErrorPrefix;
            if (strncmp(buffer, prefix2, strlen(prefix2)) == 0) {
                SBSetLastListErrorPtr(list, buffer + strlen(prefix));
                list->callback(list, slc_queryerror, sbNoServer, list->param);
            }
        }
    }
    list->callback(list, slc_disconnected, sbNoServer, list->param);
    SBServerListDisconnect(list);
}

u32 ServerListStringHash(const char *str, u32 mod) {
    u32 hash = 0;
    for (; *str != 0; str++) {
        int c = *str;
        hash = 0x9CCF9319 * hash + ((c < 0 || c >= 0x80) ? c : __lower_mapC[c]);
    }
    return hash % mod;
}

// Opens the TCP connection to the master server (host selected by a hash of the game name)
int ServerListConnect(SBServerList *list) {
    struct {
        SockAddr address;
        char host[128];
    } f;

    int index = ServerListStringHash(list->targetGameName, 20);
    if (sbListGlobals.masterHost) {
        strcpy(f.host, sbListGlobals.masterHost);
    } else {
        sprintf(f.host, sFmt_MsGsNintendowifiNet, list->targetGameName, index);
    }
    f.address.family = AF_INET;
    f.address.port = 0xEE70;
    f.address.address = gsSocketInetAddr(f.host);
    if (f.address.address == (u32)-1) {
        HostEnt *host = SOC_GetHostByName(f.host);
        if (!host) {
            return sbe_dnserror;
        }
        memcpy(&f.address.address, host->addresses[0], 4);
    }
    if (list->socket == INVALID_SOCKET) {
        list->socket = gsSocketCreate(AF_INET, SOCK_STREAM, 0);
        if (list->socket == INVALID_SOCKET) {
            return sbe_socketerror;
        }
    }
    if (gsSocketConnect(list->socket, &f.address, 8) == 0) {
        return sbe_noerror;
    }
    gsSocketClose(list->socket);
    list->socket = INVALID_SOCKET;
    return sbe_connecterror;
}

void BufferAddNTS(char **cursor, const char *str, int *len) {
    int size;
    if (!str) {
        str = sStr_Empty_14;
    }
    size = strlen(str) + 1;
    memcpy(*cursor, str, size);
    *len += size;
    *cursor += size;
}

void BufferAddByte(char **cursor, int value, int *len) {
    **cursor = value;
    (*len)++;
    (*cursor)++;
}

void BufferAddInt(u8 **cursor, u32 value, u32 *len) {
    memcpy(*cursor, &value, 4);
    *len += 4;
    *cursor += 4;
}

void BufferAddData(char **cursor, const void *data, int size, int *len) {
    memcpy(*cursor, data, size);
    *len += size;
    *cursor += size;
}

// Random printable challenge with a parity rule per character
void SetupListChallenge(SBServerList *list) {
    int i;
    int parity;
    list->challenge[0] = rand() % 93 + 33;
    parity = 0;
    i = 1;
    for (; i < 8; i++) {
        parity = ((list->challenge[0] & 1) ^ (parity ^ ((i ^ list->challenge[i - 1]) & 1))) ^ (list->challenge[0] < 0x4F ? 1 : 0) ^ (list->challenge[i - 1] < list->challenge[0] ? 1 : 0);
        list->challenge[i] = rand() % 93 + 33;
        if ((parity != 0 && (list->challenge[i] & 1) == 0) || (parity == 0 && (list->challenge[i] & 1) == 1)) {
            list->challenge[i]++;
        }
    }
}

// Sends to the master server, reconnecting once if the connection was lost
int SendWithRetry(SBServerList *list, const void *data, int size) {
    int sent, retries = 1, result;
    do {
        retries--;
        sent = gsSocketSend(list->socket, data, size, 0);
        if (sent > 0 || retries < 0) {
            break;
        }
        SBServerListDisconnect(list);
        result = SBServerListConnectAndQuery(list, NULL, NULL, 2, 0);
        if (result) {
            ErrorDisconnect(list);
            return result;
        }
    } while (retries >= 0);
    return sent <= 0 ? 3 : 0;
}

#pragma inlineintrinsics on

// Connects to the master server and sends the list request
int SBServerListConnectAndQuery(SBServerList *list, const char *keys, const char *filter, u32 options, int maxServers) {
    u8 buffer[0x300];
    int len;
    u8 *cursor;
    u16 swapped;
    int result;
    u32 swap;
    if (list->state != SB_LIST_DISCONNECTED) {
        __msl_assertion_failed(sStr_SlistStateEqSlDisconnected, sStr_SbServerlistC, sStr_SBServerListConnectAndQuery, 522);
    }
    if (!keys) {
        keys = sStr_Empty_14;
    }
    if (!filter) {
        filter = sStr_Empty_14;
    }
    if (strlen(keys) > 256) {
        return sbe_paramerror;
    }
    if (strlen(filter) > 256) {
        return sbe_paramerror;
    }
    result = ServerListConnect(list);
    if (result) {
        return result;
    }
    list->queryOptions = options;
    SetupListChallenge(list);
    len = 2;
    cursor = buffer + 2;
    BufferAddByte((char **)&cursor, 0, &len);
    BufferAddByte((char **)&cursor, 1, &len);
    BufferAddByte((char **)&cursor, 3, &len);
    BufferAddInt(&cursor, list->queryFromVersion, (u32 *)&len);
    BufferAddNTS((char **)&cursor, list->targetGameName, &len);
    BufferAddNTS((char **)&cursor, list->gameName, &len);
    BufferAddData((char **)&cursor, list->challenge, 8, &len);
    BufferAddNTS((char **)&cursor, filter, &len);
    BufferAddNTS((char **)&cursor, keys, &len);
    swap = ((options << 24) & 0xFF000000) | (((options << 8) & 0xFF0000) | (((options >> 24) & 0xFF) | ((options >> 8) & 0xFF00)));
    BufferAddInt(&cursor, swap, (u32 *)&len);
    if (list->queryOptions & 8) {
        BufferAddInt(&cursor, list->alternateSourceIp, (u32 *)&len);
    }
    if (list->queryOptions & 0x80) {
        BufferAddInt(&cursor, maxServers, (u32 *)&len);
    }
    {
        u8 *src = (u8 *)&swapped;
        volatile u8 *dst = buffer;
        swapped = (((u16)len >> 8) & 0xFF) | (((u16)len << 8) & 0xFF00);
        memcpy((u8 *)dst, src, 2);
    }
    result = gsSocketSend(list->socket, buffer, len, 0);
    if (result <= 0) {
        SBServerListDisconnect(list);
        return sbe_connecterror;
    }
    list->state = SB_LIST_LIST;
    list->readStage = pi_cryptheader;
    if (!list->inBuffer) {
        list->inBuffer = DWCi_GsMalloc(4096);
        if (!list->inBuffer) {
            return sbe_allocerror;
        }
        list->inBufferLen = 0;
    }
    return sbe_noerror;
}

#pragma inlineintrinsics reset

void FreePopularValues(SBServerList *list) {
    int i;
    for (i = 0; i < list->numPopularValues; i++) {
        SBReleaseStr(list, list->popularValues[i]);
    }
    list->numPopularValues = 0;
}

void FreeKeyList(SBServerList *list) {
    int i;
    if (!list->keyList) {
        return;
    }
    for (i = 0; i < ArrayLength(list->keyList); i++) {
        SBReleaseStr(list, *(char **)ArrayNth(list->keyList, i));
    }
    ArrayFree(list->keyList);
    list->keyList = NULL;
}

void SBServerListDisconnect(SBServerList *list) {
    if (list->inBuffer) {
        DWCi_GsFree(list->inBuffer);
    }
    list->inBuffer = NULL;
    list->inBufferLen = 0;
    if (list->socket != INVALID_SOCKET) {
        gsSocketClose(list->socket);
    }
    list->socket = INVALID_SOCKET;
    list->state = SB_LIST_DISCONNECTED;
    FreeKeyList(list);
    list->expectedElements = -1;
    FreePopularValues(list);
}

void SBServerListCleanup(SBServerList *list) {
    SBServerListDisconnect(list);
    SBServerListClear(list);
    SBRefStrHashCleanup(list);
    if (list->servers) {
        ArrayFree(list->servers);
    }
    list->servers = NULL;
}

// Mixes the reply's random bytes into the challenge and starts decoding with it
void InitCryptKey(SBServerList *list, s8 *data, int count) {
    int i, len;
    char *key;
    len = strlen(list->secretKey);
    key = list->secretKey;
    for (i = 0; i < count; i++) {
        int first = i % 8;
        int second = (i * (signed char)key[i % len]) % 8;
        signed char value = list->challenge[first] ^ data[i];
        list->challenge[second] = list->challenge[second] ^ value;
    }
    GOACryptInit(list->cryptState, list->challenge, 8);
}

// Size of a server record's fixed part for its flags byte
int ServerSizeForFlags(int flags) {
    int size = 5;
    if (flags & PRIVATE_IP_FLAG) {
        size += 4;
    }
    if (flags & ICMP_IP_FLAG) {
        size += 4;
    }
    if (flags & NONSTANDARD_PORT_FLAG) {
        size += 2;
    }
    if (flags & NONSTANDARD_PRIVATE_PORT_FLAG) {
        size += 2;
    }
    return size;
}

// Checks that data holds complete key / value string pairs ending with an empty key
int FullRulesPresent(char *data, int len) {
    int size;
    while (len > 0 && *data) {
        size = NTSLengthSB(data, len);
        if (size < 0) {
            return 0;
        }
        len -= size;
        data += size;
        size = NTSLengthSB(data, len);
        if (size < 0) {
            return 0;
        }
        data += size;
        len -= size;
    }
    if (len == 0) {
        return 0;
    }
    return *data == 0;
}

// Checks that data holds complete values for all keys of keyList
int AllKeysPresent(SBServerList *list, u8 *data, int len) {
    int count = ArrayLength(list->keyList);
    int i;
    for (i = 0; i < count; i++) {
        SBKeyInfo *key = ArrayNth(list->keyList, i);
        switch (key->type) {
        case KEYTYPE_BYTE:
            data++;
            len--;
            break;
        case KEYTYPE_SHORT:
            data += 2;
            len -= 2;
            break;
        case KEYTYPE_STRING:
            if (len < 1) {
                return 0;
            }
            len--;
            if (*data++ == 255) {
                int size = NTSLengthSB((char *)data, len);
                if (size == -1) {
                    return 0;
                }
                data += size;
                len -= size;
            }
            break;
        default:
            __msl_assertion_failed(sStr_0_7, sStr_SbServerlistC, sStr_AllKeysPresent, 0x317);
            return 0;
        }
        if (len < 0) {
            return 0;
        }
    }
    return 1;
}

typedef struct {
    u8 data[4];
} Bytes4;

typedef struct {
    u8 data[2];
} Bytes2;

// Public address of a server record
void ParseServerIPPort(SBServerList *list, const u8 *data, int len, u32 *ip, u16 *port) {
    u8 flags;
    if (len < 5) {
        return;
    }
    flags = data[0];
    *(Bytes4 *)ip = *(const Bytes4 *)(data + 1);
    if (flags & NONSTANDARD_PORT_FLAG) {
        if (len - 5 < 2) {
            return;
        }
        *(Bytes2 *)port = *(const Bytes2 *)(data + 5);
    } else {
        *port = list->defaultPort;
    }
}

// Parses a server record into server, returns its size
int ParseServer(SBServerList *list, SBServer *server, const u8 *data, int len, int popular) {
    struct {
        int len;
        u16 port, number;
        u32 value;
    } frame;

    int left = len;
    u32 flags;
    flags = *data;
    data += 5;
    frame.len = len;
    SBServerSetFlags(server, (u8)flags);
    left -= 5;
    if (flags & NONSTANDARD_PORT_FLAG) {
        data += 2;
        left -= 2;
    }
    if (flags & PRIVATE_IP_FLAG) {
        memcpy(&frame.value, data, 4);
        data += 4;
        left -= 4;
    } else {
        frame.value = 0;
    }
    if (flags & NONSTANDARD_PRIVATE_PORT_FLAG) {
        memcpy(&frame.port, data, 2);
        data += 2;
        left -= 2;
    } else {
        frame.port = list->defaultPort;
    }
    SBServerSetPrivateAddr(server, frame.value, frame.port);
    if (flags & ICMP_IP_FLAG) {
        memcpy(&frame.value, data, 4);
        data += 4;
        left -= 4;
        SBServerSetICMPIP(server, frame.value);
    }
    if (flags & HAS_KEYS_FLAG) {
        int count = ArrayLength(list->keyList);
        int i;
        for (i = 0; i < count; i++) {
            SBKeyInfo *key = ArrayNth(list->keyList, i);
            switch (key->type) {
            case KEYTYPE_BYTE:
                SBServerAddIntKeyValue(server, key->name, *data++);
                left--;
                break;
            case KEYTYPE_SHORT:
                memcpy(&frame.number, data, 2);
                SBServerAddIntKeyValue(server, key->name, (u16)(((int)frame.number >> 8) & 255 | ((int)frame.number << 8) & 0xFF00));
                data += 2;
                left -= 2;
                break;
            case KEYTYPE_STRING: {
                int code;
                if (popular) {
                    code = *data++;
                    left--;
                } else {
                    code = 255;
                }
                if (code == 255) {
                    int size;
                    SBServerAddKeyValue(server, key->name, (const char *)data);
                    size = strlen((const char *)data) + 1;
                    data += size;
                    left -= size;
                } else {
                    SBServerAddKeyValue(server, key->name, list->popularValues[code]);
                }
                break;
            }
            default:
                break;
            }
        }
        SBServerSetState(server, (u8)(SBServerGetState(server) | STATE_BASICKEYS));
    }
    if (flags & HAS_FULL_RULES_FLAG) {
        while (*(const s8 *)data != 0 && left > 0) {
            const char *name = (const char *)data;
            int size = strlen(name) + 1;
            data += size;
            left -= size;
            SBServerAddKeyValue(server, name, (const char *)data);
            size = strlen((const char *)data) + 1;
            data += size;
            left -= size;
        }
        left--;
        SBServerSetState(server, (u8)(SBServerGetState(server) | STATE_FULLKEYS));
    }
    return frame.len - left;
}

// One server record of the list reply: 0 if incomplete, -1 at the end marker, -2 on allocation failure
int IncomingListParseServer(SBServerList *list, const u8 *data, int len) {
    u8 flags;
    int size, used;
    SBServer *server;
    u32 ip;
    u16 port;
    if (len < 1) {
        return 0;
    }
    flags = *data;
    size = ServerSizeForFlags(flags);
    if (len < size) {
        return 0;
    }
    if ((flags & HAS_KEYS_FLAG) && AllKeysPresent(list, (u8 *)data + size, len - size) == 0) {
        return 0;
    }
    if ((flags & HAS_FULL_RULES_FLAG) && FullRulesPresent((char *)data + size, len - size) == 0) {
        return 0;
    }
    if (memcmp(data + 1, sbInvalidServerIp, 4) == 0) {
        return -1;
    }
    ParseServerIPPort(list, data, len, &ip, &port);
    server = SBAllocServer(list, ip, port);
    if (SBIsNullServer(server) != 0) {
        return -2;
    }
    used = ParseServer(list, server, data, len, 1);
    SBServerListAppendServer(list, server);
    return used;
}

void SBSetLastListErrorPtr(SBServerList *list, char *message) {
    list->errorMessage = message;
}

// Reads the list reply: crypt header, own address, keys, popular values, then the server records
int ProcessMainListData(SBServerList *list) {
    struct {
        u8 *ptr;
        int left;
    } cursor = { list->inBuffer, list->inBufferLen };

    SBKeyInfo key;
    switch (list->readStage) {
    case pi_cryptheader: {
        int pos, total, size;
        if (cursor.left < 1) {
            break;
        }
        pos = (*cursor.ptr ^ 0xEC) + 2;
        if (cursor.left < pos) {
            break;
        }
        size = cursor.ptr[pos - 1] ^ 0xEA;
        total = pos + size;
        if (cursor.left < total) {
            break;
        }
        InitCryptKey(list, (s8 *)cursor.ptr + pos, size);
        cursor.ptr += total;
        cursor.left -= total;
        list->readStage = pi_fixedheader;
        GOADecrypt(list->cryptState, cursor.ptr, cursor.left);
    }
    case pi_fixedheader:
        if (cursor.left < 6) {
            break;
        }
        memcpy(&list->publicIp, cursor.ptr, 4);
        list->callback(list, slc_publicipdetermined, sbNoServer, list->param);
        memcpy(&list->defaultPort, cursor.ptr + 4, 2);
        if (list->defaultPort == 0xFFFF) {
            if (NTSLengthSB((char *)cursor.ptr + 6, cursor.left - 6) == -1) {
                break;
            }
            SBSetLastListErrorPtr(list, (char *)cursor.ptr + 6);
            list->callback(list, slc_queryerror, sbNoServer, list->param);
            if (!list->inBuffer) {
                break;
            }
        }
        cursor.ptr += 6;
        cursor.left -= 6;
        if ((list->queryOptions & 2) || list->defaultPort == 0xFFFF) {
            list->readStage = pi_finished;
            list->state = SB_LIST_CONNECTED;
            break;
        }
        list->readStage = pi_keylist;
        list->expectedElements = -1;
    case pi_keylist: {
        int size;
        if (list->expectedElements == -1) {
            if (cursor.left < 1) {
                break;
            }
            list->expectedElements = *cursor.ptr;
            list->keyList = ArrayNew(8, list->expectedElements, NULL);
            if (!list->keyList) {
                return sbe_allocerror;
            }
            cursor.ptr++;
            cursor.left--;
        }
        while (list->expectedElements > ArrayLength(list->keyList)) {
            if (cursor.left < 2) {
                break;
            }
            size = NTSLengthSB((char *)cursor.ptr + 1, cursor.left - 1);
            if (size == -1) {
                break;
            }
            key.type = *cursor.ptr;
            key.name = SBRefStr(list, (char *)cursor.ptr + 1);
            ArrayAppend(list->keyList, &key);
            cursor.ptr += size + 1;
            cursor.left -= size + 1;
        }
        if (list->expectedElements > ArrayLength(list->keyList)) {
            break;
        }
        list->readStage = pi_uniquevaluelist;
        list->expectedElements = -1;
    }
    case pi_uniquevaluelist: {
        int size;
        if (list->expectedElements == -1) {
            if (cursor.left < 1) {
                break;
            }
            list->expectedElements = *cursor.ptr++;
            cursor.left--;
            list->numPopularValues = 0;
        }
        while (list->expectedElements > list->numPopularValues) {
            size = NTSLengthSB((char *)cursor.ptr, cursor.left);
            if (size == -1) {
                break;
            }
            list->popularValues[list->numPopularValues++] = SBRefStr(list, (char *)cursor.ptr);
            cursor.ptr += size;
            cursor.left -= size;
        }
        if (list->expectedElements > list->numPopularValues) {
            break;
        }
        list->readStage = pi_servers;
    }
    case pi_servers: {
        int size;
        if (cursor.left < 5) {
            break;
        }
        do {
            size = IncomingListParseServer(list, cursor.ptr, cursor.left);
            if (size == -2) {
                return sbe_allocerror;
            }
            if (size == -1) {
                list->readStage = pi_finished;
                list->state = SB_LIST_CONNECTED;
                cursor.left -= 5;
                cursor.ptr += 5;
                list->callback(list, slc_initiallistcomplete, sbNoServer, list->param);
                break;
            }
            cursor.ptr += size;
            cursor.left -= size;
            if (!list->inBuffer) {
                size = 0;
            }
        } while (size);
    }
    }
    if (cursor.left < 0) {
        __msl_assertion_failed(sStr_InlenGe0, sStr_SbServerlistC, sStr_ProcessMainListData, 0x4AF);
    }
    if (!list->inBuffer) {
        return sbe_noerror;
    }
    if (cursor.left) {
        memmove(list->inBuffer, cursor.ptr, cursor.left);
    }
    list->inBufferLen = cursor.left;
    return sbe_noerror;
}

// Message 1: new key list
int ProcessPushKeysMessage(SBServerList *list, u8 *data, int len) {
    int i;
    int count = *data++;
    SBKeyInfo key;
    len--;
    if (list->keyList) {
        FreeKeyList(list);
    }
    list->keyList = ArrayNew(8, count, NULL);
    if (!list->keyList) {
        return sbe_allocerror;
    }
    for (i = 0; i < count; i++) {
        int size;
        if (len < 2) {
            return sbe_dataerror;
        }
        size = NTSLengthSB((char *)data + 1, len - 1);
        if (size == -1) {
            return sbe_dataerror;
        }
        key.type = data[0];
        key.name = SBRefStr(list, (char *)data + 1);
        ArrayAppend(list->keyList, &key);
        data += size + 1;
        len -= size + 1;
    }
    return sbe_noerror;
}

// Message 6: named entries (name, address, port, value, string) for the playerSearchCallback callback
int ProcessPlayerSearchMessage(SBServerList *list, u8 *data, int len) {
    u32 count, last;
    int i;
    u32 ip, value;
    u16 port;
    char *name;
    if (len < 2) {
        return sbe_dataerror;
    }
    count = data[1];
    last = data[0];
    data += 2;
    len -= 2;
    for (i = 0; i < (int)count; i++) {
        int size;
        name = (char *)data;
        size = NTSLengthSB((char *)data, len);
        if (size == -1) {
            return sbe_dataerror;
        }
        data += size;
        len -= size;
        if (len < 11) {
            return sbe_dataerror;
        }
        memcpy(&ip, data, 4);
        memcpy(&port, data + 4, 2);
        memcpy(&value, data + 6, 4);
        data += 10;
        len -= 10;
        value = ((value >> 24) & 255) | ((value >> 8) & 0xFF00) | ((value << 8) & 0xFF0000) | ((value << 24) & 0xFF000000);
        size = NTSLengthSB((char *)data, len);
        if (size == -1) {
            return sbe_dataerror;
        }
        list->playerSearchCallback(list, name, ip, port, value, (char *)data, list->param);
        data += size;
        len -= size;
    }
    if (last) {
        list->playerSearchCallback(list, NULL, 0, 0, 0, NULL, list->param);
    }
    return sbe_noerror;
}

// Message 5: strings for a known server, for the maploopCallback callback
int ProcessMaploopMessage(SBServerList *list, u8 *data, int len) {
    u32 value;
    u16 port;
    u32 ip;
    char *strings[16];
    int i, count;
    SBServer *server;
    if (len < 11) {
        return sbe_dataerror;
    }
    memcpy(&ip, data, 4);
    memcpy(&port, data + 4, 2);
    i = SBServerListFindServerByIP(list, ip, port);
    if (i == -1) {
        return sbe_noerror;
    }
    server = SBServerListNth(list, i);
    memcpy(&value, data + 6, 4);
    value = ((value >> 24) & 255) | ((value >> 8) & 0xFF00) | ((value << 8) & 0xFF0000) | ((value << 24) & 0xFF000000);
    count = data[10];
    data += 11;
    len -= 11;
    for (i = 0; i < count && i < 16; i++) {
        int size;
        if (len < 1) {
            break;
        }
        size = NTSLengthSB((char *)data, len);
        if (size == -1) {
            return sbe_dataerror;
        }
        strings[i] = (char *)data;
        data += size;
        len -= size;
    }
    if (!list->maploopCallback) {
        return sbe_noerror;
    }
    list->maploopCallback(list, server, value, i, strings, list->param);
    return sbe_noerror;
}

// Message 4: a server was removed
int ProcessDeleteServerMessage(SBServerList *list, u8 *data, int len) {
    u32 ip;
    u16 port;
    int i;
    if (len < 6) {
        return sbe_dataerror;
    }
    memcpy(&ip, data, 4);
    memcpy(&port, data + 4, 2);
    i = SBServerListFindServerByIP(list, ip, port);
    if (i == -1) {
        return sbe_noerror;
    }
    SBServerListRemoveAt(list, i);
    return sbe_noerror;
}

// Message 2: a server record (new or updated server)
int ProcessPushServerMessage(SBServerList *list, void *data, int len) {
    u32 ip;
    u16 port;
    SBServer *server;
    int i;
    if (len < 5) {
        return sbe_dataerror;
    }
    ParseServerIPPort(list, data, len, &ip, &port);
    i = SBServerListFindServerByIP(list, ip, port);
    if (i == -1) {
        server = SBAllocServer(list, ip, port);
        if (SBIsNullServer(server)) {
            return sbe_allocerror;
        }
    } else {
        server = SBServerListNth(list, i);
    }
    if (ParseServer(list, server, data, len, 0) < 0) {
        return sbe_dataerror;
    }
    if (i == -1) {
        SBServerListAppendServer(list, server);
    }
    list->callback(list, slc_serverupdated, server, list->param);
    return sbe_noerror;
}

// Handles the complete messages in inBuffer (big-endian u16 size, type byte, payload)
int ProcessAdHocData(SBServerList *list) {
    u16 size;
    int result = 0;
    while (list->inBufferLen >= 3) {
        memcpy(&size, list->inBuffer, 2);
        size = ((size >> 8) & 255) | ((size << 8) & 0xFF00);
        if (size > 4096) {
            result = sbe_dataerror;
            break;
        }
        if (list->inBufferLen < size) {
            return sbe_noerror;
        }
        switch (*(s8 *)(list->inBuffer + 2)) {
        case PUSH_KEYS_MESSAGE:
            result = ProcessPushKeysMessage(list, list->inBuffer + 3, size - 3);
            break;
        case PUSH_SERVER_MESSAGE:
            result = ProcessPushServerMessage(list, list->inBuffer + 3, size - 3);
            break;
        case KEEPALIVE_MESSAGE:
            if (gsSocketSend(list->socket, list->inBuffer, size, 0) <= 0) {
                return sbe_connecterror;
            }
            break;
        case DELETE_SERVER_MESSAGE:
            result = ProcessDeleteServerMessage(list, list->inBuffer + 3, size - 3);
            break;
        case MAPLOOP_MESSAGE:
            result = ProcessMaploopMessage(list, list->inBuffer + 3, size - 3);
            break;
        case PLAYERSEARCH_MESSAGE:
            result = ProcessPlayerSearchMessage(list, list->inBuffer + 3, size - 3);
            break;
        }
        list->inBufferLen -= size;
        if (list->inBufferLen < 0) {
            __msl_assertion_failed(sStr_SlistInbufferlenGe0, sStr_SbServerlistC, sStr_ProcessAdHocData, 1460);
        }
        if (list->inBufferLen && list->inBuffer) {
            memmove(list->inBuffer, list->inBuffer + size, list->inBufferLen);
        }
        if (result) {
            break;
        }
    }
    if (result) {
        ErrorDisconnect(list);
    }
    return result;
}

// Receives from the master server connection
int ProcessIncomingData(SBServerList *list) {
    int used, received, error;
    if (!CanReceiveOnSocket(list->socket)) {
        return sbe_noerror;
    }
    used = list->inBufferLen;
    received = gsSocketRecv(list->socket, list->inBuffer + used, 0x1000 - used, 0);
    if ((u32)(received + 1) <= 1) {
        ErrorDisconnect(list);
        return sbe_connecterror;
    }
    list->inBufferLen += received;
    error = sbe_noerror;
    if (list->state == SB_LIST_CONNECTED || list->readStage > pi_cryptheader) {
        GOADecrypt(list->cryptState, list->inBuffer + used, list->inBufferLen - used);
    }
    if (list->state == SB_LIST_LIST) {
        error = ProcessMainListData(list);
    }
    if (error) {
        return error;
    }
    if (list->state == SB_LIST_CONNECTED && list->inBufferLen > 0) {
        return ProcessAdHocData(list);
    }
    return sbe_noerror;
}

// Sends data to a server through the master server (message 2)
int SBSendMessageToServer(SBServerList *list, u32 ip, u16 port, void *data, int len) {
    u8 packet[16];
    u16 size;
    int value;
    if (list->state == SB_LIST_DISCONNECTED) {
        SBServerListConnectAndQuery(list, NULL, NULL, 2, 0);
    }
    if (list->state == SB_LIST_DISCONNECTED) {
        return sbe_connecterror;
    }
    value = (u16)(len + 9);
    size = ((value >> 8) & 255) | ((value << 8) & 0xFF00);
    memcpy(packet, &size, 2);
    packet[2] = 2;
    memcpy(packet + 3, &ip, 4);
    memcpy(packet + 7, &port, 2);
    {
        int result = SendWithRetry(list, packet, 9);
        if (result) {
            return result;
        }
    }
    return gsSocketSend(list->socket, data, len, 0) < 0 ? 3 : 0;
}

// Sends the 6-byte NAT negotiation magic plus value to a server
int SBSendNatNegotiateCookieToServer(SBServerList *list, u32 ip, u16 port, u32 value) {
    u8 packet[10];
    value = ((value >> 24) & 255) | ((value >> 8) & 0xFF00) | ((value << 8) & 0xFF0000) | ((value << 24) & 0xFF000000);
    packet[0] = 0xFD;
    packet[1] = 0xFC;
    packet[2] = 0x1E;
    packet[3] = 0x66;
    packet[4] = 0x6A;
    packet[5] = 0xB2;
    memcpy(packet + 6, &value, 4);
    return SBSendMessageToServer(list, ip, port, packet, 10);
}

// LAN mode: adds every server that answers, gives up after two seconds
int ProcessLanData(SBServerList *list) {
    SockAddr from;
    int fromLen = 8;
    u8 buffer[1500];
    if (CanReceiveOnSocket(list->socket)) {
        do {
            int i;
            SBServer *server;
            if (gsSocketRecvFrom(list->socket, buffer, 1499, 0, &from, &fromLen) != SOCKET_ERROR) {
                i = SBServerListFindServerByIP(list, from.address, from.port);
                if (i == -1) {
                    server = SBAllocServer(list, from.address, from.port);
                    if (SBIsNullServer(server)) {
                        return sbe_allocerror;
                    }
                    SBServerSetFlags(server, (UNSOLICITED_UDP_FLAG | NONSTANDARD_PORT_FLAG));
                    SBServerListAppendServer(list, server);
                }
            }
        } while (CanReceiveOnSocket(list->socket));
    }
    if (current_time() - list->lanStartTime > 2000) {
        gsSocketClose(list->socket);
        list->socket = INVALID_SOCKET;
        list->state = SB_LIST_DISCONNECTED;
        list->callback(list, slc_initiallistcomplete, sbNoServer, list->param);
    }
    return sbe_noerror;
}

int SBListThink(SBServerList *list) {
    SBServerListFreeDeadList(list);
    switch (list->state) {
    case SB_LIST_CONNECTED:
    case SB_LIST_LIST:
        return ProcessIncomingData(list);
    case SB_LIST_LAN:
        return ProcessLanData(list);
    case SB_LIST_DISCONNECTED:
    default:
        return sbe_noerror;
    }
}
