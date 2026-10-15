	.public buff_ptr$6E40
	.public strptr$6E44
	.public wstr$6DE4
	.public wstr$6DF0
	.public wstr$6DFC
	.public wstr$6E08
	.public wstr$6E10
	.public wstr$6E18
	.public wstr$6E24
	.public wstr$6E30
	.public wstr$6E38
	.extern __wStringWrite
	.extern __wpformatter
	.extern double2hex__wide
	.extern float2str__wide
	.extern long2str__wide
	.extern longlong2str__wide
	.extern swprintf
	.extern vswprintf
	.include "asm/macros.inc"
	.include "MSL_Common_wprintf.inc"
	.include "global.inc"

	.data

wstr$6DE4: ; 0x02111364
	; L"0x0p0"
	.short 0x0030, 0x0078, 0x0030, 0x0070, 0x0030, 0x0000

wstr$6DF0: ; 0x02111370
	; L"-INF"
	.short 0x002D, 0x0049, 0x004E, 0x0046, 0x0000, 0x0000

wstr$6DFC: ; 0x0211137C
	; L"-inf"
	.short 0x002D, 0x0069, 0x006E, 0x0066, 0x0000, 0x0000

wstr$6E08: ; 0x02111388
	; L"INF"
	.short 0x0049, 0x004E, 0x0046, 0x0000

wstr$6E10: ; 0x02111390
	; L"inf"
	.short 0x0069, 0x006E, 0x0066, 0x0000

wstr$6E18: ; 0x02111398
	; L"-NAN"
	.short 0x002D, 0x004E, 0x0041, 0x004E, 0x0000, 0x0000

wstr$6E24: ; 0x021113A4
	; L"-nan"
	.short 0x002D, 0x006E, 0x0061, 0x006E, 0x0000, 0x0000

wstr$6E30: ; 0x021113B0
	; L"NAN"
	.short 0x004E, 0x0041, 0x004E, 0x0000

wstr$6E38: ; 0x021113B8
	.short 0x006E, 0x0061, 0x006E, 0x0000

buff_ptr$6E40: ; 0x021113C0
	.short 0x0000, 0x0000

strptr$6E44: ; 0x021113C4
	.asciz ""

.text
	exception long2str__wide, 0x0251, 0x0090FF20
	exception longlong2str__wide, 0x0301, 0x00A0FF20
	exception double2hex__wide, 0x0399, 0x00F07F20
	exception float2str__wide, 0x064C, float2str__wide_exception
	exception __wpformatter, 0x08F0, __wpformatter_exception
	exception __wStringWrite, 0x0041, 0x00200300
	exception swprintf, 0x0029, 0x00300020
	exception vswprintf, 0x0071, 0x00300300

	.section .exception,4,1,2

float2str__wide_exception: ; 0x020F4F9C
	.byte 0x20, 0xFF, 0x09, 0x60, 0x00, 0x00, 0x00, 0x00
__wpformatter_exception: ; 0x020F4FA4
	.byte 0x20, 0xFF, 0x11, 0x68, 0x00, 0x00, 0x00, 0x00
