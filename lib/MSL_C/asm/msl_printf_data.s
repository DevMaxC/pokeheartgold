	.public __pformatter_empty_string_1
	.public __pformatter_empty_string_2
	.public printf_double2hex_0p0
	.public printf_double2hex_inf_lower
	.public printf_double2hex_inf_upper
	.public printf_double2hex_nan_lower
	.public printf_double2hex_nan_upper
	.public printf_double2hex_neg_inf_lower
	.public printf_double2hex_neg_inf_upper
	.public printf_double2hex_neg_nan_lower
	.public printf_double2hex_neg_nan_upper
	.extern __FileWrite
	.extern __StringWrite
	.extern __pformatter
	.extern double2hex
	.extern float2str
	.extern long2str
	.extern longlong2str
	.extern printf
	.extern snprintf
	.extern sprintf
	.extern vsnprintf
	.extern vsprintf
	.include "asm/macros.inc"
	.include "MSL_Common_printf.inc"
	.include "global.inc"

	.data

	.balign 4, 0
printf_double2hex_0p0: ; 0x02111314
	.asciz "0x0p0"
	.size printf_double2hex_0p0,.-printf_double2hex_0p0

	.balign 4, 0
printf_double2hex_neg_inf_upper: ; 0x0211131C
	.asciz "-INF"
	.size printf_double2hex_neg_inf_upper,.-printf_double2hex_neg_inf_upper

	.balign 4, 0
printf_double2hex_neg_inf_lower: ; 0x02111324
	.asciz "-inf"
	.size printf_double2hex_neg_inf_lower,.-printf_double2hex_neg_inf_lower

	.balign 4, 0
printf_double2hex_inf_upper: ; 0x0211132C
	.asciz "INF"
	.size printf_double2hex_inf_upper,.-printf_double2hex_inf_upper

	.balign 4, 0
printf_double2hex_inf_lower: ; 0x02111330
	.asciz "inf"
	.size printf_double2hex_inf_lower,.-printf_double2hex_inf_lower

	.balign 4, 0
printf_double2hex_neg_nan_upper: ; 0x02111334
	.asciz "-NAN"
	.size printf_double2hex_neg_nan_upper,.-printf_double2hex_neg_nan_upper

	.balign 4, 0
printf_double2hex_neg_nan_lower: ; 0x0211133C
	.asciz "-nan"
	.size printf_double2hex_neg_nan_lower,.-printf_double2hex_neg_nan_lower

	.balign 4, 0
printf_double2hex_nan_upper: ; 0x02111344
	.asciz "NAN"
	.size printf_double2hex_nan_upper,.-printf_double2hex_nan_upper

	.balign 4, 0
printf_double2hex_nan_lower: ; 0x02111348
	.asciz "nan"
	.size printf_double2hex_nan_lower,.-printf_double2hex_nan_lower

	.balign 4, 0
__pformatter_empty_string_1: ; 0x0211134C
	.asciz ""
	.size __pformatter_empty_string_1,.-__pformatter_empty_string_1

	.balign 4, 0
__pformatter_empty_string_2: ; 0x02111350
	.asciz ""
	.size __pformatter_empty_string_2,.-__pformatter_empty_string_2

	.balign 4, 0
.text
	exception long2str, 0x024D, 0x0090FF20
	exception longlong2str, 0x02FD, 0x00A0FF20
	exception double2hex, 0x04DD, 0x00F07F20
	exception float2str, 0x0765, 0x00C0FF20
	exception __pformatter, 0x0824, __pformatter_exception
	exception __FileWrite, 0x002D, 0x00200300
	exception __StringWrite, 0x0045, 0x00200300
	exception printf, 0x0119, 0x00300120
	exception vsnprintf, 0x0069, 0x00300300
	exception vsprintf, 0x0019, 0x00000000
	exception snprintf, 0x0029, 0x00300020
	exception sprintf, 0x002D, 0x00300020

	.section .exception,4,1,2

__pformatter_exception: ; 0x020F4F84
	.byte 0x20, 0xFF, 0x09, 0x60, 0x00, 0x00, 0x00, 0x00
