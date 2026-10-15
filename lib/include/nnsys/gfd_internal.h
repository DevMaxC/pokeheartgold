#ifndef POKEHEARTGOLD_NNSYS_GFD_INTERNAL_H
#define POKEHEARTGOLD_NNSYS_GFD_INTERNAL_H

// Types and prototypes shared by the NitroSystem graphics foundation (VRAM manager) modules in
// lib/NitroSystem/src/gfd_*.c that the public headers in nnsys/gfd/ do not declare.

#include <nnsys/gfd.h>

// default (no manager installed) allocators
NNSGfdTexKey AllocTexVram_(u32 szByte, BOOL is4x4comp, u32 opt);
int FreeTexVram_(NNSGfdTexKey key);
NNSGfdPlttKey AllocPlttVram_(u32 szByte, BOOL is4pltt, u32 opt);
int FreePlttVram_(NNSGfdPlttKey key);

// frame texture VRAM manager: one region per VRAM slot, allocated from both ends
typedef struct FrmTexVramRegion {
    u32 head;
    u32 tail;
    BOOL active;
    BOOL is4x4Region;  // slot holds 4x4-compressed texel data
    u16 plttIndexSlot; // slot that holds the matching 4x4 palette index data
    u16 padding;
    u32 baseAddr;
} FrmTexVramRegion;

void NNSi_GfdSetTexNrmSearchArray(int first, int second, int third, int fourth, int fifth);
NNSGfdTexKey NNS_GfdAllocFrmTexVram(u32 szByte, BOOL is4x4comp, u32 opt);
int NNS_GfdFreeFrmTexVram(NNSGfdTexKey key);
void NNS_GfdGetFrmTexVramState(u32 *state);
void NNS_GfdSetFrmTexVramState(const u32 *state);
void NNS_GfdResetFrmTexVramState(void);

// frame palette VRAM manager: allocates from both ends of [0, szByte)
typedef struct FrmPlttVramManager {
    u32 lo;
    u32 hi;
    u32 szByte;
} FrmPlttVramManager;

NNSGfdPlttKey NNS_GfdAllocFrmPlttVram(u32 szByte, BOOL b4Pltt, u32 bAllocFromLo);
int NNS_GfdFreeFrmPlttVram(NNSGfdPlttKey key);
void NNS_GfdGetFrmPlttVramState(u32 *state);
void NNS_GfdSetFrmPlttVramState(const u32 *state);
void NNS_GfdResetFrmPlttVramState(void);

// VRAM transfer manager: ring buffer of NNSGfdVramTransferTask
typedef struct VramTransferTaskQueue {
    NNSGfdVramTransferTask *pTaskArray;
    u32 lengthOfArray;
    u16 idxFront;
    u16 idxEnd;
    u16 numTasks;
    u16 padding;
    u32 totalSize; // bytes still queued
} VramTransferTaskQueue;

u16 GetNextIndex_(VramTransferTaskQueue *queue, u32 index);
BOOL IsVramTransferTaskQueueFull_(VramTransferTaskQueue *queue);
BOOL IsVramTransferTaskQueueEmpty_(VramTransferTaskQueue *queue);
void DoTransfer3dTex(void *src, u32 dstAddr, u32 szByte);
void DoTransfer3dTexPltt(void *src, u32 dstAddr, u32 szByte);
void DoTransfer3dClearImageColor(void *src, u32 dstAddr, u32 szByte);
void DoTransfer3dClearImageDepth(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dBG0CharMain(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dBG1CharMain(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dBG2CharMain(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dBG3CharMain(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dBG0ScrMain(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dBG1ScrMain(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dBG2ScrMain(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dBG3ScrMain(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dBG2BmpMain(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dBG3BmpMain(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dObjPlttMain(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dBGPlttMain(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dObjExtPlttMain(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dBGExtPlttMain(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dObjOamMain(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dObjCharMain(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dBG0CharSub(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dBG1CharSub(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dBG2CharSub(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dBG3CharSub(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dBG0ScrSub(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dBG1ScrSub(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dBG2ScrSub(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dBG3ScrSub(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dBG2BmpSub(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dBG3BmpSub(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dObjPlttSub(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dBGPlttSub(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dObjExtPlttSub(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dBGExtPlttSub(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dObjOamSub(void *src, u32 dstAddr, u32 szByte);
void DoTransfer2dObjCharSub(void *src, u32 dstAddr, u32 szByte);
void DoTransfer_(NNSGfdVramTransferTask *task);
void ResetTaskQueue_(VramTransferTaskQueue *queue);
BOOL NNSi_GfdPushVramTransferTaskQueue(VramTransferTaskQueue *queue);
NNSGfdVramTransferTask *NNSi_GfdGetFrontVramTransferTaskQueue(VramTransferTaskQueue *queue);
NNSGfdVramTransferTask *NNSi_GfdGetEndVramTransferTaskQueue(VramTransferTaskQueue *queue);
BOOL NNSi_GfdPopVramTransferTaskQueue(VramTransferTaskQueue *queue);

// linked-list VRAM managers: free regions kept in a list of blocks taken from a caller-supplied pool
typedef struct LnkVramBlock {
    u32 addr;
    u32 szByte;
    struct LnkVramBlock *prev;
    struct LnkVramBlock *next;
} LnkVramBlock;

BOOL TryToMergeBlockRegion_(LnkVramBlock **freeList, LnkVramBlock **pool, u32 *region);
void NNSi_GfdInitLnkVramMan(LnkVramBlock **freeList);
LnkVramBlock *NNSi_GfdInitLnkVramBlockPool(LnkVramBlock *blocks, u32 numBlocks);
BOOL NNSi_GfdAddNewFreeBlock(LnkVramBlock **freeList, LnkVramBlock **pool, u32 addr, u32 szByte);
BOOL NNSi_GfdAllocLnkVram(LnkVramBlock **freeList, LnkVramBlock **pool, u32 *pAddr, u32 szByte);
BOOL NNSi_GfdAllocLnkVramAligned(LnkVramBlock **freeList, LnkVramBlock **pool, u32 *pAddr, u32 szByte, u32 alignment);
void NNSi_GfdMergeAllFreeBlocks(LnkVramBlock **freeList, LnkVramBlock **pool);
BOOL NNSi_GfdFreeLnkVram(LnkVramBlock **freeList, LnkVramBlock **pool, u32 addr, u32 szByte);

typedef struct LnkTexVramManagerWork {
    LnkVramBlock *blockPool;
    u32 szByte;
    u32 szByteFor4x4;
    void *pWork;
    u32 szWork;
} LnkTexVramManagerWork;

typedef struct LnkTexVramManager {
    LnkVramBlock *freeList;
    LnkVramBlock *freeListFor4x4;
    LnkTexVramManagerWork work;
} LnkTexVramManager;

NNSGfdTexKey NNS_GfdAllocLnkTexVram(u32 szByte, BOOL is4x4comp, u32 opt);
int NNS_GfdFreeLnkTexVram(NNSGfdTexKey key);
void NNS_GfdResetLnkTexVramState(void);

typedef struct LnkPlttVramManager {
    LnkVramBlock *freeList;
    LnkVramBlock *blockPool;
    u32 szByte;
    void *pWork;
    u32 szWork;
} LnkPlttVramManager;

NNSGfdPlttKey NNS_GfdAllocLnkPlttVram(u32 szByte, BOOL is4pltt, u32 opt);
int NNS_GfdFreeLnkPlttVram(NNSGfdPlttKey key);
void NNS_GfdResetLnkPlttVramState(void);

#endif // POKEHEARTGOLD_NNSYS_GFD_INTERNAL_H
