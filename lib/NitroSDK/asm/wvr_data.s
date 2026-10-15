	.public wvrLockId
	.include "asm/macros.inc"
	.include "wvr.inc"
	.include "global.inc"

	.bss

wvrLockId:
	.space 2

wvrVRam:
	.space 2

wvrArg:
	.space 4

wvrCallback:
	.space 4

.text
