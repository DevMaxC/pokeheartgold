#ifndef POKEHEARTGOLD_LIB_INCLUDE_DWC_MATCH_INTERNAL_H
#define POKEHEARTGOLD_LIB_INCLUDE_DWC_MATCH_INTERNAL_H

// Matchmaking state of OVY_0 (lib/NitroDWC/src/match_*.c, transport.c). The work area is
// registered with DWCi_SetMatchWork and fetched with DWCi_GetMatchWork.

#define TICKS_TO_MS(ticks) (((ticks) << 6) / 0x82EA)

// DWC control state (DwcControl.state, DWCi_SetState / DWCi_GetState).
#define DWC_STATE_INIT            0
#define DWC_STATE_AVAILABLE_CHECK 1
#define DWC_STATE_LOGIN           2
#define DWC_STATE_ONLINE          3
#define DWC_STATE_UPDATE_SERVERS  4
#define DWC_STATE_MATCHING        5
#define DWC_STATE_CONNECTED       6

// Matchmaking type (MatchWork.mode).
#define DWC_MATCH_TYPE_ANYBODY 0
#define DWC_MATCH_TYPE_FRIEND  1
#define DWC_MATCH_TYPE_SC_SV   2 // DWC_SetupGameServer
#define DWC_MATCH_TYPE_SC_CL   3 // DWC_ConnectToGameServerAsync

// Own / buddy status (DWCi_SetGPStatus, GP buddy status .status)
enum {
    DWC_STATUS_OFFLINE,
    DWC_STATUS_ONLINE,
    DWC_STATUS_PLAYING,
    DWC_STATUS_MATCH_ANYBODY,
    DWC_STATUS_MATCH_FRIEND,
    DWC_STATUS_MATCH_SC_CL,
    DWC_STATUS_MATCH_SC_SV,
};

typedef void (*MatchErrorCallback)(int kind, int unk_01, BOOL unk_02, BOOL isServer, int unk_04, void *param);

// Header of an "SBCM" command packet, 20 bytes.
typedef struct MatchCommandHeader {
    char magic[4];
    int version; // 0x04
    u8 type;     // 0x08
    u8 size;     // 0x09, payload bytes
    u16 value;   // 0x0A
    int arg0;    // 0x0C
    int arg1;    // 0x10
} MatchCommandHeader;

// Timer for the "all peers ready" exchange, 0x20 bytes.
typedef struct MatchTimer {
    u8 active;
    u8 wanted;  // number of players wanted
    u8 retries; // 0x02
    u8 unk_03;
    u32 timeout; // 0x04, ms
    u32 mask;    // 0x08, aids that answered
    u32 all;     // 0x0C, aids expected
    u64 start;   // 0x10
    u64 last;    // 0x18
} MatchTimer;

// Custom server key, 12 bytes (gDwcMatchKeys[154], key ids 100..253).
typedef struct MatchKeyEntry {
    u8 id;
    u8 isString;  // 0x01
    u16 unk_02;   // 0x02
    void *buffer; // 0x04, owned by the entry (the key name for keys added with DWC_AddMatchKeyString)
    void *value;  // 0x08
} MatchKeyEntry;

typedef struct MatchAddr {
    u8 family;
    u8 unk_01;
    u16 port;    // 0x02
    u32 address; // 0x04
} MatchAddr;

typedef struct MatchRequest {
    u8 flag;
    u8 retries;  // 0x01
    u16 port;    // 0x02
    u32 address; // 0x04
    int active;  // 0x08
} MatchRequest;

typedef struct MatchWork {
    void *gpConnection;
    void **peer;    // 0x04
    void *callback; // 0x08
    u8 flag;        // 0x0C
    u8 players;     // 0x0D, connected players besides the local one
    u8 aidCount;    // 0x0E, aids in aidMask besides the local one
    u8 unk_0F;
    void *reporting;         // 0x10, query/reporting record, see DWCi_QR2Startup
    volatile u8 connections; // 0x14
    u8 mode;                 // 0x15
    u8 limit;                // 0x16
    u8 newPeerPending;
    u8 qr2ShutdownPending;
    u8 unk_19;
    u16 port;             // 0x1A
    u32 addr;             // 0x1C
    u32 newPeerProfile;   // 0x20
    u32 addresses[32];    // 0x24
    u16 ports[32];        // 0xA4
    void *list;           // 0xE4, server list
    int searchWait;           // 0xE8
    u64 searchWaitTick;           // 0xEC
    int profiles[32];     // 0xF4
    u64 pending;          // 0x174
    u8 retryCount;        // 0x17C
    u8 matchRetryCount;   // 0x17D
    u16 cookieRandom;          // 0x17E, random, sent in the high half of the NAT negotiation cookie
    int retryProfile;     // 0x180
    u64 retryTick;        // 0x184
    u64 waitTick;         // 0x18C
    MatchRequest request; // 0x194
    int state;            // 0x1A0
    u8 initial;           // 0x1A4
    u8 current;           // 0x1A5
    u8 unk_1A6;           // 0x1A6
    u8 nextServerRetries; // 0x1A7, connect retries
    u8 closeState;        // 0x1A8, 3 = closing the connection to the server
    u8 cancelling;
    u8 reservationRetries; // 0x1AA, retries in state 4
    u8 readyRetries; // 0x1AB, of the "all peers ready" exchange
    u8 closeRetries; // 0x1AC, of the close exchange
    u8 serverPollCount; // 0x1AD
    u8 stopPending;  // 0x1AE, DWC_StopSCMatchingAsync was called before state 10
    u8 unk_1AF;
    u16 maxSize;    // 0x1B0, largest receive size of the peers
    u16 closeDelay; // 0x1B2, ms, longest half round trip of the close exchange
    u16 remotePort; // 0x1B4
    u16 unk_1B6;
    u32 remoteAddr; // 0x1B8
    int active;     // 0x1BC
    u64 activeTick; // 0x1C0
    u32 delay;      // 0x1C8, ms
    u64 time;       // 0x1CC
    u32 readyMask;  // 0x1D4, aids that reported ready
    u32 closeMask;  // 0x1D8, aids that answered the close exchange
    u32 friendCheckMask;
    u64 readyTick; // 0x1E0, time of the last aid message (DWCi_SendMatchSynPacket)
    u64 closeTick; // 0x1E8, time of the last close message (DWCi_SendCloseMessage)
    u64 restartWaitTick; // 0x1F0
    u64 serverPollTick; // 0x1F8
    u32 identity;  // 0x200
    int target;    // 0x204
    u32 nextServerProfile;
    int eventPeerProfile;       // 0x20C, profile of the peer the match is closed with
    u32 addr2[32];              // 0x210
    u16 port2[32];              // 0x290
    u8 aids[32];                // 0x2D0
    u32 aidMask;                // 0x2F0
    const char *gameName;       // 0x2F4
    const char *secretKey;      // 0x2F8
    struct DwcAccData *friends; // 0x2FC
    u32 unk_300;
    u8 friendIds[64];                                                                                 // 0x304
    int friendCount;                                                                                  // 0x344
    u32 serverPeerCount;                                                                              // 0x348, entries in serverPeerProfiles
    u32 serverPeerProfiles[32];                                                                       // 0x34C, profiles
    u8 sentCommand;                                                                                       // 0x3CC, state of the last command sent
    u8 commandRetries;                                                                                // 0x3CD
    u16 commandPort;                                                                                  // 0x3CE
    u32 commandAddr;                                                                                  // 0x3D0
    u8 commandData[0x80];                                                                             // 0x3D4
    u32 commandProfile;                                                                               // 0x454
    u32 commandSize;                                                                                  // 0x458
    u64 commandTick;                                                                                  // 0x45C
    void (*errorCallback)(int kind, int unk_01, BOOL unk_02, BOOL isServer, int unk_04, void *param); // 0x464
    void *errorParam;                                                                                 // 0x468
    void (*newPeerCallback)(int friendIndex, void *param);                                                    // 0x46C, called for each new peer, set by DWCi_SetupGameServer / DWCi_ConnectToGameServerAsync
    void *newPeerParam;                                                                                    // 0x470, its parameter
    int (*evalCallback)(int index, void *param);                                                      // 0x474
    void *evalParam;                                                                                  // 0x478
    void (*stopCallback)(void *param);                                                                // 0x47C, see DWC_StopSCMatchingAsync
    void *stopParam;                                                                                  // 0x480
} MatchWork;

typedef struct MatchGlobal {
    MatchTimer *timer;
    MatchWork *work; // 0x04
    char *filter;    // 0x08, extra server list filter, see DWCi_ConnectToAnybodyAsync
    int deferred;    // 0x0C, NNFreeNegotiateList requested while updating
    int updating;    // 0x10, set while NNThink runs
    int freeBrowser;      // 0x14
    int busy;        // 0x18, callback nesting depth
    u8 scConnectBlock;
    u8 scConnectBlocked;
    u16 unk_1E;
} MatchGlobal;

extern MatchGlobal gDwcMatch;

int DWCi_CheckMatchRetryLimit(int flag);
void DWCi_SetMatchWork(MatchWork *work);
MatchWork *DWCi_GetMatchWork(void);
void DWCi_SetMatchState(int state);

extern MatchKeyEntry gDwcMatchKeys[];

// match_setup.c
void DWCi_NNFreeNegotiateList(void);
int DWC_CancelMatching(void);
int DWC_IsValidCancelMatching(void);
int DWC_StopSCMatchingAsync(void (*callback)(void *param), void *param);
u32 DWC_AddMatchKeyString(u32 id, const char *name, void *value);
int DWC_SetMatchingOption(int option, MatchTimer *param);
void DWCi_MatchInit(MatchWork *work, void *unk_00, void **peer, void *callback, const char *gameName, const char *secretKey, void *friends, u32 unk_300);
int DWCi_QR2Startup(u32 identity);
void DWCi_ConnectToAnybodyAsync(int count, const char *filter, void *arg2, void *arg3, int (*evalCallback)(int index, void *param), void *evalParam);
void DWCi_SetupGameServer(int count, void *arg1, void *arg2, void *callback, void *param);
void DWCi_ConnectToGameServerAsync(int profile, void *arg1, void *arg2, void *callback, void *param);
void DWCi_QR2Think(void *reporting);
void DWCi_MatchProcess(BOOL active);

// match_browse.c
u8 DWCi_GetNewMatchKeyID(void);
void DWCi_ClearMatchKeys(void);
void DWCi_ResetMinCompleteTimer(int flag);
void DWCi_ProcessMinComplete(void);
int DWCi_HandleGPError(unsigned error);
int DWCi_HandleSBError(unsigned error);
int DWCi_HandleQR2Error(int error);
void DWCi_SBCallback(void *list, int event, void *arg);
void DWCi_QR2ServerKeyCallback(int id, void *out);
void DWCi_QR2PlayerKeyCallback(void);
void DWCi_QR2TeamKeyCallback(void);
void DWCi_QR2KeyListCallback(int state, void *p);
int DWCi_QR2CountCallback(void);
int DWCi_QR2AddErrorCallback(unsigned error);
void DWCi_QR2PublicAddressCallback(u32 addr, u16 port);
void DWCi_QR2NatNegCallback(int profile);
void DWCi_QR2ClientMessageCallback(void *src, u32 size);
void DWCi_NNCompletedCallback(int result, int unused, MatchAddr *addr, MatchRequest *req);

// match_connect.c
int DWCi_GT2UnrecognizedMessageCallback(void *unused, u32 address, int port, u8 *data, u32 size);
void DWCi_GT2ConnectAttemptCallback(void *unused, void *connection, u32 address, int port, int maxSize, u8 *option);
void DWCi_GT2ConnectedCallback(void *connection, int result);
int DWCi_ProcessGPMatchCommand(int unused, void *arg, u8 *s);
void DWCi_ClearSentCommand(void);
void DWCi_StopMatching(int kind, int code);
void DWCi_ResetReportedPlayerCount(void);
void DWCi_ProcessMatchSynPacket(int aid, int message, u8 *data);
int DWCi_HandleServerConnectionClosed(int kind, int code);
void DWCi_HandlePeerConnectionClosed(int profile);
int DWCi_DeleteHostByProfileID(int profile, int count);
int DWCi_DeleteHostByIndex(int index, int count);
int DWCi_GetNumConnectedPeers(void);
int DWCi_GetNumValidAids(void);
void DWCi_UpdateValidAidCount(void);
int DWCi_GetAIDList(u8 **aids);
int DWCi_GetValidAIDList(u8 **aids);
int DWCi_UpdateGameServerStatus(void);
void DWCi_ShutdownMatch(void);
BOOL DWCi_IsShutdownMatch(void);

// match_command.c (DWCi_SendMatchCommand takes u8 command / u16 port but is declared by its callers with wider types)
void DWCi_ResetMatchParam(int mode);
void DWCi_SetMatchCommonParam(int mode, int limit, MatchErrorCallback callback, void *param);
void DWCi_CloseMatching(void);
int DWCi_UpdateServerListAsync(int profile);
int DWCi_GetDefaultMatchFilter(char *out, int identity, int limit, int mode);
int DWCi_StartNatNegotiation(int mode, u32 value, void *server);
int DWCi_DoNatNegotiationAsync(MatchRequest *req);
int DWCi_SendSBMsgCommand(int command, u32 addr, u32 port, const u32 *data, u32 count);
int DWCi_SendGPBuddyMsgCommand(void *connection, int command, u32 profile, const char *args);
int DWCi_GetCommandField(char *out, const char *s, int index);

// match_join.c
int DWCi_ProcessMatchCommand(int command, int profile, u32 addr, int port, int *data, int count);
int DWCi_ProcessReservationRequest(int profile, u32 addr, int port, int mode, BOOL resend);
int DWCi_AddNewPeer(int profile, u32 addr, int port);
void DWCi_SetServerPeerProfiles(int profile, int *list);
// Passes an error code on to DWCi_HandleSBError or DWCi_HandleGPError; callers often call it right after the
// function whose result is the error code, without arguments.
int DWCi_HandleMatchCommandError();
int DWCi_SendReservationRequest(int profile, BOOL direct);
int DWCi_SendReservationToNextFriend(int mode, BOOL same, int previous);
int DWCi_RestartMatchSearch(int profile);
int DWCi_CancelReservation(int profile);
int DWCi_DropConnectingPeer(int profile);

// match_sync.c
int DWCi_HandleReservationRefused(int profile);
int DWCi_SendServerPeerProfiles(void);
void DWCi_AdvanceJoin(unsigned action);
int DWCi_CheckFriendProfiles(int *profiles, u32 count);
void DWCi_CancelMatching(void);
void DWCi_FinishCancelMatching(void);
int DWCi_SendLeaveToServer(void);
void DWCi_RestartMatching(int mode);
void DWCi_ClientRestartMatching(void);
int DWCi_RestartWithPendingServer(void);
int DWCi_CloseConnectionToProfile(int profile);
void DWCi_CloseAllConnectionsHard(void);
int DWCi_KeepPeersInAidMask(u32 mask);
void DWCi_SendMatchSynPacket(int aid, int message);
int DWCi_ProcessMatchSynTimeout(void);
int DWCi_SendCloseMessage(int profile, int message);
int DWCi_ProcessCloseMessage(int profile, int message, int arg);
int DWCi_ProcessCloseTimeout(void);

#endif // POKEHEARTGOLD_LIB_INCLUDE_DWC_MATCH_INTERNAL_H
