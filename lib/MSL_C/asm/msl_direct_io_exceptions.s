	.extern fread
	.extern __fread
	.extern __fwrite
	.extern fread
	.include "asm/macros.inc"
	.include "MSL_Common_direct_io.inc"
	.include "global.inc"

.text
	exception fread, 0x010D, 0x00407F00
	exception __fread, 0x0349, 0x00507F00
	exception __fwrite, 0x02B1, 0x0060FF00
