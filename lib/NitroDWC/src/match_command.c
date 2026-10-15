#pragma force_active on
#include <string.h>

#include "global.h"

#include "dwc/match_internal.h"
#include "dwc/net_common_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

// Matchmaking commands: resetting the matchmaking state, the server search filter, exchanging the NAT
// negotiation addresses and sending a command to a peer (as a "GPCM" buddy message or a raw "SBCM" packet).

// "SBCM" command packet sent by DWCi_SendSBMsgCommand.
typedef struct MatchCommandPacket {
    MatchCommandHeader header;
    u32 data[32]; // 0x14
} MatchCommandPacket;

extern const char sFmt_Uint_2[]; // "%u"
extern const char sStr_dwc_pid[]; // "dwc_pid"
extern const char sStr_dwc_mtype[]; // "dwc_mtype"
extern const char sStr_dwc_mresv[]; // "dwc_mresv"
extern const char sStr_dwc_mver[]; // "dwc_mver"
extern const char sStr_dwc_eval[]; // "dwc_eval"
extern const char sFmt_And[]; // " and (%s)"
extern const char sFmt_StrSpaceEqSpaceUint[]; // "%s = %u"
extern const char sFmt_AndNeAndMaxplayersAndNumplayersLtAndAndNe[]; // "%s = %d and %s != %u and maxplayers = %d and numplayers < %d and %s = %d and %s != %s"
extern const char sFmt_SlashUint[]; // "/%u"
extern const char sStr_SBCM[]; // "SBCM"
extern const char sFmt_StrIntV_Str[]; // "%s%dv%s"
extern const char sStr_GPCM_2[]; // "GPCM"
extern const char sStr_MAT_2[]; // "MAT"

extern u32 SOC_GetHostID(void);
extern char *strchr(const char *s, int c);
extern void DWCi_NNProgressCallback(void);
extern int gpSendBuddyMessageA(void *connection, u32 profile, const char *message);
extern u32 gt2GetLocalPort(void *connection);
extern void *gt2GetSocketSOCKET(void *connection);
extern u32 gt2AddressToString(u32 addr, u16 port, int flag);
extern int NNBeginNegotiationWithSocket(void *socket, void *data, int flag, void (*callback)(void), void (*resultCallback)(int, int, MatchAddr *, MatchRequest *), MatchRequest *req);
extern void qr2_register_keyA(int key, const char *name);
extern u32 SBServerGetPublicInetAddress(void *server);
extern u16 SBServerGetPublicQueryPort(void *server);
extern int SBServerHasPrivateAddress(void *server);
extern u32 SBServerGetPrivateInetAddress(void *server);
extern u32 SBServerGetPrivateQueryPort(void *server);
extern void ServerBrowserFree(void *list);
extern int ServerBrowserLimitUpdateA(void *list, int a, int b, u8 *keys, int count, char *filter, int c);
extern int ServerBrowserSendMessageToServerA(void *list, u32 addr, u32 port, MatchCommandPacket *packet, int size);
extern int ServerBrowserSendNatNegotiateCookieToServerA(void *list, u32 addr, u32 port, void *data);
extern void ServerBrowserClear(void *list);
extern u32 ServerBrowserGetMyPublicIP(void *list);

int DWCi_SendMatchCommand(u8 command, u32 profile, u32 addr, u16 port, u32 *data, int count);

void DWCi_ResetMatchParam(int mode) {
    MatchWork *w;
    DWCi_GetMatchWork()->flag = 0;
    DWCi_GetMatchWork()->retryCount = 0;
    w = DWCi_GetMatchWork();
    w->cookieRandom = DWCi_GetRandom(0x10000);
    DWCi_GetMatchWork()->retryProfile = 0;
    w = DWCi_GetMatchWork();
    w->retryTick = 0;
    w = DWCi_GetMatchWork();
    w->waitTick = 0;
    DWCi_GetMatchWork()->initial = 0;
    DWCi_GetMatchWork()->cancelling = 0;
    DWCi_GetMatchWork()->reservationRetries = 0;
    DWCi_GetMatchWork()->readyRetries = 0;
    DWCi_GetMatchWork()->closeRetries = 0;
    DWCi_GetMatchWork()->nextServerRetries = 0;
    DWCi_GetMatchWork()->closeState = 0;
    DWCi_GetMatchWork()->closeDelay = 0;
    DWCi_GetMatchWork()->remotePort = 0;
    DWCi_GetMatchWork()->remoteAddr = 0;
    w = DWCi_GetMatchWork();
    w->readyTick = 0;
    w = DWCi_GetMatchWork();
    w->restartWaitTick = 0;
    MIi_CpuClear32(0, (u32 *)&DWCi_GetMatchWork()->sentCommand, 0x98);
    if (mode == 2) {
        w = DWCi_GetMatchWork();
        w->connections = DWCi_GetMatchWork()->players;
        if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_CL) {
            DWCi_SetMatchState(1);
        } else if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_SV) {
            DWCi_SetMatchState(10);
        }
        return;
    }
    DWCi_GetMatchWork()->players = 0;
    DWCi_GetMatchWork()->aidCount = 0;
    DWCi_GetMatchWork()->connections = 0;
    DWCi_GetMatchWork()->newPeerPending = 0;
    DWCi_GetMatchWork()->newPeerProfile = 0;
    DWCi_GetMatchWork()->searchWait = 0;
    DWCi_GetMatchWork()->current = 0;
    DWCi_GetMatchWork()->maxSize = 0;
    DWCi_GetMatchWork()->active = 0;
    w = DWCi_GetMatchWork();
    w->activeTick = 0;
    DWCi_GetMatchWork()->delay = 0;
    w = DWCi_GetMatchWork();
    w->time = 0;
    DWCi_GetMatchWork()->readyMask = 0;
    DWCi_GetMatchWork()->target = 0;
    DWCi_GetMatchWork()->nextServerProfile = 0;
    DWCi_GetMatchWork()->aidMask = 0;
    MIi_CpuClear32(0, DWCi_GetMatchWork()->addresses, 128);
    MIi_CpuClear16(0, DWCi_GetMatchWork()->ports, 64);
    MIi_CpuClear32(0, (u32 *)DWCi_GetMatchWork()->profiles, 128);
    MIi_CpuClear32(0, (u32 *)&DWCi_GetMatchWork()->request, 12);
    MIi_CpuClear32(0, DWCi_GetMatchWork()->addr2, 128);
    MIi_CpuClear16(0, DWCi_GetMatchWork()->port2, 64);
    MI_CpuFill8(DWCi_GetMatchWork()->aids, 0, 32);
    MIi_CpuClear32(0, &DWCi_GetMatchWork()->serverPeerCount, 0x84);
    if (mode == 1) {
        if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_ANYBODY) {
            DWCi_SetMatchState(3);
        } else if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_FRIEND) {
            DWCi_SetMatchState(4);
        }
        return;
    }
    DWCi_GetMatchWork()->mode = DWC_MATCH_TYPE_ANYBODY;
    DWCi_GetMatchWork()->limit = 0;
    DWCi_GetMatchWork()->qr2ShutdownPending = 0;
    DWCi_GetMatchWork()->eventPeerProfile = 0;
    DWCi_GetMatchWork()->unk_1A6 = 0;
    DWCi_GetMatchWork()->stopPending = 0;
    DWCi_GetMatchWork()->serverPollCount = 0;
    w = DWCi_GetMatchWork();
    w->serverPollTick = 0;
    DWCi_GetMatchWork()->newPeerCallback = NULL;
    DWCi_GetMatchWork()->newPeerParam = NULL;
}

void DWCi_SetMatchCommonParam(int mode, int limit, MatchErrorCallback callback, void *param) {
    DWCi_ResetMatchParam(0);
    DWCi_GetMatchWork()->mode = mode;
    DWCi_GetMatchWork()->limit = limit;
    DWCi_GetMatchWork()->errorCallback = callback;
    DWCi_GetMatchWork()->errorParam = param;
    DWCi_GetMatchWork()->matchRetryCount = 0;
    DWCi_GetMatchWork()->aids[0] = 0;
    qr2_register_keyA(50, sStr_dwc_pid);
    qr2_register_keyA(51, sStr_dwc_mtype);
    qr2_register_keyA(52, sStr_dwc_mresv);
    qr2_register_keyA(53, sStr_dwc_mver);
    qr2_register_keyA(54, sStr_dwc_eval);
}

void DWCi_CloseMatching(void) {
    if (!DWCi_GetMatchWork()) {
        return;
    }
    if (DWCi_GetMatchWork()->list) {
        if (gDwcMatch.busy) {
            gDwcMatch.freeBrowser = 1;
        } else {
            ServerBrowserFree(DWCi_GetMatchWork()->list);
            DWCi_GetMatchWork()->list = NULL;
        }
    }
    DWCi_NNFreeNegotiateList();
    DWCi_SetMatchState(0);
    if (gDwcMatch.filter) {
        DWC_Free(4, gDwcMatch.filter, 0);
        gDwcMatch.filter = NULL;
    }
    DWCi_ClearMatchKeys();
    DWCi_GetMatchWork()->qr2ShutdownPending = 1;
}

// Starts the server list update with the matchmaking keys and the filter for the current state.
int DWCi_UpdateServerListAsync(int profile) {
    struct {
        u8 keys[161];
        char filter[256];
    } search;

    int count = 7, i, n, result;
    u8 *dst;
    search.keys[0] = 8;
    search.keys[1] = 10;
    search.keys[2] = 50;
    search.keys[3] = 51;
    search.keys[4] = 52;
    search.keys[5] = 53;
    search.keys[6] = 54;
    if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_ANYBODY || DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_FRIEND) {
        MatchKeyEntry *entry = gDwcMatchKeys;
        dst = search.keys + 7;
        for (i = 0; i < 154; i++, entry++) {
            u8 id = entry->id;
            if (id) {
                *dst++ = id;
                count++;
            }
        }
    }
    switch (DWCi_GetMatchWork()->state) {
    case 0:
    case 1:
    default:
        break;
    case 3:
        if (DWCi_GetMatchWork()->nextServerProfile == 0) {
            volatile MatchWork *a = DWCi_GetMatchWork();
            volatile MatchWork *b = DWCi_GetMatchWork();
            volatile MatchWork *c = DWCi_GetMatchWork();
            u32 identity = a->identity;
            u8 limit = b->limit;
            u8 mode = c->mode;
            n = DWCi_GetDefaultMatchFilter(search.filter, identity, limit, mode);
            if (gDwcMatch.filter) {
                OS_SNPrintf(search.filter + n, 256 - n, sFmt_And, gDwcMatch.filter);
            }
            break;
        }
        profile = DWCi_GetMatchWork()->nextServerProfile;
    case 2:
    case 4:
    case 5:
        OS_SNPrintf(search.filter, 256, sFmt_StrSpaceEqSpaceUint, sStr_dwc_pid, profile);
        DWCi_GetMatchWork()->target = profile;
        break;
    }
    ServerBrowserClear(DWCi_GetMatchWork()->list);
    i = 0;
    do {
        result = ServerBrowserLimitUpdateA(DWCi_GetMatchWork()->list, 1, 0, search.keys, count, search.filter, 6);
        if (result == 0 || result != 2) {
            break;
        }
        i++;
    } while (i < 5);
    if (result == 0) {
        MatchWork *w = DWCi_GetMatchWork();
        w->pending = OS_GetTick() + 0xEFB5F7;
    }
    return result;
}

int DWCi_GetDefaultMatchFilter(char *out, int identity, int limit, int mode) {
    return OS_SNPrintf(out, 256, sFmt_AndNeAndMaxplayersAndNumplayersLtAndAndNe, sStr_dwc_mver, 3, sStr_dwc_pid, identity, limit, limit, sStr_dwc_mtype, mode, sStr_dwc_mresv, sStr_dwc_pid);
}

// Mode 0: the server was found, send it our address (command 6) unless it is behind the same NAT; otherwise
// start the NAT negotiation for value.
int DWCi_StartNatNegotiation(int mode, u32 value, void *server) {
    MatchWork *w = DWCi_GetMatchWork();
    int index = w->connections, retry;
    unsigned result = 0;
    u32 local[2];
    if (mode == 0) {
        w = DWCi_GetMatchWork();
        value = (w->identity & 0xFFFF) | (DWCi_GetMatchWork()->cookieRandom << 16);
        if (SBServerHasPrivateAddress(server)) {
            u32 ip = SBServerGetPublicInetAddress(server);
            if (ip != ServerBrowserGetMyPublicIP(DWCi_GetMatchWork()->list)) {
                retry = 1;
            } else {
                w = DWCi_GetMatchWork();
                w->addr2[index] = SBServerGetPrivateInetAddress(server);
                w = DWCi_GetMatchWork();
                w->port2[index] = SBServerGetPrivateQueryPort(server);
                retry = result;
            }
        } else {
            u32 ip = (u16)SOC_GetHostID();
            // 192.168.x.x, 172.16-31.x.x, 10.x.x.x
            if ((u16)ip == 0xA8C0 || ((ip & 0xFF) == 0xAC && (ip & 0xFF00) >= 0x1000 && (ip & 0xFF00) <= 0x1F00) || (ip & 0xFF) == 10) {
                retry = 1;
            } else {
                w = DWCi_GetMatchWork();
                w->addr2[index] = SBServerGetPublicInetAddress(server);
                w = DWCi_GetMatchWork();
                w->port2[index] = SBServerGetPublicQueryPort(server);
                retry = 0;
            }
        }
        if (retry) {
            w = DWCi_GetMatchWork();
            w->cookieRandom = DWCi_GetRandom(0x10000);
            DWCi_GetMatchWork()->request.active = value;
        } else {
            local[0] = SOC_GetHostID();
            local[1] = gt2GetLocalPort(*DWCi_GetMatchWork()->peer);
            w = DWCi_GetMatchWork();
            value = SBServerGetPublicInetAddress(server);
            {
                int error = DWCi_SendMatchCommand(6, w->profiles[index], value, SBServerGetPublicQueryPort(server), local, 2);
                DWCi_GetMatchWork()->commandRetries = 0;
                if (error) {
                    return 2;
                }
            }
            DWCi_GetMatchWork()->request.active = 0;
        }
        DWCi_GetMatchWork()->request.flag = 0;
        DWCi_GetMatchWork()->request.retries = 0;
        w = DWCi_GetMatchWork();
        w->request.port = SBServerGetPublicQueryPort(server);
        w = DWCi_GetMatchWork();
        w->request.address = SBServerGetPublicInetAddress(server);
    } else {
        DWCi_GetMatchWork()->request.flag = 1;
        DWCi_GetMatchWork()->request.retries = result;
        DWCi_GetMatchWork()->request.port = result;
        DWCi_GetMatchWork()->request.address = result;
        DWCi_GetMatchWork()->request.active = value;
        retry = 1;
    }
    if (retry) {
        result = DWCi_DoNatNegotiationAsync(&DWCi_GetMatchWork()->request);
    } else {
        u32 socket = (u32)gt2GetSocketSOCKET(*DWCi_GetMatchWork()->peer);
        DWCi_NNCompletedCallback(0, socket, NULL, &DWCi_GetMatchWork()->request);
        w = DWCi_GetMatchWork();
        w->waitTick = 0;
    }
    return result;
}

int DWCi_DoNatNegotiationAsync(MatchRequest *req) {
    int i, result;
    if (req->flag == 0) {
        MatchWork *w = DWCi_GetMatchWork();
        u32 addr = gt2AddressToString(req->address, 0, 0);
        if (DWCi_HandleSBError(ServerBrowserSendNatNegotiateCookieToServerA(w->list, addr, req->port, (void *)req->active)) != 0) {
            return 2;
        }
    }
    for (i = 0; i < 5; i++) {
        void *socket = gt2GetSocketSOCKET(*DWCi_GetMatchWork()->peer);
        result = NNBeginNegotiationWithSocket(socket, (void *)req->active, req->flag, DWCi_NNProgressCallback, DWCi_NNCompletedCallback, req);
        if (result == 0) {
            return result;
        }
        if (result != 3) {
            return result;
        }
    }
    return result;
}

// Sends command to profile, as a raw packet to addr:port while the server connection is used for the
// NAT negotiation, otherwise as a buddy message ("GPCM3vMAT", command, "/"-separated data). Commands 2, 6, 8
// and 9 are kept for resending.
int DWCi_SendMatchCommand(u8 command, u32 profile, u32 addr, u16 port, u32 *data, int count) {
    char number[16];
    char args[512];
    int length = 0, result, i, n;
    if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_ANYBODY || ((DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_CL || DWCi_GetMatchWork()->unk_1A6 != 0) && command == 6)) {
        result = DWCi_SendSBMsgCommand(command, addr, port, data, count);
    } else {
        if (data && count) {
            length = OS_SNPrintf(args, 512, sFmt_Uint_2, data[0]);
            for (i = 1; i < count; i++) {
                n = OS_SNPrintf(number, 16, sFmt_SlashUint, data[i]);
                if ((u32)(length + n + 1) > 512) {
                    break;
                }
                MI_CpuCopy8(number, args + length, n);
                length += n;
            }
        }
        args[length] = 0;
        result = DWCi_SendGPBuddyMsgCommand(DWCi_GetMatchWork()->gpConnection, command, profile, args);
    }
    if (command == 2 || command == 6 || command == 8 || command == 9) {
        DWCi_GetMatchWork()->sentCommand = command;
        DWCi_GetMatchWork()->commandPort = port;
        DWCi_GetMatchWork()->commandAddr = addr;
        DWCi_GetMatchWork()->commandProfile = profile;
        DWCi_GetMatchWork()->commandSize = count;
        {
            MatchWork *w = DWCi_GetMatchWork();
            w->commandTick = OS_GetTick();
        }
        if (data && count) {
            MIi_CpuCopy32(data, (u32 *)DWCi_GetMatchWork()->commandData, count * 4);
        }
    }
    return result;
}

int DWCi_SendSBMsgCommand(int command, u32 addr, u32 port, const u32 *data, u32 count) {
    MatchCommandPacket packet;
    int i;
    int result;
    if (count > 32) {
        count = 32;
    }
    if (data == NULL || count == 0) {
        count = 0;
    } else {
        MIi_CpuCopy32(data, packet.data, count * 4);
    }
    memcpy(packet.header.magic, sStr_SBCM, 5);
    packet.header.version = 3;
    packet.header.type = command;
    packet.header.size = count * 4;
    packet.header.value = DWCi_GetMatchWork()->port;
    packet.header.arg0 = DWCi_GetMatchWork()->addr;
    packet.header.arg1 = DWCi_GetMatchWork()->identity;
    for (i = 0; i < 5; i++) {
        result = ServerBrowserSendMessageToServerA(DWCi_GetMatchWork()->list, gt2AddressToString(addr, 0, 0), port, &packet, packet.header.size + 20);
        if (result == 0) {
            return result;
        }
        if (result != 2) {
            return result;
        }
    }
    return result;
}

int DWCi_SendGPBuddyMsgCommand(void *connection, int command, u32 profile, const char *args) {
    char message[512];
    int n = OS_SNPrintf(message, 512, sFmt_StrIntV_Str, sStr_GPCM_2, 3, sStr_MAT_2);
    char *end;
    message[n] = command;
    (message + 1)[n] = 0;
    end = message + 1 + n;
    if (args) {
        u32 size = strlen(args);
        if (n + 2 + size > 512) {
            size = 511 - (n + 1);
        }
        MI_CpuCopy8(args, end, size);
        end[size] = 0;
    }
    return gpSendBuddyMessageA(connection, profile, message);
}

// Copies the index-th "/"-separated field of s to out; returns its length, or -1.
int DWCi_GetCommandField(char *out, const char *s, int index) {
    char *end = strchr(s, 0), *stop;
    int i, n;
    for (i = 0; i < index; i++) {
        stop = strchr(s, '/');
        if (!stop) {
            return -1;
        }
        s = stop + 1;
    }
    stop = strchr(s, '/');
    if (!stop) {
        stop = end;
    }
    if (s == stop) {
        return -1;
    }
    n = stop - s;
    MI_CpuCopy8(s, out, n);
    out[n] = 0;
    return n;
}
