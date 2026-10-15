#include <nitro.h>
#include <nnsys/gfd_internal.h>

#pragma force_active on

static inline void RemoveFromList(LnkVramBlock **list, LnkVramBlock *block) {
    LnkVramBlock *prev = block->prev;
    LnkVramBlock *next = block->next;
    if (prev) {
        prev->next = next;
    } else {
        *list = next;
    }
    if (next) {
        next->prev = prev;
    }
}

static inline void PushToList(LnkVramBlock **list, LnkVramBlock *block) {
    if (*list) {
        (*list)->prev = block;
    }
    block->next = *list;
    block->prev = NULL;
    *list = block;
}

// Absorbs every free block adjacent to region[0..1) into the region; the absorbed blocks go back to the pool.
BOOL TryToMergeBlockRegion_(LnkVramBlock **freeList, LnkVramBlock **pool, u32 *region) {
    LnkVramBlock *block = *freeList;
    LnkVramBlock *next;
    BOOL merged = FALSE;
    while (block) {
        next = block->next;
        if (block->addr == region[1]) {
            region[1] = block->addr + block->szByte;
            merged |= TRUE;
            RemoveFromList(freeList, block);
            PushToList(pool, block);
        }
        if (block->addr + block->szByte == region[0]) {
            region[0] = block->addr;
            RemoveFromList(freeList, block);
            merged |= TRUE;
            PushToList(pool, block);
        }
        block = next;
    }
    return merged;
}

#pragma force_active reset

void NNSi_GfdInitLnkVramMan(LnkVramBlock **freeList) {
    *freeList = NULL;
}

#pragma force_active on

LnkVramBlock *NNSi_GfdInitLnkVramBlockPool(LnkVramBlock *blocks, u32 numBlocks) {
    for (u32 i = 0; i < numBlocks - 1; i++) {
        blocks[i].next = &blocks[i + 1];
        blocks[i + 1].prev = &blocks[i];
    }
    blocks[0].prev = NULL;
    blocks[numBlocks - 1].next = NULL;
    return blocks;
}

BOOL NNSi_GfdAddNewFreeBlock(LnkVramBlock **freeList, LnkVramBlock **pool, u32 addr, u32 szByte) {
    LnkVramBlock *block = *pool;
    if (block) {
        *pool = block->next;
    }
    if (block) {
        block->addr = addr;
        block->szByte = szByte;
        block->prev = NULL;
        block->next = NULL;
        if (*freeList) {
            (*freeList)->prev = block;
        }
        block->next = *freeList;
        block->prev = NULL;
        *freeList = block;
        return TRUE;
    }
    return FALSE;
}

#pragma force_active reset

BOOL NNSi_GfdAllocLnkVram(LnkVramBlock **freeList, LnkVramBlock **pool, u32 *pAddr, u32 szByte) {
    return NNSi_GfdAllocLnkVramAligned(freeList, pool, pAddr, szByte, 0);
}

#pragma force_active on

static inline LnkVramBlock *GetNewBlock_(LnkVramBlock **pool) {
    LnkVramBlock *block = *pool;
    if (block) {
        *pool = block->next;
    }
    return block;
}

static inline void InitBlock_(LnkVramBlock *block, u32 addr, u32 szByte) {
    block->addr = addr;
    block->szByte = szByte;
    block->prev = NULL;
    block->next = NULL;
}

static inline void InsertBlock_(LnkVramBlock **list, LnkVramBlock *block) {
    if (*list) {
        (*list)->prev = block;
    }
    block->next = *list;
    block->prev = NULL;
    *list = block;
}

static inline void RemoveBlock_(LnkVramBlock **list, LnkVramBlock *block) {
    LnkVramBlock *prev = block->prev;
    LnkVramBlock *next = block->next;
    if (prev) {
        prev->next = next;
    } else {
        *list = next;
    }
    if (next) {
        next->prev = prev;
    }
}

BOOL NNSi_GfdAllocLnkVramAligned(LnkVramBlock **freeList, LnkVramBlock **pool, u32 *pAddr, u32 szByte, u32 alignment) {
    u32 alignedAddr;
    u32 need;
    u32 gap;
    LnkVramBlock *found = NULL;
    LnkVramBlock *block = *freeList;
    while (block) {
        if (alignment > 1) {
            alignedAddr = (block->addr + (alignment - 1)) & ~(alignment - 1);
            gap = alignedAddr - block->addr;
            need = szByte + gap;
        } else {
            alignedAddr = block->addr;
            gap = 0;
            need = szByte;
        }
        if (block->szByte >= need) {
            found = block;
            break;
        }
        block = block->next;
    }
    if (found) {
        if (gap != 0) {
            LnkVramBlock *gapBlock = GetNewBlock_(pool);
            if (!gapBlock) {
                goto fail;
            }
            InitBlock_(gapBlock, found->addr, gap);
            InsertBlock_(freeList, gapBlock);
        }
        found->szByte -= need;
        found->addr += need;
        if (found->szByte == 0) {
            RemoveBlock_(freeList, found);
            InsertBlock_(pool, found);
        }
        *pAddr = alignedAddr;
        return TRUE;
    }
fail:
    *pAddr = 0;
    return FALSE;
}

void NNSi_GfdMergeAllFreeBlocks(LnkVramBlock **freeList, LnkVramBlock **pool) {
    LnkVramBlock *block = *freeList;
    u32 region[2];
    if (!block) {
        return;
    }
    while (block) {
        region[0] = block->addr;
        region[1] = block->addr + block->szByte;
        if (!TryToMergeBlockRegion_(freeList, pool, region)) {
            block = block->next;
        } else {
            block->addr = region[0];
            block->szByte = region[1] - region[0];
            block = *freeList;
        }
    }
}

BOOL NNSi_GfdFreeLnkVram(LnkVramBlock **freeList, LnkVramBlock **pool, u32 addr, u32 szByte) {
    u32 region[2];
    LnkVramBlock *block;
    region[0] = addr;
    region[1] = addr + szByte;
    TryToMergeBlockRegion_(freeList, pool, region);
    block = *pool;
    if (block) {
        *pool = block->next;
    }
    if (!block) {
        return FALSE;
    }
    block->addr = region[0];
    block->szByte = region[1] - region[0];
    block->prev = NULL;
    block->next = NULL;
    if (*freeList) {
        (*freeList)->prev = block;
    }
    block->next = *freeList;
    block->prev = NULL;
    *freeList = block;
    return TRUE;
}
