#include <nitro.h>
#include <nnsys/fnd_internal.h>

#include "MSL_C/stdlib.h"

#define FRMHEAP_SIGNATURE 0x46524d48 // 'FRMH'

// The option flags live in the heap header's attribute word, directly in front of the allocator pair.
static inline u8 GetOptFlag(FrameHeapHead *frameHead) {
    return ((u32 *)frameHead)[-1];
}

FrameHeap *InitFrameHeap(FrameHeap *heap, void *end, u16 optFlag) {
    NNSi_FndInitHeapHead(&heap->head, FRMHEAP_SIGNATURE, (u8 *)heap + sizeof(FrameHeap), end, optFlag);
    heap->frame.head = heap->head.heapStart;
    heap->frame.tail = heap->head.heapEnd;
    heap->frame.state = NULL;
    return heap;
}

void *AllocFromHead__FrameHeap(FrameHeapHead *frameHead, u32 size, u32 alignment) {
    u8 *old = frameHead->head;
    u32 mask = alignment - 1;
    u8 *next = (u8 *)((mask + (u32)old) & ~mask);
    u8 *end = (u8 *)(size + (u32)next);
    if (end > frameHead->tail) {
        return NULL;
    }
    u32 actual = end - old;
    if (GetOptFlag(frameHead) & 1) {
        MIi_CpuClear32(0, (u32 *)old, actual);
    }
    frameHead->head = end;
    return next;
}

void *AllocFromTail__FrameHeap(FrameHeapHead *frameHead, u32 size, u32 alignment) {
    u8 *old = frameHead->tail;
    u32 mask = alignment - 1;
    u8 *next = (u8 *)(((u32)(old - size)) & ~mask);
    if (next < frameHead->head) {
        return NULL;
    }
    u32 actual = old - next;
    if (GetOptFlag(frameHead) & 1) {
        MIi_CpuClear32(0, (u32 *)next, actual);
    }
    frameHead->tail = next;
    return next;
}

void FreeHead__FrameHeap(FrameHeap *heap) {
    heap->frame.head = heap->head.heapStart;
    heap->frame.state = NULL;
}

void FreeTail__FrameHeap(FrameHeap *heap) {
    FrameHeapState *state = heap->frame.state;
    while (state != NULL) {
        state->tail = heap->head.heapEnd;
        state = state->prev;
    }
    heap->frame.tail = heap->head.heapEnd;
}

NNSFndHeapHandle NNS_FndCreateFrmHeapEx(void *startAddress, u32 size, u16 optFlag) {
    u8 *end = (u8 *)((size + (u32)startAddress) & ~3);
    u8 *begin = (u8 *)(((u32)startAddress + 3) & ~3);
    if (begin > end || (u32)(end - begin) < sizeof(FrameHeap)) {
        return NULL;
    }
    return &InitFrameHeap((FrameHeap *)begin, end, optFlag)->head;
}

void NNS_FndDestroyFrmHeap(NNSFndHeapHandle heap) {
    NNSi_FndFinalizeHeap(heap);
}

void *NNS_FndAllocFromFrmHeapEx(NNSFndHeapHandle heap, u32 size, int alignment) {
    if (size == 0) {
        size = 1;
    }
    size = (size + 3) & ~3;
    if (alignment >= 0) {
        return AllocFromHead__FrameHeap(&((FrameHeap *)heap)->frame, size, alignment);
    }
    return AllocFromTail__FrameHeap(&((FrameHeap *)heap)->frame, size, -alignment);
}

void NNS_FndFreeToFrmHeap(NNSFndHeapHandle heap, u32 mode) {
    if (mode & 1) {
        FreeHead__FrameHeap((FrameHeap *)heap);
    }
    if (mode & 2) {
        FreeTail__FrameHeap((FrameHeap *)heap);
    }
}

#pragma force_active on

u32 NNS_FndGetAllocatableSizeForFrmHeapEx(NNSFndHeapHandle heap, int alignment) {
    FrameHeap *frameHeap = (FrameHeap *)heap;
    void *p;
    alignment = abs(alignment);
    p = (void *)(((alignment - 1) + (u32)frameHeap->frame.head) & ~(alignment - 1));
    if ((u32)p > (u32)frameHeap->frame.tail) {
        return 0;
    }
    return (u32)frameHeap->frame.tail - (u32)p;
}

#pragma force_active reset

BOOL NNS_FndRecordStateForFrmHeap(NNSFndHeapHandle heap, u32 tag) {
    FrameHeap *frameHeap = (FrameHeap *)heap;
    void *head = frameHeap->frame.head;
    FrameHeapState *state = AllocFromHead__FrameHeap(&frameHeap->frame, sizeof(FrameHeapState), 4);
    if (!state) {
        return FALSE;
    }
    state->tag = tag;
    state->head = head;
    state->tail = frameHeap->frame.tail;
    state->prev = frameHeap->frame.state;
    frameHeap->frame.state = state;
    return TRUE;
}

BOOL NNS_FndFreeByStateToFrmHeap(NNSFndHeapHandle heap, u32 tag) {
    FrameHeap *frameHeap = (FrameHeap *)heap;
    FrameHeapState *state = frameHeap->frame.state;
    if (tag != 0 && state != NULL) {
        do {
            if (state->tag == tag) {
                break;
            }
            state = state->prev;
        } while (state != NULL);
    }
    if (state == NULL) {
        return FALSE;
    }
    frameHeap->frame.head = state->head;
    frameHeap->frame.tail = state->tail;
    frameHeap->frame.state = state->prev;
    return TRUE;
}
