	.extern nan
	.include "asm/macros.inc"
	.include "MSL_ARM_math.inc"
	.include "global.inc"

.text
	exception nan, 0x0019, 0x00000000
