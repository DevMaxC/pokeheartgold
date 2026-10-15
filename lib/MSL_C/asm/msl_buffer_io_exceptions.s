	.include "asm/macros.inc"
#include <nitro/fs/overlay.h>
	.include "global.inc"
	.extern __load_buffer
	.extern __flush_buffer
	.text
	exception __load_buffer, 0x008D, 0x00200700
	exception __flush_buffer, 0x0089, 0x00200300
