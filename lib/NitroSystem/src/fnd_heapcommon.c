#include <nitro.h>
#include <nnsys/fnd_internal.h>

extern BOOL gFndRootHeapListInitialized; // root heap list initialised
extern NNSFndList gFndRootHeapList;      // heaps that are not contained in another heap

NNSiFndHeapHead *FindContainHeap(NNSFndList *list, const void *address) {
    NNSiFndHeapHead *heap;
    for (heap = NNS_FndGetNextListObject(list, NULL); heap != NULL; heap = NNS_FndGetNextListObject(list, heap)) {
        if ((u8 *)heap->heapStart <= (u8 *)address && (u8 *)address < (u8 *)heap->heapEnd) {
            NNSiFndHeapHead *child = FindContainHeap(&heap->childList, address);
            return child != NULL ? child : heap;
        }
    }
    return NULL;
}

NNSFndList *FindListContainHeap(NNSiFndHeapHead *heap) {
    NNSFndList *list = &gFndRootHeapList;
    NNSiFndHeapHead *parent = FindContainHeap(list, heap);
    if (parent != NULL) {
        list = &parent->childList;
    }
    return list;
}

#pragma force_active on

void NNSi_FndInitHeapHead(NNSiFndHeapHead *heap, u32 signature, void *heapStart, void *heapEnd, u16 optFlag) {
    heap->signature = signature;
    heap->heapStart = heapStart;
    heap->heapEnd = heapEnd;
    heap->attribute = 0;
    ((HeapAttribute *)&heap->attribute)->optFlag = optFlag;
    NNS_FndInitList(&heap->childList, 4);
    if (!gFndRootHeapListInitialized) {
        NNS_FndInitList(&gFndRootHeapList, 4);
        gFndRootHeapListInitialized = TRUE;
    }
    NNS_FndAppendListObject(FindListContainHeap(heap), heap);
}

#pragma force_active reset

void NNSi_FndFinalizeHeap(NNSiFndHeapHead *heap) {
    NNSFndList *list = FindListContainHeap(heap);
    NNS_FndRemoveListObject(list, heap);
}
