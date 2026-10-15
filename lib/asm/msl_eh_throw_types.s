	.include "asm/macros.inc"
	.include "msl.inc"
	.include "global.inc"
	.public _ExitProcess
	.public _Z17__TransferControlP12ThrowContextP13ExceptionInfoPc
	.public __rethrow
	.public __throw
	.extern _Z14__ThrowHandlerP12ThrowContext
	.extern sys_exit
	.type _Z17__TransferControlP12ThrowContextP13ExceptionInfoPc, @function
	.type __throw, @function
	.type __rethrow, @function
	.type _ExitProcess, @function

.text
