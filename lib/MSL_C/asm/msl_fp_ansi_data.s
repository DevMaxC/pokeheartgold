	.public digit_values
	.public fp_str$6E88
	.public fp_str$6EB8
	.public fp_str$6EE0
	.public fp_str$6EF8
	.public fp_str$6F08
	.public fp_str$6F10
	.public fp_str$6F18
	.public fp_str$6F20
	.public fp_str$6F28
	.public fp_str$6F2C
	.public fp_str$6F30
	.public fp_str$6F34
	.public fp_str$6F38
	.public fp_str$6F3C
	.public fp_str$6F40
	.public fp_str$6F44
	.public fp_str$6F48
	.public fp_str$6F4C
	.public fp_str$6F50
	.public fp_str$6F54
	.public fp_str$6F58
	.public fp_str$6F5C
	.extern __dec2num
	.extern __num2dec
	.extern __num2dec_internal
	.extern __rounddec
	.extern __str2dec
	.extern __timesdec
	.extern __two_exp
	.extern __ull2dec
	.public digit_values
	.public fp_str$6E88
	.public fp_str$6EB8
	.public fp_str$6EE0
	.public fp_str$6EF8
	.public fp_str$6F08
	.public fp_str$6F10
	.public fp_str$6F18
	.public fp_str$6F20
	.public fp_str$6F28
	.public fp_str$6F2C
	.public fp_str$6F30
	.public fp_str$6F34
	.public fp_str$6F38
	.public fp_str$6F3C
	.public fp_str$6F40
	.public fp_str$6F44
	.public fp_str$6F48
	.public fp_str$6F4C
	.public fp_str$6F50
	.public fp_str$6F54
	.public fp_str$6F58
	.public fp_str$6F5C
	.include "asm/macros.inc"
	.include "MSL_fp_ansi.inc"
	.include "global.inc"

	.data

digit_values: ; 0x021113C8
	.word 0x00000000, 0x40240000
	.word 0x00000000, 0x40590000
	.word 0x00000000, 0x408F4000
	.word 0x00000000, 0x40C38800
	.word 0x00000000, 0x40F86A00
	.word 0x00000000, 0x412E8480
	.word 0x00000000, 0x416312D0
	.word 0x00000000, 0x4197D784

fp_str$6E88: ; 0x02111408
	.asciz "542101086242752217003726400434970855712890625"

	.balign 4, 0
fp_str$6EB8: ; 0x02111438
	.asciz "11102230246251565404236316680908203125"

	.balign 4, 0
fp_str$6EE0: ; 0x02111460
	.asciz "23283064365386962890625"

	.balign 4, 0
fp_str$6EF8: ; 0x02111478
	.asciz "152587890625"

	.balign 4, 0
fp_str$6F08: ; 0x02111488
	.asciz "390625"

	.balign 4, 0
fp_str$6F10: ; 0x02111490
	.asciz "78125"

	.balign 4, 0
fp_str$6F18: ; 0x02111498
	.asciz "15625"

	.balign 4, 0
fp_str$6F20: ; 0x021114A0
	.asciz "3125"

	.balign 4, 0
fp_str$6F28: ; 0x021114A8
	.asciz "625"

	.balign 4, 0
fp_str$6F2C: ; 0x021114AC
	.asciz "125"

	.balign 4, 0
fp_str$6F30: ; 0x021114B0
	.asciz "25"

	.balign 4, 0
fp_str$6F34: ; 0x021114B4
	.asciz "5"

	.balign 4, 0
fp_str$6F38: ; 0x021114B8
	.asciz "1"

	.balign 4, 0
fp_str$6F3C: ; 0x021114BC
	.asciz "2"

	.balign 4, 0
fp_str$6F40: ; 0x021114C0
	.asciz "4"

	.balign 4, 0
fp_str$6F44: ; 0x021114C4
	.asciz "8"

	.balign 4, 0
fp_str$6F48: ; 0x021114C8
	.asciz "16"

	.balign 4, 0
fp_str$6F4C: ; 0x021114CC
	.asciz "32"

	.balign 4, 0
fp_str$6F50: ; 0x021114D0
	.asciz "64"

	.balign 4, 0
fp_str$6F54: ; 0x021114D4
	.asciz "128"

	.balign 4, 0
fp_str$6F58: ; 0x021114D8
	.asciz "256"

	.balign 4, 0
fp_str$6F5C: ; 0x021114DC
	.asciz "179769313486231580793728714053034151"

.text
	exception __rounddec, 0x0041, 0x00200300
	exception __ull2dec, 0x00CD, 0x0050FF00
	exception __timesdec, 0x0185, 0x00D0FF00
	exception __str2dec, 0x009D, 0x00100000
	exception __two_exp, 0x0385, 0x00B00300
	exception __num2dec_internal, 0x0181, 0x00E01F00
	exception __num2dec, 0x00A9, 0x00200300
	exception __dec2num, 0x0624, __dec2num_exception

	.section .exception,4,1,2

__dec2num_exception:
	.byte 0x00, 0xFF, 0x05, 0x20, 0x00, 0x00, 0x00, 0x00
