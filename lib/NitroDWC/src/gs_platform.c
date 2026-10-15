#pragma force_active on
#pragma warn_unusedvar off
#include "global.h"

#include "WIFI_stubsmd5_dummy.h"
#include "dgt.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

// OVY_0 platform layer of the GameSpy-style SDK: dynamic arrays ("darray.c"), hash tables ("hashtable.c")
// and "nonport.c" (MD5 strings, memory, ticks, sockets).

typedef void (*ArrayElementFreeFn)(void *);
typedef int (*ArrayCompareFn)(const void *, const void *);

typedef struct DArray {
    int count;
    int capacity;
    int elemSize;
    int growBy;
    ArrayElementFreeFn freeFn;
    void *list;
} DArray;

extern void __msl_assertion_failed(const char *cond, const char *file, const char *func, int line);
extern void *DWCi_GsMalloc(u32 size);
extern void *DWCi_GsRealloc(void *p, u32 size);
extern void DWCi_GsFree(void *p);
extern void *memcpy(void *, const void *, u32);
extern void *memmove(void *, const void *, u32);
extern void qsort(void *, u32, u32, ArrayCompareFn);

extern char sStr_ArrayNth[]; // "ArrayNth"
extern char sStr_ArrayNew[]; // "ArrayNew"
extern char sStr_ArrayFree[]; // "ArrayFree"
extern char sStr_ArrayGrow[]; // "ArrayGrow"
extern char sStr_ArrayAppend[]; // "ArrayAppend"
extern char sStr_ArrayRemoveAt[]; // "ArrayRemoveAt"
extern char sStr_ArrayDeleteAt[]; // "ArrayDeleteAt"
extern char sStr_ArrayInsertAt[]; // "ArrayInsertAt"
extern char sStr_ArrayReplaceAt[]; // "ArrayReplaceAt"
extern char sStr_ArrayInsertSorted[]; // "ArrayInsertSorted"
extern char sStr_ArrayList[]; // "array->list"
extern char sStr_DarrayC[]; // "darray.c"
extern char sStr_array[]; // "array"
extern char sStr_elemSize[]; // "elemSize"
extern char sStr_N_Ge0_AndN_LtArrayCount[]; // "(n >= 0) && (n < array->count)"
extern char sStr_N_Ge0_AndN_LeArrayCount[]; // "(n >= 0) && (n <= array->count)"
extern char sStr_comparator[]; // "comparator"

typedef void (*ArrayMapFn)(void *, void *);
typedef int (*ArrayMapFn2)(void *, void *);
typedef int (*TableHashFn)(const void *, int);

typedef struct HashTable {
    DArray **buckets;
    int nbuckets;
    ArrayElementFreeFn freeFn;
    TableHashFn hashFn;
    ArrayCompareFn cmpFn;
} HashTable;

typedef struct SocPollFd {
    int fd;
    s16 events;
    s16 revents;
} SocPollFd;

typedef struct DGTHash1Context Md5Ctx;

extern char sStr_ArrayMap[]; // "ArrayMap"
extern char sStr_ArrayMapBackwards[]; // "ArrayMapBackwards"
extern char sStr_ArrayMapBackwards2[]; // "ArrayMapBackwards2"
extern char sStr_fn[]; // "fn"
extern char sStr_TableMap[]; // "TableMap"
extern char sStr_TableNew2[]; // "TableNew2"
extern char sStr_TableFree[]; // "TableFree"
extern char sStr_TableEnter[]; // "TableEnter"
extern char sStr_TableCount[]; // "TableCount"
extern char sStr_TableRemove[]; // "TableRemove"
extern char sStr_TableLookup[]; // "TableLookup"
extern char sStr_TableMapSafe[]; // "TableMapSafe"
extern char sStr_TableMapSafe2[]; // "TableMapSafe2"
extern char sStr_hashFn[]; // "hashFn"
extern char sStr_HashtableC[]; // "hashtable.c"
extern char sStr_compFn[]; // "compFn"
extern char sStr_elemSize_2[]; // "elemSize"
extern char sStr_nBuckets[]; // "nBuckets"
extern char sStr_table[]; // "table"
extern char sStr_TableBuckets[]; // "table->buckets"
extern char sStr_fn_2[]; // "fn"
extern char sFmt_Hex_2[]; // "%02x"
extern char sStr_time[]; // "time"
extern char sStr_current_time[]; // "current_time"
extern char sStr_OS_IsTickAvailableEqTRUE[]; // "OS_IsTickAvailable() == TRUE"
extern char sStr_NonportC[]; // "nonport.c"
extern unsigned char __lower_mapC[];

extern int sprintf(char *, const char *, ...);
extern int SOC_Fcntl(int, int, int);
extern int SOC_Poll(SocPollFd *, int, s64);

HashTable *TableNew2(int elemSize, int nbuckets, int nchains, TableHashFn hashFn, ArrayCompareFn cmpFn, ArrayElementFreeFn freeFn);
void ArrayFree(DArray *a);
int ArrayLength(const DArray *a);
void ArrayAppend(DArray *a, const void *elem);
void ArrayDeleteAt(DArray *a, int n);
void ArrayReplaceAt(DArray *a, const void *elem, int n);
int ArraySearch(DArray *a, const void *key, ArrayCompareFn cmp, int from, int sorted);
void ArrayMap(DArray *a, ArrayMapFn fn, void *arg);
void ArrayMapBackwards(DArray *a, ArrayMapFn fn, void *arg);
void *ArrayMapBackwards2(DArray *a, ArrayMapFn2 fn, void *arg);
int GSISocketSelect(int sock, int *readFlag, int *writeFlag, int *exceptFlag);
int gsSocketCheckResult(int ret, int err);
int gsSocketGetSockOpt(int sock, int level, int opt, void *val, int *len);
int gsSocketSetSockOpt(int sock, int level, int opt, const void *val, int len);

static inline int ov00_tolower(int c) {
    if (c < 0 || c >= 0x80) {
        return c;
    }
    return __lower_mapC[c];
}

typedef struct SocSockAddr {
    u8 len;
    u8 family;
    u8 port[2];
    u8 addr[4];
} SocSockAddr;

typedef struct SockAddrIn {
    u8 len;
    u8 family;
    u16 port;
    u32 addr;
} SockAddrIn;

typedef struct Ov00SocketState {
    int unk0;
    int lastError;
    char *hName;
    char **hAliases;
    s16 hAddrType;
    s16 hLength;
    char **hAddrList;
    u32 addr;
    u8 pad1C[0x2C - 0x1C];
    char *addrList[2];
} Ov00SocketState;

extern char sStr_localhost[]; // "localhost"
extern char ov00_0221B1B4[];
extern char ov00_0221B1C4[];
extern char *ov00_0221B1D8[];
extern u32 SOCL_GetHostID(void);
extern void SOC_U32to4U8(u32, void *);

extern Ov00SocketState ov00_0221B1AC;
extern u32 gUtilRandState;

extern int SOC_Socket(int, int, int);
extern int SOC_Close(int);
extern int SOC_Shutdown(int, int);
extern int SOC_Bind(int, SocSockAddr *);
extern int SOC_Connect(int, SocSockAddr *);
extern int SOC_Listen(int, int);
extern int SOC_Accept(int, SocSockAddr *);
extern int SOC_Recv(int, void *, int, int);
extern int SOC_RecvFrom(int, void *, int, int, SocSockAddr *);
extern int SOC_Send(int, const void *, int, int);
extern int SOC_SendTo(int, const void *, int, int, SocSockAddr *);
extern int SOC_GetSockName(int, SocSockAddr *);
extern int SOC_InetAtoN(const char *, u32 *);
u32 Util_RandNextState(u32 x);
u32 Util_RandNext(void);

extern void *memset(void *, int, u32);
extern int strcmp(const char *, const char *);

void *ArrayNth(DArray *a, int n);
void ArrayInsertAt(DArray *a, const void *elem, int n);
void ArrayRemoveAt(DArray *a, int n);
void *ArrayBinarySearch(const void *key, const void *base, int count, int size, ArrayCompareFn cmp, int *found);
void *ArrayLinearSearch(const void *key, const void *base, int count, int size, ArrayCompareFn cmp);

void FreeElement(DArray *a, int n);
void ArrayGrow(DArray *a);
void SetElement(DArray *a, const void *elem, int n);
DArray *ArrayNew(int elemSize, int growBy, ArrayElementFreeFn freeFn);
void ArrayInsertSorted(DArray *a, const void *elem, ArrayCompareFn cmp);
void ArraySort(DArray *a, ArrayCompareFn cmp);
void ArrayClear(DArray *a);
HashTable *TableNew(int elemSize, int nbuckets, TableHashFn hashFn, ArrayCompareFn cmpFn, ArrayElementFreeFn freeFn);
void TableFree(HashTable *t);
int TableCount(HashTable *t);
void TableEnter(HashTable *t, const void *elem);
int TableRemove(HashTable *t, const void *elem);
void *TableLookup(HashTable *t, const void *elem);
void TableMap(HashTable *t, ArrayMapFn fn, void *arg);
void TableMapSafe(HashTable *t, ArrayMapFn fn, void *arg);
void *TableMapSafe2(HashTable *t, ArrayMapFn2 fn, void *arg);
void MD5Print(u8 *digest, char *out);
void MD5Digest(const void *data, u32 len, char *out);
u32 current_time(void);
void msleep(u32 ms);
void SocketStartUp(void);
void SocketShutDown(void);
char *goastrdup(const char *s);
char *_strlwr(char *s);
int SetSockBlocking(int sock, int blocking);
int SetReceiveBufferSize(int sock, int size);
int SetSendBufferSize(int sock, int size);
int GetReceiveBufferSize(int sock);
int GetSendBufferSize(int sock);
int CanReceiveOnSocket(int sock);
int CanSendOnSocket(int sock);
void *getlocalhost(void);
int IsPrivateIP(const u32 *in);
int gsSocketCreate(int domain, int type, int proto);
int gsSocketClose(int sock);
int gsSocketShutdown(int sock, int how);
int gsSocketBind(int sock, const SocSockAddr *addr, int len);
int gsSocketConnect(int sock, const SocSockAddr *addr, int len);
int gsSocketListen(int sock, int backlog);
int gsSocketAccept(int sock, SocSockAddr *addr, int *len);
int gsSocketRecv(int sock, void *buf, int len, int flags);
int gsSocketRecvFrom(int sock, void *buf, int len, int flags, SocSockAddr *addr, int *addrlen);
int gsSocketSend(int sock, const void *buf, int len, int flags);
int gsSocketSendTo(int sock, const void *buf, int len, int flags, const SocSockAddr *addr, int addrlen);

void FreeElement(DArray *a, int n) {
    if (a->freeFn != NULL) {
        a->freeFn(ArrayNth(a, n));
    }
}

void ArrayGrow(DArray *a) {
    a->capacity += a->growBy;
    a->list = DWCi_GsRealloc(a->list, a->capacity * a->elemSize);
    if (!a->list) {
        __msl_assertion_failed(sStr_ArrayList, sStr_DarrayC, sStr_ArrayGrow, 0x41);
    }
}

void SetElement(DArray *a, const void *elem, int n) {
    memcpy(ArrayNth(a, n), elem, a->elemSize);
}

DArray *ArrayNew(int elemSize, int growBy, ArrayElementFreeFn freeFn) {
    DArray *a = DWCi_GsMalloc(sizeof(DArray));
    if (!a) {
        __msl_assertion_failed(sStr_array, sStr_DarrayC, sStr_ArrayNew, 0x52);
    }
    if (!elemSize) {
        __msl_assertion_failed(sStr_elemSize, sStr_DarrayC, sStr_ArrayNew, 0x53);
    }
    if (growBy == 0) {
        growBy = 8;
    }
    a->count = 0;
    a->capacity = growBy;
    a->elemSize = elemSize;
    a->growBy = growBy;
    a->freeFn = freeFn;
    if (a->capacity != 0) {
        a->list = DWCi_GsMalloc(a->capacity * a->elemSize);
        if (!a->list) {
            __msl_assertion_failed(sStr_ArrayList, sStr_DarrayC, sStr_ArrayNew, 0x5e);
        }
    } else {
        a->list = NULL;
    }
    return a;
}

void ArrayFree(DArray *a) {
    int i;
    if (!a) {
        __msl_assertion_failed(sStr_array, sStr_DarrayC, sStr_ArrayFree, 0x69);
    }
    for (i = 0; i < a->count; i++) {
        FreeElement(a, i);
    }
    DWCi_GsFree(a->list);
    DWCi_GsFree(a);
}

int ArrayLength(const DArray *a) {
    return a->count;
}

void *ArrayNth(DArray *a, int n) {
    if (!(n >= 0 && n < a->count)) {
        __msl_assertion_failed(sStr_N_Ge0_AndN_LtArrayCount, sStr_DarrayC, sStr_ArrayNth, 0x94);
    }
    if (n < 0 || n >= a->count) {
        return NULL;
    }
    return (char *)a->list + a->elemSize * n;
}

void ArrayAppend(DArray *a, const void *elem) {
    if (!a) {
        __msl_assertion_failed(sStr_array, sStr_DarrayC, sStr_ArrayAppend, 0xa0);
    }
    if (a) {
        ArrayInsertAt(a, elem, a->count);
    }
}

void ArrayInsertAt(DArray *a, const void *elem, int n) {
    int last;
    if (!(n >= 0 && n <= a->count)) {
        __msl_assertion_failed(sStr_N_Ge0_AndN_LeArrayCount, sStr_DarrayC, sStr_ArrayInsertAt, 0xa7);
    }
    if (a->count == a->capacity) {
        ArrayGrow(a);
    }
    a->count++;
    if (n < a->count - 1) {
        memmove(ArrayNth(a, n + 1), ArrayNth(a, n), (a->count - 1 - n) * a->elemSize);
    }
    SetElement(a, elem, n);
}

void ArrayInsertSorted(DArray *a, const void *elem, ArrayCompareFn cmp) {
    int found;
    void *p;
    if (!cmp) {
        __msl_assertion_failed(sStr_comparator, sStr_DarrayC, sStr_ArrayInsertSorted, 0xb7);
    }
    p = ArrayBinarySearch(elem, a->list, a->count, a->elemSize, cmp, &found);
    ArrayInsertAt(a, elem, ((char *)p - (char *)a->list) / a->elemSize);
}

void ArrayRemoveAt(DArray *a, int n) {
    if (!(n >= 0 && n < a->count)) {
        __msl_assertion_failed(sStr_N_Ge0_AndN_LtArrayCount, sStr_DarrayC, sStr_ArrayRemoveAt, 0xc0);
    }
    if (n < a->count - 1) {
        memmove(ArrayNth(a, n), ArrayNth(a, n + 1), (a->count - 1 - n) * a->elemSize);
    }
    a->count--;
}

void ArrayDeleteAt(DArray *a, int n) {
    if (!(n >= 0 && n < a->count)) {
        __msl_assertion_failed(sStr_N_Ge0_AndN_LtArrayCount, sStr_DarrayC, sStr_ArrayDeleteAt, 0xca);
    }
    FreeElement(a, n);
    ArrayRemoveAt(a, n);
}

void ArrayReplaceAt(DArray *a, const void *elem, int n) {
    if (!(n >= 0 && n < a->count)) {
        __msl_assertion_failed(sStr_N_Ge0_AndN_LtArrayCount, sStr_DarrayC, sStr_ArrayReplaceAt, 0xd3);
    }
    FreeElement(a, n);
    SetElement(a, elem, n);
}

void ArraySort(DArray *a, ArrayCompareFn cmp) {
    qsort(a->list, a->count, a->elemSize, cmp);
}

int ArraySearch(DArray *a, const void *key, ArrayCompareFn cmp, int from, int sorted) {
    int count;
    int found = 1;
    void *p;
    if (!a || !(count = a->count)) {
        return -1;
    }
    if (sorted) {
        p = ArrayBinarySearch(key, ArrayNth(a, from), count - from, a->elemSize, cmp, &found);
    } else {
        p = ArrayLinearSearch(key, ArrayNth(a, from), count - from, a->elemSize, cmp);
    }
    if (!p || !found) {
        return -1;
    }
    return ((char *)p - (char *)a->list) / a->elemSize;
}

void ArrayMap(DArray *a, ArrayMapFn fn, void *arg) {
    int i;
    if (!fn) {
        __msl_assertion_failed(sStr_fn, sStr_DarrayC, sStr_ArrayMap, 0xf9);
    }
    for (i = 0; i < a->count; i++) {
        fn(ArrayNth(a, i), arg);
    }
}

void ArrayMapBackwards(DArray *a, ArrayMapFn fn, void *arg) {
    int i;
    if (!fn) {
        __msl_assertion_failed(sStr_fn, sStr_DarrayC, sStr_ArrayMapBackwards, 0x104);
    }
    for (i = a->count - 1; i >= 0; i--) {
        fn(ArrayNth(a, i), arg);
    }
}

void *ArrayMapBackwards2(DArray *a, ArrayMapFn2 fn, void *arg) {
    int i;
    void *e;
    if (!fn) {
        __msl_assertion_failed(sStr_fn, sStr_DarrayC, sStr_ArrayMapBackwards2, 0x121);
    }
    for (i = a->count - 1; i >= 0; i--) {
        e = ArrayNth(a, i);
        if (!fn(e, arg)) {
            return e;
        }
    }
    return NULL;
}

void ArrayClear(DArray *a) {
    int i;
    for (i = ArrayLength(a) - 1; i >= 0; i--) {
        ArrayDeleteAt(a, i);
    }
}

void *ArrayLinearSearch(const void *key, const void *base, int count, int size, ArrayCompareFn cmp) {
    int i;
    for (i = 0; i < count; i++) {
        if (cmp(key, (char *)base + i * size) == 0) {
            return (char *)base + size * i;
        }
    }
    return NULL;
}

void *ArrayBinarySearch(const void *key, const void *base, int count, int size, ArrayCompareFn cmp, int *found) {
    int lo = 0;
    int hi;
    int mid;
    int c;
    *found = 0;
    hi = count - 1;
    while (lo <= hi) {
        mid = (lo + hi) >> 1;
        c = cmp((char *)base + mid * size, key);
        if (c == 0) {
            *found = 1;
        }
        if (c < 0) {
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return (char *)base + lo * size;
}

HashTable *TableNew(int elemSize, int nbuckets, TableHashFn hashFn, ArrayCompareFn cmpFn, ArrayElementFreeFn freeFn) {
    return TableNew2(elemSize, nbuckets, 4, hashFn, cmpFn, freeFn);
}

HashTable *TableNew2(int elemSize, int nbuckets, int nchains, TableHashFn hashFn, ArrayCompareFn cmpFn, ArrayElementFreeFn freeFn) {
    HashTable *t;
    int i;
    if (!hashFn) {
        __msl_assertion_failed(sStr_hashFn, sStr_HashtableC, sStr_TableNew2, 0x38);
    }
    if (!cmpFn) {
        __msl_assertion_failed(sStr_compFn, sStr_HashtableC, sStr_TableNew2, 0x39);
    }
    if (!elemSize) {
        __msl_assertion_failed(sStr_elemSize_2, sStr_HashtableC, sStr_TableNew2, 0x3a);
    }
    if (!nbuckets) {
        __msl_assertion_failed(sStr_nBuckets, sStr_HashtableC, sStr_TableNew2, 0x3b);
    }
    t = DWCi_GsMalloc(sizeof(HashTable));
    if (!t) {
        __msl_assertion_failed(sStr_table, sStr_HashtableC, sStr_TableNew2, 0x3e);
    }
    t->buckets = DWCi_GsMalloc(nbuckets * sizeof(DArray *));
    if (!t->buckets) {
        __msl_assertion_failed(sStr_TableBuckets, sStr_HashtableC, sStr_TableNew2, 0x41);
    }
    for (i = 0; i < nbuckets; i++) {
        t->buckets[i] = ArrayNew(elemSize, nchains, freeFn);
    }
    t->nbuckets = nbuckets;
    t->freeFn = freeFn;
    t->cmpFn = cmpFn;
    t->hashFn = hashFn;
    return t;
}

void TableFree(HashTable *t) {
    int i;
    if (!t) {
        __msl_assertion_failed(sStr_table, sStr_HashtableC, sStr_TableFree, 0x51);
    }
    if (!t) {
        return;
    }
    for (i = 0; i < t->nbuckets; i++) {
        ArrayFree(t->buckets[i]);
    }
    DWCi_GsFree(t->buckets);
    DWCi_GsFree(t);
}

int TableCount(HashTable *t) {
    int i;
    int count = 0;
    if (!t) {
        __msl_assertion_failed(sStr_table, sStr_HashtableC, sStr_TableCount, 0x61);
    }
    if (!t) {
        return 0;
    }
    for (i = 0; i < t->nbuckets; i++) {
        count += ArrayLength(t->buckets[i]);
    }
    return count;
}

void TableEnter(HashTable *t, const void *elem) {
    int hash;
    int idx;
    if (!t) {
        __msl_assertion_failed(sStr_table, sStr_HashtableC, sStr_TableEnter, 0x71);
    }
    if (!t) {
        return;
    }
    hash = t->hashFn(elem, t->nbuckets);
    idx = ArraySearch(t->buckets[hash], elem, t->cmpFn, 0, 0);
    if (idx == -1) {
        ArrayAppend(t->buckets[hash], elem);
    } else {
        ArrayReplaceAt(t->buckets[hash], elem, idx);
    }
}

int TableRemove(HashTable *t, const void *elem) {
    int hash;
    int idx;
    if (!t) {
        __msl_assertion_failed(sStr_table, sStr_HashtableC, sStr_TableRemove, 0x82);
    }
    if (!t) {
        return 0;
    }
    hash = t->hashFn(elem, t->nbuckets);
    idx = ArraySearch(t->buckets[hash], elem, t->cmpFn, 0, 0);
    if (idx == -1) {
        return 0;
    }
    ArrayDeleteAt(t->buckets[hash], idx);
    return 1;
}

void *TableLookup(HashTable *t, const void *elem) {
    int hash;
    int idx;
    if (!t) {
        __msl_assertion_failed(sStr_table, sStr_HashtableC, sStr_TableLookup, 0x94);
    }
    if (!t) {
        return NULL;
    }
    hash = t->hashFn(elem, t->nbuckets);
    idx = ArraySearch(t->buckets[hash], elem, t->cmpFn, 0, 0);
    if (idx == -1) {
        return NULL;
    }
    return ArrayNth(t->buckets[hash], idx);
}

void TableMap(HashTable *t, ArrayMapFn fn, void *arg) {
    int i;
    if (!t) {
        __msl_assertion_failed(sStr_table, sStr_HashtableC, sStr_TableMap, 0xa7);
    }
    if (!fn) {
        __msl_assertion_failed(sStr_fn_2, sStr_HashtableC, sStr_TableMap, 0xa8);
    }
    if (!t || !fn) {
        return;
    }
    for (i = 0; i < t->nbuckets; i++) {
        ArrayMap(t->buckets[i], fn, arg);
    }
}

void TableMapSafe(HashTable *t, ArrayMapFn fn, void *arg) {
    int i;
    if (!fn) {
        __msl_assertion_failed(sStr_fn_2, sStr_HashtableC, sStr_TableMapSafe, 0xb6);
    }
    for (i = 0; i < t->nbuckets; i++) {
        ArrayMapBackwards(t->buckets[i], fn, arg);
    }
}

void *TableMapSafe2(HashTable *t, ArrayMapFn2 fn, void *arg) {
    int i;
    void *e;
    if (!fn) {
        __msl_assertion_failed(sStr_fn_2, sStr_HashtableC, sStr_TableMapSafe2, 0xd3);
    }
    for (i = 0; i < t->nbuckets; i++) {
        e = ArrayMapBackwards2(t->buckets[i], fn, arg);
        if (e) {
            return e;
        }
    }
    return NULL;
}

void MD5Print(u8 *digest, char *out) {
    unsigned int i;
    for (i = 0; i < 16; i++) {
        sprintf(out + 2 * i, sFmt_Hex_2, digest[i]);
    }
}

void MD5Digest(const void *data, u32 len, char *out) {
    u8 digest[16];
    Md5Ctx ctx;
    MD5Init(&ctx);
    MD5Update(&ctx, (u8 *)data, len);
    MD5Final(digest, &ctx);
    MD5Print(digest, out);
}

u32 current_time(void) {
    if (OS_IsTickAvailable() != TRUE) {
        __msl_assertion_failed(sStr_OS_IsTickAvailableEqTRUE, sStr_NonportC, sStr_current_time, 0x109);
    }
    return (u32)((OS_GetTick() * 64) / 33514);
}

void msleep(u32 ms) {
    OS_Sleep(ms);
}

void SocketStartUp(void) {
}

void SocketShutDown(void) {
}

char *goastrdup(const char *s) {
    char *p;
    if (!s) {
        return NULL;
    }
    p = DWCi_GsMalloc(strlen(s) + 1);
    if (p) {
        strcpy(p, s);
    }
    return p;
}

char *_strlwr(char *s) {
    char *p = s;
    while (*s) {
        *s = ov00_tolower(*s);
        s++;
    }
    return p;
}

int SetSockBlocking(int sock, int blocking) {
    int flags = SOC_Fcntl(sock, 3, 0);
    if (blocking) {
        flags &= ~4;
    } else {
        flags |= 4;
    }
    return SOC_Fcntl(sock, 4, flags) == 0;
}

int SetReceiveBufferSize(int sock, int size) {
    return gsSocketSetSockOpt(sock, 0xFFFF, 0x1002, &size, sizeof(size)) != -1;
}

int SetSendBufferSize(int sock, int size) {
    return gsSocketSetSockOpt(sock, 0xFFFF, 0x1001, &size, sizeof(size)) != -1;
}

int GetReceiveBufferSize(int sock) {
    int size;
    int len;
    len = sizeof(size);
    if (gsSocketGetSockOpt(sock, 0xFFFF, 0x1002, &size, &len) == -1) {
        return -1;
    }
    return size;
}

int GetSendBufferSize(int sock) {
    int size;
    int len;
    len = sizeof(size);
    if (gsSocketGetSockOpt(sock, 0xFFFF, 0x1001, &size, &len) == -1) {
        return -1;
    }
    return size;
}

int GSISocketSelect(int sock, int *readFlag, int *writeFlag, int *exceptFlag) {
    SocPollFd pfd;
    int rval;
    pfd.fd = sock;
    pfd.events = 0;
    if (readFlag) {
        pfd.events |= 1;
    }
    if (writeFlag) {
        pfd.events |= 8;
    }
    pfd.revents = 0;
    rval = SOC_Poll(&pfd, 1, 0);
    if (rval < 0) {
        return -1;
    }
    if (readFlag) {
        if (rval > 0 && (pfd.revents & 0x41)) {
            *readFlag = 1;
        } else {
            *readFlag = 0;
        }
    }
    if (writeFlag) {
        if (rval > 0 && (pfd.revents & 8)) {
            *writeFlag = 1;
        } else {
            *writeFlag = 0;
        }
    }
    if (exceptFlag) {
        if (rval > 0 && (pfd.revents & 0x20)) {
            *exceptFlag = 1;
        } else {
            *exceptFlag = 0;
        }
    }
    return rval;
}

int CanReceiveOnSocket(int sock) {
    int ready = 0;
    if (GSISocketSelect(sock, &ready, NULL, NULL) == 1) {
        return ready;
    }
    return 0;
}

int CanSendOnSocket(int sock) {
    int ready = 0;
    if (GSISocketSelect(sock, NULL, &ready, NULL) == 1) {
        return ready;
    }
    return 0;
}

void *getlocalhost(void) {
    ov00_0221B1AC.hName = sStr_localhost;
    ov00_0221B1AC.hAliases = (char **)(ov00_0221B1B4 - 8);
    ov00_0221B1AC.hAddrType = 2;
    ov00_0221B1AC.hLength = 0;
    ov00_0221B1AC.hAddrList = ov00_0221B1D8;
    ov00_0221B1AC.addr = 0;
    SOC_U32to4U8(SOCL_GetHostID(), ov00_0221B1C4);
    if (ov00_0221B1AC.addr == 0) {
        return NULL;
    }
    ov00_0221B1AC.addrList[0] = ov00_0221B1C4;
    ov00_0221B1AC.hLength = 4;
    ov00_0221B1AC.addrList[1] = NULL;
    return ov00_0221B1B4;
}

int IsPrivateIP(const u32 *in) {
    u32 x = *in;
    u32 ip = ((x >> 24) & 0xff) | ((x >> 8) & 0xff00) | ((x << 8) & 0xff0000) | ((x << 24) & 0xff000000);
    int b1 = (ip >> 24) & 0xff;
    int b2 = (ip >> 16) & 0xff;
    if (b1 == 10) {
        return 1;
    }
    if (b1 == 172 && b2 >= 16 && b2 <= 31) {
        return 1;
    }
    return b1 == 192 && b2 == 168;
}

int gsSocketCheckResult(int ret, int err) {
    if (ret < 0) {
        ov00_0221B1AC.lastError = ret;
        ret = err;
    }
    return ret;
}

int gsSocketCreate(int domain, int type, int proto) {
    return gsSocketCheckResult(SOC_Socket(domain, type, proto), -1);
}

int gsSocketClose(int sock) {
    return gsSocketCheckResult(SOC_Close(sock), -1);
}

int gsSocketShutdown(int sock, int how) {
    return gsSocketCheckResult(SOC_Shutdown(sock, how), -1);
}

int gsSocketBind(int sock, const SocSockAddr *addr, int len) {
    SocSockAddr local;
    if (((const SockAddrIn *)addr)->port == 0) {
        return 0;
    }
    local = *addr;
    local.len = len;
    return gsSocketCheckResult(SOC_Bind(sock, &local), -1);
}

int gsSocketConnect(int sock, const SocSockAddr *addr, int len) {
    SocSockAddr local;
    local = *addr;
    local.len = len;
    return gsSocketCheckResult(SOC_Connect(sock, &local), -1);
}

int gsSocketListen(int sock, int backlog) {
    return gsSocketCheckResult(SOC_Listen(sock, backlog), -1);
}

int gsSocketAccept(int sock, SocSockAddr *addr, int *len) {
    int ret;
    addr->len = *len;
    ret = SOC_Accept(sock, addr);
    *len = addr->len;
    return gsSocketCheckResult(ret, -1);
}

int gsSocketRecv(int sock, void *buf, int len, int flags) {
    return gsSocketCheckResult(SOC_Recv(sock, buf, len, flags), -1);
}

int gsSocketRecvFrom(int sock, void *buf, int len, int flags, SocSockAddr *addr, int *addrlen) {
    int ret;
    addr->len = *addrlen;
    ret = SOC_RecvFrom(sock, buf, len, flags, addr);
    *addrlen = addr->len;
    return gsSocketCheckResult(ret, -1);
}

int gsSocketSend(int sock, const void *buf, int len, int flags) {
    return gsSocketCheckResult(SOC_Send(sock, buf, len, flags), -1);
}

int gsSocketSendTo(int sock, const void *buf, int len, int flags, const SocSockAddr *addr, int addrlen) {
    SocSockAddr local;
    memcpy(&local, addr, 8);
    local.len = addrlen;
    return gsSocketCheckResult(SOC_SendTo(sock, buf, len, flags, &local), -1);
}
