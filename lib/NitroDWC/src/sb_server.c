#pragma force_active on
#include <string.h>

#include "global.h"

#include "dwc/sb_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

extern void __msl_assertion_failed(const char *expr, const char *file, const char *func, int line);
extern int strnicmp(const char *a, const char *b);
extern long atol(const char *str);
extern double atod(const char *str);
extern int sprintf(char *buf, const char *fmt, ...);
extern u16 __msl_digit[];
extern u8 __lower_mapC[];

extern void *DWCi_GsMalloc(u32 size);
extern void DWCi_GsFree(void *p);
extern int ArrayLength(void *array);
extern void *TableNew2(int elemSize, int buckets, int chains, void *hash, void *compare, void *free);
extern void TableFree(void *table);
extern int TableCount(void *table);
extern void TableEnter(void *table, void *elem);
extern void *TableLookup(void *table, void *elem);
extern u32 current_time(void);
extern void msleep(int ms);
extern u32 gsSocketInetAddr(const char *address);

extern int ov00_0221B0D0;
extern char *sbSkippedKeys[2]; // the keys CheckValidKey skips
extern char sStr_SBServerGetStringValueA[];
extern char sFmt_Int_5[];
extern char sStr_server[];
extern char sStr_SbServerC[];
extern char sStr_ping[];
extern char sStr_Empty_13[];
extern const char sFmt_StrInt_2[];
extern char sFmt_BackslashStr[];
extern char *qr2_registered_key_list[]; // query key names

// The query engine part of this module: drops queries that got no answer in 2.5 seconds
void TimeoutOldQueries(SBQueryEngine *engine) {
    u32 now = current_time();
    SBServer *server;
    while ((server = engine->querying.first) != NULL) {
        if (now <= server->updateTime + 2500) {
            return;
        }
        server->flags |= 0x10;
        engine->querying.first->updateTime = 2500;
        engine->querying.first->flags &= 0xD3;
        engine->callback(engine, qe_updatefailed, engine->querying.first, engine->param);
        FIFOGetFirst(&engine->querying);
    }
}

void QueueNextQueries(SBQueryEngine *engine) {
    while (engine->querying.count < engine->maxUpdates && engine->pending.count > 0) {
        QEStartQuery(engine, FIFOGetFirst(&engine->pending));
    }
}

void SBQueryEngineThink(SBQueryEngine *engine) {
    if (!engine->querying.count) {
        return;
    }
    ProcessIncomingReplies(engine, 0);
    TimeoutOldQueries(engine);
    if (engine->pending.count > 0) {
        QueueNextQueries(engine);
    }
    if (!engine->querying.count) {
        engine->callback(engine, qe_engineidle, NULL, engine->param);
    }
}

void SBQueryEngineAddQueryKey(SBQueryEngine *engine, int key) {
    int count = engine->numKeys;
    if (count >= 20) {
        return;
    }
    engine->numKeys = count + 1;
    engine->keys[count] = key;
}

void SBEngineRemoveServerFromFIFOs(SBQueryEngine *engine, SBServer *server) {
    if (FIFORemove(&engine->querying, server)) {
        return;
    }
    FIFORemove(&engine->pending, server);
}

// The shared strings table (see SBRefStr): hashed and compared case-insensitively
u32 RefStringHash(const void *elem, u32 buckets) {
    return StringHash(*(char *const *)elem, buckets);
}

int RefStringCompare(const void *a, const void *b) {
    return strnicmp(*(char *const *)a, *(char *const *)b);
}

void RefStringFree(void *elem) {
    DWCi_GsFree(*(char **)elem);
}

void *SBRefStrHash(SBServerList *list) {
    if (!sbServerGlobals.refStrings) {
        sbServerGlobals.refStrings = TableNew2(8, 100, 2, RefStringHash, RefStringCompare, RefStringFree);
    }
    return sbServerGlobals.refStrings;
}

void SBRefStrHashCleanup(SBServerList *list) {
    if (!sbServerGlobals.refStrings) {
        return;
    }
    if (TableCount(sbServerGlobals.refStrings)) {
        return;
    }
    TableFree(sbServerGlobals.refStrings);
    sbServerGlobals.refStrings = NULL;
}

void SBServerFree(SBServer **server) {
    SBServer *s = *server;
    TableFree(s->keyValues);
    s->keyValues = NULL;
    DWCi_GsFree(s);
}

void SBServerAddKeyValue(SBServer *server, const char *key, const char *value) {
    char *pair[2];
    pair[0] = SBRefStr(NULL, key);
    pair[1] = SBRefStr(NULL, value);
    TableEnter(server->keyValues, pair);
}

void SBServerAddIntKeyValue(SBServer *server, const char *key, int value) {
    char buffer[20];
    sprintf(buffer, sFmt_Int_5, value);
    SBServerAddKeyValue(server, key, buffer);
}

char *SBServerGetStringValueA(SBServer *server, const char *key, char *fallback) {
    struct {
        const char *key;
        u32 unused;
    } elem;

    char **pair;
    if (!server) {
        __msl_assertion_failed(sStr_server, sStr_SbServerC, sStr_SBServerGetStringValueA, 151);
    }
    if (!server) {
        return NULL;
    }
    elem.key = key;
    pair = TableLookup(server->keyValues, &elem.key);
    if (pair) {
        fallback = pair[1];
    }
    return fallback;
}

int SBServerGetIntValueA(SBServer *server, const char *key, int fallback) {
    char *value;
    int ch, digit;
    if (!strcmp(key, sStr_ping)) {
        return SBServerGetPing(server);
    }
    value = SBServerGetStringValueA(server, key, NULL);
    if (value) {
        ch = (u8)*value;
        if (ch < 0 || ch >= 128) {
            digit = 0;
        } else {
            digit = __msl_digit[ch] & 8;
        }
        if (digit) {
            goto success;
        }
    }
    return fallback;
success:
    return atol(value);
}

double SBServerGetFloatValueA(SBServer *server, const char *key, double fallback) {
    char *value = SBServerGetStringValueA(server, key, NULL);
    if (value) {
        fallback = atod(value);
    }
    return fallback;
}

u32 SBServerGetPublicInetAddress(SBServer *server) {
    return server->publicIp;
}

u16 SBServerGetPublicQueryPort(SBServer *server) {
    u16 port = server->publicPort;
    return ((port >> 8) & 255) | ((port << 8) & 0xFF00);
}

int SBServerGetPublicQueryPortNBO(SBServer *server) {
    return server->publicPort;
}

int SBServerHasPrivateAddress(SBServer *server) {
    return (server->flags & PRIVATE_IP_FLAG) == PRIVATE_IP_FLAG;
}

u32 SBServerGetPrivateInetAddress(SBServer *server) {
    return server->privateIp;
}

u16 SBServerGetPrivateQueryPort(SBServer *server) {
    u16 port = server->privatePort;
    return ((port >> 8) & 255) | ((port << 8) & 0xFF00);
}

void SBServerSetNext(SBServer *server, SBServer *next) {
    server->next = next;
}

SBServer *SBServerGetNext(SBServer *server) {
    return server->next;
}

typedef struct SBSkippedKeys {
    char *keys[2];
} SBSkippedKeys;

int CheckValidKey(const char *key) {
    SBSkippedKeys skipped = *(SBSkippedKeys *)&sbSkippedKeys;
    u32 i;
    for (i = 0; i < 2; i++) {
        if (strcmp(key, skipped.keys[i]) == 0) {
            return 0;
        }
    }
    return 1;
}

// strtok-like: splits at delim, keeps its position in sbServerGlobals.tokenNext
char *mytok(char *input, int delim) {
    int ch;
    char *p, *start;
    if (input) {
        sbServerGlobals.tokenNext = input;
    }
    start = sbServerGlobals.tokenNext;
    p = start;
    while ((ch = *p) != 0 && ch != delim) {
        p++;
        sbServerGlobals.tokenNext = p;
    }
    if (p == start) {
        start = NULL;
    }
    if (ch == 0) {
        return start;
    }
    {
        char *next = sbServerGlobals.tokenNext;
        *p = 0;
        sbServerGlobals.tokenNext = next + 1;
    }
    return start;
}

// Adds the "\key\value" pairs of a legacy query reply
void SBServerParseKeyVals(SBServer *server, char *str) {
    char *key = mytok(str + 1, '\\');
    if (!key) {
        return;
    }
    do {
        char *value = mytok(NULL, '\\');
        if (!value) {
            value = sStr_Empty_13;
        }
        if (CheckValidKey(key)) {
            SBServerAddKeyValue(server, key, value);
        }
        key = mytok(NULL, '\\');
    } while (key);
}

static inline u32 Swap16(s32 value) {
    return ((value >> 8) & 255) | ((value << 8) & 0xFF00);
}

static inline int ToLower(int c) {
    if (c < 0 || c >= 128) {
        return c;
    }
    return __lower_mapC[c];
}

// Adds the keys of a full query reply: key / value pairs, then two tables (players, teams) whose
// values are stored as "<key><row>"
void SBServerParseQR2FullKeysSingle(SBServer *server, const char *data, int len) {
    char buffer[128];

    union {
        volatile u16 word;
        volatile u8 bytes[2];
    } count;

    const char *names;
    int table;
    while (*data) {
        const char *name;
        int size = NTSLengthSB(data, len);
        if (size < 0) {
            return;
        }
        name = data;
        len -= size;
        data += size;
        size = NTSLengthSB(data, len);
        if (size < 0) {
            return;
        }
        {
            const char *value = data;
            data += size;
            len -= size;
            SBServerAddKeyValue(server, name, value);
        }
    }
    data++;
    len--;
    for (table = 0; table < 2; table++) {
        int fields, row;
        if (len < 2) {
            return;
        }
        memcpy((void *)&count, data, 2);
        data += 2;
        names = data;
        len -= 2;
        count.word = Swap16(count.word);
        fields = 0;
        while (*data) {
            int size = NTSLengthSB(data, len);
            if (size < 0 || size > 100) {
                return;
            }
            data += size;
            fields++;
            len -= size;
        }
        data++;
        len--;
        for (row = 0; row < count.word; row++) {
            int field;
            const char *name;
            for (name = names, field = 0; field < fields; field++) {
                int size = NTSLengthSB(data, len);
                if (size < 0) {
                    return;
                }
                sprintf(buffer, sFmt_StrInt_2, name, row);
                SBServerAddKeyValue(server, buffer, data);
                data += size;
                len -= size;
                name += strlen(name) + 1;
            }
        }
    }
}

u32 StringHash(const char *str, u32 mod) {
    u32 hash = 0;
    while (*str) {
        hash = hash * 0x9CCF9319 + ToLower(*str);
        str++;
    }
    return hash % mod;
}

void KeyValFree(char **pair) {
    SBReleaseStr(NULL, pair[0]);
    SBReleaseStr(NULL, pair[1]);
}

u32 KeyValHashKey(char **pair, u32 mod) {
    return StringHash(*pair, mod);
}

int KeyValCompareKey(char **a, char **b) {
    return strnicmp(*a, *b);
}

u32 SBServerGetPing(SBServer *server) {
    return server->updateTime;
}

SBServer *SBAllocServer(SBServerList *list, u32 ip, u16 port) {
    SBServer *server = DWCi_GsMalloc(sizeof(SBServer));
    if (!server) {
        return NULL;
    }
    server->keyValues = TableNew2(8, 8, 4, KeyValHashKey, KeyValCompareKey, KeyValFree);
    if (!server->keyValues) {
        DWCi_GsFree(server);
        return NULL;
    }
    server->state = 0;
    server->flags = 0;
    server->next = NULL;
    server->updateTime = 0;
    server->icmpIp = 0;
    server->publicIp = ip;
    server->publicPort = port;
    server->privateIp = 0;
    server->privatePort = 0;
    return server;
}

void SBServerSetFlags(SBServer *server, u8 flags) {
    server->flags = flags;
}

void SBServerSetPrivateAddr(SBServer *server, u32 ip, u16 port) {
    server->privateIp = ip;
    server->privatePort = port;
}

void SBServerSetICMPIP(SBServer *server, u32 ip) {
    server->icmpIp = ip;
}

void SBServerSetState(SBServer *server, u8 state) {
    server->state = state;
}

u8 SBServerGetState(SBServer *server) {
    return server->state;
}

int SBIsNullServer(SBServer *server) {
    return server == sbServerGlobals.nullServer;
}

// Server list callback of the browser
void ListCallback(SBServerList *list, int reason, SBServer *server, ServerBrowser *browser) {
    switch (reason) {
    case slc_serveradded:
        browser->callback(browser, sbc_serveradded, server, browser->param);
        if ((server->state & (STATE_BASICKEYS | STATE_FULLKEYS)) && (server->state & STATE_VALIDPING)) {
            break;
        }
        if ((server->state & (STATE_PENDINGBASICQUERY | STATE_PENDINGFULLQUERY | STATE_PENDINGICMPQUERY)) == 0 && browser->dontUpdate == 0) {
            int mode;
            if (server->flags & UNSOLICITED_UDP_FLAG) {
                if (browser->list.state == SB_LIST_LAN || browser->engine.numKeys == 0) {
                    mode = QTYPE_FULL;
                } else {
                    mode = QTYPE_BASIC;
                }
            } else {
                mode = QTYPE_ICMP;
            }
            SBQueryEngineUpdateServer(&browser->engine, server, 0, mode);
        }
        break;
    case slc_serverupdated:
        if ((server->state & (STATE_BASICKEYS | STATE_FULLKEYS | STATE_VALIDPING)) == 0) {
            browser->callback(browser, sbc_serverupdatefailed, server, browser->param);
        } else {
            browser->callback(browser, sbc_serverupdated, server, browser->param);
        }
        break;
    case slc_serverdeleted:
        if (server->state & (STATE_PENDINGBASICQUERY | STATE_PENDINGFULLQUERY | STATE_PENDINGICMPQUERY)) {
            SBEngineRemoveServerFromFIFOs(&browser->engine, server);
        }
        browser->callback(browser, sbc_serverdeleted, server, browser->param);
        break;
    case slc_initiallistcomplete:
        if (browser->disconnectOnComplete) {
            SBServerListDisconnect(list);
        }
        if (ArrayLength(list->servers) != 0 && browser->engine.querying.count != 0) {
            break;
        }
        browser->callback(browser, sbc_updatecomplete, NULL, browser->param);
        break;
    case slc_queryerror:
        browser->callback(browser, sbc_queryerror, NULL, browser->param);
        break;
    case slc_publicipdetermined:
        SBQueryEngineSetPublicIP(&browser->engine, browser->list.publicIp);
        break;
    }
    if (server && server->publicIp == browser->triggerIp && server->publicPort == browser->triggerPort) {
        browser->triggerIp = 0;
    }
}

// Query engine callback of the browser
void EngineCallback(SBQueryEngine *engine, int reason, SBServer *server, ServerBrowser *browser) {
    switch (reason) {
    case qe_updatefailed:
        browser->callback(browser, sbc_serverupdatefailed, server, browser->param);
        break;
    case qe_updatesuccess:
        browser->callback(browser, sbc_serverupdated, server, browser->param);
        break;
    case qe_engineidle:
        browser->callback(browser, sbc_updatecomplete, server, browser->param);
        break;
    }
    if (server && server->publicIp == browser->triggerIp && server->publicPort == browser->triggerPort) {
        browser->triggerIp = 0;
    }
}

ServerBrowser *ServerBrowserNewA(const char *targetGameName, const char *gameName, const char *secretKey, int queryFromVersion, int maxUpdates, int queryVersion, int force, ServerBrowserCallback callback, void *param) {
    ServerBrowser *browser;
    if (!force && ov00_0221B0D0 != 1) {
        return NULL;
    }
    browser = DWCi_GsMalloc(sizeof(ServerBrowser));
    if (!browser) {
        return NULL;
    }
    browser->callback = callback;
    browser->param = param;
    browser->dontUpdate = 0;
    SBServerListInit(&browser->list, targetGameName, gameName, secretKey, queryFromVersion, force, (SBListCallback)ListCallback, browser);
    SBQueryEngineInit(&browser->engine, maxUpdates, queryVersion, force, (SBEngineCallback)EngineCallback, browser);
    return browser;
}

void ServerBrowserFree(ServerBrowser *browser) {
    SBServerListCleanup(&browser->list);
    SBEngineCleanup(&browser->engine);
    DWCi_GsFree(browser);
}

// Requests the list with the given query keys; waits for it unless async
int ServerBrowserBeginUpdate2(ServerBrowser *browser, int async, int disconnectOnComplete, u8 *keys, int numKeys, const char *filter, u32 options, int maxServers) {
    struct {
        char data[256];
    } buffer = { 0 };

    int len = 0, i;
    int result;
    browser->disconnectOnComplete = disconnectOnComplete;
    browser->engine.numKeys = 0;
    for (i = 0; i < numKeys; i++) {
        char *name = qr2_registered_key_list[keys[i]];
        if (len + (int)strlen(name) + 1 >= 256) {
            break;
        }
        len += sprintf(buffer.data + len, sFmt_BackslashStr, name);
        SBQueryEngineAddQueryKey(&browser->engine, keys[i]);
    }
    result = SBServerListConnectAndQuery(&browser->list, buffer.data, filter, options, maxServers);
    if (result) {
        return result;
    }
    if (async) {
        return result;
    }
    while (browser->list.state == SB_LIST_LIST || (browser->engine.querying.count > 0 && !result)) {
        msleep(10);
        result = ServerBrowserThink(browser);
    }
    return result;
}

int ServerBrowserLimitUpdateA(ServerBrowser *browser, int async, int disconnectOnComplete, u8 *keys, int numKeys, const char *filter, int maxServers) {
    return ServerBrowserBeginUpdate2(browser, async, disconnectOnComplete, keys, numKeys, filter, 128, maxServers);
}

int ServerBrowserSendMessageToServerA(ServerBrowser *browser, const char *address, int port, void *data, int len) {
    u32 ip = gsSocketInetAddr(address);
    return SBSendMessageToServer(&browser->list, ip, (u16)(((port >> 8) & 255) | ((port << 8) & 0xFF00)), data, len);
}

int ServerBrowserSendNatNegotiateCookieToServerA(ServerBrowser *browser, const char *address, int port, u32 value) {
    u32 ip = gsSocketInetAddr(address);
    return SBSendNatNegotiateCookieToServer(&browser->list, ip, (u16)(((port >> 8) & 255) | ((port << 8) & 0xFF00)), value);
}

void ServerBrowserRemoveServer(ServerBrowser *browser, SBServer *server) {
    int i = SBServerListFindServer(&browser->list, server);
    if (i == -1) {
        return;
    }
    SBServerListRemoveAt(&browser->list, i);
}

int ServerBrowserThink(ServerBrowser *browser) {
    SBQueryEngineThink(&browser->engine);
    return SBListThink(&browser->list);
}

void ServerBrowserHalt(ServerBrowser *browser) {
    SBServerListDisconnect(&browser->list);
    SBEngineHaltUpdates(&browser->engine);
}

void ServerBrowserClear(ServerBrowser *browser) {
    ServerBrowserHalt(browser);
    SBServerListClear(&browser->list);
}

int ServerBrowserState(ServerBrowser *browser) {
    int state;
    if (browser->engine.querying.count > 0) {
        return sb_querying;
    }
    state = browser->list.state;
    if (state == SB_LIST_LIST || state == SB_LIST_LAN) {
        return sb_listxfer;
    }
    return state == SB_LIST_DISCONNECTED ? 0 : 3;
}

SBServer *ServerBrowserGetServer(ServerBrowser *browser, int index) {
    return SBServerListNth(&browser->list, index);
}

int ServerBrowserCount(ServerBrowser *browser) {
    return SBServerListCount(&browser->list);
}

void ServerBrowserSortA(ServerBrowser *browser, int ascending, const char *key, u32 type) {
    SBServerListSort(&browser->list, ascending, key, type);
}

u32 ServerBrowserGetMyPublicIP(ServerBrowser *browser) {
    return browser->list.publicIp;
}
