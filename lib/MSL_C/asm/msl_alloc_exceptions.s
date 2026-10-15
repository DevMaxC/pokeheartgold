	.extern free
	.extern malloc
	.include "asm/macros.inc"
	.include "MSL_Common_alloc.inc"
	.include "global.inc"

.text
	exception malloc, 0x0019, 0x00100000
	exception free, 0x0015, 0x00100000
