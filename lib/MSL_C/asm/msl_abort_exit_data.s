	.public __atexit_funcs
	.public __console_exit
	.extern __exit
	.extern abort
	.extern exit
	.public __console_exit
	.public __stdio_exit
	.public __atexit_curr_func
	.public __aborting
	.public __atexit_funcs
	.include "asm/macros.inc"
	.include "MSL_ARM_abort_exit.inc"
	.include "global.inc"

	.bss

__console_exit: ; 0x021E5390
	.space 0x4
	.size __console_exit,.-__console_exit

__stdio_exit: ; 0x021E5394
	.space 0x4
	.size __stdio_exit,.-__stdio_exit

__atexit_curr_func: ; 0x021E5398
	.space 0x4
	.size __atexit_curr_func,.-__atexit_curr_func

__aborting: ; 0x021E539C
	.space 0x4
	.size __aborting,.-__aborting

__atexit_funcs:
	.space 0x100
	.size __atexit_funcs,.-__atexit_funcs

.text
	exception abort, 0x0025, 0x00100000
	exception exit, 0x004D, 0x00100100
	exception __exit, 0x0129, 0x00200300
