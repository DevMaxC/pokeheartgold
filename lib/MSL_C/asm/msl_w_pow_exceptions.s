	.extern pow
	.include "asm/macros.inc"
	.include "MSL_DPMath_w_pow.inc"
	.include "global.inc"

.text
	exception pow, 0x000D, 0x00000000
