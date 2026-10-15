#include <nitro.h>
#include <nnsys/fnd_internal.h>

#define EXPHEAP_SIGNATURE     0x45585048 // 'EXPH'
#define MBLOCK_FREE_SIGNATURE 0x4652     // 'FR'
#define MBLOCK_USED_SIGNATURE 0x5544     // 'UD'

#define SET_BITS(data, st, bits, val)            \
    do {                                         \
        u32 maskBits = (u32)((1 << (bits)) - 1); \
        u32 newVal = (u32)(val) & maskBits;      \
        (data) &= ~(maskBits << (st));           \
        (data) |= newVal << (st);                \
    } while (0)

static inline u8 *GetBlockEnd(ExpHeapBlock *block) {
    u32 size = block->blockSize;
    u8 *start = (u8 *)(block + 1);
    return (u8 *)(size + (u32)start);
}

static inline void FillAllocMemory(ExpHeapHead *expHead, void *address, u32 size) {
    if ((u8)(((NNSiFndHeapHead *)((u8 *)expHead - sizeof(NNSiFndHeapHead)))->attribute & 0xff) & 1) {
        MIi_CpuClear32(0, (u32 *)address, size);
    }
}

static inline void SetAllocDir(ExpHeapBlock *block, u16 mode) {
    SET_BITS(block->attribute, 15, 1, mode);
}

static inline void SetGroupID(ExpHeapBlock *block, u16 groupId) {
    SET_BITS(block->attribute, 0, 8, groupId);
}

static inline void SetAlignment(ExpHeapBlock *block, u16 alignment) {
    block->attribute &= ~(0x7f << 8);
    block->attribute |= (alignment & 0x7f) << 8;
}

#pragma force_active on

void GetRegionOfMBlock(MemRegion *region, ExpHeapBlock *block) {
    region->start = (u8 *)block - (u16)((block->attribute >> 8) & 127);
    region->end = (u8 *)(block->blockSize + (u32)(block + 1));
}

#pragma force_active reset

ExpHeapBlock *RemoveMBlock(ExpHeapBlockList *list, ExpHeapBlock *block) {
    ExpHeapBlock *prev = block->prev;
    ExpHeapBlock *next = block->next;
    if (prev != NULL) {
        prev->next = next;
    } else {
        list->head = next;
    }
    if (next != NULL) {
        next->prev = prev;
    } else {
        list->tail = prev;
    }
    return prev;
}

ExpHeapBlock *InsertMBlock(ExpHeapBlockList *list, ExpHeapBlock *block, ExpHeapBlock *prev) {
    ExpHeapBlock *next;
    block->prev = prev;
    if (prev != NULL) {
        next = prev->next;
        prev->next = block;
    } else {
        next = list->head;
        list->head = block;
    }
    block->next = next;
    if (next != NULL) {
        next->prev = block;
    } else {
        list->tail = block;
    }
    return block;
}

ExpHeapBlock *InitMBlock(MemRegion *region, u16 signature) {
    ExpHeapBlock *block = (ExpHeapBlock *)region->start;
    block->signature = signature;
    block->attribute = 0;
    block->blockSize = region->end - (u8 *)(block + 1);
    block->prev = NULL;
    block->next = NULL;
    return block;
}

#pragma force_active on

ExpHeap *InitExpHeap(void *start, void *end, u16 optFlag) {
    ExpHeap *heap = start;
    MemRegion region;
    ExpHeapBlock *block;
    NNSi_FndInitHeapHead(&heap->head, EXPHEAP_SIGNATURE, (u8 *)heap + sizeof(ExpHeap), end, optFlag);
    heap->exp.groupId = 0;
    heap->exp.feature = 0;
    heap->exp.feature &= ~1;
    region.start = heap->head.heapStart;
    region.end = heap->head.heapEnd;
    block = InitMBlock(&region, MBLOCK_FREE_SIGNATURE);
    heap->exp.freeBlocks.head = block;
    heap->exp.freeBlocks.tail = block;
    heap->exp.usedBlocks.head = NULL;
    heap->exp.usedBlocks.tail = NULL;
    return heap;
}

void *AllocUsedBlockFromFreeBlock(ExpHeapHead *expHead, ExpHeapBlock *block, u8 *address, u32 size, u16 direction) {
    MemRegion freeRgnT;
    MemRegion freeRgnB;
    ExpHeapBlock *prev;
    u8 *head;
    GetRegionOfMBlock(&freeRgnT, block);
    head = address - sizeof(ExpHeapBlock);
    freeRgnB.end = freeRgnT.end;
    freeRgnB.start = (u8 *)(size + (u32)address);
    freeRgnT.end = head;
    prev = RemoveMBlock(&expHead->freeBlocks, block);
    if (freeRgnT.end - freeRgnT.start < sizeof(ExpHeapBlock) + 4) {
        freeRgnT.end = freeRgnT.start;
    } else {
        prev = InsertMBlock(&expHead->freeBlocks, InitMBlock(&freeRgnT, MBLOCK_FREE_SIGNATURE), prev);
    }
    if (freeRgnB.end - freeRgnB.start < sizeof(ExpHeapBlock) + 4) {
        freeRgnB.start = freeRgnB.end;
    } else {
        InsertMBlock(&expHead->freeBlocks, InitMBlock(&freeRgnB, MBLOCK_FREE_SIGNATURE), prev);
    }
    FillAllocMemory(expHead, freeRgnT.end, freeRgnB.start - freeRgnT.end);
    {
        ExpHeapBlock *newBlock;
        MemRegion region;
        region.start = head;
        region.end = freeRgnB.start;
        newBlock = InitMBlock(&region, MBLOCK_USED_SIGNATURE);
        SetAllocDir(newBlock, direction);
        SetAlignment(newBlock, (u16)((u8 *)newBlock - freeRgnT.end));
        SetGroupID(newBlock, expHead->groupId);
        InsertMBlock(&expHead->usedBlocks, newBlock, expHead->usedBlocks.tail);
    }
    return address;
}

void *AllocFromHead__ExpHeap(ExpHeap *heap, u32 size, int alignment) {
    BOOL firstFit = (u16)(heap->exp.feature & 1) == 0;
    ExpHeapBlock *block = heap->exp.freeBlocks.head;
    ExpHeapBlock *best = NULL;
    u32 bestSize = ~0u;
    u8 *address = NULL;
    alignment -= 1;
    while (block) {
        u8 *start = (u8 *)(block + 1);
        u8 *aligned = (u8 *)((alignment + (u32)start) & ~alignment);
        u32 padding = aligned - start;
        u32 available = block->blockSize;
        if (available >= size + padding && bestSize > available) {
            best = block;
            bestSize = available;
            address = aligned;
            if (firstFit) {
                break;
            }
            if (available == size) {
                break;
            }
        }
        block = block->next;
    }
    if (!best) {
        return NULL;
    }
    return AllocUsedBlockFromFreeBlock(&heap->exp, best, address, size, 0);
}

void *AllocFromTail__ExpHeap(ExpHeap *heap, u32 size, int alignment) {
    BOOL firstFit = (u16)(heap->exp.feature & 1) == 0;
    ExpHeapBlock *block = heap->exp.freeBlocks.tail;
    ExpHeapBlock *best = NULL;
    u32 bestSize = ~0u;
    u8 *address = NULL;
    while (block) {
        u8 *start = (u8 *)(block + 1);
        u8 *end = (u8 *)(block->blockSize + (u32)start);
        u8 *aligned = (u8 *)((u32)(end - size) & ~(alignment - 1));
        if ((s32)(aligned - start) >= 0 && bestSize > block->blockSize) {
            best = block;
            bestSize = block->blockSize;
            address = aligned;
            if (firstFit) {
                break;
            }
            if (block->blockSize == size) {
                break;
            }
        }
        block = block->prev;
    }
    if (!best) {
        return NULL;
    }
    return AllocUsedBlockFromFreeBlock(&heap->exp, best, address, size, 1);
}

BOOL RecycleRegion(ExpHeapBlockList *list, MemRegion *region) {
    MemRegion freeRgn = *region;
    ExpHeapBlock *prev = NULL;
    ExpHeapBlock *block = list->head;
    ExpHeapBlock *newBlock;
    while (block) {
        if ((u32)block < (u32)region->start) {
            prev = block;
        } else {
            if ((u8 *)block == region->end) {
                freeRgn.end = GetBlockEnd(block);
                RemoveMBlock(list, block);
            }
            break;
        }
        block = block->next;
    }
    if (prev) {
        if (GetBlockEnd(prev) == region->start) {
            freeRgn.start = (u8 *)prev;
            prev = RemoveMBlock(list, prev);
        }
    }
    if ((u32)(freeRgn.end - freeRgn.start) < sizeof(ExpHeapBlock)) {
        return FALSE;
    }
    newBlock = InitMBlock(&freeRgn, MBLOCK_FREE_SIGNATURE);
    InsertMBlock(list, newBlock, prev);
    return TRUE;
}

NNSFndHeapHandle NNS_FndCreateExpHeapEx(void *startAddress, u32 size, u16 optFlag) {
    u8 *end = (u8 *)((size + (u32)startAddress) & ~3);
    startAddress = (void *)(((u32)startAddress + 3) & ~3);
    if ((u32)startAddress > (u32)end || (u32)(end - (u8 *)startAddress) < sizeof(ExpHeap) + sizeof(ExpHeapBlock) + 4) {
        return NULL;
    }
    return (NNSFndHeapHandle)InitExpHeap(startAddress, end, optFlag);
}

#pragma force_active reset

void NNS_FndDestroyExpHeap(NNSFndHeapHandle heap) {
    NNSi_FndFinalizeHeap(heap);
}

void *NNS_FndAllocFromExpHeapEx(NNSFndHeapHandle heap, u32 size, int alignment) {
    if (size == 0) {
        size = 1;
    }
    size = (size + 3) & ~3;
    if (alignment >= 0) {
        return AllocFromHead__ExpHeap((ExpHeap *)heap, size, alignment);
    }
    return AllocFromTail__ExpHeap((ExpHeap *)heap, size, -alignment);
}

#pragma force_active on

u32 NNS_FndResizeForMBlockExpHeap(NNSFndHeapHandle heap, void *memBlock, u32 size) {
    ExpHeap *expHeap = (ExpHeap *)heap;
    MemRegion grow;
    MemRegion shrink;
    u8 *data = memBlock;
    ExpHeapBlock *freeBlock;
    u32 oldSize;
    ExpHeapBlock *block = (ExpHeapBlock *)(data - sizeof(ExpHeapBlock));
    u8 *start;
    ExpHeapBlock *prev;
    ExpHeapBlock *adjacent;
    oldSize = block->blockSize;
    size = (size + 3) & ~3;
    if (size == oldSize) {
        return size;
    }
    if (size > oldSize) {
        freeBlock = expHeap->exp.freeBlocks.head;
        adjacent = (ExpHeapBlock *)((u8 *)(oldSize + ((u32)block + sizeof(ExpHeapBlock))));
        if (freeBlock) {
            do {
                if (freeBlock == adjacent) {
                    break;
                }
                freeBlock = freeBlock->next;
            } while (freeBlock);
        }
        if (!freeBlock || size > oldSize + sizeof(ExpHeapBlock) + freeBlock->blockSize) {
            return 0;
        }
        GetRegionOfMBlock(&grow, freeBlock);
        prev = RemoveMBlock(&expHeap->exp.freeBlocks, freeBlock);
        {
            start = grow.start;
            grow.start = (u8 *)(size + (u32)data);
            if ((u32)(grow.end - grow.start) < sizeof(ExpHeapBlock)) {
                grow.start = grow.end;
            }
            block->blockSize = grow.start - data;
            if ((u32)(grow.end - grow.start) >= sizeof(ExpHeapBlock)) {
                InsertMBlock(&expHeap->exp.freeBlocks, InitMBlock(&grow, MBLOCK_FREE_SIGNATURE), prev);
            }
            {
                u32 delta = grow.start - start;
                if (((u8)expHeap->head.attribute) & 1) {
                    MIi_CpuClear32(0, (u32 *)start, delta);
                }
            }
        }
    } else {
        shrink.start = (u8 *)(size + (u32)data);
        shrink.end = (u8 *)(block->blockSize + ((u32)block + sizeof(ExpHeapBlock)));
        block->blockSize = size;
        if (!RecycleRegion(&expHeap->exp.freeBlocks, &shrink)) {
            block->blockSize = oldSize;
        }
    }
    return block->blockSize;
}

void NNS_FndFreeToExpHeap(NNSFndHeapHandle heap, void *memBlock) {
    MemRegion region;
    ExpHeapBlock *block = (ExpHeapBlock *)((u8 *)memBlock - sizeof(ExpHeapBlock));
    GetRegionOfMBlock(&region, block);
    RemoveMBlock(&((ExpHeap *)heap)->exp.usedBlocks, block);
    RecycleRegion(&((ExpHeap *)heap)->exp.freeBlocks, &region);
}

u32 NNS_FndGetTotalFreeSizeForExpHeap(NNSFndHeapHandle heap) {
    ExpHeapBlock *block = ((ExpHeap *)heap)->exp.freeBlocks.head;
    u32 size = 0;
    while (block) {
        size += block->blockSize;
        block = block->next;
    }
    return size;
}

u16 NNS_FndSetGroupIDForExpHeap(NNSFndHeapHandle heap, u16 groupId) {
    u16 old = ((ExpHeap *)heap)->exp.groupId;
    ((ExpHeap *)heap)->exp.groupId = groupId;
    return old;
}

u32 NNS_FndGetSizeForMBlockExpHeap(const void *memBlock) {
    return ((const ExpHeapBlock *)((const u8 *)memBlock - sizeof(ExpHeapBlock)))->blockSize;
}

u16 NNS_FndGetGroupIDForMBlockExpHeap(const void *memBlock) {
    return ((const ExpHeapBlock *)((const u8 *)memBlock - sizeof(ExpHeapBlock)))->attribute & 255;
}

#pragma force_active reset
