	.include "asm/macros.inc"
	.include "MSL_Common_mem.inc"
	.include "global.inc"
	.extern memset
	.text
	exception memset, 0x0015, 0x00100100
