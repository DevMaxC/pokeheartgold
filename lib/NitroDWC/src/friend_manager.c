#pragma force_active on
#include <string.h>

#include "global.h"

#include "dwc/dwc_main_internal.h"
#include "dwc/net_common_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

#pragma warn_unusedvar off
#pragma warn_uninitializedvar off

// Friend list management: the buddy status strings ("SCM"/"SCN" matchmaking fields, base64 game data in
// the location string), the friend list update started after the log-in, the GameSpy buddy callbacks,
// and mapping between friend list indices and GameSpy profile ids.

// The part of the GameSpy presence connection read here: the status set last.
struct GPIConnection {
    u8 unk_000[0x214];
    int status;               // 0x214
    char statusString[256];   // 0x218
    char locationString[256]; // 0x318
};

extern FriendGlobal gDwcFriends;
extern char sStr_SCM_2[]; // "SCM"
extern char sStr_SCN_2[]; // "SCN"
extern char sStr_I_HaveAuthorizedYourRequestToAddMeToYourList[]; // "I have authorized your request to add me to your list"

extern unsigned long strtoul(const char *s, char **end, int base);
extern void CloseStatsConnection(void);
extern int IsStatsConnected(void);
extern void PersistThink(void);
extern int gpProcess(GPConnection *connection);
extern int gpProfileSearchA(GPConnection *connection, int unk_01, int unk_02, int unk_03, int unk_04, const char *userName, int unk_06, int unk_07, GPCallback callback, void *param);
extern int gpGetInfo(GPConnection *connection, int profileId, int unk_02, int unk_03, GPCallback callback, void *param);
extern int gpGetNumBuddies(GPConnection *connection, int *count);
extern int gpGetBuddyStatus(GPConnection *connection, int index, FriendBuddyStatus *status);
extern int gpGetBuddyIndex(GPConnection *connection, int profileId, int *index);
extern int gpDeleteBuddy(GPConnection *connection, int profileId);
extern int gpSetStatusA(GPConnection *connection, int status, const char *statusString, const char *locationString);

BOOL DWCi_IsLoggedIn(void) {
    if (gDwcLogin.state && gDwcLogin.state->state == 5) {
        return TRUE;
    }
    return FALSE;
}

int DWC_GetFriendStatus(const DwcAccData *friendData, char *locationString) {
    return DWC_GetFriendStatusSC(friendData, NULL, NULL, locationString);
}

// Buddy status of a friend; a and b get its "SCM" / "SCN" matchmaking fields.
u8 DWC_GetFriendStatusSC(const DwcAccData *friendData, u8 *a, u8 *b, char *locationString) {
    FriendBuddyStatus status;
    char value[4];
    if (DWCi_GetFriendBuddyStatus(friendData, &status)) {
        if (status.status == DWC_STATUS_MATCH_SC_SV) {
            if (a) {
                if (DWC_GetCommonValueString(sStr_SCM_2, value, status.statusString, '/') <= 0) {
                    *a = 0;
                } else {
                    *a = strtoul(value, NULL, 10);
                }
            }
            if (b) {
                if (DWC_GetCommonValueString(sStr_SCN_2, value, status.statusString, '/') <= 0) {
                    *b = 0;
                } else {
                    *b = strtoul(value, NULL, 10);
                }
            }
        } else {
            if (a) {
                *a = 0;
            }
            if (b) {
                *b = 0;
            }
        }
        if (locationString) {
            strcpy(locationString, status.locationString);
        }
        return status.status;
    }
    if (a) {
        *a = 0;
    }
    if (b) {
        *b = 0;
    }
    return 0;
}

int DWC_GetFriendStatusData(const DwcAccData *friendData, char *data, int *size) {
    return DWC_GetFriendStatusDataSC(friendData, NULL, NULL, data, size);
}

// Buddy status of a friend with the game data decoded from its location string.
int DWC_GetFriendStatusDataSC(const DwcAccData *friendData, u8 *a, u8 *b, char *data, int *size) {
    char buf[256];
    int status = DWC_GetFriendStatusSC(friendData, a, b, buf);
    if (!status) {
        *size = -1;
        return status;
    }
    *size = DWCi_Base64Decode(buf, strlen(buf), NULL, 0);
    if (!data || *size == -1) {
        return status;
    }
    DWCi_Base64Decode(buf, strlen(buf), data, *size);
    return status;
}

// Sets the game data in the own location string.
BOOL DWC_SetOwnStatusData(const u8 *data, int size) {
    char buf[256];
    int len;
    if (!gDwcFriends.work || !DWCi_IsLoggedIn()) {
        return FALSE;
    }
    len = DWCi_Base64Encode(data, size, buf, 255);
    if (len == -1) {
        return FALSE;
    }
    buf[len] = 0;
    return DWCi_SetGPStatus(-1, NULL, buf) == 0;
}

BOOL DWC_SetBuddyFriendCallback(void *callback, void *param) {
    if (!gDwcFriends.work) {
        return FALSE;
    }
    gDwcFriends.work->buddyCallback = callback;
    gDwcFriends.work->buddyParam = param;
    return TRUE;
}

int DWC_Base64Encode(const u8 *src, int len, char *dest, int destSize) {
    return DWCi_Base64Encode(src, len, dest, destSize);
}

int DWC_Base64Decode(char *src, int len, char *dest, int destSize) {
    return DWCi_Base64Decode(src, len, dest, destSize);
}

void DWCi_FriendInit(FriendWork *work, GPConnection *connection, u16 *playerName, DwcAccData *list, int count) {
    gDwcFriends.work = work;
    gDwcFriends.work->state = 0;
    gDwcFriends.work->connection = connection;
    gDwcFriends.work->pollCount = 0;
    {
        FriendWork *current = gDwcFriends.work;
        current->pollTick = 0;
        current->count = count;
    }
    gDwcFriends.work->list = list;
    gDwcFriends.work->updateCount = 0;
    gDwcFriends.work->changed = 0;
    gDwcFriends.work->updated = 0;
    gDwcFriends.work->pendingSteps = 0;
    gDwcFriends.work->unk_20 = 0;
    gDwcFriends.work->unk_24 = 0;
    gDwcFriends.work->playerName = playerName;
    gDwcFriends.work->updateCallback = NULL;
    gDwcFriends.work->updateParam = NULL;
    gDwcFriends.work->statusCallback = NULL;
    gDwcFriends.work->statusParam = NULL;
    gDwcFriends.work->deleteCallback = NULL;
    gDwcFriends.work->deleteParam = NULL;
    gDwcFriends.work->buddyCallback = NULL;
    gDwcFriends.work->buddyParam = NULL;
    gDwcFriends.work->unk_4C[0] = 0;
    gDwcFriends.work->unk_4C[1] = 0;
    gDwcFriends.work->unk_4C[2] = 0;
    gDwcFriends.work->unk_4C[3] = 0;
}

void DWCi_FriendProcess(void) {
    FriendWork *work;
    if (!gDwcFriends.work) {
        return;
    }
    if (DWCi_IsError()) {
        return;
    }
    if (!gDwcFriends.work->list) {
        if (gDwcFriends.work->connection && *gDwcFriends.work->connection) {
            DWCi_FriendGPProcess();
        }
        return;
    }
    if (DWCi_GetFriendWorkField20() || IsStatsConnected()) {
        gDwcFriends.busy = 1;
        gDwcFriends.deferred = 0;
        PersistThink();
        gDwcFriends.busy = 0;
        if (gDwcFriends.deferred == 1) {
            gDwcFriends.deferred = 0;
            CloseStatsConnection();
        }
    }
    if (gDwcFriends.work->connection && *gDwcFriends.work->connection) {
        if (DWCi_FriendGPProcess()) {
            return;
        }
        work = gDwcFriends.work;
        if (!work->state) {
            return;
        }
        if (work->list && work->updated != 3 && (u32)work->pollCount > 7) {
            if (work->updated <= 1) {
                DWCi_UpdateFriendList(work->list, work->count);
            }
            if (gDwcFriends.work->updateCount >= gDwcFriends.work->count) {
                gDwcFriends.work->updated = 3;
                gDwcFriends.work->pendingSteps++;
            }
        }
    }
    if (gDwcFriends.work->pendingSteps >= 2) {
        gDwcFriends.work->pendingSteps = 0;
        DWCi_FinishUpdateServers();
    }
}

// Starts the friend list update.
void DWCi_UpdateServersAsync(const char *token, const char *challenge, void *updateCallback, void *updateParam, void *statusCallback, void *statusParam, void *deleteCallback, void *deleteParam) {
    gDwcFriends.work->updateCallback = updateCallback;
    gDwcFriends.work->updateParam = updateParam;
    gDwcFriends.work->statusCallback = statusCallback;
    gDwcFriends.work->statusParam = statusParam;
    gDwcFriends.work->deleteCallback = deleteCallback;
    gDwcFriends.work->deleteParam = deleteParam;
    gDwcFriends.work->changed = 0;
    gDwcFriends.work->updated = 0;
    gDwcFriends.work->pendingSteps = 0;
    gDwcFriends.work->updateCount = 0;
    gDwcFriends.work->state = 1;
    if (!gDwcFriends.work->list) {
        gDwcFriends.work->pendingSteps++;
    }
    gDwcFriends.work->pendingSteps++;
}

// Friend list update failed.
void DWCi_StopFriendProcess(int kind, int code) {
    if (!gDwcFriends.work || !kind) {
        return;
    }
    DWCi_SetError(kind, code);
    if (gDwcFriends.work->state != 0 && gDwcFriends.work->state != 2) {
        gDwcFriends.work->updateCallback(kind, gDwcFriends.work->changed, gDwcFriends.work->updateParam);
    }
    DWCi_ResetFriendUpdate();
}

// Buddy request received.
void DWCi_GPRecvBuddyRequestCallback(GPConnection *connection, void *arg, void *param) {
    int *request = arg;
    if (!gDwcFriends.work->list) {
        return;
    }
    gpGetInfo(connection, *request, 0, 0, (GPCallback)DWCi_GPRecvBuddyRequestInfoCallback, NULL);
}

// Buddy message: the "authorized" message makes the friend a buddy.
BOOL DWCi_GPRecvBuddyAuthCallback(GPConnection *connection, void *arg, void *param) {
    GpBuddyMessage *message = arg;
    if (strcmp(message->message, sStr_I_HaveAuthorizedYourRequestToAddMeToYourList) != 0) {
        return FALSE;
    }
    gpGetInfo(connection, message->profileId, 0, 0, (GPCallback)DWCi_GPRecvBuddyAuthInfoCallback, NULL);
    return TRUE;
}

// Buddy status changed.
void DWCi_GPRecvBuddyStatusCallback(GPConnection *connection, void *arg, void *param) {
    GpBuddyStatusArg *buddy = arg;
    FriendBuddyStatus status;
    int index;
    if (!gDwcFriends.work->statusCallback) {
        return;
    }
    index = DWCi_GetFriendListIndex(buddy->profileId);
    if (index == -1) {
        return;
    }
    gpGetBuddyStatus(connection, buddy->index, &status);
    gDwcFriends.work->statusCallback(index, status.status & 0xFF, status.locationString, gDwcFriends.work->statusParam);
}

// GameSpy profile id of the friend at index, 0 if it has none.
int DWCi_GetProfileIDFromList(int index) {
    DwcAccData *list = gDwcFriends.work->list;
    int profileId;
    if (!list) {
        return 0;
    }
    profileId = DWC_GetGsProfileId(DWCi_GetUserData(), &list[index]);
    if (profileId != 0 && profileId != -1) {
        return profileId;
    }
    return 0;
}

// Friend list index of a GameSpy profile id, -1 if it is not in the list.
int DWCi_GetFriendListIndex(int profileId) {
    int i;
    if (!gDwcFriends.work || !profileId) {
        return -1;
    }
    for (i = 0; i < gDwcFriends.work->count; i++) {
        if (profileId == DWCi_GetProfileIDFromList(i)) {
            return i;
        }
    }
    return -1;
}

void DWCi_ResetFriendPoll(void) {
    if (!gDwcFriends.work) {
        return;
    }
    gDwcFriends.work->pollCount = 0;
    gDwcFriends.work->pollTick = OS_GetTick();
}

// Sets the own buddy status; -1 / NULL keep the current values.
int DWCi_SetGPStatus(int status, const char *statusString, const char *locationString) {
    if (!gDwcFriends.work || !DWCi_IsLoggedIn()) {
        return 0;
    }
    if (status == -1) {
        status = (*gDwcFriends.work->connection)->status;
    }
    if (!statusString) {
        statusString = (*gDwcFriends.work->connection)->statusString;
    }
    if (!locationString) {
        locationString = (*gDwcFriends.work->connection)->locationString;
    }
    return gpSetStatusA(gDwcFriends.work->connection, status, statusString, locationString);
}

// The friend at index became a buddy.
void DWCi_FriendBecameBuddy(int index) {
    struct {
        char unused[264];
        char locationString[264];
    } buf;

    if (gDwcFriends.work->buddyCallback && gDwcFriends.work->state != 1) {
        gDwcFriends.work->buddyCallback(index, gDwcFriends.work->buddyParam);
    }
    if (!gDwcFriends.work->statusCallback) {
        return;
    }
    {
        int status = DWC_GetFriendStatus(&gDwcFriends.work->list[index], buf.locationString);
        gDwcFriends.work->statusCallback(index, status, buf.locationString, gDwcFriends.work->statusParam);
    }
}

void DWCi_ShutdownFriend(void) {
    gDwcFriends.work = NULL;
}

// Processes the presence connection every 300 ms.
int DWCi_FriendGPProcess(void) {
    int error = 0;
    FriendWork *work = gDwcFriends.work;
    if (((OS_GetTick() - work->pollTick) << 6) / 33514 >= 300) {
        work->pollCount++;
        error = gpProcess(gDwcFriends.work->connection);
        gDwcFriends.work->pollTick = OS_GetTick();
    }
    return error;
}

void DWCi_ResetFriendUpdate(void) {
    if (!gDwcFriends.work) {
        return;
    }
    gDwcFriends.work->state = 0;
    gDwcFriends.work->updated = 0;
    gDwcFriends.work->pendingSteps = 0;
}

// Matches the friend list against the buddy list: drops buddies that are not friends, marks friends
// that are buddies, and looks up the profile ids of friends known by login id only.
void DWCi_UpdateFriendList(DwcAccData *list, int count) {
    struct {
        int i;
        volatile int count;
    } local;

    char userName[24];
    FriendBuddyStatus status;
    if (!gDwcFriends.work->updated) {
        DWCi_FriendHandleGPError(gpGetNumBuddies(gDwcFriends.work->connection, (int *)&local.count));
        for (local.i = 0; local.i < local.count; local.i++) {
            int j;
            DWCi_FriendHandleGPError(gpGetBuddyStatus(gDwcFriends.work->connection, *(volatile int *)&local.i, &status));
            for (j = 0; j < count; j++) {
                if (status.profileId == DWCi_GetProfileIDFromList(j)) {
                    if (DWC_IsBuddyFriendData(&list[j])) {
                        break;
                    }
                    DWC_SetGsProfileId(&list[j], status.profileId);
                    DWCi_SetBuddyFriendData(&list[j]);
                    gDwcFriends.work->changed = 1;
                    break;
                }
            }
            if (j == count) {
                DWCi_FriendHandleGPError(gpDeleteBuddy(gDwcFriends.work->connection, status.profileId));
                local.count--;
                local.i--;
            }
        }
        gDwcFriends.work->updated = 1;
    }
    while (gDwcFriends.work->updateCount < count) {
        u32 profileId = DWCi_GetProfileIDFromList(gDwcFriends.work->updateCount);
        if (profileId) {
            if (!DWCi_MergeDuplicateFriend(list, gDwcFriends.work->updateCount, profileId)) {
                DWCi_FriendHandleGPError(gpGetBuddyIndex(gDwcFriends.work->connection, profileId, (int *)&local.i));
                if (local.i == -1) {
                    DWCi_SendBuddyRequest(profileId);
                }
            }
        } else if (DWC_GetGsProfileId(DWCi_GetUserData(), &list[gDwcFriends.work->updateCount]) == -1) {
            DWC_LoginIdToUserName(DWCi_GetUserData(), &list[gDwcFriends.work->updateCount], userName);
            gpProfileSearchA(gDwcFriends.work->connection, 0, 0, 0, 0, userName, 0, 0, (GPCallback)DWCi_GPProfileSearchCallback, (void *)(u32)gDwcFriends.work->updateCount);
            gDwcFriends.work->updated = 2;
            return;
        }
        gDwcFriends.work->updateCount++;
    }
}

// Friend list update finished.
void DWCi_FinishUpdateServers(void) {
    gDwcFriends.work->updateCallback(0, gDwcFriends.work->changed, gDwcFriends.work->updateParam);
    gDwcFriends.work->state = 2;
}

// Clears the entry at index (a duplicate of the entry at other).
void DWCi_DeleteFriendEntry(DwcAccData *list, int index, int other) {
    if (!gDwcFriends.work) {
        return;
    }
    MI_CpuFill8(&list[index], 0, sizeof(DwcAccData));
    if (gDwcFriends.work->deleteCallback) {
        gDwcFriends.work->deleteCallback(index, other, gDwcFriends.work->deleteParam);
    }
}
