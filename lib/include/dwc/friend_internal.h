#ifndef POKEHEARTGOLD_LIB_INCLUDE_DWC_FRIEND_INTERNAL_H
#define POKEHEARTGOLD_LIB_INCLUDE_DWC_FRIEND_INTERNAL_H

// Friend list state of OVY_0 (lib/NitroDWC/src/friend_update.c, match_setup.c): the list of 12-byte
// friend data entries kept in sync with the GameSpy buddy list.

#include "dwc/dwc_account_internal.h"

#include "to90_login_callback_private.h"

typedef struct FriendWork {
    int state;                // 1 while the friend list is being updated, 2 when done
    GPConnection *connection; // 0x04
    int pollCount;            // 0x08, DWCi_FriendGPProcess calls
    u64 pollTick;             // 0x0C
    int count;                // 0x14, entries in list
    DwcAccData *list;         // 0x18
    u8 updateCount;           // 0x1C, entries checked so far
    u8 changed;               // 0x1D, list was modified
    u8 updated;               // 0x1E
    u8 pendingSteps;          // 0x1F, the update finishes when it reaches 2
    u32 unk_20;               // 0x20
    u32 unk_24;
    u16 *playerName;                                                                        // 0x28
    void (*updateCallback)(int error, BOOL changed, void *param);                           // 0x2C
    void *updateParam;                                                                      // 0x30
    void (*statusCallback)(int index, int status, const char *locationString, void *param); // 0x34
    void *statusParam;                                                                      // 0x38
    void (*deleteCallback)(int index, int other, void *param);                              // 0x3C, see DWCi_DeleteFriendEntry
    void *deleteParam;                                                                      // 0x40
    void (*buddyCallback)(int index, void *param);                                          // 0x44
    void *buddyParam;                                                                       // 0x48
    u32 unk_4C[4];
} FriendWork;

// gDwcFriends. Declared by its users: friend_list.c reads it as an array of words (FriendWork *[]) and only
// matches that way, the other files use this struct.
typedef struct FriendGlobal {
    int busy; // set while PersistThink runs
    u32 unk_04;
    FriendWork *work; // 0x08
    int deferred;     // 0x0C, CloseStatsConnection requested while busy
} FriendGlobal;

// Buddy status of a GameSpy profile (gpGetBuddyStatus), 0x210 bytes.
typedef struct FriendBuddyStatus {
    int profileId;
    int status;               // 0x04, 6 = matchmaking ("SCM"/"SCN" fields in statusString)
    char statusString[256];   // 0x08
    char locationString[256]; // 0x108
    u8 unk_208[8];
} FriendBuddyStatus;

// Buddy request / profile information delivered to the GameSpy callbacks.
typedef struct FriendProfileInfo {
    int result;
    int profileId; // 0x04
    u8 unk_08[0x86];
    char userName[9]; // 0x8E
    char gameCode[4]; // 0x97
} FriendProfileInfo;

// One match of a profile search, 0xAC bytes.
typedef struct FriendSearchMatch {
    int profileId;
    char unk_04[31];
    char unk_23[21];
    char unk_38[31];
    char unk_57[31];
    char unk_76[51];
} FriendSearchMatch;

typedef struct FriendSearchResult {
    int result;
    int count;                  // 0x04
    u32 operation;              // 0x08
    FriendSearchMatch *matches; // 0x0C
} FriendSearchResult;

int DWCi_MergeDuplicateFriend(DwcAccData *list, int index, int profileId);
int DWCi_MergeDuplicateFriends(DwcAccData *list, int count, int profileId);
int DWCi_SendBuddyRequest(int profileId);
BOOL DWCi_GetFriendBuddyStatus(const DwcAccData *friendData, void *status);
int DWCi_FriendHandleGPError(u32 error);
void DWCi_GPProfileSearchCallback(GPConnection *connection, void *arg, void *param);
void DWCi_GPRecvBuddyRequestInfoCallback(GPConnection *connection, FriendProfileInfo *request);
void DWCi_GPRecvBuddyAuthInfoCallback(GPConnection *connection, FriendProfileInfo *info);
u32 DWCi_GetFriendWorkField20(void);

#endif // POKEHEARTGOLD_LIB_INCLUDE_DWC_FRIEND_INTERNAL_H
