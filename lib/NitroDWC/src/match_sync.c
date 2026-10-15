#pragma force_active on
#include "global.h"

#include "dwc/match_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

#pragma warn_uninitializedvar off

// Finishing and closing a match: the join state machine after a peer was added, cancelling the matchmaking,
// restarting it, closing the peer connections, the aid messages of the "all peers ready" exchange and the
// close exchange of the server (commands 13 to 15).

extern const char sStr_Empty_5[]; // ""

extern void DWC_CloseConnectionHard(int index);
extern int DWCi_GetState(void);
extern void **DWCi_GetGT2ConnectionByProfileID(int profile, int aid);
extern int DWCi_GetFriendListIndex(int profile);
extern int DWCi_SetGPStatus(int type, const void *message, int arg);
extern int DWCi_SendMatchCommand(int command, u32 profile, u32 addr, u32 port, u32 *data, int count);
extern int DWCi_IsFriendProfile(int profile);
extern int DWCi_GetAidFromProfile(int profile, int first);
extern u32 DWCi_GetPeerAidBitmap(int flag);
extern void DWCi_ResetMatchRetryTimer(void);
extern int DWCi_SendReliable(int flag, int aid, const void *p, int n);
extern void gt2CloseConnectionHard(void *connection);
extern void gt2CloseAllConnectionsHard(void *connection);
extern void NNCancel(void *p);
extern void qr2_send_statechanged(void *reporting);
extern void ServerBrowserFree(void *list);
extern void ServerBrowserClear(void *list);

// The connection to the server (profile) was refused: a client looks for another match.
int DWCi_HandleReservationRefused(int profile) {
    int result = 1;
    MatchWork *w;
    if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_CL) {
        if (DWCi_GetMatchWork()->players) {
            DWCi_CloseAllConnectionsHard();
        }
        DWCi_StopMatching(6, -80430);
        return 0;
    }
    w = DWCi_GetMatchWork();
    w->connections = DWCi_GetMatchWork()->players;
    DWCi_GetMatchWork()->nextServerProfile = 0;
    if (DWCi_GetMatchWork()->request.active) {
        NNCancel((void *)DWCi_GetMatchWork()->request.active);
        DWCi_GetMatchWork()->request.active = 0;
    }
    if (DWCi_GetMatchWork()->players) {
        DWCi_ClientRestartMatching();
    } else {
        DWCi_SetMatchState(4);
        result = DWCi_RestartMatchSearch(0);
    }
    return result;
}

// Sends the profiles of the server's peers (command 10) to every peer and closes the connection to the server.
int DWCi_SendServerPeerProfiles(void) {
    int i = 1, result;
    while (i <= DWCi_GetMatchWork()->players) {
        MatchWork *a = DWCi_GetMatchWork(), *b = DWCi_GetMatchWork(), *c = DWCi_GetMatchWork(), *d = DWCi_GetMatchWork(), *e = DWCi_GetMatchWork();
        result = DWCi_SendMatchCommand(10, a->profiles[i], b->addresses[i], c->ports[i], &d->serverPeerCount, e->serverPeerCount + 1);
        if (result) {
            return result;
        }
        i++;
    }
    DWCi_GetMatchWork()->newPeerPending = 0;
    DWCi_GetMatchWork()->newPeerProfile = 0;
    DWCi_GetMatchWork()->closeState = 1;
    gt2CloseAllConnectionsHard(*DWCi_GetMatchWork()->peer);
    DWCi_GetMatchWork()->closeState = 0;
    return 0;
}

// Next step of the join: 0 = tell the next peer about the new one (command 8) or finish, 1-3 = the new peer
// is connected, 4 = the match is complete.
void DWCi_AdvanceJoin(unsigned action) {
    int count = 3, notify = 0;
    u32 message[5];
    int i;
    switch (action) {
    case 0:
        if (DWCi_GetMatchWork()->initial < DWCi_GetMatchWork()->players - 1) {
            DWCi_SetMatchState(13);
            message[0] = DWCi_GetMatchWork()->profiles[DWCi_GetMatchWork()->initial + 1];
            message[1] = DWCi_GetMatchWork()->initial + 1;
            message[2] = DWCi_GetMatchWork()->aids[DWCi_GetMatchWork()->initial + 1];
            message[3] = DWCi_GetMatchWork()->addresses[DWCi_GetMatchWork()->initial + 1];
            message[4] = DWCi_GetMatchWork()->ports[DWCi_GetMatchWork()->initial + 1];
            count = 5;
        } else {
            DWCi_GetMatchWork()->newPeerPending = 0;
            DWCi_GetMatchWork()->newPeerProfile = 0;
            qr2_send_statechanged(DWCi_GetMatchWork()->reporting);
            if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_ANYBODY) {
                DWCi_SetMatchState(count);
            } else if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_FRIEND) {
                DWCi_SetMatchState(4);
            } else {
                DWCi_SetMatchState(10);
            }
            DWCi_GetMatchWork()->initial = 0;
            if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_SV || DWCi_GetMatchWork()->players == DWCi_GetMatchWork()->limit) {
                if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_SV) {
                    MatchWork *w = DWCi_GetMatchWork();
                    w->eventPeerProfile = DWCi_GetMatchWork()->profiles[DWCi_GetMatchWork()->players];
                } else {
                    DWCi_GetMatchWork()->eventPeerProfile = 0;
                    DWCi_GetMatchWork()->profiles[0] = DWCi_GetMatchWork()->identity;
                }
                DWCi_SetMatchState(16);
                DWCi_GetMatchWork()->readyMask = 0;
                for (i = 1; i <= DWCi_GetMatchWork()->players; i++) {
                    DWCi_SendMatchSynPacket(DWCi_GetMatchWork()->aids[i], 2);
                }
            } else {
                message[0] = 0;
                message[1] = DWCi_GetMatchWork()->players;
                message[2] = DWCi_GetMatchWork()->aids[DWCi_GetMatchWork()->players];
                if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_ANYBODY) {
                    DWCi_GetMatchWork()->searchWait = 2;
                    DWCi_GetMatchWork()->searchWaitTick = OS_GetTick();
                } else if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_FRIEND) {
                    DWCi_SendReservationToNextFriend(1, 0, 0);
                    if (!DWCi_GetMatchWork()->unk_1A6 && DWCi_GetMatchWork()->players >= 2) {
                        {
                            MatchWork *w = DWCi_GetMatchWork();
                            u32 mask = DWCi_GetPeerAidBitmap(0);
                            MatchWork *v = DWCi_GetMatchWork();
                            if (w->friendCheckMask != (mask & ~(1 << v->aids[DWCi_GetMatchWork()->players]))) {
                                DWCi_ClientRestartMatching();
                                goto done;
                            }
                        }
                    }
                }
            }
            if (DWCi_GetMatchWork()->mode != DWC_MATCH_TYPE_SC_SV) {
                notify = 1;
            }
        }
        if (DWCi_GetMatchWork()->state == 16) {
            break;
        }
        if (DWCi_HandleMatchCommandError(DWCi_SendMatchCommand(8, DWCi_GetMatchWork()->profiles[DWCi_GetMatchWork()->players], DWCi_GetMatchWork()->addresses[DWCi_GetMatchWork()->players], DWCi_GetMatchWork()->ports[DWCi_GetMatchWork()->players], message, count))) {
            return;
        }
        DWCi_GetMatchWork()->commandRetries = 0;
        break;
    case 1:
        DWCi_SetMatchState(1);
        if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_CL) {
            DWCi_GetMatchWork()->eventPeerProfile = DWCi_GetMatchWork()->profiles[DWCi_GetMatchWork()->players];
        }
        notify = 1;
        break;
    case 2:
        DWCi_SetMatchState(1);
        if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_ANYBODY || DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_FRIEND) {
            DWCi_GetMatchWork()->newPeerPending = 1;
            DWCi_GetMatchWork()->newPeerProfile = DWCi_GetMatchWork()->identity;
        }
        DWCi_ResetMatchRetryTimer();
        if (DWCi_GetMatchWork()->players > 1) {
            if (DWCi_HandleMatchCommandError(DWCi_SendMatchCommand(9, DWCi_GetMatchWork()->profiles[0], DWCi_GetMatchWork()->addresses[0], DWCi_GetMatchWork()->ports[0], (u32 *)&DWCi_GetMatchWork()->profiles[DWCi_GetMatchWork()->players - 1], 1))) {
                return;
            }
        }
        break;
    case 3:
        DWCi_SetMatchState(1);
        DWCi_ResetMatchRetryTimer();
        DWCi_GetMatchWork()->eventPeerProfile = 0;
        notify = 1;
        break;
    case 4: {
        int noProfile, friendIndex;
        MatchWork *w;
        if (DWCi_GetMatchWork()->mode != DWC_MATCH_TYPE_SC_SV) {
            DWCi_SetGPStatus(DWC_STATUS_PLAYING, sStr_Empty_5, notify);
        }
        noProfile = DWCi_GetMatchWork()->eventPeerProfile == 0;
        w = DWCi_GetMatchWork();
        friendIndex = DWCi_GetFriendListIndex(DWCi_GetMatchWork()->eventPeerProfile);
        w->errorCallback(0, 0, noProfile, 0, friendIndex, DWCi_GetMatchWork()->errorParam);
        if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_ANYBODY || DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_FRIEND) {
            DWCi_CloseMatching();
        } else {
            if (DWCi_GetMatchWork()->list) {
                ServerBrowserFree(DWCi_GetMatchWork()->list);
                DWCi_GetMatchWork()->list = NULL;
            }
            DWCi_NNFreeNegotiateList();
            if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_SV) {
                if (DWCi_HandleGPError(DWCi_UpdateGameServerStatus())) {
                    return;
                }
                if (gDwcMatch.scConnectBlock == 1) {
                    gDwcMatch.scConnectBlocked = 1;
                }
                DWCi_SetMatchState(10);
            } else {
                DWCi_SetMatchState(1);
            }
            DWCi_GetMatchWork()->eventPeerProfile = 0;
        }
        DWCi_GetMatchWork()->cancelling = 0;
        break;
    }
    }
done:
    if (notify && DWCi_GetMatchWork()->mode != DWC_MATCH_TYPE_SC_CL) {
        ServerBrowserClear(DWCi_GetMatchWork()->list);
    }
}

// Checks that every profile is a friend (or a friend of a friend) we may play with.
int DWCi_CheckFriendProfiles(int *profiles, u32 count) {
    u32 i;
    if (DWCi_GetMatchWork()->unk_1A6 && DWCi_GetMatchWork()->state == 4) {
        return 1;
    }
    for (i = 0; i < count; i++) {
        if (!DWCi_IsFriendProfile(profiles[i])) {
            return 0;
        }
        if (DWCi_GetMatchWork()->unk_1A6 && DWCi_GetMatchWork()->state == 1) {
            return 1;
        }
    }
    return 1;
}

// Cancels the matchmaking.
void DWCi_CancelMatching(void) {
    DWCi_GetMatchWork()->eventPeerProfile = 0;
    if (DWCi_GetMatchWork()->state == 2) {
        DWCi_FinishCancelMatching();
        return;
    }
    DWCi_GetMatchWork()->cancelling = 1;
    if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_CL) {
        DWCi_GetMatchWork()->cancelling = 1;
        if (DWCi_GetMatchWork()->players) {
            gt2CloseAllConnectionsHard(*DWCi_GetMatchWork()->peer);
        } else if (DWCi_HandleMatchCommandError(DWCi_CancelReservation(DWCi_GetMatchWork()->profiles[0]))) {
            return;
        }
        DWCi_FinishCancelMatching();
        return;
    }
    if (DWCi_GetMatchWork()->state == 4 || DWCi_GetMatchWork()->state == 5 || DWCi_GetMatchWork()->state == 6 || DWCi_GetMatchWork()->state == 7 || DWCi_GetMatchWork()->state == 11 || DWCi_GetMatchWork()->state == 12) {
        if (DWCi_GetMatchWork()->target && DWCi_HandleMatchCommandError(DWCi_CancelReservation(DWCi_GetMatchWork()->profiles[0]))) {
            return;
        }
        if (DWCi_HandleMatchCommandError(DWCi_SendLeaveToServer())) {
            return;
        }
    }
    if (DWCi_GetMatchWork()->request.active) {
        NNCancel((void *)DWCi_GetMatchWork()->request.active);
        DWCi_GetMatchWork()->request.active = 0;
    }
    if (DWCi_GetMatchWork()->players) {
        DWCi_GetMatchWork()->cancelling = 1;
        gt2CloseAllConnectionsHard(*DWCi_GetMatchWork()->peer);
    }
    DWCi_FinishCancelMatching();
}

void DWCi_FinishCancelMatching(void) {
    int isServer, noProfile, friendIndex;
    MatchWork *w;
    if (DWCi_HandleGPError(DWCi_SetGPStatus(DWC_STATUS_ONLINE, sStr_Empty_5, 0))) {
        return;
    }
    DWCi_CloseMatching();
    if (DWCi_GetMatchWork()->eventPeerProfile) {
        isServer = 1;
    } else {
        isServer = DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_SV;
    }
    noProfile = DWCi_GetMatchWork()->eventPeerProfile == 0;
    w = DWCi_GetMatchWork();
    friendIndex = DWCi_GetFriendListIndex(DWCi_GetMatchWork()->eventPeerProfile);
    {
        MatchWork *v = DWCi_GetMatchWork();
        w->errorCallback(0, 1, noProfile, isServer, friendIndex, v->errorParam);
    }
    DWCi_GetMatchWork()->cancelling = 0;
}

// Tells the server we are connected to that we leave (command 12).
int DWCi_SendLeaveToServer(void) {
    int result = 0, zero = 0;
    if (DWCi_GetMatchWork()->newPeerPending && DWCi_GetMatchWork()->newPeerProfile) {
        MatchWork *w = DWCi_GetMatchWork();
        if (w->newPeerProfile != DWCi_GetMatchWork()->identity) {
            MatchWork *a = DWCi_GetMatchWork(), *b = DWCi_GetMatchWork(), *c = DWCi_GetMatchWork(), *d = DWCi_GetMatchWork();
            result = DWCi_SendMatchCommand(12, a->newPeerProfile, b->addresses[c->players + 1], d->ports[DWCi_GetMatchWork()->players + 1], (u32 *)&zero, 1);
            DWCi_GetMatchWork()->newPeerPending = 0;
            DWCi_GetMatchWork()->newPeerProfile = 0;
        }
    }
    return result;
}

// Restarts the matchmaking (mode 0: report the end to the error callback instead).
void DWCi_RestartMatching(int mode) {
    if (!mode) {
        DWCi_FinishCancelMatching();
        return;
    }
    DWCi_ResetMatchParam(mode);
    if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_SV || DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_CL) {
        int noProfile = DWCi_GetMatchWork()->eventPeerProfile == 0;
        MatchWork *w = DWCi_GetMatchWork();
        int friendIndex = DWCi_GetFriendListIndex(DWCi_GetMatchWork()->eventPeerProfile);
        w->errorCallback(0, 1, noProfile, 0, friendIndex, DWCi_GetMatchWork()->errorParam);
        return;
    }
    if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_ANYBODY) {
        if (mode == 1) {
            if (DWCi_HandleSBError(DWCi_UpdateServerListAsync(0))) {
                return;
            }
        }
    } else if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_FRIEND && mode == 1) {
        DWCi_SendReservationToNextFriend(0, 0, 0);
    }
}

void DWCi_ClientRestartMatching(void) {
    if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_SV) {
        return;
    }
    if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_CL) {
        return;
    }
    DWCi_CloseAllConnectionsHard();
    DWCi_RestartMatching(1);
}

int DWCi_RestartWithPendingServer(void) {
    int result;
    DWCi_GetMatchWork()->newPeerPending = 0;
    DWCi_GetMatchWork()->newPeerProfile = 0;
    DWCi_GetMatchWork()->closeState = 0;
    if (DWCi_GetMatchWork()->nextServerProfile) {
        if (!DWCi_GetMatchWork()->mode) {
            DWCi_SetMatchState(3);
            result = DWCi_UpdateServerListAsync(0);
            if (DWCi_HandleSBError(result)) {
                return result;
            }
        } else if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_FRIEND) {
            DWCi_SetMatchState(4);
            result = DWCi_SendReservationRequest(DWCi_GetMatchWork()->nextServerProfile, 0);
            if (DWCi_HandleMatchCommandError(result)) {
                return result;
            }
        }
    } else {
        DWCi_RestartMatching(1);
    }
    return 0;
}

// Closes the connection to profile if it is open, otherwise drops it from the peers.
int DWCi_CloseConnectionToProfile(int profile) {
    void **connection;
    DWCi_GetMatchWork()->eventPeerProfile = profile;
    connection = DWCi_GetGT2ConnectionByProfileID(profile, DWCi_GetMatchWork()->players + 1);
    if (connection) {
        DWCi_GetMatchWork()->closeState = 2;
        gt2CloseConnectionHard(*connection);
        DWCi_GetMatchWork()->closeState = 0;
        return 1;
    }
    DWCi_DeleteHostByProfileID(profile, DWCi_GetMatchWork()->players + 1);
    return 0;
}

void DWCi_CloseAllConnectionsHard(void) {
    DWCi_GetMatchWork()->closeState = 2;
    gt2CloseAllConnectionsHard(*DWCi_GetMatchWork()->peer);
    DWCi_GetMatchWork()->closeState = 0;
}

// Keeps the peers whose aid is in mask: they get the profiles of the others (command 16), which are dropped.
int DWCi_KeepPeersInAidMask(u32 mask) {
    u32 dropped[32], kept[32];
    int numDropped = 0, numKept = numDropped, i = 1;
    for (; i <= DWCi_GetMatchWork()->players; i++) {
        if (mask & (1 << DWCi_GetMatchWork()->aids[i])) {
            kept[numKept] = DWCi_GetMatchWork()->profiles[i];
            numKept++;
        } else {
            dropped[numDropped] = DWCi_GetMatchWork()->profiles[i];
            numDropped++;
        }
    }
    for (i = 0; i < numKept; i++) {
        if (DWCi_HandleMatchCommandError(DWCi_SendMatchCommand(16, kept[i], 0, 0, dropped, numDropped))) {
            return 0;
        }
    }
    DWCi_GetMatchWork()->closeState = 2;
    for (i = 0; i < numDropped; i++) {
        int index = DWCi_GetAidFromProfile(dropped[i], 0);
        if (index != 255) {
            DWC_CloseConnectionHard(index);
        }
    }
    DWCi_GetMatchWork()->closeState = 0;
    return 1;
}

// Sends an aid message to aid: 2 = its place in the peer list, 3 = our largest receive size.
void DWCi_SendMatchSynPacket(int aid, int message) {
    u8 data[4];
    switch (message) {
    case 2: {
        MatchWork *w = DWCi_GetMatchWork();
        u8 i;
        if (aid == w->aids[DWCi_GetMatchWork()->players]) {
            data[0] = 1;
        } else {
            data[0] = 0;
        }
        for (i = 1; i <= DWCi_GetMatchWork()->players; i++) {
            if (aid == DWCi_GetMatchWork()->aids[i]) {
                data[1] = i;
                data[2] = aid;
                break;
            }
        }
        break;
    }
    case 3: {
        data[0] = DWCi_GetMatchWork()->maxSize;
        data[1] = DWCi_GetMatchWork()->maxSize >> 8;
        break;
    }
    default:
        break;
    }
    DWCi_SendReliable(message, aid, data, 4);
    {
        MatchWork *w = DWCi_GetMatchWork();
        w->readyTick = OS_GetTick();
    }
}

// Resends the aid messages of the "all peers ready" exchange every 6 seconds; returns 0 when the matchmaking
// was aborted.
int DWCi_ProcessMatchSynTimeout(void) {
    u64 elapsed;
    if (DWCi_GetMatchWork()->state == 9 || DWCi_GetMatchWork()->state == 16 || DWCi_GetMatchWork()->state == 17) {
        u64 now = OS_GetTick();
        elapsed = TICKS_TO_MS(now - DWCi_GetMatchWork()->readyTick);
    } else {
        return 1;
    }
    switch (DWCi_GetMatchWork()->state) {
    case 9:
        if (elapsed > 6000) {
            if (DWCi_GetState() == DWC_STATE_MATCHING && DWCi_GetMatchWork()->serverPollCount >= 5) {
                if (!DWCi_HandleReservationRefused(DWCi_GetMatchWork()->profiles[0])) {
                    return 0;
                }
            } else {
                DWCi_GetMatchWork()->serverPollCount++;
                DWCi_SendMatchSynPacket(DWCi_GetMatchWork()->aids[0], 3);
            }
        }
        break;
    case 16:
        if (elapsed > 6000) {
            DWCi_GetMatchWork()->readyRetries++;
            if (DWCi_GetMatchWork()->readyRetries > 5) {
                if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_ANYBODY || DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_FRIEND) {
                    DWCi_CloseAllConnectionsHard();
                    DWCi_RestartMatching(1);
                } else {
                    if (!DWCi_KeepPeersInAidMask(DWCi_GetMatchWork()->readyMask)) {
                        return 0;
                    }
                    if (DWCi_GetMatchWork()->players) {
                        MatchWork *w;
                        DWCi_GetMatchWork()->readyRetries = 0;
                        w = DWCi_GetMatchWork();
                        w->readyTick = OS_GetTick();
                    } else if (!DWCi_DropConnectingPeer(DWCi_GetMatchWork()->eventPeerProfile)) {
                        return 0;
                    }
                }
            } else {
                int i;
                for (i = 1; i <= DWCi_GetMatchWork()->players; i++) {
                    MatchWork *w = DWCi_GetMatchWork();
                    if (!(w->readyMask & (1 << DWCi_GetMatchWork()->aids[i]))) {
                        DWCi_SendMatchSynPacket(DWCi_GetMatchWork()->aids[i], 2);
                    }
                }
            }
        }
        break;
    case 17:
        if (elapsed > DWCi_GetMatchWork()->maxSize) {
            DWCi_AdvanceJoin(4);
        }
        break;
    }
    return 1;
}

// Sends a close message (13 to 15) to profile.
int DWCi_SendCloseMessage(int profile, int message) {
    int count, value;
    MatchWork *w;
    if (message == 13) {
        value = DWCi_GetMatchWork()->eventPeerProfile;
        count = 1;
    } else {
        count = 0;
    }
    if (DWCi_HandleMatchCommandError(DWCi_SendMatchCommand(message, profile, 0, 0, (u32 *)&value, count))) {
        return 0;
    }
    w = DWCi_GetMatchWork();
    w->closeTick = OS_GetTick();
    return 1;
}

// Close exchange: the server sends 13 (with the profile it closes with), the peers answer 14, and when all have
// answered the server sends 15 and waits for the longest half round trip.
int DWCi_ProcessCloseMessage(int profile, int message, int arg) {
    int i;
    if (DWCi_GetState() != DWC_STATE_CONNECTED) {
        return 1;
    }
    switch (message) {
    case 13:
        if (DWCi_GetMatchWork()->state != 8) {
            DWCi_SetMatchState(8);
            DWCi_CloseConnectionToProfile(arg);
        }
        if (!DWCi_SendCloseMessage(profile, 14)) {
            return 0;
        }
        break;
    case 14:
        if (DWCi_GetMatchWork()->state == 14) {
            u64 now = OS_GetTick();
            if (TICKS_TO_MS(now - DWCi_GetMatchWork()->closeTick) / 2 > 300) {
                u64 delay = TICKS_TO_MS(now - DWCi_GetMatchWork()->closeTick) / 2 - 300;
                if (delay > (u64)(int)DWCi_GetMatchWork()->closeDelay) {
                    DWCi_GetMatchWork()->closeDelay = delay;
                }
            }
            i = DWCi_GetAidFromProfile(profile, 0);
            if (i != 255) {
                MatchWork *w = DWCi_GetMatchWork();
                w->closeMask |= 1 << i;
            }
            i = DWCi_GetPeerAidBitmap(1);
            if (i == DWCi_GetMatchWork()->closeMask) {
                for (i = 1; i <= DWCi_GetMatchWork()->players; i++) {
                    if (!DWCi_SendCloseMessage(DWCi_GetMatchWork()->profiles[i], 15)) {
                        return 0;
                    }
                }
                DWCi_SetMatchState(15);
            }
        } else if (!DWCi_SendCloseMessage(profile, 15)) {
            return 0;
        }
        break;
    case 15:
        if (DWCi_GetMatchWork()->state == 8) {
            DWCi_RestartMatching(2);
        }
        break;
    }
    return 1;
}

// Resends the close messages every 6 seconds; returns 0 when the matchmaking was aborted.
int DWCi_ProcessCloseTimeout(void) {
    u64 elapsed;
    int i;
    if (DWCi_GetMatchWork()->state == 8 || DWCi_GetMatchWork()->state == 14 || DWCi_GetMatchWork()->state == 15) {
        u64 now = OS_GetTick();
        elapsed = TICKS_TO_MS(now - DWCi_GetMatchWork()->closeTick);
    } else {
        return 1;
    }
    switch (DWCi_GetMatchWork()->state) {
    case 8:
        if (elapsed > 6000) {
            if (!DWCi_SendCloseMessage(DWCi_GetMatchWork()->profiles[0], 14)) {
                return 0;
            }
        }
        break;
    case 14:
        if (elapsed > 6000) {
            ++DWCi_GetMatchWork()->closeRetries;
            if (DWCi_GetMatchWork()->closeRetries > 5) {
                if (!DWCi_KeepPeersInAidMask(DWCi_GetMatchWork()->closeMask)) {
                    return 0;
                }
                if (DWCi_GetMatchWork()->players) {
                    DWCi_GetMatchWork()->closeRetries = 0;
                    DWCi_GetMatchWork()->closeTick = OS_GetTick();
                } else {
                    DWCi_RestartMatching(2);
                }
            } else {
                for (i = 1; i <= DWCi_GetMatchWork()->players; i++) {
                    MatchWork *w = DWCi_GetMatchWork();
                    if (!(w->closeMask & (1 << DWCi_GetMatchWork()->aids[i]))) {
                        if (!DWCi_SendCloseMessage(DWCi_GetMatchWork()->profiles[i], 13)) {
                            return 0;
                        }
                    }
                }
            }
        }
        break;
    case 15:
        if (elapsed > (u64)(int)DWCi_GetMatchWork()->closeDelay) {
            DWCi_RestartMatching(2);
        }
        break;
    }
    return 1;
}
