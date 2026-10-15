	.extern __sys_alloc
	.extern __sys_free
	.include "asm/macros.inc"
	.include "MSL_ARM_pool_alloc_NITRO.inc"
	.include "global.inc"

.text
	exception __sys_alloc, 0x0019, 0x00000000
	exception __sys_free, 0x0019, 0x00000000
