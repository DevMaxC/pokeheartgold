	.extern scalbn
	.include "asm/macros.inc"
	.include "MSL_math.inc"
	.include "global.inc"

.text
	exception scalbn, 0x002D, 0x00200100
