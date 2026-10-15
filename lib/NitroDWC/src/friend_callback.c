#pragma force_active on
#include <string.h>

#include "global.h"

#include "dwc/friend_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

// GameSpy callbacks keeping the friend list in sync with the buddy list: profile search results,
// buddy requests and profile information are matched against the list by login id user name or
// GameSpy profile id.

extern FriendGlobal gDwcFriends;

extern const char sFmt_CharCharCharChar[]; // "%c%c%c%c"

extern void DWCi_FriendBecameBuddy(int index);
extern DwcUserData *DWCi_GetUserData(void);
extern void gpAuthBuddyRequest(GPConnection *connection, int profileId);
extern void gpDenyBuddyRequest(GPConnection *connection, int profileId);
extern int gpGetBuddyIndex(GPConnection *connection, int profileId, int *index);

// Profile search callback for the friend at index param.
void DWCi_GPProfileSearchCallback(GPConnection *connection, void *arg, void *param) {
    FriendSearchResult *result = arg;
    int index = (int)(u32)param;
    int i, buddyIndex;
    if (result->result == 0 && result->count != 0 && DWC_GetFriendDataType(&gDwcFriends.work->list[index]) != ACCOUNT_TYPE_NONE) {
        if (gDwcFriends.work->state != 1) {
            return;
        }
        for (i = 0; i < result->count; i++) {
            if (DWCi_MergeDuplicateFriend(gDwcFriends.work->list, index, result->matches[i].profileId)) {
                gDwcFriends.work->updateCount++;
                gDwcFriends.work->updated = 1;
                result->operation = 0x601;
                return;
            }
        }
        for (i = 0; i < result->count; i++) {
            DWCi_FriendHandleGPError(gpGetBuddyIndex(connection, result->matches[i].profileId, &buddyIndex));
            if (buddyIndex == -1) {
                DWCi_SendBuddyRequest(result->matches[i].profileId);
            } else {
                DWC_SetGsProfileId(&gDwcFriends.work->list[index], result->matches[0].profileId);
                DWCi_SetBuddyFriendData(&gDwcFriends.work->list[index]);
                DWCi_FriendBecameBuddy(index);
                gDwcFriends.work->updateCount++;
                gDwcFriends.work->updated = 1;
                result->operation = 0x601;
                gDwcFriends.work->changed = 1;
                return;
            }
        }
        if (result->operation == 0x600) {
            return;
        }
        gDwcFriends.work->updateCount++;
        gDwcFriends.work->updated = 1;
    } else {
        if (result->result != 0) {
            if (DWCi_FriendHandleGPError(result->result)) {
                return;
            }
        } else {
            if (gDwcFriends.work->state != 1 && DWC_GetFriendDataType(&gDwcFriends.work->list[index]) != ACCOUNT_TYPE_NONE) {
                return;
            }
            gDwcFriends.work->updateCount++;
            gDwcFriends.work->updated = 1;
        }
    }
}

// Buddy request callback: accept the request if the sender is on the friend list.
void DWCi_GPRecvBuddyRequestInfoCallback(GPConnection *connection, FriendProfileInfo *request) {
    char userName[21];
    char gameCode[5];
    int i;
    BOOL found = FALSE;
    if (request->result != 0) {
        return;
    }
    for (i = 0; i < gDwcFriends.work->count; i++) {
        if (DWC_GetFriendDataType(&gDwcFriends.work->list[i]) == ACCOUNT_TYPE_LOGIN_ID) {
            DWC_LoginIdToUserName(DWCi_GetUserData(), &gDwcFriends.work->list[i], userName);
            if (strcmp(userName, request->userName) == 0) {
                gpAuthBuddyRequest(connection, request->profileId);
                DWC_SetGsProfileId(&gDwcFriends.work->list[i], request->profileId);
                found = TRUE;
            }
        } else if (DWC_GetFriendDataType(&gDwcFriends.work->list[i]) == ACCOUNT_TYPE_GS_PROFILE || DWC_GetFriendDataType(&gDwcFriends.work->list[i]) == ACCOUNT_TYPE_FRIEND_KEY) {
            u32 code = DWCi_GetUserData()->gameCode;
            OS_SNPrintf(gameCode, 5, sFmt_CharCharCharChar, (code >> 24) & 0xff, (code >> 16) & 0xff, (code >> 8) & 0xff, code & 0xff);
            if (request->profileId == DWC_GetGsProfileId(DWCi_GetUserData(), &gDwcFriends.work->list[i]) && memcmp(gameCode, request->gameCode, 4) == 0) {
                gpAuthBuddyRequest(connection, request->profileId);
                found = TRUE;
            }
        }
    }
    if (found) {
        DWCi_SendBuddyRequest(request->profileId);
    } else {
        gpDenyBuddyRequest(connection, request->profileId);
    }
}

// Profile information callback: mark the matching friend entries as buddies.
void DWCi_GPRecvBuddyAuthInfoCallback(GPConnection *connection, FriendProfileInfo *info) {
    int i, updated = 0, buddy = 0;
    char userName[24];
    if (info->result) {
        return;
    }
    for (i = 0; i < gDwcFriends.work->count; i++) {
        if (DWC_GetFriendDataType(&gDwcFriends.work->list[i]) == ACCOUNT_TYPE_LOGIN_ID) {
            DWC_LoginIdToUserName(DWCi_GetUserData(), &gDwcFriends.work->list[i], userName);
            if (strcmp(userName, info->userName) == 0) {
                DWC_SetGsProfileId(&gDwcFriends.work->list[i], info->profileId);
                DWCi_SetBuddyFriendData(&gDwcFriends.work->list[i]);
                updated = 1;
            }
        } else if (DWC_GetFriendDataType(&gDwcFriends.work->list[i]) == ACCOUNT_TYPE_GS_PROFILE || DWC_GetFriendDataType(&gDwcFriends.work->list[i]) == ACCOUNT_TYPE_FRIEND_KEY) {
            if (DWC_GetGsProfileId(DWCi_GetUserData(), &gDwcFriends.work->list[i]) == info->profileId) {
                if (DWC_IsBuddyFriendData(&gDwcFriends.work->list[i]) == TRUE) {
                    buddy = 1;
                } else {
                    DWC_SetGsProfileId(&gDwcFriends.work->list[i], info->profileId);
                    DWCi_SetBuddyFriendData(&gDwcFriends.work->list[i]);
                    updated = 1;
                }
            }
        }
    }
    if (updated) {
        int index = DWCi_MergeDuplicateFriends(gDwcFriends.work->list, gDwcFriends.work->count, info->profileId);
        if (!buddy) {
            DWCi_FriendBecameBuddy(index);
        }
        gDwcFriends.work->changed = 1;
    }
}
