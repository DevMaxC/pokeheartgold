	.include "asm/macros.inc"
	.include "overlay_13_arm_2.inc"
	.include "global.inc"
	.public gWifiSetupButtonBar
	.public gWifiSetupMessageShown
	.public gWifiSetupLocalizedPath
	.public gWifiSetupCursorBlocks
	.public gWifiSetupBackgroundScreen
	.bss
gWifiSetupButtonBar: ; 0x0224F468
	.space 0x4

gWifiSetupMessageShown: ; 0x0224F46C
	.space 0x4

gWifiSetupLocalizedPath: ; 0x0224F470
	.space 0x40

gWifiSetupCursorBlocks: ; 0x0224F4B0
	.space 0x4

gWifiSetupBackgroundScreen: ; 0x0224F4B4
	.space 0x4

