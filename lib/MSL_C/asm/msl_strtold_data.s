	.public model$4434
	.public model$4439
	.extern __strtold
	.extern atod
	.extern strtold
	.include "asm/macros.inc"
	.include "MSL_Common_strtold.inc"
	.include "global.inc"

	.rodata

model$4434: ; 0x0210E62C
	.asciz "NAN("
	.size model$4434,.-model$4434

model$4439: ; 0x0210E631
	.asciz "INFINITY"
	.size model$4439,.-model$4439

.text
	exception __strtold, 0x124C, __strtold_exception
	exception strtold, 0x00E1, 0x00500F00
	exception atod, 0x0011, 0x00000000

	.section .exception,4,1,2

__strtold_exception: ; 0x020F4F94
	.byte 0x00, 0xFF, 0x01, 0xD0, 0x00, 0x00, 0x00, 0x00
