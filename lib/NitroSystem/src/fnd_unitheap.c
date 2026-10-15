#include <nitro.h>
#include <nnsys/fnd_internal.h>

#pragma force_active on

void *PopMBlock__UnitHeap(UnitHeapBlockList *list) {
    UnitHeapBlock *block = list->head;
    if (block != NULL) {
        list->head = block->next;
    }
    return block;
}

void *NNS_FndAllocFromUnitHeap(NNSFndHeapHandle heap) {
    UnitHeap *unitHeap = (UnitHeap *)heap;
    void *block = PopMBlock__UnitHeap(&unitHeap->unit.freeList);
    if (block != NULL) {
        // read through a volatile pointer: needed for the match
        u32 optFlag = *(volatile u32 *)&unitHeap->head.attribute & 0xff;
        u32 blockSize = unitHeap->unit.blockSize;
        if (optFlag & 1) {
            MIi_CpuClear32(0, block, blockSize);
        }
    }
    return block;
}

void NNS_FndFreeToUnitHeap(NNSFndHeapHandle heap, void *memBlock) {
    UnitHeap *unitHeap = (UnitHeap *)heap;
    ((UnitHeapBlock *)memBlock)->next = unitHeap->unit.freeList.head;
    unitHeap->unit.freeList.head = memBlock;
}
