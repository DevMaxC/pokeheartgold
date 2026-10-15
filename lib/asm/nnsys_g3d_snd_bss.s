	.include "asm/macros.inc"
	.include "nnsys.inc"
	.include "global.inc"
	.extern AllocPlttVram_
	.extern AllocTexVram_
	.extern AllocatorAllocForExpHeap
	.extern AllocatorAllocForSDKHeap
	.extern AllocatorFreeForExpHeap
	.extern AllocatorFreeForSDKHeap
	.extern ClearArea1D
	.extern ClearAreaLine
	.extern ClearContinuous
	.extern ClearLine
	.extern CpuLoadOAMMain_
	.extern CpuLoadOAMSub_
	.extern DoTransfer2dBG0CharMain
	.extern DoTransfer2dBG0CharSub
	.extern DoTransfer2dBG0ScrMain
	.extern DoTransfer2dBG0ScrSub
	.extern DoTransfer2dBG1CharMain
	.extern DoTransfer2dBG1CharSub
	.extern DoTransfer2dBG1ScrMain
	.extern DoTransfer2dBG1ScrSub
	.extern DoTransfer2dBG2BmpMain
	.extern DoTransfer2dBG2BmpSub
	.extern DoTransfer2dBG2CharMain
	.extern DoTransfer2dBG2CharSub
	.extern DoTransfer2dBG2ScrMain
	.extern DoTransfer2dBG2ScrSub
	.extern DoTransfer2dBG3BmpMain
	.extern DoTransfer2dBG3BmpSub
	.extern DoTransfer2dBG3CharMain
	.extern DoTransfer2dBG3CharSub
	.extern DoTransfer2dBG3ScrMain
	.extern DoTransfer2dBG3ScrSub
	.extern DoTransfer2dBGExtPlttMain
	.extern DoTransfer2dBGExtPlttSub
	.extern DoTransfer2dBGPlttMain
	.extern DoTransfer2dBGPlttSub
	.extern DoTransfer2dObjCharMain
	.extern DoTransfer2dObjCharSub
	.extern DoTransfer2dObjExtPlttMain
	.extern DoTransfer2dObjExtPlttSub
	.extern DoTransfer2dObjOamMain
	.extern DoTransfer2dObjOamSub
	.extern DoTransfer2dObjPlttMain
	.extern DoTransfer2dObjPlttSub
	.extern DoTransfer3dClearImageColor
	.extern DoTransfer3dClearImageDepth
	.extern DoTransfer3dTex
	.extern DoTransfer3dTexPltt
	.extern DrawGlyph1D
	.extern DrawGlyphLine
	.extern FreePlttVram_
	.extern FreeTexVram_
	.extern NNSi_G3dAnmBlendJnt
	.extern NNSi_G3dAnmBlendMat
	.extern NNSi_G3dAnmBlendVis
	.extern NNSi_G3dAnmCalcNsBca
	.extern NNSi_G3dAnmCalcNsBma
	.extern NNSi_G3dAnmCalcNsBta
	.extern NNSi_G3dAnmCalcNsBtp
	.extern NNSi_G3dAnmCalcNsBva
	.extern NNSi_G3dAnmObjInitNsBca
	.extern NNSi_G3dAnmObjInitNsBma
	.extern NNSi_G3dAnmObjInitNsBta
	.extern NNSi_G3dAnmObjInitNsBtp
	.extern NNSi_G3dAnmObjInitNsBva
	.extern NNSi_G3dFuncSbc_BB
	.extern NNSi_G3dFuncSbc_BBY
	.extern NNSi_G3dFuncSbc_CALLDL
	.extern NNSi_G3dFuncSbc_ENVMAP
	.extern NNSi_G3dFuncSbc_MAT
	.extern NNSi_G3dFuncSbc_MAT_InternalDefault
	.extern NNSi_G3dFuncSbc_MTX
	.extern NNSi_G3dFuncSbc_NODE
	.extern NNSi_G3dFuncSbc_NODEDESC
	.extern NNSi_G3dFuncSbc_NODEMIX
	.extern NNSi_G3dFuncSbc_NOP
	.extern NNSi_G3dFuncSbc_POSSCALE
	.extern NNSi_G3dFuncSbc_PRJMAP
	.extern NNSi_G3dFuncSbc_RET
	.extern NNSi_G3dFuncSbc_SHP
	.extern NNSi_G3dFuncSbc_SHP_InternalDefault
	.extern NNSi_G3dGetJointScaleBasic
	.extern NNSi_G3dGetJointScaleMaya
	.extern NNSi_G3dGetJointScaleSi3d
	.extern NNSi_G3dSendJointSRTBasic
	.extern NNSi_G3dSendJointSRTMaya
	.extern NNSi_G3dSendJointSRTSi3d
	.extern NNSi_G3dSendTexSRT3dsMax
	.extern NNSi_G3dSendTexSRTMaya
	.extern NNSi_G3dSendTexSRTSi3d
	.extern NNSi_G3dSendTexSRTXsi
	.extern texmtxCalc_flagRS_
	.extern texmtxCalc_flagRS___3dsmax
	.extern texmtxCalc_flagRS___xsi
	.extern texmtxCalc_flagR_
	.extern texmtxCalc_flagR___3dsmax
	.extern texmtxCalc_flagR___xsi
	.extern texmtxCalc_flagS_
	.extern texmtxCalc_flagS___3dsmax
	.extern texmtxCalc_flagS___xsi
	.extern texmtxCalc_flagTRS_
	.extern texmtxCalc_flagTRS___3dsmax
	.extern texmtxCalc_flagTRS___xsi
	.extern texmtxCalc_flagTR_
	.extern texmtxCalc_flagTR___3dsmax
	.extern texmtxCalc_flagTR___xsi
	.extern texmtxCalc_flagTS_
	.extern texmtxCalc_flagTS___3dsmax
	.extern texmtxCalc_flagTS___xsi
	.extern texmtxCalc_flagT_
	.extern texmtxCalc_flagT___3dsmax
	.extern texmtxCalc_flagT___xsi
	.extern texmtxCalc_flag_
	.extern texmtxCalc_flag___3dsmax
	.extern texmtxCalc_flag___xsi
	.public gCurrentRenderState
	.public gMatAnmResultBuffer
	.public gScaleCache
	.public gScaleCacheScaleY
	.public gScaleCacheScaleZ
	.public gScaleCacheInvScale
	.public gScaleCacheInvScaleY
	.public gScaleCacheInvScaleZ
	.public gEvpMtxCache
	.public gEvpMtxCacheFirstDirMtx
	.public gGeBufferState
	.public gGeBufferStateIsLocked
	.public gSndMainState
	.public gSndMainPreSleepCallback
	.public gSndMainPostSleepCallback
	.public gSndDriverInfo
	.public gSndResourceMgr
	.public gSndWaveOuts
	.public gSndFreeSeqPlayerList
	.public gSndSeqPlayerPrioList
	.public gSndSeqPlayers
	.public gSndPlayerInfo
	.public gSndPlayerInfoNumPlaying
	.public gSndPlayerInfoPlayableSeqCount
	.public gSndPlayerInfoAllocChBitFlag
	.public gSndPlayerInfoVolume
	.public gSndStrmListInitialized
	.public gSndStrmList
	.public gSndStrmCallbackBuffers
	.public gSndStrmChannels
	.public gSndCaptureWork
	.public gSndCaptureMsgQueue
	.public gSndCaptureState
	.public gSndCurrentArc
	.bss
gCurrentRenderState:
	.space 0x4

	.public gMatAnmResultBuffer
gMatAnmResultBuffer:
	.space 0xE00

	.public gScaleCache
gScaleCache:
	.space 0x4

	.public gScaleCacheScaleY
gScaleCacheScaleY:
	.space 0x4

	.public gScaleCacheScaleZ
gScaleCacheScaleZ:
	.space 0x4

	.public gScaleCacheInvScale
gScaleCacheInvScale:
	.space 0x4

	.public gScaleCacheInvScaleY
gScaleCacheInvScaleY:
	.space 0x4

	.public gScaleCacheInvScaleZ
gScaleCacheInvScaleZ:
	.space 0x5EC

	.public gEvpMtxCache
gEvpMtxCache:
	.space 0x40

	.public gEvpMtxCacheFirstDirMtx
gEvpMtxCacheFirstDirMtx:
	.space 0x18C0

	.public gGeBufferState
gGeBufferState:
	.space 0x4

	.public gGeBufferStateIsLocked
gGeBufferStateIsLocked:
	.space 0x18

	.public gSndMainState
gSndMainState:
	.space 0x10

	.public gSndMainPreSleepCallback
gSndMainPreSleepCallback:
	.space 0xC

	.public gSndMainPostSleepCallback
gSndMainPostSleepCallback:
	.space 0x24

	.public gSndDriverInfo
gSndDriverInfo:
	.space 0x23C0

	.public gSndResourceMgr
gSndResourceMgr:
	.space 0xC

	.public gSndWaveOuts
gSndWaveOuts:
	.space 0x140

	.public gSndFreeSeqPlayerList
gSndFreeSeqPlayerList:
	.space 0xC

	.public gSndSeqPlayerPrioList
gSndSeqPlayerPrioList:
	.space 0xC

	.public gSndSeqPlayers
gSndSeqPlayers:
	.space 0x440

	.public gSndPlayerInfo
gSndPlayerInfo:
	.space 0x8

	.public gSndPlayerInfoNumPlaying
gSndPlayerInfoNumPlaying:
	.space 0x10

	.public gSndPlayerInfoPlayableSeqCount
gSndPlayerInfoPlayableSeqCount:
	.space 0x4

	.public gSndPlayerInfoAllocChBitFlag
gSndPlayerInfoAllocChBitFlag:
	.space 0x4

	.public gSndPlayerInfoVolume
gSndPlayerInfoVolume:
	.space 0x460

	.public gSndStrmListInitialized
gSndStrmListInitialized:
	.space 0x4

	.public gSndStrmList
gSndStrmList:
	.space 0xC

	.public gSndStrmCallbackBuffers
gSndStrmCallbackBuffers:
	.space 0x40

	.public gSndStrmChannels
gSndStrmChannels:
	.space 0x80

	.public gSndCaptureWork
gSndCaptureWork:
	.space 0x8

	.public gSndCaptureMsgQueue
gSndCaptureMsgQueue:
	.space 0x40

	.public gSndCaptureState
gSndCaptureState:
	.space 0x5B4

	.public gSndCurrentArc
gSndCurrentArc:
	.space 0x4

	.public gSndWaveArcHeader
