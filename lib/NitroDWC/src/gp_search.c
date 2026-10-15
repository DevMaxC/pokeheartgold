#pragma force_active on
#include "global.h"

#include "dwc/gp_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

// Presence connection: the rest of "gpiProfile.c" (profile table lookups and iteration) and "gpiSearch.c"
// (requests to the search manager: profile searches, nick checks, new users, ... and their replies).

extern const char sStr_gpiProfileListAdd[]; // "gpiProfileListAdd"
extern const char sStr_IdGt0[]; // "id > 0"
extern const char sStr_GpiProfileC[]; // "gpiProfile.c"
extern const char sStr_gpiProcessSearch[]; // "gpiProcessSearch"
extern const char sStr_gpiStartProfileSearch[]; // "gpiStartProfileSearch"
extern const char sStr_GpspGsNintendowifiNet[]; // "gpsp.gs.nintendowifi.net"
extern const char sStr_OutOfMemory_10[]; // "Out of memory."
extern const char sStr_ThereWasAnErrorCreatingA_Socket_3[]; // "There was an error creating a socket."
extern const char sStr_ThereWasAnErrorMakingA_SocketNonBlocking_3[]; // "There was an error making a socket non-blocking."
extern const char sStr_CouldNotResolveSearchManangerHostName[]; // "Could not resolve search mananger host name."
extern const char sStr_AddressSinAddrS_AddrNe0_2[]; // "address.sin_addr.s_addr != 0"
extern const char sStr_GpiSearchC[]; // "gpiSearch.c"
extern const char sStr_ThereWasAnErrorConnectingA_Socket_3[]; // "There was an error connecting a socket."
extern const char sStr_NoSearchCriteria[]; // "No search criteria."
extern const char sStr_SM[]; // "SM"
extern const char sStr_CouldNotConnectToTheSearchManager[]; // "Could not connect to the search manager."
extern const char sKey_search[]; // "\\search\\"
extern const char sKey_sesskey_4[]; // "\\sesskey\\"
extern const char sKey_profileid_4[]; // "\\profileid\\"
extern const char sKey_namespaceid_2[]; // "\\namespaceid\\"
extern const char sKey_nick_4[]; // "\\nick\\"
extern const char sKey_uniquenick_3[]; // "\\uniquenick\\"
extern const char sKey_email_3[]; // "\\email\\"
extern const char sKey_firstname_2[]; // "\\firstname\\"
extern const char sKey_lastname_2[]; // "\\lastname\\"
extern const char sKey_icquin_2[]; // "\\icquin\\"
extern const char sKey_skip[]; // "\\skip\\"
extern const char sKey_valid[]; // "\\valid\\"
extern const char sKey_nicks[]; // "\\nicks\\"
extern const char sKey_pass[]; // "\\pass\\"
extern const char sKey_pmatch[]; // "\\pmatch\\"
extern const char sKey_productid_2[]; // "\\productid\\"
extern const char sKey_check[]; // "\\check\\"
extern const char sKey_newuser_2[]; // "\\newuser\\"
extern const char sKey_productID[]; // "\\productID\\"
extern const char sKey_cdkey[]; // "\\cdkey\\"
extern const char sKey_others[]; // "\\others\\"
extern const char sKey_uniquesearch[]; // "\\uniquesearch\\"
extern const char sKey_preferrednick[]; // "\\preferrednick\\"
extern const char sStr_0_5[]; // "0"
extern const char sKey_gamename_2[]; // "\\gamename\\"
extern const char sKey_final_7[]; // "\\final\\"
extern const char sStr_ThereWasAnErrorReadingFromTheServer_2[]; // "There was an error reading from the server."
extern const char sStr_bsrdone[]; // "bsrdone"
extern const char sStr_more[]; // "more"
extern const char sStr_bsr[]; // "bsr"
extern const char sStr_nick[]; // "nick"
extern const char sStr_uniquenick[]; // "uniquenick"
extern const char sStr_firstname[]; // "firstname"
extern const char sStr_lastname[]; // "lastname"
extern const char sStr_email[]; // "email"
extern const char sStr_ErrorReadingFromTheSearchServer[]; // "Error reading from the search server."
extern const char sStr_vr[]; // "vr"
extern const char sStr_nr[]; // "nr"
extern const char sStr_ndone[]; // "ndone"
extern const char sStr_psrdone[]; // "psrdone"
extern const char sStr_psr[]; // "psr"
extern const char sStr_status[]; // "status"
extern const char sStr_statuscode[]; // "statuscode"
extern const char sStr_cur[]; // "cur"
extern const char sKey_pid_3[]; // "\\pid\\"
extern const char sStr_nur[]; // "nur"
extern const char sStr_others[]; // "others"
extern const char sStr_odone[]; // "odone"
extern const char sStr_o[]; // "o"
extern const char sStr_first[]; // "first"
extern const char sStr_last[]; // "last"
extern const char sStr_us[]; // "us"
extern const char sStr_usdone[]; // "usdone"
extern const char sStr_CountEqArgNumSuggestedNicks[]; // "count == arg->numSuggestedNicks"
extern char __GSIACGamename[];       // game name

typedef struct HostEnt {
    char *name;
    char **aliases;
    int addrType;
    u32 **addrList;
} HostEnt;

typedef union SocketAddress {
    struct {
        u8 len;
        u8 family;
        u16 port;
        u32 addr;
    } in;

    u32 words[2];
} SocketAddress;

// Context of gpiProfileMap.
typedef struct GpProfileMapData {
    GpConnection **connection;
    int (*func)(GpConnection **, GpProfile *, void *);
    void *data;
} GpProfileMapData;

// Context of gpiFindProfileByUser.
typedef struct GpFindByNickData {
    char *nick;
    char *email;
    GpProfile **profile;
    int found;
} GpFindByNickData;

// Context of gpiFindBuddy.
typedef struct GpFindByBuddyIndexData {
    int index;
    GpProfile *profile;
} GpFindByBuddyIndexData;

// A profile found by a profile search / "\others\" request.
typedef struct GpSearchMatch {
    int profile;
    char nick[31];
    char uniquenick[21];
    char firstname[31];
    char lastname[31];
    char email[51];
} GpSearchMatch;

// Callback arguments of the searches.
typedef struct GpProfileSearchArg {
    int result;
    int numMatches;
    int more; // 0x600 more matches, 0x601 done
    GpSearchMatch *matches;
} GpProfileSearchArg;

typedef struct GpIsValidEmailArg {
    int result;
    char email[52];
    int isValid;
} GpIsValidEmailArg;

typedef struct GpNicksArg {
    int result;
    char email[52];
    int numNicks;
    char **nicks;
    char **uniquenicks;
} GpNicksArg;

typedef struct GpPlayerMatch {
    int profile;
    char nick[31];
    int playerStatus;
    char status[256];
} GpPlayerMatch;

typedef struct GpFindPlayersArg {
    int result;
    int productId;
    int numMatches;
    GpPlayerMatch *matches;
} GpFindPlayersArg;

typedef struct GpCheckArg {
    int result;
    int profile;
} GpCheckArg;

typedef struct GpSuggestUniqueArg {
    int result;
    int numSuggestedNicks;
    char **suggestedNicks;
} GpSuggestUniqueArg;

typedef struct GpOthersArg {
    int result;
    int numProfiles;
    GpSearchMatch *profiles;
} GpOthersArg;

extern int strcmp(const char *, const char *);
extern long atol(const char *);
extern char *strstr(const char *, const char *);
extern char *strcpy(char *, const char *);
extern void *memset(void *, int, u32);
extern void __msl_assertion_failed(const char *expr, const char *file, const char *func, int line);
extern HostEnt *SOC_GetHostByName(const char *name);
extern void *DWCi_GsMalloc(int size);
extern void *DWCi_GsRealloc(void *p, int size);
extern void DWCi_GsFree(void *p);
extern void TableEnter(void *table, GpProfile *profile);
extern void TableRemove(void *table, GpProfile *profile);
extern GpProfile *TableLookup(void *table, GpProfile *key);
extern int TableMapSafe2(void *table, int (*func)(GpProfile *, GpProfileMapData *), GpProfileMapData *data);
extern void msleep(int ms);
extern void _strlwr(char *string);
extern int SetSockBlocking(int sock, int blocking);
extern int gsSocketCreate(int domain, int type, int protocol);
extern int gsSocketConnect(int sock, SocketAddress *address, int len);
extern int gsSocketGetLastError(int sock);
extern void gpiCallErrorCallback(GpConnection **connection, int result, int fatal);
extern int gpiAddCallback(GpConnection **connection, GpCallback callback, void *arg, GpOperation *operation, int type);

int gpiCheckProfileForUser(GpConnection **connection, GpProfile *profile, GpFindByNickData *data);
int gpiProfileMapCallback(GpProfile *profile, GpProfileMapData *data);
int gpiCheckForBuddy(GpConnection **connection, GpProfile *profile, GpFindByBuddyIndexData *data);

// "gpiProfileListAdd": the profile table entry of profileId, added when missing.
GpProfile *gpiProfileListAdd(GpConnection **connection, int profileId) {
    GpConnection *iconnection = *connection;
    GpProfile *profile;
    if (!(profileId > 0)) {
        __msl_assertion_failed(sStr_IdGt0, sStr_GpiProfileC, sStr_gpiProfileListAdd, 0x2B5);
    }
    if (profileId <= 0) {
        return 0;
    }
    if (gpiGetProfile(connection, profileId, &profile)) {
        return profile;
    }
    {
        GpProfile entry = { 0 };
        entry.profileId = profileId;
        entry.userId = 0;
        entry.cache = 0;
        entry.authSig = 0;
        entry.peerSig = 0;
        entry.requestCount = 0;
        TableEnter(iconnection->profileTable, &entry);
    }
    iconnection->numProfiles++;
    if (gpiGetProfile(connection, profileId, &profile)) {
        return profile;
    }
    return 0;
}

// Looks up a profile.
int gpiGetProfile(GpConnection **connection, int profileId, GpProfile **profile) {
    GpConnection *iconnection = *connection;
    GpProfile key, *found;
    key.profileId = profileId;
    found = TableLookup(iconnection->profileTable, &key);
    if (profile) {
        *profile = found;
    }
    return found != 0;
}

// Removes a profile by id.
void gpiRemoveProfileByID(GpConnection **connection, int profileId) {
    GpConnection *iconnection = *connection;
    GpProfile *profile;
    if (!gpiGetProfile(connection, profileId, &profile)) {
        return;
    }
    TableRemove(iconnection->profileTable, profile);
}

void gpiRemoveProfile(GpConnection **connection, GpProfile *profile) {
    TableRemove((*connection)->profileTable, profile);
}

int gpiCheckProfileForUser(GpConnection **connection, GpProfile *profile, GpFindByNickData *data) {
    GpInfo *info = profile->cache;
    if (info && strcmp(data->nick, info->nick) == 0 && strcmp(data->email, info->email) == 0) {
        *data->profile = profile;
        data->found = 1;
        return 0;
    }
    return 1;
}

// Finds the cached profile with this nick and email.
int gpiFindProfileByUser(GpConnection **connection, char *nick, char *email, GpProfile **profile) {
    GpFindByNickData data;
    data.nick = nick;
    data.email = email;
    data.profile = profile;
    data.found = 0;
    gpiProfileMap(connection, (int (*)(GpConnection **, GpProfile *, void *))gpiCheckProfileForUser, &data);
    if (!data.found) {
        *profile = 0;
    }
    return 0;
}

int gpiProfileMapCallback(GpProfile *profile, GpProfileMapData *data) {
    return data->func(data->connection, profile, data->data);
}

// Calls func for every profile until it returns 0; returns whether it went through all of them.
int gpiProfileMap(GpConnection **connection, int (*func)(GpConnection **, GpProfile *, void *), void *data) {
    GpConnection *iconnection = *connection;
    GpProfileMapData map;
    map.func = func;
    map.data = data;
    map.connection = connection;
    return TableMapSafe2(iconnection->profileTable, gpiProfileMapCallback, &map) == 0;
}

int gpiCheckForBuddy(GpConnection **connection, GpProfile *profile, GpFindByBuddyIndexData *data) {
    if (profile->buddyStatus && data->index == profile->buddyStatus->buddyIndex) {
        data->profile = profile;
        return 0;
    }
    return 1;
}

// The buddy with this index.
GpProfile *gpiFindBuddy(GpConnection **connection, int index) {
    GpFindByBuddyIndexData data;
    data.index = index;
    data.profile = 0;
    gpiProfileMap(connection, (int (*)(GpConnection **, GpProfile *, void *))gpiCheckForBuddy, &data);
    return data.profile;
}

// Whether the profile holds nothing worth keeping.
int gpiCanFreeProfile(GpProfile *profile) {
    if (profile && !profile->cache && !profile->buddyStatus && !profile->peerSig && !profile->authSig) {
        return 1;
    }
    return 0;
}

// "gpiStartProfileSearch": connects to the search manager.
int gpiStartProfileSearch(GpConnection **connection, GpOperation *operation) {
    GpSearchData *data = operation->data;
    HostEnt *host;
    int error;
    data->inputBuffer.size = 4096;
    data->inputBuffer.buffer = DWCi_GsMalloc(4097);
    if (!data->inputBuffer.buffer) {
        gpiSetErrorString(connection, sStr_OutOfMemory_10);
        return GP_MEMORY_ERROR;
    }
    data->sock = gsSocketCreate(AF_INET, SOCK_STREAM, 0);
    if (data->sock == INVALID_SOCKET) {
        gpiSetError(connection, GP_NETWORK, sStr_ThereWasAnErrorCreatingA_Socket_3);
        gpiCallErrorCallback(connection, GP_NETWORK_ERROR, GP_FATAL);
        return GP_NETWORK_ERROR;
    }
    if (SetSockBlocking(data->sock, 0) == 0) {
        gpiSetError(connection, GP_NETWORK, sStr_ThereWasAnErrorMakingA_SocketNonBlocking_3);
        gpiCallErrorCallback(connection, GP_NETWORK_ERROR, GP_FATAL);
        return GP_NETWORK_ERROR;
    }
    host = SOC_GetHostByName(sStr_GpspGsNintendowifiNet);
    if (!host) {
        gpiSetError(connection, GP_NETWORK, sStr_CouldNotResolveSearchManangerHostName);
        gpiCallErrorCallback(connection, GP_NETWORK_ERROR, GP_FATAL);
        return GP_NETWORK_ERROR;
    }
    {
        SocketAddress address = { 0 };
        address.in.family = AF_INET;
        address.in.addr = **host->addrList;
        if (!address.in.addr) {
            __msl_assertion_failed(sStr_AddressSinAddrS_AddrNe0_2, sStr_GpiSearchC, sStr_gpiStartProfileSearch, 89);
        }
        address.in.port = 0xcd74; // 29901, big-endian
        if (gsSocketConnect(data->sock, &address, 8) == SOCKET_ERROR) {
            error = gsSocketGetLastError(data->sock);
            if (error != -6 && error != -26 && error != -76) {
                gpiSetError(connection, GP_NETWORK, sStr_ThereWasAnErrorConnectingA_Socket_3);
                gpiCallErrorCallback(connection, GP_NETWORK_ERROR, GP_FATAL);
                return GP_NETWORK_ERROR;
            }
        }
        operation->state = GPI_CONNECTING;
        return GP_NO_ERROR;
    }
}

// Allocates the data of a search operation.
int gpiInitSearchData(GpConnection **connection, GpSearchData **data, int type) {
    GpSearchData *search = DWCi_GsMalloc(sizeof(GpSearchData));
    if (!search) {
        gpiSetErrorString(connection, sStr_OutOfMemory_10);
        return GP_MEMORY_ERROR;
    }
    memset(search, 0, sizeof(GpSearchData));
    search->type = type;
    search->sock = INVALID_SOCKET;
    search->inputBuffer.buffer = 0;
    search->inputBuffer.len = 0;
    search->inputBuffer.pos = 0;
    search->inputBuffer.size = 0;
    search->outputBuffer.len = 0;
    search->outputBuffer.pos = 0;
    search->outputBuffer.size = 0x1000;
    search->outputBuffer.buffer = DWCi_GsMalloc(0x1001);
    if (!search->outputBuffer.buffer) {
        gpiSetErrorString(connection, sStr_OutOfMemory_10);
        return GP_MEMORY_ERROR;
    }
    search->busy = 0;
    search->done = 0;
    *data = search;
    return GP_NO_ERROR;
}

// Starts a search operation.
int gpiStartSearch(GpConnection **connection, GpSearchData *data, int blocking, void *callback, void *param) {
    GpConnection *iconnection = *connection;
    GpOperation *operation;
    int result;
    iconnection->numSearches++;
    result = gpiAddOperation(connection, GP_OPERATION_SEARCH, data, &operation, blocking, callback, param);
    if (result) {
        return result;
    }
    result = gpiStartProfileSearch(connection, operation);
    if (result) {
        return result;
    }
    if (operation->blocking) {
        result = gpiProcess(connection, operation->id);
        if (result) {
            return result;
        }
    }
    return 0;
}

// Searches for profiles matching the given fields.
int gpiProfileSearch(GpConnection **connection, char *nick, char *uniquenick, char *email, char *firstname, char *lastname, int icquin, int skip, int blocking, void *callback, void *param) {
    GpSearchData *data;
    int result;
    if ((!nick || !*nick) && (!email || !*email) && (!firstname || !*firstname) && (!lastname || !*lastname) && !icquin && (!uniquenick || !*uniquenick)) {
        gpiSetErrorString(connection, sStr_NoSearchCriteria);
        return GP_PARAMETER_ERROR;
    }
    result = gpiInitSearchData(connection, &data, GP_SEARCH_PROFILE);
    if (result != 0) {
        return result;
    }
    if (nick == 0) {
        data->nick[0] = 0;
    } else {
        strzcpy(data->nick, nick, 31);
    }
    if (uniquenick == 0) {
        data->uniquenick[0] = 0;
    } else {
        strzcpy(data->uniquenick, uniquenick, 21);
    }
    if (email == 0) {
        data->email[0] = 0;
    } else {
        strzcpy(data->email, email, 51);
    }
    _strlwr(data->email);
    if (firstname == 0) {
        data->firstname[0] = 0;
    } else {
        strzcpy(data->firstname, firstname, 31);
    }
    if (lastname == 0) {
        data->lastname[0] = 0;
    } else {
        strzcpy(data->lastname, lastname, 31);
    }
    data->icquin = icquin;
    if (skip < 0) {
        skip = 0;
    }
    data->skip = skip;
    result = gpiStartSearch(connection, data, blocking, callback, param);
    if (result == 0) {
        return GP_NO_ERROR;
    }
    return result;
}

#define SEARCH_SEND(string) gpiAppendStringToBuffer(connection, &data->outputBuffer, (string))
#define SEARCH_SEND_INT(n)  gpiAppendIntToBuffer(connection, &data->outputBuffer, (n))

// Reads the next "\key\value" pair of the reply.
#define SEARCH_READ_PAIR()                                                              \
    do {                                                                                \
        result = gpiReadKeyAndValue(connection, data->inputBuffer.buffer, &pos, key, value); \
        if (result)                                                                     \
            return result;                                                              \
    } while (0)

#define SEARCH_PARSE_ERROR()                         \
    do {                                             \
        gpiSetError(connection, 1, sStr_ErrorReadingFromTheSearchServer); \
        gpiCallErrorCallback(connection, 3, 1);             \
        return 3;                                    \
    } while (0)

#define SEARCH_OUT_OF_MEMORY()                    \
    do {                                          \
        gpiSetErrorString(connection, sStr_OutOfMemory_10); \
        return 1;                                 \
    } while (0)

#define SEARCH_CALLBACK(callback, arg, type)                                      \
    do {                                                                          \
        result = gpiAddCallback(connection, (callback), (arg), operation, (type)); \
        if (result)                                                               \
            return result;                                                        \
    } while (0)

// "gpiProcessSearch": sends the request once connected, then handles the reply.
int gpiProcessSearch(GpConnection **connection, GpOperation *operation) {
    char key[512], value[512];
    GpProfileSearchArg profileSearch;
    int state, pos;
    GpCallback profileSearchCallback;
    int bytesRead, closed;
    GpCallback suggestCallback, othersCallback, newUserCallback, checkCallback, playersCallback, nicksCallback, isValidCallback;
    int done;
    GpConnection *iconnection = *connection;
    GpSearchData *data = operation->data;
    int loop = operation->blocking != 0, result, mark, stop;
    do {
        result = gpiSendFromBuffer(connection, data->sock, &data->outputBuffer, &closed, 1, sStr_SM);
        if (result) {
            return result;
        }
        if (operation->state == GPI_CONNECTING) {
            result = gpiCheckSocketConnect(connection, data->sock, &state);
            if (result) {
                return result;
            }
            if (state == 4) {
                gpiSetError(connection, GP_SEARCH_CONNECTION_FAILED, sStr_CouldNotConnectToTheSearchManager);
                gpiCallErrorCallback(connection, GP_SERVER_ERROR, GP_NON_FATAL);
                return GP_SERVER_ERROR;
            }
            if (state == 3) {
                if (data->type == GP_SEARCH_PROFILE) {
                    SEARCH_SEND(sKey_search);
                    SEARCH_SEND(sKey_sesskey_4);
                    SEARCH_SEND_INT(iconnection->sessKey);
                    SEARCH_SEND(sKey_profileid_4);
                    SEARCH_SEND_INT(iconnection->profileId);
                    SEARCH_SEND(sKey_namespaceid_2);
                    SEARCH_SEND_INT(iconnection->namespaceId);
                    if (data->nick[0] != 0) {
                        SEARCH_SEND(sKey_nick_4);
                        SEARCH_SEND(data->nick);
                    }
                    if (data->uniquenick[0] != 0) {
                        SEARCH_SEND(sKey_uniquenick_3);
                        SEARCH_SEND(data->uniquenick);
                    }
                    if (data->email[0] != 0) {
                        SEARCH_SEND(sKey_email_3);
                        SEARCH_SEND(data->email);
                    }
                    if (data->firstname[0] != 0) {
                        SEARCH_SEND(sKey_firstname_2);
                        SEARCH_SEND(data->firstname);
                    }
                    if (data->lastname[0] != 0) {
                        SEARCH_SEND(sKey_lastname_2);
                        SEARCH_SEND(data->lastname);
                    }
                    if (data->icquin != 0) {
                        SEARCH_SEND(sKey_icquin_2);
                        SEARCH_SEND_INT(data->icquin);
                    }
                    if (data->skip > 0) {
                        SEARCH_SEND(sKey_skip);
                        SEARCH_SEND_INT(data->skip);
                    }
                } else if (data->type == GP_SEARCH_IS_VALID) {
                    SEARCH_SEND(sKey_valid);
                    SEARCH_SEND(sKey_email_3);
                    SEARCH_SEND(data->email);
                } else if (data->type == GP_SEARCH_NICKS) {
                    SEARCH_SEND(sKey_nicks);
                    SEARCH_SEND(sKey_email_3);
                    SEARCH_SEND(data->email);
                    SEARCH_SEND(sKey_pass);
                    SEARCH_SEND(data->password);
                    SEARCH_SEND(sKey_namespaceid_2);
                    SEARCH_SEND_INT(iconnection->namespaceId);
                } else if (data->type == GP_SEARCH_PLAYERS) {
                    SEARCH_SEND(sKey_pmatch);
                    SEARCH_SEND(sKey_sesskey_4);
                    SEARCH_SEND_INT(iconnection->sessKey);
                    SEARCH_SEND(sKey_profileid_4);
                    SEARCH_SEND_INT(iconnection->profileId);
                    SEARCH_SEND(sKey_productid_2);
                    SEARCH_SEND_INT(data->productId);
                } else if (data->type == GP_SEARCH_CHECK) {
                    SEARCH_SEND(sKey_check);
                    SEARCH_SEND(sKey_nick_4);
                    SEARCH_SEND(data->nick);
                    SEARCH_SEND(sKey_email_3);
                    SEARCH_SEND(data->email);
                    SEARCH_SEND(sKey_pass);
                    SEARCH_SEND(data->password);
                } else if (data->type == GP_SEARCH_NEW_USER) {
                    SEARCH_SEND(sKey_newuser_2);
                    SEARCH_SEND(sKey_nick_4);
                    SEARCH_SEND(data->nick);
                    SEARCH_SEND(sKey_email_3);
                    SEARCH_SEND(data->email);
                    SEARCH_SEND(sKey_pass);
                    SEARCH_SEND(data->password);
                    SEARCH_SEND(sKey_productID);
                    SEARCH_SEND_INT(iconnection->productId);
                    SEARCH_SEND(sKey_namespaceid_2);
                    SEARCH_SEND_INT(iconnection->namespaceId);
                    SEARCH_SEND(sKey_uniquenick_3);
                    SEARCH_SEND(data->uniquenick);
                    if (data->cdkey[0] != 0) {
                        SEARCH_SEND(sKey_cdkey);
                        SEARCH_SEND(data->cdkey);
                    }
                } else if (data->type == GP_SEARCH_OTHERS) {
                    SEARCH_SEND(sKey_others);
                    SEARCH_SEND(sKey_sesskey_4);
                    SEARCH_SEND_INT(iconnection->sessKey);
                    SEARCH_SEND(sKey_profileid_4);
                    SEARCH_SEND_INT(iconnection->profileId);
                    SEARCH_SEND(sKey_namespaceid_2);
                    SEARCH_SEND_INT(iconnection->namespaceId);
                } else if (data->type == GP_SEARCH_SUGGEST_UNIQUE) {
                    SEARCH_SEND(sKey_uniquesearch);
                    SEARCH_SEND(sKey_preferrednick);
                    SEARCH_SEND(data->uniquenick);
                    SEARCH_SEND(sKey_namespaceid_2);
                    SEARCH_SEND_INT(iconnection->namespaceId);
                } else {
                    __msl_assertion_failed(sStr_0_5, sStr_GpiSearchC, sStr_gpiProcessSearch, 0x275);
                }
                SEARCH_SEND(sKey_gamename_2);
                SEARCH_SEND(__GSIACGamename);
                SEARCH_SEND(sKey_final_7);
                operation->state = GPI_WAITING;
            }
        } else if (operation->state == GPI_WAITING) {
            result = gpiRecvToBuffer(connection, data->sock, &data->inputBuffer, &bytesRead, &closed, sStr_SM);
            if (result) {
                if (result != 3) {
                    return result;
                }
                gpiSetError(connection, GP_SEARCH_CONNECTION_FAILED, sStr_ThereWasAnErrorReadingFromTheServer_2);
                gpiCallErrorCallback(connection, GP_NETWORK_ERROR, GP_NON_FATAL);
                return GP_NETWORK_ERROR;
            }
            if (strstr(data->inputBuffer.buffer, sKey_final_7)) {
                pos = 0;
                operation->state = GPI_FINISHING;
                if (gpiCheckForError(connection, data->inputBuffer.buffer, 1)) {
                    data->done = 1;
                    return GP_SERVER_ERROR;
                }
                if (data->type == GP_SEARCH_PROFILE) {
                    done = 0;
                    profileSearch.result = 0;
                    profileSearch.numMatches = 0;
                    profileSearch.matches = 0;
                    profileSearch.more = 0x601;
                    do {
                        SEARCH_READ_PAIR();
                        if (!strcmp(key, sStr_bsrdone)) {
                            SEARCH_READ_PAIR();
                            if (!strcmp(key, sStr_more)) {
                                if (strcmp(value, sStr_0_5)) {
                                    profileSearch.more = 0x600;
                                }
                            }
                            done = 1;
                        } else if (!strcmp(key, sStr_bsr)) {
                            GpSearchMatch *matches, *match;
                            int offset;
                            profileSearch.numMatches++;
                            matches = DWCi_GsRealloc(profileSearch.matches, profileSearch.numMatches * sizeof(GpSearchMatch));
                            profileSearch.matches = matches;
                            if (!matches) {
                                SEARCH_OUT_OF_MEMORY();
                            }
                            offset = (profileSearch.numMatches - 1) * sizeof(GpSearchMatch);
                            match = (GpSearchMatch *)((u8 *)matches + offset);
                            memset(match, 0, sizeof(GpSearchMatch));
                            *(int *)((u8 *)matches + offset) = atol(value);
                            stop = 0;
                            do {
                                mark = pos;
                                SEARCH_READ_PAIR();
                                if (!strcmp(key, sStr_nick)) {
                                    strzcpy(match->nick, value, 31);
                                } else if (!strcmp(key, sStr_uniquenick)) {
                                    strzcpy(match->uniquenick, value, 21);
                                } else if (!strcmp(key, sStr_firstname)) {
                                    strzcpy(match->firstname, value, 31);
                                } else if (!strcmp(key, sStr_lastname)) {
                                    strzcpy(match->lastname, value, 31);
                                } else if (!strcmp(key, sStr_email)) {
                                    strzcpy(match->email, value, 51);
                                } else if (!strcmp(key, sStr_bsr) || !strcmp(key, sStr_bsrdone)) {
                                    pos = mark;
                                    stop = 1;
                                }
                            } while (!stop);
                        } else {
                            SEARCH_PARSE_ERROR();
                        }
                    } while (!done);
                    profileSearchCallback = operation->callback;
                    {
                        int more = profileSearch.more;
                        if (profileSearchCallback.callback) {
                            ((void (*)(GpConnection **, void *, void *))profileSearchCallback.callback)(connection, &profileSearch, profileSearchCallback.param);
                        }
                        if (more == 0x600 && profileSearch.more == 0x600) {
                            result = gpiProfileSearch(connection, data->nick, data->uniquenick, data->email, data->firstname, data->lastname, data->icquin, profileSearch.numMatches + data->skip, operation->blocking, operation->callback.callback, operation->callback.param);
                            if (result) {
                                return result;
                            }
                        }
                    }
                    DWCi_GsFree(profileSearch.matches);
                    profileSearch.matches = 0;
                } else if (data->type == GP_SEARCH_IS_VALID) {
                    isValidCallback = operation->callback;
                    if (isValidCallback.callback) {
                        GpIsValidEmailArg *arg;
                        SEARCH_READ_PAIR();
                        if (strcmp(key, sStr_vr)) {
                            SEARCH_PARSE_ERROR();
                        }
                        arg = DWCi_GsMalloc(sizeof(GpIsValidEmailArg));
                        if (!arg) {
                            SEARCH_OUT_OF_MEMORY();
                        }
                        arg->result = 0;
                        strzcpy(arg->email, data->email, 51);
                        if (value[0] == '0') {
                            arg->isValid = 0;
                        } else {
                            arg->isValid = 1;
                        }
                        SEARCH_CALLBACK(isValidCallback, arg, GPI_ADD_NORMAL);
                    }
                } else if (data->type == GP_SEARCH_NICKS) {
                    nicksCallback = operation->callback;
                    if (nicksCallback.callback) {
                        GpNicksArg *arg = DWCi_GsMalloc(sizeof(GpNicksArg));
                        if (!arg) {
                            SEARCH_OUT_OF_MEMORY();
                        }
                        arg->result = 0;
                        strcpy(arg->email, data->email);
                        arg->numNicks = 0;
                        arg->nicks = 0;
                        arg->uniquenicks = 0;
                        SEARCH_READ_PAIR();
                        if (strcmp(key, sStr_nr)) {
                            SEARCH_PARSE_ERROR();
                        }
                        done = 0;
                        do {
                            SEARCH_READ_PAIR();
                            if (!strcmp(key, sStr_nick)) {
                                char **nicks = DWCi_GsRealloc(arg->nicks, (arg->numNicks + 1) * 4);
                                char *nick;
                                if (!nicks) {
                                    SEARCH_OUT_OF_MEMORY();
                                }
                                arg->nicks = nicks;
                                nick = DWCi_GsMalloc(31);
                                if (!nick) {
                                    SEARCH_OUT_OF_MEMORY();
                                }
                                arg->nicks[arg->numNicks] = nick;
                                strzcpy(arg->nicks[arg->numNicks], value, 31);
                                arg->numNicks++;
                            } else if (!strcmp(key, sStr_uniquenick)) {
                                if (arg->numNicks > 0) {
                                    char **uniquenicks = DWCi_GsRealloc(arg->uniquenicks, arg->numNicks * 4);
                                    char *uniquenick;
                                    if (!uniquenicks) {
                                        SEARCH_OUT_OF_MEMORY();
                                    }
                                    arg->uniquenicks = uniquenicks;
                                    uniquenick = DWCi_GsMalloc(21);
                                    if (!uniquenick) {
                                        SEARCH_OUT_OF_MEMORY();
                                    }
                                    arg->uniquenicks[arg->numNicks - 1] = uniquenick;
                                    strzcpy(arg->uniquenicks[arg->numNicks - 1], value, 21);
                                }
                            } else if (!strcmp(key, sStr_ndone)) {
                                done = 1;
                            } else {
                                SEARCH_PARSE_ERROR();
                            }
                        } while (!done);
                        SEARCH_CALLBACK(nicksCallback, arg, GPI_ADD_NICKS);
                    }
                } else if (data->type == GP_SEARCH_PLAYERS) {
                    playersCallback = operation->callback;
                    if (playersCallback.callback) {
                        GpFindPlayersArg *arg = DWCi_GsMalloc(sizeof(GpFindPlayersArg));
                        if (!arg) {
                            SEARCH_OUT_OF_MEMORY();
                        }
                        arg->productId = data->productId;
                        arg->result = 0;
                        arg->numMatches = 0;
                        arg->matches = 0;
                        done = 0;
                        do {
                            SEARCH_READ_PAIR();
                            if (!strcmp(key, sStr_psrdone)) {
                                done = 1;
                            } else if (!strcmp(key, sStr_psr)) {
                                GpPlayerMatch *matches;
                                int i;
                                arg->numMatches++;
                                matches = arg->matches = DWCi_GsRealloc(arg->matches, arg->numMatches * sizeof(GpPlayerMatch));
                                if (!matches) {
                                    SEARCH_OUT_OF_MEMORY();
                                }
                                i = arg->numMatches - 1;
                                memset(&matches[i], 0, sizeof(GpPlayerMatch));
                                matches[i].playerStatus = 1;
                                matches[i].profile = atol(value);
                                stop = 0;
                                do {
                                    mark = pos;
                                    SEARCH_READ_PAIR();
                                    if (!strcmp(key, sStr_status)) {
                                        strzcpy(matches[i].status, value, 256);
                                    } else if (!strcmp(key, sStr_nick)) {
                                        strzcpy(matches[i].nick, value, 31);
                                    }
                                    if (!strcmp(key, sStr_statuscode)) {
                                        matches[i].playerStatus = atol(value);
                                    } else if (!strcmp(key, sStr_psr) || !strcmp(key, sStr_psrdone)) {
                                        pos = mark;
                                        stop = 1;
                                    }
                                } while (!stop);
                            } else {
                                SEARCH_PARSE_ERROR();
                            }
                        } while (!done);
                        SEARCH_CALLBACK(playersCallback, arg, GPI_ADD_PMATCH);
                    }
                } else if (data->type == GP_SEARCH_CHECK) {
                    checkCallback = operation->callback;
                    if (checkCallback.callback) {
                        int code, profile;
                        GpCheckArg *arg;
                        SEARCH_READ_PAIR();
                        if (strcmp(key, sStr_cur)) {
                            SEARCH_PARSE_ERROR();
                        }
                        code = atol(value);
                        if (code) {
                            iconnection->errorCode = code;
                            profile = 0;
                        } else {
                            if (!gpiValueForKey(data->inputBuffer.buffer, sKey_pid_3, value, 512)) {
                                SEARCH_PARSE_ERROR();
                            }
                            profile = atol(value);
                        }
                        arg = DWCi_GsMalloc(sizeof(GpCheckArg));
                        if (!arg) {
                            SEARCH_OUT_OF_MEMORY();
                        }
                        arg->result = code;
                        arg->profile = profile;
                        SEARCH_CALLBACK(checkCallback, arg, GPI_ADD_NORMAL);
                    }
                } else if (data->type == GP_SEARCH_NEW_USER) {
                    newUserCallback = operation->callback;
                    if (newUserCallback.callback) {
                        int code, profile;
                        GpCheckArg *arg;
                        SEARCH_READ_PAIR();
                        if (strcmp(key, sStr_nur)) {
                            SEARCH_PARSE_ERROR();
                        }
                        code = atol(value);
                        if (code) {
                            iconnection->errorCode = code;
                        }
                        if (!gpiValueForKey(data->inputBuffer.buffer, sKey_pid_3, value, 512)) {
                            if (!code) {
                                SEARCH_PARSE_ERROR();
                            }
                            profile = 0;
                        } else {
                            profile = atol(value);
                        }
                        arg = DWCi_GsMalloc(sizeof(GpCheckArg));
                        if (!arg) {
                            SEARCH_OUT_OF_MEMORY();
                        }
                        arg->result = code;
                        arg->profile = profile;
                        SEARCH_CALLBACK(newUserCallback, arg, GPI_ADD_NORMAL);
                    }
                } else if (data->type == GP_SEARCH_OTHERS) {
                    othersCallback = operation->callback;
                    if (othersCallback.callback) {
                        GpOthersArg *arg = DWCi_GsMalloc(sizeof(GpOthersArg));
                        if (!arg) {
                            SEARCH_OUT_OF_MEMORY();
                        }
                        arg->result = 0;
                        arg->numProfiles = 0;
                        arg->profiles = 0;
                        SEARCH_READ_PAIR();
                        if (strcmp(key, sStr_others)) {
                            SEARCH_PARSE_ERROR();
                        }
                        done = 0;
                        do {
                            SEARCH_READ_PAIR();
                            if (!strcmp(key, sStr_odone)) {
                                done = 1;
                            } else if (!strcmp(key, sStr_o)) {
                                GpSearchMatch *profiles, *p;
                                int i;
                                p = DWCi_GsRealloc(arg->profiles, (arg->numProfiles + 1) * sizeof(GpSearchMatch));
                                if (!p) {
                                    SEARCH_OUT_OF_MEMORY();
                                }
                                arg->profiles = p;
                                profiles = arg->profiles;
                                i = arg->numProfiles;
                                memset(&profiles[i], 0, sizeof(GpSearchMatch));
                                arg->numProfiles++;
                                profiles[i].profile = atol(value);
                                stop = 0;
                                do {
                                    mark = pos;
                                    SEARCH_READ_PAIR();
                                    if (!strcmp(key, sStr_nick)) {
                                        strzcpy(profiles[i].nick, value, 31);
                                    } else if (!strcmp(key, sStr_uniquenick)) {
                                        strzcpy(profiles[i].uniquenick, value, 21);
                                    } else if (!strcmp(key, sStr_first)) {
                                        strzcpy(profiles[i].firstname, value, 31);
                                    } else if (!strcmp(key, sStr_last)) {
                                        strzcpy(profiles[i].lastname, value, 31);
                                    } else if (!strcmp(key, sStr_email)) {
                                        strzcpy(profiles[i].email, value, 51);
                                    } else if (!strcmp(key, sStr_o) || !strcmp(key, sStr_odone)) {
                                        pos = mark;
                                        stop = 1;
                                    }
                                } while (!stop);
                            } else {
                                SEARCH_PARSE_ERROR();
                            }
                        } while (!done);
                        SEARCH_CALLBACK(othersCallback, arg, GPI_ADD_REVERSE_BUDDIES);
                    }
                } else if (data->type == GP_SEARCH_SUGGEST_UNIQUE) {
                    suggestCallback = operation->callback;
                    if (suggestCallback.callback) {
                        int count = 0;
                        GpSuggestUniqueArg *arg = DWCi_GsMalloc(sizeof(GpSuggestUniqueArg));
                        if (!arg) {
                            SEARCH_OUT_OF_MEMORY();
                        }
                        arg->result = 0;
                        arg->numSuggestedNicks = 0;
                        arg->suggestedNicks = 0;
                        SEARCH_READ_PAIR();
                        if (strcmp(key, sStr_us)) {
                            SEARCH_PARSE_ERROR();
                        }
                        arg->numSuggestedNicks = atol(value);
                        arg->suggestedNicks = DWCi_GsMalloc(arg->numSuggestedNicks * 4);
                        if (!arg->suggestedNicks) {
                            SEARCH_OUT_OF_MEMORY();
                        }
                        done = count;
                        do {
                            SEARCH_READ_PAIR();
                            if (!strcmp(key, sStr_nick)) {
                                arg->suggestedNicks[count] = DWCi_GsMalloc(21);
                                if (!arg->suggestedNicks[count]) {
                                    SEARCH_OUT_OF_MEMORY();
                                }
                                strzcpy(arg->suggestedNicks[count], value, 21);
                                count++;
                            } else if (!strcmp(key, sStr_usdone)) {
                                if (count != arg->numSuggestedNicks) {
                                    __msl_assertion_failed(sStr_CountEqArgNumSuggestedNicks, sStr_GpiSearchC, sStr_gpiProcessSearch, 0x515);
                                }
                                arg->numSuggestedNicks = count;
                                done = 1;
                            } else {
                                SEARCH_PARSE_ERROR();
                            }
                        } while (!done);
                        SEARCH_CALLBACK(suggestCallback, arg, GPI_ADD_SUGGESTED_UNIQUE);
                    }
                } else {
                    __msl_assertion_failed(sStr_0_5, sStr_GpiSearchC, sStr_gpiProcessSearch, 0x52a);
                }
                data->done = 1;
                loop = 0;
            }
        }
        if (loop) {
            msleep(10);
        }
    } while (loop);
    return GP_NO_ERROR;
}
