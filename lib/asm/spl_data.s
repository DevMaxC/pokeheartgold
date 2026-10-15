	.public gSplDrawPlaneFuncs
	.public gSplRotateFuncs
	.public gSplAxisY
	.public spl_rndm_seed
	.extern drawXYPlane
	.extern drawXZPlane
	.extern rotTypeXYZ
	.extern rotTypeY
	.include "asm/macros.inc"
	.include "jn_spl.inc"
	.include "global.inc"

	.bss

spl_rndm_seed:
	.space 0x4

.text
	.data

gSplDrawPlaneFuncs:
	.word drawXYPlane
	.word drawXZPlane
gSplRotateFuncs:
	.word rotTypeY
	.word rotTypeXYZ
gSplAxisY:
	.short 0, 0x1000, 0
	.balign 4, 0
