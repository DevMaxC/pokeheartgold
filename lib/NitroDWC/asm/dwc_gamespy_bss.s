	.include "asm/macros.inc"
	.include "overlay_00_arm.inc"
	.include "global.inc"
	.public GSIACHostname
	.public __GSIACGamename
	.public ov00_0221B1AC
	.public ov00_0221B1B4
	.public ov00_0221B1C4
	.public ov00_0221B1D8
	.public ov00_0221B1F0
	.public ov00_0221B1F8
	.public gPersistWork
	.public ov00_0221B230
	.public gDwcGameName
	.public gDwcSecretKey
	.public gti2ClosingSocket
	.public gti2AddressStringIndex
	.public gti2AddressStrings
	.public nnNegotiatorList
	.public nnRecvBuffer
	.public num_local_ips
	.public local_ip_list
	.public qr2_hostname
	.public qr2_query_buffer
	.public sbServerGlobals
	.public sbNoServer
	.public sbListGlobals
	.bss
GSIACHostname:
	.space 0x40

__GSIACGamename:
	.space 0x40

ov00_0221B1AC:
	.space 0x8

ov00_0221B1B4:
	.space 0x10

ov00_0221B1C4:
	.space 0x14

ov00_0221B1D8:
	.space 0x18

ov00_0221B1F0:
	.space 0x8

ov00_0221B1F8:
	.space 0x8

gPersistWork:
	.space 0x30

ov00_0221B230:
	.space 0x200

gDwcGameName:
	.space 0x100

gDwcSecretKey:
	.space 0x100

gti2ClosingSocket:
	.space 0x4

gti2AddressStringIndex:
	.space 0x4

gti2AddressStrings:
	.space 0x2C

nnNegotiatorList:
	.space 0x14

nnRecvBuffer:
	.space 0x200

num_local_ips:
	.space 0x4

local_ip_list:
	.space 0x14

qr2_hostname:
	.space 0x40

qr2_query_buffer:
	.space 0x100

sbServerGlobals:
	.space 0x4

sbNoServer:
	.space 0x8

sbListGlobals:
	.space 0x8
