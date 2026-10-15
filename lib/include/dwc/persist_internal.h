#ifndef POKEHEARTGOLD_LIB_INCLUDE_DWC_PERSIST_INTERNAL_H
#define POKEHEARTGOLD_LIB_INCLUDE_DWC_PERSIST_INTERNAL_H

// Named value buckets and the persistent data client of OVY_0 (lib/NitroDWC/src/persist_data.c).

typedef enum BucketType {
    BUCKET_INT,
    BUCKET_DOUBLE,
    BUCKET_STRING,
} BucketType;

// One named value ("gbucket.c").
typedef struct Bucket {
    const char *name;
    int type;  // BucketType
    int count; // number of values averaged in

    union {
        int i;
        double d;
        char *s;
    } val;
} Bucket;

// A hash table of buckets, looked up by name.
typedef struct BucketSet {
    void *table;
} BucketSet;

// ov00_0221B1F0: the values returned by pointer, and the default set.
typedef struct BucketGlobals {
    int intValue;          // 0x0
    BucketSet *defaultSet; // 0x4
    double doubleValue;    // 0x8
} BucketGlobals;

// ov00_022198D8: the persistent data server socket.
typedef struct PersistSocket {
    int socket;      // -1 when closed
    int port;        // 0x4
    const char *key; // 0x8, key of the XOR scrambling
} PersistSocket;

// A pending persistent data request: the reply is matched on type, localId and profileId.
typedef struct PersistRequest {
    int type; // 0 = authentication, 1 = get data, 2 = set data, 3 = get profile id
    int localId;
    int profileId;
    int persistType;
    int index;
    int param;      // passed back to the callback
    void *callback; // signature depends on type
} PersistRequest;

// A game whose values are kept in a bucket set.
typedef struct StatsGame {
    u8 unk00[0xC];
    BucketSet *buckets; // 0x0C
    u8 unk10[0xC];
    void *players; // 0x1C, DArray of player numbers
    void *teams;   // 0x20, DArray of team numbers
} StatsGame;

// gPersistWork: persistent data client state.
typedef struct PersistWork {
    int recvLen;    // 0x00
    void *requests; // 0x04, DArray of PersistRequest
    int unk08;      // 0x08
    char *recvBuf;  // 0x0C
    int state;      // 0x10, 5 = connected
    u8 unk14[0x10];
    int valueIndex;         // 0x24, alternates between the two value buffers
    StatsGame *currentGame; // 0x28, used when no game is given
    int recvCap;            // 0x2C
    char values[2][0x100];  // 0x30
} PersistWork;

typedef void *(*BucketGetter)(void *buckets, const char *name, void *value);
typedef char *(*BucketStringGetter)(void *buckets, const char *name, char *value);

// persist_data.c
void *BucketNew(BucketSet *set, const char *name, int type, void *value);
void *BucketSetValue(BucketSet *set, const char *name, void *value);
void *BucketAdd(BucketSet *set, const char *name, void *value);
void *BucketSub(BucketSet *set, const char *name, void *value);
void *BucketMult(BucketSet *set, const char *name, void *value);
void *BucketDiv(BucketSet *set, const char *name, void *value);
void *BucketConcat(BucketSet *set, const char *name, void *value);
void *BucketAvg(BucketSet *set, const char *name, void *value);
int *bint(int value);
double *bdouble(double value);
char *BucketFixBackslashes(char *s);
void *DoSet(Bucket *bucket, void *value);
void *DoGet(Bucket *bucket);
Bucket *DoFind(BucketSet *set, const char *name);
void CloseStatsConnection(void);
int IsStatsConnected(void);
int PersistThink(void);
void xcode_buf(char *buf, int len);
char *value_for_key(const char *str, const char *key);
char *value_for_key_safe(const char *str, const char *key);
int SocketReadable(int socket);
char *FindFinal(char *buf, int len);
int FindRequest(int type, int localId, int profileId);
void ProcessPlayerAuth(char *buf, int len);
void ProcessGetPid(char *buf, int len);
void ProcessGetData(char *buf, int len);
void ProcessSetData(char *buf, int len);
void ProcessStatement(char *buf, int len);
int ProcessInBuffer(char *buf, int len);
void CallReqCallback(int index, int success, int modified, char *data, int len);
void FailAllRequests(void);
int GetTeamNumber(StatsGame *game, int index);
int GetPlayerNumber(StatsGame *game, int index);
int BucketIntOp(StatsGame *game, const char *name, BucketGetter get, int value, ...);
double BucketDoubleOp(StatsGame *game, const char *name, BucketGetter get, double value, ...);
char *BucketStringOp(StatsGame *game, const char *name, BucketStringGetter get, char *value, int unused);
int TeamBucketIntOp(StatsGame *game, const char *name, BucketGetter get, int value, int index);
double TeamBucketDoubleOp(StatsGame *game, const char *name, BucketGetter get, double value, int index);
char *TeamBucketStringOp(StatsGame *game, const char *name, BucketStringGetter get, char *value, int index);
int PlayerBucketIntOp(StatsGame *game, const char *name, BucketGetter get, int value, int index);
double PlayerBucketDoubleOp(StatsGame *game, const char *name, BucketGetter get, double value, int index);
char *PlayerBucketStringOp(StatsGame *game, const char *name, BucketStringGetter get, char *value, int index);

#endif // POKEHEARTGOLD_LIB_INCLUDE_DWC_PERSIST_INTERNAL_H
