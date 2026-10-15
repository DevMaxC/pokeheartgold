	.extern atol
	.extern strtol
	.include "asm/macros.inc"
	.include "MSL_Common_strtoul.inc"
	.include "global.inc"

.text
	exception strtol, 0x00C9, 0x00600300
	exception atol, 0x0015, 0x00000000
