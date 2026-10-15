#pragma force_active on
#include <string.h>

#include "global.h"

#include "dwc/match_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

#pragma warn_uninitializedvar off

// Matchmaking peer connections: raw packets for the query/reporting and NAT negotiation code, accepting and
// opening the peer connections, the "SBCM" command argument parser, aborting a match with an error, the
// match messages exchanged by the peers, dropping a peer, the aid lists and the server's custom keys.

// Address of a raw packet, 8 bytes.
typedef struct MatchPacketAddr {
    u8 unk_00;
    u8 family; // 0x01
    u16 port;  // 0x02, network byte order
    u32 address;
} MatchPacketAddr;

// Connection slot of DWCi_GetConnectionInfoByIdx, 8 bytes.
typedef struct MatchConnSlot {
    u8 index;
    u8 aid;     // 0x01
    u16 unk_02; // 0x02
    u32 unk_04; // 0x04
} MatchConnSlot;

extern const u8 NNMagicData[];   // NAT negotiation magic, 6 bytes
extern const char sStr_Empty_5[]; // ""
extern const char sFmt_Uint_2[]; // "%u"
extern const char sStr_VER[]; // "VER"
extern const char sStr_InitState[]; // "Init state"
extern const char sStr_ServerFull[]; // "Server full"
extern const char sStr_UnknownConnectAttempt[]; // "Unknown connect attempt"
extern const char sStr_SCM_3[]; // "SCM"
extern const char sStr_SCN_3[]; // "SCN"
extern u8 gDwcValidAidList[];

extern int memcmp(const void *, const void *, u32);
extern u32 strtoul(const char *, char **, int);
extern void DWCi_SetError(int kind, int code);
extern void DWC_Free(int kind, void *p, int size);
extern void DWC_SetCommonKeyValueString(const char *key, const char *value, void *buf, int size);
extern void DWC_AddCommonKeyValueString(const char *key, const char *value, void *buf, int size);
extern int DWCi_GetState(void);
extern int DWCi_GetFreeConnectionIndex(void);
extern void **DWCi_GetGT2ConnectionByIdx(int index);
extern MatchConnSlot *DWCi_GetConnectionInfoByIdx(int index);
extern int DWCi_GetFriendListIndex(int profile);
extern int DWCi_SetGPStatus(int type, const void *message, int arg);
extern int DWCi_HandleGT2Error(unsigned error);
extern u32 DWCi_GetPeerAidBitmap(int flag);
extern int gt2Accept(void *connection, void *callbacks);
extern void gt2Reject(void *connection, const char *message, int size);
extern int gt2Connect(void *socket, int a, u32 remote, char *message, int size, int timeout, void *callbacks, int blocking);
extern void gt2CloseAllConnectionsHard(void *connection);
// Called with two and with three arguments.
extern void gt2SetConnectionData(void *connection, MatchConnSlot *slot, ...);
extern u32 gt2AddressToString(u32 addr, u16 port, int flag);
extern void NNCancel(void *p);
extern void NNProcessData(u8 *data, u32 size, MatchPacketAddr *addr);
extern void qr2_send_statechanged(void *reporting);
extern void qr2_parse_queryA(void *reporting, u8 *data, u32 size, MatchPacketAddr *addr);

#pragma opt_optimizecontrolflow off

// Raw packet from address:port: query/reporting packets (0xFE 0xFD or '\') and NAT negotiation packets.
int DWCi_GT2UnrecognizedMessageCallback(void *unused, u32 address, int port, u8 *data, u32 size) {
    MatchPacketAddr addr;
    u8 tag;
    if (size == 0 || data == 0) {
        return 0;
    }
    MI_CpuClear32(&addr, sizeof(addr));
    addr.family = 2;
    addr.port = ((port >> 8) & 255) | ((port << 8) & 0xff00);
    addr.address = address;
    tag = data[0];
    if ((tag == 254 && data[1] == 253) || tag == 92) {
        if (DWCi_GetMatchWork()->reporting) {
            qr2_parse_queryA(DWCi_GetMatchWork()->reporting, data, size, &addr);
        }
    } else if (memcmp(data, NNMagicData, 6) == 0) {
        NNProcessData(data, size, &addr);
    } else {
        if (tag == 254) {
            return 0;
        } else {
            return 0;
        }
    }
    return 1;
}

#pragma opt_optimizecontrolflow reset

// Incoming connection: accepted if it comes from the expected peer (address and port, or its profile id in
// option), refused otherwise.
void DWCi_GT2ConnectAttemptCallback(void *unused, void *connection, u32 address, int port, int maxSize, u8 *option) {
    int index;
    MatchWork *work;
    MatchConnSlot *slot;
    void **entry;
    if (DWCi_GetMatchWork() == 0 || DWCi_GetMatchWork()->state != 7 || DWCi_GetMatchWork()->cancelling != 0) {
        gt2Reject(connection, sStr_InitState, -1);
        return;
    }
    index = DWCi_GetFreeConnectionIndex();
    if (index == -1) {
        gt2Reject(connection, sStr_ServerFull, -1);
        DWCi_StopMatching(6, -87100);
        return;
    }
    work = DWCi_GetMatchWork();
    if (address != work->addr2[DWCi_GetMatchWork()->players]) {
        goto different;
    }
    work = DWCi_GetMatchWork();
    if (port == work->port2[DWCi_GetMatchWork()->players]) {
        goto accepted;
    }
different:
    if (option[0]) {
        u32 profile = strtoul((char *)option, 0, 10);
        MatchWork *dest = DWCi_GetMatchWork();
        if (profile == dest->profiles[DWCi_GetMatchWork()->players]) {
            dest = DWCi_GetMatchWork();
            dest->addr2[DWCi_GetMatchWork()->players] = address;
            dest = DWCi_GetMatchWork();
            dest->port2[DWCi_GetMatchWork()->players] = port;
            goto accepted;
        }
    }
    gt2Reject(connection, sStr_UnknownConnectAttempt, -1);
    return;
accepted:
    work = DWCi_GetMatchWork();
    work->waitTick = 0;
    if (gt2Accept(connection, DWCi_GetMatchWork()->callback) == 0) {
        DWCi_StopMatching(6, -80410);
        return;
    }
    DWCi_ClearSentCommand();
    if (DWCi_GetMatchWork()->players == 0) {
        int half = maxSize >> 1;
        if (half >= 65535) {
            half = 65535;
        }
        DWCi_GetMatchWork()->maxSize = half;
    }
    entry = DWCi_GetGT2ConnectionByIdx(index);
    slot = DWCi_GetConnectionInfoByIdx(index);
    *entry = connection;
    work = DWCi_GetMatchWork();
    work->players++;
    slot->index = index;
    work = DWCi_GetMatchWork();
    slot->aid = work->aids[DWCi_GetMatchWork()->players - 1];
    slot->unk_02 = 0;
    slot->unk_04 = 0;
    gt2SetConnectionData(connection, slot, 0);
    DWCi_AdvanceJoin(2);
}

// Result of connecting to the next peer: 5 pending, 6 retry (up to 5 times), 0 connected.
void DWCi_GT2ConnectedCallback(void *connection, int result) {
    char name[12];
    int ret;
    if (DWCi_GetMatchWork() == NULL) {
        return;
    }
    if (DWCi_GetMatchWork()->state != 7 && DWCi_GetMatchWork()->state != 12) {
        return;
    }
    switch (result) {
    case 5:
        return;
    case 6:
        DWCi_GetMatchWork()->flag++;
        if (DWCi_GetMatchWork()->flag > 5) {
            DWCi_GetMatchWork()->flag = 0;
            DWCi_DropConnectingPeer(DWCi_GetMatchWork()->profiles[DWCi_GetMatchWork()->connections]);
            return;
        }
        OS_SNPrintf(name, sizeof(name), sFmt_Uint_2, DWCi_GetMatchWork()->identity);
        ret = gt2Connect(*DWCi_GetMatchWork()->peer, 0, gt2AddressToString(DWCi_GetMatchWork()->addr2[DWCi_GetMatchWork()->connections], DWCi_GetMatchWork()->port2[DWCi_GetMatchWork()->connections], 0), name, -1, 5000, DWCi_GetMatchWork()->callback, 0);
        if (ret == 1) {
            DWCi_HandleGT2Error(ret);
            return;
        }
        if (ret == 0) {
            return;
        }
        if (DWCi_DropConnectingPeer(DWCi_GetMatchWork()->profiles[DWCi_GetMatchWork()->connections])) {
            return;
        }
        break;
    default:
        if (DWCi_DropConnectingPeer(DWCi_GetMatchWork()->profiles[DWCi_GetMatchWork()->players + 1])) {
            return;
        }
        break;
    case 0:
        int index;
        void **entry;
        MatchConnSlot *slot;
        if ((index = DWCi_GetFreeConnectionIndex()) == -1) {
            DWCi_StopMatching(6, -87100);
            return;
        }
        entry = DWCi_GetGT2ConnectionByIdx(index);
        slot = DWCi_GetConnectionInfoByIdx(index);
        *entry = connection;
        DWCi_GetMatchWork()->players++;
        slot->index = index;
        slot->unk_02 = 0;
        slot->unk_04 = 0;
        slot->aid = DWCi_GetMatchWork()->aids[DWCi_GetMatchWork()->players];
        gt2SetConnectionData(connection, slot);
        if (DWCi_GetMatchWork()->state == 12) {
            DWCi_AdvanceJoin(0);
        } else {
            DWCi_AdvanceJoin(1);
        }
        break;
    }
}

// Parses the comma separated numbers after the command byte of s and runs the command.
int DWCi_ProcessGPMatchCommand(int unused, void *arg, u8 *s) {
    char number[16];
    int values[128];
    int i = 0;
    while (i < 128) {
        if (DWCi_GetCommandField(number, (char *)s + 1, i) == -1) {
            break;
        }
        values[i] = strtoul(number, 0, 10);
        i++;
    }
    return DWCi_ProcessMatchCommand(*s, (int)arg, 0, 0, values, i);
}

void DWCi_ClearSentCommand(void) {
    DWCi_GetMatchWork()->sentCommand = 255;
    DWCi_GetMatchWork()->commandRetries = 0;
}

// Ends the match with an error (kind 0: no error) and reports it to the error callback.
void DWCi_StopMatching(int kind, int code) {
    BOOL isServer, noFriend;
    int friendIndex;
    MatchWork *work;
    if (!DWCi_GetMatchWork() || !kind) {
        return;
    }
    DWCi_CloseAllConnectionsHard();
    DWCi_SetError(kind, code);
    DWCi_SetGPStatus(DWC_STATUS_ONLINE, sStr_Empty_5, 0);
    isServer = DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_SV;
    noFriend = DWCi_GetMatchWork()->eventPeerProfile == 0;
    work = DWCi_GetMatchWork();
    friendIndex = DWCi_GetFriendListIndex(DWCi_GetMatchWork()->eventPeerProfile);
    work->errorCallback(kind, 0, noFriend, isServer, friendIndex, DWCi_GetMatchWork()->errorParam);
    DWCi_CloseMatching();
}

void DWCi_ResetReportedPlayerCount(void) {
    if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_SV) {
        return;
    }
    DWCi_GetMatchWork()->connections = 0;
    DWCi_GetMatchWork()->limit = 0;
    qr2_send_statechanged(DWCi_GetMatchWork()->reporting);
}

// Match message from peer aid: 2 = server accepted us, 3 = peer ready (data: its max size), 4 = all ready.
void DWCi_ProcessMatchSynPacket(int aid, int message, u8 *data) {
    int i;
    MatchWork *work;
    switch (message) {
    case 2:
        if (DWCi_GetMatchWork()->state == 1) {
            if (data[0] == 1) {
                DWCi_GetMatchWork()->eventPeerProfile = 0;
            }
            i = data[1];
            DWCi_GetMatchWork()->aids[i] = data[2];
            work = DWCi_GetMatchWork();
            work->profiles[i] = DWCi_GetMatchWork()->identity;
            if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_ANYBODY || DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_FRIEND) {
                work = DWCi_GetMatchWork();
                work->limit = DWCi_GetMatchWork()->players;
            }
            DWCi_GetMatchWork()->serverPollCount = 0;
            DWCi_SetMatchState(9);
        }
        DWCi_SendMatchSynPacket(aid, 3);
        break;
    case 3:
        if (DWCi_GetMatchWork()->state == 16) {
            int value;
            work = DWCi_GetMatchWork();
            work->readyMask |= 1 << aid;
            value = data[0] | data[1] << 8;
            if (value > DWCi_GetMatchWork()->maxSize) {
                DWCi_GetMatchWork()->maxSize = value;
            }
            value = DWCi_GetPeerAidBitmap(0);
            if (value != DWCi_GetMatchWork()->readyMask) {
                return;
            }
            for (i = 1; i <= DWCi_GetMatchWork()->players; i++) {
                DWCi_SendMatchSynPacket(DWCi_GetMatchWork()->aids[i], 4);
            }
            DWCi_SetMatchState(17);
        } else {
            DWCi_SendMatchSynPacket(aid, 4);
        }
        break;
    case 4:
        if (DWCi_GetMatchWork()->state == 9) {
            DWCi_AdvanceJoin(4);
        }
        break;
    }
}

// The connection to the server was closed (error: kind of the error, 0 if none).
int DWCi_HandleServerConnectionClosed(int kind, int code) {
    if (DWCi_GetState() != DWC_STATE_MATCHING) {
        return 0;
    }
    if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_SV) {
        return 1;
    }
    if (kind != 0) {
        DWCi_StopMatching(kind, code - 80000);
        return 1;
    }
    DWCi_GetMatchWork()->aids[0] = 0;
    if (DWCi_GetMatchWork()->cancelling == 1 || DWCi_GetMatchWork()->closeState == 1 || DWCi_GetMatchWork()->closeState == 2) {
        return 1;
    }
    if (DWCi_GetMatchWork()->request.active) {
        NNCancel((void *)DWCi_GetMatchWork()->request.active);
        DWCi_GetMatchWork()->request.active = 0;
    }
    if (DWCi_GetMatchWork()->players) {
        if (DWCi_GetMatchWork()->closeState == 0) {
            DWCi_GetMatchWork()->closeState = 3;
            gt2CloseAllConnectionsHard(*DWCi_GetMatchWork()->peer);
        }
    } else if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_CL) {
        DWCi_StopMatching(6, -80430);
    } else if (DWCi_GetMatchWork()->nextServerProfile) {
        DWCi_RestartWithPendingServer();
    } else if (DWCi_GetMatchWork()->state == 1) {
        MatchWork *work;
        u64 tick;
        DWCi_SetMatchState(18);
        work = DWCi_GetMatchWork();
        tick = OS_GetTick();
        work->restartWaitTick = tick;
    } else {
        DWCi_RestartMatching(1);
    }
    return 1;
}

void DWCi_HandlePeerConnectionClosed(int profile) {
    if (DWCi_GetMatchWork()->closeState == 2) {
        return;
    }
    DWCi_DropConnectingPeer(profile);
}

// Drops the peer with the given profile id from the first count entries.
int DWCi_DeleteHostByProfileID(int profile, int count) {
    int i;
    if (!DWCi_GetMatchWork()) {
        return 0;
    }
    for (i = 0; i < count; i++) {
        if (profile == DWCi_GetMatchWork()->profiles[i]) {
            DWCi_DeleteHostByIndex(i, count);
            return 1;
        }
    }
    return 0;
}

// Removes entry index of the peer lists (count entries), returns its profile id.
int DWCi_DeleteHostByIndex(int index, int count) {
    int profile, i, n;
    MatchWork *work;
    if (!DWCi_GetMatchWork()) {
        return 0;
    }
    profile = DWCi_GetMatchWork()->profiles[index];
    work = DWCi_GetMatchWork();
    work->aidMask &= ~(1 << DWCi_GetMatchWork()->aids[index]);
    DWCi_UpdateValidAidCount();
    if (index < count - 1) {
        n = count - index - 1;
        for (i = 0; i < n; i++) {
            DWCi_GetMatchWork()->addresses[index + i] = DWCi_GetMatchWork()->addresses[index + i + 1];
            DWCi_GetMatchWork()->ports[index + i] = DWCi_GetMatchWork()->ports[index + i + 1];
            DWCi_GetMatchWork()->profiles[index + i] = DWCi_GetMatchWork()->profiles[index + i + 1];
            DWCi_GetMatchWork()->addr2[index + i] = DWCi_GetMatchWork()->addr2[index + i + 1];
            DWCi_GetMatchWork()->port2[index + i] = DWCi_GetMatchWork()->port2[index + i + 1];
            DWCi_GetMatchWork()->aids[index + i] = DWCi_GetMatchWork()->aids[index + i + 1];
        }
    }
    if (count > 0) {
        i = count - 1;
        DWCi_GetMatchWork()->addresses[i] = 0;
        DWCi_GetMatchWork()->ports[i] = 0;
        DWCi_GetMatchWork()->profiles[i] = 0;
        DWCi_GetMatchWork()->addr2[i] = 0;
        DWCi_GetMatchWork()->port2[i] = 0;
        DWCi_GetMatchWork()->aids[i] = 0;
    }
    return profile;
}

int DWCi_GetNumConnectedPeers(void) {
    if (!DWCi_GetMatchWork()) {
        return 0;
    }
    return DWCi_GetMatchWork()->players;
}

int DWCi_GetNumValidAids(void) {
    if (!DWCi_GetMatchWork()) {
        return 0;
    }
    return DWCi_GetMatchWork()->aidCount;
}

void DWCi_UpdateValidAidCount(void) {
    int n = -1, i;
    for (i = 0; i < 32; i++) {
        if (DWCi_GetMatchWork()->aidMask & (1 << i)) {
            n++;
        }
    }
    if (n == -1) {
        DWCi_GetMatchWork()->aidCount = 0;
    } else {
        DWCi_GetMatchWork()->aidCount = n;
    }
}

int DWCi_GetAIDList(u8 **aids) {
    if (!DWCi_GetMatchWork()) {
        return 0;
    }
    *aids = DWCi_GetMatchWork()->aids;
    return DWCi_GetMatchWork()->players + 1;
}

// Copies the aids of the connected peers (up to the first one not in aidMask) to gDwcValidAidList.
int DWCi_GetValidAIDList(u8 **aids) {
    int i;
    if (!DWCi_GetMatchWork()) {
        return 0;
    }
    MI_CpuFill8(gDwcValidAidList, 0, 32);
    for (i = 0; i <= DWCi_GetMatchWork()->aidCount; i++) {
        MatchWork *work = DWCi_GetMatchWork();
        if (!(work->aidMask & (1 << DWCi_GetMatchWork()->aids[i]))) {
            break;
        }
        gDwcValidAidList[i] = DWCi_GetMatchWork()->aids[i];
    }
    *aids = gDwcValidAidList;
    return DWCi_GetMatchWork()->aidCount + 1;
}

// Server only: updates the "SCM" (limit + 1), "SCN" (players + 1) and "VER" (3) keys.
int DWCi_UpdateGameServerStatus(void) {
    char value[12];
    u8 buffer[32];
    if (DWCi_GetMatchWork()->mode != DWC_MATCH_TYPE_SC_SV) {
        return 0;
    }
    OS_SNPrintf(value, 12, sFmt_Uint_2, DWCi_GetMatchWork()->limit + 1);
    DWC_SetCommonKeyValueString(sStr_SCM_3, value, buffer, 47);
    OS_SNPrintf(value, 12, sFmt_Uint_2, DWCi_GetMatchWork()->players + 1);
    DWC_AddCommonKeyValueString(sStr_SCN_3, value, buffer, 47);
    OS_SNPrintf(value, 12, sFmt_Uint_2, 3);
    DWC_AddCommonKeyValueString(sStr_VER, value, buffer, 47);
    return DWCi_SetGPStatus(DWC_STATUS_MATCH_SC_SV, buffer, 0);
}

// Frees the matchmaking state.
void DWCi_ShutdownMatch(void) {
    DWCi_SetMatchWork(NULL);
    if (gDwcMatch.filter) {
        DWC_Free(4, gDwcMatch.filter, 0);
        gDwcMatch.filter = NULL;
    }
    DWCi_ClearMatchKeys();
    if (gDwcMatch.timer) {
        DWC_Free(4, gDwcMatch.timer, 0);
        gDwcMatch.timer = NULL;
    }
    gDwcMatch.scConnectBlock = 0;
    gDwcMatch.scConnectBlocked = 0;
}

BOOL DWCi_IsShutdownMatch(void) {
    return DWCi_GetMatchWork() == NULL;
}
