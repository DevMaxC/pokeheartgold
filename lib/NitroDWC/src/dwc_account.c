#include "dwc/dwc_account_internal.h"

// NitroDWC account handling: the user data block (login ids, GameSpy profile id, dirty flag, CRC) and
// friend data entries (login id, friend key or GameSpy profile id), friend keys and user names.

int DWC_Init(void *work) {
    int result;
    int made = 0;

    OSi_ReferSymbol(_version_NINTENDO_DWC);
    result = DWC_BM_Init(work);
    if (DWC_Auth_CheckPseudoWiFiID()) {
        DWCi_AUTH_MakeWiFiID(work);
        made = 1;
    }
    if (result < 0) {
        return made ? 2 : 3;
    }
    return made ? 1 : 0;
}

int DWCi_Acc_SetMaskBits(u32 *word, u32 bits, int shift, u32 mask) {
    if (bits & ~mask) {
        return 0;
    }
    *word = (*word & ~(mask << shift)) | (bits << shift);
    return 1;
}

u64 DWCi_Acc_GetUserId(const DwcAccData *data) {
    u32 flags = data->flags;
    u32 low = data->low;
    u32 high = flags & ACCOUNT_USERID_HI_MASK;

    return ((u64)high << 32) | low;
}

u32 DWCi_Acc_GetPlayerId(const DwcAccData *data) {
    return data->high;
}

u64 DWCi_Acc_GetFriendKey(const DwcAccData *data) {
    return ((u64)data->high << 32) | data->low;
}

u32 DWCi_Acc_GetGsProfileId(const DwcAccData *data) {
    return data->low;
}

void DWCi_Acc_SetUserId(DwcAccData *data, u64 userId) {
    DWCi_Acc_SetMaskBits(&data->flags, (u32)(userId >> 32), 0, ACCOUNT_USERID_HI_MASK);
    data->low = (u32)userId;
}

void DWCi_Acc_SetPlayerId(DwcAccData *data, u32 playerId) {
    data->high = playerId;
}

void DWCi_Acc_SetFriendKey(DwcAccData *data, u64 friendKey) {
    data->low = (u32)friendKey;
    data->high = (u32)(friendKey >> 32);
}

void DWCi_Acc_SetGsProfileId(DwcAccData *data, u32 gsProfileId) {
    data->low = gsProfileId;
}

u32 DWCi_Acc_GetFlags(const DwcAccData *data) {
    return (data->flags >> ACCOUNT_FLAGS_SHIFT) & ACCOUNT_FLAGS_MASK;
}

u32 DWCi_Acc_GetFlag_DataType(const DwcAccData *data) {
    return DWCi_Acc_GetFlags(data) & ACCOUNT_FLAG_TYPE_MASK;
}

BOOL DWC_IsBuddyFriendData(const DwcAccData *data) {
    if (DWCi_Acc_GetFlag_DataType(data) == ACCOUNT_TYPE_GS_PROFILE) {
        return (DWCi_Acc_GetFlags(data) & ACCOUNT_FLAG_BUDDY) == ACCOUNT_FLAG_BUDDY;
    }
    return FALSE;
}

u32 DWC_GetFriendDataType(const DwcAccData *data) {
    return DWCi_Acc_GetFlag_DataType(data);
}

int DWCi_Acc_SetFlags(DwcAccData *data, u32 flags) {
    return DWCi_Acc_SetMaskBits(&data->flags, flags, ACCOUNT_FLAGS_SHIFT, ACCOUNT_FLAGS_MASK);
}

void DWCi_Acc_SetFlag_DataType(DwcAccData *data, u32 type) {
    u32 flags = DWCi_Acc_GetFlags(data);

    DWCi_Acc_SetFlags(data, (flags & ~ACCOUNT_FLAG_TYPE_MASK) | type);
}

#pragma force_active on

void DWCi_SetBuddyFriendData(DwcAccData *data) {
    if (DWCi_Acc_GetFlag_DataType(data) == ACCOUNT_TYPE_GS_PROFILE) {
        u32 flags = DWCi_Acc_GetFlags(data) | ACCOUNT_FLAG_BUDDY;

        DWCi_Acc_SetFlags(data, flags);
    }
}

#pragma force_active off

u64 DWC_Acc_CreateFriendKey(u32 gsProfileId, u32 gameCode) {
    MATHCRC8Table table;
    u32 input[2];

    input[0] = gsProfileId;
    input[1] = gameCode;
    MATHi_CRC8InitTable(&table, 7);
    return ((u64)(MATH_CalcCRC8(&table, input, sizeof(input)) & 0x7F) << 32) | gsProfileId;
}

BOOL DWC_CheckFriendKey(const DwcUserData *user, u64 friendKey) {
    return DWC_Acc_CheckFriendKey(friendKey, user->gameCode);
}

#pragma force_active on

BOOL DWC_Acc_CheckFriendKey(u64 friendKey, u32 gameCode) {
    MATHCRC8Table table;
    u32 input[2];
    int check;

    if ((friendKey & 0x80000000ULL) != 0) {
        return FALSE;
    }
    input[0] = (u32)friendKey;
    input[1] = gameCode;
    MATHi_CRC8InitTable(&table, 7);
    check = MATH_CalcCRC8(&table, input, sizeof(input)) & 0x7F;
    return (u64)(s64)check == (friendKey >> 32);
}

u32 DWC_Acc_FriendKeyToGsProfileId(u64 friendKey, u32 gameCode) {
    if (DWC_Acc_CheckFriendKey(friendKey, gameCode)) {
        return friendKey & 0xFFFFFFFFULL;
    }
    return 0;
}

// Writes the lowest `bits` bits of value as base-32 digits (most significant first) and a terminator.
void DWCi_Acc_U64ToString32(u64 value, int bits, char *out) {
    int count = (bits + 4) / 5;
    char *last;
    s8 digit;
    int i;
    const s8 *digits = (const s8 *)gDwcAccBase32Digits;

    i = 0;
    if (count > 0) {
        last = out + count;
        last--;
        do {
            digit = digits[value & 31];
            *(last - i) = digit;
            value >>= 5;
            i++;
        } while (i < count);
    }
    out[count] = 0;
}

#pragma force_active off

void DWCi_Acc_LoginIdToUserName(const DwcAccData *loginId, u32 gameCode, char *out) {
    char temp[0x2C];

    DWCi_Acc_U64ToString32(DWCi_Acc_GetUserId(loginId), 43, temp + 0x15);
    DWCi_Acc_U64ToString32(DWCi_Acc_GetPlayerId(loginId), 32, temp);
    OS_SNPrintf(out, 0x15, gDwcAccUserNameFormat, temp + 0x15, (gameCode >> 24) & 0xFF, (gameCode >> 16) & 0xFF, (gameCode >> 8) & 0xFF, gameCode & 0xFF, temp);
}

void DWCi_Acc_CreateUserData(DwcUserData *user, u32 gameCode) {
    MATHCRC32Table table;

    MI_CpuFill8(user, 0, sizeof(DwcUserData));
    user->size = sizeof(DwcUserData);
    user->gsProfileId = 0;
    user->gameCode = gameCode;
    DWCi_Acc_CreateTempLoginId(&user->tempLoginId);
    DWCi_Acc_SetFlag_DataType(&user->loginId, ACCOUNT_TYPE_NONE);
    MATHi_CRC32InitTableRev(&table, 0xEDB88320);
    user->crc = MATH_CalcCRC32(&table, user, offsetof(DwcUserData, crc));
    user->flags |= ACCOUNT_USER_DATA_DIRTY;
}

void DWCi_Acc_CreateTempLoginId(DwcAccData *loginId) {
    u32 authId[5];
    u32 entropy[8];
    u32 i;
    u64 state;

    OS_GetLowEntropyData(entropy);
    for (i = 1; i < 8; i++) {
        entropy[i] ^= entropy[i - 1];
    }
    state = entropy[7];
    DWC_Auth_GetId(authId);
    if (authId[4]) {
        DWCi_Acc_SetUserId(loginId, *(u64 *)&authId[0]);
    } else {
        DWCi_Acc_SetUserId(loginId, *(u64 *)&authId[2]);
    }
    state = state * 0x5D588B656C078965ULL + 0x269EC3ULL;
    DWCi_Acc_SetPlayerId(loginId, state >> 32);
    DWCi_Acc_SetFlag_DataType(loginId, ACCOUNT_TYPE_LOGIN_ID);
}

BOOL DWCi_Acc_CheckConsoleUserId(const DwcAccData *loginId) {
    u32 authId[5];

    DWC_Auth_GetId(authId);
    if (authId[4]) {
        return DWCi_Acc_GetUserId(loginId) == *(u64 *)&authId[0];
    }
    return DWCi_Acc_GetUserId(loginId) == *(u64 *)&authId[2];
}

BOOL DWCi_Acc_IsValidLoginId(const DwcAccData *loginId) {
    return DWCi_Acc_GetFlag_DataType(loginId) == ACCOUNT_TYPE_LOGIN_ID;
}

BOOL DWCi_Acc_IsAuthentic(const DwcUserData *user) {
    return DWCi_Acc_IsValidLoginId(&user->loginId);
}

BOOL DWC_IsValidFriendData(const DwcAccData *data) {
    return DWCi_Acc_GetFlag_DataType(data) != ACCOUNT_TYPE_NONE;
}

BOOL DWCi_Acc_IsValidFriendData(const DwcAccData *data) {
    return DWC_IsValidFriendData(data);
}

void DWC_CreateUserData(DwcUserData *user, u32 gameCode) {
    DWCi_Acc_CreateUserData(user, gameCode);
}

BOOL DWC_CheckUserData(const DwcUserData *user) {
    MATHCRC32Table table;

    MATHi_CRC32InitTableRev(&table, 0xEDB88320);
    u32 crc = MATH_CalcCRC32(&table, user, offsetof(DwcUserData, crc));
    u32 stored = user->crc;
    if (crc == stored) {
        return TRUE;
    }
    return FALSE;
}

BOOL DWC_CheckHasProfile(const DwcUserData *user) {
    if (DWCi_Acc_IsValidLoginId(&user->loginId)) {
        if ((int)user->gsProfileId > 0) {
            return TRUE;
        }
    }
    return FALSE;
}

BOOL DWC_CheckValidConsole(const DwcUserData *user) {
    u32 authId[5];

    if (DWCi_Acc_GetFlag_DataType(&user->loginId) == ACCOUNT_TYPE_NONE) {
        return TRUE;
    }
    DWC_Auth_GetId(authId);
    if (authId[4] == 0) {
        return FALSE;
    }
    if (DWCi_Acc_GetUserId(&user->loginId) == *(u64 *)&authId[0]) {
        return TRUE;
    }
    return FALSE;
}

void DWCi_Acc_SetLoginIdToUserData(DwcUserData *user, const DwcAccData *loginId, u32 gsProfileId) {
    MATHCRC32Table table;

    user->loginId = *loginId;
    user->gsProfileId = gsProfileId;
    MATHi_CRC32InitTableRev(&table, 0xEDB88320);
    user->crc = MATH_CalcCRC32(&table, user, offsetof(DwcUserData, crc));
    user->flags |= ACCOUNT_USER_DATA_DIRTY;
}

BOOL DWC_CheckDirtyFlag(const DwcUserData *user) {
    return DWCi_Acc_IsDirty(user);
}

BOOL DWCi_Acc_IsDirty(const DwcUserData *user) {
    return (user->flags & ACCOUNT_USER_DATA_DIRTY) == ACCOUNT_USER_DATA_DIRTY;
}

void DWC_ClearDirtyFlag(DwcUserData *user) {
    DWCi_Acc_ClearDirty(user);
}

void DWCi_Acc_ClearDirty(DwcUserData *user) {
    MATHCRC32Table table;

    user->flags &= ~ACCOUNT_USER_DATA_DIRTY;
    MATHi_CRC32InitTableRev(&table, 0xEDB88320);
    user->crc = MATH_CalcCRC32(&table, user, offsetof(DwcUserData, crc));
}

u64 DWC_GetFriendKey(const DwcAccData *data) {
    if (DWCi_Acc_GetFlag_DataType(data) != ACCOUNT_TYPE_FRIEND_KEY) {
        return 0;
    }
    return DWCi_Acc_GetFriendKey(data);
}

// GameSpy profile id of a friend data entry: -1 for a login id (not known yet), 0 if invalid.
int DWC_GetGsProfileId(const DwcUserData *user, const DwcAccData *data) {
    switch (DWCi_Acc_GetFlag_DataType(data)) {
    case ACCOUNT_TYPE_FRIEND_KEY: {
        u64 friendKey = DWCi_Acc_GetFriendKey(data);

        if (!DWC_Acc_CheckFriendKey(friendKey, user->gameCode)) {
            return 0;
        }
        return DWC_Acc_FriendKeyToGsProfileId(friendKey, user->gameCode);
    }
    case ACCOUNT_TYPE_GS_PROFILE:
        return DWCi_Acc_GetGsProfileId(data);
    case ACCOUNT_TYPE_LOGIN_ID:
        return -1;
    default:
        return 0;
    }
}

u64 DWC_CreateFriendKey(const DwcUserData *user) {
    u32 gsProfileId = user->gsProfileId;
    u64 friendKey = 0;

    if (gsProfileId != 0) {
        friendKey = DWC_Acc_CreateFriendKey(gsProfileId, user->gameCode);
    }
    return friendKey;
}

void DWC_CreateFriendKeyToken(DwcAccData *token, u64 friendKey) {
    MI_CpuFill8(token, 0, sizeof(DwcAccData));
    DWCi_Acc_SetFriendKey(token, friendKey);
    DWCi_Acc_SetFlag_DataType(token, ACCOUNT_TYPE_FRIEND_KEY);
}

void DWC_CreateExchangeToken(const DwcUserData *user, DwcAccData *token) {
    MI_CpuFill8(token, 0, sizeof(DwcAccData));
    if (DWCi_Acc_IsAuthentic(user)) {
        DWCi_Acc_SetGsProfileId(token, user->gsProfileId);
        DWCi_Acc_SetFlag_DataType(token, ACCOUNT_TYPE_GS_PROFILE);
    } else {
        *token = user->tempLoginId;
    }
}

void DWC_SetGsProfileId(DwcAccData *data, u32 gsProfileId) {
    MI_CpuFill8(data, 0, sizeof(DwcAccData));
    DWCi_Acc_SetGsProfileId(data, gsProfileId);
    DWCi_Acc_SetFlag_DataType(data, ACCOUNT_TYPE_GS_PROFILE);
}

void DWC_LoginIdToUserName(const DwcUserData *user, const DwcAccData *loginId, char *out) {
    DWCi_Acc_LoginIdToUserName(loginId, user->gameCode, out);
}

BOOL DWC_IsEqualFriendData(const DwcAccData *a, const DwcAccData *b) {
    int type = DWCi_Acc_GetFlag_DataType(a);

    if (type != DWCi_Acc_GetFlag_DataType(b)) {
        return FALSE;
    }
    if (type == ACCOUNT_TYPE_GS_PROFILE) {
        return DWCi_Acc_GetGsProfileId(a) == DWCi_Acc_GetGsProfileId(b);
    }
    if (type == ACCOUNT_TYPE_LOGIN_ID) {
        if (DWCi_Acc_GetUserId(a) == DWCi_Acc_GetUserId(b)) {
            if (DWCi_Acc_GetPlayerId(a) == DWCi_Acc_GetPlayerId(b)) {
                return TRUE;
            }
        }
        return FALSE;
    }
    if (type == ACCOUNT_TYPE_FRIEND_KEY) {
        return DWCi_Acc_GetFriendKey(a) == DWCi_Acc_GetFriendKey(b);
    }
    return FALSE;
}
