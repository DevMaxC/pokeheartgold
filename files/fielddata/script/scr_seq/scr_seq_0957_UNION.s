#include "constants/scrcmd.h"
#include "fielddata/script/scr_seq/event_UNION.h"
#include "msgdata/msg/msg_0738_UNION.h"
	.include "asm/macros/script.inc"

	.rodata

	ScrDef scr_seq_UNION_000
	ScrDef scr_seq_UNION_001
	ScrDef scr_seq_UNION_002
	ScrDef scr_seq_UNION_003
	ScrDef scr_seq_UNION_004
	ScrDef scr_seq_UNION_005
	ScrDef scr_seq_UNION_006
	ScrDef scr_seq_UNION_007
	ScrDefEnd

scr_seq_UNION_000:
	End

scr_seq_UNION_001:
	End

scr_seq_UNION_002:
	UnionRoomRestoreObjects
	End

scr_seq_UNION_003:
	PlaySE SEQ_SE_DP_SELECT
	FollowMonResetMovement
	LockAll
	FacePlayer
	GetUnionRoomPlayerActivity VAR_SPECIAL_RESULT
	CopyVar VAR_SPECIAL_x8004, VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 5
	GoToIfEq _0499
	BufferUnionRoomPartnerLanguage 0
	Compare VAR_SPECIAL_RESULT, 2
	GoToIfEq _04AF
	Compare VAR_SPECIAL_RESULT, 3
	GoToIfEq _05DB
	Compare VAR_SPECIAL_RESULT, 4
	GoToIfEq _0528
	UnionRoomRequestJoinPlayer VAR_SPECIAL_x8004, VAR_SPECIAL_RESULT
	GetUnionRoomPlayerActivity VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 5
	GoToIfEq _0499
	NPCMsg msg_0738_UNION_00199
	UnionRoomWaitJoinStatus VAR_SPECIAL_RESULT
	Switch VAR_SPECIAL_RESULT
	Case 3, _07CC
	Case 2, _0488
	GoTo _00BC
	End

_00BC:
	LinkSyncAndWait 100
	GetUnionRoomTalkMsg 2, VAR_SPECIAL_RESULT
	NonNPCMsgVarAutoScroll VAR_SPECIAL_RESULT
	GoTo _00EC
	End

_00D2:
	LinkSyncAndWait 100
	UnionRoomSetActivity 11
	GetUnionRoomTalkMsg 22, VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	GoTo _00EC
	End

_00EC:
	MultichoiceInitStdGmm 31, 3, 0, 1, VAR_SPECIAL_RESULT
	MultichoiceSetAnchorRight 1
	MultichoiceItemAdd 168, 0
	MultichoiceItemAdd 59, 1
	MultichoiceItemAdd 52, 2
	MultichoiceItemAdd 23, 3
	MultichoiceItemAdd 142, 4
	MultichoiceItemAdd 141, 5
	MultichoiceItemAdd 24, 99
	MultichoiceShowUnionRoom
	Switch VAR_SPECIAL_RESULT
	Case 0, _0184
	Case 1, _0336
	Case 2, _0276
	Case 3, _01ED
	Case 4, _0396
	Case 5, _03F6
	Case 7, _07A0
	UnionRoomSendTalkResponse 0, 7
	GoTo _0784
	End

_0184:
	UnionRoomSendTalkResponse 0, 1
	GetUnionRoomTalkMsg 9, VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 0
	GoToIfEq _01A1
	NonNPCMsgVar VAR_SPECIAL_RESULT
_01A1:
	UnionRoomWaitTalkChoice VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 7
	GoToIfEq _06AE
	UnionRoomSetActivity 5
	GetUnionRoomTalkMsg 1, VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	Wait 30, VAR_SPECIAL_RESULT
	LinkSyncAndWait 1
	CloseMsg
	FadeScreen 6, 1, 0, RGB_BLACK
	WaitFade
	OpenLinkTrainerCard
	RestoreOverworld
	Call _0BDA
	NonNPCMsg msg_0738_UNION_00016
	GoTo _00D2
	End

_01ED:
	PartyCountNotEgg VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 2
	GoToIfLt _0264
	UnionRoomSendTalkResponse 0, 3
	GetUnionRoomTalkMsg 9, VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 0
	GoToIfEq _021B
	NonNPCMsgVar VAR_SPECIAL_RESULT
_021B:
	UnionRoomWaitTalkChoice VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 7
	GoToIfEq _06F6
	UnionRoomSetActivity 7
	GetUnionRoomTalkMsg 1, VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	Wait 30, VAR_SPECIAL_RESULT
	LinkSyncAndWait 3
	CloseMsg
	FadeScreen 6, 1, 0, RGB_BLACK
	WaitFade
	OpenWirelessTrade
	RestoreOverworld
	Call _0BDA
	GoTo _00D2
	End

_0264:
	GetUnionRoomTalkMsg 20, VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	GoTo _00D2
	End

_0276:
	PartyCountMonsAtOrBelowLevel VAR_SPECIAL_RESULT, 30
	Compare VAR_SPECIAL_RESULT, 2
	GoToIfLt _0324
	UnionRoomSendTalkResponse 0, 2
	GetUnionRoomTalkMsg 9, VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 0
	GoToIfEq _02A6
	NonNPCMsgVar VAR_SPECIAL_RESULT
_02A6:
	UnionRoomWaitTalkChoice VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 7
	GoToIfEq _06DE
	UnionRoomSetActivity 6
	GetUnionRoomTalkMsg 1, VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	Wait 30, VAR_SPECIAL_RESULT
	LinkSyncAndWait 2
	CloseMsg
	FadeScreen 6, 1, 0, RGB_BLACK
	WaitFade
	UnionRoomBattlePartySelect
	RestoreOverworld
	FadeScreen 6, 1, 1, RGB_BLACK
	WaitFade
	NPCMsg msg_0738_UNION_00202
	LinkSyncAndWait 102
	CloseMsg
	GetUnionRoomBattleCancel VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfEq _0B8B
	Compare VAR_SPECIAL_RESULT, 2
	GoToIfEq _0B8B
	LinkBattle
	Call _0BDA
	GoTo _00D2
	End

_0324:
	GetUnionRoomTalkMsg 19, VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	GoTo _00D2
	End

_0336:
	UnionRoomSendTalkResponse 0, 4
	GetUnionRoomTalkMsg 9, VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 0
	GoToIfEq _0353
	NonNPCMsgVar VAR_SPECIAL_RESULT
_0353:
	UnionRoomWaitTalkChoice VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 7
	GoToIfEq _06C6
	GetUnionRoomTalkMsg 1, VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	WaitButtonOrDelay 30
	LinkSyncAndWait 4
	CloseMsg
	FadeScreen 6, 1, 0, RGB_BLACK
	WaitFade
	OpenDrawingSession
	RestoreOverworld
	Call _0BDA
	GoTo _0478
	End

_0396:
	UnionRoomSendTalkResponse 0, 5
	GetUnionRoomTalkMsg 9, VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 0
	GoToIfEq _03B3
	NonNPCMsgVar VAR_SPECIAL_RESULT
_03B3:
	UnionRoomWaitTalkChoice VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 7
	GoToIfEq _0726
	GetUnionRoomTalkMsg 1, VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	WaitButtonOrDelay 30
	LinkSyncAndWait 5
	CloseMsg
	FadeScreen 6, 1, 0, RGB_BLACK
	WaitFade
	OpenRecordMixing
	RestoreOverworld
	Call _0BDA
	GoTo _0478
	End

_03F6:
	PartyCountEgg VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 0
	GoToIfEq _074F
	CheckUnionRoomPartnerVersionNotDummy VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 0
	GoToIfEq _0761
	UnionRoomSendTalkResponse 0, 6
	GetUnionRoomTalkMsg 9, VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 0
	GoToIfEq _0435
	NonNPCMsgVar VAR_SPECIAL_RESULT
_0435:
	UnionRoomWaitTalkChoice VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 7
	GoToIfEq _076C
	GetUnionRoomTalkMsg 1, VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	WaitButtonOrDelay 30
	LinkSyncAndWait 6
	CloseMsg
	FadeScreen 6, 1, 0, RGB_BLACK
	WaitFade
	RunSpinTradeFlow
	RestoreOverworld
	Call _0BDA
	GoTo _0478
	End

_0478:
	ReleaseAll
	End
_047C:
	UnionRoomSendTalkResponse 0, 1
	CloseMsg
	ReleaseAll
	End
_0488:
	NPCMsg msg_0738_UNION_00038
	Wait 30, VAR_SPECIAL_RESULT
	CloseMsg
	UnionRoomResumeSearch
	ReleaseAll
	End

_0499:
	UnionRoomRefuseJoins
	GetUnionRoomTalkMsg 0, VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	WaitABPress
	CloseMsg
	UnionRoomResumeSearch
	ReleaseAll
	End

_04AF:
	UnionRoomRefuseJoins
	GetUnionRoomTalkMsg 10, VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	TouchscreenMenuHide
	GetMenuChoice VAR_SPECIAL_RESULT
	TouchscreenMenuShow
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfEq _05C3
	UnionRoomRequestJoinPlayer VAR_SPECIAL_x8004, VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 5
	GoToIfEq _0488
	UnionRoomWaitJoinStatus VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 2
	GoToIfEq _0488
	GetUnionRoomTalkMsg 13, VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	Wait 30, VAR_SPECIAL_RESULT
	CloseMsg
	FadeScreen 6, 1, 0, RGB_BLACK
	WaitFade
	OpenDrawingSession
	RestoreOverworld
	FadeScreen 6, 1, 1, RGB_BLACK
	GoTo _0478
	End

_0528:
	UnionRoomRefuseJoins
	GetUnionRoomTalkMsg 12, VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	TouchscreenMenuHide
	GetMenuChoice VAR_SPECIAL_RESULT
	TouchscreenMenuShow
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfEq _066C
	PartyCountEgg VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 0
	GoToIfEq _0698
	PartyLegalCheck VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfEq _0682
	UnionRoomRequestJoinPlayer VAR_SPECIAL_x8004, VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 5
	GoToIfEq _0488
	UnionRoomWaitJoinStatus VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 2
	GoToIfEq _0488
	GetUnionRoomTalkMsg 15, VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	Wait 30, VAR_SPECIAL_RESULT
	CloseMsg
	FadeScreen 6, 1, 0, RGB_BLACK
	WaitFade
	RunSpinTradeFlow
	RestoreOverworld
	FadeScreen 6, 1, 1, RGB_BLACK
	GoTo _0478
	End

_05C3:
	GetUnionRoomTalkMsg 16, VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	Wait 30, VAR_SPECIAL_RESULT
	UnionRoomResumeSearch
	CloseMsg
	ReleaseAll
	End

_05DB:
	UnionRoomRefuseJoins
	GetUnionRoomTalkMsg 11, VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	TouchscreenMenuHide
	GetMenuChoice VAR_SPECIAL_RESULT
	TouchscreenMenuShow
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfEq _0654
	UnionRoomRequestJoinPlayer VAR_SPECIAL_x8004, VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 5
	GoToIfEq _0488
	UnionRoomWaitJoinStatus VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 2
	GoToIfEq _0488
	GetUnionRoomTalkMsg 14, VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	Wait 30, VAR_SPECIAL_RESULT
	CloseMsg
	FadeScreen 6, 1, 0, RGB_BLACK
	WaitFade
	OpenRecordMixing
	RestoreOverworld
	FadeScreen 6, 1, 1, RGB_BLACK
	GoTo _0478
	End

_0654:
	GetUnionRoomTalkMsg 17, VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	Wait 30, VAR_SPECIAL_RESULT
	CloseMsg
	UnionRoomResumeSearch
	ReleaseAll
	End

_066C:
	GetUnionRoomTalkMsg 18, VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	Wait 30, VAR_SPECIAL_RESULT
	CloseMsg
	ReleaseAll
	End

_0682:
	GetUnionRoomTalkMsg 26, VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	Wait 30, VAR_SPECIAL_RESULT
	CloseMsg
	ReleaseAll
	End

_0698:
	GetUnionRoomTalkMsg 21, VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	Wait 30, VAR_SPECIAL_RESULT
	CloseMsg
	ReleaseAll
	End

_06AE:
	GetUnionRoomTalkMsg 3, VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	Wait 30, VAR_SPECIAL_RESULT
	GoTo _07BC
	End

_06C6:
	GetUnionRoomTalkMsg 4, VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	Wait 30, VAR_SPECIAL_RESULT
	GoTo _07BC
	End

_06DE:
	GetUnionRoomTalkMsg 5, VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	Wait 30, VAR_SPECIAL_RESULT
	GoTo _07BC
	End

_06F6:
	GetUnionRoomTalkMsg 6, VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	Wait 30, VAR_SPECIAL_RESULT
	GoTo _07BC
	End

_071E:
	GetUnionRoomTalkMsg 7, VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	Wait 30, VAR_SPECIAL_RESULT
	GoTo _07BC
	End

_0726:
	GetUnionRoomTalkMsg 8, VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	Wait 30, VAR_SPECIAL_RESULT
	GoTo _07BC
	End

_073E:
	UnionRoomSendTalkResponse 1, 1
	NPCMsg msg_0738_UNION_00036
	GoTo _0BC2
	End

_074F:
	GetUnionRoomTalkMsg 21, VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	GoTo _00D2
	End

_0761:
	NPCMsg msg_0738_UNION_00218
	GoTo _00D2
	End

_076C:
	GetUnionRoomTalkMsg 8, VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	Wait 30, VAR_SPECIAL_RESULT
	GoTo _07BC
	End

_0784:
	GetUnionRoomTalkMsg 23, VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	Wait 30, VAR_SPECIAL_RESULT
	LinkSyncAndWait 101
	CloseMsg
	UnionRoomRequestLeaveAll
	ReleaseAll
	End

_07A0:
	GetUnionRoomTalkMsg 24, VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	Wait 30, VAR_SPECIAL_RESULT
	LinkSyncAndWait 101
	CloseMsg
	UnionRoomRequestLeaveAll
	ReleaseAll
	End

_07BC:
	LinkSyncAndWait 101
	CloseMsg
	UnionRoomRequestLeaveAll
	ReleaseAll
	End

scr_seq_UNION_004:
	FollowMonResetMovement
	LockAll
_07CC:
	PlaySE SEQ_SE_DP_BUTTON9
	BufferUnionRoomPartnerLanguage 1
	NonNPCMsgVarAutoScroll 7
	WaitButtonOrDelay 30
	GoTo _07E4
	End

_07E4:
	NPCMsg msg_0738_UNION_00009
	LinkSyncAndWait 100
	UnionRoomSetActivity 11
	UnionRoomWaitTalkReply VAR_SPECIAL_RESULT
	Switch VAR_SPECIAL_RESULT
	Case 1, _0863
	Case 4, _0B11
	Case 2, _0974
	Case 3, _08DB
	Case 5, _0A44
	Case 6, _0AA2
	Case 7, _0BA0
	Case 8, _0BB1
	End

_0863:
	NPCMsg msg_0738_UNION_00011
	TouchscreenMenuHide
	GetMenuChoice VAR_SPECIAL_RESULT
	TouchscreenMenuShow
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfEq _08CA
	UnionRoomSendTalkResponse 1, 0
	CloseMsg
	UnionRoomWaitTalkChoice VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 7
	GoToIfEq _0B80
	GetUnionRoomPartnerHometownMsg2 VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	Wait 30, VAR_SPECIAL_RESULT
	LinkSyncAndWait 1
	CloseMsg
	UnionRoomSetActivity 5
	FadeScreen 6, 1, 0, RGB_BLACK
	WaitFade
	OpenLinkTrainerCard
	RestoreOverworld
	Call _0BDA
	GoTo _07E4
	End

_08CA:
	UnionRoomSendTalkResponse 1, 1
	NPCMsg msg_0738_UNION_00017
	GoTo _0BC2
	End

_08DB:
	NPCMsg msg_0738_UNION_00026
	TouchscreenMenuHide
	GetMenuChoice VAR_SPECIAL_RESULT
	TouchscreenMenuShow
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfEq _0952
	PartyCountNotEgg VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 2
	GoToIfLt _0963
	UnionRoomSendTalkResponse 1, 0
	CloseMsg
	UnionRoomWaitTalkChoice VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 7
	GoToIfEq _0BA0
	NPCMsg msg_0738_UNION_00027
	Wait 30, VAR_SPECIAL_RESULT
	LinkSyncAndWait 3
	CloseMsg
	UnionRoomSetActivity 7
	FadeScreen 6, 1, 0, RGB_BLACK
	WaitFade
	OpenWirelessTrade
	RestoreOverworld
	UnionRoomSetActivity 11
	Call _0BDA
	GoTo _07E4
	End

_0952:
	UnionRoomSendTalkResponse 1, 1
	NPCMsg msg_0738_UNION_00020
	GoTo _0BC2
	End

_0963:
	UnionRoomSendTalkResponse 1, 1
	NPCMsg msg_0738_UNION_00029
	GoTo _0BC2
	End

_0974:
	NPCMsg msg_0738_UNION_00021
	TouchscreenMenuHide
	GetMenuChoice VAR_SPECIAL_RESULT
	TouchscreenMenuShow
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfEq _0A22
	PartyCountMonsAtOrBelowLevel VAR_SPECIAL_RESULT, 30
	Compare VAR_SPECIAL_RESULT, 2
	GoToIfLt _0A33
	UnionRoomSendTalkResponse 1, 0
	CloseMsg
	UnionRoomWaitTalkChoice VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 7
	GoToIfEq _0BA0
	NPCMsg msg_0738_UNION_00022
	Wait 30, VAR_SPECIAL_RESULT
	LinkSyncAndWait 2
	CloseMsg
	UnionRoomSetActivity 6
	FadeScreen 6, 1, 0, RGB_BLACK
	WaitFade
	UnionRoomBattlePartySelect
	RestoreOverworld
	FadeScreen 6, 1, 1, RGB_BLACK
	WaitFade
	NPCMsg msg_0738_UNION_00202
	LinkSyncAndWait 102
	CloseMsg
	GetUnionRoomBattleCancel VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfEq _0B8B
	Compare VAR_SPECIAL_RESULT, 2
	GoToIfEq _0B8B
	LinkBattle
	UnionRoomSetActivity 11
	Call _0BDA
	GoTo _07E4
	End

_0A22:
	UnionRoomSendTalkResponse 1, 1
	NPCMsg msg_0738_UNION_00023
	GoTo _0BC2
	End

_0A33:
	UnionRoomSendTalkResponse 1, 1
	NPCMsg msg_0738_UNION_00024
	GoTo _0BC2
	End

_0A44:
	NPCMsg msg_0738_UNION_00030
	TouchscreenMenuHide
	GetMenuChoice VAR_SPECIAL_RESULT
	TouchscreenMenuShow
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfEq _0A22
	UnionRoomSendTalkResponse 1, 0
	CloseMsg
	UnionRoomWaitTalkChoice VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 7
	GoToIfEq _0BA0
	NPCMsg msg_0738_UNION_00031
	Wait 30, VAR_SPECIAL_RESULT
	LinkSyncAndWait 5
	CloseMsg
	UnionRoomSetActivity 2
	FadeScreen 6, 1, 0, RGB_BLACK
	WaitFade
	OpenRecordMixing
	RestoreOverworld
	Call _0BDA
	ReleaseAll
	End

_0AA2:
	NPCMsg msg_0738_UNION_00033
	TouchscreenMenuHide
	GetMenuChoice VAR_SPECIAL_RESULT
	TouchscreenMenuShow
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfEq _0A22
	UnionRoomSendTalkResponse 1, 0
	CloseMsg
	PartyCountEgg VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 0
	GoToIfEq _073E
	UnionRoomWaitTalkChoice VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 7
	GoToIfEq _0BA0
	NPCMsg msg_0738_UNION_00034
	Wait 30, VAR_SPECIAL_RESULT
	LinkSyncAndWait 6
	CloseMsg
	UnionRoomSetActivity 13
	FadeScreen 6, 1, 0, RGB_BLACK
	WaitFade
	RunSpinTradeFlow
	RestoreOverworld
	Call _0BDA
	ReleaseAll
	End

_0B11:
	NPCMsg msg_0738_UNION_00018
	TouchscreenMenuHide
	GetMenuChoice VAR_SPECIAL_RESULT
	TouchscreenMenuShow
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfEq _0B6F
	UnionRoomSendTalkResponse 1, 0
	CloseMsg
	UnionRoomWaitTalkChoice VAR_SPECIAL_RESULT
	Compare VAR_SPECIAL_RESULT, 7
	GoToIfEq _0BA0
	NPCMsg msg_0738_UNION_00019
	Wait 30, VAR_SPECIAL_RESULT
	LinkSyncAndWait 4
	CloseMsg
	UnionRoomSetActivity 1
	FadeScreen 6, 1, 0, RGB_BLACK
	WaitFade
	OpenDrawingSession
	RestoreOverworld
	Call _0BDA
	ReleaseAll
	End

_0B6F:
	UnionRoomSendTalkResponse 1, 1
	NPCMsg msg_0738_UNION_00028
	GoTo _0BC2
	End

_0B80:
	NPCMsg msg_0738_UNION_00035
	GoTo _0BC2
	End

_0B8B:
	UnionRoomSetActivity 11
	NPCMsg msg_0738_UNION_00025
	Wait 30, VAR_SPECIAL_RESULT
	GoTo _0BC2
	End

_0BA0:
	NPCMsg msg_0738_UNION_00008
	Wait 30, VAR_SPECIAL_RESULT
	GoTo _0BC2
	End

_0BB1:
	NPCMsg msg_0738_UNION_00010
	Wait 30, VAR_SPECIAL_RESULT
	GoTo _0BC2
	End

_0BC2:
	LinkSyncAndWait 101
	CloseMsg
	UnionRoomRequestLeaveAll
	ReleaseAll
	End

_0BCE:
	UnionRoomSendTalkResponse 1, 1
	CloseMsg
	ReleaseAll
	End

_0BDA:
	FieldCommRegisterCommands
	FadeScreen 6, 1, 1, RGB_BLACK
	Return

scr_seq_UNION_005:
	SimpleNPCMsg msg_0738_UNION_00207
	End

scr_seq_UNION_006:
	PlaySE SEQ_SE_DP_SELECT
	FollowMonResetMovement
	LockAll
	FacePlayer
	GoTo _0499
	End

scr_seq_UNION_007:
	PlaySE SEQ_SE_DP_SELECT
	FollowMonResetMovement
	LockAll
	FacePlayer
	GoTo _0C1F
	End

_0C1F:
	UnionRoomRefuseJoins
	CallIfSet FLAG_UNK_069, _0C87
	TouchscreenMenuHide
_0C2E:
	CallIfUnset FLAG_UNK_069, _0C8C
	SetFlag FLAG_UNK_069
	MenuInitStdGmm 21, 11, 0, 1, VAR_SPECIAL_RESULT
	MenuItemAdd 11, 255, 0
	MenuItemAdd 169, 255, 1
	MenuItemAdd 24, 255, 2
	MenuExec
	Switch VAR_SPECIAL_RESULT
	Case 0, _0CAF
	Case 1, _0C91
	GoTo _0CA5
	End

_0C87:
	NPCMsg msg_0738_UNION_00158
	Return

_0C8C:
	NPCMsg msg_0738_UNION_00157
	Return

_0C91:
	TouchscreenMenuShow
	GetUnionRoomOwnChatMsg VAR_SPECIAL_RESULT
	NonNPCMsgVar VAR_SPECIAL_RESULT
	TouchscreenMenuHide
	GoTo _0C2E
	End

_0CA5:
	TouchscreenMenuShow
	UnionRoomResumeSearch
	CloseMsg
	ReleaseAll
	End

_0CAF:
	NPCMsg msg_0738_UNION_00159
	MenuInitStdGmm 24, 3, 0, 1, VAR_SPECIAL_RESULT
	MenuItemAdd 52, 255, 0
	MenuItemAdd 23, 255, 1
	MenuItemAdd 142, 255, 2
	MenuItemAdd 59, 255, 3
	MenuItemAdd 170, 255, 4
	MenuItemAdd 141, 255, 5
	MenuItemAdd 13, 255, 6
	MenuExec
	Switch VAR_SPECIAL_RESULT
	Case 0, _0D50
	Case 1, _0D5F
	Case 2, _0D6E
	Case 3, _0D7D
	Case 4, _0D8C
	Case 5, _0D9B
	GoTo _0C2E
	End

_0D50:
	TouchscreenMenuShow
	NPCMsg msg_0738_UNION_00160
	TouchscreenMenuHide
	GoTo _0CAF
	End

_0D5F:
	TouchscreenMenuShow
	NPCMsg msg_0738_UNION_00161
	TouchscreenMenuHide
	GoTo _0CAF
	End

_0D6E:
	TouchscreenMenuShow
	NPCMsg msg_0738_UNION_00162
	TouchscreenMenuHide
	GoTo _0CAF
	End

_0D7D:
	TouchscreenMenuShow
	NPCMsg msg_0738_UNION_00164
	TouchscreenMenuHide
	GoTo _0CAF
	End

_0D8C:
	TouchscreenMenuShow
	NPCMsg msg_0738_UNION_00165
	TouchscreenMenuHide
	GoTo _0CAF
	End

_0D9B:
	TouchscreenMenuShow
	NPCMsg msg_0738_UNION_00163
	TouchscreenMenuHide
	GoTo _0CAF
	End

_0DAA:
	GoTo _0C2E
	End
	.balign 4, 0
