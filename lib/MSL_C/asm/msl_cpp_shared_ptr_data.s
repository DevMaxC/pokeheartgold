	.public _02111514
	.public _02111540
	.public _02111558
	.public _02111644
	.public _02111658
	.public _ZTVSt11logic_error
	.public _ZTVSt12length_error
	.extern _ZN10Metrowerks8move_ptrIcRNSt6detail14default_deleteIA0_cEEED1Ev
	.extern _ZNKSt3tr16detail18shared_ptr_deleterIcNSt6detail14default_deleteIA0_cEEE11get_deleterERKSt9type_info
	.extern _ZNSt11logic_errorD0Ev
	.extern _ZNSt11logic_errorD1Ev
	.extern _ZNSt12length_errorD0Ev
	.extern _ZNSt12length_errorD1Ev
	.extern _ZNSt15__vector_commonILb1EE18throw_length_errorEv
	.extern _ZNSt3tr110shared_ptrIcEC1IcNSt6detail14default_deleteIA0_cEEEEPT_T0_
	.extern _ZNSt3tr110shared_ptrIcED1Ev
	.extern _ZNSt3tr16detail18shared_ptr_deleterIcNSt6detail14default_deleteIA0_cEEE7disposeEv
	.extern _ZNSt3tr16detail18shared_ptr_deleterIcNSt6detail14default_deleteIA0_cEEED0Ev
	.extern _ZNSt3tr16detail18shared_ptr_deleterIcNSt6detail14default_deleteIA0_cEEED1Ev
	.extern _ZNSt3tr16detail25shared_ptr_deleter_common12release_weakEv
	.extern _ZNSt3tr16detail25shared_ptr_deleter_common7releaseEv
	.extern _ZNSt3tr16detail25shared_ptr_deleter_commonD2Ev
	.extern _ZNSt9exceptionD0Ev
	.extern _ZNSt9exceptionD1Ev
	.extern _ZNSt9exceptionD2Ev
	.public _02111504
	.include "asm/macros.inc"
	.include "MSL_CPP_NITRO_Ai_LE.inc"
	.include "global.inc"

	.data

	; this entire file is a bit of a guess

	.balign 4, 0
_02111504:
	.word _021117F4
	.word sStr_St9exception
_0211150C:
	.word _021117F4
	.word sStr_NSt3tr16detail25shared_ptr_deleter_commonE
_02111514:
	.word _021117F4
	.word sStr_NSt6detail14default_deleteIA0_cEE
_0211151C:
	.word _021117E4
	.word sStr_NSt3tr16detail18shared_ptr_deleterIcNSt6detail14
	.word _0211150C
sStr_St9exception:
	.asciz "St9exception"
	.balign 4, 0
_02111538:
	.word 0
	.word _0211150C
_02111540:
	.word _ZNSt9exceptionD1Ev
	.word _ZNSt9exceptionD0Ev
	.word 0
	.word 0
	.word 0
	.word _0211151C
_02111558:
	.word _ZNSt3tr16detail18shared_ptr_deleterIcNSt6detail14default_deleteIA0_cEEED1Ev
	.word _ZNSt3tr16detail18shared_ptr_deleterIcNSt6detail14default_deleteIA0_cEEED0Ev
	.word _ZNKSt3tr16detail18shared_ptr_deleterIcNSt6detail14default_deleteIA0_cEEE11get_deleterERKSt9type_info
	.word _ZNSt3tr16detail18shared_ptr_deleterIcNSt6detail14default_deleteIA0_cEEE7disposeEv
sStr_NSt6detail14default_deleteIA0_cEE:
	.asciz "NSt6detail14default_deleteIA0_cEE"
	.balign 4, 0
sStr_NSt3tr16detail25shared_ptr_deleter_commonE:
	.asciz "NSt3tr16detail25shared_ptr_deleter_commonE"
	.balign 4, 0
sStr_NSt3tr16detail18shared_ptr_deleterIcNSt6detail14:
	.asciz "NSt3tr16detail18shared_ptr_deleterIcNSt6detail14default_deleteIA0_cEEEE"
	.balign 4, 0
_02111600:
	.word _021117E4
	.word sStr_St11logic_error
	.word _02111504
_0211160C:
	.word _021117E4
	.word sStr_St12length_error
	.word _02111600
sStr_St11logic_error:
	.asciz "St11logic_error"
	.balign 4, 0
sStr_St12length_error:
	.asciz "St12length_error"
	.balign 4, 0
_ZTVSt12length_error:
_0211163C:
	.word 0
	.word _0211160C
_02111644:
	.word _ZNSt12length_errorD1Ev
	.word _ZNSt12length_errorD0Ev
	.word _ZNSt3tr16detail25shared_ptr_deleter_commonD2Ev
_ZTVSt11logic_error:
	.word 0
	.word _02111600
_02111658:
	.word _ZNSt11logic_errorD1Ev
	.word _ZNSt11logic_errorD0Ev
	.word _ZNSt3tr16detail25shared_ptr_deleter_commonD2Ev

.text
	exception _ZNSt3tr110shared_ptrIcEC1IcNSt6detail14default_deleteIA0_cEEEEPT_T0_, 0x0080, _ZNSt3tr110shared_ptrIcEC1IcNSt6detail14default_deleteIA0_cEEEEPT_T0__exception
	exception _ZNSt9exceptionD0Ev, 0x0015, 0x00100100
	exception _ZNKSt3tr16detail18shared_ptr_deleterIcNSt6detail14default_deleteIA0_cEEE11get_deleterERKSt9type_info, 0x0029, 0x00100100
	exception _ZNSt3tr16detail18shared_ptr_deleterIcNSt6detail14default_deleteIA0_cEEE7disposeEv, 0x0011, 0x00000000
	exception _ZNSt3tr110shared_ptrIcED1Ev, 0x0040, _ZNSt3tr110shared_ptrIcED1Ev_exception
	exception _ZN10Metrowerks8move_ptrIcRNSt6detail14default_deleteIA0_cEEED1Ev, 0x0021, 0x00100100
	exception _ZNSt3tr16detail18shared_ptr_deleterIcNSt6detail14default_deleteIA0_cEEED0Ev, 0x0015, 0x00100100
	exception _ZNSt11logic_errorD1Ev, 0x0019, 0x00100100
	exception _ZNSt11logic_errorD0Ev, 0x0021, 0x00100100
	exception _ZNSt12length_errorD1Ev, 0x0019, 0x00100100
	exception _ZNSt12length_errorD0Ev, 0x0021, 0x00100100
	exception _ZNSt3tr16detail25shared_ptr_deleter_common7releaseEv, 0x0031, 0x00100100
	exception _ZNSt3tr16detail25shared_ptr_deleter_common12release_weakEv, 0x002D, 0x00100000

	.section .exception,4,1,2

_ZNSt3tr110shared_ptrIcEC1IcNSt6detail14default_deleteIA0_cEEEEPT_T0__exception:
	.byte 0x20, 0x03, 0x50, 0x58, 0x00, 0x0E, 0x00, 0x82, 0x00, 0xF0, 0x04, 0x0F, 0x02, 0x00, 0x00, 0x00
_ZNSt3tr110shared_ptrIcED1Ev_exception:
	.byte 0x40, 0x81, 0x50, 0x00
	.byte 0x40, 0x00, 0x16, 0x28, 0x00, 0x1E, 0x00, 0x8F, 0x00, 0x58, 0x00, 0x8D, 0x00, 0x00, 0x00, 0x00
