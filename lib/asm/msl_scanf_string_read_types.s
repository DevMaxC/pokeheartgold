	.include "asm/macros.inc"
	.include "MSL_Common_scanf.inc"
	.include "global.inc"
	.public __StringRead
	.public __sformatter
	.extern __float_nan
	.extern __msl_digit
	.extern __strtold
	.extern __strtoul
	.extern __strtoull
	.extern _d2f
	.extern _f2d
	.extern mbtowc
	.extern parse_format$f
	.type __sformatter, @function
	.type __StringRead, @function

.text
