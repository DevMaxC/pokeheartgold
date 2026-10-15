	.public gPPWLobbyChannelNamePrefixes
	.public gPPWLobbyWork
	.public ov45_02254D1C
	.public ov45_02254D3C
	.public ov45_02254D5C
	.public ov45_02254D7C
	.public ov45_02254D9C
	.public sStr_GSP
	.public ov45_02254DC4
	.public sStr_0123456789abcdef
	.public sStr_0123456789abcdef_2
	.public ov45_022577C8
	.public ov45_022577CC
	.public ov45_022577D0
	.public gPPWLobbyCurrentRequest
	.public ov45_022577D8
	.public gLobbyChatManager
	.public gLobbyChatNextRequestId
	.public gLobbyMemOutOfMemoryHandler
	.public ov45_022577E8
	.public ciCookieBuffer
	.public ciCookieCounter
	.public ciSendfBuffer
	.public gStatsUploadRandomState
	.extern PPWLobbyPlayer_Destroy
	.extern PPWLobbyPlayers_Destroy
	.extern PPWLobbyWebRequest_Delete
	.extern PPWLobbyWebRequest_Destroy
	.extern PPWLobbyPlayers_Delete
	.extern PPWLobbyPlayer_Delete
	.extern PPWLobbyPlayer_HasProfiles
	.extern LobbyRequest_GetParam
	.extern LobbyRequest_Destroy
	.extern LobbyRequest_GetId
	.extern LobbyRequest_Delete
	.extern LobbyGetChannelModeRequest_Destroy
	.extern LobbyGetChannelModeRequest_Delete
	.extern LobbyGetChannelKeysRequest_Destroy
	.extern LobbyGetChannelKeysRequest_Delete
	.extern LobbyEnterChannelRequest_Destroy
	.extern LobbyEnterChannelRequest_Delete
	.extern LobbyEnumUsersRequest_Destroy
	.extern LobbyEnumUsersRequest_Delete
	.extern LobbyEnumChannelsRequest_Destroy
	.extern LobbyEnumChannelsRequest_Delete
	.extern LobbyChat_RemoveUserIfUnused
	.extern ciPrivmsgHandler
	.extern ciNoticeHandler
	.extern ciUTMHandler
	.extern ciATMHandler
	.extern ciPingHandler
	.extern ciNickHandler
	.extern ciJoinHandler
	.extern ciPartHandler
	.extern ciKickHandler
	.extern ciQuitHandler
	.extern ciKillHandler
	.extern ciTopicHandler
	.extern ciModeHandler
	.extern ciErrorHandler
	.extern ciInviteHandler
	.extern ciNameReplyHandler
	.extern ciEndOfNamesHandler
	.extern ciRplTopicHandler
	.extern ciRplNoTopicHandler
	.extern ciErrNickInUseHandler
	.extern ciRplWhoReplyHandler
	.extern ciRplEndOfWhoHandler
	.extern ciRplGetKeyHandler
	.extern ciRplEndGetKeyHandler
	.extern ciRplGetCKeyHandler
	.extern ciRplEndGetCKeyHandler
	.extern ciRplGetChanKeyHandler
	.extern ciRplUserIPHandler
	.extern ciRplListStartHandler
	.extern ciRplListHandler
	.extern ciRplListEndHandler
	.extern ciRplChannelModeIsHandler
	.extern ciRplWhoisUserHandler
	.extern ciRplWhoisChannelsHandler
	.extern ciRplEndOfWhoisHandler
	.extern ciRplBanListHandler
	.extern ciRplEndOfBanListHandler
	.extern ciRplWelcomeHandler
	.extern ciRplSecureKeyHandler
	.extern ciRplCDKeyHandler
	.extern ciRplLoginHandler
	.extern ciErrNoSuchChannelHandler
	.extern ciErrTooManyChannelsHandler
	.extern ciErrChannelIsFullHandler
	.extern ciErrInviteOnlyChanHandler
	.extern ciErrBannedFromChanHandler
	.extern ciErrBadChannelKeyHandler
	.extern ciErrBadChanMaskHandler
	.extern ciErrNoSuchNickHandler
	.extern ciErrErroneusNicknameHandler
	.extern ciErrLoginFailedHandler
	.extern ciErrNoUniqueNickHandler
	.extern ciErrUniqueNickExpiredHandler
	.extern ciErrRegisterNickFailedHandler
	.extern sStr_N
	.extern sStr_M
	.extern sStr_C
	.extern sStr_F2
	.extern sStr_F1
	.extern sStr_Invalid
	.extern sStr_R
	.extern sStr_T
	.extern sStr_D
	.extern sStr_D7
	.extern sStr_D8
	.extern sStr_D6
	.extern sStr_D9
	.extern sStr_D1
	.extern sStr_D2
	.extern sStr_D3
	.extern sStr_D4
	.extern sStr_D5
	.include "asm/macros.inc"
	.include "overlay_45_arm.inc"
	.include "global.inc"
	.public _version_NINTENDO_DWC_LOBBY

.text
	.rodata

gPPWLobbyChannelNamePrefixes:
	.word sStr_M
	.word sStr_F1
	.word sStr_F2
	.word sStr_C
	.word sStr_N
	.word sStr_Invalid

ov45_02254D1C: ; 0x02254D1C
	.byte 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00
	.byte 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00

ov45_02254D3C: ; 0x02254D3C
	.byte 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00
	.byte 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00

ov45_02254D5C: ; 0x02254D5C
	.byte 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00
	.byte 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00

ov45_02254D7C: ; 0x02254D7C
	.byte 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00
	.byte 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x14, 0x00, 0x00, 0x00

ov45_02254D9C: ; 0x02254D9C
	.byte 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00
	.byte 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x14, 0x00, 0x00, 0x00

sStr_GSP: ; 0x02254DBC
	.asciz "#GSP"
	.balign 4, 0

ov45_02254DC4: ; 0x02254DC4
	.word sStr_R
	.word sStr_D
	.word sStr_D1
	.word sStr_D2
	.word sStr_D3
	.word sStr_D4
	.word sStr_D5
	.word sStr_D6
	.word sStr_D7
	.word sStr_D8
	.word sStr_D9
	.word sStr_T

sStr_0123456789abcdef: ; 0x02254DF4
	.asciz "0123456789abcdef"

sStr_0123456789abcdef_2: ; 0x02254E05
	.asciz "0123456789abcdef"

	.data

	.bss

gPPWLobbyWork:
	.space 0x4

ov45_022577C8: ; 0x022577C8
	.space 0x4

ov45_022577CC: ; 0x022577CC
	.space 0x4

ov45_022577D0: ; 0x022577D0
	.space 0x4

gPPWLobbyCurrentRequest: ; 0x022577D4
	.space 0x4

ov45_022577D8: ; 0x022577D8
	.space 0x4

gLobbyChatManager: ; 0x022577DC
	.space 0x4

gLobbyChatNextRequestId: ; 0x022577E0
	.space 0x4

gLobbyMemOutOfMemoryHandler: ; 0x022577E4
	.space 0x4

ov45_022577E8: ; 0x022577E8
	.space 0x8

ciCookieBuffer: ; 0x022577F0
	.space 0x4

ciCookieCounter: ; 0x022577F4
	.space 0x4

ciSendfBuffer: ; 0x022577F8
	.space 0x1000

gStatsUploadRandomState: ; 0x022587F8
	.space 0x8
