	.public parse_format$f
	.extern __sformatter
	.extern sscanf
	.extern vsscanf
	.include "asm/macros.inc"
	.include "MSL_Common_scanf.inc"
	.include "global.inc"

	.rodata

parse_format$f: ; 0x0210E604
	.word 0x00000000
	.word 0x7FFFFFFF
	.word 0x00000000
	.word 0x00000000
	.word 0x00000000
	.word 0x00000000
	.word 0x00000000
	.word 0x00000000
	.word 0x00000000
	.word 0x00000000
	.size parse_format$f,.-parse_format$f

.text
	exception __sformatter, 0x0D54, __sformatter_exception
	exception vsscanf, 0x0055, 0x00200000
	exception sscanf, 0x0029, 0x00300020

	.section .exception,4,1,2

__sformatter_exception: ; 0x020F4F8C
	.byte 0x00, 0xFF, 0x01, 0xB0, 0x00, 0x00, 0x00, 0x00
