	.public _021116E8
	.public sStr_StdBadException
	.public sStr_StdExceptionStdBadException
	.public _02111734
	.public sStr_bad_alloc
	.public sStr_StdExceptionStdBadAlloc
	.public _021117E4
	.public _021117F4
	.public gMslExceptionHandlers
	.public _ZSt13__new_handler
	.public _ZSt7nothrow
	.public _ZTVSt9bad_alloc
	.public _ZZNKSt13bad_exception4whatEvEs
	.public __global_destructor_chain
	.extern _02111504
	.extern _ExitProcess
	.extern _Z10NextActionP14ActionIterator
	.extern _Z11UnwindStackP12ThrowContextP13ExceptionInfoPc
	.extern _Z14__ThrowHandlerP12ThrowContext
	.extern _Z16HandleUnexpectedP12ThrowContextP13ExceptionInfoP16ex_specificationPc
	.extern _Z16__SetupFrameInfoP12ThrowContextP13ExceptionInfo
	.extern _Z16__SkipUnwindInfoPc
	.extern _Z17IsInSpecificationPcP16ex_specification
	.extern _Z19FindExceptionRecordPcP13ExceptionInfo
	.extern _Z20FindExceptionHandlerP12ThrowContextP13ExceptionInfoPl
	.extern _Z23FindMostRecentExceptionP12ThrowContextP13ExceptionInfo
	.extern _ZN10__cxxabiv117__class_type_infoD0Ev
	.extern _ZN10__cxxabiv117__class_type_infoD1Ev
	.extern _ZN10__cxxabiv117__class_type_infoD2Ev
	.extern _ZN10__cxxabiv120__si_class_type_infoD0Ev
	.extern _ZN10__cxxabiv120__si_class_type_infoD1Ev
	.extern _ZNKSt13bad_exception4whatEv
	.extern _ZNKSt9bad_alloc4whatEv
	.extern _ZNKSt9type_infoeqERKS_
	.extern _ZNSt13bad_exceptionD0Ev
	.extern _ZNSt13bad_exceptionD1Ev
	.extern _ZNSt9bad_allocD0Ev
	.extern _ZNSt9bad_allocD1Ev
	.extern _ZSt10unexpectedv
	.extern _ZSt17__throw_bad_allocv
	.extern _ZSt9dthandlerv
	.extern _ZSt9duhandlerv
	.extern _ZSt9terminatev
	.extern _ZdaPv
	.extern _ZdlPv
	.extern _Znam
	.extern _ZnamRKSt9nothrow_t
	.extern _Znwm
	.extern _ZnwmRKSt9nothrow_t
	.extern __call_static_initializers
	.extern __destroy_global_chain
	.extern __end__catch
	.extern __read_console
	.extern __unexpected
	.extern __write_console
	.extern OSi_ThreadInfo
	.type OSi_ThreadInfo, @function
	.extern __sinit__
	.type __sinit__, @function
	.include "asm/macros.inc"
	.include "msl.inc"
	.include "global.inc"

	.bss
_ZSt7nothrow:
	.space 0x4

_ZSt13__new_handler:
	.space 0x4

__global_destructor_chain: ; 0x021E58E8
	.space 4

.text
	.data

	.balign 4, 0
_021116B0:
	.word _021117E4
	.word sStr_St13bad_exception
	.word _02111504
_ZZNKSt13bad_exception4whatEvEs:
	.asciz "bad_exception"
	.balign 4, 0
sStr_St13bad_exception:
	.asciz "St13bad_exception"
	.balign 4, 0
_021116E0:
	.word 0
	.word _021116B0
_021116E8:
	.word _ZNSt13bad_exceptionD1Ev
	.word _ZNSt13bad_exceptionD0Ev
	.word _ZNKSt13bad_exception4whatEv
sStr_StdBadException:
	.asciz "!std::bad_exception!!"
	.balign 4, 0
sStr_StdExceptionStdBadException:
	.asciz "!std::exception!!std::bad_exception!!"
	.balign 4, 0
_02111734:
	.byte 1
	.balign 4, 0
sStr_bad_alloc:
	.asciz "bad_alloc"
	.balign 4, 0
_02111744:
	.word _021117E4
	.word sStr_St9bad_alloc
	.word _02111504
sStr_St9bad_alloc:
	.asciz "St9bad_alloc"
	.balign 4, 0
sStr_StdBadAlloc:
	.asciz "!std::bad_alloc!"
	.balign 4, 0
_02111774:
	.word 0
	.word _02111744
_ZTVSt9bad_alloc:
	.word _ZNSt9bad_allocD1Ev
	.word _ZNSt9bad_allocD0Ev
	.word _ZNKSt9bad_alloc4whatEv
sStr_StdExceptionStdBadAlloc:
	.asciz "!std::exception!!std::bad_alloc!!"
	.balign 4, 0
_021117AC:
	.word _021117F4
	.word sStr_St9type_info
_021117B4:
	.word _021117E4
	.word sStr_N10__cxxabiv120__si_class_type_infoE
	.word _021117C0
_021117C0:
	.word _021117E4
	.word sStr_N10__cxxabiv117__class_type_infoE
	.word _021117AC
sStr_St9type_info:
	.asciz "St9type_info"
	.balign 4, 0
_021117DC:
	.word 0
	.word _021117B4
_021117E4:
	.word _ZN10__cxxabiv120__si_class_type_infoD1Ev
	.word _ZN10__cxxabiv120__si_class_type_infoD0Ev
	.word 0
	.word _021117C0
_021117F4:
	.word _ZN10__cxxabiv117__class_type_infoD1Ev
	.word _ZN10__cxxabiv117__class_type_infoD0Ev
sStr_N10__cxxabiv117__class_type_infoE:
	.asciz "N10__cxxabiv117__class_type_infoE"
	.balign 4, 0
sStr_N10__cxxabiv120__si_class_type_infoE:
	.asciz "N10__cxxabiv120__si_class_type_infoE"
	.balign 4, 0
gMslExceptionHandlers:
	.word _ZSt9dthandlerv
	.word _ZSt9duhandlerv

	exception __read_console, 0x0051, 0x00300F00
	exception __write_console, 0x0035, 0x00200700
	exception _Z19FindExceptionRecordPcP13ExceptionInfo, 0x0109, 0x00503F00
	exception _Z10NextActionP14ActionIterator, 0x0388, _020F4FF8

	.section .exception,4,1,2
	; MSL symbols have exceptions for C++ mode, even when compiling C.

_020F4FF8:
	.byte 0x00, 0x03, 0x01, 0xB0, 0x00, 0x00, 0x00, 0x00
