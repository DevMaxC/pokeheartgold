#ifndef POKEHEARTGOLD_NNSYS_FND_INTERNAL_H
#define POKEHEARTGOLD_NNSYS_FND_INTERNAL_H

// Types and prototypes shared by the NitroSystem foundation (heap) modules in lib/NitroSystem/src/fnd_*.c
// that the public headers in nnsys/fnd/ do not declare.

#include <nnsys/fnd.h>

// Low byte of NNSiFndHeapHead.attribute: the option flags passed when the heap was created
// (bit 0: clear allocated memory).
typedef struct HeapAttribute {
    u32 optFlag : 8;
    u32 unused : 24;
} HeapAttribute;

// list
void NNS_FndInitList(NNSFndList *list, u16 offset);
void SetFirstObject(NNSFndList *list, void *object);
void NNS_FndAppendListObject(NNSFndList *list, void *object);
void NNS_FndPrependListObject(NNSFndList *list, void *object);
void NNS_FndInsertListObject(NNSFndList *list, void *target, void *object);
void NNS_FndRemoveListObject(NNSFndList *list, void *object);
void *NNS_FndGetNextListObject(NNSFndList *list, void *object);
void *NNS_FndGetPrevListObject(NNSFndList *list, void *object);

// heap common
NNSiFndHeapHead *FindContainHeap(NNSFndList *list, const void *address);
NNSFndList *FindListContainHeap(NNSiFndHeapHead *heap);
void NNSi_FndInitHeapHead(NNSiFndHeapHead *heap, u32 signature, void *heapStart, void *heapEnd, u16 optFlag);
void NNSi_FndFinalizeHeap(NNSiFndHeapHead *heap);

// expanded heap: every block (free or used) starts with this 16-byte header
typedef struct ExpHeapBlock {
    u16 signature; // 'FR' free, 'UD' used
    u16 attribute; // bits 0-7 group ID, bits 8-14 alignment padding before the header, bit 15 allocated from the tail
    u32 blockSize; // bytes after the header
    struct ExpHeapBlock *prev;
    struct ExpHeapBlock *next;
} ExpHeapBlock;

typedef struct ExpHeapBlockList {
    ExpHeapBlock *head;
    ExpHeapBlock *tail;
} ExpHeapBlockList;

typedef struct MemRegion {
    u8 *start;
    u8 *end;
} MemRegion;

typedef struct ExpHeapHead {
    ExpHeapBlockList freeBlocks;
    ExpHeapBlockList usedBlocks;
    u16 groupId;
    u16 feature; // bit 0: best fit instead of first fit
} ExpHeapHead;

typedef struct ExpHeap {
    NNSiFndHeapHead head;
    ExpHeapHead exp;
} ExpHeap;

void GetRegionOfMBlock(MemRegion *region, ExpHeapBlock *block);
ExpHeapBlock *RemoveMBlock(ExpHeapBlockList *list, ExpHeapBlock *block);
ExpHeapBlock *InsertMBlock(ExpHeapBlockList *list, ExpHeapBlock *block, ExpHeapBlock *prev);
ExpHeapBlock *InitMBlock(MemRegion *region, u16 signature);
ExpHeap *InitExpHeap(void *start, void *end, u16 optFlag);
void *AllocUsedBlockFromFreeBlock(ExpHeapHead *expHead, ExpHeapBlock *block, u8 *address, u32 size, u16 direction);
void *AllocFromHead__ExpHeap(ExpHeap *heap, u32 size, int alignment);
void *AllocFromTail__ExpHeap(ExpHeap *heap, u32 size, int alignment);
BOOL RecycleRegion(ExpHeapBlockList *list, MemRegion *region);
u16 NNS_FndSetGroupIDForExpHeap(NNSFndHeapHandle heap, u16 groupId);
u16 NNS_FndGetGroupIDForMBlockExpHeap(const void *memBlock);

// frame heap: allocates from both ends, can save and restore its state
typedef struct FrameHeapState {
    u32 tag;
    void *head;
    void *tail;
    struct FrameHeapState *prev;
} FrameHeapState;

typedef struct FrameHeapHead {
    u8 *head; // next free byte from the bottom
    u8 *tail; // end of the free area (allocations from the top move it down)
    FrameHeapState *state;
} FrameHeapHead;

typedef struct FrameHeap {
    NNSiFndHeapHead head;
    FrameHeapHead frame;
} FrameHeap;

FrameHeap *InitFrameHeap(FrameHeap *heap, void *end, u16 optFlag);
void *AllocFromHead__FrameHeap(FrameHeapHead *frameHead, u32 size, u32 alignment);
void *AllocFromTail__FrameHeap(FrameHeapHead *frameHead, u32 size, u32 alignment);
void FreeHead__FrameHeap(FrameHeap *heap);
void FreeTail__FrameHeap(FrameHeap *heap);
NNSFndHeapHandle NNS_FndCreateFrmHeapEx(void *startAddress, u32 size, u16 optFlag);
void NNS_FndDestroyFrmHeap(NNSFndHeapHandle heap);
void *NNS_FndAllocFromFrmHeapEx(NNSFndHeapHandle heap, u32 size, int alignment);
void NNS_FndFreeToFrmHeap(NNSFndHeapHandle heap, u32 mode);
u32 NNS_FndGetAllocatableSizeForFrmHeapEx(NNSFndHeapHandle heap, int alignment);
BOOL NNS_FndRecordStateForFrmHeap(NNSFndHeapHandle heap, u32 tag);
BOOL NNS_FndFreeByStateToFrmHeap(NNSFndHeapHandle heap, u32 tag);

// unit heap: fixed-size blocks kept in a singly linked free list
typedef struct UnitHeapBlock {
    struct UnitHeapBlock *next;
} UnitHeapBlock;

typedef struct UnitHeapBlockList {
    UnitHeapBlock *head;
} UnitHeapBlockList;

typedef struct UnitHeapHead {
    UnitHeapBlockList freeList;
    u32 blockSize;
} UnitHeapHead;

typedef struct UnitHeap {
    NNSiFndHeapHead head;
    UnitHeapHead unit;
} UnitHeap;

void *PopMBlock__UnitHeap(UnitHeapBlockList *list);
void *NNS_FndAllocFromUnitHeap(NNSFndHeapHandle heap);
void NNS_FndFreeToUnitHeap(NNSFndHeapHandle heap, void *memBlock);

// allocator
void *AllocatorAllocForExpHeap(NNSFndAllocator *allocator, u32 size);
void AllocatorFreeForExpHeap(NNSFndAllocator *allocator, void *memBlock);
void *AllocatorAllocForFrmHeap(NNSFndAllocator *allocator, u32 size);
void AllocatorFreeForFrmHeap(NNSFndAllocator *allocator, void *memBlock);
void *AllocatorAllocForUnitHeap(NNSFndAllocator *allocator, u32 size);
void AllocatorFreeForUnitHeap(NNSFndAllocator *allocator, void *memBlock);
void *AllocatorAllocForSDKHeap(NNSFndAllocator *allocator, u32 size);
void AllocatorFreeForSDKHeap(NNSFndAllocator *allocator, void *memBlock);
void *NNS_FndAllocFromAllocator(NNSFndAllocator *allocator, u32 size);
void NNS_FndFreeToAllocator(NNSFndAllocator *allocator, void *memBlock);

#endif // POKEHEARTGOLD_NNSYS_FND_INTERNAL_H
