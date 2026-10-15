	.public strtok_ns
	.include "asm/macros.inc"
#include <nitro/fs/overlay.h>
	.include "global.inc"

	.data

strtok_string: ; 0x02111358
	.asciz ""
	.balign 4

strtok_ns: ; 0x0211135C
	.word strtok_string
	.word strtok_string

.text
