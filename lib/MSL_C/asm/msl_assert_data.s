	.public __local_str__msl_assertion_failed
	.extern __msl_assertion_failed
	.include "asm/macros.inc"
	.include "MSL_Common_assert.inc"
	.include "global.inc"

	.data

__local_str__msl_assertion_failed: ; 0x021110B0
	.asciz "Assertion (%s) failed in \"%s\", function \"%s\", line %d\n"
	.size __local_str__msl_assertion_failed,.-__local_str__msl_assertion_failed
	.balign 4, 0

.text
	exception __msl_assertion_failed, 0x003D, 0x00200100
