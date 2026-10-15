	.extern _ftell
	.extern fseek
	.extern ftell
	.extern rewind
	.extern _fseek
	.public _ftell
	.public ftell
	.public fseek
	.public rewind
	.include "asm/macros.inc"
	.include "MSL_Common_file_pos.inc"
	.include "global.inc"

.text
	exception ftell, 0x011D, 0x00300F00
	exception _fseek, 0x01E9, 0x00400320
	exception fseek, 0x012D, 0x00403F00
	exception rewind, 0x0025, 0x00100100
