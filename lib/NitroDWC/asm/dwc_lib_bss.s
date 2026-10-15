	.include "asm/macros.inc"
	.include "overlay_00_arm.inc"
	.include "global.inc"
	.extern BucketSetValue
	.extern BucketAdd
	.extern BucketSub
	.extern BucketMult
	.extern BucketDiv
	.extern BucketConcat
	.extern BucketAvg
	.extern BucketIntOp
	.extern BucketDoubleOp
	.extern BucketStringOp
	.extern TeamBucketIntOp
	.extern TeamBucketDoubleOp
	.extern TeamBucketStringOp
	.extern PlayerBucketIntOp
	.extern PlayerBucketDoubleOp
	.extern PlayerBucketStringOp
	.public gDwcControl
	.public gDwcGt2Connections
	.public gDwcGt2ConnectionInfo
	.public gDwcLogin
	.public gDwcFriends
	.public gDwcMatch
	.public gDwcMatchKeys
	.public ov00_0221A949
	.public ov00_0221A94A
	.public ov00_0221A94C
	.public ov00_0221A950
	.public gDwcValidAidList
	.public gDwcTransport
	.public DWCi_GHTTPRequestList
	.public DWCi_AC_Globals
	.public DWCi_Beacon_Work
	.public DWCi_Beacon_ApSearch
	.bss
gDwcControl:
	.space 0x8

gDwcGt2Connections:
	.space 0x80

gDwcGt2ConnectionInfo:
	.space 0x100

gDwcLogin:
	.space 0xC

gDwcFriends:
	.space 0x10

gDwcMatch:
	.space 0x20

gDwcMatchKeys:
	.space 0x1

ov00_0221A949:
	.space 0x1

ov00_0221A94A:
	.space 0x2

ov00_0221A94C:
	.space 0x4

ov00_0221A950:
	.space 0x730

gDwcValidAidList:
	.space 0x20

gDwcTransport:
	.space 0x4

DWCi_GHTTPRequestList:
	.space 0x8

DWCi_AC_Globals:
	.space 0x14

DWCi_Beacon_Work:
	.space 0x4

DWCi_Beacon_ApSearch:
	.space 0xC
