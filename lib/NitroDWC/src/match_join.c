#pragma force_active on
#include "global.h"

#include "dwc/dwc_account_internal.h"
#include "dwc/match_internal.h"
#include "dwc/net_common_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

#pragma warn_uninitializedvar off

// Joining a match: the handler of the commands received from the peers, answering a connect request, adding the new peer and telling the others about it,
// requesting the connection to a server or to the next friend that hosts a match, and dropping a peer.

// Buddy status read by DWCi_SendReservationToNextFriend, 0x210 bytes.
typedef struct MatchBuddyStatus {
    int unk_00;
    int status;     // 0x04, 4 = playing
    char data[520]; // 0x08, "\"-separated key/value pairs
} MatchBuddyStatus;

extern const char sStr_FME[]; // "FME"
extern const char sStr_MDF[]; // "MDF"
extern const char sStr_VER[]; // "VER"
extern const char sStr_dwc_pid[]; // "dwc_pid"

extern u32 strtoul(const char *s, char **end, int base);
extern void DWC_CloseConnectionHard(int index);
extern int DWCi_GetState(void);
extern DwcUserData *DWCi_GetUserData(void);
extern int DWCi_GetFriendListIndex(int profile);
extern int DWCi_SendMatchCommand(int command, u32 profile, u32 addr, u32 port, u32 *data, int count);
extern u8 DWCi_GetFreeAid(void);
extern int DWCi_IsFriendProfile(int profile);
extern int DWCi_GetAidFromProfile(int profile, int first);
extern void DWCi_ResetMatchRetryTimer(void);
extern void DWCi_ResetMinCompleteTimer(int flag);
extern int DWCi_HandleNNError(unsigned error);
extern int gpGetBuddyStatus(void *connection, int buddy, MatchBuddyStatus *status);
extern int gpGetBuddyIndex(void *connection, int profile, int *buddy);
extern int gpIsBuddy(void *connection, int profile);
extern void gt2CloseAllConnectionsHard(void *connection);
extern void *gt2GetSocketSOCKET(void *connection);
extern void NNCancel(void *p);
extern void qr2_send_statechanged(void *reporting);
extern u32 SBServerGetIntValueA(void *server, const char *key, int fallback);
extern u32 SBServerGetPublicInetAddress(void *server);
extern u32 SBServerGetPublicQueryPort(void *server);
extern void *ServerBrowserGetServer(void *list, int index);

// Handles a command from profile (addr:port); returns 0 when the matchmaking was aborted.
int DWCi_ProcessMatchCommand(int command, int profile, u32 addr, int port, int *data, int count) {
    int n = 0;
    int newProfile;
    MatchAddr peerAddr;
    u32 reply[65];
    if (!DWCi_GetMatchWork() || DWCi_GetMatchWork()->state == 0) {
        return 1;
    }
    if (DWCi_GetState() == DWC_STATE_MATCHING && DWCi_GetMatchWork()->state == 1 && profile == DWCi_GetMatchWork()->profiles[0]) {
        DWCi_ResetMatchRetryTimer();
    }
    switch (command) {
    case 1:
    case 11: {
        int response;
        if (DWCi_GetMatchWork()->mode != DWC_MATCH_TYPE_ANYBODY) {
            addr = data[1];
            port = (u16)data[2];
        }
        response = DWCi_ProcessReservationRequest(profile, addr, port, data[0], command == 11);
        if (response == 2) {
            DWCi_GetMatchWork()->friendCheckMask = 0;
            if (DWCi_HandleMatchCommandError(DWCi_AddNewPeer(profile, addr, port))) {
                return 0;
            }
            if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_SV && DWCi_GetMatchWork()->newPeerCallback) {
                MatchWork *w = DWCi_GetMatchWork();
                int friendIndex = DWCi_GetFriendListIndex(profile);
                w->newPeerCallback(friendIndex, DWCi_GetMatchWork()->newPeerParam);
            }
            reply[0] = DWCi_GetMatchWork()->connections;
            for (n = 1; n <= DWCi_GetMatchWork()->connections; n++) {
                reply[n] = DWCi_GetMatchWork()->profiles[n];
            }
            reply[n++] = DWCi_GetMatchWork()->addr;
            reply[n++] = DWCi_GetMatchWork()->port;
            DWCi_SetMatchState(11);
        } else if (response == 3 && DWCi_GetMatchWork()->limit != 0) {
            MatchWork *w = DWCi_GetMatchWork();
            if (w->connections == DWCi_GetMatchWork()->limit && DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_SV) {
                reply[0] = 16;
                n = 1;
            }
        }
        if (response != 255) {
            if (DWCi_HandleMatchCommandError(DWCi_SendMatchCommand(response, profile, addr, port, reply, n))) {
                return 0;
            }
        }
        break;
    }
    case 2:
        if (DWCi_GetMatchWork()->state != 4 || profile != DWCi_GetMatchWork()->target) {
            break;
        }
        DWCi_GetMatchWork()->nextServerProfile = 0;
        DWCi_GetMatchWork()->nextServerRetries = 0;
        DWCi_GetMatchWork()->delay = 0;
        DWCi_GetMatchWork()->active = 0;
        DWCi_GetMatchWork()->addresses[0] = (data + data[0])[1];
        DWCi_GetMatchWork()->ports[0] = (data + data[0])[2];
        DWCi_GetMatchWork()->remoteAddr = (data + data[0])[1];
        DWCi_GetMatchWork()->remotePort = (data + data[0])[2];
        if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_FRIEND) {
            if (DWCi_CheckFriendProfiles(data + 1, data[0])) {
                if (DWCi_GetMatchWork()->players) {
                    DWCi_SetServerPeerProfiles(profile, data);
                }
            } else {
                if (DWCi_HandleMatchCommandError(DWCi_CancelReservation(profile))) {
                    return 0;
                }
                if (DWCi_HandleMatchCommandError(DWCi_SendReservationToNextFriend(0, 0, profile))) {
                    return 0;
                }
                break;
            }
        }
        if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_ANYBODY) {
            if (DWCi_GetMatchWork()->players) {
                DWCi_SetServerPeerProfiles(profile, data);
                if (DWCi_HandleMatchCommandError(DWCi_SendServerPeerProfiles())) {
                    return 0;
                }
            }
            DWCi_SetMatchState(6);
            if (DWCi_HandleNNError(DWCi_StartNatNegotiation(0, 0, ServerBrowserGetServer(DWCi_GetMatchWork()->list, 0)))) {
                return 0;
            }
        } else {
            DWCi_SetMatchState(5);
            if (DWCi_HandleSBError(DWCi_UpdateServerListAsync(profile))) {
                return 0;
            }
        }
        break;
    case 3:
        if (DWCi_GetMatchWork()->state != 4 || profile != DWCi_GetMatchWork()->target) {
            break;
        }
        if (count > 0 && data[0] == 16) {
            DWCi_StopMatching(13, 0);
            return 0;
        }
        return DWCi_RestartMatchSearch(DWCi_GetMatchWork()->target);
    case 4: {
        MatchWork *w;
        if (DWCi_GetMatchWork()->state != 4 || profile != DWCi_GetMatchWork()->target) {
            break;
        }
        w = DWCi_GetMatchWork();
        w->time = OS_GetTick();
        if ((DWCi_GetMatchWork()->nextServerProfile && DWCi_GetMatchWork()->nextServerRetries < 16) || DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_CL) {
            DWCi_GetMatchWork()->active = 1;
            w = DWCi_GetMatchWork();
            w->activeTick = OS_GetTick();
            if (DWCi_GetMatchWork()->mode != DWC_MATCH_TYPE_SC_CL) {
                DWCi_GetMatchWork()->nextServerRetries++;
            }
        } else {
            DWCi_GetMatchWork()->nextServerProfile = 0;
            DWCi_GetMatchWork()->nextServerRetries = 0;
            if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_ANYBODY) {
                DWCi_SetMatchState(3);
                DWCi_GetMatchWork()->searchWait = 1;
                w = DWCi_GetMatchWork();
                w->searchWaitTick = OS_GetTick();
            } else if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_FRIEND) {
                DWCi_SendReservationToNextFriend(1, 0, 0);
            }
        }
        break;
    }
    case 5:
        if (!DWCi_GetMatchWork()->newPeerPending || profile != DWCi_GetMatchWork()->newPeerProfile) {
            break;
        }
        if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_SV && DWCi_GetMatchWork()->players == 1 && profile == DWCi_GetMatchWork()->profiles[1]) {
            gt2CloseAllConnectionsHard(*DWCi_GetMatchWork()->peer);
        }
        if (!DWCi_DropConnectingPeer(profile)) {
            return 0;
        }
        break;
    case 6: {
        int newPort;
        int newAddr;
        newAddr = data[0];
        newPort = (u16)data[1];
        void *socket;
        MatchWork *w;
        if (DWCi_GetMatchWork()->state == 1) {
            DWCi_SetMatchState(6);
        } else {
            if (DWCi_GetMatchWork()->state != 6 && DWCi_GetMatchWork()->state != 11) {
                break;
            }
            if (profile != DWCi_GetMatchWork()->newPeerProfile) {
                break;
            }
        }
        DWCi_GetMatchWork()->sentCommand = 255;
        w = DWCi_GetMatchWork();
        if (w->profiles[DWCi_GetMatchWork()->players + 1] != profile) {
            w = DWCi_GetMatchWork();
            w->profiles[DWCi_GetMatchWork()->players + 1] = profile;
        }
        peerAddr.address = newAddr;
        peerAddr.port = ((newPort >> 8) & 0xFF) | ((newPort << 8) & 0xFF00);
        DWCi_GetMatchWork()->request.flag = 1;
        socket = gt2GetSocketSOCKET(*DWCi_GetMatchWork()->peer);
        DWCi_NNCompletedCallback(0, (int)socket, &peerAddr, &DWCi_GetMatchWork()->request);
        w = DWCi_GetMatchWork();
        w->waitTick = 0;
        break;
    }
    case 7: {
        int flag;
        MatchWork *w;
        if (DWCi_GetMatchWork()->state != 1 || profile != DWCi_GetMatchWork()->profiles[0]) {
            break;
        }
        newProfile = data[0];
        flag = data[1] & 0xFF;
        if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_FRIEND && !DWCi_GetMatchWork()->unk_1A6) {
            reply[0] = DWCi_IsFriendProfile(newProfile);
            if (DWCi_HandleMatchCommandError(DWCi_SendMatchCommand(32, profile, addr, port, reply, 1))) {
                return 0;
            }
        }
        w = DWCi_GetMatchWork();
        w->profiles[DWCi_GetMatchWork()->connections + 1] = newProfile;
        w = DWCi_GetMatchWork();
        w->aids[DWCi_GetMatchWork()->connections + 1] = flag;
        qr2_send_statechanged(DWCi_GetMatchWork()->reporting);
        if (DWCi_GetMatchWork()->newPeerCallback) {
            int friendIndex;
            w = DWCi_GetMatchWork();
            friendIndex = DWCi_GetFriendListIndex(newProfile);
            w->newPeerCallback(friendIndex, DWCi_GetMatchWork()->newPeerParam);
        }
        break;
    }
    case 8: {
        int index;
        MatchWork *w;
        if (DWCi_GetMatchWork()->state != 1 || profile != DWCi_GetMatchWork()->profiles[0]) {
            break;
        }
        newProfile = data[0];
        if (!newProfile) {
            index = data[1];
            n = data[2];
            ((MatchWork *)(index + (u32)DWCi_GetMatchWork()))->aids[0] = n;
            w = DWCi_GetMatchWork();
            w->profiles[index] = DWCi_GetMatchWork()->identity;
            DWCi_AdvanceJoin(3);
            break;
        }
        n = data[2] & 0xFF;
        index = data[1];
        if (newProfile == DWCi_GetMatchWork()->profiles[index] && index == DWCi_GetMatchWork()->players - 1) {
            w = DWCi_GetMatchWork();
            if (DWCi_HandleMatchCommandError(DWCi_SendMatchCommand(9, profile, w->addresses[0], DWCi_GetMatchWork()->ports[0], (u32 *)&newProfile, 1))) {
                return 0;
            }
            break;
        }
        DWCi_GetMatchWork()->profiles[index] = newProfile;
        ((MatchWork *)(index + (u32)DWCi_GetMatchWork()))->aids[0] = n;
        DWCi_GetMatchWork()->addresses[index] = data[3];
        DWCi_GetMatchWork()->ports[index] = data[4];
        DWCi_GetMatchWork()->remoteAddr = data[3];
        DWCi_GetMatchWork()->remotePort = data[4];
        DWCi_SetMatchState(5);
        if (DWCi_HandleSBError(DWCi_UpdateServerListAsync(newProfile))) {
            return 0;
        }
        DWCi_GetMatchWork()->delay = 0;
        DWCi_GetMatchWork()->active = 0;
        break;
    }
    case 9: {
        MatchWork *w;
        if (DWCi_GetMatchWork()->state != 13) {
            break;
        }
        w = DWCi_GetMatchWork();
        if (data[0] != w->profiles[DWCi_GetMatchWork()->initial + 1]) {
            break;
        }
        DWCi_GetMatchWork()->initial++;
        DWCi_AdvanceJoin(0);
        break;
    }
    case 10:
        if (DWCi_GetMatchWork()->state != 1 && DWCi_GetMatchWork()->state != 18) {
            break;
        }
        if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_ANYBODY || DWCi_CheckFriendProfiles(data + 1, data[0])) {
            DWCi_GetMatchWork()->nextServerProfile = data[1];
            DWCi_GetMatchWork()->nextServerRetries = 0;
        } else {
            DWCi_GetMatchWork()->nextServerProfile = 0;
        }
        if (DWCi_GetMatchWork()->players) {
            gt2CloseAllConnectionsHard(*DWCi_GetMatchWork()->peer);
        } else if (DWCi_RestartWithPendingServer()) {
            return 0;
        }
        break;
    case 12:
        if (profile != DWCi_GetMatchWork()->profiles[0]) {
            break;
        }
        if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_ANYBODY || DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_FRIEND) {
            if (!DWCi_HandleReservationRefused(profile)) {
                return 0;
            }
        } else if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_CL) {
            DWCi_GetMatchWork()->eventPeerProfile = profile;
            DWCi_CloseAllConnectionsHard();
            DWCi_RestartMatching(0);
        }
        break;
    case 13:
    case 14:
    case 15:
        if (!DWCi_ProcessCloseMessage(profile, command, data[0])) {
            return 0;
        }
        break;
    case 16: {
        int i;
        if (profile != DWCi_GetMatchWork()->profiles[0]) {
            return 1;
        }
        for (i = 0; i < count; i++) {
            int index = DWCi_GetAidFromProfile(data[i], 0);
            if (index != 255) {
                DWC_CloseConnectionHard(index);
            }
        }
        break;
    }
    case 17: {
        MatchTimer *timer = gDwcMatch.timer;
        if (timer && timer->active && TICKS_TO_MS(OS_GetTick() - timer->start) >= timer->timeout) {
            reply[0] = 1;
        } else {
            reply[0] = 0;
        }
        if (DWCi_HandleMatchCommandError(DWCi_SendMatchCommand(18, profile, addr, port, reply, 1))) {
            return 0;
        }
        break;
    }
    case 18: {
        int index;
        if (DWCi_GetMatchWork()->state != 19) {
            break;
        }
        index = DWCi_GetAidFromProfile(profile, 0);
        if (index == 255) {
            break;
        }
        gDwcMatch.timer->mask |= 1 << index;
        if (data[0]) {
            gDwcMatch.timer->all |= 1 << index;
        }
        break;
    }
    case 19:
        DWCi_StopMatching(12, 0);
        return 0;
    case 32: {
        int i;
        if (DWCi_GetMatchWork()->mode != DWC_MATCH_TYPE_FRIEND || DWCi_GetMatchWork()->unk_1A6) {
            break;
        }
        for (i = 1; i <= DWCi_GetMatchWork()->players; i++) {
            if (profile == DWCi_GetMatchWork()->profiles[i]) {
                if (!data[0]) {
                    if (DWCi_GetMatchWork()->state == 11 || DWCi_GetMatchWork()->state == 12) {
                        if (DWCi_HandleMatchCommandError(DWCi_SendLeaveToServer())) {
                            return 0;
                        }
                    }
                    if (DWCi_GetMatchWork()->request.active) {
                        NNCancel((void *)DWCi_GetMatchWork()->request.active);
                        DWCi_GetMatchWork()->request.active = 0;
                    }
                    DWCi_ClientRestartMatching();
                } else {
                    MatchWork *w = DWCi_GetMatchWork();
                    w->friendCheckMask |= 1 << DWCi_GetAidFromProfile(profile, 0);
                }
                break;
            }
        }
        break;
    }
    case 64: {
        int i;
        for (i = 1; i <= DWCi_GetMatchWork()->players; i++) {
            if (profile == DWCi_GetMatchWork()->profiles[i]) {
                if (DWCi_HandleMatchCommandError(DWCi_SendMatchCommand(65, profile, addr, port, NULL, 0))) {
                    return 0;
                }
                break;
            }
        }
        break;
    }
    case 65:
        break;
    }
    return 1;
}

#pragma opt_lifetimes off

// Answers a connect request (command 1, or 11 when resent) from profile: 2 = accept, 3 = refuse,
// 4 = not ready yet, 19 = closed, 255 = ignore.
int DWCi_ProcessReservationRequest(int profile, u32 addr, int port, int mode, BOOL resend) {
    int result;
    switch (DWCi_GetMatchWork()->mode) {
    case DWC_MATCH_TYPE_FRIEND:
        if (!gpIsBuddy(DWCi_GetMatchWork()->gpConnection, profile)) {
            result = 255;
            break;
        }
        if (!DWCi_IsFriendProfile(profile)) {
            result = 3;
            break;
        }
    case DWC_MATCH_TYPE_ANYBODY:
        if (mode != DWCi_GetMatchWork()->mode || DWCi_GetMatchWork()->cancelling || DWCi_GetMatchWork()->connections == DWCi_GetMatchWork()->limit || (DWCi_GetMatchWork()->newPeerPending && DWCi_GetMatchWork()->newPeerProfile == DWCi_GetMatchWork()->identity)) {
            result = 3;
            if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_ANYBODY && *(int *)((u8 *)DWCi_GetMatchWork()->reporting + 0xB4) == 0 && DWCi_GetMatchWork()->newPeerPending && DWCi_GetMatchWork()->newPeerProfile == DWCi_GetMatchWork()->identity) {
                qr2_send_statechanged(DWCi_GetMatchWork()->reporting);
            }
            break;
        }
        if (DWCi_GetMatchWork()->state == 3 || DWCi_GetMatchWork()->state == 4) {
            if (DWCi_GetMatchWork()->addr || DWCi_GetMatchWork()->port) {
                if (addr || port) {
                    goto accept;
                }
            }
        }
        result = 4;
        break;
accept: {
    if (DWCi_GetMatchWork()->target) {
        if (profile == DWCi_GetMatchWork()->target) {
            if (resend || ((int)DWCi_GetMatchWork()->identity < profile && DWCi_GetMatchWork()->nextServerProfile != profile)) {
                result = 2;
            } else {
                result = 255;
            }
        } else {
            if (resend || ((int)DWCi_GetMatchWork()->identity < profile && DWCi_GetMatchWork()->nextServerProfile == 0)) {
                if (DWCi_HandleMatchCommandError(DWCi_CancelReservation(DWCi_GetMatchWork()->target))) {
                    return 255;
                }
                result = 2;
            } else {
                result = 3;
            }
        }
    } else {
        result = 2;
    }
} break;
    case DWC_MATCH_TYPE_SC_SV:
        if (!gpIsBuddy(DWCi_GetMatchWork()->gpConnection, profile)) {
            result = 255;
            break;
        }
        if (mode != 3 || DWCi_GetMatchWork()->connections == DWCi_GetMatchWork()->limit) {
            result = 3;
            break;
        }
        if (gDwcMatch.scConnectBlock == 1 && gDwcMatch.scConnectBlocked == 1) {
            result = 19;
            break;
        }
        if (DWCi_GetMatchWork()->state == 10 && (DWCi_GetMatchWork()->addr || DWCi_GetMatchWork()->port)) {
            if (addr || port) {
                goto server;
            }
        }
        result = 4;
        break;
server:
        result = 2;
        break;
    }
    return result;
}

#pragma opt_lifetimes reset

// Adds profile as the next peer and sends it to the connected peers (command 7).
int DWCi_AddNewPeer(int profile, u32 addr, int port) {
    MatchWork *w, *v, *u;
    int data[2];
    int i, result;
    if (DWCi_GetMatchWork()->newPeerPending && profile == DWCi_GetMatchWork()->newPeerProfile) {
        return 0;
    }
    DWCi_GetMatchWork()->newPeerPending = 1;
    DWCi_GetMatchWork()->newPeerProfile = profile;
    DWCi_GetMatchWork()->active = 0;
    DWCi_GetMatchWork()->delay = 0;
    qr2_send_statechanged(DWCi_GetMatchWork()->reporting);
    DWCi_GetMatchWork()->target = 0;
    w = DWCi_GetMatchWork();
    w->profiles[DWCi_GetMatchWork()->connections + 1] = profile;
    w = DWCi_GetMatchWork();
    w->addresses[DWCi_GetMatchWork()->connections + 1] = addr;
    w = DWCi_GetMatchWork();
    w->ports[DWCi_GetMatchWork()->connections + 1] = port;
    DWCi_GetMatchWork()->remoteAddr = addr;
    DWCi_GetMatchWork()->remotePort = port;
    w = DWCi_GetMatchWork();
    v = DWCi_GetMatchWork();
    result = DWCi_GetFreeAid();
    w->aids[v->connections + 1] = result;
    data[0] = profile;
    w = DWCi_GetMatchWork();
    data[1] = w->aids[DWCi_GetMatchWork()->connections + 1];
    for (i = 1; i <= DWCi_GetMatchWork()->connections; i++) {
        w = DWCi_GetMatchWork();
        v = DWCi_GetMatchWork();
        u = DWCi_GetMatchWork();
        result = DWCi_SendMatchCommand(7, w->profiles[i], v->addresses[i], u->ports[i], (u32 *)data, 2);
        if (result) {
            return result;
        }
    }
    DWCi_ResetMinCompleteTimer(1);
    return 0;
}

// Keeps the profiles of the server's peers (count, profiles...) with profile in front.
void DWCi_SetServerPeerProfiles(int profile, int *list) {
    u32 n = list[0] + 2;
    if (n > 2) {
        MIi_CpuCopy32(list + 1, &DWCi_GetMatchWork()->serverPeerProfiles[1], (n - 2) * 4);
    }
    DWCi_GetMatchWork()->serverPeerCount = n - 1;
    DWCi_GetMatchWork()->serverPeerProfiles[0] = profile;
}

int DWCi_HandleMatchCommandError(unsigned error) {
    if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_ANYBODY) {
        return DWCi_HandleSBError(error);
    } else {
        return DWCi_HandleGPError(error);
    }
}

// Requests the connection to profile (command 1, or 11 when retrying); with no server address yet, or when
// direct, only waits for it.
int DWCi_SendReservationRequest(int profile, BOOL direct) {
    MatchWork *w;
    int n, command;
    u32 data[3];
    if (direct || (!DWCi_GetMatchWork()->addr && !DWCi_GetMatchWork()->port)) {
        DWCi_GetMatchWork()->active = 1;
        w = DWCi_GetMatchWork();
        w->activeTick = OS_GetTick();
        DWCi_GetMatchWork()->profiles[0] = profile;
        return 0;
    }
    if (!DWCi_GetMatchWork()->mode) {
        void *server = ServerBrowserGetServer(DWCi_GetMatchWork()->list, 0);
        w = DWCi_GetMatchWork();
        w->profiles[0] = SBServerGetIntValueA(server, sStr_dwc_pid, 0);
        w = DWCi_GetMatchWork();
        w->addresses[0] = SBServerGetPublicInetAddress(server);
        w = DWCi_GetMatchWork();
        w->ports[0] = SBServerGetPublicQueryPort(server);
        w = DWCi_GetMatchWork();
        w->target = DWCi_GetMatchWork()->profiles[0];
        n = 1;
    } else {
        if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_FRIEND) {
            DWCi_GetMatchWork()->profiles[0] = profile;
        }
        DWCi_GetMatchWork()->target = profile;
        data[1] = DWCi_GetMatchWork()->addr;
        data[2] = DWCi_GetMatchWork()->port;
        n = 3;
    }
    DWCi_GetMatchWork()->delay = 6000;
    w = DWCi_GetMatchWork();
    w->time = OS_GetTick();
    DWCi_GetMatchWork()->active = 0;
    command = DWCi_GetMatchWork()->nextServerProfile ? 11 : 1;
    data[0] = DWCi_GetMatchWork()->mode;
    w = DWCi_GetMatchWork();
    return DWCi_SendMatchCommand(command, profile, w->addresses[0], DWCi_GetMatchWork()->ports[0], data, n);
}

// Looks for the next friend (after the current one unless same) that hosts a match of our kind and requests
// the connection to it; waits 3 seconds when there is none.
int DWCi_SendReservationToNextFriend(int mode, BOOL same, int previous) {
    struct {
        char mdf[4];
        int buddy;
        char fme[4], ver[12];
        MatchBuddyStatus status;
    } buf;

    int profile, seen, advance, start, i, ret, a, b, d;
    MatchWork *w, *x, *y;
    DwcUserData *user;
    if (same) {
        start = DWCi_GetMatchWork()->current;
    } else if (DWCi_GetMatchWork()->current >= DWCi_GetMatchWork()->friendCount - 1) {
        start = 0;
    } else {
        start = DWCi_GetMatchWork()->current + 1;
    }
    seen = 0;
    advance = same == 0 ? 1 : seen;
    for (;;) {
        if (advance || seen) {
            DWCi_GetMatchWork()->current++;
            if (DWCi_GetMatchWork()->current >= DWCi_GetMatchWork()->friendCount) {
                DWCi_GetMatchWork()->current = 0;
            }
        }
        if (seen && start == DWCi_GetMatchWork()->current) {
            DWCi_GetMatchWork()->delay = 3000;
            w = DWCi_GetMatchWork();
            w->time = OS_GetTick();
            DWCi_GetMatchWork()->active = 0;
            return 0;
        }
        seen = 1;
        user = DWCi_GetUserData();
        w = DWCi_GetMatchWork();
        x = DWCi_GetMatchWork();
        y = DWCi_GetMatchWork();
        profile = DWC_GetGsProfileId(user, &w->friends[x->friendIds[y->current]]);
        if (!profile || profile == -1) {
            continue;
        }
        w = DWCi_GetMatchWork();
        x = DWCi_GetMatchWork();
        y = DWCi_GetMatchWork();
        if (!DWCi_Acc_IsValidFriendData(&w->friends[x->friendIds[y->current]])) {
            continue;
        }
        for (i = 1; i <= DWCi_GetMatchWork()->players; i++) {
            if (profile == DWCi_GetMatchWork()->profiles[i]) {
                break;
            }
        }
        if (i <= DWCi_GetMatchWork()->players) {
            continue;
        }
        ret = gpGetBuddyIndex(DWCi_GetMatchWork()->gpConnection, profile, &buf.buddy);
        ret |= gpGetBuddyStatus(DWCi_GetMatchWork()->gpConnection, buf.buddy, &buf.status);
        if (ret || buf.status.status != DWC_STATUS_MATCH_FRIEND) {
            continue;
        }
        a = DWC_GetCommonValueString((char *)sStr_VER, buf.ver, buf.status.data, '/');
        b = DWC_GetCommonValueString((char *)sStr_FME, buf.fme, buf.status.data, '/');
        d = DWC_GetCommonValueString((char *)sStr_MDF, buf.mdf, buf.status.data, '/');
        if (a <= 0 || b <= 0 || d <= 0) {
            continue;
        }
        if (strtoul(buf.ver, NULL, 10) != 3) {
            continue;
        }
        a = strtoul(buf.fme, NULL, 10);
        if (a != DWCi_GetMatchWork()->limit) {
            continue;
        }
        if (profile == previous) {
            mode = 1;
        }
        return DWCi_SendReservationRequest(profile, mode);
    }
}

int DWCi_RestartMatchSearch(int profile) {
    MatchWork *w;
    DWCi_GetMatchWork()->nextServerProfile = 0;
    DWCi_GetMatchWork()->target = 0;
    DWCi_GetMatchWork()->nextServerRetries = 0;
    w = DWCi_GetMatchWork();
    w->time = OS_GetTick();
    if (!DWCi_GetMatchWork()->mode) {
        DWCi_SetMatchState(3);
        if (DWCi_HandleSBError(DWCi_UpdateServerListAsync(0))) {
            return 0;
        }
    } else if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_FRIEND) {
        if (DWCi_HandleMatchCommandError(DWCi_SendReservationToNextFriend(0, 0, profile))) {
            return 0;
        }
    } else if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_CL) {
        DWCi_StopMatching(6, -80410);
        return 0;
    }
    return 1;
}

// Cancels the connection to profile (command 5).
int DWCi_CancelReservation(int profile) {
    MatchWork *w = DWCi_GetMatchWork();
    int result = DWCi_SendMatchCommand(5, profile, w->addresses[0], DWCi_GetMatchWork()->ports[0], NULL, 0);
    DWCi_GetMatchWork()->target = 0;
    return result;
}

static inline BOOL IsOwnServer(void) {
    MatchWork *a = DWCi_GetMatchWork();
    MatchWork *b = DWCi_GetMatchWork();
    return a->newPeerProfile == b->identity;
}

// Drops the peer being connected and goes back to looking for a match.
int DWCi_DropConnectingPeer(int profile) {
    int clear;
    MatchWork *w;
    if (DWCi_GetMatchWork()->newPeerPending != 0 && IsOwnServer()) {
        clear = 0;
    } else {
        clear = 1;
    }
    if (clear) {
        DWCi_GetMatchWork()->newPeerPending = 0;
        DWCi_GetMatchWork()->newPeerProfile = 0;
        qr2_send_statechanged(DWCi_GetMatchWork()->reporting);
    }
    if (DWCi_GetMatchWork()->players < 31) {
        w = DWCi_GetMatchWork();
        w->profiles[DWCi_GetMatchWork()->players + 1] = 0;
    }
    DWCi_GetMatchWork()->sentCommand = 255;
    if (DWCi_GetMatchWork()->request.active != 0) {
        NNCancel((void *)DWCi_GetMatchWork()->request.active);
        DWCi_GetMatchWork()->request.active = 0;
    }
    w = DWCi_GetMatchWork();
    w->connections = DWCi_GetMatchWork()->players;
    DWCi_GetMatchWork()->target = 0;
    if (!clear) {
        if (DWCi_GetMatchWork()->mode != DWC_MATCH_TYPE_SC_CL) {
            DWCi_ClientRestartMatching();
        }
    } else if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_ANYBODY) {
        DWCi_SetMatchState(3);
        DWCi_GetMatchWork()->searchWait = 2;
        w = DWCi_GetMatchWork();
        w->searchWaitTick = OS_GetTick();
    } else if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_FRIEND) {
        DWCi_SetMatchState(4);
        DWCi_SendReservationToNextFriend(1, 0, 0);
    } else if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_SV) {
        int i;
        DWCi_SetMatchState(14);
        DWCi_GetMatchWork()->closeMask = 0;
        DWCi_GetMatchWork()->closeDelay = 0;
        DWCi_CloseConnectionToProfile(profile);
        for (i = 1; i <= DWCi_GetMatchWork()->players; i++) {
            if (DWCi_SendCloseMessage(DWCi_GetMatchWork()->profiles[i], 13) == 0) {
                return 0;
            }
        }
        if (DWCi_GetMatchWork()->players == 0) {
            DWCi_RestartMatching(2);
        }
    }
    return 1;
}
