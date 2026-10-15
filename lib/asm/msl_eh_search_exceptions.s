	.include "asm/macros.inc"
	.include "msl.inc"
	.include "global.inc"
	.extern _Z23FindMostRecentExceptionP12ThrowContextP13ExceptionInfo
	.extern _Z17IsInSpecificationPcP16ex_specification

.text
	exception _Z23FindMostRecentExceptionP12ThrowContextP13ExceptionInfo, 0x0154, _020F5010
	exception _Z17IsInSpecificationPcP16ex_specification, 0x0085, 0x00401F00

	.section .exception,4,1,2

_020F5010:
	.byte 0x00, 0x03, 0x01, 0x98, 0x00, 0x00, 0x00, 0x00
