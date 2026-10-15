#pragma force_active on
#include "global.h"

#include "dwc/match_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

#pragma warn_unusedvar off
#pragma warn_uninitializedvar off

// Matchmaking over the server browser: the custom server keys, the filter applied to the server list,
// the list callback driving the connection states, the error code mapping, and the NAT negotiation result.

extern MatchKeyEntry gDwcMatchKeys[];
extern u8 ov00_0221A949[];
extern void *ov00_0221A950[];
extern char sFmt_Uint_2[];       // "%u"
extern char sStr_dwc_pid[];       // "dwc_pid"
extern char sStr_dwc_mtype[];       // "dwc_mtype"
extern char sStr_dwc_mresv[];       // "dwc_mresv"
extern char sStr_dwc_mver[];       // "dwc_mver"
extern const u8 sStr_dwc_eval[];   // "dwc_eval"
extern const char sStr_SBCM[]; // "SBCM"
extern char sStr_numplayers[];       // "numplayers"
extern char sStr_maxplayers[];       // "maxplayers"
extern const int gDwcServerPickWeights[];

extern int memcmp(const void *, const void *, u32);
extern int strncmp(const char *, const char *, u32);
extern void DWCi_SetError(int, int);
extern void DWC_Free(int, void *, int);
extern int DWCi_GetRandom(u32);
extern int DWCi_GetState(void);
extern void DWCi_StopLogin(int, int);
extern void DWCi_StopFriendProcess(int, int);
extern int DWCi_GetProfileIDFromList(int);
extern void DWCi_StopMatching(int, int);
extern void DWCi_SendMatchCommand(int, int, u32, u16, int, int);
extern int gt2Connect(void *, int, u32, char *, int, int, void *, int);
extern u32 gt2AddressToString(u32, u16, int);
extern void qr2_keybuffer_add(void *, int);
extern void qr2_buffer_add_int(void *, int);
extern void qr2_buffer_addA(void *, void *);
extern void SBServerAddIntKeyValue(void *, const void *, int);
extern int SBServerGetIntValueA(void *, const void *, int);
extern u32 SBServerGetPublicInetAddress(void *);
extern u16 SBServerGetPublicQueryPort(void *);
extern void ServerBrowserRemoveServer(void *, void *);
extern void *ServerBrowserGetServer(void *, int);
extern int ServerBrowserCount(void *);
extern void ServerBrowserSortA(void *, int, const void *, int);

u8 DWCi_GetNewMatchKeyID(void);
void DWCi_ClearMatchKeys(void);
u8 DWCi_GetFreeAid(void);
int DWCi_IsFriendProfile(int profile);
int DWCi_CheckServerKeys(void *server);
u8 DWCi_GetAidFromProfile(u32 profile, int first);
u32 DWCi_GetPeerAidBitmap(int flag);
void DWCi_ResetMatchRetryTimer(void);
void DWCi_ResetMinCompleteTimer(int flag);
void DWCi_ProcessMinComplete(void);
int DWCi_HandleGPError(unsigned error);
int DWCi_HandleSBError(unsigned error);
int DWCi_HandleQR2Error(int error);
int DWCi_HandleNNError(unsigned error);
int DWCi_HandleNNResult(int result);
int DWCi_HandleGT2Error(unsigned error);
void DWCi_SBCallback(void *list, int event, void *arg);
void DWCi_SBServerUpdated(void *arg);
int DWCi_EvaluateServers(int sort);
void DWCi_PickRandomServer(void);
void DWCi_QR2ServerKeyCallback(int id, void *out);
void DWCi_QR2PlayerKeyCallback(void);
void DWCi_QR2TeamKeyCallback(void);
void DWCi_QR2KeyListCallback(int state, void *p);
int DWCi_QR2CountCallback(void);
int DWCi_QR2AddErrorCallback(unsigned error);
void DWCi_QR2PublicAddressCallback(u32 addr, u16 port);
void DWCi_QR2NatNegCallback(int profile);
void DWCi_QR2ClientMessageCallback(void *src, u32 size);
void DWCi_NNProgressCallback(void);
void DWCi_NNCompletedCallback(int result, int unused, MatchAddr *addr, MatchRequest *req);

u8 DWCi_GetNewMatchKeyID(void) {
    u8 i;
    for (i = 0; i < 154; i++) {
        if (!gDwcMatchKeys[i].id) {
            return i + 100;
        }
    }
    return 0;
}

void DWCi_ClearMatchKeys(void) {
    int i;
    MatchKeyEntry *p = gDwcMatchKeys;
    for (i = 0; i < 154; i++, p++) {
        if (p->buffer) {
            DWC_Free(4, p->buffer, 0);
        }
    }
    MIi_CpuClear32(0, (u32 *)gDwcMatchKeys, 1848);
}

u8 DWCi_GetFreeAid(void) {
    u8 aid = 0;
    int i;
    do {
        for (i = 0; i <= DWCi_GetMatchWork()->connections; i++) {
            if (aid == DWCi_GetMatchWork()->aids[i]) {
                break;
            }
        }
        if (i > DWCi_GetMatchWork()->connections) {
            break;
        }
        aid++;
    } while (aid < 32);
    return aid;
}

int DWCi_IsFriendProfile(int profile) {
    int i;
    if (!DWCi_GetMatchWork()->friends) {
        return 0;
    }
    for (i = 0; i < (int)DWCi_GetMatchWork()->friendCount; i++) {
        int x = DWCi_GetProfileIDFromList(DWCi_GetMatchWork()->friendIds[i]);
        if (x > 0 && x == profile) {
            return 1;
        }
    }
    return 0;
}

int DWCi_CheckServerKeys(void *p) {
    if (SBServerGetIntValueA(p, sStr_numplayers, -1) == -1) {
        return 0;
    }
    if (SBServerGetIntValueA(p, sStr_maxplayers, -1) == -1) {
        return 0;
    }
    if (SBServerGetIntValueA(p, sStr_dwc_mtype, -1) == -1) {
        return 0;
    }
    if (SBServerGetIntValueA(p, sStr_dwc_mresv, -1) == -1) {
        if (SBServerGetIntValueA(p, sStr_dwc_mresv, 0) == 0) {
            return 0;
        }
    }
    if (SBServerGetIntValueA(p, sStr_dwc_mver, -1) == -1) {
        return 0;
    }
    return SBServerGetIntValueA(p, sStr_dwc_pid, 0);
}

u8 DWCi_GetAidFromProfile(u32 profile, int first) {
    int i = first == 0 ? 1 : 0;
    for (; i <= DWCi_GetMatchWork()->players; i++) {
        if (profile == DWCi_GetMatchWork()->profiles[i]) {
            return DWCi_GetMatchWork()->aids[i];
        }
    }
    return 255;
}

u32 DWCi_GetPeerAidBitmap(int flag) {
    u32 mask = 0;
    int i;
    if (flag) {
        return DWCi_GetMatchWork()->aidMask & ~1;
    }
    for (i = 1; i <= DWCi_GetMatchWork()->players; i++) {
        mask |= 1 << DWCi_GetMatchWork()->aids[i];
    }
    return mask;
}

void DWCi_ResetMatchRetryTimer(void) {
    DWCi_GetMatchWork()->serverPollCount = 0;
    DWCi_GetMatchWork()->serverPollTick = OS_GetTick();
}

void DWCi_ResetMinCompleteTimer(int flag) {
    if (!gDwcMatch.timer || !gDwcMatch.timer->active) {
        return;
    }
    gDwcMatch.timer->mask = 0;
    gDwcMatch.timer->all = 0;
    gDwcMatch.timer->retries = 0;
    gDwcMatch.timer->last = OS_GetTick();
    if (flag) {
        return;
    }
    gDwcMatch.timer->start = OS_GetTick();
}

void DWCi_ProcessMinComplete(void) {
    MatchTimer *s;
    int retries, i;
    u32 mask;
    u64 elapsed;
    if (!gDwcMatch.timer || !gDwcMatch.timer->active) {
        return;
    }
    if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_SV) {
        return;
    }
    if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_CL) {
        return;
    }
    if (DWCi_GetMatchWork()->state == 19) {
        mask = DWCi_GetPeerAidBitmap(0);
        s = gDwcMatch.timer;
        if (s->mask == mask) {
            if (s->all == mask) {
                DWCi_GetMatchWork()->limit = DWCi_GetMatchWork()->players;
                DWCi_GetMatchWork()->initial = DWCi_GetMatchWork()->players - 1;
                DWCi_AdvanceJoin(0);
                return;
            }
            s->last = OS_GetTick();
            s->mask = 0;
            if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_ANYBODY) {
                DWCi_SetMatchState(3);
                DWCi_GetMatchWork()->searchWait = 2;
                {
                    MatchWork *w = DWCi_GetMatchWork();
                    w->searchWaitTick = OS_GetTick();
                }
                return;
            }
            DWCi_SetMatchState(4);
            DWCi_SendReservationToNextFriend(1, 0, 0);
            return;
        }
        retries = s->retries;
        elapsed = ((OS_GetTick() - s->last) << 6) / 0x82ea;
        if (elapsed < (u64)(retries * 6000)) {
            return;
        }
        if ((u32)retries > 5) {
            DWCi_ResetMinCompleteTimer(1);
            DWCi_CloseAllConnectionsHard();
            DWCi_RestartMatching(1);
            return;
        }
        for (i = 1; i <= DWCi_GetMatchWork()->players; i++) {
            if (!(gDwcMatch.timer->mask & (1 << DWCi_GetMatchWork()->aids[i]))) {
                MatchWork *a = DWCi_GetMatchWork(), *b = DWCi_GetMatchWork(), *c = DWCi_GetMatchWork();
                DWCi_SendMatchCommand(17, a->profiles[i], b->addresses[i], c->ports[i], 0, 0);
                if (DWCi_HandleMatchCommandError()) {
                    return;
                }
            }
        }
        gDwcMatch.timer->retries++;
        return;
    }
    if (DWCi_GetMatchWork()->state != 4 && DWCi_GetMatchWork()->state != 3) {
        return;
    }
    s = gDwcMatch.timer;
    if (DWCi_GetMatchWork()->players < s->wanted - 1) {
        return;
    }
    if (s->retries == 0) {
        s = gDwcMatch.timer;
        elapsed = ((OS_GetTick() - s->start) << 6) / 0x82ea;
        if (elapsed >= s->timeout) {
            goto send;
        }
    }
    if (!s->retries) {
        return;
    }
    s = gDwcMatch.timer;
    elapsed = ((OS_GetTick() - s->last) << 6) / 0x82ea;
    if (elapsed < (s->timeout >> 2)) {
        return;
    }
send:
    if (DWCi_GetMatchWork()->target) {
        DWCi_CancelReservation(DWCi_GetMatchWork()->target);
        if (DWCi_HandleMatchCommandError()) {
            return;
        }
    }
    DWCi_SetMatchState(19);
    for (i = 1; i <= DWCi_GetMatchWork()->players; i++) {
        MatchWork *a = DWCi_GetMatchWork(), *b = DWCi_GetMatchWork(), *c = DWCi_GetMatchWork();
        DWCi_SendMatchCommand(17, a->profiles[i], b->addresses[i], c->ports[i], 0, 0);
        if (DWCi_HandleMatchCommandError()) {
            return;
        }
    }
    s = gDwcMatch.timer;
    s->last = OS_GetTick();
    s->retries = 1;
}

int DWCi_HandleGPError(unsigned n) {
    int cat, off;
    if (!n) {
        return 0;
    }
    switch (n) {
    case 1:
        cat = 9;
        off = -1;
        break;
    case 2:
        cat = 9;
        off = -2;
        break;
    case 3:
        cat = 6;
        off = -10;
        break;
    case 4:
        cat = 6;
        off = -20;
        break;
    }
    DWCi_StopMatching(cat, off - 81000);
    return n;
}

int DWCi_HandleSBError(unsigned n) {
    int cat, off;
    if (!n) {
        return 0;
    }
    switch (n) {
    case 1:
        cat = 6;
        off = -50;
        break;
    case 2:
        cat = 6;
        off = -30;
        break;
    case 3:
        cat = 6;
        off = -20;
        break;
    case 4:
        cat = 6;
        off = -40;
        break;
    case 5:
        cat = 9;
        off = -1;
        break;
    case 6:
        cat = 9;
        off = -2;
        break;
    }
    DWCi_StopMatching(cat, off - 85000);
    return n;
}

int DWCi_HandleQR2Error(int error) {
    int code, kind;
    if (!error) {
        return 0;
    }
    switch (error) {
    case 1:
        kind = 6;
        code = kind - 0x38;
        break;
    case 2:
        kind = 6;
        code = kind - 0x42;
        break;
    case 3:
        kind = 6;
        code = kind - 0x24;
        break;
    case 4:
        kind = 6;
        code = kind - 0x56;
        break;
    case 5:
        kind = 6;
        code = kind - 0x1a;
        break;
    }
    switch (DWCi_GetState()) {
    case DWC_STATE_LOGIN:
        DWCi_StopLogin(kind, code - 64000);
        break;
    case DWC_STATE_UPDATE_SERVERS:
        DWCi_StopFriendProcess(kind, code - 74000);
        break;
    case DWC_STATE_MATCHING:
        DWCi_StopMatching(kind, code - 84000);
        break;
    default:
        DWCi_SetError(kind, code - 94000);
        break;
    }
    return error;
}

int DWCi_HandleNNError(unsigned n) {
    int cat, off;
    if (!n) {
        return 0;
    }
    switch (n) {
    case 1:
        cat = 9;
        off = -1;
        break;
    case 2:
        cat = 6;
        off = -50;
        break;
    case 3:
        cat = 6;
        off = -30;
        break;
    }
    DWCi_StopMatching(cat, off - 86000);
    return n;
}

static inline void fail(int level) {
    register int code = level;
    if (code != 0) {
        DWCi_StopMatching(code, -86009);
    }
}

#pragma opt_propagation off

int DWCi_HandleNNResult(int a) {
    if (a == 0) {
        return 0;
    }
    switch (a) {
    case 1:
        return 1;
    case 2:
        return 2;
    default:
        fail(6);
        return a;
    }
}

#pragma opt_propagation reset

int DWCi_HandleGT2Error(unsigned n) {
    int cat, off;
    if (!n) {
        return 0;
    }
    switch (n) {
    case 1:
        cat = 9;
        off = -1;
        break;
    case 2:
    case 5:
        cat = 0;
        off = 0;
        n = 0;
        break;
    case 3:
        cat = 6;
        off = -10;
        break;
    case 4:
        cat = 6;
        off = -30;
        break;
    case 6:
        cat = 6;
        off = -70;
        break;
    case 7:
        cat = 6;
        off = -80;
        break;
    }
    if (cat) {
        DWCi_StopMatching(cat, off - 87000);
    }
    return n;
}

void DWCi_SBCallback(void *list, int event, void *arg) {
    int i, profile;
    void *item;
    MatchWork *w;
    gDwcMatch.busy++;
    if (DWCi_GetMatchWork()->pending) {
        if ((u32)(event - 4) <= 1) {
            w = DWCi_GetMatchWork();
            w->pending = 0;
        } else {
            w = DWCi_GetMatchWork();
            w->pending = OS_GetTick() + 0xefb5f7;
        }
    }
    switch (event) {
    case 0:
        DWCi_SBServerUpdated(arg);
        break;
    case 4:
        for (i = 0; i < ServerBrowserCount(list); i++) {
            item = ServerBrowserGetServer(list, i);
            if (!DWCi_CheckServerKeys(item)) {
                ServerBrowserRemoveServer(list, item);
                i--;
            }
        }
        switch (DWCi_GetMatchWork()->state) {
        case 2:
            for (i = 0; i < ServerBrowserCount(list); i++) {
                item = ServerBrowserGetServer(list, i);
                if (DWCi_GetMatchWork()->addr && DWCi_GetMatchWork()->addr == SBServerGetPublicInetAddress(item) && DWCi_GetMatchWork()->port && DWCi_GetMatchWork()->port == SBServerGetPublicQueryPort(item)) {
                    break;
                }
            }
            if (i < ServerBrowserCount(list)) {
                DWCi_SetMatchState(3);
                DWCi_GetMatchWork()->target = 0;
                DWCi_HandleSBError(DWCi_UpdateServerListAsync(DWCi_GetMatchWork()->target));
            } else {
                DWCi_GetMatchWork()->searchWait = 2;
                w = DWCi_GetMatchWork();
                w->searchWaitTick = OS_GetTick();
            }
            break;
        case 3:
            DWCi_EvaluateServers(1);
            DWCi_PickRandomServer();
            if (ServerBrowserCount(list)) {
                DWCi_SendReservationRequest(0, 0);
                if (DWCi_HandleMatchCommandError()) {
                    goto end;
                }
                DWCi_SetMatchState(4);
                DWCi_GetMatchWork()->searchWait = 0;
            } else {
                DWCi_GetMatchWork()->searchWait = 2;
                w = DWCi_GetMatchWork();
                w->searchWaitTick = OS_GetTick();
            }
            break;
        case 5:
            if (ServerBrowserCount(list)) {
                i = 0;
                do {
                    item = ServerBrowserGetServer(list, i);
                    if (SBServerGetPublicInetAddress(item) == DWCi_GetMatchWork()->remoteAddr && SBServerGetPublicQueryPort(item) == DWCi_GetMatchWork()->remotePort) {
                        break;
                    }
                    ServerBrowserRemoveServer(list, item);
                } while (ServerBrowserCount(list));
            }
            if (ServerBrowserCount(list)) {
                profile = SBServerGetIntValueA(ServerBrowserGetServer(list, 0), sStr_dwc_pid, 0);
                if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_FRIEND && profile == DWCi_GetMatchWork()->profiles[0]) {
                    if (DWCi_EvaluateServers(0)) {
                        if (DWCi_GetMatchWork()->players) {
                            DWCi_SendServerPeerProfiles();
                            if (DWCi_HandleMatchCommandError()) {
                                goto end;
                            }
                        }
                    } else {
                        DWCi_CancelReservation(DWCi_GetMatchWork()->profiles[0]);
                        if (DWCi_HandleMatchCommandError()) {
                            goto end;
                        }
                        DWCi_SetMatchState(4);
                        DWCi_SendReservationToNextFriend(0, 0, DWCi_GetMatchWork()->profiles[0]);
                        DWCi_HandleMatchCommandError();
                        goto end;
                    }
                }
                DWCi_SetMatchState(6);
                DWCi_HandleNNError(DWCi_StartNatNegotiation(0, 0, ServerBrowserGetServer(list, 0)));
            } else {
                DWCi_GetMatchWork()->searchWait = 2;
                w = DWCi_GetMatchWork();
                w->searchWaitTick = OS_GetTick();
            }
            break;
        }
        break;
    case 5:
        break;
    }
end:
    gDwcMatch.busy--;
}

void DWCi_SBServerUpdated(void *arg) {
}

int DWCi_EvaluateServers(int sort) {
    int removed = 0, matched, value, weight;
    MatchWork *w;
    void *arg;
    int i = removed;
    if (ServerBrowserCount(DWCi_GetMatchWork()->list) > 0) {
        do {
            int j;
            void *item = ServerBrowserGetServer(DWCi_GetMatchWork()->list, i);
            if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_ANYBODY) {
                value = SBServerGetIntValueA(item, sStr_dwc_pid, 0);
                matched = 0;
                for (j = 1; j <= DWCi_GetMatchWork()->players; j++) {
                    if (value == DWCi_GetMatchWork()->profiles[j]) {
                        ServerBrowserRemoveServer(DWCi_GetMatchWork()->list, item);
                        i--;
                        matched = 1;
                        break;
                    }
                }
                if (matched) {
                    goto advance;
                }
            }
            if (DWCi_GetMatchWork()->evalCallback) {
                w = DWCi_GetMatchWork();
                arg = DWCi_GetMatchWork()->evalParam;
                weight = w->evalCallback(i, arg);
                if (weight > 0) {
                    if (weight > 0x7fffff) {
                        weight = 0x7fffff;
                    }
                    SBServerAddIntKeyValue(item, sStr_dwc_eval, DWCi_GetRandom(256) | (weight << 8));
                } else {
                    ServerBrowserRemoveServer(DWCi_GetMatchWork()->list, item);
                    i--;
                    removed = 1;
                }
            } else {
                SBServerAddIntKeyValue(item, sStr_dwc_eval, DWCi_GetRandom(128));
            }
advance:
            i++;
        } while (i < ServerBrowserCount(DWCi_GetMatchWork()->list));
    }
    if (sort && ServerBrowserCount(DWCi_GetMatchWork()->list) != 0) {
        ServerBrowserSortA(DWCi_GetMatchWork()->list, 0, sStr_dwc_eval, 0);
    }
    if (removed && ServerBrowserCount(DWCi_GetMatchWork()->list) == 0) {
        return 0;
    }
    return 1;
}

static inline u32 combine(u32 q, u32 p) {
    return q + p;
}

void DWCi_PickRandomServer(void) {
    u32 random;
    int cumulative[6];
    int largest = 0, sum = 0, i;
    u32 prior;
    if (ServerBrowserCount(DWCi_GetMatchWork()->list) <= 1) {
        return;
    }
    for (i = 0; i < ServerBrowserCount(DWCi_GetMatchWork()->list); i++) {
        int value = SBServerGetIntValueA(ServerBrowserGetServer(DWCi_GetMatchWork()->list, i), sStr_dwc_eval, -1);
        if (value > largest) {
            largest = value;
        }
        sum += gDwcServerPickWeights[i];
    }
    random = DWCi_GetRandom(100);
    for (i = 0; i < ServerBrowserCount(DWCi_GetMatchWork()->list); i++) {
        if (i == ServerBrowserCount(DWCi_GetMatchWork()->list) - 1) {
            break;
        }
        if (i > 0) {
            prior = cumulative[i - 1];
        } else {
            prior = 0;
        }
        cumulative[i] = combine(gDwcServerPickWeights[i] * 100 / sum, prior);
        if (random < (u32)cumulative[i]) {
            break;
        }
    }
    if (largest < 0x7fffffff) {
        largest++;
    }
    SBServerAddIntKeyValue(ServerBrowserGetServer(DWCi_GetMatchWork()->list, i), sStr_dwc_eval, largest);
    ServerBrowserSortA(DWCi_GetMatchWork()->list, 0, sStr_dwc_eval, 0);
}

void DWCi_QR2ServerKeyCallback(int id, void *out) {
    int index;
    switch (id) {
    case 8:
        qr2_buffer_add_int(out, DWCi_GetMatchWork()->connections);
        return;
    case 10:
        qr2_buffer_add_int(out, DWCi_GetMatchWork()->limit);
        return;
    case 50:
        qr2_buffer_add_int(out, DWCi_GetMatchWork()->identity);
        return;
    case 51:
        qr2_buffer_add_int(out, DWCi_GetMatchWork()->mode);
        return;
    case 52:
        qr2_buffer_add_int(out, DWCi_GetMatchWork()->newPeerProfile);
        return;
    case 53:
        qr2_buffer_add_int(out, 3);
        return;
    case 54:
        qr2_buffer_add_int(out, 1);
        return;
    }
    index = id - 100;
    if (index < 0) {
        return;
    }
    if (index >= 154) {
        return;
    }
    index *= 12;
    if (!*((u8 *)gDwcMatchKeys + index)) {
        return;
    }
    if (ov00_0221A949[index]) {
        qr2_buffer_addA(out, *(void **)((u8 *)ov00_0221A950 + index));
    } else {
        qr2_buffer_add_int(out, *(int *)*(void **)((u8 *)ov00_0221A950 + index));
    }
}

void DWCi_QR2PlayerKeyCallback(void) {
}

void DWCi_QR2TeamKeyCallback(void) {
}

void DWCi_QR2KeyListCallback(int state, void *p) {
    int i;
    MatchKeyEntry *e;
    switch (state) {
    case 0:
        break;
    case 1:
    case 2:
    default:
        return;
    }
    qr2_keybuffer_add(p, 8);
    qr2_keybuffer_add(p, 10);
    qr2_keybuffer_add(p, 50);
    qr2_keybuffer_add(p, 51);
    qr2_keybuffer_add(p, 52);
    qr2_keybuffer_add(p, 53);
    qr2_keybuffer_add(p, 54);
    e = gDwcMatchKeys;
    for (i = 0; i < 154; i++, e++) {
        if (e->id) {
            qr2_keybuffer_add(p, e->id);
        }
    }
}

int DWCi_QR2CountCallback(void) {
    return 0;
}

int DWCi_QR2AddErrorCallback(unsigned n) {
    return DWCi_HandleQR2Error(n);
}

void DWCi_QR2PublicAddressCallback(u32 a, u16 b) {
    DWCi_GetMatchWork()->addr = a;
    DWCi_GetMatchWork()->port = b;
}

void DWCi_QR2NatNegCallback(int profile) {
    if (DWCi_GetMatchWork()->state == 1) {
        DWCi_SetMatchState(6);
    } else if (DWCi_GetMatchWork()->state != 6 && DWCi_GetMatchWork()->state != 11) {
        return;
    }
    if (profile == DWCi_GetMatchWork()->retryProfile) {
        DWCi_GetMatchWork()->retryCount++;
    } else {
        DWCi_GetMatchWork()->retryCount = 0;
        DWCi_GetMatchWork()->retryProfile = profile;
    }
    DWCi_GetMatchWork()->retryTick = 0;
    if (DWCi_HandleNNError(DWCi_StartNatNegotiation(1, profile, 0))) {
        return;
    }
    DWCi_GetMatchWork()->sentCommand = 255;
}

void DWCi_QR2ClientMessageCallback(void *src, u32 size) {
    MatchCommandHeader pkt;
    int data[32];
    u32 used = 0;
    if (DWCi_GetState() != DWC_STATE_MATCHING) {
        if (DWCi_GetState() != DWC_STATE_CONNECTED) {
            return;
        }
        if (DWCi_GetMatchWork()->mode != DWC_MATCH_TYPE_SC_SV && DWCi_GetMatchWork()->mode != DWC_MATCH_TYPE_SC_CL) {
            return;
        }
    }
    if (size < 20) {
        return;
    }
    do {
        MI_CpuCopy8(src, &pkt, 20);
        if (strncmp(pkt.magic, sStr_SBCM, 4) != 0 || pkt.version != 3) {
            return;
        }
        MI_CpuCopy8((char *)src + 20, data, pkt.size);
        if (!DWCi_ProcessMatchCommand(pkt.type, pkt.arg1, pkt.arg0, pkt.value, data, pkt.size >> 2)) {
            return;
        }
        used += pkt.size + 20;
    } while (used + 20 <= size);
}

void DWCi_NNProgressCallback(void) {
}

void DWCi_NNCompletedCallback(int result, int unused, MatchAddr *addr, MatchRequest *req) {
    int index, type, ret;
    MatchWork *w, *a, *b;
    u32 remote;
    u16 port;
    char buffer[12];
    if (DWCi_GetMatchWork()->state != 6 && DWCi_GetMatchWork()->state != 11) {
        return;
    }
    if (!req) {
        return;
    }
    if (!result) {
        req->active = 0;
        DWCi_GetMatchWork()->connections++;
        index = DWCi_GetMatchWork()->connections;
        if (req->flag) {
            DWCi_GetMatchWork()->addr2[index] = addr->address;
            port = addr->port;
            DWCi_GetMatchWork()->port2[index] = ((port >> 8) & 255) | ((port << 8) & 0xff00);
            DWCi_GetMatchWork()->retryCount = 0;
            DWCi_GetMatchWork()->retryProfile = 0;
            w = DWCi_GetMatchWork();
            w->retryTick = 0;
            if (DWCi_GetMatchWork()->state == 11) {
                DWCi_SetMatchState(12);
            } else {
                DWCi_SetMatchState(7);
            }
            DWCi_GetMatchWork()->flag = 0;
            OS_SNPrintf(buffer, 12, sFmt_Uint_2, DWCi_GetMatchWork()->identity);
            w = DWCi_GetMatchWork();
            a = DWCi_GetMatchWork();
            b = DWCi_GetMatchWork();
            remote = gt2AddressToString(a->addr2[index], b->port2[index], 0);
            a = DWCi_GetMatchWork();
            ret = gt2Connect(*w->peer, 0, remote, buffer, -1, 5000, a->callback, 0);
            if (ret == 1) {
                DWCi_HandleGT2Error(ret);
                return;
            }
            if (!ret) {
                return;
            }
            if (DWCi_DropConnectingPeer(DWCi_GetMatchWork()->profiles[index])) {
                return;
            }
            return;
        }
        if (addr) {
            index--;
            DWCi_GetMatchWork()->addr2[index] = addr->address;
            port = addr->port;
            DWCi_GetMatchWork()->port2[index] = ((port >> 8) & 255) | ((port << 8) & 0xff00);
        }
        w = DWCi_GetMatchWork();
        w->waitTick = OS_GetTick();
        DWCi_SetMatchState(7);
        return;
    }
    if (!req->active) {
        return;
    }
    type = DWCi_HandleNNResult(result);
    if (type != 2 && type != 1) {
        return;
    }
    if (!req->flag) {
        if (type == 1 || (type == 2 && req->retries >= 1)) {
            req->active = 0;
            if (!DWCi_CheckMatchRetryLimit(0)) {
                return;
            }
            w = DWCi_GetMatchWork();
            if (DWCi_HandleReservationRefused(w->profiles[DWCi_GetMatchWork()->players])) {
                return;
            }
            return;
        }
        req->retries++;
        if (DWCi_HandleNNError(DWCi_DoNatNegotiationAsync(req))) {
            return;
        }
        return;
    }
    w = DWCi_GetMatchWork();
    w->retryTick = OS_GetTick();
    switch (type) {
    case 1:
        break;
    case 2:
        if (DWCi_GetMatchWork()->retryCount < 1) {
            return;
        }
        break;
    default:
        return;
    }
    req->active = 0;
    if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_CL || DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_SV) {
        if (!DWCi_CheckMatchRetryLimit(1)) {
            return;
        }
    } else if (!DWCi_CheckMatchRetryLimit(0)) {
        return;
    }
    DWCi_GetMatchWork()->retryCount = 0;
    DWCi_GetMatchWork()->retryProfile = 0;
    w = DWCi_GetMatchWork();
    w->retryTick = 0;
    w = DWCi_GetMatchWork();
    if (DWCi_DropConnectingPeer(w->profiles[DWCi_GetMatchWork()->players + 1])) {
        return;
    }
}
