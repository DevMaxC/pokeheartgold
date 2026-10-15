	.include "asm/macros.inc"
	.include "libVCT.inc"
	.include "global.inc"
	.public gVctControl
	.public __vct
	.bss
gVctControl: ; 0x021D848C
	.space 0xC

__vct: ; 0x021D8498
	.space 0x18

