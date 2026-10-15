	.include "asm/macros.inc"
	.include "overlay_00_arm.inc"
	.include "global.inc"
	.extern BucketSetValue
	.extern BucketAdd
	.extern BucketSub
	.extern BucketMult
	.extern BucketDiv
	.extern BucketConcat
	.extern BucketAvg
	.extern BucketIntOp
	.extern BucketDoubleOp
	.extern BucketStringOp
	.extern TeamBucketIntOp
	.extern TeamBucketDoubleOp
	.extern TeamBucketStringOp
	.extern PlayerBucketIntOp
	.extern PlayerBucketDoubleOp
	.extern PlayerBucketStringOp
	.public sStr_HttpsNasTestNintendowifiNetAc
	.public sStr_ALLOC_DWCauth
	.public sStr_FREE_DWCauth
	.public sStr_HttpsNasNintendowifiNetAc
	.public sStr_ALLOC_Bmwork
	.public sStr_FREE_Bmwork
	.public sStr_Date
	.public sStr_httpresult
	.public sStr_returncd
	.public sStr_token
	.public sStr_locator
	.public sStr_challenge
	.public sStr_datetime
	.public sStr_SetCookie
	.public sStr_acctcreate
	.public sStr_action
	.public sStr_login
	.public sStr_gsbrcd
	.public sStr_Y
	.public sStr_iswfc
	.public sStr_ingamesn
	.public sFmt_Uint64
	.public sFmt_Uint
	.public sFmt_Hex
	.public sFmt_HexHex
	.public sFmt_IntIntIntIntIntInt
	.public sFmt_IntColon0000000_Dash00
	.public sFmt_IntInt
	.public sStr_sdkver
	.public sStr_userid
	.public sStr_passwd
	.public sStr_bssid
	.public sStr_apinfo
	.public sStr_gamecd
	.public sStr_makercd
	.public sStr_unitcd
	.public sStr_macadr
	.public sStr_lang
	.public sStr_birth
	.public sStr_devtime
	.public sStr_devname
	.public sStr_ssid
	.public sFmt_NitroWiFiSDK
	.public sStr_UserAgent
	.public sStr_HTTP_X_GAMECD
	.public gDwcRootCaList
	.public sStr_ALLOC_HttpLowrecvbuf
	.public sStr_ALLOC_HttpLowsendbuf
	.public sStr_Connection
	.public sStr_close
	.public sStr_CrLfCrLf
	.public sFmt_Int
	.public sStr_ContentLength
	.public sStr_ContentLength_2
	.public sStr_CrLf
	.public sStr_FREE_HttpLowrecvbuf
	.public sStr_FREE_HttpLowsendbuf
	.public sFmt_POST_HTTP_1_0_ContentTypeApplicationX_WwwForm
	.public sFmt_GET_HTTP_1_0_Host
	.public sFmt_StrColonSpaceStrCrLf
	.public sFmt_StrEq
	.public sFmt_AmpStrEq
	.public sFmt_Str
	.public sStr_ALLOC_BufBuffer
	.public sStr_FREE_BufBuffer
	.public sStr_ALLOC_Newptr
	.public sStr_Http
	.public sStr_Https
	.public sStr_Colon
	.public sStr_Slash
	.public sStr_ALLOC_ResultEntryI_Label
	.public sStr_ALLOC_ResultEntryI_Value
	.public sStr_FREE_ResultEntryI_Label
	.public sStr_FREE_ResultEntryI_Value
	.public sStr_Space
	.public sStr_httpresult_2
	.public sStr_200
	.public sStr_ColonSpace
	.public sStr_Eq
	.public sStr_Amp
	.public sStr_FREE_ArrayEntryI_Label
	.public sStr_FREE_ArrayEntryI_Value
	.public gDwcConnTestUrl
	.public sStr_HttpConntestNintendowifiNet
	.public sStr_ALLOC_DWCnetcheck
	.public sStr_ALLOC_DWChttp
	.public sStr_FREE_DWChttp
	.public sStr_FREE_DWCnetcheckBody302
	.public sStr_FREE_DWCnetcheckBodyWayport
	.public sStr_FREE_DWCnetcheck
	.public sStr_ALLOC_DWCnetcheckBody302
	.public sStr_ALLOC_Url
	.public sStr_ALLOC_DataLen
	.public sStr_ALLOC_WaitLen
	.public sStr_ALLOC_DWCnetcheckBodyWayport
	.public sStr_httpresult_3
	.public sStr_HttpsNasNintendowifiNetAc_2
	.public sStr_action_2
	.public sStr_message
	.public sStr_HotSpotResponse
	.public sStr_parse
	.public sStr_HTML
	.public sStr_returncd_2
	.public sStr_url
	.public sStr_data
	.public sStr_wait
	.public sStr_FREE_Url
	.public sStr_FREE_Data
	.public sStr_FREE_Wait
	.public sStr_Jun
	.public sStr_Jul
	.public sStr_Dec
	.public sStr_Sep
	.public sStr_Aug
	.public sStr_Nov
	.public sStr_Oct
	.public sStr_May
	.public sStr_Apr
	.public sStr_Mar
	.public sStr_Feb
	.public sStr_Jan
	.public gDwcMonthNames
	.public sStr_Fri03_Mar2006_01_28_13_GMT
	.public sStr_ALLOC_Intwork
	.public sStr_FREE_Intwork
	.public sStr_HttpsNasNintendowifiNetAc_3
	.public sStr_action_3
	.public sStr_SVCLOC
	.public sStr_svc
	.public sStr_Date_2
	.public sStr_httpresult_4
	.public sStr_returncd_3
	.public sStr_svchost
	.public sStr_servicetoken
	.public sStr_statusdata
	.public gDwcBase64Alphabet
	.public sStr_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuv
	.public gDwcCaGlobalSignRootExponent
	.public gDwcCaGlobalSignRoot
	.public sStr_BE_GlobalSignNvSaRootCA_GlobalSignRootCA
	.public gDwcCaGlobalSignRootModulus
	.public gDwcCaBaltimoreCyberTrustRootExponent
	.public gDwcCaBaltimoreCyberTrustRoot
	.public sStr_IE_BaltimoreCyberTrustBaltimoreCyberTrustRoot
	.public gDwcCaBaltimoreCyberTrustRootModulus
	.public gDwcCaGteCyberTrustGlobalRootExponent
	.public gDwcCaGteCyberTrustGlobalRoot
	.public sStr_US_GTE_CorporationGTE_CyberTrustSolutionsIncGTE
	.public gDwcCaGteCyberTrustGlobalRootModulus
	.public gDwcCaGteCyberTrustRootExponent
	.public gDwcCaGteCyberTrustRoot
	.public sStr_US_GTE_CorporationGTE_CyberTrustRoot
	.public gDwcCaGteCyberTrustRootModulus
	.public gDwcCaNintendoExponent
	.public gDwcCaNintendo
	.public sStr_US_WashingtonNintendoOfAmericaIncNOA_NintendoCA
	.public gDwcCaNintendoModulus
	.public gDwcCaThawtePremiumServerExponent
	.public gDwcCaThawtePremiumServer
	.public gDwcCaThawtePremiumServerModulus
	.public sStr_ZA_WesternCapeCapeTownThawteConsultingCc
	.public gDwcCaThawteServerExponent
	.public gDwcCaThawteServer
	.public sStr_ZA_WesternCapeCapeTownThawteConsultingCc_2
	.public gDwcCaThawteServerModulus
	.public gDwcCaVeriSignClass3G2Exponent
	.public gDwcCaVeriSignClass3G2
	.public gDwcCaVeriSignClass3G2Modulus
	.public sStr_US_VeriSignIncClass3_PublicPrimaryCertification
	.public gDwcCaVeriSignClass3G3Exponent
	.public gDwcCaVeriSignClass3G3
	.public sStr_US_VeriSignIncVeriSignTrustNetworkC_1999
	.public gDwcCaVeriSignClass3G3Modulus
	.public gDwcCaVeriSignClass3Exponent
	.public gDwcCaVeriSignClass3
	.public sStr_US_VeriSignIncClass3_PublicPrimaryCertification_2
	.public gDwcCaVeriSignClass3Modulus
	.public gDwcCaRsaSecureServerExponent
	.public gDwcCaRsaSecureServer
	.public sStr_US_RSA_DataSecurityIncSecureServerCertification
	.public gDwcCaRsaSecureServerModulus
	.public gDwcCaGlobalSignRootR2Exponent
	.public gDwcCaGlobalSignRootR2
	.public sStr_GlobalSignRootCA_R2_GlobalSignGlobalSign
	.public gDwcCaGlobalSignRootR2Modulus
	.public sStr_HttpsNasTestNintendowifiNetAc_2
	.public sStr_HttpsNasDevNintendowifiNetAc
	.public sStr_HttpsNasNintendowifiNetAc_4
	.public sStr_0000
	.public sStr_Empty
	.public sStr_HttpsDownload
	.public sFmt_HttpsDownload
	.public sStr_9000
	.public sFmt_CharStrCharStr
	.public sStr_SCM
	.public sStr_SCN
	.public sStr_Empty_2
	.public sStr_GPCM
	.public sStr_MAT
	.public sStr_Empty_3
	.public sStr_SCM_2
	.public sStr_SCN_2
	.public sStr_I_HaveAuthorizedYourRequestToAddMeToYourList
	.public sStr_Empty_4
	.public sFmt_CharCharCharChar
	.public sStr_And
	.public sStr_Empty_5
	.public sFmt_Uint_2
	.public sStr_FME
	.public sStr_MDF
	.public sStr_VER
	.public sStr_InitState
	.public sStr_ServerFull
	.public sStr_UnknownConnectAttempt
	.public sStr_SCM_3
	.public sStr_SCN_3
	.public sStr_dwc_pid
	.public sStr_dwc_mtype
	.public sStr_dwc_mresv
	.public sStr_dwc_mver
	.public sStr_dwc_eval
	.public sFmt_And
	.public sFmt_StrSpaceEqSpaceUint
	.public sFmt_AndNeAndMaxplayersAndNumplayersLtAndAndNe
	.public sFmt_SlashUint
	.public sStr_SBCM
	.public sFmt_StrIntV_Str
	.public sStr_GPCM_2
	.public sStr_MAT_2
	.public sStr_numplayers
	.public sStr_maxplayers
	.public sStr_DT
	.public DWCi_AC_UsbApProbeSsid
	.public sStr_NINTENDO_DS
	.public DWCi_AC_SsidKeyTable
	.public sStr_Gwi6_Fs0Nf
	.public sStr_EgErAgS_M
	.public sStr_952uybjnpmu903biaBk5m
	.public sStr_38g6zxjk20gvmv6_J_VY1
	.public DWCi_AC_ShopSsidPrefix
	.public DWCi_AC_UsbApSsidPrefix
	.public gsiAvailableCheckHostFormat
	.public gsiAvailableCheckResponseMagic
	.public sStr_ArrayMap
	.public sStr_ArrayNth
	.public sStr_ArrayNew
	.public sStr_ArrayFree
	.public sStr_ArrayGrow
	.public sStr_ArrayAppend
	.public sStr_ArrayRemoveAt
	.public sStr_ArrayDeleteAt
	.public sStr_ArrayInsertAt
	.public sStr_ArrayReplaceAt
	.public sStr_ArrayMapBackwards
	.public sStr_ArrayInsertSorted
	.public sStr_ArrayMapBackwards2
	.public sStr_ArrayList
	.public sStr_DarrayC
	.public sStr_array
	.public sStr_elemSize
	.public sStr_N_Ge0_AndN_LtArrayCount
	.public sStr_N_Ge0_AndN_LeArrayCount
	.public sStr_comparator
	.public sStr_fn
	.public sStr_TableMap
	.public sStr_TableNew2
	.public sStr_TableFree
	.public sStr_TableEnter
	.public sStr_TableCount
	.public sStr_TableRemove
	.public sStr_TableLookup
	.public sStr_TableMapSafe
	.public sStr_TableMapSafe2
	.public sStr_hashFn
	.public sStr_HashtableC
	.public sStr_compFn
	.public sStr_elemSize_2
	.public sStr_nBuckets
	.public sStr_table
	.public sStr_TableBuckets
	.public sStr_fn_2
	.public sFmt_Hex_2
	.public gUtilRandState
	.public sStr_time
	.public sStr_current_time
	.public sStr_OS_IsTickAvailableEqTRUE
	.public sStr_NonportC
	.public sStr_localhost
	.public sStr_gpGetBuddyStatus
	.public sStr_InvalidFunc
	.public sStr_NoCallback
	.public sStr_Empty_6
	.public sStr_TheConnectionHasAlreadyBeenDisconnected
	.public sStr_InvalidReason
	.public sKey_addbuddy
	.public sKey_sesskey
	.public sKey_newprofileid
	.public sKey_reason
	.public sKey_final
	.public sStr_InvalidStatus
	.public sStr_InvalidIndex
	.public sStr_buddyStatus
	.public sStr_GpC
	.public sStr_InvalidStatusString
	.public sStr_InvalidLocationString
	.public sKey_status
	.public sKey_statstring
	.public sKey_locstring
	.public sStr_InvalidMessage
	.public sStr_gpiProcess
	.public sStr_GpiInitialize
	.public sStr_CM
	.public sStr_ThereWasAnErrorReadingFromTheServer
	.public sKey_final_2
	.public sFmt_CMD
	.public sStr_OutOfMemory
	.public sKey_id
	.public sFmt_NoMatchingOperationFoundForId
	.public sKey_bm
	.public sKey_ka
	.public sStr_ReceivedAnUnrecognizedUnsolicitedMessage
	.public sStr_TheServerHasClosedTheConnection
	.public sStr_IconnectionConnectStateEqGPI_NOT_CONNECTED_Or
	.public sStr_GpiC
	.public sStr_0
	.public sStr_gpiDeleteBuddy
	.public sKey_authadd
	.public sKey_sesskey_2
	.public sKey_fromprofileid
	.public sKey_sig
	.public sKey_final_3
	.public sKey_bm_2
	.public sStr_UnexpectedDataWasReceivedFromTheServer
	.public sKey_f
	.public sKey_date
	.public sStr_OutOfMemory_2
	.public sKey_msg
	.public sStr_Signed
	.public sStr_PipeS_Pipe
	.public sStr_PipeSsPipe
	.public sStr_PipeLsPipe
	.public sStr_PipeIpPipe
	.public sStr_PipeP_Pipe
	.public sStr_PipeL_Pipe
	.public sStr_1
	.public sKey_t
	.public sStr_InvalidProfile
	.public sKey_delbuddy
	.public sKey_delprofileid
	.public sStr_IndexGe0
	.public sStr_GpiBuddyC
	.public sStr_IconnectionProfileListNumBuddiesGe0
	.public sStr_gpiRecvToBuffer
	.public sStr_gpiSendFromBuffer
	.public sStr_gpiSendOrBufferChar
	.public sStr_gpiAppendCharToBuffer
	.public sStr_gpiSendOrBufferStringLen
	.public sStr_gpiAppendStringToBufferLen
	.public sStr_OutputBufferNeNULL
	.public sStr_GpiBufferC
	.public sStr_OutOfMemory_3
	.public sStr_StringNeNULL
	.public sStr_StringLenGe0
	.public sFmt_Int_2
	.public sStr_ThereWasAnErrorSendingOnA_Socket
	.public sFmt_SENDXXXX_ConnectionClosed
	.public sStr_PeerOutputBufferBufferNeNULL
	.public sStr_PT
	.public sStr_SockNeINVALID_SOCKET
	.public sStr_InputBufferNeNULL
	.public sStr_BytesReadNeNULL
	.public sStr_ConnClosedNeNULL
	.public sStr_ThereWasAnErrorReadingFromA_Socket
	.public sFmt_RECVXXXX_ConnectionClosed
	.public sFmt_RECVTOTL
	.public sStr_LenGe0
	.public sStr_PosGe0
	.public sStr_PosLeLen
	.public sKey_msg_2
	.public sKey_m
	.public sKey_len
	.public sStr_gpiCallCallback
	.public sStr_gpiCallErrorCallback
	.public sStr_IconnectionNeNULL
	.public sStr_GpiCallbackC
	.public sStr_ResultNeGP_NO_ERROR
	.public sStr_FatalEqGP_FATAL_OrFatalEqGP_NON_FATAL
	.public sStr_OutOfMemory_4
	.public sStr_DataCallbackCallbackNeNULL
	.public sStr_DataArgNeNULL
	.public sStr_gpiStartConnect
	.public sStr_gpiCheckConnect
	.public sStr_GpcmGsNintendowifiNet
	.public sStr_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuv_2
	.public sStr_ThereWasAnErrorCreatingA_Socket
	.public sStr_ThereWasAnErrorMakingA_SocketNonBlocking
	.public sStr_ThereWasAnErrorBindingA_Socket
	.public sStr_ThereWasAnErrorListeningOnA_Socket
	.public sStr_ThereWasAnErrorGettingA_SocketS_Addres
	.public sStr_CouldNotResolveConnectionManangerHostName
	.public sStr_AddressSinAddrS_AddrNe0
	.public sStr_GpiConnectC
	.public sStr_ThereWasAnErrorConnectingA_Socket
	.public sStr_InvalidConnection
	.public sStr_InvalidFirewall
	.public sStr_OutOfMemory_5
	.public sFmt_StrAtStr
	.public sFmt_StrStrStrStrStrStr
	.public sStr_SpaceSpaceSpaceSpaceSpaceSpaceSpaceSpaceSpace
	.public sKey_login
	.public sKey_challenge
	.public sKey_authtoken
	.public sKey_uniquenick
	.public sKey_user
	.public sStr_At
	.public sKey_userid
	.public sKey_profileid
	.public sKey_response
	.public sStr_Firewall1
	.public sKey_port
	.public sKey_productid
	.public sKey_gamename
	.public sKey_namespaceid
	.public sStr_BackslashIdBackslash1
	.public sKey_final_4
	.public sKey_newuser
	.public sKey_email
	.public sKey_nick
	.public sKey_passwordenc
	.public sKey_cdkeyenc
	.public sKey_pid
	.public sKey_fatal
	.public sStr_BackslashLcBackslash1
	.public sStr_UnexpectedDataWasReceivedFromTheServer_2
	.public sKey_nur
	.public sStr_UnexepectedDataWasReceivedFromTheServer
	.public sStr_BackslashLcBackslash2
	.public sKey_sesskey_3
	.public sKey_lt
	.public sKey_proof
	.public sStr_CouldNotAuthenticateServer
	.public sStr_TheServerHasRefusedTheConnection
	.public sStr_StateEqGPI_CONNECTED
	.public sStr_LogoutSesskey
	.public sStr_CM_2
	.public sStr_gpiIntToDate
	.public sStr_gpiProcessGetInfo
	.public sStr_GpiInfoC
	.public sStr_InvalidDate
	.public sStr_GpiIsValidDateD_M_Y
	.public sKey_pi
	.public sStr_UnexpectedDataWasReceivedFromTheServer_3
	.public sKey_profileid_2
	.public sStr_ProfileidGt0
	.public sKey_nick_2
	.public sKey_uniquenick_2
	.public sKey_email_2
	.public sKey_firstname
	.public sKey_lastname
	.public sKey_icquin
	.public sKey_homepage
	.public sKey_zipcode
	.public sKey_countrycode
	.public sKey_lon
	.public sKey_lat
	.public sKey_loc
	.public sKey_birthday
	.public sKey_sex
	.public sKey_pmask
	.public sKey_aim
	.public sKey_pic
	.public sKey_occ
	.public sKey_ind
	.public sKey_inc
	.public sKey_mar
	.public sKey_chc
	.public sKey_i1
	.public sKey_o1
	.public sKey_conn
	.public sKey_sig_2
	.public sStr_OutOfMemory_6
	.public sStr_UpdateproSesskey
	.public sKey_final_5
	.public sStr_UpdateuiSesskey
	.public sStr_InvalidZipcode
	.public sFmt_Int_3
	.public sStr_0_2
	.public sStr_1_2
	.public sStr_2
	.public sStr_InvalidSex
	.public sKey_cpubrandid
	.public sKey_cpuspeed
	.public sKey_memory
	.public sKey_videocard1ram
	.public sKey_videocard2ram
	.public sKey_connectionid
	.public sKey_connectionspeed
	.public sKey_hasnetwork
	.public sStr_InvalidInfo
	.public sStr_InvalidValue
	.public sKey_password
	.public sStr_InvalidCountrycode
	.public sKey_videocard1string
	.public sKey_videocard2string
	.public sKey_osstring
	.public sStr_GetprofileSesskey
	.public sKey_id_2
	.public sStr_gpiDestroyOperation
	.public sStr_gpiFailedOpCallback
	.public sStr_gpiProcessOperation
	.public sStr_ConnectionNeNULL
	.public sStr_GpiOperationC
	.public sStr_ConnectionNeNULL_2
	.public sStr_OperationNeNULL
	.public sStr_OutOfMemory_7
	.public sStr_0_3
	.public sStr_IconnectionNumSearchesGe0
	.public sFmt_GpiProcessOperationWasPassedAnOperationWithAn
	.public sStr_gpiRemovePeer
	.public sStr_gpiProcessPeer
	.public sStr_gpiPeerAddMessage
	.public sStr_gpiPeerStartTransferMessage
	.public sStr_gpiPeerFinishTransferMessage
	.public sStr_gpiProcessPeerAcceptingConnection
	.public sStr_gpiProcessPeerInitiatingConnection
	.public sStr_ErrorConnectingToA_Peer
	.public sKey_auth
	.public sKey_pid_2
	.public sKey_nick_3
	.public sKey_sig_3
	.public sKey_final_6
	.public sStr_PR
	.public sKey_anack
	.public sStr_ErrorGettingBuddyAuthorization
	.public sKey_aack
	.public sStr_ErrorParsingBuddyMessage
	.public sStr_0_4
	.public sStr_GpiPeerC
	.public sStr_PeerStateEqGPI_PEER_WAITING
	.public sFmt_StrIntInt
	.public sStr_OutOfMemory_8
	.public sStr_1_3
	.public sStr_PeerStateNeGPI_PEER_NOT_CONNECTED
	.public sStr_PeerNeNULL
	.public sStr_TriedToRemovePeerNotInList
	.public sStr_ThereWasAnErrorCreatingA_Socket_2
	.public sStr_ThereWasAnErrorMakingA_SocketNonBlocking_2
	.public sStr_ThereWasAnErrorConnectingA_Socket_2
	.public sStr_MessageNeNULL
	.public sKey_m_2
	.public sKey_len_2
	.public sKey_msg_3
	.public sStr_transferID
	.public sFmt_M_Xfer
	.public sStr_Empty_7
	.public sFmt_LenMsg
	.public sStr_gpiProfileListAdd
	.public sKey_npr
	.public sStr_UnexpectedDataWasReceivedFromTheServer_4
	.public sKey_profileid_3
	.public sStr_OutOfMemory_9
	.public sStr_IdGt0
	.public sStr_GpiProfileC
	.public sStr_gpiProcessSearch
	.public sStr_gpiProcessSearches
	.public sStr_gpiStartProfileSearch
	.public sStr_GpspGsNintendowifiNet
	.public sStr_OutOfMemory_10
	.public sStr_ThereWasAnErrorCreatingA_Socket_3
	.public sStr_ThereWasAnErrorMakingA_SocketNonBlocking_3
	.public sStr_CouldNotResolveSearchManangerHostName
	.public sStr_AddressSinAddrS_AddrNe0_2
	.public sStr_GpiSearchC
	.public sStr_ThereWasAnErrorConnectingA_Socket_3
	.public sStr_NoSearchCriteria
	.public sStr_SM
	.public sStr_CouldNotConnectToTheSearchManager
	.public sKey_search
	.public sKey_sesskey_4
	.public sKey_profileid_4
	.public sKey_namespaceid_2
	.public sKey_nick_4
	.public sKey_uniquenick_3
	.public sKey_email_3
	.public sKey_firstname_2
	.public sKey_lastname_2
	.public sKey_icquin_2
	.public sKey_skip
	.public sKey_valid
	.public sKey_nicks
	.public sKey_pass
	.public sKey_pmatch
	.public sKey_productid_2
	.public sKey_check
	.public sKey_newuser_2
	.public sKey_productID
	.public sKey_cdkey
	.public sKey_others
	.public sKey_uniquesearch
	.public sKey_preferrednick
	.public sStr_0_5
	.public sKey_gamename_2
	.public sKey_final_7
	.public sStr_ThereWasAnErrorReadingFromTheServer_2
	.public sStr_bsrdone
	.public sStr_more
	.public sStr_bsr
	.public sStr_nick
	.public sStr_uniquenick
	.public sStr_firstname
	.public sStr_lastname
	.public sStr_email
	.public sStr_ErrorReadingFromTheSearchServer
	.public sStr_vr
	.public sStr_nr
	.public sStr_ndone
	.public sStr_psrdone
	.public sStr_psr
	.public sStr_status
	.public sStr_statuscode
	.public sStr_cur
	.public sKey_pid_3
	.public sStr_nur
	.public sStr_others
	.public sStr_odone
	.public sStr_o
	.public sStr_first
	.public sStr_last
	.public sStr_us
	.public sStr_usdone
	.public sStr_CountEqArgNumSuggestedNicks
	.public sStr_NumLtIconnectionNumSearches
	.public sStr_Empty_8
	.public sFmt_VersionResult
	.public sKey_xfer
	.public sFmt_IntSpaceUintSpaceUint
	.public sKey_rn
	.public sStr_UnexpectedDataWasReceivedFromTheServer_5
	.public sStr_OutOfMemory_11
	.public sStr_strzcpy
	.public sStr_gpiValueForKey
	.public sStr_gpiReadKeyAndValue
	.public sStr_DestNeNULL
	.public sStr_GpiUtilityC
	.public sStr_SrcNeNULL
	.public sKey_error
	.public sKey_err
	.public sKey_errmsg
	.public sKey_fatal_2
	.public sStr_CommandNeNULL
	.public sStr_KeyNeNULL
	.public sStr_ValueNeNULL
	.public sStr_LenGt0
	.public sStr_ErrorConnecting
	.public sStr_ThereWasAnErrorCheckingForA_CompletedConnection
	.public sStr_ConnectionRejected
	.public sStr_ConnectionAccepted
	.public sStr_BufferNeNULL
	.public sStr_ParseError
	.public sStr_DoFind
	.public sStr_BucketNew
	.public sStr_BucketConcat
	.public sStr_set
	.public sStr_GbucketC
	.public sStr_PbucketTypeEqBtString
	.public ov00_022198D8
	.public sStr_X0AmeSpy3D
	.public sStr_X00rojectAphex
	.public sStr_Empty_9
	.public sStr_Backslash
	.public sStr_pauthr
	.public sStr_lid
	.public sStr_errmsg
	.public sStr_getpidr
	.public sStr_getpdr
	.public sStr_pid
	.public sStr_mod
	.public sStr_length
	.public sKey_data
	.public sStr_setpdr
	.public sKey_pauthr
	.public sKey_getpidr
	.public sKey_getpdr
	.public sKey_setpdr
	.public sFmt_StrUnderscoreT_Int
	.public sFmt_StrUnderscoreInt
	.public sStr_gti2GetChallenge
	.public sStr_3b8dd8995f7c40a9a5c5b7dd5b481341
	.public sStr_buffer
	.public sStr_Gt2AuthC
	.public sStr_gti2BufferShorten
	.public sStr_gti2BufferWriteData
	.public sStr_gti2BufferWriteByte
	.public sStr_gti2BufferWriteUShort
	.public sStr_BufferLenLtBufferSize
	.public sStr_Gt2BufferC
	.public sStr_BufferLen2_LeBufferSize
	.public sStr_BufferLenLenLeBufferSize
	.public sStr_StartLeBufferLen
	.public sStr_ShortenByLeBufferLenStart
	.public sStr_gti2DumpCallback
	.public sStr_gti2PingCallback
	.public sStr_gti2ClosedCallback
	.public sStr_gti2ReceivedCallback
	.public sStr_gti2ConnectedCallback
	.public sStr_gti2SendFilterCallback
	.public sStr_gti2SocketErrorCallback
	.public sStr_gti2ReceiveFilterCallback
	.public sStr_gti2ConnectAttemptCallback
	.public sStr_gti2UnrecognizedMessageCallback
	.public sStr_socket
	.public sStr_Gt2CallbackC
	.public sStr_SocketAndConnection
	.public sStr_connection
	.public sStr_gt2SetConnectionData
	.public sStr_gt2GetConnectionData
	.public sStr_Gt2MainC
	.public sStr_connection_2
	.public sStr_gti2EndReliableMessage
	.public sStr_time_2
	.public gti2ProtocolMagic
	.public sStr_LenGt0_2
	.public sStr_Gt2MessageC
	.public sStr_gt2StringToAddress
	.public sFmt_StrColonInt
	.public sFmt_Str_2
	.public sFmt_ColonInt
	.public sStr_LenLtGTI2_STACK_HOSTLEN_MAX
	.public sStr_Gt2UtilityC
	.public sStr_Empty_10
	.public NNMagicData
	.public sFmt_StrDotStr
	.public sStr_Natneg1_GsNintendowifiNet
	.public sStr_Natneg2_GsNintendowifiNet
	.public current_rec
	.public static_qr2_rec
	.public sFmt_MasterGsNintendowifiNet
	.public sStr_NoChallengeValueWasReceivedFromTheMasterServer
	.public sFmt_Int_4
	.public sStr_255_Dot255_Dot255_Dot255
	.public sFmt_HexHex_2
	.public sStr_unknown
	.public sStr_Empty_11
	.public sFmt_StrInt
	.public sStr_FinalQueryid1_1
	.public sFmt_Localip
	.public sStr_localport
	.public sStr_natneg
	.public sStr_1_4
	.public sStr_0_6
	.public sStr_statechanged
	.public sStr_gamename
	.public sStr_publicip
	.public sStr_publicport
	.public sStr_Empty_12
	.public sStr_pid_
	.public sStr_ping_
	.public sStr_team_
	.public sStr_score_
	.public sStr_team_t
	.public sStr_skill_
	.public sStr_groupid
	.public sStr_deaths_
	.public sStr_gamever
	.public sStr_player_
	.public sStr_score_t
	.public sStr_mapname
	.public sStr_gamename_2
	.public sStr_hostport
	.public sStr_password
	.public sStr_gametype
	.public sStr_numteams
	.public sStr_gamemode
	.public sStr_teamplay
	.public sStr_hostname
	.public sStr_fraglimit
	.public sStr_timelimit
	.public sStr_roundtime
	.public sStr_numplayers_2
	.public sStr_maxplayers_2
	.public sStr_gamevariant
	.public sStr_timeelapsed
	.public sStr_roundelapsed
	.public sStr_teamfraglimit
	.public qr2_registered_key_list
	.public sStr_BasicInfo
	.public sKey_status_2
	.public sKey_final_8
	.public sStr_final
	.public sStr_queryid
	.public sStr_SBServerGetStringValueA
	.public sFmt_Int_5
	.public sStr_server
	.public sStr_SbServerC
	.public sStr_ping
	.public sStr_Empty_13
	.public sFmt_StrInt_2
	.public sFmt_BackslashStr
	.public sbQueryErrorPrefix
	.public sStr_SBReleaseStr
	.public sStr_QueryError
	.public sStr_AllKeysPresent
	.public sStr_SBServerListInit
	.public sStr_ProcessAdHocData
	.public sStr_ProcessMainListData
	.public sStr_SBServerListConnectAndQuery
	.public sStr_Empty_14
	.public sStr_ValNeNULL
	.public sStr_SbServerlistC
	.public sStr_SlistNeNULL
	.public sStr_CallbackNeNULL
	.public sFmt_MsGsNintendowifiNet
	.public sStr_SlistStateEqSlDisconnected
	.public sStr_0_7
	.public sbInvalidServerIp
	.public sStr_InlenGe0
	.public sStr_SlistInbufferlenGe0
	.data
sStr_HttpsNasTestNintendowifiNetAc:
	.asciz "https://nas.test.nintendowifi.net/ac"
	.balign 4, 0
sStr_ALLOC_DWCauth:
	.asciz "ALLOC DWCauth"
	.balign 4, 0
sStr_FREE_DWCauth:
	.asciz "FREE DWCauth"
	.balign 4, 0
sStr_HttpsNasNintendowifiNetAc:
	.asciz "https://nas.nintendowifi.net/ac"
	.balign 4, 0
sStr_ALLOC_Bmwork:
	.asciz "ALLOC bmwork"
	.balign 4, 0
sStr_FREE_Bmwork:
	.asciz "FREE bmwork"
	.balign 4, 0
sStr_Date:
	.asciz "Date"
	.balign 4, 0
sStr_httpresult:
	.asciz "httpresult"
	.balign 4, 0
sStr_returncd:
	.asciz "returncd"
	.balign 4, 0
sStr_token:
	.asciz "token"
	.balign 4, 0
sStr_locator:
	.asciz "locator"
	.balign 4, 0
sStr_challenge:
	.asciz "challenge"
	.balign 4, 0
sStr_datetime:
	.asciz "datetime"
	.balign 4, 0
sStr_SetCookie:
	.asciz "Set-Cookie"
	.balign 4, 0
sStr_acctcreate:
	.asciz "acctcreate"
	.balign 4, 0
sStr_action:
	.asciz "action"
	.balign 4, 0
sStr_login:
	.asciz "login"
	.balign 4, 0
sStr_gsbrcd:
	.asciz "gsbrcd"
	.balign 4, 0
sStr_Y:
	.asciz "Y"
	.balign 4, 0
sStr_iswfc:
	.asciz "iswfc"
	.balign 4, 0
sStr_ingamesn:
	.asciz "ingamesn"
	.balign 4, 0
sFmt_Uint64:
	.asciz "%013llu"
	.balign 4, 0
sFmt_Uint:
	.asciz "%03u"
	.balign 4, 0
sFmt_Hex:
	.asciz "%02x"
	.balign 4, 0
sFmt_HexHex:
	.asciz "%02x%02x"
	.balign 4, 0
sFmt_IntIntIntIntIntInt:
	.asciz "%02d%02d%02d%02d%02d%02d"
	.balign 4, 0
sFmt_IntColon0000000_Dash00:
	.asciz "%02d:0000000-00"
	.balign 4, 0
sFmt_IntInt:
	.asciz "%03d%03d"
	.balign 4, 0
sStr_sdkver:
	.asciz "sdkver"
	.balign 4, 0
sStr_userid:
	.asciz "userid"
	.balign 4, 0
sStr_passwd:
	.asciz "passwd"
	.balign 4, 0
sStr_bssid:
	.asciz "bssid"
	.balign 4, 0
sStr_apinfo:
	.asciz "apinfo"
	.balign 4, 0
sStr_gamecd:
	.asciz "gamecd"
	.balign 4, 0
sStr_makercd:
	.asciz "makercd"
	.balign 4, 0
sStr_unitcd:
	.asciz "unitcd"
	.balign 4, 0
sStr_macadr:
	.asciz "macadr"
	.balign 4, 0
sStr_lang:
	.asciz "lang"
	.balign 4, 0
sStr_birth:
	.asciz "birth"
	.balign 4, 0
sStr_devtime:
	.asciz "devtime"
	.balign 4, 0
sStr_devname:
	.asciz "devname"
	.balign 4, 0
sStr_ssid:
	.asciz "ssid"
	.balign 4, 0
sFmt_NitroWiFiSDK:
	.asciz "Nitro WiFi SDK/%d.%d"
	.balign 4, 0
sStr_UserAgent:
	.asciz "User-Agent"
	.balign 4, 0
sStr_HTTP_X_GAMECD:
	.asciz "HTTP_X_GAMECD"
	.balign 4, 0
gDwcRootCaList:
	.word gDwcCaVeriSignClass3G3
	.word gDwcCaVeriSignClass3G2
	.word gDwcCaVeriSignClass3
	.word gDwcCaRsaSecureServer
	.word gDwcCaGlobalSignRoot
	.word gDwcCaGteCyberTrustGlobalRoot
	.word gDwcCaGteCyberTrustRoot
	.word gDwcCaBaltimoreCyberTrustRoot
	.word gDwcCaThawteServer
	.word gDwcCaThawtePremiumServer
	.word gDwcCaGlobalSignRootR2
	.word gDwcCaNintendo
sStr_ALLOC_HttpLowrecvbuf:
	.asciz "ALLOC http->lowrecvbuf"
	.balign 4, 0
sStr_ALLOC_HttpLowsendbuf:
	.asciz "ALLOC http->lowsendbuf"
	.balign 4, 0
sStr_Connection:
	.asciz "Connection"
	.balign 4, 0
sStr_close:
	.asciz "close"
	.balign 4, 0
sStr_CrLfCrLf:
	.asciz "\r\n\r\n"
	.balign 4, 0
sFmt_Int:
	.asciz "%d"
	.balign 4, 0
sStr_ContentLength:
	.asciz "Content-Length"
	.balign 4, 0
sStr_ContentLength_2:
	.asciz "Content-Length: "
	.balign 4, 0
sStr_CrLf:
	.asciz "\r\n"
	.balign 4, 0
sStr_FREE_HttpLowrecvbuf:
	.asciz "FREE http->lowrecvbuf"
	.balign 4, 0
sStr_FREE_HttpLowsendbuf:
	.asciz "FREE http->lowsendbuf"
	.balign 4, 0
sFmt_POST_HTTP_1_0_ContentTypeApplicationX_WwwForm:
	.asciz "POST /%s HTTP/1.0\r\nContent-type: application/x-www-form-urlencoded\r\nHost: %s\r\n\r\n"
	.balign 4, 0
sFmt_GET_HTTP_1_0_Host:
	.asciz "GET /%s HTTP/1.0\r\nHost: %s\r\n\r\n"
	.balign 4, 0
sFmt_StrColonSpaceStrCrLf:
	.asciz "%s: %s\r\n"
	.balign 4, 0
sFmt_StrEq:
	.asciz "%s="
	.balign 4, 0
sFmt_AmpStrEq:
	.asciz "&%s="
	.balign 4, 0
sFmt_Str:
	.asciz "%s"
	.balign 4, 0
sStr_ALLOC_BufBuffer:
	.asciz "ALLOC buf->buffer"
	.balign 4, 0
sStr_FREE_BufBuffer:
	.asciz "FREE buf->buffer"
	.balign 4, 0
sStr_ALLOC_Newptr:
	.asciz "ALLOC newptr"
	.balign 4, 0
sStr_Http:
	.asciz "http://"
	.balign 4, 0
sStr_Https:
	.asciz "https://"
	.balign 4, 0
sStr_Colon:
	.asciz ":"
	.balign 4, 0
sStr_Slash:
	.asciz "/"
	.balign 4, 0
sStr_ALLOC_ResultEntryI_Label:
	.asciz "ALLOC result->entry[i].label"
	.balign 4, 0
sStr_ALLOC_ResultEntryI_Value:
	.asciz "ALLOC result->entry[i].value"
	.balign 4, 0
sStr_FREE_ResultEntryI_Label:
	.asciz "FREE result->entry[i].label"
	.balign 4, 0
sStr_FREE_ResultEntryI_Value:
	.asciz "FREE result->entry[i].value"
	.balign 4, 0
sStr_Space:
	.asciz " "
	.balign 4, 0
sStr_httpresult_2:
	.asciz "httpresult"
	.balign 4, 0
sStr_200:
	.asciz "200"
	.balign 4, 0
sStr_ColonSpace:
	.asciz ": "
	.balign 4, 0
sStr_Eq:
	.asciz "="
	.balign 4, 0
sStr_Amp:
	.asciz "&"
	.balign 4, 0
sStr_FREE_ArrayEntryI_Label:
	.asciz "FREE array_entry[i].label"
	.balign 4, 0
sStr_FREE_ArrayEntryI_Value:
	.asciz "FREE array_entry[i].value"
	.balign 4, 0

gDwcConnTestUrl:
	.word sStr_HttpConntestNintendowifiNet
sStr_HttpConntestNintendowifiNet:
	.asciz "http://conntest.nintendowifi.net/"
	.balign 4, 0
sStr_ALLOC_DWCnetcheck:
	.asciz "ALLOC DWCnetcheck"
	.balign 4, 0
sStr_ALLOC_DWChttp:
	.asciz "ALLOC DWChttp"
	.balign 4, 0
sStr_FREE_DWChttp:
	.asciz "FREE DWChttp"
	.balign 4, 0
sStr_FREE_DWCnetcheckBody302:
	.asciz "FREE DWCnetcheck->body_302"
	.balign 4, 0
sStr_FREE_DWCnetcheckBodyWayport:
	.asciz "FREE DWCnetcheck->body_wayport"
	.balign 4, 0
sStr_FREE_DWCnetcheck:
	.asciz "FREE DWCnetcheck"
	.balign 4, 0
sStr_ALLOC_DWCnetcheckBody302:
	.asciz "ALLOC DWCnetcheck->body_302"
	.balign 4, 0
sStr_ALLOC_Url:
	.asciz "ALLOC url"
	.balign 4, 0
sStr_ALLOC_DataLen:
	.asciz "ALLOC data_len"
	.balign 4, 0
sStr_ALLOC_WaitLen:
	.asciz "ALLOC wait_len"
	.balign 4, 0
sStr_ALLOC_DWCnetcheckBodyWayport:
	.asciz "ALLOC DWCnetcheck->body_wayport"
	.balign 4, 0
sStr_httpresult_3:
	.asciz "httpresult"
	.balign 4, 0
sStr_HttpsNasNintendowifiNetAc_2:
	.asciz "https://nas.nintendowifi.net/ac"
	.balign 4, 0
sStr_action_2:
	.asciz "action"
	.balign 4, 0
sStr_message:
	.asciz "message"
	.balign 4, 0
sStr_HotSpotResponse:
	.asciz "HotSpotResponse"
	.balign 4, 0
sStr_parse:
	.asciz "parse"
	.balign 4, 0
sStr_HTML:
	.asciz "HTML"
	.balign 4, 0
sStr_returncd_2:
	.asciz "returncd"
	.balign 4, 0
sStr_url:
	.asciz "url"
	.balign 4, 0
sStr_data:
	.asciz "data"
	.balign 4, 0
sStr_wait:
	.asciz "wait"
	.balign 4, 0
sStr_FREE_Url:
	.asciz "FREE url"
	.balign 4, 0
sStr_FREE_Data:
	.asciz "FREE data"
	.balign 4, 0
sStr_FREE_Wait:
	.asciz "FREE wait"
	.balign 4, 0
sStr_Jun:
	.asciz "Jun"
	.balign 4, 0
sStr_Jul:
	.asciz "Jul"
	.balign 4, 0
sStr_Dec:
	.asciz "Dec"
	.balign 4, 0
sStr_Sep:
	.asciz "Sep"
	.balign 4, 0
sStr_Aug:
	.asciz "Aug"
	.balign 4, 0
sStr_Nov:
	.asciz "Nov"
	.balign 4, 0
sStr_Oct:
	.asciz "Oct"
	.balign 4, 0
sStr_May:
	.asciz "May"
	.balign 4, 0
sStr_Apr:
	.asciz "Apr"
	.balign 4, 0
sStr_Mar:
	.asciz "Mar"
	.balign 4, 0
sStr_Feb:
	.asciz "Feb"
	.balign 4, 0
sStr_Jan:
	.asciz "Jan"
	.balign 4, 0

gDwcMonthNames:
	.word sStr_Jan
	.word sStr_Feb
	.word sStr_Mar
	.word sStr_Apr
	.word sStr_May
	.word sStr_Jun
	.word sStr_Jul
	.word sStr_Aug
	.word sStr_Sep
	.word sStr_Oct
	.word sStr_Nov
	.word sStr_Dec
sStr_Fri03_Mar2006_01_28_13_GMT:
	.asciz "Fri, 03 Mar 2006 01:28:13 GMT"
	.balign 4, 0
sStr_ALLOC_Intwork:
	.asciz "ALLOC intwork"
	.balign 4, 0
sStr_FREE_Intwork:
	.asciz "FREE intwork"
	.balign 4, 0
sStr_HttpsNasNintendowifiNetAc_3:
	.asciz "https://nas.nintendowifi.net/ac"
	.balign 4, 0
sStr_action_3:
	.asciz "action"
	.balign 4, 0
sStr_SVCLOC:
	.asciz "SVCLOC"
	.balign 4, 0
sStr_svc:
	.asciz "svc"
	.balign 4, 0
sStr_Date_2:
	.asciz "Date"
	.balign 4, 0
sStr_httpresult_4:
	.asciz "httpresult"
	.balign 4, 0
sStr_returncd_3:
	.asciz "returncd"
	.balign 4, 0
sStr_svchost:
	.asciz "svchost"
	.balign 4, 0
sStr_servicetoken:
	.asciz "servicetoken"
	.balign 4, 0
sStr_statusdata:
	.asciz "statusdata"
	.balign 4, 0

gDwcBase64Alphabet:
	.word sStr_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuv

sStr_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuv:
	.asciz "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.-"
	.balign 4, 0

gDwcCaGlobalSignRootExponent:
	.byte 0x01, 0x00, 0x01
	.balign 4, 0
gDwcCaGlobalSignRoot:
	.word sStr_BE_GlobalSignNvSaRootCA_GlobalSignRootCA
	.word 0x00000100
	.word gDwcCaGlobalSignRootModulus
	.word 0x00000003
	.word gDwcCaGlobalSignRootExponent
sStr_BE_GlobalSignNvSaRootCA_GlobalSignRootCA:
	.asciz "BE, GlobalSign nv-sa, Root CA, GlobalSign Root CA"
	.balign 4, 0
gDwcCaGlobalSignRootModulus:
	.byte 0xDA, 0x0E, 0xE6, 0x99
	.byte 0x8D, 0xCE, 0xA3, 0xE3, 0x4F, 0x8A, 0x7E, 0xFB, 0xF1, 0x8B, 0x83, 0x25, 0x6B, 0xEA, 0x48, 0x1F
	.byte 0xF1, 0x2A, 0xB0, 0xB9, 0x95, 0x11, 0x04, 0xBD, 0xF0, 0x63, 0xD1, 0xE2, 0x67, 0x66, 0xCF, 0x1C
	.byte 0xDD, 0xCF, 0x1B, 0x48, 0x2B, 0xEE, 0x8D, 0x89, 0x8E, 0x9A, 0xAF, 0x29, 0x80, 0x65, 0xAB, 0xE9
	.byte 0xC7, 0x2D, 0x12, 0xCB, 0xAB, 0x1C, 0x4C, 0x70, 0x07, 0xA1, 0x3D, 0x0A, 0x30, 0xCD, 0x15, 0x8D
	.byte 0x4F, 0xF8, 0xDD, 0xD4, 0x8C, 0x50, 0x15, 0x1C, 0xEF, 0x50, 0xEE, 0xC4, 0x2E, 0xF7, 0xFC, 0xE9
	.byte 0x52, 0xF2, 0x91, 0x7D, 0xE0, 0x6D, 0xD5, 0x35, 0x30, 0x8E, 0x5E, 0x43, 0x73, 0xF2, 0x41, 0xE9
	.byte 0xD5, 0x6A, 0xE3, 0xB2, 0x89, 0x3A, 0x56, 0x39, 0x38, 0x6F, 0x06, 0x3C, 0x88, 0x69, 0x5B, 0x2A
	.byte 0x4D, 0xC5, 0xA7, 0x54, 0xB8, 0x6C, 0x89, 0xCC, 0x9B, 0xF9, 0x3C, 0xCA, 0xE5, 0xFD, 0x89, 0xF5
	.byte 0x12, 0x3C, 0x92, 0x78, 0x96, 0xD6, 0xDC, 0x74, 0x6E, 0x93, 0x44, 0x61, 0xD1, 0x8D, 0xC7, 0x46
	.byte 0xB2, 0x75, 0x0E, 0x86, 0xE8, 0x19, 0x8A, 0xD5, 0x6D, 0x6C, 0xD5, 0x78, 0x16, 0x95, 0xA2, 0xE9
	.byte 0xC8, 0x0A, 0x38, 0xEB, 0xF2, 0x24, 0x13, 0x4F, 0x73, 0x54, 0x93, 0x13, 0x85, 0x3A, 0x1B, 0xBC
	.byte 0x1E, 0x34, 0xB5, 0x8B, 0x05, 0x8C, 0xB9, 0x77, 0x8B, 0xB1, 0xDB, 0x1F, 0x20, 0x91, 0xAB, 0x09
	.byte 0x53, 0x6E, 0x90, 0xCE, 0x7B, 0x37, 0x74, 0xB9, 0x70, 0x47, 0x91, 0x22, 0x51, 0x63, 0x16, 0x79
	.byte 0xAE, 0xB1, 0xAE, 0x41, 0x26, 0x08, 0xC8, 0x19, 0x2B, 0xD1, 0x46, 0xAA, 0x48, 0xD6, 0x64, 0x2A
	.byte 0xD7, 0x83, 0x34, 0xFF, 0x2C, 0x2A, 0xC1, 0x6C, 0x19, 0x43, 0x4A, 0x07, 0x85, 0xE7, 0xD3, 0x7C
	.byte 0xF6, 0x21, 0x68, 0xEF, 0xEA, 0xF2, 0x52, 0x9F, 0x7F, 0x93, 0x90, 0xCF

	.balign 4, 0
gDwcCaBaltimoreCyberTrustRootExponent:
	.byte 0x01, 0x00, 0x01
	.balign 4, 0

gDwcCaBaltimoreCyberTrustRoot:
	.word sStr_IE_BaltimoreCyberTrustBaltimoreCyberTrustRoot
	.word 0x00000100
	.word gDwcCaBaltimoreCyberTrustRootModulus
	.word 0x00000003
	.word gDwcCaBaltimoreCyberTrustRootExponent

sStr_IE_BaltimoreCyberTrustBaltimoreCyberTrustRoot:
	.asciz "IE, Baltimore, CyberTrust, Baltimore CyberTrust Root"
	.balign 4, 0
gDwcCaBaltimoreCyberTrustRootModulus:
	.byte 0xA3, 0x04, 0xBB, 0x22
	.byte 0xAB, 0x98, 0x3D, 0x57, 0xE8, 0x26, 0x72, 0x9A, 0xB5, 0x79, 0xD4, 0x29, 0xE2, 0xE1, 0xE8, 0x95
	.byte 0x80, 0xB1, 0xB0, 0xE3, 0x5B, 0x8E, 0x2B, 0x29, 0x9A, 0x64, 0xDF, 0xA1, 0x5D, 0xED, 0xB0, 0x09
	.byte 0x05, 0x6D, 0xDB, 0x28, 0x2E, 0xCE, 0x62, 0xA2, 0x62, 0xFE, 0xB4, 0x88, 0xDA, 0x12, 0xEB, 0x38
	.byte 0xEB, 0x21, 0x9D, 0xC0, 0x41, 0x2B, 0x01, 0x52, 0x7B, 0x88, 0x77, 0xD3, 0x1C, 0x8F, 0xC7, 0xBA
	.byte 0xB9, 0x88, 0xB5, 0x6A, 0x09, 0xE7, 0x73, 0xE8, 0x11, 0x40, 0xA7, 0xD1, 0xCC, 0xCA, 0x62, 0x8D
	.byte 0x2D, 0xE5, 0x8F, 0x0B, 0xA6, 0x50, 0xD2, 0xA8, 0x50, 0xC3, 0x28, 0xEA, 0xF5, 0xAB, 0x25, 0x87
	.byte 0x8A, 0x9A, 0x96, 0x1C, 0xA9, 0x67, 0xB8, 0x3F, 0x0C, 0xD5, 0xF7, 0xF9, 0x52, 0x13, 0x2F, 0xC2
	.byte 0x1B, 0xD5, 0x70, 0x70, 0xF0, 0x8F, 0xC0, 0x12, 0xCA, 0x06, 0xCB, 0x9A, 0xE1, 0xD9, 0xCA, 0x33
	.byte 0x7A, 0x77, 0xD6, 0xF8, 0xEC, 0xB9, 0xF1, 0x68, 0x44, 0x42, 0x48, 0x13, 0xD2, 0xC0, 0xC2, 0xA4
	.byte 0xAE, 0x5E, 0x60, 0xFE, 0xB6, 0xA6, 0x05, 0xFC, 0xB4, 0xDD, 0x07, 0x59, 0x02, 0xD4, 0x59, 0x18
	.byte 0x98, 0x63, 0xF5, 0xA5, 0x63, 0xE0, 0x90, 0x0C, 0x7D, 0x5D, 0xB2, 0x06, 0x7A, 0xF3, 0x85, 0xEA
	.byte 0xEB, 0xD4, 0x03, 0xAE, 0x5E, 0x84, 0x3E, 0x5F, 0xFF, 0x15, 0xED, 0x69, 0xBC, 0xF9, 0x39, 0x36
	.byte 0x72, 0x75, 0xCF, 0x77, 0x52, 0x4D, 0xF3, 0xC9, 0x90, 0x2C, 0xB9, 0x3D, 0xE5, 0xC9, 0x23, 0x53
	.byte 0x3F, 0x1F, 0x24, 0x98, 0x21, 0x5C, 0x07, 0x99, 0x29, 0xBD, 0xC6, 0x3A, 0xEC, 0xE7, 0x6E, 0x86
	.byte 0x3A, 0x6B, 0x97, 0x74, 0x63, 0x33, 0xBD, 0x68, 0x18, 0x31, 0xF0, 0x78, 0x8D, 0x76, 0xBF, 0xFC
	.byte 0x9E, 0x8E, 0x5D, 0x2A, 0x86, 0xA7, 0x4D, 0x90, 0xDC, 0x27, 0x1A, 0x39

	.balign 4, 0
gDwcCaGteCyberTrustGlobalRootExponent:
	.byte 0x01, 0x00, 0x01
	.balign 4, 0

gDwcCaGteCyberTrustGlobalRoot:
	.word sStr_US_GTE_CorporationGTE_CyberTrustSolutionsIncGTE
	.word 0x00000080
	.word gDwcCaGteCyberTrustGlobalRootModulus
	.word 0x00000003
	.word gDwcCaGteCyberTrustGlobalRootExponent

sStr_US_GTE_CorporationGTE_CyberTrustSolutionsIncGTE:
	.asciz "US, GTE Corporation, GTE CyberTrust Solutions, Inc., GTE CyberTrust Global Root"

	.balign 4, 0
gDwcCaGteCyberTrustGlobalRootModulus:
	.byte 0x95, 0x0F, 0xA0, 0xB6, 0xF0, 0x50, 0x9C, 0xE8, 0x7A, 0xC7, 0x88, 0xCD
	.byte 0xDD, 0x17, 0x0E, 0x2E, 0xB0, 0x94, 0xD0, 0x1B, 0x3D, 0x0E, 0xF6, 0x94, 0xC0, 0x8A, 0x94, 0xC7
	.byte 0x06, 0xC8, 0x90, 0x97, 0xC8, 0xB8, 0x64, 0x1A, 0x7A, 0x7E, 0x6C, 0x3C, 0x53, 0xE1, 0x37, 0x28
	.byte 0x73, 0x60, 0x7F, 0xB2, 0x97, 0x53, 0x07, 0x9F, 0x53, 0xF9, 0x6D, 0x58, 0x94, 0xD2, 0xAF, 0x8D
	.byte 0x6D, 0x88, 0x67, 0x80, 0xE6, 0xED, 0xB2, 0x95, 0xCF, 0x72, 0x31, 0xCA, 0xA5, 0x1C, 0x72, 0xBA
	.byte 0x5C, 0x02, 0xE7, 0x64, 0x42, 0xE7, 0xF9, 0xA9, 0x2C, 0xD6, 0x3A, 0x0D, 0xAC, 0x8D, 0x42, 0xAA
	.byte 0x24, 0x01, 0x39, 0xE6, 0x9C, 0x3F, 0x01, 0x85, 0x57, 0x0D, 0x58, 0x87, 0x45, 0xF8, 0xD3, 0x85
	.byte 0xAA, 0x93, 0x69, 0x26, 0x85, 0x70, 0x48, 0x80, 0x3F, 0x12, 0x15, 0xC7, 0x79, 0xB4, 0x1F, 0x05
	.byte 0x2F, 0x3B, 0x62, 0x99

	.balign 4, 0
gDwcCaGteCyberTrustRootExponent:
	.byte 0x01, 0x00, 0x01
	.balign 4, 0

gDwcCaGteCyberTrustRoot:
	.word sStr_US_GTE_CorporationGTE_CyberTrustRoot
	.word 0x00000080
	.word gDwcCaGteCyberTrustRootModulus
	.word 0x00000003
	.word gDwcCaGteCyberTrustRootExponent

sStr_US_GTE_CorporationGTE_CyberTrustRoot:
	.asciz "US, GTE Corporation, GTE CyberTrust Root"
	.balign 4, 0

gDwcCaGteCyberTrustRootModulus:
	.byte 0xB8, 0xE6, 0x4F, 0xBA, 0xDB, 0x98, 0x7C, 0x71
	.byte 0x7C, 0xAF, 0x44, 0xB7, 0xD3, 0x0F, 0x46, 0xD9, 0x64, 0xE5, 0x93, 0xC1, 0x42, 0x8E, 0xC7, 0xBA
	.byte 0x49, 0x8D, 0x35, 0x2D, 0x7A, 0xE7, 0x8B, 0xBD, 0xE5, 0x05, 0x31, 0x59, 0xC6, 0xB1, 0x2F, 0x0A
	.byte 0x0C, 0xFB, 0x9F, 0xA7, 0x3F, 0xA2, 0x09, 0x66, 0x84, 0x56, 0x1E, 0x37, 0x29, 0x1B, 0x87, 0xE9
	.byte 0x7E, 0x0C, 0xCA, 0x9A, 0x9F, 0xA5, 0x7F, 0xF5, 0x15, 0x94, 0xA3, 0xD5, 0xA2, 0x46, 0x82, 0xD8
	.byte 0x68, 0x4C, 0xD1, 0x37, 0x15, 0x06, 0x68, 0xAF, 0xBD, 0xF8, 0xB0, 0xB3, 0xF0, 0x29, 0xF5, 0x95
	.byte 0x5A, 0x09, 0x16, 0x61, 0x77, 0x0A, 0x22, 0x25, 0xD4, 0x4F, 0x45, 0xAA, 0xC7, 0xBD, 0xE5, 0x96
	.byte 0xDF, 0xF9, 0xD4, 0xA8, 0x8E, 0x42, 0xCC, 0x24, 0xC0, 0x1E, 0x91, 0x27, 0x4A, 0xB5, 0x6D, 0x06
	.byte 0x80, 0x63, 0x39, 0xC4, 0xA2, 0x5E, 0x38, 0x03

	.balign 4, 0
gDwcCaNintendoExponent:
	.byte 0x01, 0x00, 0x01
	.balign 4, 0

gDwcCaNintendo:
	.word sStr_US_WashingtonNintendoOfAmericaIncNOA_NintendoCA
	.word 0x00000080
	.word gDwcCaNintendoModulus
	.word 0x00000003
	.word gDwcCaNintendoExponent

sStr_US_WashingtonNintendoOfAmericaIncNOA_NintendoCA:
	.asciz "US, Washington, Nintendo of America Inc, NOA, Nintendo CA, ca@noa.nintendo.com"
	.balign 4, 0

gDwcCaNintendoModulus:
	.byte 0xB3, 0xCD, 0x79, 0x97, 0x77, 0x5D, 0x8A, 0xAF, 0x86, 0xA8, 0xE8, 0xD7, 0x73, 0x1C, 0x77, 0xDF
	.byte 0x10, 0x90, 0x1F, 0x81, 0xF8, 0x41, 0x9E, 0x21, 0x55, 0xDF, 0xBC, 0xFC, 0x63, 0xFB, 0x19, 0x43
	.byte 0xF1, 0xF6, 0xC4, 0x72, 0x42, 0x49, 0xBD, 0xAD, 0x44, 0x68, 0x4E, 0xF3, 0xDA, 0x1D, 0xE6, 0x4D
	.byte 0xD8, 0xF9, 0x59, 0x88, 0xDC, 0xAE, 0x3E, 0x9B, 0x38, 0x09, 0xCA, 0x7F, 0xFF, 0xDC, 0x24, 0xA2
	.byte 0x44, 0x78, 0x78, 0x49, 0x93, 0xD4, 0x84, 0x40, 0x10, 0xB8, 0xEC, 0x3E, 0xDB, 0x2D, 0x93, 0xC8
	.byte 0x11, 0xC8, 0xFD, 0x78, 0x2D, 0x61, 0xAD, 0x31, 0xAE, 0x86, 0x26, 0xB0, 0xFD, 0x5A, 0x3F, 0xA1
	.byte 0x3D, 0xBF, 0xE2, 0x4B, 0x49, 0xEC, 0xCE, 0x66, 0x98, 0x58, 0x26, 0x12, 0xC0, 0xFB, 0xF4, 0x77
	.byte 0x65, 0x1B, 0xEA, 0xFB, 0xCB, 0x7F, 0xE0, 0x8C, 0xCB, 0x02, 0xA3, 0x4E, 0x5E, 0x8C, 0xEA, 0x9B

	.balign 4, 0
gDwcCaThawtePremiumServerExponent:
	.byte 0x01, 0x00, 0x01
	.balign 4, 0

gDwcCaThawtePremiumServer:
	.word sStr_ZA_WesternCapeCapeTownThawteConsultingCc
	.word 0x00000080
	.word gDwcCaThawtePremiumServerModulus
	.word 0x00000003
	.word gDwcCaThawtePremiumServerExponent

gDwcCaThawtePremiumServerModulus:
	.byte 0xD2, 0x36, 0x36, 0x6A, 0x8B, 0xD7, 0xC2, 0x5B
	.byte 0x9E, 0xDA, 0x81, 0x41, 0x62, 0x8F, 0x38, 0xEE, 0x49, 0x04, 0x55, 0xD6, 0xD0, 0xEF, 0x1C, 0x1B
	.byte 0x95, 0x16, 0x47, 0xEF, 0x18, 0x48, 0x35, 0x3A, 0x52, 0xF4, 0x2B, 0x6A, 0x06, 0x8F, 0x3B, 0x2F
	.byte 0xEA, 0x56, 0xE3, 0xAF, 0x86, 0x8D, 0x9E, 0x17, 0xF7, 0x9E, 0xB4, 0x65, 0x75, 0x02, 0x4D, 0xEF
	.byte 0xCB, 0x09, 0xA2, 0x21, 0x51, 0xD8, 0x9B, 0xD0, 0x67, 0xD0, 0xBA, 0x0D, 0x92, 0x06, 0x14, 0x73
	.byte 0xD4, 0x93, 0xCB, 0x97, 0x2A, 0x00, 0x9C, 0x5C, 0x4E, 0x0C, 0xBC, 0xFA, 0x15, 0x52, 0xFC, 0xF2
	.byte 0x44, 0x6E, 0xDA, 0x11, 0x4A, 0x6E, 0x08, 0x9F, 0x2F, 0x2D, 0xE3, 0xF9, 0xAA, 0x3A, 0x86, 0x73
	.byte 0xB6, 0x46, 0x53, 0x58, 0xC8, 0x89, 0x05, 0xBD, 0x83, 0x11, 0xB8, 0x73, 0x3F, 0xAA, 0x07, 0x8D
	.byte 0xF4, 0x42, 0x4D, 0xE7, 0x40, 0x9D, 0x1C, 0x37

sStr_ZA_WesternCapeCapeTownThawteConsultingCc:
	.asciz "ZA, Western Cape, Cape Town, Thawte Consulting cc, Certification Services Division, Thawte Premium Server CA, premium-server@thawte.com"

	.balign 4, 0
gDwcCaThawteServerExponent:
	.byte 0x01, 0x00, 0x01
	.balign 4, 0

gDwcCaThawteServer:
	.word sStr_ZA_WesternCapeCapeTownThawteConsultingCc_2
	.word 0x00000080
	.word gDwcCaThawteServerModulus
	.word 0x00000003
	.word gDwcCaThawteServerExponent

sStr_ZA_WesternCapeCapeTownThawteConsultingCc_2:
	.asciz "ZA, Western Cape, Cape Town, Thawte Consulting cc, Certification Services Division, Thawte Server CA, server-certs@thawte.com"

	.balign 4, 0
gDwcCaThawteServerModulus:
	.byte 0xD3, 0xA4, 0x50, 0x6E, 0xC8, 0xFF, 0x56, 0x6B
	.byte 0xE6, 0xCF, 0x5D, 0xB6, 0xEA, 0x0C, 0x68, 0x75, 0x47, 0xA2, 0xAA, 0xC2, 0xDA, 0x84, 0x25, 0xFC
	.byte 0xA8, 0xF4, 0x47, 0x51, 0xDA, 0x85, 0xB5, 0x20, 0x74, 0x94, 0x86, 0x1E, 0x0F, 0x75, 0xC9, 0xE9
	.byte 0x08, 0x61, 0xF5, 0x06, 0x6D, 0x30, 0x6E, 0x15, 0x19, 0x02, 0xE9, 0x52, 0xC0, 0x62, 0xDB, 0x4D
	.byte 0x99, 0x9E, 0xE2, 0x6A, 0x0C, 0x44, 0x38, 0xCD, 0xFE, 0xBE, 0xE3, 0x64, 0x09, 0x70, 0xC5, 0xFE
	.byte 0xB1, 0x6B, 0x29, 0xB6, 0x2F, 0x49, 0xC8, 0x3B, 0xD4, 0x27, 0x04, 0x25, 0x10, 0x97, 0x2F, 0xE7
	.byte 0x90, 0x6D, 0xC0, 0x28, 0x42, 0x99, 0xD7, 0x4C, 0x43, 0xDE, 0xC3, 0xF5, 0x21, 0x6D, 0x54, 0x9F
	.byte 0x5D, 0xC3, 0x58, 0xE1, 0xC0, 0xE4, 0xD9, 0x5B, 0xB0, 0xB8, 0xDC, 0xB4, 0x7B, 0xDF, 0x36, 0x3A
	.byte 0xC2, 0xB5, 0x66, 0x22, 0x12, 0xD6, 0x87, 0x0D

	.balign 4, 0
gDwcCaVeriSignClass3G2Exponent:
	.byte 0x01, 0x00, 0x01
	.balign 4, 0

gDwcCaVeriSignClass3G2:
	.word sStr_US_VeriSignIncClass3_PublicPrimaryCertification
	.word 0x00000080
	.word gDwcCaVeriSignClass3G2Modulus
	.word 0x00000003
	.word gDwcCaVeriSignClass3G2Exponent

gDwcCaVeriSignClass3G2Modulus:
	.byte 0xCC, 0x5E, 0xD1, 0x11, 0x5D, 0x5C, 0x69, 0xD0, 0xAB, 0xD3, 0xB9, 0x6A, 0x4C, 0x99, 0x1F, 0x59
	.byte 0x98, 0x30, 0x8E, 0x16, 0x85, 0x20, 0x46, 0x6D, 0x47, 0x3F, 0xD4, 0x85, 0x20, 0x84, 0xE1, 0x6D
	.byte 0xB3, 0xF8, 0xA4, 0xED, 0x0C, 0xF1, 0x17, 0x0F, 0x3B, 0xF9, 0xA7, 0xF9, 0x25, 0xD7, 0xC1, 0xCF
	.byte 0x84, 0x63, 0xF2, 0x7C, 0x63, 0xCF, 0xA2, 0x47, 0xF2, 0xC6, 0x5B, 0x33, 0x8E, 0x64, 0x40, 0x04
	.byte 0x68, 0xC1, 0x80, 0xB9, 0x64, 0x1C, 0x45, 0x77, 0xC7, 0xD8, 0x6E, 0xF5, 0x95, 0x29, 0x3C, 0x50
	.byte 0xE8, 0x34, 0xD7, 0x78, 0x1F, 0xA8, 0xBA, 0x6D, 0x43, 0x91, 0x95, 0x8F, 0x45, 0x57, 0x5E, 0x7E
	.byte 0xC5, 0xFB, 0xCA, 0xA4, 0x04, 0xEB, 0xEA, 0x97, 0x37, 0x54, 0x30, 0x6F, 0xBB, 0x01, 0x47, 0x32
	.byte 0x33, 0xCD, 0xDC, 0x57, 0x9B, 0x64, 0x69, 0x61, 0xF8, 0x9B, 0x1D, 0x1C, 0x89, 0x4F, 0x5C, 0x67

sStr_US_VeriSignIncClass3_PublicPrimaryCertification:
	.asciz "US, VeriSign, Inc., Class 3 Public Primary Certification Authority - G2, (c) 1998 VeriSign, Inc. - For authorized use only, VeriSign Trust Network"
	.balign 4, 0

	.balign 4, 0
gDwcCaVeriSignClass3G3Exponent:
	.byte 0x01, 0x00, 0x01
	.balign 4, 0

gDwcCaVeriSignClass3G3:
	.word sStr_US_VeriSignIncVeriSignTrustNetworkC_1999
	.word 0x00000100
	.word gDwcCaVeriSignClass3G3Modulus
	.word 0x00000003
	.word gDwcCaVeriSignClass3G3Exponent

sStr_US_VeriSignIncVeriSignTrustNetworkC_1999:
	.asciz "US, VeriSign, Inc., VeriSign Trust Network, (c) 1999 VeriSign, Inc. - For authorized use only, VeriSign Class 3 Public Primary Certification Authority - G3"
	.balign 4, 0

gDwcCaVeriSignClass3G3Modulus:
	.byte 0xCB, 0xBA, 0x9C, 0x52, 0xFC, 0x78, 0x1F, 0x1A
	.byte 0x1E, 0x6F, 0x1B, 0x37, 0x73, 0xBD, 0xF8, 0xC9, 0x6B, 0x94, 0x12, 0x30, 0x4F, 0xF0, 0x36, 0x47
	.byte 0xF5, 0xD0, 0x91, 0x0A, 0xF5, 0x17, 0xC8, 0xA5, 0x61, 0xC1, 0x16, 0x40, 0x4D, 0xFB, 0x8A, 0x61
	.byte 0x90, 0xE5, 0x76, 0x20, 0xC1, 0x11, 0x06, 0x7D, 0xAB, 0x2C, 0x6E, 0xA6, 0xF5, 0x11, 0x41, 0x8E
	.byte 0xFA, 0x2D, 0xAD, 0x2A, 0x61, 0x59, 0xA4, 0x67, 0x26, 0x4C, 0xD0, 0xE8, 0xBC, 0x52, 0x5B, 0x70
	.byte 0x20, 0x04, 0x58, 0xD1, 0x7A, 0xC9, 0xA4, 0x69, 0xBC, 0x83, 0x17, 0x64, 0xAD, 0x05, 0x8B, 0xBC
	.byte 0xD0, 0x58, 0xCE, 0x8D, 0x8C, 0xF5, 0xEB, 0xF0, 0x42, 0x49, 0x0B, 0x9D, 0x97, 0x27, 0x67, 0x32
	.byte 0x6E, 0xE1, 0xAE, 0x93, 0x15, 0x1C, 0x70, 0xBC, 0x20, 0x4D, 0x2F, 0x18, 0xDE, 0x92, 0x88, 0xE8
	.byte 0x6C, 0x85, 0x57, 0x11, 0x1A, 0xE9, 0x7E, 0xE3, 0x26, 0x11, 0x54, 0xA2, 0x45, 0x96, 0x55, 0x83
	.byte 0xCA, 0x30, 0x89, 0xE8, 0xDC, 0xD8, 0xA3, 0xED, 0x2A, 0x80, 0x3F, 0x7F, 0x79, 0x65, 0x57, 0x3E
	.byte 0x15, 0x20, 0x66, 0x08, 0x2F, 0x95, 0x93, 0xBF, 0xAA, 0x47, 0x2F, 0xA8, 0x46, 0x97, 0xF0, 0x12
	.byte 0xE2, 0xFE, 0xC2, 0x0A, 0x2B, 0x51, 0xE6, 0x76, 0xE6, 0xB7, 0x46, 0xB7, 0xE2, 0x0D, 0xA6, 0xCC
	.byte 0xA8, 0xC3, 0x4C, 0x59, 0x55, 0x89, 0xE6, 0xE8, 0x53, 0x5C, 0x1C, 0xEA, 0x9D, 0xF0, 0x62, 0x16
	.byte 0x0B, 0xA7, 0xC9, 0x5F, 0x0C, 0xF0, 0xDE, 0xC2, 0x76, 0xCE, 0xAF, 0xF7, 0x6A, 0xF2, 0xFA, 0x41
	.byte 0xA6, 0xA2, 0x33, 0x14, 0xC9, 0xE5, 0x7A, 0x63, 0xD3, 0x9E, 0x62, 0x37, 0xD5, 0x85, 0x65, 0x9E
	.byte 0x0E, 0xE6, 0x53, 0x24, 0x74, 0x1B, 0x5E, 0x1D, 0x12, 0x53, 0x5B, 0xC7, 0x2C, 0xE7, 0x83, 0x49
	.byte 0x3B, 0x15, 0xAE, 0x8A, 0x68, 0xB9, 0x57, 0x97

	.balign 4, 0
gDwcCaVeriSignClass3Exponent:
	.byte 0x01, 0x00, 0x01
	.balign 4, 0

gDwcCaVeriSignClass3:
	.word sStr_US_VeriSignIncClass3_PublicPrimaryCertification_2
	.word 0x00000080
	.word gDwcCaVeriSignClass3Modulus
	.word 0x00000003
	.word gDwcCaVeriSignClass3Exponent

sStr_US_VeriSignIncClass3_PublicPrimaryCertification_2:
	.asciz "US, VeriSign, Inc., Class 3 Public Primary Certification Authority"
	.balign 4, 0

gDwcCaVeriSignClass3Modulus:
	.byte 0xC9, 0x5C, 0x59, 0x9E, 0xF2, 0x1B, 0x8A, 0x01, 0x14, 0xB4, 0x10, 0xDF
	.byte 0x04, 0x40, 0xDB, 0xE3, 0x57, 0xAF, 0x6A, 0x45, 0x40, 0x8F, 0x84, 0x0C, 0x0B, 0xD1, 0x33, 0xD9
	.byte 0xD9, 0x11, 0xCF, 0xEE, 0x02, 0x58, 0x1F, 0x25, 0xF7, 0x2A, 0xA8, 0x44, 0x05, 0xAA, 0xEC, 0x03
	.byte 0x1F, 0x78, 0x7F, 0x9E, 0x93, 0xB9, 0x9A, 0x00, 0xAA, 0x23, 0x7D, 0xD6, 0xAC, 0x85, 0xA2, 0x63
	.byte 0x45, 0xC7, 0x72, 0x27, 0xCC, 0xF4, 0x4C, 0xC6, 0x75, 0x71, 0xD2, 0x39, 0xEF, 0x4F, 0x42, 0xF0
	.byte 0x75, 0xDF, 0x0A, 0x90, 0xC6, 0x8E, 0x20, 0x6F, 0x98, 0x0F, 0xF8, 0xAC, 0x23, 0x5F, 0x70, 0x29
	.byte 0x36, 0xA4, 0xC9, 0x86, 0xE7, 0xB1, 0x9A, 0x20, 0xCB, 0x53, 0xA5, 0x85, 0xE7, 0x3D, 0xBE, 0x7D
	.byte 0x9A, 0xFE, 0x24, 0x45, 0x33, 0xDC, 0x76, 0x15, 0xED, 0x0F, 0xA2, 0x71, 0x64, 0x4C, 0x65, 0x2E
	.byte 0x81, 0x68, 0x45, 0xA7

	.balign 4, 0
gDwcCaRsaSecureServerExponent:
	.byte 0x01, 0x00, 0x01
	.balign 4, 0

gDwcCaRsaSecureServer:
	.word sStr_US_RSA_DataSecurityIncSecureServerCertification
	.word 0x0000007D
	.word gDwcCaRsaSecureServerModulus
	.word 0x00000003
	.word gDwcCaRsaSecureServerExponent

sStr_US_RSA_DataSecurityIncSecureServerCertification:
	.asciz "US, RSA Data Security, Inc., Secure Server Certification Authority"
	.balign 4, 0

gDwcCaRsaSecureServerModulus:
	.byte 0x92, 0xCE, 0x7A, 0xC1, 0xAE, 0x83, 0x3E, 0x5A, 0xAA, 0x89, 0x83, 0x57, 0xAC, 0x25, 0x01, 0x76
	.byte 0x0C, 0xAD, 0xAE, 0x8E, 0x2C, 0x37, 0xCE, 0xEB, 0x35, 0x78, 0x64, 0x54, 0x03, 0xE5, 0x84, 0x40
	.byte 0x51, 0xC9, 0xBF, 0x8F, 0x08, 0xE2, 0x8A, 0x82, 0x08, 0xD2, 0x16, 0x86, 0x37, 0x55, 0xE9, 0xB1
	.byte 0x21, 0x02, 0xAD, 0x76, 0x68, 0x81, 0x9A, 0x05, 0xA2, 0x4B, 0xC9, 0x4B, 0x25, 0x66, 0x22, 0x56
	.byte 0x6C, 0x88, 0x07, 0x8F, 0xF7, 0x81, 0x59, 0x6D, 0x84, 0x07, 0x65, 0x70, 0x13, 0x71, 0x76, 0x3E
	.byte 0x9B, 0x77, 0x4C, 0xE3, 0x50, 0x89, 0x56, 0x98, 0x48, 0xB9, 0x1D, 0xA7, 0x29, 0x1A, 0x13, 0x2E
	.byte 0x4A, 0x11, 0x59, 0x9C, 0x1E, 0x15, 0xD5, 0x49, 0x54, 0x2C, 0x73, 0x3A, 0x69, 0x82, 0xB1, 0x97
	.byte 0x39, 0x9C, 0x6D, 0x70, 0x67, 0x48, 0xE5, 0xDD, 0x2D, 0xD6, 0xC8, 0x1E, 0x7B

	.balign 4, 0
gDwcCaGlobalSignRootR2Exponent:
	.byte 0x01, 0x00, 0x01
	.balign 4, 0

gDwcCaGlobalSignRootR2:
	.word sStr_GlobalSignRootCA_R2_GlobalSignGlobalSign
	.word 0x00000100
	.word gDwcCaGlobalSignRootR2Modulus
	.word 0x00000003
	.word gDwcCaGlobalSignRootR2Exponent

sStr_GlobalSignRootCA_R2_GlobalSignGlobalSign:
	.asciz "GlobalSign Root CA - R2, GlobalSign, GlobalSign"
	.balign 4, 0

gDwcCaGlobalSignRootR2Modulus:
	.byte 0xA6, 0xCF, 0x24, 0x0E, 0xBE, 0x2E, 0x6F, 0x28
	.byte 0x99, 0x45, 0x42, 0xC4, 0xAB, 0x3E, 0x21, 0x54, 0x9B, 0x0B, 0xD3, 0x7F, 0x84, 0x70, 0xFA, 0x12
	.byte 0xB3, 0xCB, 0xBF, 0x87, 0x5F, 0xC6, 0x7F, 0x86, 0xD3, 0xB2, 0x30, 0x5C, 0xD6, 0xFD, 0xAD, 0xF1
	.byte 0x7B, 0xDC, 0xE5, 0xF8, 0x60, 0x96, 0x09, 0x92, 0x10, 0xF5, 0xD0, 0x53, 0xDE, 0xFB, 0x7B, 0x7E
	.byte 0x73, 0x88, 0xAC, 0x52, 0x88, 0x7B, 0x4A, 0xA6, 0xCA, 0x49, 0xA6, 0x5E, 0xA8, 0xA7, 0x8C, 0x5A
	.byte 0x11, 0xBC, 0x7A, 0x82, 0xEB, 0xBE, 0x8C, 0xE9, 0xB3, 0xAC, 0x96, 0x25, 0x07, 0x97, 0x4A, 0x99
	.byte 0x2A, 0x07, 0x2F, 0xB4, 0x1E, 0x77, 0xBF, 0x8A, 0x0F, 0xB5, 0x02, 0x7C, 0x1B, 0x96, 0xB8, 0xC5
	.byte 0xB9, 0x3A, 0x2C, 0xBC, 0xD6, 0x12, 0xB9, 0xEB, 0x59, 0x7D, 0xE2, 0xD0, 0x06, 0x86, 0x5F, 0x5E
	.byte 0x49, 0x6A, 0xB5, 0x39, 0x5E, 0x88, 0x34, 0xEC, 0xBC, 0x78, 0x0C, 0x08, 0x98, 0x84, 0x6C, 0xA8
	.byte 0xCD, 0x4B, 0xB4, 0xA0, 0x7D, 0x0C, 0x79, 0x4D, 0xF0, 0xB8, 0x2D, 0xCB, 0x21, 0xCA, 0xD5, 0x6C
	.byte 0x5B, 0x7D, 0xE1, 0xA0, 0x29, 0x84, 0xA1, 0xF9, 0xD3, 0x94, 0x49, 0xCB, 0x24, 0x62, 0x91, 0x20
	.byte 0xBC, 0xDD, 0x0B, 0xD5, 0xD9, 0xCC, 0xF9, 0xEA, 0x27, 0x0A, 0x2B, 0x73, 0x91, 0xC6, 0x9D, 0x1B
	.byte 0xAC, 0xC8, 0xCB, 0xE8, 0xE0, 0xA0, 0xF4, 0x2F, 0x90, 0x8B, 0x4D, 0xFB, 0xB0, 0x36, 0x1B, 0xF6
	.byte 0x19, 0x7A, 0x85, 0xE0, 0x6D, 0xF2, 0x61, 0x13, 0x88, 0x5C, 0x9F, 0xE0, 0x93, 0x0A, 0x51, 0x97
	.byte 0x8A, 0x5A, 0xCE, 0xAF, 0xAB, 0xD5, 0xF7, 0xAA, 0x09, 0xAA, 0x60, 0xBD, 0xDC, 0xD9, 0x5F, 0xDF
	.byte 0x72, 0xA9, 0x60, 0x13, 0x5E, 0x00, 0x01, 0xC9, 0x4A, 0xFA, 0x3F, 0xA4, 0xEA, 0x07, 0x03, 0x21
	.byte 0x02, 0x8E, 0x82, 0xCA, 0x03, 0xC2, 0x9B, 0x8F
	.balign 4, 0
sStr_HttpsNasTestNintendowifiNetAc_2:
	.asciz "https://nas.test.nintendowifi.net/ac"
	.balign 4, 0
sStr_HttpsNasDevNintendowifiNetAc:
	.asciz "https://nas.dev.nintendowifi.net/ac"
	.balign 4, 0
sStr_HttpsNasNintendowifiNetAc_4:
	.asciz "https://nas.nintendowifi.net/ac"
	.balign 4, 0
sStr_0000:
	.asciz "0000"
	.balign 4, 0
sStr_Empty:
	.asciz ""
	.balign 4, 0
sStr_HttpsDownload:
	.asciz "https:///download"
	.balign 4, 0
sFmt_HttpsDownload:
	.asciz "https://%s/download"
	.balign 4, 0
sStr_9000:
	.asciz "9000"
	.balign 4, 0
sFmt_CharStrCharStr:
	.asciz "%c%s%c%s"
	.balign 4, 0
sStr_SCM:
	.asciz "SCM"
	.balign 4, 0
sStr_SCN:
	.asciz "SCN"
	.balign 4, 0
sStr_Empty_2:
	.asciz ""
	.balign 4, 0
sStr_GPCM:
	.asciz "GPCM"
	.balign 4, 0
sStr_MAT:
	.asciz "MAT"
	.balign 4, 0
sStr_Empty_3:
	.asciz ""
	.balign 4, 0
sStr_SCM_2:
	.asciz "SCM"
	.balign 4, 0
sStr_SCN_2:
	.asciz "SCN"
	.balign 4, 0
sStr_I_HaveAuthorizedYourRequestToAddMeToYourList:
	.asciz "I have authorized your request to add me to your list"
	.balign 4, 0
sStr_Empty_4:
	.asciz ""
	.balign 4, 0
sFmt_CharCharCharChar:
	.asciz "%c%c%c%c"
	.balign 4, 0
sStr_And:
	.asciz " and ()"
	.balign 4, 0
sStr_Empty_5:
	.asciz ""
	.balign 4, 0
sFmt_Uint_2:
	.asciz "%u"
	.balign 4, 0
sStr_FME:
	.asciz "FME"
	.balign 4, 0
sStr_MDF:
	.asciz "MDF"
	.balign 4, 0
sStr_VER:
	.asciz "VER"
	.balign 4, 0
sStr_InitState:
	.asciz "Init state"
	.balign 4, 0
sStr_ServerFull:
	.asciz "Server full"
	.balign 4, 0
sStr_UnknownConnectAttempt:
	.asciz "Unknown connect attempt"
	.balign 4, 0
sStr_SCM_3:
	.asciz "SCM"
	.balign 4, 0
sStr_SCN_3:
	.asciz "SCN"
	.balign 4, 0
sStr_dwc_pid:
	.asciz "dwc_pid"
	.balign 4, 0
sStr_dwc_mtype:
	.asciz "dwc_mtype"
	.balign 4, 0
sStr_dwc_mresv:
	.asciz "dwc_mresv"
	.balign 4, 0
sStr_dwc_mver:
	.asciz "dwc_mver"
	.balign 4, 0
sStr_dwc_eval:
	.asciz "dwc_eval"
	.balign 4, 0
sFmt_And:
	.asciz " and (%s)"
	.balign 4, 0
sFmt_StrSpaceEqSpaceUint:
	.asciz "%s = %u"
	.balign 4, 0
sFmt_AndNeAndMaxplayersAndNumplayersLtAndAndNe:
	.asciz "%s = %d and %s != %u and maxplayers = %d and numplayers < %d and %s = %d and %s != %s"
	.balign 4, 0
sFmt_SlashUint:
	.asciz "/%u"
	.balign 4, 0
sStr_SBCM:
	.asciz "SBCM"
	.balign 4, 0
sFmt_StrIntV_Str:
	.asciz "%s%dv%s"
	.balign 4, 0
sStr_GPCM_2:
	.asciz "GPCM"
	.balign 4, 0
sStr_MAT_2:
	.asciz "MAT"
	.balign 4, 0
sStr_numplayers:
	.asciz "numplayers"
	.balign 4, 0
sStr_maxplayers:
	.asciz "maxplayers"
	.balign 4, 0
sStr_DT:
	.asciz "DT"
	.balign 4, 0
DWCi_AC_UsbApProbeSsid:
	.asciz "NWCUSBAP"
	.balign 4, 0
sStr_NINTENDO_DS:
	.asciz "NINTENDO-DS"
	.balign 4, 0
DWCi_AC_SsidKeyTable:
	.word sStr_38g6zxjk20gvmv6_J_VY1
	.word sStr_Gwi6_Fs0Nf
	.word sStr_952uybjnpmu903biaBk5m
	.word sStr_EgErAgS_M
sStr_Gwi6_Fs0Nf:
	.asciz "gwi'6&fs=0Nf~"
	.balign 4, 0
sStr_EgErAgS_M:
	.asciz "%(egEr)ag(s&m"
	.balign 4, 0
sStr_952uybjnpmu903biaBk5m:
	.asciz "952uybjnpmu903bia@bk5m[-"
	.balign 4, 0
sStr_38g6zxjk20gvmv6_J_VY1:
	.asciz "38g6zxjk20gvmv]6^=j&%vY1"
	.balign 4, 0
DWCi_AC_ShopSsidPrefix:
	.asciz "NDWCSHAP"
	.balign 4, 0
DWCi_AC_UsbApSsidPrefix:
	.asciz "NWCUSBAP"
	.balign 4, 0
gsiAvailableCheckHostFormat:
	.asciz "%s.available.gs.nintendowifi.net"
	.balign 4, 0
gsiAvailableCheckResponseMagic:
	.byte 0xFE, 0xFD, 0x09, 0x00
sStr_ArrayMap:
	.asciz "ArrayMap"
	.balign 4, 0
sStr_ArrayNth:
	.asciz "ArrayNth"
	.balign 4, 0
sStr_ArrayNew:
	.asciz "ArrayNew"
	.balign 4, 0
sStr_ArrayFree:
	.asciz "ArrayFree"
	.balign 4, 0
sStr_ArrayGrow:
	.asciz "ArrayGrow"
	.balign 4, 0
sStr_ArrayAppend:
	.asciz "ArrayAppend"
	.balign 4, 0
sStr_ArrayRemoveAt:
	.asciz "ArrayRemoveAt"
	.balign 4, 0
sStr_ArrayDeleteAt:
	.asciz "ArrayDeleteAt"
	.balign 4, 0
sStr_ArrayInsertAt:
	.asciz "ArrayInsertAt"
	.balign 4, 0
sStr_ArrayReplaceAt:
	.asciz "ArrayReplaceAt"
	.balign 4, 0
sStr_ArrayMapBackwards:
	.asciz "ArrayMapBackwards"
	.balign 4, 0
sStr_ArrayInsertSorted:
	.asciz "ArrayInsertSorted"
	.balign 4, 0
sStr_ArrayMapBackwards2:
	.asciz "ArrayMapBackwards2"
	.balign 4, 0
sStr_ArrayList:
	.asciz "array->list"
	.balign 4, 0
sStr_DarrayC:
	.asciz "darray.c"
	.balign 4, 0
sStr_array:
	.asciz "array"
	.balign 4, 0
sStr_elemSize:
	.asciz "elemSize"
	.balign 4, 0
sStr_N_Ge0_AndN_LtArrayCount:
	.asciz "(n >= 0) && (n < array->count)"
	.balign 4, 0
sStr_N_Ge0_AndN_LeArrayCount:
	.asciz "(n >= 0) && (n <= array->count)"
	.balign 4, 0
sStr_comparator:
	.asciz "comparator"
	.balign 4, 0
sStr_fn:
	.asciz "fn"
	.balign 4, 0
sStr_TableMap:
	.asciz "TableMap"
	.balign 4, 0
sStr_TableNew2:
	.asciz "TableNew2"
	.balign 4, 0
sStr_TableFree:
	.asciz "TableFree"
	.balign 4, 0
sStr_TableEnter:
	.asciz "TableEnter"
	.balign 4, 0
sStr_TableCount:
	.asciz "TableCount"
	.balign 4, 0
sStr_TableRemove:
	.asciz "TableRemove"
	.balign 4, 0
sStr_TableLookup:
	.asciz "TableLookup"
	.balign 4, 0
sStr_TableMapSafe:
	.asciz "TableMapSafe"
	.balign 4, 0
sStr_TableMapSafe2:
	.asciz "TableMapSafe2"
	.balign 4, 0
sStr_hashFn:
	.asciz "hashFn"
	.balign 4, 0
sStr_HashtableC:
	.asciz "hashtable.c"
	.balign 4, 0
sStr_compFn:
	.asciz "compFn"
	.balign 4, 0
sStr_elemSize_2:
	.asciz "elemSize"
	.balign 4, 0
sStr_nBuckets:
	.asciz "nBuckets"
	.balign 4, 0
sStr_table:
	.asciz "table"
	.balign 4, 0
sStr_TableBuckets:
	.asciz "table->buckets"
	.balign 4, 0
sStr_fn_2:
	.asciz "fn"
	.balign 4, 0
sFmt_Hex_2:
	.asciz "%02x"
	.balign 4, 0
gUtilRandState:
	.asciz ""
	.balign 4, 0
sStr_time:
	.asciz "time"
	.balign 4, 0
sStr_current_time:
	.asciz "current_time"
	.balign 4, 0
sStr_OS_IsTickAvailableEqTRUE:
	.asciz "OS_IsTickAvailable() == TRUE"
	.balign 4, 0
sStr_NonportC:
	.asciz "nonport.c"
	.balign 4, 0
sStr_localhost:
	.asciz "localhost"
	.balign 4, 0
sStr_gpGetBuddyStatus:
	.asciz "gpGetBuddyStatus"
	.balign 4, 0
sStr_InvalidFunc:
	.asciz "Invalid func."
	.balign 4, 0
sStr_NoCallback:
	.asciz "No callback."
	.balign 4, 0
sStr_Empty_6:
	.asciz ""
	.balign 4, 0
sStr_TheConnectionHasAlreadyBeenDisconnected:
	.asciz "The connection has already been disconnected."
	.balign 4, 0
sStr_InvalidReason:
	.asciz "Invalid reason."
	.balign 4, 0
sKey_addbuddy:
	.asciz "\\addbuddy\\"
	.balign 4, 0
sKey_sesskey:
	.asciz "\\sesskey\\"
	.balign 4, 0
sKey_newprofileid:
	.asciz "\\newprofileid\\"
	.balign 4, 0
sKey_reason:
	.asciz "\\reason\\"
	.balign 4, 0
sKey_final:
	.asciz "\\final\\"
	.balign 4, 0
sStr_InvalidStatus:
	.asciz "Invalid status."
	.balign 4, 0
sStr_InvalidIndex:
	.asciz "Invalid index."
	.balign 4, 0
sStr_buddyStatus:
	.asciz "buddyStatus"
	.balign 4, 0
sStr_GpC:
	.asciz "gp.c"
	.balign 4, 0
sStr_InvalidStatusString:
	.asciz "Invalid statusString."
	.balign 4, 0
sStr_InvalidLocationString:
	.asciz "Invalid locationString."
	.balign 4, 0
sKey_status:
	.asciz "\\status\\"
	.balign 4, 0
sKey_statstring:
	.asciz "\\statstring\\"
	.balign 4, 0
sKey_locstring:
	.asciz "\\locstring\\"
	.balign 4, 0
sStr_InvalidMessage:
	.asciz "Invalid message."
	.balign 4, 0
sStr_gpiProcess:
	.asciz "gpiProcess"
	.balign 4, 0
sStr_GpiInitialize:
	.asciz "\n\n\n\n\n*************\ngpiInitialize\n"
	.balign 4, 0
sStr_CM:
	.asciz "CM"
	.balign 4, 0
sStr_ThereWasAnErrorReadingFromTheServer:
	.asciz "There was an error reading from the server."
	.balign 4, 0
sKey_final_2:
	.asciz "\\final\\"
	.balign 4, 0
sFmt_CMD:
	.asciz "CMD: %s\n"
	.balign 4, 0
sStr_OutOfMemory:
	.asciz "Out of memory."
	.balign 4, 0
sKey_id:
	.asciz "\\id\\"
	.balign 4, 0
sFmt_NoMatchingOperationFoundForId:
	.asciz "No matching operation found for id %d\n"
	.balign 4, 0
sKey_bm:
	.asciz "\\bm\\"
	.balign 4, 0
sKey_ka:
	.asciz "\\ka\\"
	.balign 4, 0
sStr_ReceivedAnUnrecognizedUnsolicitedMessage:
	.asciz "Received an unrecognized, unsolicited message.\n"
	.balign 4, 0
sStr_TheServerHasClosedTheConnection:
	.asciz "The server has closed the connection."
	.balign 4, 0
sStr_IconnectionConnectStateEqGPI_NOT_CONNECTED_Or:
	.asciz "(iconnection->connectState == GPI_NOT_CONNECTED) || (iconnection->connectState == GPI_CONNECTING) || (iconnection->connectState == GPI_NEGOTIATING) || (iconnection->connectState == GPI_CONNECTED) || (iconnection->connectState == GPI_DISCONNECTED)"
	.balign 4, 0
sStr_GpiC:
	.asciz "gpi.c"
	.balign 4, 0
sStr_0:
	.asciz "0"
	.balign 4, 0
sStr_gpiDeleteBuddy:
	.asciz "gpiDeleteBuddy"
	.balign 4, 0
sKey_authadd:
	.asciz "\\authadd\\"
	.balign 4, 0
sKey_sesskey_2:
	.asciz "\\sesskey\\"
	.balign 4, 0
sKey_fromprofileid:
	.asciz "\\fromprofileid\\"
	.balign 4, 0
sKey_sig:
	.asciz "\\sig\\"
	.balign 4, 0
sKey_final_3:
	.asciz "\\final\\"
	.balign 4, 0
sKey_bm_2:
	.asciz "\\bm\\"
	.balign 4, 0
sStr_UnexpectedDataWasReceivedFromTheServer:
	.asciz "Unexpected data was received from the server."
	.balign 4, 0
sKey_f:
	.asciz "\\f\\"
	.balign 4, 0
sKey_date:
	.asciz "\\date\\"
	.balign 4, 0
sStr_OutOfMemory_2:
	.asciz "Out of memory."
	.balign 4, 0
sKey_msg:
	.asciz "\\msg\\"
	.balign 4, 0
sStr_Signed:
	.asciz "|signed|"
	.balign 4, 0
sStr_PipeS_Pipe:
	.asciz "|s|"
	.balign 4, 0
sStr_PipeSsPipe:
	.asciz "|ss|"
	.balign 4, 0
sStr_PipeLsPipe:
	.asciz "|ls|"
	.balign 4, 0
sStr_PipeIpPipe:
	.asciz "|ip|"
	.balign 4, 0
sStr_PipeP_Pipe:
	.asciz "|p|"
	.balign 4, 0
sStr_PipeL_Pipe:
	.asciz "|l|"
	.balign 4, 0
sStr_1:
	.asciz "1"
	.balign 4, 0
sKey_t:
	.asciz "\\t\\"
	.balign 4, 0
sStr_InvalidProfile:
	.asciz "Invalid profile."
	.balign 4, 0
sKey_delbuddy:
	.asciz "\\delbuddy\\"
	.balign 4, 0
sKey_delprofileid:
	.asciz "\\delprofileid\\"
	.balign 4, 0
sStr_IndexGe0:
	.asciz "index >= 0"
	.balign 4, 0
sStr_GpiBuddyC:
	.asciz "gpiBuddy.c"
	.balign 4, 0
sStr_IconnectionProfileListNumBuddiesGe0:
	.asciz "iconnection->profileList.numBuddies >= 0"
	.balign 4, 0
sStr_gpiRecvToBuffer:
	.asciz "gpiRecvToBuffer"
	.balign 4, 0
sStr_gpiSendFromBuffer:
	.asciz "gpiSendFromBuffer"
	.balign 4, 0
sStr_gpiSendOrBufferChar:
	.asciz "gpiSendOrBufferChar"
	.balign 4, 0
sStr_gpiAppendCharToBuffer:
	.asciz "gpiAppendCharToBuffer"
	.balign 4, 0
sStr_gpiSendOrBufferStringLen:
	.asciz "gpiSendOrBufferStringLen"
	.balign 4, 0
sStr_gpiAppendStringToBufferLen:
	.asciz "gpiAppendStringToBufferLen"
	.balign 4, 0
sStr_OutputBufferNeNULL:
	.asciz "outputBuffer != NULL"
	.balign 4, 0
sStr_GpiBufferC:
	.asciz "gpiBuffer.c"
	.balign 4, 0
sStr_OutOfMemory_3:
	.asciz "Out of memory."
	.balign 4, 0
sStr_StringNeNULL:
	.asciz "string != NULL"
	.balign 4, 0
sStr_StringLenGe0:
	.asciz "stringLen >= 0"
	.balign 4, 0
sFmt_Int_2:
	.asciz "%d"
	.balign 4, 0
sStr_ThereWasAnErrorSendingOnA_Socket:
	.asciz "There was an error sending on a socket."
	.balign 4, 0
sFmt_SENDXXXX_ConnectionClosed:
	.asciz "SENDXXXX(%s): Connection closed\n"
	.balign 4, 0
sStr_PeerOutputBufferBufferNeNULL:
	.asciz "peer->outputBuffer.buffer != NULL"
	.balign 4, 0
sStr_PT:
	.asciz "PT"
	.balign 4, 0
sStr_SockNeINVALID_SOCKET:
	.asciz "sock != INVALID_SOCKET"
	.balign 4, 0
sStr_InputBufferNeNULL:
	.asciz "inputBuffer != NULL"
	.balign 4, 0
sStr_BytesReadNeNULL:
	.asciz "bytesRead != NULL"
	.balign 4, 0
sStr_ConnClosedNeNULL:
	.asciz "connClosed != NULL"
	.balign 4, 0
sStr_ThereWasAnErrorReadingFromA_Socket:
	.asciz "There was an error reading from a socket."
	.balign 4, 0
sFmt_RECVXXXX_ConnectionClosed:
	.asciz "RECVXXXX(%s): Connection closed\n"
	.balign 4, 0
sFmt_RECVTOTL:
	.asciz "RECVTOTL(%s): %d\n"
	.balign 4, 0
sStr_LenGe0:
	.asciz "len >= 0"
	.balign 4, 0
sStr_PosGe0:
	.asciz "pos >= 0"
	.balign 4, 0
sStr_PosLeLen:
	.asciz "pos <= len"
	.balign 4, 0
sKey_msg_2:
	.asciz "\\msg\\"
	.balign 4, 0
sKey_m:
	.asciz "\\m\\"
	.balign 4, 0
sKey_len:
	.asciz "\\len\\"
	.balign 4, 0
sStr_gpiCallCallback:
	.asciz "gpiCallCallback"
	.balign 4, 0
sStr_gpiCallErrorCallback:
	.asciz "gpiCallErrorCallback"
	.balign 4, 0
sStr_IconnectionNeNULL:
	.asciz "iconnection != NULL"
	.balign 4, 0
sStr_GpiCallbackC:
	.asciz "gpiCallback.c"
	.balign 4, 0
sStr_ResultNeGP_NO_ERROR:
	.asciz "result != GP_NO_ERROR"
	.balign 4, 0
sStr_FatalEqGP_FATAL_OrFatalEqGP_NON_FATAL:
	.asciz "(fatal == GP_FATAL) || (fatal == GP_NON_FATAL)"
	.balign 4, 0
sStr_OutOfMemory_4:
	.asciz "Out of memory."
	.balign 4, 0
sStr_DataCallbackCallbackNeNULL:
	.asciz "data->callback.callback != NULL"
	.balign 4, 0
sStr_DataArgNeNULL:
	.asciz "data->arg != NULL"
	.balign 4, 0
sStr_gpiStartConnect:
	.asciz "gpiStartConnect"
	.balign 4, 0
sStr_gpiCheckConnect:
	.asciz "gpiCheckConnect"
	.balign 4, 0
sStr_GpcmGsNintendowifiNet:
	.asciz "gpcm.gs.nintendowifi.net"
	.balign 4, 0
	.space 0x40-(.-sStr_GpcmGsNintendowifiNet)
sStr_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuv_2:
	.asciz "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
	.balign 4, 0
sStr_ThereWasAnErrorCreatingA_Socket:
	.asciz "There was an error creating a socket."
	.balign 4, 0
sStr_ThereWasAnErrorMakingA_SocketNonBlocking:
	.asciz "There was an error making a socket non-blocking."
	.balign 4, 0
sStr_ThereWasAnErrorBindingA_Socket:
	.asciz "There was an error binding a socket."
	.balign 4, 0
sStr_ThereWasAnErrorListeningOnA_Socket:
	.asciz "There was an error listening on a socket."
	.balign 4, 0
sStr_ThereWasAnErrorGettingA_SocketS_Addres:
	.asciz "There was an error getting a socket's addres."
	.balign 4, 0
sStr_CouldNotResolveConnectionManangerHostName:
	.asciz "Could not resolve connection mananger host name."
	.balign 4, 0
sStr_AddressSinAddrS_AddrNe0:
	.asciz "address.sin_addr.s_addr != 0"
	.balign 4, 0
sStr_GpiConnectC:
	.asciz "gpiConnect.c"
	.balign 4, 0
sStr_ThereWasAnErrorConnectingA_Socket:
	.asciz "There was an error connecting a socket."
	.balign 4, 0
sStr_InvalidConnection:
	.asciz "Invalid connection."
	.balign 4, 0
sStr_InvalidFirewall:
	.asciz "Invalid firewall."
	.balign 4, 0
sStr_OutOfMemory_5:
	.asciz "Out of memory."
	.balign 4, 0
sFmt_StrAtStr:
	.asciz "%s@%s"
	.balign 4, 0
sFmt_StrStrStrStrStrStr:
	.asciz "%s%s%s%s%s%s"
	.balign 4, 0
sStr_SpaceSpaceSpaceSpaceSpaceSpaceSpaceSpaceSpace:
	.asciz "                                                "
	.balign 4, 0
sKey_login:
	.asciz "\\login\\"
	.balign 4, 0
sKey_challenge:
	.asciz "\\challenge\\"
	.balign 4, 0
sKey_authtoken:
	.asciz "\\authtoken\\"
	.balign 4, 0
sKey_uniquenick:
	.asciz "\\uniquenick\\"
	.balign 4, 0
sKey_user:
	.asciz "\\user\\"
	.balign 4, 0
sStr_At:
	.asciz "@"
	.balign 4, 0
sKey_userid:
	.asciz "\\userid\\"
	.balign 4, 0
sKey_profileid:
	.asciz "\\profileid\\"
	.balign 4, 0
sKey_response:
	.asciz "\\response\\"
	.balign 4, 0
sStr_Firewall1:
	.asciz "\\firewall\\1"
	.balign 4, 0
sKey_port:
	.asciz "\\port\\"
	.balign 4, 0
sKey_productid:
	.asciz "\\productid\\"
	.balign 4, 0
sKey_gamename:
	.asciz "\\gamename\\"
	.balign 4, 0
sKey_namespaceid:
	.asciz "\\namespaceid\\"
	.balign 4, 0
sStr_BackslashIdBackslash1:
	.asciz "\\id\\1"
	.balign 4, 0
sKey_final_4:
	.asciz "\\final\\"
	.balign 4, 0
sKey_newuser:
	.asciz "\\newuser\\"
	.balign 4, 0
sKey_email:
	.asciz "\\email\\"
	.balign 4, 0
sKey_nick:
	.asciz "\\nick\\"
	.balign 4, 0
sKey_passwordenc:
	.asciz "\\passwordenc\\"
	.balign 4, 0
sKey_cdkeyenc:
	.asciz "\\cdkeyenc\\"
	.balign 4, 0
sKey_pid:
	.asciz "\\pid\\"
	.balign 4, 0
sKey_fatal:
	.asciz "\\fatal\\"
	.balign 4, 0
sStr_BackslashLcBackslash1:
	.asciz "\\lc\\1"
	.balign 4, 0
sStr_UnexpectedDataWasReceivedFromTheServer_2:
	.asciz "Unexpected data was received from the server."
	.balign 4, 0
sKey_nur:
	.asciz "\\nur\\"
	.balign 4, 0
sStr_UnexepectedDataWasReceivedFromTheServer:
	.asciz "Unexepected data was received from the server."
	.balign 4, 0
sStr_BackslashLcBackslash2:
	.asciz "\\lc\\2"
	.balign 4, 0
sKey_sesskey_3:
	.asciz "\\sesskey\\"
	.balign 4, 0
sKey_lt:
	.asciz "\\lt\\"
	.balign 4, 0
sKey_proof:
	.asciz "\\proof\\"
	.balign 4, 0
sStr_CouldNotAuthenticateServer:
	.asciz "Could not authenticate server."
	.balign 4, 0
sStr_TheServerHasRefusedTheConnection:
	.asciz "The server has refused the connection."
	.balign 4, 0
sStr_StateEqGPI_CONNECTED:
	.asciz "state == GPI_CONNECTED"
	.balign 4, 0
sStr_LogoutSesskey:
	.asciz "\\logout\\\\sesskey\\"
	.balign 4, 0
sStr_CM_2:
	.asciz "CM"
	.balign 4, 0
sStr_gpiIntToDate:
	.asciz "gpiIntToDate"
	.balign 4, 0
sStr_gpiProcessGetInfo:
	.asciz "gpiProcessGetInfo"
	.balign 4, 0
sStr_GpiInfoC:
	.asciz "gpiInfo.c"
	.balign 4, 0
sStr_InvalidDate:
	.asciz "Invalid date."
	.balign 4, 0
sStr_GpiIsValidDateD_M_Y:
	.asciz "gpiIsValidDate(d, m, y)"
	.balign 4, 0
sKey_pi:
	.asciz "\\pi\\"
	.balign 4, 0
sStr_UnexpectedDataWasReceivedFromTheServer_3:
	.asciz "Unexpected data was received from the server."
	.balign 4, 0
sKey_profileid_2:
	.asciz "\\profileid\\"
	.balign 4, 0
sStr_ProfileidGt0:
	.asciz "profileid > 0"
	.balign 4, 0
sKey_nick_2:
	.asciz "\\nick\\"
	.balign 4, 0
sKey_uniquenick_2:
	.asciz "\\uniquenick\\"
	.balign 4, 0
sKey_email_2:
	.asciz "\\email\\"
	.balign 4, 0
sKey_firstname:
	.asciz "\\firstname\\"
	.balign 4, 0
sKey_lastname:
	.asciz "\\lastname\\"
	.balign 4, 0
sKey_icquin:
	.asciz "\\icquin\\"
	.balign 4, 0
sKey_homepage:
	.asciz "\\homepage\\"
	.balign 4, 0
sKey_zipcode:
	.asciz "\\zipcode\\"
	.balign 4, 0
sKey_countrycode:
	.asciz "\\countrycode\\"
	.balign 4, 0
sKey_lon:
	.asciz "\\lon\\"
	.balign 4, 0
sKey_lat:
	.asciz "\\lat\\"
	.balign 4, 0
sKey_loc:
	.asciz "\\loc\\"
	.balign 4, 0
sKey_birthday:
	.asciz "\\birthday\\"
	.balign 4, 0
sKey_sex:
	.asciz "\\sex\\"
	.balign 4, 0
sKey_pmask:
	.asciz "\\pmask\\"
	.balign 4, 0
sKey_aim:
	.asciz "\\aim\\"
	.balign 4, 0
sKey_pic:
	.asciz "\\pic\\"
	.balign 4, 0
sKey_occ:
	.asciz "\\occ\\"
	.balign 4, 0
sKey_ind:
	.asciz "\\ind\\"
	.balign 4, 0
sKey_inc:
	.asciz "\\inc\\"
	.balign 4, 0
sKey_mar:
	.asciz "\\mar\\"
	.balign 4, 0
sKey_chc:
	.asciz "\\chc\\"
	.balign 4, 0
sKey_i1:
	.asciz "\\i1\\"
	.balign 4, 0
sKey_o1:
	.asciz "\\o1\\"
	.balign 4, 0
sKey_conn:
	.asciz "\\conn\\"
	.balign 4, 0
sKey_sig_2:
	.asciz "\\sig\\"
	.balign 4, 0
sStr_OutOfMemory_6:
	.asciz "Out of memory."
	.balign 4, 0
sStr_UpdateproSesskey:
	.asciz "\\updatepro\\\\sesskey\\"
	.balign 4, 0
sKey_final_5:
	.asciz "\\final\\"
	.balign 4, 0
sStr_UpdateuiSesskey:
	.asciz "\\updateui\\\\sesskey\\"
	.balign 4, 0
sStr_InvalidZipcode:
	.asciz "Invalid zipcode."
	.balign 4, 0
sFmt_Int_3:
	.asciz "%d"
	.balign 4, 0
sStr_0_2:
	.asciz "0"
	.balign 4, 0
sStr_1_2:
	.asciz "1"
	.balign 4, 0
sStr_2:
	.asciz "2"
	.balign 4, 0
sStr_InvalidSex:
	.asciz "Invalid sex."
	.balign 4, 0
sKey_cpubrandid:
	.asciz "\\cpubrandid\\"
	.balign 4, 0
sKey_cpuspeed:
	.asciz "\\cpuspeed\\"
	.balign 4, 0
sKey_memory:
	.asciz "\\memory\\"
	.balign 4, 0
sKey_videocard1ram:
	.asciz "\\videocard1ram\\"
	.balign 4, 0
sKey_videocard2ram:
	.asciz "\\videocard2ram\\"
	.balign 4, 0
sKey_connectionid:
	.asciz "\\connectionid\\"
	.balign 4, 0
sKey_connectionspeed:
	.asciz "\\connectionspeed\\"
	.balign 4, 0
sKey_hasnetwork:
	.asciz "\\hasnetwork\\"
	.balign 4, 0
sStr_InvalidInfo:
	.asciz "Invalid info."
	.balign 4, 0
sStr_InvalidValue:
	.asciz "Invalid value."
	.balign 4, 0
sKey_password:
	.asciz "\\password\\"
	.balign 4, 0
sStr_InvalidCountrycode:
	.asciz "Invalid countrycode."
	.balign 4, 0
sKey_videocard1string:
	.asciz "\\videocard1string\\"
	.balign 4, 0
sKey_videocard2string:
	.asciz "\\videocard2string\\"
	.balign 4, 0
sKey_osstring:
	.asciz "\\osstring\\"
	.balign 4, 0
sStr_GetprofileSesskey:
	.asciz "\\getprofile\\\\sesskey\\"
	.balign 4, 0
sKey_id_2:
	.asciz "\\id\\"
	.balign 4, 0
sStr_gpiDestroyOperation:
	.asciz "gpiDestroyOperation"
	.balign 4, 0
sStr_gpiFailedOpCallback:
	.asciz "gpiFailedOpCallback"
	.balign 4, 0
sStr_gpiProcessOperation:
	.asciz "gpiProcessOperation"
	.balign 4, 0
sStr_ConnectionNeNULL:
	.asciz "connection != NULL"
	.balign 4, 0
sStr_GpiOperationC:
	.asciz "gpiOperation.c"
	.balign 4, 0
sStr_ConnectionNeNULL_2:
	.asciz "*connection != NULL"
	.balign 4, 0
sStr_OperationNeNULL:
	.asciz "operation != NULL"
	.balign 4, 0
sStr_OutOfMemory_7:
	.asciz "Out of memory."
	.balign 4, 0
sStr_0_3:
	.asciz "0"
	.balign 4, 0
sStr_IconnectionNumSearchesGe0:
	.asciz "iconnection->numSearches >= 0"
	.balign 4, 0
sFmt_GpiProcessOperationWasPassedAnOperationWithAn:
	.asciz "gpiProcessOperation was passed an operation with an invalid type (%d)\n"
	.balign 4, 0
sStr_gpiRemovePeer:
	.asciz "gpiRemovePeer"
	.balign 4, 0
sStr_gpiProcessPeer:
	.asciz "gpiProcessPeer"
	.balign 4, 0
sStr_gpiPeerAddMessage:
	.asciz "gpiPeerAddMessage"
	.balign 4, 0
sStr_gpiPeerStartTransferMessage:
	.asciz "gpiPeerStartTransferMessage"
	.balign 4, 0
sStr_gpiPeerFinishTransferMessage:
	.asciz "gpiPeerFinishTransferMessage"
	.balign 4, 0
sStr_gpiProcessPeerAcceptingConnection:
	.asciz "gpiProcessPeerAcceptingConnection"
	.balign 4, 0
sStr_gpiProcessPeerInitiatingConnection:
	.asciz "gpiProcessPeerInitiatingConnection"
	.balign 4, 0
sStr_ErrorConnectingToA_Peer:
	.asciz "Error connecting to a peer."
	.balign 4, 0
sKey_auth:
	.asciz "\\auth\\"
	.balign 4, 0
sKey_pid_2:
	.asciz "\\pid\\"
	.balign 4, 0
sKey_nick_3:
	.asciz "\\nick\\"
	.balign 4, 0
sKey_sig_3:
	.asciz "\\sig\\"
	.balign 4, 0
sKey_final_6:
	.asciz "\\final\\"
	.balign 4, 0
sStr_PR:
	.asciz "PR"
	.balign 4, 0
sKey_anack:
	.asciz "\\anack\\"
	.balign 4, 0
sStr_ErrorGettingBuddyAuthorization:
	.asciz "Error getting buddy authorization."
	.balign 4, 0
sKey_aack:
	.asciz "\\aack\\"
	.balign 4, 0
sStr_ErrorParsingBuddyMessage:
	.asciz "Error parsing buddy message."
	.balign 4, 0
sStr_0_4:
	.asciz "0"
	.balign 4, 0
sStr_GpiPeerC:
	.asciz "gpiPeer.c"
	.balign 4, 0
sStr_PeerStateEqGPI_PEER_WAITING:
	.asciz "peer->state == GPI_PEER_WAITING"
	.balign 4, 0
sFmt_StrIntInt:
	.asciz "%s%d%d"
	.balign 4, 0
sStr_OutOfMemory_8:
	.asciz "Out of memory."
	.balign 4, 0
sStr_1_3:
	.asciz "1"
	.balign 4, 0
sStr_PeerStateNeGPI_PEER_NOT_CONNECTED:
	.asciz "peer->state != GPI_PEER_NOT_CONNECTED"
	.balign 4, 0
sStr_PeerNeNULL:
	.asciz "peer != NULL"
	.balign 4, 0
sStr_TriedToRemovePeerNotInList:
	.asciz "Tried to remove peer not in list."
	.balign 4, 0
sStr_ThereWasAnErrorCreatingA_Socket_2:
	.asciz "There was an error creating a socket."
	.balign 4, 0
sStr_ThereWasAnErrorMakingA_SocketNonBlocking_2:
	.asciz "There was an error making a socket non-blocking."
	.balign 4, 0
sStr_ThereWasAnErrorConnectingA_Socket_2:
	.asciz "There was an error connecting a socket."
	.balign 4, 0
sStr_MessageNeNULL:
	.asciz "message != NULL"
	.balign 4, 0
sKey_m_2:
	.asciz "\\m\\"
	.balign 4, 0
sKey_len_2:
	.asciz "\\len\\"
	.balign 4, 0
sKey_msg_3:
	.asciz "\\msg\\\n"
	.balign 4, 0
sStr_transferID:
	.asciz "transferID"
	.balign 4, 0
sFmt_M_Xfer:
	.asciz "\\m\\%d\\xfer\\%d %u %u"
	.balign 4, 0
sStr_Empty_7:
	.asciz ""
	.balign 4, 0
sFmt_LenMsg:
	.asciz "\\len\\%d\\msg\\\n"
	.balign 4, 0
sStr_gpiProfileListAdd:
	.asciz "gpiProfileListAdd"
	.balign 4, 0
sKey_npr:
	.asciz "\\npr\\"
	.balign 4, 0
sStr_UnexpectedDataWasReceivedFromTheServer_4:
	.asciz "Unexpected data was received from the server."
	.balign 4, 0
sKey_profileid_3:
	.asciz "\\profileid\\"
	.balign 4, 0
sStr_OutOfMemory_9:
	.asciz "Out of memory."
	.balign 4, 0
sStr_IdGt0:
	.asciz "id > 0"
	.balign 4, 0
sStr_GpiProfileC:
	.asciz "gpiProfile.c"
	.balign 4, 0
sStr_gpiProcessSearch:
	.asciz "gpiProcessSearch"
	.balign 4, 0
sStr_gpiProcessSearches:
	.asciz "gpiProcessSearches"
	.balign 4, 0
sStr_gpiStartProfileSearch:
	.asciz "gpiStartProfileSearch"
	.balign 4, 0
sStr_GpspGsNintendowifiNet:
	.asciz "gpsp.gs.nintendowifi.net"
	.balign 4, 0
	.space 0x40-(.-sStr_GpspGsNintendowifiNet)
sStr_OutOfMemory_10:
	.asciz "Out of memory."
	.balign 4, 0
sStr_ThereWasAnErrorCreatingA_Socket_3:
	.asciz "There was an error creating a socket."
	.balign 4, 0
sStr_ThereWasAnErrorMakingA_SocketNonBlocking_3:
	.asciz "There was an error making a socket non-blocking."
	.balign 4, 0
sStr_CouldNotResolveSearchManangerHostName:
	.asciz "Could not resolve search mananger host name."
	.balign 4, 0
sStr_AddressSinAddrS_AddrNe0_2:
	.asciz "address.sin_addr.s_addr != 0"
	.balign 4, 0
sStr_GpiSearchC:
	.asciz "gpiSearch.c"
	.balign 4, 0
sStr_ThereWasAnErrorConnectingA_Socket_3:
	.asciz "There was an error connecting a socket."
	.balign 4, 0
sStr_NoSearchCriteria:
	.asciz "No search criteria."
	.balign 4, 0
sStr_SM:
	.asciz "SM"
	.balign 4, 0
sStr_CouldNotConnectToTheSearchManager:
	.asciz "Could not connect to the search manager."
	.balign 4, 0
sKey_search:
	.asciz "\\search\\"
	.balign 4, 0
sKey_sesskey_4:
	.asciz "\\sesskey\\"
	.balign 4, 0
sKey_profileid_4:
	.asciz "\\profileid\\"
	.balign 4, 0
sKey_namespaceid_2:
	.asciz "\\namespaceid\\"
	.balign 4, 0
sKey_nick_4:
	.asciz "\\nick\\"
	.balign 4, 0
sKey_uniquenick_3:
	.asciz "\\uniquenick\\"
	.balign 4, 0
sKey_email_3:
	.asciz "\\email\\"
	.balign 4, 0
sKey_firstname_2:
	.asciz "\\firstname\\"
	.balign 4, 0
sKey_lastname_2:
	.asciz "\\lastname\\"
	.balign 4, 0
sKey_icquin_2:
	.asciz "\\icquin\\"
	.balign 4, 0
sKey_skip:
	.asciz "\\skip\\"
	.balign 4, 0
sKey_valid:
	.asciz "\\valid\\"
	.balign 4, 0
sKey_nicks:
	.asciz "\\nicks\\"
	.balign 4, 0
sKey_pass:
	.asciz "\\pass\\"
	.balign 4, 0
sKey_pmatch:
	.asciz "\\pmatch\\"
	.balign 4, 0
sKey_productid_2:
	.asciz "\\productid\\"
	.balign 4, 0
sKey_check:
	.asciz "\\check\\"
	.balign 4, 0
sKey_newuser_2:
	.asciz "\\newuser\\"
	.balign 4, 0
sKey_productID:
	.asciz "\\productID\\"
	.balign 4, 0
sKey_cdkey:
	.asciz "\\cdkey\\"
	.balign 4, 0
sKey_others:
	.asciz "\\others\\"
	.balign 4, 0
sKey_uniquesearch:
	.asciz "\\uniquesearch\\"
	.balign 4, 0
sKey_preferrednick:
	.asciz "\\preferrednick\\"
	.balign 4, 0
sStr_0_5:
	.asciz "0"
	.balign 4, 0
sKey_gamename_2:
	.asciz "\\gamename\\"
	.balign 4, 0
sKey_final_7:
	.asciz "\\final\\"
	.balign 4, 0
sStr_ThereWasAnErrorReadingFromTheServer_2:
	.asciz "There was an error reading from the server."
	.balign 4, 0
sStr_bsrdone:
	.asciz "bsrdone"
	.balign 4, 0
sStr_more:
	.asciz "more"
	.balign 4, 0
sStr_bsr:
	.asciz "bsr"
	.balign 4, 0
sStr_nick:
	.asciz "nick"
	.balign 4, 0
sStr_uniquenick:
	.asciz "uniquenick"
	.balign 4, 0
sStr_firstname:
	.asciz "firstname"
	.balign 4, 0
sStr_lastname:
	.asciz "lastname"
	.balign 4, 0
sStr_email:
	.asciz "email"
	.balign 4, 0
sStr_ErrorReadingFromTheSearchServer:
	.asciz "Error reading from the search server."
	.balign 4, 0
sStr_vr:
	.asciz "vr"
	.balign 4, 0
sStr_nr:
	.asciz "nr"
	.balign 4, 0
sStr_ndone:
	.asciz "ndone"
	.balign 4, 0
sStr_psrdone:
	.asciz "psrdone"
	.balign 4, 0
sStr_psr:
	.asciz "psr"
	.balign 4, 0
sStr_status:
	.asciz "status"
	.balign 4, 0
sStr_statuscode:
	.asciz "statuscode"
	.balign 4, 0
sStr_cur:
	.asciz "cur"
	.balign 4, 0
sKey_pid_3:
	.asciz "\\pid\\"
	.balign 4, 0
sStr_nur:
	.asciz "nur"
	.balign 4, 0
sStr_others:
	.asciz "others"
	.balign 4, 0
sStr_odone:
	.asciz "odone"
	.balign 4, 0
sStr_o:
	.asciz "o"
	.balign 4, 0
sStr_first:
	.asciz "first"
	.balign 4, 0
sStr_last:
	.asciz "last"
	.balign 4, 0
sStr_us:
	.asciz "us"
	.balign 4, 0
sStr_usdone:
	.asciz "usdone"
	.balign 4, 0
sStr_CountEqArgNumSuggestedNicks:
	.asciz "count == arg->numSuggestedNicks"
	.balign 4, 0
sStr_NumLtIconnectionNumSearches:
	.asciz "num < iconnection->numSearches"
	.balign 4, 0
sStr_Empty_8:
	.asciz ""
	.balign 4, 0
sFmt_VersionResult:
	.asciz "\\version\\%d\\result\\%d"
	.balign 4, 0
sKey_xfer:
	.asciz "\\xfer\\"
	.balign 4, 0
sFmt_IntSpaceUintSpaceUint:
	.asciz "%d %u %u"
	.balign 4, 0
sKey_rn:
	.asciz "\\rn\\"
	.balign 4, 0
sStr_UnexpectedDataWasReceivedFromTheServer_5:
	.asciz "Unexpected data was received from the server."
	.balign 4, 0
sStr_OutOfMemory_11:
	.asciz "Out of memory."
	.balign 4, 0
sStr_strzcpy:
	.asciz "strzcpy"
	.balign 4, 0
sStr_gpiValueForKey:
	.asciz "gpiValueForKey"
	.balign 4, 0
sStr_gpiReadKeyAndValue:
	.asciz "gpiReadKeyAndValue"
	.balign 4, 0
sStr_DestNeNULL:
	.asciz "dest != NULL"
	.balign 4, 0
sStr_GpiUtilityC:
	.asciz "gpiUtility.c"
	.balign 4, 0
sStr_SrcNeNULL:
	.asciz "src != NULL"
	.balign 4, 0
sKey_error:
	.asciz "\\error\\"
	.balign 4, 0
sKey_err:
	.asciz "\\err\\"
	.balign 4, 0
sKey_errmsg:
	.asciz "\\errmsg\\"
	.balign 4, 0
sKey_fatal_2:
	.asciz "\\fatal\\"
	.balign 4, 0
sStr_CommandNeNULL:
	.asciz "command != NULL"
	.balign 4, 0
sStr_KeyNeNULL:
	.asciz "key != NULL"
	.balign 4, 0
sStr_ValueNeNULL:
	.asciz "value != NULL"
	.balign 4, 0
sStr_LenGt0:
	.asciz "len > 0"
	.balign 4, 0
sStr_ErrorConnecting:
	.asciz "Error connecting\n"
	.balign 4, 0
sStr_ThereWasAnErrorCheckingForA_CompletedConnection:
	.asciz "There was an error checking for a completed connection."
	.balign 4, 0
sStr_ConnectionRejected:
	.asciz "Connection rejected\n"
	.balign 4, 0
sStr_ConnectionAccepted:
	.asciz "Connection accepted\n"
	.balign 4, 0
sStr_BufferNeNULL:
	.asciz "buffer != NULL"
	.balign 4, 0
sStr_ParseError:
	.asciz "Parse Error."
	.balign 4, 0
sStr_DoFind:
	.asciz "DoFind"
	.balign 4, 0
sStr_BucketNew:
	.asciz "BucketNew"
	.balign 4, 0
sStr_BucketConcat:
	.asciz "BucketConcat"
	.balign 4, 0
sStr_set:
	.asciz "set"
	.balign 4, 0
sStr_GbucketC:
	.asciz "gbucket.c"
	.balign 4, 0
sStr_PbucketTypeEqBtString:
	.asciz "pbucket->type == bt_string"
	.balign 4, 0
ov00_022198D8:
	.byte 0xFF, 0xFF, 0xFF, 0xFF, 0x20, 0x4E, 0x00, 0x00
	.word sStr_X0AmeSpy3D
	.word BucketSetValue
	.word BucketAdd
	.word BucketSub
	.word BucketMult
	.word BucketDiv
	.word BucketConcat
	.word BucketAvg
	.word BucketIntOp
	.word BucketDoubleOp
	.word BucketStringOp
	.word TeamBucketIntOp
	.word TeamBucketDoubleOp
	.word TeamBucketStringOp
	.word PlayerBucketIntOp
	.word PlayerBucketDoubleOp
	.word PlayerBucketStringOp
sStr_X0AmeSpy3D:
	.asciz "\x00ameSpy3D"
	.balign 4, 0
	.space 0x10-(.-sStr_X0AmeSpy3D)
sStr_X00rojectAphex:
	.asciz "\x00rojectAphex"
	.balign 4, 0
	.space 0x10-(.-sStr_X00rojectAphex)
sStr_Empty_9:
	.asciz ""
	.balign 4, 0
sStr_Backslash:
	.asciz "\\"
	.balign 4, 0
sStr_pauthr:
	.asciz "pauthr"
	.balign 4, 0
sStr_lid:
	.asciz "lid"
	.balign 4, 0
sStr_errmsg:
	.asciz "errmsg"
	.balign 4, 0
sStr_getpidr:
	.asciz "getpidr"
	.balign 4, 0
sStr_getpdr:
	.asciz "getpdr"
	.balign 4, 0
sStr_pid:
	.asciz "pid"
	.balign 4, 0
sStr_mod:
	.asciz "mod"
	.balign 4, 0
sStr_length:
	.asciz "length"
	.balign 4, 0
sKey_data:
	.asciz "\\data\\"
	.balign 4, 0
sStr_setpdr:
	.asciz "setpdr"
	.balign 4, 0
sKey_pauthr:
	.asciz "\\pauthr\\"
	.balign 4, 0
sKey_getpidr:
	.asciz "\\getpidr\\"
	.balign 4, 0
sKey_getpdr:
	.asciz "\\getpdr\\"
	.balign 4, 0
sKey_setpdr:
	.asciz "\\setpdr\\"
	.balign 4, 0
sFmt_StrUnderscoreT_Int:
	.asciz "%s_t%d"
	.balign 4, 0
sFmt_StrUnderscoreInt:
	.asciz "%s_%d"
	.balign 4, 0
sStr_gti2GetChallenge:
	.asciz "gti2GetChallenge"
	.balign 4, 0
sStr_3b8dd8995f7c40a9a5c5b7dd5b481341:
	.asciz "3b8dd8995f7c40a9a5c5b7dd5b481341"
	.balign 4, 0
sStr_buffer:
	.asciz "buffer"
	.balign 4, 0
sStr_Gt2AuthC:
	.asciz "gt2Auth.c"
	.balign 4, 0
sStr_gti2BufferShorten:
	.asciz "gti2BufferShorten"
	.balign 4, 0
sStr_gti2BufferWriteData:
	.asciz "gti2BufferWriteData"
	.balign 4, 0
sStr_gti2BufferWriteByte:
	.asciz "gti2BufferWriteByte"
	.balign 4, 0
sStr_gti2BufferWriteUShort:
	.asciz "gti2BufferWriteUShort"
	.balign 4, 0
sStr_BufferLenLtBufferSize:
	.asciz "buffer->len < buffer->size"
	.balign 4, 0
sStr_Gt2BufferC:
	.asciz "gt2Buffer.c"
	.balign 4, 0
sStr_BufferLen2_LeBufferSize:
	.asciz "(buffer->len + 2) <= buffer->size"
	.balign 4, 0
sStr_BufferLenLenLeBufferSize:
	.asciz "(buffer->len + len) <= buffer->size"
	.balign 4, 0
sStr_StartLeBufferLen:
	.asciz "start <= buffer->len"
	.balign 4, 0
sStr_ShortenByLeBufferLenStart:
	.asciz "shortenBy <= (buffer->len - start)"
	.balign 4, 0
sStr_gti2DumpCallback:
	.asciz "gti2DumpCallback"
	.balign 4, 0
sStr_gti2PingCallback:
	.asciz "gti2PingCallback"
	.balign 4, 0
sStr_gti2ClosedCallback:
	.asciz "gti2ClosedCallback"
	.balign 4, 0
sStr_gti2ReceivedCallback:
	.asciz "gti2ReceivedCallback"
	.balign 4, 0
sStr_gti2ConnectedCallback:
	.asciz "gti2ConnectedCallback"
	.balign 4, 0
sStr_gti2SendFilterCallback:
	.asciz "gti2SendFilterCallback"
	.balign 4, 0
sStr_gti2SocketErrorCallback:
	.asciz "gti2SocketErrorCallback"
	.balign 4, 0
sStr_gti2ReceiveFilterCallback:
	.asciz "gti2ReceiveFilterCallback"
	.balign 4, 0
sStr_gti2ConnectAttemptCallback:
	.asciz "gti2ConnectAttemptCallback"
	.balign 4, 0
sStr_gti2UnrecognizedMessageCallback:
	.asciz "gti2UnrecognizedMessageCallback"
	.balign 4, 0
sStr_socket:
	.asciz "socket"
	.balign 4, 0
sStr_Gt2CallbackC:
	.asciz "gt2Callback.c"
	.balign 4, 0
sStr_SocketAndConnection:
	.asciz "socket && connection"
	.balign 4, 0
sStr_connection:
	.asciz "connection"
	.balign 4, 0
sStr_gt2SetConnectionData:
	.asciz "gt2SetConnectionData"
	.balign 4, 0
sStr_gt2GetConnectionData:
	.asciz "gt2GetConnectionData"
	.balign 4, 0
sStr_Gt2MainC:
	.asciz "gt2Main.c"
	.balign 4, 0
sStr_connection_2:
	.asciz "connection"
	.balign 4, 0
sStr_gti2EndReliableMessage:
	.asciz "gti2EndReliableMessage"
	.balign 4, 0
sStr_time_2:
	.asciz "time"
	.balign 4, 0
gti2ProtocolMagic:
	.byte 0xFE, 0xFE, 0x00, 0x00
sStr_LenGt0_2:
	.asciz "len > 0"
	.balign 4, 0
sStr_Gt2MessageC:
	.asciz "gt2Message.c"
	.balign 4, 0
sStr_gt2StringToAddress:
	.asciz "gt2StringToAddress"
	.balign 4, 0
sFmt_StrColonInt:
	.asciz "%s:%d"
	.balign 4, 0
sFmt_Str_2:
	.asciz "%s"
	.balign 4, 0
sFmt_ColonInt:
	.asciz ":%d"
	.balign 4, 0
sStr_LenLtGTI2_STACK_HOSTLEN_MAX:
	.asciz "len < GTI2_STACK_HOSTLEN_MAX"
	.balign 4, 0
sStr_Gt2UtilityC:
	.asciz "gt2Utility.c"
	.balign 4, 0
sStr_Empty_10:
	.asciz ""
	.balign 4, 0
NNMagicData:
	.byte 0xFD, 0xFC, 0x1E, 0x66, 0x6A, 0xB2, 0x00, 0x00
sFmt_StrDotStr:
	.asciz "%s.%s"
	.balign 4, 0
sStr_Natneg1_GsNintendowifiNet:
	.asciz "natneg1.gs.nintendowifi.net"
	.balign 4, 0
sStr_Natneg2_GsNintendowifiNet:
	.asciz "natneg2.gs.nintendowifi.net"
	.balign 4, 0
current_rec:
	.word static_qr2_rec
static_qr2_rec:
	.byte 0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00
sFmt_MasterGsNintendowifiNet:
	.asciz "%s.master.gs.nintendowifi.net"
	.balign 4, 0
sStr_NoChallengeValueWasReceivedFromTheMasterServer:
	.asciz "No challenge value was received from the master server."
	.balign 4, 0
sFmt_Int_4:
	.asciz "%d"
	.balign 4, 0
sStr_255_Dot255_Dot255_Dot255:
	.asciz "255.255.255.255"
	.balign 4, 0
sFmt_HexHex_2:
	.asciz "%08X%04X"
	.balign 4, 0
sStr_unknown:
	.asciz "unknown"
	.balign 4, 0
sStr_Empty_11:
	.asciz ""
	.balign 4, 0
sFmt_StrInt:
	.asciz "%s%d"
	.balign 4, 0
sStr_FinalQueryid1_1:
	.asciz "final\\\\queryid\\1.1"
	.balign 4, 0
sFmt_Localip:
	.asciz "localip%d"
	.balign 4, 0
sStr_localport:
	.asciz "localport"
	.balign 4, 0
sStr_natneg:
	.asciz "natneg"
	.balign 4, 0
sStr_1_4:
	.asciz "1"
	.balign 4, 0
sStr_0_6:
	.asciz "0"
	.balign 4, 0
sStr_statechanged:
	.asciz "statechanged"
	.balign 4, 0
sStr_gamename:
	.asciz "gamename"
	.balign 4, 0
sStr_publicip:
	.asciz "publicip"
	.balign 4, 0
sStr_publicport:
	.asciz "publicport"
	.balign 4, 0
sStr_Empty_12:
	.asciz ""
	.balign 4, 0
sStr_pid_:
	.asciz "pid_"
	.balign 4, 0
sStr_ping_:
	.asciz "ping_"
	.balign 4, 0
sStr_team_:
	.asciz "team_"
	.balign 4, 0
sStr_score_:
	.asciz "score_"
	.balign 4, 0
sStr_team_t:
	.asciz "team_t"
	.balign 4, 0
sStr_skill_:
	.asciz "skill_"
	.balign 4, 0
sStr_groupid:
	.asciz "groupid"
	.balign 4, 0
sStr_deaths_:
	.asciz "deaths_"
	.balign 4, 0
sStr_gamever:
	.asciz "gamever"
	.balign 4, 0
sStr_player_:
	.asciz "player_"
	.balign 4, 0
sStr_score_t:
	.asciz "score_t"
	.balign 4, 0
sStr_mapname:
	.asciz "mapname"
	.balign 4, 0
sStr_gamename_2:
	.asciz "gamename"
	.balign 4, 0
sStr_hostport:
	.asciz "hostport"
	.balign 4, 0
sStr_password:
	.asciz "password"
	.balign 4, 0
sStr_gametype:
	.asciz "gametype"
	.balign 4, 0
sStr_numteams:
	.asciz "numteams"
	.balign 4, 0
sStr_gamemode:
	.asciz "gamemode"
	.balign 4, 0
sStr_teamplay:
	.asciz "teamplay"
	.balign 4, 0
sStr_hostname:
	.asciz "hostname"
	.balign 4, 0
sStr_fraglimit:
	.asciz "fraglimit"
	.balign 4, 0
sStr_timelimit:
	.asciz "timelimit"
	.balign 4, 0
sStr_roundtime:
	.asciz "roundtime"
	.balign 4, 0
sStr_numplayers_2:
	.asciz "numplayers"
	.balign 4, 0
sStr_maxplayers_2:
	.asciz "maxplayers"
	.balign 4, 0
sStr_gamevariant:
	.asciz "gamevariant"
	.balign 4, 0
sStr_timeelapsed:
	.asciz "timeelapsed"
	.balign 4, 0
sStr_roundelapsed:
	.asciz "roundelapsed"
	.balign 4, 0
sStr_teamfraglimit:
	.asciz "teamfraglimit"
	.balign 4, 0
qr2_registered_key_list:
	.word sStr_Empty_12
	.word sStr_hostname
	.word sStr_gamename_2
	.word sStr_gamever
	.word sStr_hostport
	.word sStr_mapname
	.word sStr_gametype
	.word sStr_gamevariant
	.word sStr_numplayers_2
	.word sStr_numteams
	.word sStr_maxplayers_2
	.word sStr_gamemode
	.word sStr_teamplay
	.word sStr_fraglimit
	.word sStr_teamfraglimit
	.word sStr_timeelapsed
	.word sStr_timelimit
	.word sStr_roundtime
	.word sStr_roundelapsed
	.word sStr_password
	.word sStr_groupid
	.word sStr_player_
	.word sStr_score_
	.word sStr_skill_
	.word sStr_ping_
	.word sStr_team_
	.word sStr_deaths_
	.word sStr_pid_
	.word sStr_team_t
	.word sStr_score_t
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
	.byte 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
sStr_BasicInfo:
	.asciz "\\basic\\\\info\\"
	.balign 4, 0
sKey_status_2:
	.asciz "\\status\\"
	.balign 4, 0
sKey_final_8:
	.asciz "\\final\\"
	.balign 4, 0

sStr_final:
	.asciz "final"
	.balign 4, 0

sStr_queryid:
	.asciz "queryid"
	.balign 4, 0
sStr_SBServerGetStringValueA:
	.asciz "SBServerGetStringValueA"
	.balign 4, 0
sFmt_Int_5:
	.asciz "%d"
	.balign 4, 0
sStr_server:
	.asciz "server"
	.balign 4, 0
sStr_SbServerC:
	.asciz "sb_server.c"
	.balign 4, 0
sStr_ping:
	.asciz "ping"
	.balign 4, 0
sStr_Empty_13:
	.asciz ""
	.balign 4, 0
sFmt_StrInt_2:
	.asciz "%s%d"
	.balign 4, 0
sFmt_BackslashStr:
	.asciz "\\%s"
	.balign 4, 0
sbQueryErrorPrefix:
	.word sStr_QueryError
sStr_SBReleaseStr:
	.asciz "SBReleaseStr"
	.balign 4, 0
sStr_QueryError:
	.asciz "Query Error: "
	.balign 4, 0
sStr_AllKeysPresent:
	.asciz "AllKeysPresent"
	.balign 4, 0
sStr_SBServerListInit:
	.asciz "SBServerListInit"
	.balign 4, 0
sStr_ProcessAdHocData:
	.asciz "ProcessAdHocData"
	.balign 4, 0
sStr_ProcessMainListData:
	.asciz "ProcessMainListData"
	.balign 4, 0
sStr_SBServerListConnectAndQuery:
	.asciz "SBServerListConnectAndQuery"
	.balign 4, 0
sStr_Empty_14:
	.asciz ""
	.balign 4, 0
sStr_ValNeNULL:
	.asciz "val != NULL"
	.balign 4, 0
sStr_SbServerlistC:
	.asciz "sb_serverlist.c"
	.balign 4, 0
sStr_SlistNeNULL:
	.asciz "slist != NULL"
	.balign 4, 0
sStr_CallbackNeNULL:
	.asciz "callback != NULL"
	.balign 4, 0
sFmt_MsGsNintendowifiNet:
	.asciz "%s.ms%d.gs.nintendowifi.net"
	.balign 4, 0
sStr_SlistStateEqSlDisconnected:
	.asciz "slist->state == sl_disconnected"
	.balign 4, 0
sStr_0_7:
	.asciz "0"
	.balign 4, 0
sbInvalidServerIp:
	.byte 0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00
sStr_InlenGe0:
	.asciz "inlen >= 0"
	.balign 4, 0
sStr_SlistInbufferlenGe0:
	.asciz "slist->inbufferlen >= 0"
	.balign 4, 0

