#ifndef POKEHEARTGOLD_DWC_ACCOUNT_INTERNAL_H
#define POKEHEARTGOLD_DWC_ACCOUNT_INTERNAL_H

// NitroDWC account data: the user data block and the 12-byte login id / friend data entries.

#include <nitro.h>
#include <stddef.h>

#include "dwc/dwc_bm_internal.h"

// Login id or friend data entry. Which of the fields are used depends on the data type in the flags.
typedef struct DwcAccData {
    u32 flags; // bits 0-10: bits 32-42 of the user id; bits 11-31: flags (ACCOUNT_FLAG_*)
    u32 low;   // user id bits 0-31 / GameSpy profile id / friend key bits 0-31
    u32 high;  // player id / friend key bits 32-63
} DwcAccData;

#define ACCOUNT_FLAGS_SHIFT    11
#define ACCOUNT_FLAGS_MASK     0x1FFFFF
#define ACCOUNT_USERID_HI_MASK 0x7FF
#define ACCOUNT_FLAG_TYPE_MASK 3 // ACCOUNT_TYPE_*
#define ACCOUNT_FLAG_BUDDY     4

#define ACCOUNT_TYPE_NONE       0
#define ACCOUNT_TYPE_LOGIN_ID   1
#define ACCOUNT_TYPE_FRIEND_KEY 2
#define ACCOUNT_TYPE_GS_PROFILE 3

typedef struct DwcUserData {
    u32 size;               // sizeof(DwcUserData)
    DwcAccData tempLoginId; // made from this console's ids before the first log-in
    DwcAccData loginId;
    u32 gsProfileId;
    u32 flags; // bit 0: dirty
    u32 gameCode;
    u8 unk_28[0x14];
    u32 crc; // CRC-32 of the bytes before it
} DwcUserData;

#define ACCOUNT_USER_DATA_DIRTY 1

int DWC_Init(void *work);
int DWCi_Acc_SetMaskBits(u32 *word, u32 bits, int shift, u32 mask);
u64 DWCi_Acc_GetUserId(const DwcAccData *data);
u32 DWCi_Acc_GetPlayerId(const DwcAccData *data);
u64 DWCi_Acc_GetFriendKey(const DwcAccData *data);
u32 DWCi_Acc_GetGsProfileId(const DwcAccData *data);
void DWCi_Acc_SetUserId(DwcAccData *data, u64 userId);
void DWCi_Acc_SetPlayerId(DwcAccData *data, u32 playerId);
void DWCi_Acc_SetFriendKey(DwcAccData *data, u64 friendKey);
void DWCi_Acc_SetGsProfileId(DwcAccData *data, u32 gsProfileId);
u32 DWCi_Acc_GetFlags(const DwcAccData *data);
u32 DWCi_Acc_GetFlag_DataType(const DwcAccData *data);
BOOL DWC_IsBuddyFriendData(const DwcAccData *data);
u32 DWC_GetFriendDataType(const DwcAccData *data);
int DWCi_Acc_SetFlags(DwcAccData *data, u32 flags);
void DWCi_Acc_SetFlag_DataType(DwcAccData *data, u32 type);
void DWCi_SetBuddyFriendData(DwcAccData *data);
u64 DWC_Acc_CreateFriendKey(u32 gsProfileId, u32 gameCode);
BOOL DWC_CheckFriendKey(const DwcUserData *user, u64 friendKey);
BOOL DWC_Acc_CheckFriendKey(u64 friendKey, u32 gameCode);
u32 DWC_Acc_FriendKeyToGsProfileId(u64 friendKey, u32 gameCode);
void DWCi_Acc_U64ToString32(u64 value, int bits, char *out);
void DWCi_Acc_LoginIdToUserName(const DwcAccData *loginId, u32 gameCode, char *out);
void DWCi_Acc_CreateUserData(DwcUserData *user, u32 gameCode);
void DWCi_Acc_CreateTempLoginId(DwcAccData *loginId);
BOOL DWCi_Acc_CheckConsoleUserId(const DwcAccData *loginId);
BOOL DWCi_Acc_IsValidLoginId(const DwcAccData *loginId);
BOOL DWCi_Acc_IsAuthentic(const DwcUserData *user);
BOOL DWC_IsValidFriendData(const DwcAccData *data);
BOOL DWCi_Acc_IsValidFriendData(const DwcAccData *data);
void DWC_CreateUserData(DwcUserData *user, u32 gameCode);
BOOL DWC_CheckUserData(const DwcUserData *user);
BOOL DWC_CheckHasProfile(const DwcUserData *user);
BOOL DWC_CheckValidConsole(const DwcUserData *user);
void DWCi_Acc_SetLoginIdToUserData(DwcUserData *user, const DwcAccData *loginId, u32 gsProfileId);
BOOL DWC_CheckDirtyFlag(const DwcUserData *user);
BOOL DWCi_Acc_IsDirty(const DwcUserData *user);
void DWC_ClearDirtyFlag(DwcUserData *user);
void DWCi_Acc_ClearDirty(DwcUserData *user);
u64 DWC_GetFriendKey(const DwcAccData *data);
int DWC_GetGsProfileId(const DwcUserData *user, const DwcAccData *data);
u64 DWC_CreateFriendKey(const DwcUserData *user);
void DWC_CreateFriendKeyToken(DwcAccData *token, u64 friendKey);
void DWC_CreateExchangeToken(const DwcUserData *user, DwcAccData *token);
void DWC_SetGsProfileId(DwcAccData *data, u32 gsProfileId);
void DWC_LoginIdToUserName(const DwcUserData *user, const DwcAccData *loginId, char *out);
BOOL DWC_IsEqualFriendData(const DwcAccData *a, const DwcAccData *b);

// NitroSDK functions the nitro headers do not declare
void OSi_ReferSymbol(const void *symbol);
u8 MATH_CalcCRC8(const MATHCRC8Table *table, const void *data, u32 dataLength);
void MATHi_CRC32InitTableRev(MATHCRC32Table *table, u32 poly);
u32 MATH_CalcCRC32(const MATHCRC32Table *table, const void *data, u32 dataLength);

extern const char _version_NINTENDO_DWC[];
extern const char gDwcAccBase32Digits[]; // "0123456789abcdefghijklmnopqrstuv"
extern const char gDwcAccUserNameFormat[];

#endif // POKEHEARTGOLD_DWC_ACCOUNT_INTERNAL_H
