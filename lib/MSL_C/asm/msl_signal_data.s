	.public signal_funcs
	.extern raise
	.public signal_funcs
	.include "asm/macros.inc"
	.include "MSL_Common_signal.inc"
	.include "global.inc"

	.bss

signal_funcs: ; 0x021E58C4
	.space 0x1C
	.size signal_funcs,.-signal_funcs

.text
	exception raise, 0x0131, 0x00200300
