#ifndef POKEHEARTGOLD_LIB_INCLUDE_DWC_DWC_MAIN_INTERNAL_H
#define POKEHEARTGOLD_LIB_INCLUDE_DWC_DWC_MAIN_INTERNAL_H

// Main control block of the OVY_0 network library (lib/NitroDWC/src/dwc_main.c, dwc_login.c,
// friend_manager.c): the GT2 socket, the GameSpy presence connection, the user callbacks and the
// login, friend list, matchmaking and data transport states. The caller hands the memory to
// DWC_InitFriendsMatch, which keeps it in gDwcControl.

#include "dwc/auth_internal.h"
#include "dwc/dwc_account_internal.h"
#include "dwc/friend_internal.h"
#include "dwc/match_internal.h"
#include "dwc/transport_internal.h"

// Result of the GameSpy available check (GSIAvailableCheckThink).
#define GSIACWaiting                0
#define GSIACAvailable              1
#define GSIACUnavailable            2
#define GSIACTemporarilyUnavailable 3

// Reply to the GameSpy connect request (gpConnectPreAuthenticatedA), 0x20 bytes.
typedef struct LoginConnectResult {
    int result;
    int profileId; // 0x04
    u32 unk_08[6];
} LoginConnectResult;

// Log-in to the GameSpy presence server, 0x280 bytes. Authenticates with the Nintendo server first
// (DWCi_Auth_Start) unless the user data already holds an authenticated login id.
typedef struct LoginState {
    GPConnection *connection;
    int state;                                               // 0x04, 1 authenticating, 2 connecting, 3/4 checking the profile, 5 logged in
    int productId;                                           // 0x08
    u32 gameCode;                                            // 0x0C
    u16 *playerName;                                         // 0x10
    void (*callback)(int error, int profileId, void *param); // 0x14
    void *param;                                             // 0x18
    DwcUserData *userData;                                   // 0x1C
    u32 unk_20;
    NasHttp *auth;       // 0x24, work of the authentication request
    u64 authTick;        // 0x28
    int pending;         // 0x30, connect request sent
    u64 connectTick;     // 0x34
    DwcAccData loginId;  // 0x3C
    char token[256];     // 0x48, from the authentication server
    char challenge[256]; // 0x148
    char userName[9];    // 0x248, made from the login id
    char gsbrcd[12];     // 0x251
    u8 unk_25D[3];
    LoginConnectResult response; // 0x260
} LoginState;

// gDwcLogin
typedef struct LoginGlobal {
    void *authParam;
    LoginState *state;                                                           // 0x04
    void (*authCallback)(const char *token, const char *challenge, void *param); // 0x08, called after the authentication
} LoginGlobal;

// The GameSpy buddy message / status notification arguments.
typedef struct GpBuddyMessage {
    int profileId;
    u32 date;      // 0x04
    char *message; // 0x08
} GpBuddyMessage;

typedef struct GpBuddyStatusArg {
    int profileId;
    u32 date;  // 0x04
    int index; // 0x08, buddy index
} GpBuddyStatusArg;

// Index and aid of a GT2 connection (gt2GetConnectionData).
typedef struct DwcConnectionInfo {
    u8 index; // into gDwcGt2Connections
    u8 aid;   // 0x01
} DwcConnectionInfo;

typedef void (*DwcResultCallback)(int error, int value, void *param);
typedef void (*DwcMatchedCallback)(int error, BOOL cancelled, BOOL self, BOOL isServer, int index, void *param);
typedef void (*DwcClosedCallback)(int error, BOOL isLocal, BOOL isServer, u32 aid, int index, void *param);

// gDwcControl, 0xE0C bytes
typedef struct DwcControl {
    void *socket;             // GT2 socket
    void *socketCallbacks[4]; // 0x04, see DWC_InitFriendsMatch
    u32 bufferSize[2];        // 0x14, GT2 socket buffer sizes, 0x2000 by default
    GPConnection connection;  // 0x1C, GameSpy presence connection
    DwcUserData *userData;    // 0x20
    int state;                // 0x24, see DWC_ProcessFriendsMatch
    int prevState;            // 0x28
    u8 aid;                   // 0x2C, own aid
    u8 closing;               // 0x2D, set while DWC_CloseAllConnectionsHard closes the connections
    u16 playerName[26];       // 0x2E
    u8 unk_62[2];
    int profileId;                          // 0x64, own GameSpy profile id
    const char *gameName;                   // 0x68, gDwcGameName
    const char *secretKey;                  // 0x6C, gDwcSecretKey
    DwcResultCallback loginCallback;        // 0x70
    void *loginParam;                       // 0x74
    DwcResultCallback updateCallback;       // 0x78, friend list update
    void *updateParam;                      // 0x7C
    DwcResultCallback matchCallback;        // 0x80, match with anybody
    void *matchParam;                       // 0x84
    DwcMatchedCallback friendMatchCallback; // 0x88, match with friends / server-client match
    void *friendMatchParam;                 // 0x8C
    DwcClosedCallback closedCallback;       // 0x90
    void *closedParam;                      // 0x94
    LoginState login;                       // 0x98
    FriendWork friends;                     // 0x318
    MatchWork match;                        // 0x374
    Transport transport;                    // 0x7F8
} DwcControl;

extern DwcControl *gDwcControl; // the second word holds the last GT2 socket error (DWCi_GT2SocketErrorCallback)
extern void *gDwcGt2Connections[32];   // GT2 connections, by DwcConnectionInfo.index
extern u32 gDwcGt2ConnectionInfo[32][2];
extern u8 gDwcGameName[256]; // game name
extern u8 gDwcSecretKey[256]; // secret key
extern LoginGlobal gDwcLogin;

// dwc_main.c
u32 DWCi_WStrLen(const u16 *s);
void DWC_InitFriendsMatch(DwcControl *control, DwcUserData *userData, int productId, const char *gameName, const char *secretKey, int sendBufferSize, int recvBufferSize, DwcAccData *friends, int friendCount);
void DWC_ShutdownFriendsMatch(void);
void DWC_ProcessFriendsMatch(void);
int DWC_LoginAsync(const u16 *playerName, int unused, DwcResultCallback callback, void *param);
int DWC_UpdateServersAsync(int unused, DwcResultCallback callback, void *param, void *statusCallback, void *statusParam, void *deleteCallback, void *deleteParam);
int DWC_ConnectToAnybodyAsync(int count, const char *filter, DwcResultCallback callback, void *param, void *evalCallback, void *evalParam);
int DWC_SetupGameServer(int count, DwcMatchedCallback callback, void *param, void *evalCallback, void *evalParam);
int DWC_ConnectToGameServerAsync(int index, DwcMatchedCallback callback, void *param, void *newPeerCallback, void *newPeerParam);
int DWC_SetConnectionClosedCallback(DwcClosedCallback callback, void *param);
int DWC_CloseAllConnectionsHard(void);
int DWC_CloseConnectionHard(int aid);
int DWC_CloseConnectionHardBitmap(u32 *aidMask);
int DWC_GetNumConnectionHost(void);
int DWC_GetMyAID(void);
int DWC_GetAIDList(u8 **aids);
u32 DWC_GetAIDBitmap(void);
int DWC_IsValidAID(int aid);
int DWCi_GetState(void);
int DWCi_CreateGT2Socket(void);
void *DWCi_GetGT2Connection(int aid);
int DWCi_GetConnectionAID(void *connection);
int DWCi_GetConnectionIndex(void *connection);
int DWCi_GetFreeConnectionIndex(void);
void DWCi_ClearGT2ConnectionList(void);
void **DWCi_GetGT2ConnectionByIdx(int index);
void **DWCi_GetGT2ConnectionByProfileID(int profileId, int count);
u32 *DWCi_GetConnectionInfoByIdx(int index);
BOOL DWCi_IsConnectedAID(int aid);
void DWCi_DummyProcess(void);
void DWCi_SetState(int state);
int DWCi_GetProfileIDFromAID(int aid);
u32 DWCi_GetAIDBitmapFromList(const u8 *aids, int count);
int DWCi_MainHandleGPError(int error);
int DWCi_MainHandleGT2Error(int error);
void DWCi_LoginCallback(int error, int profileId, void *param);
void DWCi_UpdateServersCallback(int error, BOOL changed, void *param);
void DWCi_MatchedCallback(int error, BOOL cancelled, BOOL self, BOOL isServer, int index, void *param);
void DWCi_GPErrorCallback(GPConnection *connection, void *arg, void *param);
void DWCi_GPRecvBuddyMessageCallback(GPConnection *connection, void *arg, void *param);
void DWCi_GT2ReceivedCallback(void *connection, void *data, int size, int reliable);
void DWCi_GT2ClosedCallback(void *connection, int reason);

// dwc_login.c
void DWCi_GT2PingCallback(void *connection, void *data, int size, int unused);
void DWCi_GT2SocketErrorCallback(void *socket);
void DWCi_LoginInit(LoginState *login, DwcUserData *userData, GPConnection *connection, int productId, u32 gameCode, u16 *playerName, DwcResultCallback callback, void *param);
void DWCi_LoginAsync(void);
void DWCi_LoginProcess(void);
DwcUserData *DWCi_GetUserData(void);
void DWCi_StopLogin(int kind, int code);
void DWCi_ShutdownLogin(void);
void DWCi_ResetLogin(void);
int DWCi_LoginHandleGPError(int error);
void DWCi_GPConnectCallback(GPConnection *connection, void *arg, void *param);
void DWCi_LoginAuthCallback(const char *token, const char *challenge, void *param);
void DWCi_GPConnect(const char *token, const char *challenge, GPCallback callback, int state);
void DWCi_StartAuth(void (*callback)(const char *token, const char *challenge, void *param), void *param);
void DWCi_ProcessAuth(void);
void DWCi_GPGetInfoCallback(GPConnection *connection, void *arg, void *param);

// friend_manager.c
BOOL DWCi_IsLoggedIn(void);
int DWC_GetFriendStatus(const DwcAccData *friendData, char *locationString);
u8 DWC_GetFriendStatusSC(const DwcAccData *friendData, u8 *a, u8 *b, char *locationString);
int DWC_GetFriendStatusData(const DwcAccData *friendData, char *data, int *size);
int DWC_GetFriendStatusDataSC(const DwcAccData *friendData, u8 *a, u8 *b, char *data, int *size);
BOOL DWC_SetOwnStatusData(const u8 *data, int size);
BOOL DWC_SetBuddyFriendCallback(void *callback, void *param);
int DWC_Base64Encode(const u8 *src, int len, char *dest, int destSize);
int DWC_Base64Decode(char *src, int len, char *dest, int destSize);
void DWCi_FriendInit(FriendWork *work, GPConnection *connection, u16 *playerName, DwcAccData *list, int count);
void DWCi_FriendProcess(void);
void DWCi_UpdateServersAsync(const char *token, const char *challenge, void *updateCallback, void *updateParam, void *statusCallback, void *statusParam, void *deleteCallback, void *deleteParam);
void DWCi_StopFriendProcess(int kind, int code);
void DWCi_GPRecvBuddyRequestCallback(GPConnection *connection, void *arg, void *param);
BOOL DWCi_GPRecvBuddyAuthCallback(GPConnection *connection, void *arg, void *param);
void DWCi_GPRecvBuddyStatusCallback(GPConnection *connection, void *arg, void *param);
int DWCi_GetProfileIDFromList(int index);
int DWCi_GetFriendListIndex(int profileId);
void DWCi_ResetFriendPoll(void);
int DWCi_SetGPStatus(int status, const char *statusString, const char *locationString);
void DWCi_FriendBecameBuddy(int index);
void DWCi_ShutdownFriend(void);
int DWCi_FriendGPProcess(void);
void DWCi_ResetFriendUpdate(void);
void DWCi_UpdateFriendList(DwcAccData *list, int count);
void DWCi_FinishUpdateServers(void);
void DWCi_DeleteFriendEntry(DwcAccData *list, int index, int other);

#endif // POKEHEARTGOLD_LIB_INCLUDE_DWC_DWC_MAIN_INTERNAL_H
