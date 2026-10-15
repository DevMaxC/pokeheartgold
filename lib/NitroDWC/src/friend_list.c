#pragma force_active on
#include "global.h"

#include "dwc/friend_internal.h"
#include "dwc/gp_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

#pragma warn_uninitializedvar off

// Friend list upkeep: merging duplicate entries (same GameSpy profile id), sending buddy requests,
// looking up a friend's buddy status, and mapping GameSpy error codes.

// gDwcFriends[2] is the friend list work (FriendGlobal.work, see dwc/friend_internal.h).
extern FriendWork *gDwcFriends[];

extern const char sStr_Empty_4[]; // ""

extern int DWCi_GetProfileIDFromList(int index);
extern void DWCi_DeleteFriendEntry(DwcAccData *list, int index, int other);
extern void DWCi_StopFriendProcess(int kind, int code);
extern BOOL DWCi_IsLoggedIn(void);
extern DwcUserData *DWCi_GetUserData(void);
extern int gpSendBuddyRequestA(GPConnection *connection, int profileId, const char *message);
extern int gpGetBuddyStatus(GPConnection *connection, int index, void *status);
extern int gpGetBuddyIndex(GPConnection *connection, int profileId, int *index);

int DWCi_MergeDuplicateFriend(DwcAccData *list, int index, int profileId) {
    int i;
    for (i = 0; i < index; i++) {
        int id = DWCi_GetProfileIDFromList(i);
        if (!id || id != profileId) {
            continue;
        }
        if (DWC_IsBuddyFriendData(&list[index]) && !DWC_IsBuddyFriendData(&list[i])) {
            DWCi_DeleteFriendEntry(list, i, index);
        } else {
            DWCi_DeleteFriendEntry(list, index, i);
        }
        gDwcFriends[2]->changed = 1;
        return 1;
    }
    return 0;
}

int DWCi_MergeDuplicateFriends(DwcAccData *list, int count, int profileId) {
    int result = -1, id, i;
    for (i = 0; i < count; i++) {
        id = DWCi_GetProfileIDFromList(i);
        if (id) {
            int j;
            if (id == profileId) {
                result = i;
            }
            for (j = i + 1; j < count; j++) {
                if (id == DWCi_GetProfileIDFromList(j)) {
                    if (DWC_GetFriendDataType(&list[i]) == ACCOUNT_TYPE_FRIEND_KEY && DWC_GetFriendDataType(&list[j]) == ACCOUNT_TYPE_GS_PROFILE) {
                        // called with an int profile id; the int-typed call is what the original object was built from
                        ((void (*)(DwcAccData *, int))DWC_SetGsProfileId)(&list[i], id);
                    }
                    if (DWC_IsBuddyFriendData(&list[j])) {
                        DWCi_SetBuddyFriendData(&list[i]);
                    }
                    DWCi_DeleteFriendEntry(list, j, i);
                    gDwcFriends[2]->changed = 1;
                }
            }
        }
    }
    return result;
}

int DWCi_SendBuddyRequest(int profileId) {
    int error = gpSendBuddyRequestA(gDwcFriends[2]->connection, profileId, sStr_Empty_4);
    DWCi_FriendHandleGPError(error);
    return error;
}

enum {
    FRIEND_STATUS_NG,
    FRIEND_STATUS_OK
};

// Buddy status of a friend, FALSE if it is not a buddy or not logged in.
BOOL DWCi_GetFriendBuddyStatus(const DwcAccData *friendData, void *status) {
    int index = 0;
    int profileId;
    if (gDwcFriends[2] == NULL || !DWCi_IsLoggedIn()) {
        return FALSE;
    }
    profileId = DWC_GetGsProfileId(DWCi_GetUserData(), friendData);
    if (profileId > 0 && gpGetBuddyIndex(gDwcFriends[2]->connection, profileId, &index) != 0) {
        return FALSE;
    }
    if (profileId <= 0 || index == -1) {
        return FALSE;
    }
    return gpGetBuddyStatus(gDwcFriends[2]->connection, index, status) != 0 ? FRIEND_STATUS_NG : FRIEND_STATUS_OK;
}

// Maps a GameSpy error to a DWC error (DWCi_StopFriendProcess); returns the GameSpy error.
int DWCi_FriendHandleGPError(u32 error) {
    int kind, code;
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
    DWCi_StopFriendProcess(kind, code - 71000);
    return error;
}
