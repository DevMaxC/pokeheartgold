#pragma force_active on
#include <string.h>

#include "global.h"

#include "dwc/friend_internal.h"
#include "dwc/match_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

#pragma warn_uninitializedvar off

// Matchmaking set-up: custom server keys, the "all peers ready" timer option, initialising the matchmaking
// work, starting the query/reporting record and the server browser for the three ways of starting a
// match (DWCi_ConnectToAnybodyAsync, DWCi_SetupGameServer, DWCi_ConnectToGameServerAsync), and the per-frame update with its timeouts.

// Query/reporting record created by qr2_init_socketA.
typedef struct MatchReporting {
    u8 unk_00[0xB4];
    int stateChangePending;
} MatchReporting;

extern FriendGlobal gDwcFriends;

extern const char sStr_And[]; // " and ()"
extern const char sStr_Empty_5[]; // ""

extern void *DWC_Alloc(int kind, u32 size);
extern void DWC_Free(int kind, void *p, int size);
extern int DWCi_IsError(void);
extern int DWCi_GetState(void);
extern int DWCi_SetGPStatus(int type, const char *message, int arg);
extern void DWCi_ClearSentCommand(void);
extern void DWCi_StopMatching(int kind, int code);
extern int DWCi_UpdateGameServerStatus(void);
extern void DWCi_SendMatchCommand(int command, u32 profile, u32 addr, u16 port, void *data, u32 size);
extern void gt2Think(void *peer);
extern int gt2GetLocalPort(void *peer);
extern int gt2GetSocketSOCKET(void *peer);
extern void NNFreeNegotiateList(void);
extern void NNThink(void);
extern int qr2_init_socketA(void **reporting, int a, int b, const char *gameName, const char *secretKey, int c, int d, void *cb0, void *cb1, void *cb2, void *cb3, void *cb4, void *cb5, int e);
extern void qr2_register_natneg_callback(void *reporting, void *callback);
extern void qr2_register_clientmessage_callback(void *reporting, void *callback);
extern void qr2_register_publicaddress_callback(void *reporting, void *callback);
extern void qr2_think(void *reporting);
extern void qr2_send_statechanged(void *reporting);
extern void qr2_shutdown(void *reporting);
extern void qr2_register_keyA(u32 id, const char *name);
extern void *ServerBrowserNewA(const char *gameName, const char *fromGameName, const char *secretKey, int a, int b, int c, int d, void (*callback)(void *list, int event, void *arg), int e);
extern void ServerBrowserFree(void *list);
extern void ServerBrowserThink(void *list);
extern int ServerBrowserState(void *list);

u32 DWCi_GetFriendWorkField20(void) {
    return gDwcFriends.work->unk_20;
}

void DWCi_NNFreeNegotiateList(void) {
    if (gDwcMatch.updating) {
        gDwcMatch.deferred = 1;
        return;
    }
    NNFreeNegotiateList();
}

int DWC_CancelMatching(void) {
    if (!DWC_IsValidCancelMatching()) {
        return 0;
    }
    DWCi_CancelMatching();
    return 1;
}

int DWC_IsValidCancelMatching(void) {
    if (DWCi_IsError()) {
        return 0;
    }
    if (!DWCi_GetMatchWork() || DWCi_GetState() != DWC_STATE_MATCHING || DWCi_GetMatchWork()->cancelling) {
        return 0;
    }
    return 1;
}

// Stops accepting players: right away in state 10, otherwise once DWCi_MatchProcess sees state 10.
int DWC_StopSCMatchingAsync(void (*callback)(void *param), void *param) {
    if (DWCi_IsError() || !DWCi_GetMatchWork() || DWCi_GetMatchWork()->mode != DWC_MATCH_TYPE_SC_SV || (DWCi_GetState() != DWC_STATE_MATCHING && DWCi_GetState() != DWC_STATE_CONNECTED)) {
        return 0;
    }
    if (DWCi_GetMatchWork()->state == 10) {
        DWCi_GetMatchWork()->limit = DWCi_GetMatchWork()->players;
        DWCi_UpdateGameServerStatus();
        if (callback) {
            callback(param);
        }
    } else {
        DWCi_GetMatchWork()->stopCallback = callback;
        DWCi_GetMatchWork()->stopParam = param;
        DWCi_GetMatchWork()->stopPending = 1;
    }
    return 1;
}

// Adds custom server key id (100..253, or the next free one) with the given name; returns the key id or 0.
u32 DWC_AddMatchKeyString(u32 id, const char *name, void *value) {
    u32 idx;
    if (name == NULL || value == NULL) {
        return 0;
    }
    if (id >= 100 && gDwcMatchKeys[idx = id - 100].id != 0) {
        if (gDwcMatchKeys[idx].buffer != NULL && strcmp(gDwcMatchKeys[idx].buffer, name) != 0) {
            return 0;
        }
    } else {
        id = DWCi_GetNewMatchKeyID();
        if (id == 0) {
            return 0;
        }
    }
    idx = id - 100;
    gDwcMatchKeys[idx].id = id;
    gDwcMatchKeys[idx].isString = 1;
    gDwcMatchKeys[idx].unk_02 = 0;
    if (gDwcMatchKeys[idx].buffer != NULL) {
        DWC_Free(4, gDwcMatchKeys[idx].buffer, 0);
    }
    gDwcMatchKeys[idx].buffer = DWC_Alloc(4, strlen(name) + 1);
    if (gDwcMatchKeys[idx].buffer == NULL) {
        DWCi_StopMatching(9, -80001);
        return 0;
    }
    strcpy(gDwcMatchKeys[idx].buffer, name);
    gDwcMatchKeys[idx].value = value;
    qr2_register_keyA(id, gDwcMatchKeys[idx].buffer);
    return id;
}

// Option 0: set up the "all peers ready" timer from param; option 1: *(u32 *)param sets gDwcMatch.scConnectBlock.
int DWC_SetMatchingOption(int option, MatchTimer *param) {
    if (DWCi_GetMatchWork() == NULL) {
        return 1;
    }
    if (param == NULL) {
        return 3;
    }
    switch (option) {
    case 0:
        if (DWCi_GetMatchWork()->state == 19) {
            return 1;
        }
        if (param->active && param->wanted <= 1) {
            return 3;
        }
        if (gDwcMatch.timer == NULL) {
            gDwcMatch.timer = DWC_Alloc(4, sizeof(MatchTimer));
            if (gDwcMatch.timer == NULL) {
                return 4;
            }
        }
        gDwcMatch.timer->active = param->active;
        gDwcMatch.timer->wanted = param->wanted;
        gDwcMatch.timer->retries = 0;
        gDwcMatch.timer->unk_03 = 0;
        gDwcMatch.timer->timeout = param->timeout;
        gDwcMatch.timer->mask = 0;
        gDwcMatch.timer->all = 0;
        gDwcMatch.timer->start = OS_GetTick();
        gDwcMatch.timer->last = OS_GetTick();
        return 0;
    case 1:
        if (*(u32 *)param) {
            gDwcMatch.scConnectBlock = 1;
        } else {
            gDwcMatch.scConnectBlock = 0;
        }
        gDwcMatch.scConnectBlocked = 0;
        return 0;
    default:
        return 2;
    }
}

static inline void ClearGlobalFlags(int zero, MatchGlobal *global) {
    global->scConnectBlock = zero;
    global->scConnectBlocked = zero;
    global->unk_1E = zero;
}

void DWCi_MatchInit(MatchWork *work, void *unk_00, void **peer, void *callback, const char *gameName, const char *secretKey, void *friends, u32 unk_300) {
    DWCi_SetMatchWork(work);
    DWCi_GetMatchWork()->gpConnection = unk_00;
    DWCi_GetMatchWork()->peer = peer;
    DWCi_GetMatchWork()->callback = callback;
    DWCi_GetMatchWork()->reporting = NULL;
    DWCi_GetMatchWork()->addr = 0;
    DWCi_GetMatchWork()->port = 0;
    DWCi_GetMatchWork()->list = NULL;
    DWCi_SetMatchState(0);
    DWCi_GetMatchWork()->unk_0F = 0;
    DWCi_GetMatchWork()->unk_19 = 0;
    DWCi_GetMatchWork()->unk_1AF = 0;
    DWCi_GetMatchWork()->unk_1B6 = 0;
    DWCi_GetMatchWork()->friendCheckMask = 0;
    DWCi_GetMatchWork()->identity = 0;
    DWCi_GetMatchWork()->gameName = gameName;
    DWCi_GetMatchWork()->secretKey = secretKey;
    DWCi_GetMatchWork()->friends = friends;
    DWCi_GetMatchWork()->unk_300 = unk_300;
    MI_CpuFill8(DWCi_GetMatchWork()->friendIds, 0, sizeof(DWCi_GetMatchWork()->friendIds));
    DWCi_GetMatchWork()->friendCount = 0;
    DWCi_GetMatchWork()->errorCallback = 0;
    DWCi_GetMatchWork()->errorParam = 0;
    DWCi_GetMatchWork()->evalCallback = NULL;
    DWCi_GetMatchWork()->evalParam = NULL;
    DWCi_GetMatchWork()->stopCallback = NULL;
    DWCi_GetMatchWork()->stopParam = NULL;
    DWCi_GetMatchWork()->pending = 0;
    DWCi_ClearMatchKeys();
    ClearGlobalFlags(0, &gDwcMatch);
    DWCi_ResetMatchParam(0);
}

// Creates the query/reporting record (5 tries) and sets its callbacks.
int DWCi_QR2Startup(u32 identity) {
    int i, result;
    MatchWork *work, *names;
    int ip, port;
    if (DWCi_GetMatchWork()->reporting) {
        return 0;
    }
    DWCi_GetMatchWork()->identity = identity;
    for (i = 0; i < 5; i++) {
        work = DWCi_GetMatchWork();
        ip = gt2GetSocketSOCKET(*DWCi_GetMatchWork()->peer);
        port = gt2GetLocalPort(*DWCi_GetMatchWork()->peer);
        names = DWCi_GetMatchWork();
        result = qr2_init_socketA(&work->reporting, ip, port, names->gameName, DWCi_GetMatchWork()->secretKey, 1, 1, DWCi_QR2ServerKeyCallback, DWCi_QR2PlayerKeyCallback, DWCi_QR2TeamKeyCallback, DWCi_QR2KeyListCallback, DWCi_QR2CountCallback, DWCi_QR2AddErrorCallback, 0);
        if (!result) {
            break;
        }
        qr2_shutdown(DWCi_GetMatchWork()->reporting);
        DWCi_GetMatchWork()->reporting = NULL;
        if (result != 3 || i == 4) {
            DWCi_HandleQR2Error(result);
            return result;
        }
    }
    DWCi_GetMatchWork()->addr = 0;
    DWCi_GetMatchWork()->port = 0;
    qr2_register_publicaddress_callback(DWCi_GetMatchWork()->reporting, DWCi_QR2PublicAddressCallback);
    qr2_register_natneg_callback(DWCi_GetMatchWork()->reporting, DWCi_QR2NatNegCallback);
    qr2_register_clientmessage_callback(DWCi_GetMatchWork()->reporting, DWCi_QR2ClientMessageCallback);
    qr2_send_statechanged(DWCi_GetMatchWork()->reporting);
    return result;
}

// Starts matchmaking among anybody (type 0); filter is added to the server list filter.
void DWCi_ConnectToAnybodyAsync(int count, const char *filter, void *arg2, void *arg3, int (*evalCallback)(int index, void *param), void *evalParam) {
    int size;
    char buf[256];
    MatchGlobal *global = &gDwcMatch;
    MatchWork *first, *second, *dest, *third;
    char *old = global->filter;
    if (old) {
        DWC_Free(4, old, 0);
        gDwcMatch.filter = NULL;
    }
    if (filter) {
        size = DWCi_GetDefaultMatchFilter(buf, -1, 32, 3);
        size = 256 - size - strlen(sStr_And);
        gDwcMatch.filter = DWC_Alloc(4, size);
        if (gDwcMatch.filter == NULL) {
            DWCi_StopMatching(9, -80001);
            return;
        }
        MI_CpuCopy8(filter, gDwcMatch.filter, size);
        *(gDwcMatch.filter + size - 1) = 0;
    }
    DWCi_SetMatchCommonParam(DWC_MATCH_TYPE_ANYBODY, count, arg2, arg3);
    DWCi_GetMatchWork()->evalCallback = evalCallback;
    DWCi_GetMatchWork()->evalParam = evalParam;
    DWCi_SetMatchState(2);
    if (DWCi_GetMatchWork()->list == NULL) {
        dest = DWCi_GetMatchWork();
        first = DWCi_GetMatchWork();
        second = DWCi_GetMatchWork();
        third = DWCi_GetMatchWork();
        dest->list = ServerBrowserNewA(first->gameName, second->gameName, third->secretKey, 0, 20, 1, 0, DWCi_SBCallback, 0);
    }
    if (DWCi_GetMatchWork()->list == NULL) {
        if (DWCi_HandleSBError(5) != 0) {
            return;
        }
    }
    DWCi_SetGPStatus(DWC_STATUS_MATCH_ANYBODY, sStr_Empty_5, 0);
    if (DWCi_HandleSBError(DWCi_UpdateServerListAsync(DWCi_GetMatchWork()->identity)) != 0) {
        return;
    }
    if (DWCi_GetMatchWork()->reporting == NULL) {
        DWCi_QR2Startup(DWCi_GetMatchWork()->identity);
    }
    DWCi_ResetMinCompleteTimer(0);
}

// Starts matchmaking as the server (type 2).
void DWCi_SetupGameServer(int count, void *arg1, void *arg2, void *callback, void *param) {
    DWCi_SetMatchCommonParam(DWC_MATCH_TYPE_SC_SV, count, arg1, arg2);
    DWCi_GetMatchWork()->newPeerCallback = callback;
    DWCi_GetMatchWork()->newPeerParam = param;
    DWCi_GetMatchWork()->profiles[0] = DWCi_GetMatchWork()->identity;
    DWCi_GetMatchWork()->aidMask = 1;
    DWCi_GetMatchWork()->aidCount = 0;
    gDwcMatch.scConnectBlocked = 0;
    DWCi_SetMatchState(10);
    if (DWCi_HandleGPError(DWCi_UpdateGameServerStatus())) {
        return;
    }
    if (DWCi_GetMatchWork()->reporting) {
        return;
    }
    DWCi_QR2Startup(DWCi_GetMatchWork()->identity);
}

// Starts matchmaking as a client of the server with the given profile id (type 3).
void DWCi_ConnectToGameServerAsync(int profile, void *arg1, void *arg2, void *callback, void *param) {
    MatchWork *work, *first, *second, *third;
    DWCi_SetMatchCommonParam(DWC_MATCH_TYPE_SC_CL, 0, arg1, arg2);
    DWCi_GetMatchWork()->newPeerCallback = callback;
    DWCi_GetMatchWork()->newPeerParam = param;
    DWCi_GetMatchWork()->newPeerPending = 1;
    work = DWCi_GetMatchWork();
    work->newPeerProfile = DWCi_GetMatchWork()->identity;
    DWCi_GetMatchWork()->profiles[0] = profile;
    DWCi_SetMatchState(4);
    if (DWCi_GetMatchWork()->list == NULL) {
        work = DWCi_GetMatchWork();
        first = DWCi_GetMatchWork();
        second = DWCi_GetMatchWork();
        third = DWCi_GetMatchWork();
        work->list = ServerBrowserNewA(first->gameName, second->gameName, third->secretKey, 0, 20, 1, 0, DWCi_SBCallback, 0);
    }
    if (DWCi_GetMatchWork()->list == NULL) {
        if (DWCi_HandleSBError(5)) {
            return;
        }
    }
    if (DWCi_HandleGPError(DWCi_SetGPStatus(DWC_STATUS_MATCH_SC_CL, sStr_Empty_5, 0))) {
        return;
    }
    if (DWCi_GetMatchWork()->reporting == NULL) {
        if (DWCi_QR2Startup(DWCi_GetMatchWork()->identity)) {
            return;
        }
    }
    DWCi_SendReservationRequest(DWCi_GetMatchWork()->profiles[0], 0);
    if (DWCi_HandleMatchCommandError()) {
        return;
    }
}

void DWCi_QR2Think(void *reporting) {
    int mode;
    if (!reporting) {
        return;
    }
    qr2_think(reporting);
    if (((MatchReporting *)reporting)->stateChangePending) {
        return;
    }
    mode = DWCi_GetMatchWork()->mode;
    switch (mode) {
    case DWC_MATCH_TYPE_ANYBODY:
    case DWC_MATCH_TYPE_FRIEND:
        switch (DWCi_GetMatchWork()->state) {
        case 1:
        case 2:
        case 3:
        case 4:
        case 6:
        case 11:
            qr2_send_statechanged(DWCi_GetMatchWork()->reporting);
            break;
        }
        break;
    case DWC_MATCH_TYPE_SC_SV:
        if (DWCi_GetMatchWork()->state == 11) {
            qr2_send_statechanged(DWCi_GetMatchWork()->reporting);
        }
        break;
    }
}

// Per-frame matchmaking update: state timeouts and command retries, the server list and the query/reporting
// record, then the deferred stop of DWC_StopSCMatchingAsync.
void DWCi_MatchProcess(BOOL active) {
    if (!DWCi_GetMatchWork()) {
        return;
    }
    if (DWCi_IsError()) {
        return;
    }
    if (!active) {
        if (DWCi_GetMatchWork()->reporting) {
            qr2_think(DWCi_GetMatchWork()->reporting);
        }
        if (!DWCi_GetMatchWork()->peer) {
            return;
        }
        gt2Think(*DWCi_GetMatchWork()->peer);
        return;
    }
    if (!DWCi_GetMatchWork()->state) {
        return;
    }
    switch (DWCi_GetMatchWork()->state) {
    case 0:
    case 6:
    case 8:
    case 9:
    case 10:
    case 12:
        break;
    case 4:
        if (DWCi_GetMatchWork()->delay) {
            u64 now = OS_GetTick();
            MatchWork *stamp = DWCi_GetMatchWork();
            MatchWork *limit = DWCi_GetMatchWork();
            if (TICKS_TO_MS(now - stamp->time) > limit->delay) {
                DWCi_GetMatchWork()->delay = 0;
                if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_CL) {
                    DWCi_GetMatchWork()->reservationRetries++;
                    if (DWCi_GetMatchWork()->reservationRetries > 5) {
                        DWCi_StopMatching(6, -80430);
                        return;
                    }
                    DWCi_SendReservationRequest(DWCi_GetMatchWork()->profiles[0], 0);
                    if (DWCi_HandleMatchCommandError()) {
                        return;
                    }
                } else if (!DWCi_RestartMatchSearch(0)) {
                    return;
                }
            }
        }
        if (DWCi_GetMatchWork()->active) {
            u32 limit = 3000 * DWCi_GetMatchWork()->players + 3000;
            u64 now = OS_GetTick();
            if (TICKS_TO_MS(now - DWCi_GetMatchWork()->activeTick) >= limit) {
                DWCi_SendReservationRequest(DWCi_GetMatchWork()->profiles[0], 0);
                if (DWCi_HandleMatchCommandError()) {
                    return;
                }
            }
        }
        break;
    case 2:
    case 3:
    case 5:
        if (DWCi_GetMatchWork()->searchWait > 0) {
            u32 limit;
            u64 now;
            if (DWCi_GetMatchWork()->state == 3) {
                limit = 3000 * DWCi_GetMatchWork()->players + 3000;
            } else {
                limit = DWCi_GetMatchWork()->searchWait == 1 ? 1000 : 3000;
            }
            now = OS_GetTick();
            if (TICKS_TO_MS(now - DWCi_GetMatchWork()->searchWaitTick) > limit) {
                if (DWCi_HandleSBError(DWCi_UpdateServerListAsync(DWCi_GetMatchWork()->target))) {
                    return;
                }
                DWCi_GetMatchWork()->searchWait = 0;
            }
        }
        break;
    case 7:
        if (DWCi_GetMatchWork()->waitTick) {
            u64 now = OS_GetTick();
            if (TICKS_TO_MS(now - DWCi_GetMatchWork()->waitTick) > 25000) {
                DWCi_GetMatchWork()->waitTick = 0;
                if (!DWCi_HandleReservationRefused(DWCi_GetMatchWork()->profiles[0])) {
                    return;
                }
            }
        } else if (DWCi_GetMatchWork()->sentCommand == 6) {
            u64 now = OS_GetTick();
            if (TICKS_TO_MS(now - DWCi_GetMatchWork()->commandTick) > 6000) {
                DWCi_GetMatchWork()->commandRetries++;
                if (DWCi_GetMatchWork()->commandRetries > 5) {
                    DWCi_ClearSentCommand();
                    if (!DWCi_HandleReservationRefused(DWCi_GetMatchWork()->profiles[0])) {
                        return;
                    }
                } else {
                    DWCi_SendMatchCommand(6, DWCi_GetMatchWork()->commandProfile, DWCi_GetMatchWork()->commandAddr, DWCi_GetMatchWork()->commandPort, DWCi_GetMatchWork()->commandData, DWCi_GetMatchWork()->commandSize);
                    if (DWCi_HandleMatchCommandError()) {
                        return;
                    }
                }
            }
        }
        break;
    case 11:
        if (DWCi_GetMatchWork()->sentCommand == 2) {
            if (!DWCi_GetMatchWork()->mode) {
                u64 now = OS_GetTick();
                if (TICKS_TO_MS(now - DWCi_GetMatchWork()->commandTick) > 6000) {
                    goto expired;
                }
            }
            if (DWCi_GetMatchWork()->mode) {
                u64 now = OS_GetTick();
                if (TICKS_TO_MS(now - DWCi_GetMatchWork()->commandTick) > 19000) {
expired:
                    DWCi_ClearSentCommand();
                    if (!DWCi_DropConnectingPeer(DWCi_GetMatchWork()->profiles[DWCi_GetMatchWork()->players + 1])) {
                        return;
                    }
                }
            }
        }
        break;
    case 13:
        if (DWCi_GetMatchWork()->sentCommand == 8) {
            u64 now = OS_GetTick();
            if (TICKS_TO_MS(now - DWCi_GetMatchWork()->commandTick) > 30000) {
                DWCi_GetMatchWork()->commandRetries++;
                if (DWCi_GetMatchWork()->commandRetries) {
                    DWCi_ClearSentCommand();
                    if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_SV) {
                        if (!DWCi_DropConnectingPeer(DWCi_GetMatchWork()->profiles[DWCi_GetMatchWork()->players])) {
                            return;
                        }
                    } else {
                        DWCi_ClientRestartMatching();
                    }
                } else {
                    DWCi_SendMatchCommand(8, DWCi_GetMatchWork()->commandProfile, DWCi_GetMatchWork()->commandAddr, DWCi_GetMatchWork()->commandPort, DWCi_GetMatchWork()->commandData, DWCi_GetMatchWork()->commandSize);
                    if (DWCi_HandleMatchCommandError()) {
                        return;
                    }
                }
            }
        }
        break;
    case 1:
        if (DWCi_GetState() == DWC_STATE_MATCHING) {
            u64 now = OS_GetTick();
            if (TICKS_TO_MS(now - DWCi_GetMatchWork()->serverPollTick) > 30000) {
                if (DWCi_GetMatchWork()->serverPollCount >= 5) {
                    if (!DWCi_HandleReservationRefused(DWCi_GetMatchWork()->profiles[0])) {
                        return;
                    }
                } else {
                    DWCi_SendMatchCommand(64, DWCi_GetMatchWork()->profiles[0], DWCi_GetMatchWork()->addresses[0], DWCi_GetMatchWork()->ports[0], NULL, 0);
                    if (DWCi_HandleMatchCommandError()) {
                        return;
                    }
                    DWCi_GetMatchWork()->serverPollCount++;
                    DWCi_GetMatchWork()->serverPollTick = OS_GetTick() - 12567750; // 24 s back: the next try comes 6 s later
                }
            }
        }
        break;
    }
    if (DWCi_GetMatchWork()->state == 11 || DWCi_GetMatchWork()->state == 6) {
        if (DWCi_GetMatchWork()->retryTick) {
            u64 now = OS_GetTick();
            if (TICKS_TO_MS(now - DWCi_GetMatchWork()->retryTick) > 10000) {
                DWCi_NNCompletedCallback(1, 0, NULL, &DWCi_GetMatchWork()->request);
            }
        }
    }
    if (DWCi_GetMatchWork()->list) {
        gDwcMatch.busy = 0;
        gDwcMatch.freeBrowser = 0;
        ServerBrowserThink(DWCi_GetMatchWork()->list);
        if (gDwcMatch.freeBrowser) {
            ServerBrowserFree(DWCi_GetMatchWork()->list);
            DWCi_GetMatchWork()->list = NULL;
        }
        if (DWCi_GetMatchWork()->list && ServerBrowserState(DWCi_GetMatchWork()->list) && DWCi_GetMatchWork()->pending) {
            u64 now = OS_GetTick();
            if (now > DWCi_GetMatchWork()->pending) {
                DWCi_StopMatching(6, -85010);
            }
        }
    }
    DWCi_QR2Think(DWCi_GetMatchWork()->reporting);
    gDwcMatch.deferred = 0;
    gDwcMatch.updating = 1;
    NNThink();
    gDwcMatch.updating = 0;
    if (gDwcMatch.deferred == 1) {
        gDwcMatch.deferred = 0;
        NNFreeNegotiateList();
    }
    if (DWCi_GetMatchWork()->peer) {
        gt2Think(*DWCi_GetMatchWork()->peer);
    }
    if (DWCi_GetMatchWork()->state == 18) {
        u64 now = OS_GetTick();
        if (TICKS_TO_MS(now - DWCi_GetMatchWork()->restartWaitTick) > 3000 && DWCi_RestartWithPendingServer()) {
            return;
        }
    }
    if (!DWCi_ProcessMatchSynTimeout()) {
        return;
    }
    if (!DWCi_ProcessCloseTimeout()) {
        return;
    }
    DWCi_ProcessMinComplete();
    if (!DWCi_GetMatchWork()->stopPending) {
        return;
    }
    if (DWCi_GetMatchWork()->state != 10) {
        return;
    }
    DWCi_GetMatchWork()->limit = DWCi_GetMatchWork()->players;
    DWCi_UpdateGameServerStatus();
    DWCi_GetMatchWork()->stopPending = 0;
    if (!DWCi_GetMatchWork()->stopCallback) {
        return;
    }
    DWCi_GetMatchWork()->stopCallback(DWCi_GetMatchWork()->stopParam);
}
