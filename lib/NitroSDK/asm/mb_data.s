	.extern _start_AutoloadDoneCallback
	.public MBi_defaultLoadSegList
	.public _02245980
	.public gMbParentChildRecvMask
	.public bsendBuff
	.public mbc
	.public mbi_seg_header
	.public sStr_rom
	.public ov13_0224598C
	.public ov13_02247484
	.public gMbBeaconState
	.public gMbGlobalState
	.public gMbChildScanParam
	.public gMbTaskWork
	.public ov13_0224CF84
	.include "asm/macros.inc"
	.include "mb.inc"
	.include "global.inc"

	.public _start_AutoloadDoneCallback

.text
	.rodata

MBi_defaultLoadSegList:
	.word 2
	.word 0
	.word 1

mbi_seg_header_default:
	.word 0x00004000, 0x00001000
	.word 0x00007000, 0x00001000
	.word 0x00000000, 0x00000000

	.data

_02245980:
	.byte 0xFF, 0x00, 0x00, 0x00

mbi_seg_header: ; 0x02245984
	.word mbi_seg_header_default

sStr_rom: ; 0x02245988
	.asciz "rom"
	.balign 4, 0

	.bss

gMbParentChildRecvMask:
	.space 0x4

ov13_02247484: ; 0x02247484
	.space 0x1C

gMbBeaconState: ; 0x022474A0
	.space 0x40

bsendBuff: ; 0x022474E0
	.space 0x5A60

gMbGlobalState: ; 0x0224CF40
	.space 0xC

mbc: ; 0x0224CF4C
	.space 0x14

gMbChildScanParam: ; 0x0224CF60
	.space 0x20

gMbTaskWork: ; 0x0224CF80
	.space 0x4

ov13_0224CF84: ; 0x0224CF84
	.space 0x14
