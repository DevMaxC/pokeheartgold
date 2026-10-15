	.extern wmemcpy
	.include "asm/macros.inc"
	.include "MSL_Common_wmem.inc"
	.include "global.inc"

.text
	exception wmemcpy, 0x0011, 0x00000000
