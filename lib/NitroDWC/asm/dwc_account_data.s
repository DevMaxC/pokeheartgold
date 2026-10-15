	.include "asm/macros.inc"
	.include "dwcaccount.inc"
	.include "global.inc"

	.public gDwcAccBase32Digits
	.public gDwcAccUserNameFormat
.text
	.data

gDwcAccBase32Digits:
	.asciz "0123456789abcdefghijklmnopqrstuv"
	.balign 4, 0
gDwcAccUserNameFormat:
	.asciz "%s%c%c%c%c%s"
