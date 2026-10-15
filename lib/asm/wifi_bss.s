	.include "asm/macros.inc"
	.include "wifi.inc"
	.include "global.inc"
	.public gSocSoclConfig
	.public gSocInetNtoABuffer
	.public gSocHostName
	.public gCpsState
	.public gCpsAlloc
	.public gSoclNetmask
	.public gSoclGateway
	.public gCpsFree
	.public gSoclHostAddress
	.public gCpsDnsServers
	.public gCpsRandom
	.public gCpsArpCache
	.public gCpsArpCacheTick
	.public gCpsDhcpSocket
	.public _021D4720
	.public gCpsRstSocket
	.public gCpsScavengerThread
	.public gCpsTcpipThread
	.public gCpsFragments
	.public gCpsMacAddress
	.public gCpsTcpSendHeader
	.public gCpsDhcpSendBuffer
	.public gCpsDhcpPacket
	.public gCpsDhcpRecvBuffer
	.public gCpsTcpipStack
	.public gCpsSslRandomState
	.public gCpsSslSessionCache
	.public gCpsSslRandomPool
	.public gCpsSslRandomPoolLast
	.public gWcmWork
	.public gWcmCpsif
	.public gWcmCpsifSendQueue
	.public gWcmCpsifMutex
	.public gWcmRssiCount
	.public gWcmRssi
	.bss
gSocSoclConfig: ; 0x021D44D4
	.space 0x38

gSocInetNtoABuffer: ; 0x021D450C
	.space 0x10

gSocHostName: ; 0x021D451C
	.space 0x104

gCpsState: ; 0x021D4620
	.space 0x14

gCpsAlloc: ; 0x021D4634
	.space 0x8

gSoclNetmask: ; 0x021D463C
	.space 0x10

gSoclGateway: ; 0x021D464C
	.space 0x14

gCpsFree: ; 0x021D4660
	.space 0x10

	.public gSoclHostAddress
gSoclHostAddress: ; 0x021D4670
	.space 0x10

gCpsDnsServers: ; 0x021D4680
	.space 0x8

gCpsRandom: ; 0x021D4688
	.space 0x18

gCpsArpCache: ; 0x021D46A0
	.space 0xA

gCpsArpCacheTick: ; 0x021D46AA
	.space 0x56

gCpsDhcpSocket: ; 0x021D4700
	.space 0x20

_021D4720: ; 0x021D4720
	.space 0x44

gCpsRstSocket: ; 0x021D4764
	.space 0x64

gCpsScavengerThread: ; 0x021D47C8
	.space 0xC0

gCpsTcpipThread: ; 0x021D4888
	.space 0xC0

gCpsFragments: ; 0x021D4948
	.space 0x1C0

gCpsMacAddress: ; 0x021D4B08
	.space 0x2A

gCpsTcpSendHeader: ; 0x021D4B32
	.space 0x1A

gCpsDhcpSendBuffer: ; 0x021D4B4C
	.space 0x2A

gCpsDhcpPacket: ; 0x021D4B76
	.space 0x156

gCpsDhcpRecvBuffer: ; 0x021D4CCC
	.space 0x994

gCpsTcpipStack: ; 0x021D5660
	.space 0x800

gCpsSslRandomState: ; 0x021D5E60
	.space 0x8

gCpsSslSessionCache: ; 0x021D5E68
	.space 0x170

gCpsSslRandomPool: ; 0x021D5FD8
	.space 0x13

gCpsSslRandomPoolLast: ; 0x021D5FEB
	.space 0x1

gWcmWork: ; 0x021D5FEC
	.space 0x4

gWcmCpsif: ; 0x021D5FF0
	.space 0x4

gWcmCpsifSendQueue: ; 0x021D5FF4
	.space 0x8

gWcmCpsifMutex: ; 0x021D5FFC
	.space 0x20

gWcmRssiCount: ; 0x021D601C
	.space 0x4

gWcmRssi: ; 0x021D6020
	.space 0x20

