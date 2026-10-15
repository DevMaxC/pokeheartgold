#pragma force_active on
#include <stdarg.h>
#include <string.h>

#include "global.h"

#include "dwc/gp_internal.h"
#include "dwc/persist_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

// The last two presence connection error setters, the named value buckets ("gbucket.c"), and the
// persistent data client: XOR-scrambled "\final\"-terminated replies to authentication and get / set
// data requests, dispatched to the request callbacks; game and per player / per team values.

extern const char sStr_DoFind[]; // "DoFind"
extern const char sStr_BucketNew[]; // "BucketNew"
extern const char sStr_BucketConcat[]; // "BucketConcat"
extern const char sStr_set[]; // "set"
extern const char sStr_GbucketC[]; // "gbucket.c"
extern const char sStr_PbucketTypeEqBtString[]; // "pbucket->type == bt_string"
extern char sStr_X0AmeSpy3D[];       // reply scrambling key
extern char sStr_X00rojectAphex[];       // error message scrambling key
extern char sStr_Empty_9[];       // ""
extern char sStr_Backslash[];       // "\\"
extern char sStr_pauthr[];       // "pauthr"
extern char sStr_lid[];       // "lid"
extern char sStr_errmsg[];       // "errmsg"
extern char sStr_getpidr[];       // "getpidr"
extern char sStr_getpdr[];       // "getpdr"
extern char sStr_pid[];       // "pid"
extern char sStr_mod[];       // "mod"
extern char sStr_length[];       // "length"
extern char sKey_data[];       // "\\data\\"
extern char sStr_setpdr[];       // "setpdr"
extern char sKey_pauthr[];       // "\\pauthr\\"
extern char sKey_getpidr[];       // "\\getpidr\\"
extern char sKey_getpdr[];       // "\\getpdr\\"
extern char sKey_setpdr[];       // "\\setpdr\\"
extern char sFmt_StrUnderscoreT_Int[];       // "%s_t%d"
extern char sFmt_StrUnderscoreInt[];       // "%s_%d"

typedef struct Buf256 {
    char s[0x100];
} Buf256;

typedef struct Buf16 {
    char s[0x10];
} Buf16;

extern Buf16 persistScrambledErrorMessage;  // scrambled error message
extern Buf256 ov00_022162E7; // "\\"
extern PersistSocket ov00_022198D8;
extern u8 ov00_0221B1D8[24];
extern BucketGlobals ov00_0221B1F0;
extern PersistWork gPersistWork;

extern int sprintf(char *, const char *, ...);
extern int strncmp(const char *, const char *, size_t);
extern long atol(const char *);
extern void __msl_assertion_failed(const char *, const char *, const char *, int);
extern void *DWCi_GsMalloc(u32 size);
extern void *DWCi_GsRealloc(void *p, u32 size);
extern void DWCi_GsFree(void *p);
extern void ArrayFree(void *arr);
extern void *ArrayNth(void *arr, int idx);
extern void ArrayDeleteAt(void *arr, int idx);
extern void TableEnter(void *table, void *elem);
extern void *TableLookup(void *table, void *key);
extern char *goastrdup(const char *s);
extern int CanReceiveOnSocket(int s);
extern void gsSocketClose(int s);
extern void gsSocketShutdown(int s, int how);
extern int gsSocketRecv(int s, char *buf, int len, int flags);
extern int ArrayLength(void *arr);

void gpiSetError(GpConnection **connection, int code, const char *message) {
    GpConnection *iconnection = *connection;
    strzcpy(iconnection->errorString, message, 0x100);
    iconnection->errorCode = code;
}

void gpiSetErrorString(GpConnection **connection, const char *message) {
    strzcpy((*connection)->errorString, message, 0x100);
}

void *BucketNew(BucketSet *set, const char *name, int type, void *value) {
    Bucket bucket;
    if (!set) {
        set = ov00_0221B1F0.defaultSet;
    }
    if (!set) {
        __msl_assertion_failed(sStr_set, sStr_GbucketC, sStr_BucketNew, 0x78);
    }
    bucket.name = goastrdup(name);
    bucket.type = type;
    bucket.val.i = 0;
    bucket.count = 1;
    DoSet(&bucket, value);
    TableEnter(set->table, &bucket);
    return DoGet(DoFind(set, name));
}

void *BucketSetValue(BucketSet *set, const char *name, void *value) {
    Bucket *bucket = DoFind(set, name);
    if (!bucket) {
        return 0;
    }
    bucket->count = 0;
    return DoSet(bucket, value);
}

void *BucketAdd(BucketSet *set, const char *name, void *value) {
    Bucket *bucket = DoFind(set, name);
    if (!bucket) {
        return 0;
    }
    if (bucket->type == BUCKET_INT) {
        return DoSet(bucket, bint(*(int *)value + *(int *)DoGet(bucket)));
    }
    if (bucket->type == BUCKET_DOUBLE) {
        return DoSet(bucket, bdouble(*(double *)value + *(double *)DoGet(bucket)));
    }
    return BucketConcat(set, name, value);
}

void *BucketSub(BucketSet *set, const char *name, void *value) {
    Bucket *bucket = DoFind(set, name);
    if (!bucket) {
        return 0;
    }
    if (bucket->type == BUCKET_INT) {
        return DoSet(bucket, bint(*(int *)DoGet(bucket) - *(int *)value));
    }
    if (bucket->type == BUCKET_DOUBLE) {
        return DoSet(bucket, bdouble(*(double *)DoGet(bucket) - *(double *)value));
    }
    return DoGet(bucket);
}

void *BucketMult(BucketSet *set, const char *name, void *value) {
    Bucket *bucket = DoFind(set, name);
    if (!bucket) {
        return 0;
    }
    if (bucket->type == BUCKET_INT) {
        return DoSet(bucket, bint(*(int *)value * *(int *)DoGet(bucket)));
    }
    if (bucket->type == BUCKET_DOUBLE) {
        return DoSet(bucket, bdouble(*(double *)value * *(double *)DoGet(bucket)));
    }
    return DoGet(bucket);
}

void *BucketDiv(BucketSet *set, const char *name, void *value) {
    Bucket *bucket = DoFind(set, name);
    if (!bucket) {
        return 0;
    }
    if (bucket->type == BUCKET_INT) {
        return DoSet(bucket, bint(*(int *)DoGet(bucket) / *(int *)value));
    }
    if (bucket->type == BUCKET_DOUBLE) {
        return DoSet(bucket, bdouble(*(double *)DoGet(bucket) / *(double *)value));
    }
    return DoGet(bucket);
}

void *BucketConcat(BucketSet *set, const char *name, void *value) {
    Bucket *bucket = DoFind(set, name);
    char *old;
    char *buf;
    if (!bucket) {
        return 0;
    }
    if (bucket->type != BUCKET_STRING) {
        __msl_assertion_failed(sStr_PbucketTypeEqBtString, sStr_GbucketC, sStr_BucketConcat, 0xd1);
    }
    old = DoGet(bucket);
    buf = DWCi_GsMalloc(strlen(old) + strlen(value) + 1);
    strcpy(buf, old);
    strcat(buf, value);
    DoSet(bucket, buf);
    DWCi_GsFree(buf);
    return DoGet(bucket);
}

void *BucketAvg(BucketSet *set, const char *name, void *value) {
    Bucket *bucket = DoFind(set, name);
    int n;
    if (!bucket) {
        return 0;
    }
    if (bucket->type == BUCKET_INT) {
        int *cur = DoGet(bucket);
        n = ++bucket->count;
        return DoSet(bucket, bint((*(int *)value + n * *cur) / n));
    }
    if (bucket->type == BUCKET_DOUBLE) {
        double *cur = DoGet(bucket);
        n = ++bucket->count;
        return DoSet(bucket, bdouble((*(double *)value + n * *cur) / n));
    }
    return DoGet(bucket);
}

int *bint(int value) {
    ov00_0221B1F0.intValue = value;
    return (int *)(ov00_0221B1D8 + 24);
}

double *bdouble(double value) {
    ov00_0221B1F0.doubleValue = value;
    return &ov00_0221B1F0.doubleValue;
}

// Turns the backslashes of s into slashes, so it can't break a "\key\value" string.
char *BucketFixBackslashes(char *s) {
    char *start = s;
    while (*s) {
        if (*s == '\\') {
            *s = '/';
        }
        s++;
    }
    return start;
}

void *DoSet(Bucket *bucket, void *value) {
    if (bucket->type == BUCKET_INT) {
        bucket->val.i = *(int *)value;
    } else if (bucket->type == BUCKET_DOUBLE) {
        bucket->val.d = *(double *)value;
    } else if (bucket->type == BUCKET_STRING) {
        if (bucket->val.s) {
            DWCi_GsFree(bucket->val.s);
        }
        bucket->val.s = value ? BucketFixBackslashes(goastrdup(value)) : 0;
    }
    return DoGet(bucket);
}

void *DoGet(Bucket *bucket) {
    if (!bucket) {
        return 0;
    }
    if (bucket->type == BUCKET_STRING) {
        return bucket->val.s;
    }
    return &bucket->val;
}

Bucket *DoFind(BucketSet *set, const char *name) {
    Bucket key;
    if (!set) {
        set = ov00_0221B1F0.defaultSet;
    }
    if (!set) {
        __msl_assertion_failed(sStr_set, sStr_GbucketC, sStr_DoFind, 0x153);
    }
    key.name = name;
    return TableLookup(set->table, &key);
}

void CloseStatsConnection(void) {
    if (ov00_022198D8.socket != INVALID_SOCKET) {
        gsSocketShutdown(ov00_022198D8.socket, 2);
        gsSocketClose(ov00_022198D8.socket);
    }
    ov00_022198D8.socket = INVALID_SOCKET;
    FailAllRequests();
    if (gPersistWork.recvBuf) {
        DWCi_GsFree(gPersistWork.recvBuf);
        gPersistWork.recvBuf = 0;
        gPersistWork.recvCap = 0;
        gPersistWork.recvLen = 0;
    }
}

int IsStatsConnected(void) {
    return ov00_022198D8.socket != INVALID_SOCKET;
}

int PersistThink(void) {
    int n;
    int used;
    if (ov00_022198D8.socket == INVALID_SOCKET) {
        return 0;
    }
    if (gPersistWork.state != 5) {
        return 0;
    }
    while (SocketReadable(ov00_022198D8.socket)) {
        if (gPersistWork.recvCap - gPersistWork.recvLen < 0x80) {
            if (gPersistWork.recvCap < 0x100) {
                gPersistWork.recvCap = 0x100;
            } else {
                gPersistWork.recvCap = gPersistWork.recvCap * 2;
            }
            gPersistWork.recvBuf = DWCi_GsRealloc(gPersistWork.recvBuf, gPersistWork.recvCap + 1);
            if (!gPersistWork.recvBuf) {
                return 0;
            }
        }
        n = gsSocketRecv(ov00_022198D8.socket, gPersistWork.recvBuf + gPersistWork.recvLen, gPersistWork.recvCap - gPersistWork.recvLen, 0);
        if (n <= 0) {
            CloseStatsConnection();
            return 0;
        }
        gPersistWork.recvLen += n;
        gPersistWork.recvBuf[gPersistWork.recvLen] = 0;
        used = ProcessInBuffer(gPersistWork.recvBuf, gPersistWork.recvLen);
        if (used == gPersistWork.recvLen) {
            gPersistWork.recvLen = 0;
        } else {
            memmove(gPersistWork.recvBuf, gPersistWork.recvBuf + used, gPersistWork.recvLen - used);
            gPersistWork.recvLen -= used;
        }
    }
    if (ov00_022198D8.socket == INVALID_SOCKET) {
        return 0;
    }
    return 1;
}

// XOR (un)scrambling with the current key.
void xcode_buf(char *buf, int len) {
    int i;
    const char *k;
    k = ov00_022198D8.key;
    for (i = 0; i < len; i++) {
        buf[i] ^= *k;
        k++;
        if (*k == 0) {
            k = ov00_022198D8.key;
        }
    }
}

// Value of "\key\" in str, in one of two alternating buffers, or NULL.
char *value_for_key(const char *str, const char *key) {
    Buf256 search = ov00_022162E7;
    const char *p;
    char *ret;
    char *dst;
    gPersistWork.valueIndex ^= 1;
    strcat(search.s, key);
    strcat(search.s, sStr_Backslash);
    p = strstr(str, search.s);
    if (!p) {
        return 0;
    }
    p += strlen(search.s);
    ret = gPersistWork.values[gPersistWork.valueIndex];
    dst = ret;
    while (*p != 0 && *p != '\\') {
        *dst++ = *p++;
    }
    *dst = 0;
    return ret;
}

char *value_for_key_safe(const char *str, const char *key) {
    char *r = value_for_key(str, key);
    if (!r) {
        r = sStr_Empty_9;
    }
    return r;
}

int SocketReadable(int socket) {
    return CanReceiveOnSocket(socket);
}

// Finds the "\final\" terminator.
char *FindFinal(char *buf, int len) {
    char *p;
    for (p = buf; p - buf < len - 6; p++) {
        if (p[0] == '\\' && p[1] == 'f' && p[2] == 'i' && p[3] == 'n' && p[4] == 'a' && p[5] == 'l' && p[6] == '\\') {
            return p;
        }
    }
    return 0;
}

int FindRequest(int type, int localId, int profileId) {
    int i;
    if (!gPersistWork.requests) {
        return -1;
    }
    for (i = 0; i < ArrayLength(gPersistWork.requests); i++) {
        PersistRequest *request = ArrayNth(gPersistWork.requests, i);
        if (request->type == type && request->localId == localId && request->profileId == profileId) {
            return i;
        }
    }
    return -1;
}

// "\pauthr\" reply
void ProcessPlayerAuth(char *buf, int len) {
    int profileId;
    int localId;
    int index;
    char *errmsg;
    profileId = atol(value_for_key_safe(buf, sStr_pauthr));
    localId = atol(value_for_key_safe(buf, sStr_lid));
    errmsg = value_for_key_safe(buf, sStr_errmsg);
    index = FindRequest(0, localId, 0);
    if (index == -1) {
        return;
    }
    ((PersistRequest *)ArrayNth(gPersistWork.requests, index))->profileId = profileId;
    CallReqCallback(index, profileId > 0, 0, errmsg, 0);
}

// "\getpidr\" reply
void ProcessGetPid(char *buf, int len) {
    int profileId = atol(value_for_key_safe(buf, sStr_getpidr));
    int localId = atol(value_for_key_safe(buf, sStr_lid));
    int index = FindRequest(3, localId, 0);
    PersistRequest *request;
    if (index == -1) {
        return;
    }
    request = ArrayNth(gPersistWork.requests, index);
    request->profileId = profileId;
    CallReqCallback(index, profileId > 0, 0, 0, 0);
}

// "\getpdr\" reply
void ProcessGetData(char *buf, int len) {
    int index;
    int length;
    int success;
    int modified;
    int profileId;
    int localId;
    char *p;
    char *data;
    success = atol(value_for_key_safe(buf, sStr_getpdr));
    localId = atol(value_for_key_safe(buf, sStr_lid));
    profileId = atol(value_for_key_safe(buf, sStr_pid));
    modified = atol(value_for_key_safe(buf, sStr_mod));
    index = FindRequest(1, localId, profileId);
    if (index != -1) {
        length = atol(value_for_key_safe(buf, sStr_length));
        p = strstr(buf, sKey_data);
        if (!p) {
            data = sStr_Empty_9;
            length = 0;
        } else {
            data = p + 6;
        }
        CallReqCallback(index, success, modified, data, length);
    }
}

// "\setpdr\" reply
void ProcessSetData(char *buf, int len) {
    int success = atol(value_for_key_safe(buf, sStr_setpdr));
    int profileId = atol(value_for_key_safe(buf, sStr_pid));
    int localId = atol(value_for_key_safe(buf, sStr_lid));
    int modified = atol(value_for_key_safe(buf, sStr_mod));
    int index = FindRequest(2, localId, profileId);
    if (index == -1) {
        return;
    }
    CallReqCallback(index, success, modified, 0, 0);
}

void ProcessStatement(char *buf, int len) {
    buf[len] = 0;
    if (strncmp(buf, sKey_pauthr, 8) == 0) {
        ProcessPlayerAuth(buf, len);
    } else if (strncmp(buf, sKey_getpidr, 9) == 0) {
        ProcessGetPid(buf, len);
    } else if (strncmp(buf, sKey_getpidr, 9) == 0) {
        ProcessGetPid(buf, len);
    } else if (strncmp(buf, sKey_getpdr, 8) == 0) {
        ProcessGetData(buf, len);
    } else if (strncmp(buf, sKey_setpdr, 8) == 0) {
        ProcessSetData(buf, len);
    }
}

// Handles every complete reply in buf; returns the number of bytes used.
int ProcessInBuffer(char *buf, int len) {
    char *p;
    int orig;
    int n;
    orig = len;
    p = FindFinal(buf, len);
    while (len > 0 && p) {
        n = p - buf;
        ov00_022198D8.key = sStr_X0AmeSpy3D;
        xcode_buf(buf, n);
        ProcessStatement(buf, n);
        len -= n + 7;
        buf = p + 7;
        if (len > 0) {
            p = FindFinal(buf, len);
        }
    }
    return orig - len;
}

// Calls the callback of request index and removes the request.
void CallReqCallback(int index, int success, int modified, char *data, int len) {
    PersistRequest *request;
    if (index < 0) {
        return;
    }
    if (index >= ArrayLength(gPersistWork.requests)) {
        return;
    }
    request = ArrayNth(gPersistWork.requests, index);
    if (request->callback) {
        switch (request->type) {
        case 0:
            ((void (*)(int, int, int, char *, int))request->callback)(request->localId, request->profileId, success, data, request->param);
            break;
        case 1:
            ((void (*)(int, int, int, int, int, int, char *, int, int))request->callback)(request->localId, request->profileId, request->persistType, request->index, success, modified, data, len, request->param);
            break;
        case 2:
            ((void (*)(int, int, int, int, int, int, int))request->callback)(request->localId, request->profileId, request->persistType, request->index, success, modified, request->param);
            break;
        case 3:
            ((void (*)(int, int, int, int))request->callback)(request->localId, request->profileId, success, request->param);
            break;
        }
    }
    ArrayDeleteAt(gPersistWork.requests, index);
}

// Fails every pending request with the "disconnected" message and frees the list.
void FailAllRequests(void) {
    int i;
    Buf16 message;
    Buf16 scrambled;
    if (!gPersistWork.requests) {
        return;
    }
    i = ArrayLength(gPersistWork.requests) - 1;
    if (i >= 0) {
        scrambled = persistScrambledErrorMessage;
        do {
            message = scrambled;
            ov00_022198D8.key = sStr_X00rojectAphex;
            xcode_buf(message.s, 15);
            CallReqCallback(i, 0, 0, message.s, 0);
        } while (--i >= 0);
    }
    ArrayFree(gPersistWork.requests);
    gPersistWork.requests = 0;
}

int GetTeamNumber(StatsGame *game, int index) {
    if (!game) {
        game = gPersistWork.currentGame;
    }
    if (!game) {
        return index;
    }
    return *(int *)ArrayNth(game->teams, index);
}

int GetPlayerNumber(StatsGame *game, int index) {
    if (!game) {
        game = gPersistWork.currentGame;
    }
    if (!game) {
        return index;
    }
    return *(int *)ArrayNth(game->players, index);
}

int BucketIntOp(StatsGame *game, const char *name, BucketGetter get, int value, ...) {
    void *r;
    if (!game) {
        game = gPersistWork.currentGame;
    }
    if (!game) {
        r = &value;
    } else {
        r = get(game->buckets, name, &value);
        if (!r) {
            r = BucketNew(game->buckets, name, BUCKET_INT, &value);
        }
    }
    return *(int *)r;
}

double BucketDoubleOp(StatsGame *game, const char *name, BucketGetter get, double value, ...) {
    void *r;
    if (!game) {
        game = gPersistWork.currentGame;
    }
    if (!game) {
        r = &value;
    } else {
        r = get(game->buckets, name, &value);
        if (!r) {
            r = BucketNew(game->buckets, name, BUCKET_DOUBLE, &value);
        }
    }
    return *(double *)r;
}

char *BucketStringOp(StatsGame *game, const char *name, BucketStringGetter get, char *value, int unused) {
    char *r;
    if (!game) {
        game = gPersistWork.currentGame;
    }
    if (!game) {
        return value;
    }
    r = get(game->buckets, name, value);
    if (r) {
        return r;
    }
    return BucketNew(game->buckets, name, BUCKET_STRING, value);
}

int TeamBucketIntOp(StatsGame *game, const char *name, BucketGetter get, int value, int index) {
    char buf[0x40];
    sprintf(buf, sFmt_StrUnderscoreT_Int, name, GetTeamNumber(game, index));
    return BucketIntOp(game, buf, get, value, index);
}

double TeamBucketDoubleOp(StatsGame *game, const char *name, BucketGetter get, double value, int index) {
    char buf[0x40];
    sprintf(buf, sFmt_StrUnderscoreT_Int, name, GetTeamNumber(game, index));
    return BucketDoubleOp(game, buf, get, value, index);
}

char *TeamBucketStringOp(StatsGame *game, const char *name, BucketStringGetter get, char *value, int index) {
    char buf[0x40];
    sprintf(buf, sFmt_StrUnderscoreT_Int, name, GetTeamNumber(game, index));
    return BucketStringOp(game, buf, get, value, index);
}

int PlayerBucketIntOp(StatsGame *game, const char *name, BucketGetter get, int value, int index) {
    char buf[0x40];
    sprintf(buf, sFmt_StrUnderscoreInt, name, GetPlayerNumber(game, index));
    return BucketIntOp(game, buf, get, value, index);
}

double PlayerBucketDoubleOp(StatsGame *game, const char *name, BucketGetter get, double value, int index) {
    char buf[0x40];
    sprintf(buf, sFmt_StrUnderscoreInt, name, GetPlayerNumber(game, index));
    return BucketDoubleOp(game, buf, get, value, index);
}

char *PlayerBucketStringOp(StatsGame *game, const char *name, BucketStringGetter get, char *value, int index) {
    char buf[0x40];
    sprintf(buf, sFmt_StrUnderscoreInt, name, GetPlayerNumber(game, index));
    return BucketStringOp(game, buf, get, value, index);
}
