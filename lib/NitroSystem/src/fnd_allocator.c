#include <nitro.h>
#include <nnsys/fnd_internal.h>

extern const NNSFndAllocatorFunc gFndExpHeapAllocatorFunc; // { AllocatorAllocForExpHeap, AllocatorFreeForExpHeap }

#pragma force_active on

void *AllocatorAllocForExpHeap(NNSFndAllocator *allocator, u32 size) {
    return NNS_FndAllocFromExpHeapEx(allocator->pHeap, size, allocator->heapParam1);
}

void AllocatorFreeForExpHeap(NNSFndAllocator *allocator, void *memBlock) {
    NNS_FndFreeToExpHeap(allocator->pHeap, memBlock);
}

void *AllocatorAllocForFrmHeap(NNSFndAllocator *allocator, u32 size) {
    return NNS_FndAllocFromFrmHeapEx(allocator->pHeap, size, allocator->heapParam1);
}

void AllocatorFreeForFrmHeap(NNSFndAllocator *allocator, void *memBlock) {
}

void *AllocatorAllocForUnitHeap(NNSFndAllocator *allocator, u32 size) {
    UnitHeap *heap = allocator->pHeap;
    if (size > heap->unit.blockSize) {
        return NULL;
    }
    return NNS_FndAllocFromUnitHeap(&heap->head);
}

void AllocatorFreeForUnitHeap(NNSFndAllocator *allocator, void *memBlock) {
    NNS_FndFreeToUnitHeap(allocator->pHeap, memBlock);
}

void *AllocatorAllocForSDKHeap(NNSFndAllocator *allocator, u32 size) {
    return OS_AllocFromHeap((OSArenaId)allocator->heapParam1, (OSHeapHandle)allocator->pHeap, size);
}

void AllocatorFreeForSDKHeap(NNSFndAllocator *allocator, void *memBlock) {
    OS_FreeToHeap((OSArenaId)allocator->heapParam1, (OSHeapHandle)allocator->pHeap, memBlock);
}

void *NNS_FndAllocFromAllocator(NNSFndAllocator *allocator, u32 size) {
    return allocator->pFunc->pfAlloc(allocator, size);
}

void NNS_FndFreeToAllocator(NNSFndAllocator *allocator, void *memBlock) {
    allocator->pFunc->pfFree(allocator, memBlock);
}

void NNS_FndInitAllocatorForExpHeap(NNSFndAllocator *allocator, NNSFndHeapHandle heap, int alignment) {
    allocator->pFunc = &gFndExpHeapAllocatorFunc;
    allocator->pHeap = heap;
    allocator->heapParam1 = alignment;
    allocator->heapParam2 = 0;
}
