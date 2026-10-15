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
	.public gOamManagerNextId
	.public gOamBuffers
	.public gOamBufferMainOam
	.public gOamBufferMainAffineOwners
	.public gOamBufferSubOamOwners
	.public gOamBufferSubOam
	.public gOamBufferSubAffineOwners
	.public gOamBufferSoftOamOwners
	.public gOamBufferSoftOam
	.public gOamBufferSoftAffineOwners
	.public gRendererWork
	.public gRendererZStack
	.public gRendererMtxCacheRecords
	.public _021D956C
	.public gRendererMtxStack
	.public gRendererMtxStackTransX
	.public gRendererMtxStackTransY
	.public gRendererAffineMtxStack
	.public gRendererMtxCaches
	.public gRendererWorkB00
	.public gRendererCellAnimMtxCaches
	.public gRendererCellAnimMtxCacheTable
	.public gCellTransferStateManager
	.public gOamSoftEmuState
	.public gCurrentRndCore
	.bss
gOamManagerNextId:
	.space 0x4

	.public gOamBuffers
gOamBuffers:
	.space 0x100

	.public gOamBufferMainOam
gOamBufferMainOam:
	.space 0x400

	.public gOamBufferMainAffineOwners
gOamBufferMainAffineOwners:
	.space 0x40

	.public gOamBufferSubOamOwners
gOamBufferSubOamOwners:
	.space 0x100

	.public gOamBufferSubOam
gOamBufferSubOam:
	.space 0x400

	.public gOamBufferSubAffineOwners
gOamBufferSubAffineOwners:
	.space 0x40

	.public gOamBufferSoftOamOwners
gOamBufferSoftOamOwners:
	.space 0x100

	.public gOamBufferSoftOam
gOamBufferSoftOam:
	.space 0x400

	.public gOamBufferSoftAffineOwners
gOamBufferSoftAffineOwners:
	.space 0x40

	.public gRendererWork
gRendererWork:
	.space 0x10

	.public gRendererZStack
gRendererZStack:
	.space 0x80

	.public gRendererMtxCacheRecords
gRendererMtxCacheRecords:
	.space 0x4

	.public _021D956C
_021D956C:
	.space 0xFC

	.public gRendererMtxStack
gRendererMtxStack:
	.space 0x10

	.public gRendererMtxStackTransX
gRendererMtxStackTransX:
	.space 0x4

	.public gRendererMtxStackTransY
gRendererMtxStackTransY:
	.space 0x2EC

	.public gRendererAffineMtxStack
gRendererAffineMtxStack:
	.space 0x300

	.public gRendererMtxCaches
gRendererMtxCaches:
	.space 0x370

	.public gRendererWorkB00
gRendererWorkB00:
	.space 0x90

	.public gRendererCellAnimMtxCaches
gRendererCellAnimMtxCaches:
	.space 0x4

	.public gRendererCellAnimMtxCacheTable
gRendererCellAnimMtxCacheTable:
	.space 0x404

	.public gCellTransferStateManager
gCellTransferStateManager:
	.space 0xC

	.public gOamSoftEmuState
gOamSoftEmuState:
	.space 0x1C

	.public gCurrentRndCore
gCurrentRndCore:
	.space 0x4

	.public NNS_G3dGlb
