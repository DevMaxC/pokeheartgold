#pragma force_active on
#include "global.h"

#include "dwc/gp_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

// The end of the platform layer ("nonport.c": socket options / names, ticks, the seeded random generator,
// base64) and the presence connection API ("gp.c": checks around the gpi* functions; with simulation set
// every call succeeds without network traffic).

extern const char sStr_time[]; // "time"
extern const char sStr_OS_IsTickAvailableEqTRUE[]; // "OS_IsTickAvailable() == TRUE"
extern const char sStr_NonportC[]; // "nonport.c"
extern const char sStr_gpGetBuddyStatus[]; // "gpGetBuddyStatus"
extern const char sStr_InvalidFunc[]; // "Invalid func."
extern const char sStr_NoCallback[]; // "No callback."
extern char sStr_Empty_6[];       // ""
extern const char sStr_TheConnectionHasAlreadyBeenDisconnected[]; // "The connection has already been disconnected."
extern const char sStr_InvalidReason[]; // "Invalid reason."
extern const char sKey_addbuddy[]; // "\\addbuddy\\"
extern const char sKey_sesskey[]; // "\\sesskey\\"
extern const char sKey_newprofileid[]; // "\\newprofileid\\"
extern const char sKey_reason[]; // "\\reason\\"
extern const char sKey_final[]; // "\\final\\"
extern const char sStr_InvalidStatus[]; // "Invalid status."
extern const char sStr_InvalidIndex[]; // "Invalid index."
extern const char sStr_buddyStatus[]; // "buddyStatus"
extern const char sStr_GpC[]; // "gp.c"
extern const char sStr_InvalidStatusString[]; // "Invalid statusString."
extern const char sStr_InvalidLocationString[]; // "Invalid locationString."
extern const char sKey_status[]; // "\\status\\"
extern const char sKey_statstring[]; // "\\statstring\\"
extern const char sKey_locstring[]; // "\\locstring\\"
extern char gpB64ExtraChars1[];       // the 3 extra characters (62, 63, padding) of base64 encoding 1
extern char gpB64ExtraChars2[];       // ... of encoding 2
extern char gpB64ExtraCharsStandard[];       // ... of the standard encoding

typedef struct SocSockAddr {
    u8 len;
    u8 family;
    u8 port[2];
    u8 addr[4];
} SocSockAddr;

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

typedef struct Ov00DwcState {
    int state;
} Ov00DwcState;

typedef void (*GpApiCallback)(GpConnection **connection, void *arg, void *param);

// Status of a buddy as gpGetBuddyStatus returns it.
typedef struct GpBuddyStatusInfo {
    int profile;
    int status;
    char statusString[0x100];
    char locationString[0x100];
    int ip;
    int port;
} GpBuddyStatusInfo;

// Callback arguments given when simulating.
typedef struct GpSimulatedConnectArg {
    int result;
    int profile;
    int unk8;
    int unkC;
    int unk10;
    int unk14;
    int unk18;
    int unk1C;
} GpSimulatedConnectArg;

typedef struct GpSimulatedSearchArg {
    int unk0;
    int unk4;
    int more;
    int unkC;
} GpSimulatedSearchArg;

typedef struct GpSimulatedInfoArg {
    int data[0x81];
} GpSimulatedInfoArg;

extern Ov00SocketState ov00_0221B1AC;
extern u32 gUtilRandState; // random generator state
extern Ov00DwcState ov00_0221B0D0;

extern void *memset(void *, int, u32);
extern int strcmp(const char *, const char *);
extern void __msl_assertion_failed(const char *cond, const char *file, const char *func, int line);
extern void DWCi_GsFree(void *p);
extern int SOC_GetSockName(int, SocSockAddr *);
extern int SOC_InetAtoN(const char *, u32 *);
extern int gsSocketCheckResult(int ret, int err);

int gsSocketGetSockOpt(int sock, int level, int opt, void *val, int *len);
int gsSocketSetSockOpt(int sock, int level, int opt, const void *val, int len);
int gsSocketGetSockName(int sock, SocSockAddr *addr, int *len);
u32 gsSocketInetAddr(const char *s);
int gsSocketGetLastError(void);
u32 current_time_seconds(u32 *out);
u32 Util_RandNextState(u32 x);
u32 Util_RandNext(void);
void Util_RandSeed(u32 seed);
int Util_RandInt(int lo, int hi);
void TripToQuart(const char *in, char *out, int len);
void B64Encode(const char *in, char *out, int len, int type);
int gpInitialize(GpConnection **connection, int productId, int namespaceId);
void gpDestroy(GpConnection **connection);
int gpProcess(GpConnection **connection);
int gpSetCallback(GpConnection **connection, int func, void *callback, void *param);
int gpConnectPreAuthenticatedA(GpConnection **connection, char *authtoken, char *partnerChallenge, int firewall, int blocking, GpApiCallback callback, void *param);
void gpDisconnect(GpConnection **connection);
int gpProfileSearchA(GpConnection **connection, char *nick, char *uniquenick, char *email, char *firstname, char *lastname, int icquin, int blocking, GpApiCallback callback, void *param);
int gpGetInfo(GpConnection **connection, int profile, int checkCache, int blocking, GpApiCallback callback, void *param);
int gpSetInfosA(GpConnection **connection, int info, const char *value);
int gpSendBuddyRequestA(GpConnection **connection, int profile, const char *reason);
int gpAuthBuddyRequest(GpConnection **connection, int profile);
int gpDenyBuddyRequest(GpConnection **connection, int profileId);
int gpGetNumBuddies(GpConnection **connection, int *numBuddies);
int gpGetBuddyStatus(GpConnection **connection, int index, GpBuddyStatusInfo *status);
int gpGetBuddyIndex(GpConnection **connection, int profileId, int *index);
int gpIsBuddy(GpConnection **connection, int profileId);
int gpDeleteBuddy(GpConnection **connection, int profile);
int gpSetStatusA(GpConnection **connection, int status, const char *statusString, const char *locationString);

// Turns backslashes into slashes (they delimit the "\key\value" messages).
static inline void FixSlashes(char *s) {
    char *p;
    if (*s) {
        p = s;
        do {
            if (*p == '\\') {
                *p = '/';
            }
        } while (*++p);
    }
}

int gsSocketGetSockOpt(int sock, int level, int opt, void *val, int *len) {
    MI_CpuFill8(val, 0, *len);
    return gsSocketCheckResult(0, -1);
}

int gsSocketSetSockOpt(int sock, int level, int opt, const void *val, int len) {
    return gsSocketCheckResult(0, -1);
}

int gsSocketGetSockName(int sock, SocSockAddr *addr, int *len) {
    int ret;
    addr->len = *len;
    ret = SOC_GetSockName(sock, addr);
    *len = addr->len;
    return gsSocketCheckResult(ret, -1);
}

u32 gsSocketInetAddr(const char *s) {
    u32 addr;
    if (SOC_InetAtoN(s, &addr) == 0) {
        return -1;
    }
    return addr;
}

int gsSocketGetLastError(void) {
    return ov00_0221B1AC.lastError;
}

// Seconds since start-up ("time").
u32 current_time_seconds(u32 *out) {
    u32 t;
    if (OS_IsTickAvailable() != TRUE) {
        __msl_assertion_failed(sStr_OS_IsTickAvailableEqTRUE, sStr_NonportC, sStr_time, 0x667);
    }
    t = (u32)((OS_GetTick() * 64) / 33514000);
    if (out) {
        *out = t;
    }
    return t;
}

// Next state of the 16807 * x mod (2^31 - 1) generator.
u32 Util_RandNextState(u32 x) {
    u32 lo = (x & 0xffff) * 16807;
    u32 hi = (x >> 16) * 16807;
    lo += (hi & 0x7fff) << 16;
    if (lo > 0x7fffffff) {
        lo &= 0x7fffffff;
        lo++;
    }
    lo += hi >> 15;
    if (lo > 0x7fffffff) {
        lo &= 0x7fffffff;
        lo++;
    }
    return lo;
}

u32 Util_RandNext(void) {
    return gUtilRandState = Util_RandNextState(gUtilRandState);
}

void Util_RandSeed(u32 seed) {
    gUtilRandState = seed ? (seed & 0x7fffffff) : 1;
}

// Random number in [lo, hi).
int Util_RandInt(int lo, int hi) {
    int range = hi - lo;
    int r;
    if (range == 0) {
        return lo;
    }
    r = (int)Util_RandNext() % range;
    return r + lo;
}

// Splits up to 3 bytes into 4 6-bit values.
void TripToQuart(const char *in, char *out, int len) {
    u8 tmp[3];
    int i;
    for (i = 0; i < len; i++) {
        tmp[i] = in[i];
    }
    for (; i < 3; i++) {
        tmp[i] = 0;
    }
    out[0] = tmp[0] >> 2;
    out[1] = ((tmp[0] & 3) << 4) | (tmp[1] >> 4);
    out[2] = ((tmp[1] & 0xf) << 2) | (tmp[2] >> 6);
    out[3] = tmp[2] & 0x3f;
}

// Base64-encodes len bytes of in; type selects the characters for 62, 63 and the padding.
void B64Encode(const char *in, char *out, int len, int type) {
    char *tbl;
    char *start = out;
    int remaining = len;
    char *pad;
    int mod;
    int c;
    switch (type) {
    case 1:
        tbl = gpB64ExtraChars1;
        break;
    case 2:
        tbl = gpB64ExtraChars2;
        break;
    default:
        tbl = gpB64ExtraCharsStandard;
        break;
    }
    while (remaining > 0) {
        TripToQuart(in, out, remaining < 3 ? remaining : 3);
        remaining -= 3;
        out += 4;
        in += 3;
    }
    mod = len % 3;
    pad = out;
    if (mod == 1) {
        pad = out - 2;
    } else if (mod == 2) {
        pad = out - 1;
    }
    *out = 0;
    while (out > start) {
        out--;
        if (out >= pad) {
            *out = tbl[2];
        } else {
            c = *out;
            if (c <= 25) {
                *out = c + 'A';
            } else if (c <= 51) {
                *out = c + 'G';
            } else if (c <= 61) {
                *out = c - 4;
            } else if (c == 62) {
                *out = tbl[0];
            } else if (c == 63) {
                *out = tbl[1];
            }
        }
    }
}

// Creates a connection (needs the DWC state to be 1).
int gpInitialize(GpConnection **connection, int productId, int namespaceId) {
    if (ov00_0221B0D0.state != 1) {
        return GP_PARAMETER_ERROR;
    }
    if (connection == 0) {
        return GP_PARAMETER_ERROR;
    }
    return gpiInitialize(connection, productId, namespaceId);
}

void gpDestroy(GpConnection **connection) {
    if (!connection || !*connection) {
        return;
    }
    gpiDestroy(connection);
}

// gpProcess
int gpProcess(GpConnection **connection) {
    if (!connection || !*connection) {
        return GP_PARAMETER_ERROR;
    }
    if ((*connection)->simulation) {
        return GP_NO_ERROR;
    }
    return gpiProcess(connection, 0);
}

// Sets one of the GP_CALLBACK_* callbacks.
int gpSetCallback(GpConnection **connection, int func, void *callback, void *param) {
    GpConnection *iconnection;
    if (!connection || !(iconnection = *connection)) {
        return GP_PARAMETER_ERROR;
    }
    if (func < 0 || func >= GP_CALLBACK_COUNT) {
        gpiSetErrorString(connection, sStr_InvalidFunc);
        return GP_PARAMETER_ERROR;
    }
    iconnection->callbacks[func].callback = callback;
    iconnection->callbacks[func].param = param;
    return GP_NO_ERROR;
}

// Connects with an authentication token.
int gpConnectPreAuthenticatedA(GpConnection **connection, char *authtoken, char *partnerChallenge, int firewall, int blocking, GpApiCallback callback, void *param) {
    GpConnection *iconnection;
    GpSimulatedConnectArg arg;
    if (!connection || !(iconnection = *connection)) {
        return GP_PARAMETER_ERROR;
    }
    if (!authtoken || !*authtoken) {
        return GP_PARAMETER_ERROR;
    }
    if (!partnerChallenge || !*partnerChallenge) {
        return GP_PARAMETER_ERROR;
    }
    if (!callback) {
        gpiSetErrorString(connection, sStr_NoCallback);
        return GP_PARAMETER_ERROR;
    }
    if (iconnection->simulation) {
        memset(&arg, 0, sizeof(arg));
        callback(connection, &arg, param);
        return GP_NO_ERROR;
    }
    return gpiConnect(connection, sStr_Empty_6, sStr_Empty_6, sStr_Empty_6, sStr_Empty_6, authtoken, partnerChallenge, 0, firewall, 0, blocking, callback, param);
}

// Disconnects.
void gpDisconnect(GpConnection **connection) {
    if (!connection || !*connection) {
        return;
    }
    if ((*connection)->simulation) {
        return;
    }
    gpiDisconnect(connection, 1);
    gpiReset(connection);
}

// Profile search.
int gpProfileSearchA(GpConnection **connection, char *nick, char *uniquenick, char *email, char *firstname, char *lastname, int icquin, int blocking, GpApiCallback callback, void *param) {
    GpConnection *iconnection;
    GpSimulatedSearchArg arg;
    if (!connection || !(iconnection = *connection)) {
        return GP_PARAMETER_ERROR;
    }
    if (!callback) {
        gpiSetErrorString(connection, sStr_NoCallback);
        return GP_PARAMETER_ERROR;
    }
    if (iconnection->simulation) {
        memset(&arg, 0, sizeof(arg));
        arg.more = 0x601;
        callback(connection, &arg, param);
        return GP_NO_ERROR;
    }
    return gpiProfileSearch(connection, nick, uniquenick, email, firstname, lastname, icquin, 0, blocking, callback, param);
}

// Gets the info of a profile.
int gpGetInfo(GpConnection **connection, int profile, int checkCache, int blocking, GpApiCallback callback, void *param) {
    GpConnection *iconnection;
    if (!connection || !(iconnection = *connection) || !profile) {
        return GP_PARAMETER_ERROR;
    }
    if (!callback) {
        gpiSetErrorString(connection, sStr_NoCallback);
        return GP_PARAMETER_ERROR;
    }
    if (iconnection->simulation) {
        GpSimulatedInfoArg arg = { 0 };
        callback(connection, &arg, param);
        return GP_NO_ERROR;
    }
    if (iconnection->connectState == GP_DISCONNECTED) {
        gpiSetErrorString(connection, sStr_TheConnectionHasAlreadyBeenDisconnected);
        return GP_PARAMETER_ERROR;
    }
    return gpiGetInfo(connection, profile, checkCache, blocking, callback, param);
}

// Sets a profile info field.
int gpSetInfosA(GpConnection **connection, int info, const char *value) {
    GpConnection *iconnection;
    if (!connection || !(iconnection = *connection)) {
        return GP_PARAMETER_ERROR;
    }
    if (iconnection->simulation) {
        return GP_NO_ERROR;
    }
    if (iconnection->connectState == GP_DISCONNECTED) {
        gpiSetErrorString(connection, sStr_TheConnectionHasAlreadyBeenDisconnected);
        return GP_PARAMETER_ERROR;
    }
    return gpiSetInfos(connection, info, value);
}

// Sends a buddy request ("\addbuddy\").
int gpSendBuddyRequestA(GpConnection **connection, int profile, const char *reason) {
    GpConnection *iconnection;
    char buf[0x401];
    if (!connection || !(iconnection = *connection)) {
        return GP_PARAMETER_ERROR;
    }
    if (iconnection->simulation) {
        return GP_NO_ERROR;
    }
    if (iconnection->connectState == GP_DISCONNECTED) {
        gpiSetErrorString(connection, sStr_TheConnectionHasAlreadyBeenDisconnected);
        return GP_PARAMETER_ERROR;
    }
    if (!reason) {
        gpiSetErrorString(connection, sStr_InvalidReason);
        return GP_PARAMETER_ERROR;
    }
    strzcpy(buf, reason, sizeof(buf));
    FixSlashes(buf);
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, sKey_addbuddy);
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, sKey_sesskey);
    gpiAppendIntToBuffer(connection, &iconnection->outputBuffer, iconnection->sessKey);
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, sKey_newprofileid);
    gpiAppendIntToBuffer(connection, &iconnection->outputBuffer, profile);
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, sKey_reason);
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, buf);
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, sKey_final);
    return GP_NO_ERROR;
}

// Accepts a buddy request.
int gpAuthBuddyRequest(GpConnection **connection, int profile) {
    GpConnection *iconnection;
    if (!connection || !(iconnection = *connection)) {
        return GP_PARAMETER_ERROR;
    }
    if (iconnection->simulation) {
        return GP_NO_ERROR;
    }
    if (iconnection->connectState == GP_DISCONNECTED) {
        gpiSetErrorString(connection, sStr_TheConnectionHasAlreadyBeenDisconnected);
        return GP_PARAMETER_ERROR;
    }
    return gpiAuthBuddyRequest(connection, profile);
}

// Denies a buddy request.
int gpDenyBuddyRequest(GpConnection **connection, int profileId) {
    GpConnection *iconnection;
    GpProfile *profile;
    if (!connection || !(iconnection = *connection)) {
        return GP_PARAMETER_ERROR;
    }
    if (iconnection->simulation) {
        return GP_NO_ERROR;
    }
    if (iconnection->connectState == GP_DISCONNECTED) {
        gpiSetErrorString(connection, sStr_TheConnectionHasAlreadyBeenDisconnected);
        return GP_PARAMETER_ERROR;
    }
    if (!gpiGetProfile(connection, profileId, &profile)) {
        return GP_NO_ERROR;
    }
    profile->requestCount--;
    if (!iconnection->cacheProfileInfo && profile->requestCount <= 0) {
        DWCi_GsFree(profile->authSig);
        profile->authSig = NULL;
        if (gpiCanFreeProfile(profile)) {
            gpiRemoveProfile(connection, profile);
        }
    }
    return GP_NO_ERROR;
}

int gpGetNumBuddies(GpConnection **connection, int *numBuddies) {
    GpConnection *iconnection;
    if (!connection || !(iconnection = *connection)) {
        return GP_PARAMETER_ERROR;
    }
    if (iconnection->simulation) {
        *numBuddies = 0;
        return GP_NO_ERROR;
    }
    *numBuddies = iconnection->numBuddies;
    return GP_NO_ERROR;
}

// "gpGetBuddyStatus"
int gpGetBuddyStatus(GpConnection **connection, int index, GpBuddyStatusInfo *status) {
    GpConnection *iconnection;
    GpProfile *profile;
    GpBuddyStatus *buddyStatus;
    int num;
    if (!connection || !(iconnection = *connection)) {
        return GP_PARAMETER_ERROR;
    }
    if (iconnection->simulation) {
        memset(status, 0, sizeof(GpBuddyStatusInfo));
        return GP_NO_ERROR;
    }
    if (!status) {
        gpiSetErrorString(connection, sStr_InvalidStatus);
        return GP_PARAMETER_ERROR;
    }
    num = iconnection->numBuddies;
    if (index < 0 || index >= num) {
        gpiSetErrorString(connection, sStr_InvalidIndex);
        return GP_PARAMETER_ERROR;
    }
    profile = gpiFindBuddy(connection, index);
    if (!profile) {
        gpiSetErrorString(connection, sStr_InvalidIndex);
        return GP_PARAMETER_ERROR;
    }
    buddyStatus = profile->buddyStatus;
    if (!buddyStatus) {
        __msl_assertion_failed(sStr_buddyStatus, sStr_GpC, sStr_gpGetBuddyStatus, 0x5CF);
    }
    status->profile = profile->profileId;
    status->status = buddyStatus->status;
    if (!buddyStatus->statusString) {
        buddyStatus->statusString[0] = 0;
    } else {
        strzcpy(status->statusString, buddyStatus->statusString, 0x100);
    }
    if (!buddyStatus->locationString) {
        buddyStatus->locationString[0] = 0;
    } else {
        strzcpy(status->locationString, buddyStatus->locationString, 0x100);
    }
    status->ip = buddyStatus->ip;
    status->port = buddyStatus->port;
    return GP_NO_ERROR;
}

// The buddy index of a profile, -1 if it is no buddy.
int gpGetBuddyIndex(GpConnection **connection, int profileId, int *index) {
    GpConnection *iconnection;
    GpProfile *profile;
    if (!connection || !(iconnection = *connection)) {
        return GP_PARAMETER_ERROR;
    }
    if (iconnection->simulation) {
        *index = 0;
        return GP_NO_ERROR;
    }
    if (gpiGetProfile(connection, profileId, &profile) && profile->buddyStatus) {
        *index = profile->buddyStatus->buddyIndex;
    } else {
        *index = -1;
    }
    return GP_NO_ERROR;
}

// Whether the profile is a buddy.
int gpIsBuddy(GpConnection **connection, int profileId) {
    GpConnection *iconnection;
    GpProfile *profile;
    if (!connection || !(iconnection = *connection)) {
        return 0;
    }
    if (iconnection->simulation) {
        return 0;
    }
    if (gpiGetProfile(connection, profileId, &profile) && profile->buddyStatus) {
        return 1;
    }
    return 0;
}

// Deletes a buddy.
int gpDeleteBuddy(GpConnection **connection, int profile) {
    GpConnection *iconnection;
    int result;
    if (!connection || !(iconnection = *connection)) {
        return GP_PARAMETER_ERROR;
    }
    if (iconnection->simulation) {
        return GP_NO_ERROR;
    }
    if (iconnection->connectState == GP_DISCONNECTED) {
        gpiSetErrorString(connection, sStr_TheConnectionHasAlreadyBeenDisconnected);
        return GP_PARAMETER_ERROR;
    }
    result = gpiDeleteBuddy(connection, profile);
    if (result) {
        return result;
    }
    return GP_NO_ERROR;
}

// Sets the own status ("\status\"), unless it did not change.
int gpSetStatusA(GpConnection **connection, int status, const char *statusString, const char *locationString) {
    GpConnection *iconnection;
    char statBuf[0x100];
    char locBuf[0x100];
    if (!connection || !(iconnection = *connection)) {
        return GP_PARAMETER_ERROR;
    }
    if (iconnection->simulation) {
        return GP_NO_ERROR;
    }
    if (iconnection->connectState == GP_DISCONNECTED) {
        gpiSetErrorString(connection, sStr_TheConnectionHasAlreadyBeenDisconnected);
        return GP_PARAMETER_ERROR;
    }
    if (!statusString) {
        gpiSetErrorString(connection, sStr_InvalidStatusString);
        return GP_PARAMETER_ERROR;
    }
    if (!locationString) {
        gpiSetErrorString(connection, sStr_InvalidLocationString);
        return GP_PARAMETER_ERROR;
    }
    strzcpy(statBuf, statusString, 0x100);
    FixSlashes(statBuf);
    strzcpy(locBuf, locationString, 0x100);
    FixSlashes(locBuf);
    if (status == iconnection->lastStatus && !strcmp(statBuf, iconnection->lastStatusString) && !strcmp(locBuf, iconnection->lastLocationString)) {
        return GP_NO_ERROR;
    }
    iconnection->lastStatus = status;
    strzcpy(iconnection->lastStatusString, statBuf, 0x100);
    strzcpy(iconnection->lastLocationString, locBuf, 0x100);
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, sKey_status);
    gpiAppendIntToBuffer(connection, &iconnection->outputBuffer, status);
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, sKey_sesskey);
    gpiAppendIntToBuffer(connection, &iconnection->outputBuffer, iconnection->sessKey);
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, sKey_statstring);
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, statBuf);
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, sKey_locstring);
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, locBuf);
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, sKey_final);
    return GP_NO_ERROR;
}
