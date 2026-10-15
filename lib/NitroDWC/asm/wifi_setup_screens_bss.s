	.include "asm/macros.inc"
	.include "overlay_13_arm_2.inc"
	.include "global.inc"
	.public gWifiSetupClientStatus
	.public gWifiSetupTextBank
	.public gWifiSetupTopMenu
	.public gWifiSetupEraseConfirmed
	.public gWifiSetupOptions
	.public gWifiSetupTransferResult
	.public gWifiSetupTransferIntroProceed
	.public gWifiSetupTransferCancelledTimer
	.public ov13_0224F520
	.public ov13_0224F524
	.public gWifiSetupTransferWaitResult
	.public gWifiSetupAoss
	.public gWifiSetupAossDoneTimer
	.public gWifiSetupListScreen
	.public ov13_0224F53C
	.public gWifiSetupTextEntry
	.public gWifiSetupAddressEntry
	.public gWifiSetupErrorCode
	.public gWifiSetupSettings
	.public ov13_0224F554
	.public gWifiSetupAutoConnectDone
	.public gWifiSetupAutoReceiveDone
	.public gWifiSetupAutoDoneTimer
	.public gWifiSetupAutoSearchDone
	.public gWifiSetupApScanScreen
	.public gWifiSetupConnectionList
	.public ov13_0224F570
	.public gWifiSetupMethodMenu
	.public gWifiSetupConnectionTestPassed
	.public gWifiSetupConnectionOkTimer
	.public gWifiSetupUsbConnectorDoneTimer
	.public gWifiSetupUsbConnectorIntroNext
	.public gWifiSetupUsbConnectorExit
	.bss
gWifiSetupClientStatus: ; 0x0224F4F4
	.space 0x4

gWifiSetupTextBank: ; 0x0224F4F8
	.space 0x4

gWifiSetupTopMenu: ; 0x0224F4FC
	.space 0x8

gWifiSetupEraseConfirmed: ; 0x0224F504
	.space 0x4

gWifiSetupOptions: ; 0x0224F508
	.space 0xC

gWifiSetupTransferResult: ; 0x0224F514
	.space 0x4

gWifiSetupTransferIntroProceed: ; 0x0224F518
	.space 0x4

gWifiSetupTransferCancelledTimer: ; 0x0224F51C
	.space 0x4

ov13_0224F520: ; 0x0224F520
	.space 0x4

ov13_0224F524: ; 0x0224F524
	.space 0x4

gWifiSetupTransferWaitResult: ; 0x0224F528
	.space 0x4

gWifiSetupAoss: ; 0x0224F52C
	.space 0x8

gWifiSetupAossDoneTimer: ; 0x0224F534
	.space 0x4

gWifiSetupListScreen: ; 0x0224F538
	.space 0x4

ov13_0224F53C: ; 0x0224F53C
	.space 0x4

gWifiSetupTextEntry: ; 0x0224F540
	.space 0x4

gWifiSetupAddressEntry: ; 0x0224F544
	.space 0x4

gWifiSetupErrorCode: ; 0x0224F548
	.space 0x4

gWifiSetupSettings: ; 0x0224F54C
	.space 0x8

ov13_0224F554: ; 0x0224F554
	.space 0x4

gWifiSetupAutoConnectDone: ; 0x0224F558
	.space 0x4

gWifiSetupAutoReceiveDone: ; 0x0224F55C
	.space 0x4

gWifiSetupAutoDoneTimer: ; 0x0224F560
	.space 0x4

gWifiSetupAutoSearchDone: ; 0x0224F564
	.space 0x4

gWifiSetupApScanScreen: ; 0x0224F568
	.space 0x4

gWifiSetupConnectionList: ; 0x0224F56C
	.space 0x4

ov13_0224F570: ; 0x0224F570
	.space 0x4

gWifiSetupMethodMenu: ; 0x0224F574
	.space 0x8

gWifiSetupConnectionTestPassed: ; 0x0224F57C
	.space 0x4

gWifiSetupConnectionOkTimer: ; 0x0224F580
	.space 0x4

gWifiSetupUsbConnectorDoneTimer: ; 0x0224F584
	.space 0x4

gWifiSetupUsbConnectorIntroNext: ; 0x0224F588
	.space 0x4

gWifiSetupUsbConnectorExit: ; 0x0224F58C
	.space 0x4

