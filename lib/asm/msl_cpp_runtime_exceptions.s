	.include "asm/macros.inc"
	.include "msl.inc"
	.include "global.inc"
	.extern _Z16HandleUnexpectedP12ThrowContextP13ExceptionInfoP16ex_specificationPc
	.extern _Z20FindExceptionHandlerP12ThrowContextP13ExceptionInfoPl
	.extern _Z14__ThrowHandlerP12ThrowContext
	.extern __end__catch
	.extern _ZNSt13bad_exceptionD0Ev
	.extern _ZSt17__throw_bad_allocv
	.extern _Znwm
	.extern _ZnwmRKSt9nothrow_t
	.extern _ZdlPv
	.extern _Znam
	.extern _ZnamRKSt9nothrow_t
	.extern _ZdaPv
	.extern _ZNSt9bad_allocD0Ev
	.extern __call_static_initializers
	.extern __destroy_global_chain
	.extern _ZNKSt9type_infoeqERKS_
	.extern _ZN10__cxxabiv117__class_type_infoD1Ev
	.extern _ZN10__cxxabiv117__class_type_infoD0Ev
	.extern _ZN10__cxxabiv117__class_type_infoD2Ev
	.extern _ZN10__cxxabiv120__si_class_type_infoD1Ev
	.extern _ZN10__cxxabiv120__si_class_type_infoD0Ev
	.extern _ZSt9dthandlerv
	.extern _ZSt9duhandlerv
	.extern _ZSt9terminatev
	.extern _ZSt10unexpectedv
	.extern _Z16__SetupFrameInfoP12ThrowContextP13ExceptionInfo
	.extern _Z16__SkipUnwindInfoPc
	.extern _ExitProcess

.text
	exception _Z20FindExceptionHandlerP12ThrowContextP13ExceptionInfoPl, 0x01DC, _020F5034
	exception _Z14__ThrowHandlerP12ThrowContext, 0x00ED, 0x00700300
	exception __end__catch, 0x0029, 0x00100000
	exception _ZNSt13bad_exceptionD0Ev, 0x0015, 0x00100100
	exception _ZSt17__throw_bad_allocv, 0x0041, 0x00100000
	exception _Znwm, 0x0064, _020F503C
	exception _ZnwmRKSt9nothrow_t, 0x0044, _020F5054
	exception _ZdlPv, 0x0015, 0x00100000
	exception _Znam, 0x002C, _020F5070
	exception _ZnamRKSt9nothrow_t, 0x002C, _020F5088
	exception _ZdaPv, 0x000D, 0x00000000
	exception _ZNSt9bad_allocD0Ev, 0x0015, 0x00100100
	exception __call_static_initializers, 0x002D, 0x00100100
	exception __destroy_global_chain, 0x0045, 0x00200300
	exception _ZNKSt9type_infoeqERKS_, 0x0031, 0x00100000
	exception _ZN10__cxxabiv117__class_type_infoD1Ev, 0x0015, 0x00100100
	exception _ZN10__cxxabiv117__class_type_infoD0Ev, 0x001D, 0x00100100
	exception _ZN10__cxxabiv117__class_type_infoD2Ev, 0x0015, 0x00100100
	exception _ZN10__cxxabiv120__si_class_type_infoD1Ev, 0x0015, 0x00100100
	exception _ZN10__cxxabiv120__si_class_type_infoD0Ev, 0x001D, 0x00100100
	exception _ZSt9dthandlerv, 0x000D, 0x00000000
	exception _ZSt9duhandlerv, 0x000D, 0x00000000
	exception _ZSt9terminatev, 0x0019, 0x00100000
	exception _ZSt10unexpectedv, 0x0019, 0x00100000
	exception _Z16__SetupFrameInfoP12ThrowContextP13ExceptionInfo, 0x00A1, 0x00200700
	exception _Z16__SkipUnwindInfoPc, 0x0031, 0x00200100
	exception _ExitProcess, 0x000D, 0x00000000

	.section .exception,4,1,2

_020F5034:
	.byte 0x00, 0xFF, 0x01, 0xC8, 0x00, 0x00, 0x00, 0x00
_020F503C:
	.byte 0x40, 0x87, 0x60, 0x00
	.byte 0x40, 0x40, 0x16, 0x28, 0x00, 0x26, 0x00, 0x8F, 0x02, 0x98, 0x00, 0x60, 0x17, 0x11, 0x02, 0x8D
	.byte 0x00, 0x00, 0x00, 0x00
_020F5054:
	.byte 0x40, 0x80, 0x70, 0x00, 0x28, 0x00, 0x1C, 0x20, 0x00, 0x2A, 0x28, 0x00
	.byte 0x32, 0x00, 0x0C, 0x00, 0x00, 0x00, 0x00, 0x38, 0x30, 0x8F, 0x00, 0x60, 0x00, 0x8D, 0x00, 0x00
_020F5070:
	.byte 0x40, 0x80, 0x40, 0x00, 0x20, 0x00, 0x16, 0x20, 0x00, 0x26, 0x00, 0x8F, 0x02, 0x30, 0x00, 0x60
	.byte 0x17, 0x11, 0x02, 0x8D, 0x00, 0x00, 0x00, 0x00
_020F5088:
	.byte 0x40, 0x80, 0x40, 0x00, 0x20, 0x00, 0x16, 0x20
	.byte 0x00, 0x1E, 0x00, 0x8F, 0x00, 0x30, 0x00, 0x8D, 0x00, 0x00, 0x00, 0x00
