	.extern fclose
	.extern fflush
	.include "asm/macros.inc"
	.include "MSL_Common_file_io.inc"
	.include "global.inc"

.text
	exception fclose, 0x0075, 0x00200300
	exception fflush, 0x00E9, 0x00100100
