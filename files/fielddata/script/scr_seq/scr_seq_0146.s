#include "constants/scrcmd.h"
#include "fielddata/script/scr_seq/event_0146.h"
#include "msgdata/msg/msg_0211.h"
	.include "asm/macros/script.inc"

	.rodata

	ScrDef scr_seq_0146_000
	ScrDef scr_seq_0146_001
	ScrDef scr_seq_0146_002
	ScrDef scr_seq_0146_003
	ScrDef scr_seq_0146_004
	ScrDef scr_seq_0146_005
	ScrDef scr_seq_0146_006
	ScrDef scr_seq_0146_007
	ScrDef scr_seq_0146_008
	ScrDef scr_seq_0146_009
	ScrDef scr_seq_0146_010
	ScrDef scr_seq_0146_011
	ScrDef scr_seq_0146_012
	ScrDef scr_seq_0146_013
	ScrDef scr_seq_0146_014
	ScrDef scr_seq_0146_015
	ScrDef scr_seq_0146_016
	ScrDef scr_seq_0146_017
	ScrDef scr_seq_0146_018
	ScrDefEnd

scr_seq_0146_000:
	PlaySE SEQ_SE_DP_SELECT
	LockAll
	FacePlayer
	GetPartySlotWithMove VAR_SPECIAL_RESULT, MOVE_CUT
	Compare VAR_SPECIAL_RESULT, 6
	GoToIfEq _009E
	CheckBadge BADGE_HIVE, VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 0
	GoToIfEq _009E
	NPCMsg msg_0211_00000
	TouchscreenMenuHide
	GetMenuChoice VAR_SPECIAL_RESULT
	TouchscreenMenuShow
	Compare VAR_SPECIAL_RESULT, 0
	GoToIfEq _00AD
	CloseMsg
	GoTo _093D
	End

_009E:
	NPCMsg msg_0211_00002
	WaitButton
	CloseMsg
	GoTo _093D
	End

_00AD:
	GetPartySlotWithMove VAR_SPECIAL_RESULT, MOVE_CUT
	CopyVar VAR_SPECIAL_x8004, VAR_SPECIAL_RESULT
	GetFollowPokePartyIndex VAR_SPECIAL_x8005
	BufferPartyMonNick 0, VAR_SPECIAL_RESULT
	NPCMsg msg_0211_00001
	CloseMsg
	GetPlayerState VAR_SPECIAL_RESULT
	FollowMonIsInactiveOrVisible VAR_SPECIAL_x8006
	Compare VAR_SPECIAL_RESULT, 2
	GoToIfNe _00EC
	PlayFieldMoveCutIn VAR_SPECIAL_x8004
	StartFieldMoveEffect 0, VAR_SPECIAL_x8005
	GoTo _0165

_00EC:
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfNe _0109
	PlayFieldMoveCutIn VAR_SPECIAL_x8004
	StartFieldMoveEffect 0, VAR_SPECIAL_x8005
	GoTo _0165

_0109:
	Compare VAR_SPECIAL_x8004, VAR_SPECIAL_x8005
	GoToIfEq _0126
	PlayFieldMoveCutIn VAR_SPECIAL_x8004
	StartFieldMoveEffect 0, VAR_SPECIAL_x8005
	GoTo _0165

_0126:
	Compare VAR_SPECIAL_x8006, 1
	GoToIfNe _0143
	PlayFieldMoveCutIn VAR_SPECIAL_x8004
	StartFieldMoveEffect 0, VAR_SPECIAL_x8005
	GoTo _0165

_0143:
	SwapPlayerAndFollowMonPositions 1
	GetPartyLeadAlive VAR_TEMP_x4000
	GetPartyMonSpecies VAR_TEMP_x4000, VAR_TEMP_x4000
	Call _025B
	PlayCry VAR_TEMP_x4000, 0
	WaitCry
	StartFieldMoveEffect 3, VAR_SPECIAL_x8005
_0165:
	Wait 7, VAR_SPECIAL_RESULT
	HidePerson VAR_SPECIAL_LAST_TALKED
_016F:
	Wait 1, VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_x8005, 0
	GoToIfEq _016F
	GoTo _093D
	End

scr_seq_0146_007:
	FollowMonResetMovement
	LockAll
	BufferPartyMonNick 0, VAR_SPECIAL_x8000
	NPCMsg msg_0211_00001
	CloseMsg
	GetFollowPokePartyIndex VAR_SPECIAL_x8004
	GetPlayerState VAR_SPECIAL_RESULT
	FollowMonIsInactiveOrVisible VAR_SPECIAL_x8006
	Compare VAR_SPECIAL_RESULT, 2
	GoToIfNe _01C1
	PlayFieldMoveCutIn VAR_SPECIAL_x8000
	StartFieldMoveEffect 0, VAR_SPECIAL_x8005
	GoTo _023A

_01C1:
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfNe _01DE
	PlayFieldMoveCutIn VAR_SPECIAL_x8000
	StartFieldMoveEffect 0, VAR_SPECIAL_x8005
	GoTo _023A

_01DE:
	Compare VAR_SPECIAL_x8000, VAR_SPECIAL_x8004
	GoToIfEq _01FB
	PlayFieldMoveCutIn VAR_SPECIAL_x8000
	StartFieldMoveEffect 0, VAR_SPECIAL_x8005
	GoTo _023A

_01FB:
	Compare VAR_SPECIAL_x8006, 1
	GoToIfNe _0218
	PlayFieldMoveCutIn VAR_SPECIAL_x8004
	StartFieldMoveEffect 0, VAR_SPECIAL_x8005
	GoTo _023A

_0218:
	SwapPlayerAndFollowMonPositions 1
	GetPartyLeadAlive VAR_TEMP_x4000
	GetPartyMonSpecies VAR_TEMP_x4000, VAR_TEMP_x4000
	Call _025B
	PlayCry VAR_TEMP_x4000, 0
	WaitCry
	StartFieldMoveEffect 3, VAR_SPECIAL_x8005
_023A:
	Wait 7, VAR_SPECIAL_RESULT
	HidePerson VAR_SPECIAL_LAST_TALKED
_0244:
	Wait 1, VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_x8005, 0
	GoToIfEq _0244
	ReleaseAll
	End

_025B:
	FollowMonAddMood 20
	FirstAliveMonHasType 12, VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfNe _027C
	FollowMonJumpOnSpot 2
	FollowMonAddMood 1
	GoTo _027F

_027C:
	FollowMonJumpOnSpot 1
_027F:
	Return

scr_seq_0146_001:
	PlaySE SEQ_SE_DP_SELECT
	LockAll
	FacePlayer
	GetPartySlotWithMove VAR_SPECIAL_RESULT, MOVE_ROCK_SMASH
	CopyVar VAR_SPECIAL_x8004, VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 6
	GoToIfEq _02D7
	CheckBadge BADGE_ZEPHYR, VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 0
	GoToIfEq _02D7
	NPCMsg msg_0211_00003
	TouchscreenMenuHide
	GetMenuChoice VAR_SPECIAL_RESULT
	TouchscreenMenuShow
	Compare VAR_SPECIAL_RESULT, 0
	GoToIfEq _02E6
	CloseMsg
	GoTo _093D
	End

_02D7:
	NPCMsg msg_0211_00004
	WaitButton
	CloseMsg
	GoTo _093D
	End

_02E6:
	BufferPartyMonNick 0, VAR_SPECIAL_x8004
	NPCMsg msg_0211_00005
	CloseMsg
	GetFollowPokePartyIndex VAR_SPECIAL_x8005
	GetPlayerState VAR_SPECIAL_RESULT
	FollowMonIsInactiveOrVisible VAR_SPECIAL_x8006
	Compare VAR_SPECIAL_RESULT, 2
	GoToIfNe _031F
	SetVar VAR_SPECIAL_x8007, 0
	PlayFieldMoveCutIn VAR_SPECIAL_x8004
	StartFieldMoveEffect 1, VAR_SPECIAL_x8005
	GoTo _03AA

_031F:
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfNe _0342
	SetVar VAR_SPECIAL_x8007, 0
	PlayFieldMoveCutIn VAR_SPECIAL_x8004
	StartFieldMoveEffect 1, VAR_SPECIAL_x8005
	GoTo _03AA

_0342:
	Compare VAR_SPECIAL_x8004, VAR_SPECIAL_x8005
	GoToIfEq _0365
	SetVar VAR_SPECIAL_x8007, 0
	PlayFieldMoveCutIn VAR_SPECIAL_x8004
	StartFieldMoveEffect 1, VAR_SPECIAL_x8005
	GoTo _03AA

_0365:
	Compare VAR_SPECIAL_x8006, 1
	GoToIfNe _0382
	PlayFieldMoveCutIn VAR_SPECIAL_x8004
	StartFieldMoveEffect 1, VAR_SPECIAL_x8005
	GoTo _03AA

_0382:
	SetVar VAR_SPECIAL_x8007, 1
	SwapPlayerAndFollowMonPositions 1
	GetPartyLeadAlive VAR_TEMP_x4000
	GetPartyMonSpecies VAR_TEMP_x4000, VAR_TEMP_x4000
	Call _04D0
	PlayCry VAR_TEMP_x4000, 0
	WaitCry
	StartFieldMoveEffect 2, VAR_SPECIAL_x8005
_03AA:
	Wait 10, VAR_SPECIAL_RESULT
	HidePerson VAR_SPECIAL_LAST_TALKED
_03B4:
	Wait 1, VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_x8005, 0
	GoToIfEq _03B4
	ReleaseAll
	RockSmashItemCheck VAR_SPECIAL_x8007, VAR_SPECIAL_RESULT, VAR_SPECIAL_x8006
	GoTo _0CEB
	End

scr_seq_0146_008:
	FollowMonResetMovement
	LockAll
	BufferPartyMonNick 0, VAR_SPECIAL_x8000
	NPCMsg msg_0211_00005
	CloseMsg
	GetFollowPokePartyIndex VAR_SPECIAL_x8004
	GetPlayerState VAR_SPECIAL_RESULT
	FollowMonIsInactiveOrVisible VAR_SPECIAL_x8006
	Compare VAR_SPECIAL_RESULT, 2
	GoToIfNe _0416
	SetVar VAR_SPECIAL_x8007, 0
	PlayFieldMoveCutIn VAR_SPECIAL_x8000
	StartFieldMoveEffect 1, VAR_SPECIAL_x8005
	GoTo _04A1

_0416:
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfNe _0439
	SetVar VAR_SPECIAL_x8007, 0
	PlayFieldMoveCutIn VAR_SPECIAL_x8000
	StartFieldMoveEffect 1, VAR_SPECIAL_x8005
	GoTo _04A1

_0439:
	Compare VAR_SPECIAL_x8000, VAR_SPECIAL_x8004
	GoToIfEq _045C
	SetVar VAR_SPECIAL_x8007, 0
	PlayFieldMoveCutIn VAR_SPECIAL_x8000
	StartFieldMoveEffect 1, VAR_SPECIAL_x8005
	GoTo _04A1

_045C:
	Compare VAR_SPECIAL_x8006, 1
	GoToIfNe _0479
	PlayFieldMoveCutIn VAR_SPECIAL_x8004
	StartFieldMoveEffect 1, VAR_SPECIAL_x8005
	GoTo _04A1

_0479:
	SwapPlayerAndFollowMonPositions 1
	SetVar VAR_SPECIAL_x8007, 1
	GetPartyLeadAlive VAR_TEMP_x4000
	GetPartyMonSpecies VAR_TEMP_x4000, VAR_TEMP_x4000
	Call _04D0
	PlayCry VAR_TEMP_x4000, 0
	WaitCry
	StartFieldMoveEffect 2, VAR_SPECIAL_x8005
_04A1:
	Wait 10, VAR_SPECIAL_RESULT
	HidePerson VAR_SPECIAL_LAST_TALKED
_04AB:
	Wait 1, VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_x8005, 0
	GoToIfEq _04AB
	ReleaseAll
	RockSmashItemCheck VAR_SPECIAL_x8007, VAR_SPECIAL_RESULT, VAR_SPECIAL_x8006
	GoTo _0CEB
	End

_04D0:
	FollowMonAddMood 20
	FirstAliveMonHasType 1, VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfNe _04F1
	FollowMonJumpOnSpot 2
	FollowMonAddMood 1
	GoTo _04F4

_04F1:
	FollowMonJumpOnSpot 1
_04F4:
	Return

scr_seq_0146_002:
	PlaySE SEQ_SE_DP_SELECT
	LockAll
	FacePlayer
	StrengthFlagAction 2, VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfNe _051C
	Call _061D
	GoTo _093D

_051C:
	GetPartySlotWithMove VAR_SPECIAL_RESULT, MOVE_STRENGTH
	Compare VAR_SPECIAL_RESULT, 6
	GoToIfEq _0564
	CheckBadge BADGE_PLAIN, VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 0
	GoToIfEq _0564
	NPCMsg msg_0211_00007
	TouchscreenMenuHide
	GetMenuChoice VAR_SPECIAL_RESULT
	TouchscreenMenuShow
	Compare VAR_SPECIAL_RESULT, 0
	GoToIfEq _0573
	CloseMsg
	GoTo _093D
	End

_0564:
	NPCMsg msg_0211_00009
	WaitButton
	CloseMsg
	GoTo _093D
	End

_0573:
	StrengthFlagAction 1
	GetPartySlotWithMove VAR_SPECIAL_RESULT, MOVE_STRENGTH
	CopyVar VAR_SPECIAL_x8004, VAR_SPECIAL_RESULT
	BufferPartyMonNick 0, VAR_SPECIAL_RESULT
	NPCMsg msg_0211_00011
	CloseMsg
	GetFollowPokePartyIndex VAR_SPECIAL_x8005
	GetPlayerState VAR_SPECIAL_RESULT
	FollowMonIsInactiveOrVisible VAR_SPECIAL_x8006
	Compare VAR_SPECIAL_RESULT, 2
	GoToIfNe _05AF
	PlayFieldMoveCutIn VAR_SPECIAL_x8004
	GoTo _060E

_05AF:
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfNe _05C6
	PlayFieldMoveCutIn VAR_SPECIAL_x8004
	GoTo _060E

_05C6:
	Compare VAR_SPECIAL_x8004, VAR_SPECIAL_x8005
	GoToIfEq _05DD
	PlayFieldMoveCutIn VAR_SPECIAL_x8004
	GoTo _060E

_05DD:
	Compare VAR_SPECIAL_x8006, 1
	GoToIfNe _05F4
	PlayFieldMoveCutIn VAR_SPECIAL_x8004
	GoTo _060E

_05F4:
	GetPartyLeadAlive VAR_TEMP_x4000
	GetPartyMonSpecies VAR_TEMP_x4000, VAR_TEMP_x4000
	Call _0715
	PlayCry VAR_TEMP_x4000, 0
	WaitCry
	FollowMonGrowAndShrink
_060E:
	NPCMsg msg_0211_00012
	WaitButton
	CloseMsg
	GoTo _093D
	End

_061D:
	NPCMsg msg_0211_00010
	WaitButton
	CloseMsg
	Return

scr_seq_0146_009:
	FollowMonResetMovement
	LockAll
	StrengthFlagAction 2, VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfNe _0648
	Call _061D
	GoTo _0945

_0648:
	StrengthFlagAction 1
	BufferPartyMonNick 0, VAR_SPECIAL_x8000
	NPCMsg msg_0211_00011
	CloseMsg
	GetFollowPokePartyIndex VAR_SPECIAL_x8004
	GetPlayerState VAR_SPECIAL_RESULT
	FollowMonIsInactiveOrVisible VAR_SPECIAL_x8006
	Compare VAR_SPECIAL_RESULT, 2
	GoToIfNe _0678
	PlayFieldMoveCutIn VAR_SPECIAL_x8000
	GoTo _06D7

_0678:
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfNe _068F
	PlayFieldMoveCutIn VAR_SPECIAL_x8000
	GoTo _06D7

_068F:
	Compare VAR_SPECIAL_x8000, VAR_SPECIAL_x8004
	GoToIfEq _06A6
	PlayFieldMoveCutIn VAR_SPECIAL_x8000
	GoTo _06D7

_06A6:
	Compare VAR_SPECIAL_x8006, 1
	GoToIfNe _06BD
	PlayFieldMoveCutIn VAR_SPECIAL_x8000
	GoTo _06D7

_06BD:
	GetPartyLeadAlive VAR_TEMP_x4000
	GetPartyMonSpecies VAR_TEMP_x4000, VAR_TEMP_x4000
	Call _0715
	PlayCry VAR_TEMP_x4000, 0
	WaitCry
	FollowMonGrowAndShrink
_06D7:
	NPCMsg msg_0211_00012
	WaitButton
	CloseMsg
	GoTo _0945
	End

scr_seq_0146_015:
	PlaySE SEQ_SE_GS_IWAOTOSHI01
	Wait 12, VAR_SPECIAL_RESULT
	PlaySE SEQ_SE_GS_IWAOTOSHI02
	ScreenShake 0, 4, 2, 8
	ScreenShake 0, 2, 1, 8
	WaitSE SEQ_SE_GS_IWAOTOSHI02
	NPCMsg msg_0211_00013
	WaitButton
	CloseMsg
	End

_0715:
	FirstAliveMonHasType 0, VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfNe _0733
	FollowMonJumpOnSpot 2
	FollowMonAddMood 1
	GoTo _0736

_0733:
	FollowMonJumpOnSpot 1
_0736:
	Return

scr_seq_0146_003:
	PlaySE SEQ_SE_DP_SELECT
	LockAll
	GetPartySlotWithMove VAR_SPECIAL_RESULT, MOVE_ROCK_CLIMB
	Compare VAR_SPECIAL_RESULT, 6
	GoToIfEq _0797
	CheckBadge BADGE_EARTH, VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 0
	GoToIfEq _0797
	CheckEscortMode VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfEq _07A6
	NPCMsg msg_0211_00020
	TouchscreenMenuHide
	GetMenuChoice VAR_SPECIAL_RESULT
	TouchscreenMenuShow
	Compare VAR_SPECIAL_RESULT, 0
	GoToIfEq _07B5
	CloseMsg
	GoTo _0941
	End

_0797:
	NPCMsg msg_0211_00022
	WaitButton
	CloseMsg
	GoTo _0941
	End

_07A6:
	NPCMsg msg_0211_00023
	WaitButton
	CloseMsg
	GoTo _0941
	End

_07B5:
	GetPartySlotWithMove VAR_SPECIAL_RESULT, MOVE_ROCK_CLIMB
	CopyVar VAR_SPECIAL_x8004, VAR_SPECIAL_RESULT
	BufferPartyMonNick 0, VAR_SPECIAL_RESULT
	NPCMsg msg_0211_00021
	CloseMsg
	RockClimb VAR_SPECIAL_x8004
	GoTo _0941
	End

scr_seq_0146_010:
	FollowMonResetMovement
	LockAll
	BufferPartyMonNick 0, VAR_SPECIAL_x8000
	NPCMsg msg_0211_00021
	CloseMsg
	RockClimb VAR_SPECIAL_x8000
	ReleaseAll
	End

scr_seq_0146_004:
	PlaySE SEQ_SE_DP_SELECT
	LockAll
	CheckEscortMode VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfEq _0826
	NPCMsg msg_0211_00014
	TouchscreenMenuHide
	GetMenuChoice VAR_SPECIAL_RESULT
	TouchscreenMenuShow
	Compare VAR_SPECIAL_RESULT, 0
	GoToIfEq _0833
	CloseMsg
	GoTo _0941
	End

_0826:
	NPCMsg msg_0211_00016
	WaitButton
	CloseMsg
	GoTo _0941

_0833:
	GetPartySlotWithMove VAR_SPECIAL_RESULT, MOVE_SURF
	CopyVar VAR_SPECIAL_x8004, VAR_SPECIAL_RESULT
	BufferPartyMonNick 0, VAR_SPECIAL_RESULT
	NPCMsg msg_0211_00015
	CloseMsg
	Surf VAR_SPECIAL_x8004
	GoTo _0941
	End

scr_seq_0146_011:
	FollowMonResetMovement
	LockAll
	BufferPartyMonNick 0, VAR_SPECIAL_x8000
	NPCMsg msg_0211_00015
	CloseMsg
	Release obj_player
	Surf VAR_SPECIAL_x8000
	Lock obj_player
	ReleaseAll
	End

scr_seq_0146_013:
	FollowMonResetMovement
	LockAll
	BufferPartyMonNick 0, VAR_SPECIAL_x8000
	NPCMsg msg_0211_00028
	CloseMsg
	GetFollowPokePartyIndex VAR_SPECIAL_x8005
	GetPlayerState VAR_SPECIAL_RESULT
	FollowMonIsInactiveOrVisible VAR_SPECIAL_x8006
	Compare VAR_SPECIAL_RESULT, 2
	GoToIfNe _08A4
	PlayFieldMoveCutIn VAR_SPECIAL_x8000
	GoTo _0909

_08A4:
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfNe _08BB
	PlayFieldMoveCutIn VAR_SPECIAL_x8000
	GoTo _0909

_08BB:
	Compare VAR_SPECIAL_x8000, VAR_SPECIAL_x8005
	GoToIfEq _08D2
	PlayFieldMoveCutIn VAR_SPECIAL_x8000
	GoTo _0909

_08D2:
	Compare VAR_SPECIAL_x8006, 1
	GoToIfNe _08E9
	PlayFieldMoveCutIn VAR_SPECIAL_x8000
	GoTo _0909

_08E9:
	GetPartyLeadAlive VAR_TEMP_x4000
	GetPartyMonSpecies VAR_TEMP_x4000, VAR_TEMP_x4000
	Call _091A
	PlayCry VAR_TEMP_x4000, 0
	WaitCry
	FollowMonFlash 16, 2
	FollowMonFlash 16, 2
_0909:
	FlashAction 1
	FlashEffect
	Wait 42, VAR_SPECIAL_RESULT
	GoTo _0945

_091A:
	FirstAliveMonHasType 14, VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfNe _0938
	FollowMonJumpOnSpot 2
	FollowMonAddMood 1
	GoTo _093B

_0938:
	FollowMonJumpOnSpot 1
_093B:
	Return

_093D:
	ReleaseAll
	End

_0941:
	ReleaseAll
	End

_0945:
	ReleaseAll
	End

scr_seq_0146_005:
	PlaySE SEQ_SE_DP_SELECT
	LockAll
	GetPartySlotWithMove VAR_SPECIAL_RESULT, MOVE_WATERFALL
	Compare VAR_SPECIAL_RESULT, 6
	GoToIfEq _0997
	CheckBadge BADGE_RISING, VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 0
	GoToIfEq _0997
	NPCMsg msg_0211_00024
	TouchscreenMenuHide
	GetMenuChoice VAR_SPECIAL_RESULT
	TouchscreenMenuShow
	Compare VAR_SPECIAL_RESULT, 0
	GoToIfEq _09A6
	CloseMsg
	GoTo _0941
	End

_0997:
	NPCMsg msg_0211_00026
	WaitButton
	CloseMsg
	GoTo _0941
	End

_09A6:
	GetPartySlotWithMove VAR_SPECIAL_RESULT, MOVE_WATERFALL
	CopyVar VAR_SPECIAL_x8004, VAR_SPECIAL_RESULT
	BufferPartyMonNick 0, VAR_SPECIAL_RESULT
	NPCMsg msg_0211_00025
	CloseMsg
	Waterfall VAR_SPECIAL_x8004
	GoTo _0941
	End

scr_seq_0146_012:
	FollowMonResetMovement
	LockAll
	BufferPartyMonNick 0, VAR_SPECIAL_x8000
	NPCMsg msg_0211_00025
	CloseMsg
	Release obj_player
	Waterfall VAR_SPECIAL_x8000
	Lock obj_player
	ReleaseAll
	End

scr_seq_0146_016:
	PlaySE SEQ_SE_DP_SELECT
	LockAll
	GetPartySlotWithMove VAR_SPECIAL_RESULT, MOVE_WHIRLPOOL
	Compare VAR_SPECIAL_RESULT, 6
	GoToIfEq _0A34
	CheckBadge BADGE_GLACIER, VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 0
	GoToIfEq _0A34
	NPCMsg msg_0211_00029
	TouchscreenMenuHide
	GetMenuChoice VAR_SPECIAL_RESULT
	TouchscreenMenuShow
	Compare VAR_SPECIAL_RESULT, 0
	GoToIfEq _0A43
	CloseMsg
	GoTo _0941
	End

_0A34:
	NPCMsg msg_0211_00031
	WaitButton
	CloseMsg
	GoTo _0941
	End

_0A43:
	GetPartySlotWithMove VAR_SPECIAL_RESULT, MOVE_WHIRLPOOL
	CopyVar VAR_SPECIAL_x8004, VAR_SPECIAL_RESULT
	BufferPartyMonNick 0, VAR_SPECIAL_RESULT
	NPCMsg msg_0211_00030
	CloseMsg
	Whirlpool VAR_SPECIAL_x8004
	GoTo _0941
	End

scr_seq_0146_017:
	FollowMonResetMovement
	LockAll
	BufferPartyMonNick 0, VAR_SPECIAL_x8000
	NPCMsg msg_0211_00030
	CloseMsg
	Release obj_player
	Whirlpool VAR_SPECIAL_x8000
	Lock obj_player
	ReleaseAll
	End

scr_seq_0146_006:
	End

scr_seq_0146_014:
	PlaySE SEQ_SE_DP_SELECT
	LockAll
	FacePlayer
	GetPartySlotWithMove VAR_SPECIAL_RESULT, MOVE_HEADBUTT
	Compare VAR_SPECIAL_RESULT, 6
	GoToIfEq _0AC2
	NPCMsg msg_0211_00032
	TouchscreenMenuHide
	GetMenuChoice VAR_SPECIAL_RESULT
	TouchscreenMenuShow
	Compare VAR_SPECIAL_RESULT, 0
	GoToIfEq _0AD1
	CloseMsg
	GoTo _093D
	End

_0AC2:
	NPCMsg msg_0211_00034
	WaitButton
	CloseMsg
	GoTo _093D
	End

_0AD1:
	GetPartySlotWithMove VAR_SPECIAL_RESULT, MOVE_HEADBUTT
	CopyVar VAR_SPECIAL_x8004, VAR_SPECIAL_RESULT
	GetFollowPokePartyIndex VAR_SPECIAL_x8005
	BufferPartyMonNick 0, VAR_SPECIAL_RESULT
	NPCMsg msg_0211_00033
	CloseMsg
	GetPlayerState VAR_SPECIAL_RESULT
	FollowMonIsInactiveOrVisible VAR_SPECIAL_x8006
	Compare VAR_SPECIAL_RESULT, 2
	GoToIfNe _0B10
	PlayFieldMoveCutIn VAR_SPECIAL_x8004
	StartFieldMoveEffect 4, VAR_SPECIAL_x8005
	GoTo _0BAE

_0B10:
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfNe _0B2D
	PlayFieldMoveCutIn VAR_SPECIAL_x8004
	StartFieldMoveEffect 4, VAR_SPECIAL_x8005
	GoTo _0BAE

_0B2D:
	Compare VAR_SPECIAL_x8004, VAR_SPECIAL_x8005
	GoToIfEq _0B4A
	PlayFieldMoveCutIn VAR_SPECIAL_x8004
	StartFieldMoveEffect 4, VAR_SPECIAL_x8005
	GoTo _0BAE

_0B4A:
	Compare VAR_SPECIAL_x8006, 1
	GoToIfNe _0B67
	PlayFieldMoveCutIn VAR_SPECIAL_x8004
	StartFieldMoveEffect 4, VAR_SPECIAL_x8005
	GoTo _0BAE

_0B67:
	FollowMonIsNextToPlayer VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfNe _0BA0
	SwapPlayerAndFollowMonPositions 1
	GetPartyLeadAlive VAR_TEMP_x4000
	GetPartyMonSpecies VAR_TEMP_x4000, VAR_TEMP_x4000
	Call _0CC5
	PlayCry VAR_TEMP_x4000, 0
	WaitCry
	StartFieldMoveEffect 5, VAR_SPECIAL_x8005
	GoTo _0BAE

_0BA0:
	FollowMonRecall
	FollowMonReleaseNextToPlayer
	PlayFieldMoveCutIn VAR_SPECIAL_x8004
	StartFieldMoveEffect 4, VAR_SPECIAL_x8005
_0BAE:
	Wait 7, VAR_SPECIAL_RESULT
_0BB4:
	Wait 1, VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_x8005, 0
	GoToIfEq _0BB4
	ReleaseAll
	TryHeadbuttEncounter VAR_SPECIAL_RESULT
	End

scr_seq_0146_018:
	FollowMonResetMovement
	LockAll
	BufferPartyMonNick 0, VAR_SPECIAL_x8000
	NPCMsg msg_0211_00033
	CloseMsg
	GetFollowPokePartyIndex VAR_SPECIAL_x8004
	GetPlayerState VAR_SPECIAL_RESULT
	FollowMonIsInactiveOrVisible VAR_SPECIAL_x8006
	Compare VAR_SPECIAL_RESULT, 2
	GoToIfNe _0C06
	PlayFieldMoveCutIn VAR_SPECIAL_x8000
	StartFieldMoveEffect 4, VAR_SPECIAL_x8005
	GoTo _0CA4

_0C06:
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfNe _0C23
	PlayFieldMoveCutIn VAR_SPECIAL_x8000
	StartFieldMoveEffect 4, VAR_SPECIAL_x8005
	GoTo _0CA4

_0C23:
	Compare VAR_SPECIAL_x8000, VAR_SPECIAL_x8004
	GoToIfEq _0C40
	PlayFieldMoveCutIn VAR_SPECIAL_x8000
	StartFieldMoveEffect 4, VAR_SPECIAL_x8005
	GoTo _0CA4

_0C40:
	Compare VAR_SPECIAL_x8006, 1
	GoToIfNe _0C5D
	PlayFieldMoveCutIn VAR_SPECIAL_x8004
	StartFieldMoveEffect 4, VAR_SPECIAL_x8005
	GoTo _0CA4

_0C5D:
	FollowMonIsNextToPlayer VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfNe _0C96
	SwapPlayerAndFollowMonPositions 1
	GetPartyLeadAlive VAR_TEMP_x4000
	GetPartyMonSpecies VAR_TEMP_x4000, VAR_TEMP_x4000
	Call _0CC5
	PlayCry VAR_TEMP_x4000, 0
	WaitCry
	StartFieldMoveEffect 5, VAR_SPECIAL_x8005
	GoTo _0CA4

_0C96:
	FollowMonRecall
	FollowMonReleaseNextToPlayer
	PlayFieldMoveCutIn VAR_SPECIAL_x8004
	StartFieldMoveEffect 4, VAR_SPECIAL_x8005
_0CA4:
	Wait 7, VAR_SPECIAL_RESULT
_0CAA:
	Wait 1, VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_x8005, 0
	GoToIfEq _0CAA
	ReleaseAll
	TryHeadbuttEncounter VAR_SPECIAL_RESULT
	End

_0CC5:
	FollowMonAddMood 20
	FirstAliveMonHasType 0, VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfNe _0CE6
	FollowMonJumpOnSpot 2
	FollowMonAddMood 1
	GoTo _0CE9

_0CE6:
	FollowMonJumpOnSpot 1
_0CE9:
	Return

_0CEB:
	Compare VAR_SPECIAL_RESULT, 0
	GoToIfEq _0D2A
	CopyVar VAR_SPECIAL_x8004, VAR_SPECIAL_x8006
	SetVar VAR_SPECIAL_x8005, 1
	BufferItemNameIndef 1, VAR_SPECIAL_x8004
	Capitalize 1
	NPCMsg msg_0211_00006
	HasSpaceForItem VAR_SPECIAL_x8004, VAR_SPECIAL_x8005, VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 0
	GoToIfEq _0D2C
	CallStd std_obtain_item_verbose
	CloseMsg
_0D2A:
	End

_0D2C:
	CallStd std_bag_is_full
	CloseMsg
	End
	.balign 4, 0
