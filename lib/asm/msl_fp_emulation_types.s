	.include "asm/macros.inc"
	.include "msl.inc"
	.include "global.inc"
	.public _d2f
	.public _d_add
	.public _d_div
	.public _d_dtof
	.public _d_dtoi
	.public _d_dtou
	.public _d_dtoull
	.public _d_feq
	.public _d_fge
	.public _d_fgt
	.public _d_fle
	.public _d_flt
	.public _d_fne
	.public _d_itod
	.public _d_mul
	.public _d_sub
	.public _d_utod
	.public _dadd
	.public _ddiv
	.public _deq
	.public _dfix
	.public _dfixu
	.public _dflt
	.public _dfltu
	.public _dgeq
	.public _dgr
	.public _dleq
	.public _dls
	.public _dmul
	.public _dneq
	.public _drdiv
	.public _drsb
	.public _dsqrt
	.public _dsub
	.public _f2d
	.public _f_add
	.public _f_div
	.public _f_feq
	.public _f_fgt
	.public _f_fle
	.public _f_flt
	.public _f_fne
	.public _f_ftod
	.public _f_ftoi
	.public _f_ftou
	.public _f_itof
	.public _f_lltof
	.public _f_mul
	.public _f_qtof
	.public _f_sub
	.public _f_ulltof
	.public _f_utof
	.public _fadd
	.public _fdiv
	.public _feq
	.public _ffix
	.public _ffixu
	.public _fflt
	.public _ffltu
	.public _fgr
	.public _fleq
	.public _fls
	.public _fmul
	.public _fneq
	.public _fp_init
	.public _frdiv
	.public _frsb
	.public _fsub
	.public _ll_div
	.public _ll_mod
	.public _ll_mul
	.public _ll_sdiv
	.public _ll_shl
	.public _ll_sll
	.public _ll_sto_f
	.public _ll_udiv
	.public _ll_ufrom_d
	.public _ll_uto_f
	.public _s32_div_f
	.public _u32_div_f
	.public _u32_div_not_0_f
	.public _ull_div
	.public _ull_mod
	.public _ull_mul
	.public _ull_sll
	.public sys_exit
	.public sys_readc
	.public sys_writec
	.extern errno
	.type _dadd, @function
	.type _d2f, @function
	.type _dfix, @function
	.type _dfixu, @function
	.type _dflt, @function
	.type _dfltu, @function
	.type _dmul, @function
	.type _dsub, @function
	.type _fadd, @function
	.type _dgeq, @function
	.type _dgr, @function
	.type _dleq, @function
	.type _dls, @function
	.type _dneq, @function
	.type _fgr, @function
	.type _fleq, @function
	.type _fls, @function
	.type _feq, @function
	.type _fneq, @function
	.type _fdiv, @function
	.type _f2d, @function
	.type _ffix, @function
	.type _ffixu, @function
	.type _fflt, @function
	.type _ffltu, @function
	.type _f_lltof, @function
	.type _f_ulltof, @function
	.type _fmul, @function
	.type _fsub, @function
	.type _ll_mod, @function
	.type _ll_sdiv, @function
	.type _ll_udiv, @function
	.type _ull_mod, @function
	.type _ll_mul, @function
	.type _s32_div_f, @function
	.type _u32_div_f, @function
	.type _ddiv, @function
	.type _fp_init, @function
	.type _d_add, @function
	.type _d_dtof, @function
	.type _f_qtof, @function
	.type _d_dtoi, @function
	.type _d_dtou, @function
	.type _ll_ufrom_d, @function
	.type _d_dtoull, @function
	.type _d_itod, @function
	.type _d_utod, @function
	.type _d_mul, @function
	.type _dsqrt, @function
	.type _drsb, @function
	.type _d_sub, @function
	.type _f_add, @function
	.type _d_fge, @function
	.type _d_fgt, @function
	.type _d_fle, @function
	.type _d_flt, @function
	.type _deq, @function
	.type _d_feq, @function
	.type _d_fne, @function
	.type _f_fgt, @function
	.type _f_fle, @function
	.type _f_flt, @function
	.type _f_feq, @function
	.type _f_fne, @function
	.type _frdiv, @function
	.type _f_div, @function
	.type _f_ftod, @function
	.type _f_ftoi, @function
	.type _f_ftou, @function
	.type _f_itof, @function
	.type _f_utof, @function
	.type _ll_sto_f, @function
	.type _ll_uto_f, @function
	.type _f_mul, @function
	.type _frsb, @function
	.type _f_sub, @function
	.type _ll_div, @function
	.type _ull_div, @function
	.type _ull_mul, @function
	.type _ll_shl, @function
	.type _ll_sll, @function
	.type _ull_sll, @function
	.type _u32_div_not_0_f, @function
	.type _drdiv, @function
	.type _d_div, @function
	.type sys_writec, @function
	.type sys_readc, @function
	.type sys_exit, @function

.text
