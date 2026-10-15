#pragma force_active on
#include <string.h>

#include "global.h"

#include "dwc/dwc_main_internal.h"
#include "dwc/net_common_internal.h"
#include "dwc/gp_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

#pragma warn_unusedvar off
#pragma warn_uninitializedvar off

// Main control of the network library: setting up and shutting down the control block, the per-frame
// processing, the log-in / friend list update / matchmaking entry points, the table of GT2 connections
// by aid, and the GT2 / GameSpy callbacks that drive the control state.

// Some u8 fields are read and written through volatile accesses here.
#define VOLATILE_U8(field) (*(volatile u8 *)&(field))

extern char sStr_SCM[]; // "SCM"
extern char sStr_SCN[]; // "SCN"
extern char sStr_Empty_2[]; // ""
extern char sStr_GPCM[]; // "GPCM"
extern char sStr_MAT[]; // "MAT"

extern char *strchr(const char *s, int c);
extern unsigned long strtoul(const char *s, char **end, int base);
extern void CloseStatsConnection(void);
extern int gt2CreateSocket(void **socket, u32 addr, u32 sendSize, u32 recvSize, void (*errorCallback)(void *socket));
extern void gt2CloseSocket(void *socket);
extern void gt2Listen(void *socket, void *callback);
extern void gt2CloseConnectionHard(void *connection);
extern void gt2CloseAllConnectionsHard(void *socket);
extern void gt2SetUnrecognizedMessageCallback(void *socket, void *callback);
extern DwcConnectionInfo *gt2GetConnectionData(void *connection);
extern u32 gt2AddressToString(u32 addr, u16 port, int flag);
extern void qr2_send_statechanged(void *reporting);
extern void qr2_shutdown(void *reporting);
extern void ServerBrowserFree(void *list);
extern void GSIStartAvailableCheck(const char *gameName);
extern int GSIAvailableCheckThink(void);
extern int gpInitialize(GPConnection *connection, int productId, int flag);
extern int gpDestroy(GPConnection *connection);
extern int gpProcess(GPConnection *connection);
extern int gpSetCallback(GPConnection *connection, int type, void *callback, void *param);
extern int gpGetBuddyStatus(GPConnection *connection, int index, FriendBuddyStatus *status);
extern int gpGetBuddyIndex(GPConnection *connection, int profileId, int *index);
extern int gpIsBuddy(GPConnection *connection, int profileId);
extern void DWCi_TransportProcess(void);
extern void DWCi_TransportRecv(void *connection, void *data, int size, int reliable);
extern void DWCi_ResetTransportChannel(u32 aid);
extern void DWCi_ShutdownTransport(void);
extern void DWCi_InitTransport(Transport *transport);

u32 DWCi_WStrLen(const u16 *s) {
    u32 n = 0;
    while (s[n]) {
        n++;
    }
    return n;
}

void DWC_InitFriendsMatch(DwcControl *control, DwcUserData *userData, int productId, const char *gameName, const char *secretKey, int sendBufferSize, int recvBufferSize, DwcAccData *friends, int friendCount) {
    u32 size;
    gDwcControl = control;
    DWC_ClearError();
    gDwcControl->socket = NULL;
    gDwcControl->socketCallbacks[0] = (void *)DWCi_GT2ConnectedCallback;
    gDwcControl->socketCallbacks[1] = (void *)DWCi_GT2ReceivedCallback;
    gDwcControl->socketCallbacks[2] = (void *)DWCi_GT2ClosedCallback;
    gDwcControl->socketCallbacks[3] = (void *)DWCi_GT2PingCallback;
    gDwcControl->bufferSize[0] = sendBufferSize ? sendBufferSize : 0x2000;
    gDwcControl->bufferSize[1] = recvBufferSize ? recvBufferSize : 0x2000;
    gDwcControl->connection = NULL;
    gDwcControl->userData = userData;
    gDwcControl->state = DWC_STATE_INIT;
    gDwcControl->prevState = DWC_STATE_INIT;
    gDwcControl->aid = 0;
    gDwcControl->closing = 0;
    gDwcControl->profileId = 0;
    gDwcControl->gameName = (const char *)gDwcGameName;
    gDwcControl->secretKey = (const char *)gDwcSecretKey;
    gDwcControl->loginCallback = NULL;
    gDwcControl->loginParam = NULL;
    gDwcControl->updateCallback = NULL;
    gDwcControl->updateParam = NULL;
    gDwcControl->matchCallback = NULL;
    gDwcControl->matchParam = NULL;
    gDwcControl->friendMatchCallback = NULL;
    gDwcControl->friendMatchParam = NULL;
    gDwcControl->closedCallback = NULL;
    gDwcControl->closedParam = NULL;
    DWCi_ClearGT2ConnectionList();
    DWCi_LoginInit(&gDwcControl->login, userData, &gDwcControl->connection, productId, userData->gameCode, gDwcControl->playerName, DWCi_LoginCallback, NULL);
    DWCi_FriendInit(&gDwcControl->friends, &gDwcControl->connection, gDwcControl->playerName, friends, friendCount);
    DWCi_MatchInit(&gDwcControl->match, &gDwcControl->connection, &gDwcControl->socket, gDwcControl->socketCallbacks, (const char *)gDwcGameName, (const char *)gDwcSecretKey, friends, friendCount);
    DWCi_InitTransport(&gDwcControl->transport);
    if (strlen(gameName) >= 256) {
        size = 255;
    } else {
        size = strlen(gameName);
    }
    MI_CpuCopy8(gameName, gDwcGameName, size);
    gDwcGameName[size] = 0;
    if (strlen(secretKey) >= 256) {
        size = 255;
    } else {
        size = strlen(secretKey);
    }
    MI_CpuCopy8(secretKey, gDwcSecretKey, size);
    gDwcSecretKey[size] = 0;
}

void DWC_ShutdownFriendsMatch(void) {
    if (!gDwcControl) {
        return;
    }
    if (gDwcControl->match.reporting) {
        qr2_shutdown(gDwcControl->match.reporting);
        gDwcControl->match.reporting = NULL;
    }
    gDwcControl->match.qr2ShutdownPending = 0;
    if (gDwcControl->match.list) {
        ServerBrowserFree(gDwcControl->match.list);
        gDwcControl->match.list = NULL;
    }
    DWCi_NNFreeNegotiateList();
    CloseStatsConnection();
    if (gDwcControl->connection) {
        gpSetCallback(&gDwcControl->connection, GP_CALLBACK_ERROR, NULL, NULL);
        gpSetCallback(&gDwcControl->connection, GP_CALLBACK_BUDDY_MESSAGE, NULL, NULL);
        gpSetCallback(&gDwcControl->connection, GP_CALLBACK_BUDDY_REQUEST, NULL, NULL);
        gpSetCallback(&gDwcControl->connection, GP_CALLBACK_BUDDY_STATUS, NULL, NULL);
        gpProcess(&gDwcControl->connection);
        gpDestroy(&gDwcControl->connection);
        gDwcControl->connection = NULL;
    }
    DWCi_ShutdownLogin();
    DWCi_ShutdownFriend();
    DWCi_ShutdownMatch();
    DWCi_ShutdownTransport();
    if (gDwcControl->socket) {
        gt2CloseSocket(gDwcControl->socket);
        gDwcControl->socket = NULL;
    }
    gDwcControl = NULL;
}

void DWC_ProcessFriendsMatch(void) {
    if (DWC_UpdateConnection()) {
        DWCi_DummyProcess();
    }
    if (!gDwcControl || !gDwcControl->state) {
        return;
    }
    if (DWCi_IsError()) {
        return;
    }
    switch (gDwcControl->state) {
    case DWC_STATE_AVAILABLE_CHECK:
        switch (GSIAvailableCheckThink()) {
        case GSIACAvailable:
            if (DWCi_MainHandleGPError(gpInitialize(&gDwcControl->connection, gDwcControl->login.productId, 0))) {
                return;
            }
            if (DWCi_MainHandleGPError(gpSetCallback(&gDwcControl->connection, GP_CALLBACK_ERROR, DWCi_GPErrorCallback, NULL))) {
                return;
            }
            if (DWCi_MainHandleGPError(gpSetCallback(&gDwcControl->connection, GP_CALLBACK_BUDDY_MESSAGE, DWCi_GPRecvBuddyMessageCallback, NULL))) {
                return;
            }
            if (DWCi_MainHandleGPError(gpSetCallback(&gDwcControl->connection, GP_CALLBACK_BUDDY_REQUEST, DWCi_GPRecvBuddyRequestCallback, NULL))) {
                return;
            }
            if (DWCi_MainHandleGPError(gpSetCallback(&gDwcControl->connection, GP_CALLBACK_BUDDY_STATUS, DWCi_GPRecvBuddyStatusCallback, NULL))) {
                return;
            }
            DWCi_SetState(DWC_STATE_LOGIN);
            DWCi_LoginAsync();
            break;
        case GSIACUnavailable:
            DWCi_StopLogin(3, -20110);
            return;
        case GSIACTemporarilyUnavailable:
            DWCi_StopLogin(4, -20101);
            return;
        }
        break;
    case DWC_STATE_LOGIN:
        DWCi_LoginProcess();
        break;
    case DWC_STATE_ONLINE:
    case DWC_STATE_UPDATE_SERVERS:
        DWCi_FriendProcess();
        DWCi_MatchProcess(FALSE);
        break;
    case DWC_STATE_MATCHING:
        DWCi_MatchProcess(TRUE);
        DWCi_FriendProcess();
        break;
    case DWC_STATE_CONNECTED:
        DWCi_TransportProcess();
        DWCi_FriendProcess();
        if (VOLATILE_U8(gDwcControl->match.mode) == DWC_MATCH_TYPE_SC_SV || VOLATILE_U8(gDwcControl->match.mode) == DWC_MATCH_TYPE_SC_CL) {
            DWCi_MatchProcess(TRUE);
        } else if (gDwcControl->socket) {
            DWCi_MatchProcess(FALSE);
        }
        break;
    }
    if (gDwcControl->match.qr2ShutdownPending == 1) {
        if (gDwcControl->match.reporting) {
            qr2_shutdown(gDwcControl->match.reporting);
            gDwcControl->match.reporting = NULL;
        }
        gDwcControl->match.qr2ShutdownPending = 0;
    }
}

int DWC_LoginAsync(const u16 *playerName, int unused, DwcResultCallback callback, void *param) {
    int length;
    if (!playerName) {
        return 0;
    }
    if (DWCi_IsError() || gDwcControl->state) {
        return 0;
    }
    gDwcControl->loginCallback = callback;
    gDwcControl->loginParam = param;
    if (!playerName || !*playerName) {
        length = 0;
    } else {
        MI_CpuClear16(gDwcControl->playerName, sizeof(gDwcControl->playerName));
        if (DWCi_WStrLen(playerName) > 25) {
            length = 25;
        } else {
            length = DWCi_WStrLen(playerName);
        }
        MI_CpuCopy16(playerName, gDwcControl->playerName, length * 2);
    }
    gDwcControl->playerName[length] = 0;
    if (DWC_GetInetStatus() != 4) {
        DWCi_StopLogin(2, -60010);
        return 1;
    }
    DWCi_SetState(DWC_STATE_AVAILABLE_CHECK);
    GSIStartAvailableCheck(gDwcControl->gameName);
    return 1;
}

int DWC_UpdateServersAsync(int unused, DwcResultCallback callback, void *param, void *statusCallback, void *statusParam, void *deleteCallback, void *deleteParam) {
    if (DWCi_IsError() || gDwcControl->state < DWC_STATE_ONLINE || gDwcControl->state == DWC_STATE_UPDATE_SERVERS) {
        return 0;
    }
    gDwcControl->updateCallback = callback;
    gDwcControl->updateParam = param;
    DWCi_SetState(DWC_STATE_UPDATE_SERVERS);
    DWCi_UpdateServersAsync(gDwcControl->login.token, gDwcControl->login.challenge, (void *)DWCi_UpdateServersCallback, NULL, statusCallback, statusParam, deleteCallback, deleteParam);
    return 1;
}

int DWC_ConnectToAnybodyAsync(int count, const char *filter, DwcResultCallback callback, void *param, void *evalCallback, void *evalParam) {
    if (DWCi_IsError() || gDwcControl->state != DWC_STATE_ONLINE) {
        return 0;
    }
    DWCi_ClearGT2ConnectionList();
    gDwcControl->matchCallback = callback;
    gDwcControl->matchParam = param;
    DWCi_SetState(DWC_STATE_MATCHING);
    DWCi_ConnectToAnybodyAsync((count - 1) & 0xFF, filter, (void *)DWCi_MatchedCallback, NULL, evalCallback, evalParam);
    return 1;
}

int DWC_SetupGameServer(int count, DwcMatchedCallback callback, void *param, void *evalCallback, void *evalParam) {
    if (DWCi_IsError() || gDwcControl->state != DWC_STATE_ONLINE) {
        return 0;
    }
    DWCi_ClearGT2ConnectionList();
    gDwcControl->friendMatchCallback = callback;
    gDwcControl->friendMatchParam = param;
    gDwcControl->aid = 0;
    DWCi_SetState(DWC_STATE_MATCHING);
    DWCi_SetupGameServer((count - 1) & 0xFF, (void *)DWCi_MatchedCallback, NULL, evalCallback, evalParam);
    return 1;
}

int DWC_ConnectToGameServerAsync(int index, DwcMatchedCallback callback, void *param, void *newPeerCallback, void *newPeerParam) {
    struct {
        char value[4];
        int buddyIndex;
        FriendBuddyStatus status;
    } local;

    local.buddyIndex = -1;
    int profileId, error;
    u8 a, b;
    if (DWCi_IsError() != 0 || gDwcControl->state != DWC_STATE_ONLINE) {
        return 0;
    }
    DWCi_ClearGT2ConnectionList();
    gDwcControl->friendMatchCallback = callback;
    gDwcControl->friendMatchParam = param;
    DWCi_SetState(DWC_STATE_MATCHING);
    profileId = DWCi_GetProfileIDFromList(index);
    if (profileId == 0 || gpIsBuddy(&gDwcControl->connection, profileId) == 0) {
        error = 11;
        goto fail;
    }
    gpGetBuddyIndex(&gDwcControl->connection, profileId, &local.buddyIndex);
    gpGetBuddyStatus(&gDwcControl->connection, local.buddyIndex, &local.status);
    if (local.status.status != DWC_STATUS_MATCH_SC_SV) {
        error = 11;
        goto fail;
    }
    local.value[0] = '0';
    DWC_GetCommonValueString(sStr_SCM, local.value, local.status.statusString, '/');
    a = strtoul(local.value, NULL, 10);
    DWC_GetCommonValueString(sStr_SCN, local.value, local.status.statusString, '/');
    b = strtoul(local.value, NULL, 10);
    if (b == a) {
        error = 13;
        goto fail;
    }
    DWCi_ConnectToGameServerAsync(profileId, (void *)DWCi_MatchedCallback, NULL, newPeerCallback, newPeerParam);
    return 1;
fail:
    DWCi_SetError(error, 0);
    gDwcControl->friendMatchCallback(error, FALSE, TRUE, FALSE, 0, gDwcControl->friendMatchParam);
    if (gDwcControl && gDwcControl->state == DWC_STATE_MATCHING) {
        DWCi_SetState(DWC_STATE_ONLINE);
        DWCi_SetGPStatus(DWC_STATUS_ONLINE, sStr_Empty_2, NULL);
    }
    return 1;
}

int DWC_SetConnectionClosedCallback(DwcClosedCallback callback, void *param) {
    if (!gDwcControl) {
        return 0;
    }
    gDwcControl->closedCallback = callback;
    gDwcControl->closedParam = param;
    return 1;
}

int DWC_CloseAllConnectionsHard(void) {
    if (!gDwcControl || DWCi_IsError() || (gDwcControl->state != DWC_STATE_MATCHING && gDwcControl->state != DWC_STATE_CONNECTED)) {
        return -1;
    }
    if (gDwcControl->match.players == 0) {
        DWCi_SetGPStatus(DWC_STATUS_ONLINE, sStr_Empty_2, NULL);
        DWCi_NNFreeNegotiateList();
        DWCi_SetState(DWC_STATE_ONLINE);
        return 1;
    }
    gDwcControl->closing = 1;
    gt2CloseAllConnectionsHard(gDwcControl->socket);
    gDwcControl->closing = 0;
    return 0;
}

int DWC_CloseConnectionHard(int aid) {
    void *connection;
    if (!gDwcControl || DWCi_IsError() || (gDwcControl->state != DWC_STATE_MATCHING && gDwcControl->state != DWC_STATE_CONNECTED)) {
        return -1;
    }
    if ((connection = DWCi_GetGT2Connection(aid)) == NULL) {
        return -2;
    }
    gt2CloseConnectionHard(connection);
    return 0;
}

int DWC_CloseConnectionHardBitmap(u32 *aidMask) {
    u8 i;
    if (!gDwcControl || !aidMask || DWCi_IsError() || (gDwcControl->state != DWC_STATE_MATCHING && gDwcControl->state != DWC_STATE_CONNECTED)) {
        return -1;
    }
    for (i = 0; i < 32; i++) {
        if (*aidMask & (1 << i)) {
            if (i == DWC_GetMyAID()) {
                *aidMask &= ~(1 << i);
            } else if (DWC_CloseConnectionHard(i) != 0) {
                *aidMask &= ~(1 << i);
            }
        }
    }
    return *aidMask ? 0 : -2;
}

int DWC_GetNumConnectionHost(void) {
    if (!gDwcControl) {
        return 0;
    }
    if (VOLATILE_U8(gDwcControl->match.mode) == DWC_MATCH_TYPE_SC_SV || VOLATILE_U8(gDwcControl->match.mode) == DWC_MATCH_TYPE_SC_CL) {
        return DWCi_GetNumValidAids() + 1;
    }
    return DWCi_GetNumConnectedPeers() + 1;
}

int DWC_GetMyAID(void) {
    return gDwcControl ? gDwcControl->aid : 0;
}

int DWC_GetAIDList(u8 **aids) {
    if (!gDwcControl) {
        return 0;
    }
    *aids = gDwcControl->match.aids;
    if (VOLATILE_U8(gDwcControl->match.mode) == DWC_MATCH_TYPE_SC_SV || VOLATILE_U8(gDwcControl->match.mode) == DWC_MATCH_TYPE_SC_CL) {
        return DWCi_GetValidAIDList(aids);
    }
    return DWCi_GetAIDList(aids);
}

u32 DWC_GetAIDBitmap(void) {
    u8 *aids;
    int count;
    if (!gDwcControl) {
        return 0;
    }
    count = DWC_GetAIDList(&aids);
    return DWCi_GetAIDBitmapFromList(aids, count);
}

int DWC_IsValidAID(int aid) {
    if (!gDwcControl) {
        return 0;
    }
    if (!(gDwcControl->match.aidMask & (1 << aid))) {
        return 0;
    }
    return DWCi_IsConnectedAID(aid);
}

int DWCi_GetState(void) {
    return gDwcControl ? gDwcControl->state : 0;
}

int DWCi_CreateGT2Socket(void) {
    u16 port;
    u32 addr;
    DwcControl *control;
    int result;
    if (gDwcControl->socket) {
        return 0;
    }
    port = (u16)(DWCi_GetRandom(0x4000) + 0xC000);
    control = gDwcControl;
    addr = gt2AddressToString(0, port, 0);
    result = gt2CreateSocket(&gDwcControl->socket, addr, control->bufferSize[0], control->bufferSize[1], DWCi_GT2SocketErrorCallback);
    if (DWCi_MainHandleGT2Error(result)) {
        return result;
    }
    gt2Listen(gDwcControl->socket, DWCi_GT2ConnectAttemptCallback);
    gt2SetUnrecognizedMessageCallback(gDwcControl->socket, DWCi_GT2UnrecognizedMessageCallback);
    return result;
}

void *DWCi_GetGT2Connection(int aid) {
    int i;
    if (!gDwcControl) {
        return NULL;
    }
    for (i = 0; i < 32; i++) {
        if (gDwcGt2Connections[i] && aid == gt2GetConnectionData(gDwcGt2Connections[i])->aid) {
            return gDwcGt2Connections[i];
        }
    }
    return NULL;
}

int DWCi_GetConnectionAID(void *connection) {
    return gt2GetConnectionData(connection)->aid;
}

int DWCi_GetConnectionIndex(void *connection) {
    return gt2GetConnectionData(connection)->index;
}

int DWCi_GetFreeConnectionIndex(void) {
    int i;
    for (i = 0; i < 32; i++) {
        if (!gDwcGt2Connections[i]) {
            return i;
        }
    }
    return -1;
}

void DWCi_ClearGT2ConnectionList(void) {
    MIi_CpuClear32(0, (u32 *)gDwcGt2Connections, sizeof(gDwcGt2Connections));
    MIi_CpuClear32(0, (u32 *)gDwcGt2ConnectionInfo, sizeof(gDwcGt2ConnectionInfo));
}

void **DWCi_GetGT2ConnectionByIdx(int index) {
    return &gDwcGt2Connections[index];
}

void **DWCi_GetGT2ConnectionByProfileID(int profileId, int count) {
    u8 i;
    for (i = 0; i < count; i++) {
        if (profileId == gDwcControl->match.profiles[i]) {
            break;
        }
    }
    if (i >= count) {
        return NULL;
    }
    return DWCi_GetGT2ConnectionByIdx(DWCi_GetConnectionIndex(DWCi_GetGT2Connection(gDwcControl->match.aids[i])));
}

u32 *DWCi_GetConnectionInfoByIdx(int index) {
    return gDwcGt2ConnectionInfo[index];
}

BOOL DWCi_IsConnectedAID(int aid) {
    int i;
    for (i = 0; i < 32; i++) {
        if (gDwcGt2Connections[i] && aid == gt2GetConnectionData(gDwcGt2Connections[i])->aid) {
            return TRUE;
        }
    }
    return FALSE;
}

void DWCi_DummyProcess(void) {
}

void DWCi_SetState(int state) {
    gDwcControl->prevState = gDwcControl->state;
    gDwcControl->state = state;
}

// Profile id of the peer with this aid, 0 if there is none.
int DWCi_GetProfileIDFromAID(int aid) {
    u8 *aids;
    int count = DWCi_GetAIDList(&aids);
    int i = 0;
    if (count > 0) {
        u8 *cursor = aids;
        do {
            if (aid == *cursor) {
                break;
            }
            i++;
            cursor++;
        } while (i < count);
    }
    if (i == count) {
        return 0;
    }
    return DWCi_DeleteHostByIndex(i, count);
}

u32 DWCi_GetAIDBitmapFromList(const u8 *aids, int count) {
    u32 mask = 0;
    int i;
    for (i = 0; i < count; i++) {
        mask |= 1 << aids[i];
    }
    return mask;
}

// Reports a GameSpy presence error for the current state.
int DWCi_MainHandleGPError(int error) {
    int code, kind;
    if (!error) {
        return GP_NO_ERROR;
    }
    switch (error) {
    case GP_MEMORY_ERROR:
        kind = 9;
        code = -1;
        break;
    case GP_PARAMETER_ERROR:
        kind = 9;
        code = -2;
        break;
    case GP_NETWORK_ERROR:
        kind = 6;
        code = -10;
        break;
    case GP_SERVER_ERROR:
        kind = 6;
        code = -20;
        break;
    }
    switch (gDwcControl->state) {
    case DWC_STATE_AVAILABLE_CHECK:
        code += -61000;
        DWCi_StopLogin(kind, code);
        break;
    case DWC_STATE_LOGIN:
        code += -61000;
        if (gDwcControl->login.state < 1) {
            DWCi_StopLogin(kind, code);
        }
        break;
    case DWC_STATE_MATCHING:
        code += -81000;
        DWCi_StopMatching(kind, code);
        break;
    case DWC_STATE_UPDATE_SERVERS:
        code += -71000;
        break;
    default:
        code += -91000;
        break;
    }
    DWCi_StopFriendProcess(kind, code);
    return error;
}

// Reports a GT2 socket error.
int DWCi_MainHandleGT2Error(int error) {
    int kind, code;
    if (!error) {
        return 0;
    }
    switch (error) {
    case 1:
        kind = 9;
        code = -1;
        break;
    case 2:
    case 5:
        kind = 0;
        code = 0;
        error = 0;
        break;
    case 3:
        kind = 6;
        code = -10;
        break;
    case 4:
        kind = 6;
        code = -30;
        break;
    case 6:
        kind = 6;
        code = -70;
        break;
    case 7:
        kind = 6;
        code = -80;
        break;
    }
    if (kind) {
        DWCi_StopLogin(kind, code - 67000);
    }
    return error;
}

// Log-in finished.
void DWCi_LoginCallback(int error, int profileId, void *param) {
    if (error == 0) {
        gDwcControl->profileId = profileId;
        DWCi_SetState(DWC_STATE_ONLINE);
        DWCi_ResetFriendPoll();
    } else {
        DWCi_SetState(DWC_STATE_INIT);
    }
    if (gDwcControl->loginCallback) {
        gDwcControl->loginCallback(error, profileId, gDwcControl->loginParam);
    }
}

// Friend list update finished.
void DWCi_UpdateServersCallback(int error, BOOL changed, void *param) {
    if (gDwcControl->prevState != DWC_STATE_UPDATE_SERVERS) {
        DWCi_SetState(gDwcControl->prevState);
    }
    gDwcControl->updateCallback(error, changed, gDwcControl->updateParam);
}

// Matchmaking finished.
void DWCi_MatchedCallback(int error, BOOL cancelled, BOOL self, BOOL isServer, int index, void *param) {
    if (!error && cancelled) {
        if (!gDwcControl->match.state) {
            DWCi_ResetReportedPlayerCount();
            DWCi_SetState(DWC_STATE_ONLINE);
        }
    } else if (!error) {
        DwcControl *control;
        int i;
        int profileId;
        DWCi_SetState(DWC_STATE_CONNECTED);
        control = gDwcControl;
        i = 0;
        if (i <= VOLATILE_U8(control->match.players)) {
            profileId = control->profileId;
            do {
                if (profileId == control->match.profiles[i]) {
                    VOLATILE_U8(gDwcControl->aid) = VOLATILE_U8(gDwcControl->match.aids[i]);
                    break;
                }
            } while (++i <= VOLATILE_U8(control->match.players));
        }
    }
    gDwcControl->match.aidMask = DWCi_GetAIDBitmapFromList(gDwcControl->match.aids, VOLATILE_U8(gDwcControl->match.players) + 1);
    DWCi_UpdateValidAidCount();
    if (VOLATILE_U8(gDwcControl->match.mode) == DWC_MATCH_TYPE_SC_SV || VOLATILE_U8(gDwcControl->match.mode) == DWC_MATCH_TYPE_SC_CL) {
        gDwcControl->friendMatchCallback(error, cancelled, self, isServer, index, gDwcControl->friendMatchParam);
    } else {
        gDwcControl->matchCallback(error, cancelled, gDwcControl->matchParam);
    }
    if (error && gDwcControl && gDwcControl->state == DWC_STATE_MATCHING) {
        DWCi_SetState(DWC_STATE_ONLINE);
    }
}

// GameSpy presence error.
void DWCi_GPErrorCallback(GPConnection *connection, void *arg, void *param) {
    u32 *error = arg;
    if (error[1] == 0x603 || error[1] == 0x901 || error[1] == 0xB01) {
        return;
    }
    DWCi_MainHandleGPError(3);
}

// Buddy message: "GPCM<version>vMAT..." messages are matchmaking commands.
void DWCi_GPRecvBuddyMessageCallback(GPConnection *connection, void *arg, void *param) {
    GpBuddyMessage *message = arg;
    char version[12] = { 0 };
    char *text = message->message;
    u32 len;
    if (DWCi_GPRecvBuddyAuthCallback(connection, message, param) != 0) {
        return;
    }
    if (memcmp(text, sStr_GPCM, strlen(sStr_GPCM)) != 0) {
        return;
    }
    text += strlen(sStr_GPCM);
    len = strchr(text, 'v') - text;
    strncpy(version, text, len);
    if (len > 10) {
        return;
    }
    if (strtoul(version, NULL, 10) != 3) {
        return;
    }
    text += len + 1;
    if (memcmp(text, sStr_MAT, strlen(sStr_MAT)) != 0) {
        return;
    }
    switch (gDwcControl->state) {
    case DWC_STATE_MATCHING:
        break;
    case DWC_STATE_CONNECTED:
        if (VOLATILE_U8(gDwcControl->match.mode) == DWC_MATCH_TYPE_SC_SV || VOLATILE_U8(gDwcControl->match.mode) == DWC_MATCH_TYPE_SC_CL) {
            break;
        }
    default:
        return;
    }
    DWCi_ProcessGPMatchCommand((int)connection, (void *)message->profileId, (u8 *)text + strlen(sStr_MAT));
}

void DWCi_GT2ReceivedCallback(void *connection, void *data, int size, int reliable) {
    DWCi_TransportRecv(connection, data, size, reliable);
}

// A GT2 connection was closed.
void DWCi_GT2ClosedCallback(void *connection, int reason) {
    u32 aid;
    int profileId = 0;
    int code;
    DwcConnectionInfo *info;
    BOOL known;
    BOOL isServer = FALSE;
    int error;
    if (DWCi_IsShutdownMatch()) {
        return;
    }
    switch (reason) {
    case 0:
    case 1:
        error = 0;
        break;
    case 2:
    case 3:
        error = 6;
        code = -7600;
        break;
    case 4:
        code = -7601;
        error = 9;
        break;
    }
    if (error == 0) {
        info = gt2GetConnectionData(connection);
        if (info == NULL) {
            return;
        }
        aid = info->aid;
        known = TRUE;
        if (!(gDwcControl->match.aidMask & (1 << aid))) {
            known = FALSE;
        }
        DWCi_ResetTransportChannel(aid);
        if ((VOLATILE_U8(gDwcControl->match.mode) == DWC_MATCH_TYPE_SC_SV && reason == 0) || (VOLATILE_U8(gDwcControl->match.mode) == DWC_MATCH_TYPE_SC_CL && aid == 0)) {
            isServer = TRUE;
        }
        profileId = DWCi_GetProfileIDFromAID(aid);
        gDwcGt2Connections[info->index] = NULL;
        if (gDwcControl->match.players) {
            gDwcControl->match.players--;
        }
        if (gDwcControl->match.connections) {
            gDwcControl->match.connections--;
        }
    }
    if (gDwcControl->closing == 0 && gDwcControl->state == DWC_STATE_CONNECTED && known == FALSE) {
        if (VOLATILE_U8(gDwcControl->match.mode) == DWC_MATCH_TYPE_SC_SV && error == 0) {
            DWCi_UpdateGameServerStatus();
            DWCi_HandlePeerConnectionClosed(profileId);
        }
        return;
    }
    // DWCi_HandleServerConnectionClosed ignores the profile id
    if (((int (*)(int, int, int))DWCi_HandleServerConnectionClosed)(error, code, profileId)) {
        return;
    }
    if (error) {
        DWCi_SetError(error, code - 80000);
        return;
    }
    if (!gDwcControl->closing && (VOLATILE_U8(gDwcControl->match.mode) == DWC_MATCH_TYPE_SC_SV || VOLATILE_U8(gDwcControl->match.mode) == DWC_MATCH_TYPE_SC_CL)) {
        int n = gDwcControl->match.players;
        if (gDwcControl->match.profiles[n + 2] != 0) {
            gDwcControl->match.aids[n + 1] = gDwcControl->match.aids[n + 2];
            DWCi_DeleteHostByIndex(gDwcControl->match.players + 1, gDwcControl->match.players + 3);
        }
    }
    if (VOLATILE_U8(gDwcControl->match.mode) == DWC_MATCH_TYPE_SC_SV) {
        if (!gDwcControl->closing) {
            DWCi_UpdateGameServerStatus();
        } else if (!gDwcControl->match.players) {
            DWCi_SetGPStatus(DWC_STATUS_ONLINE, sStr_Empty_2, NULL);
        }
    } else if (!gDwcControl->match.players) {
        DWCi_SetGPStatus(DWC_STATUS_ONLINE, sStr_Empty_2, NULL);
    }
    if (VOLATILE_U8(gDwcControl->match.mode) == DWC_MATCH_TYPE_ANYBODY || VOLATILE_U8(gDwcControl->match.mode) == DWC_MATCH_TYPE_FRIEND) {
        gDwcControl->match.limit = gDwcControl->match.connections;
        qr2_send_statechanged(gDwcControl->match.reporting);
    }
    {
        DwcControl *control = gDwcControl;
        if (control->closedCallback && known) {
            gDwcControl->closedCallback(error, reason == 0, isServer, aid, DWCi_GetFriendListIndex(profileId), control->closedParam);
        }
    }
    if (!gDwcControl->closing && VOLATILE_U8(gDwcControl->match.mode) == DWC_MATCH_TYPE_SC_SV) {
        return;
    }
    if (gDwcControl->match.players) {
        return;
    }
    DWCi_NNFreeNegotiateList();
    DWCi_ResetReportedPlayerCount();
    DWCi_SetState(DWC_STATE_ONLINE);
}
