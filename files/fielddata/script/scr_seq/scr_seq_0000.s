#include "constants/scrcmd.h"
#include "fielddata/script/scr_seq/event_0000.h"
#include "msgdata/msg/msg_0014.h"
	.include "asm/macros/script.inc"

	.rodata

	ScrDef scr_seq_0000_000
	ScrDef scr_seq_0000_001
	ScrDef scr_seq_0000_002
	ScrDefEnd

scr_seq_0000_000:
	SimpleNPCMsg msg_0014_00000
	End

scr_seq_0000_001:
	FollowMonResetMovement
	LockAll
	NPCMsg msg_0014_00009
	TouchscreenMenuHide
	GetMenuChoice VAR_SPECIAL_RESULT
	TouchscreenMenuShow
	Compare VAR_SPECIAL_RESULT, 0
	GoToIfEq _0050
	Compare VAR_SPECIAL_RESULT, 1
	GoToIfEq _0063
	End

scr_seq_0000_002:
	FollowMonResetMovement
	LockAll
_0050:
	StartPalPadRegistration
	NPCMsg msg_0014_00012
	LinkSyncAndWait 94
	CloseMsg
	CommClubLinkExit
	ReturnFromColosseum
	ReleaseAll
	End

_0063:
	CloseMsg
	ReleaseAll
	End
	.balign 4, 0
