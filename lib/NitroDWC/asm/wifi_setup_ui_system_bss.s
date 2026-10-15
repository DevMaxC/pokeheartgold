	.include "asm/macros.inc"
	.include "overlay_13_arm_2.inc"
	.include "global.inc"
	.public gWifiSetupBanner
	.public ov13_0224F5B0
	.public gWifiSetupUsbScan
	.public gWifiSetupDialog
	.public gWifiSetupMbParent
	.public gWifiSetupWh
	.public gWifiSetupShare
	.public gWifiSetupArchive
	.public gWifiSetupOamBlockManager
	.public gWifiSetupOamTemplateFiles
	.public gWifiSetupFades
	.public gWifiSetupText
	.public gWifiSetupHeap
	.public gWifiSetupInput
	.public ov13_0224F5EC
	.public gWifiSetupInputHoldFrames
	.public gWifiSetupIrqSave
	.public gWifiSetupOamBuffer
	.public gWifiSetupCharVram
	.public gWifiSetupSavedVramBanks
	.public gWifiSetupTaskQueues
	.bss
gWifiSetupBanner: ; 0x0224F5AC
	.space 0x4

ov13_0224F5B0: ; 0x0224F5B0
	.space 0x4

gWifiSetupUsbScan: ; 0x0224F5B4
	.space 0x4

gWifiSetupDialog: ; 0x0224F5B8
	.space 0x4

gWifiSetupMbParent: ; 0x0224F5BC
	.space 0x4

gWifiSetupWh: ; 0x0224F5C0
	.space 0x8

gWifiSetupShare: ; 0x0224F5C8
	.space 0x4

gWifiSetupArchive: ; 0x0224F5CC
	.space 0x4

gWifiSetupOamBlockManager: ; 0x0224F5D0
	.space 0x4

gWifiSetupOamTemplateFiles: ; 0x0224F5D4
	.space 0x8

gWifiSetupFades: ; 0x0224F5DC
	.space 0x4

gWifiSetupText: ; 0x0224F5E0
	.space 0x4

gWifiSetupHeap: ; 0x0224F5E4
	.space 0x4

gWifiSetupInput: ; 0x0224F5E8
	.space 0x4

ov13_0224F5EC: ; 0x0224F5EC
	.space 0x4

gWifiSetupInputHoldFrames: ; 0x0224F5F0
	.space 0x10

gWifiSetupIrqSave: ; 0x0224F600
	.space 0x8

gWifiSetupOamBuffer: ; 0x0224F608
	.space 0x4

gWifiSetupCharVram: ; 0x0224F60C
	.space 0x4

gWifiSetupSavedVramBanks: ; 0x0224F610
	.space 0x34

gWifiSetupTaskQueues: ; 0x0224F644
	.space 0x1c
