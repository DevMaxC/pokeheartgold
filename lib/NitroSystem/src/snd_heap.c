#include <nitro.h>
#include <nnsys/snd_arc_internal.h>
#include <stddef.h>

// the heap header sits at the (word aligned) start of the buffer, the frame heap behind it
NNSSndHeapHandle NNS_SndHeapCreate(void *buffer, u32 size) {
    u32 alignedAddr = (u32)buffer + 3;
    u8 *end = (u8 *)buffer + size;
    u8 *start = (u8 *)(alignedAddr & ~3);
    if (start > end) {
        return NULL;
    }
    u32 heapSize = end - start;
    if (heapSize < sizeof(struct NNSSndHeap)) {
        return NULL;
    }
    NNSFndHeapHandle frmHeap = NNS_FndCreateFrmHeapEx(start + sizeof(struct NNSSndHeap), heapSize - sizeof(struct NNSSndHeap), 0);
    if (!frmHeap) {
        return NULL;
    }
    if (InitHeap((NNSSndHeapHandle)start, frmHeap)) {
        return (NNSSndHeapHandle)start;
    }
    NNS_FndDestroyFrmHeap(frmHeap);
    return NULL;
}

void NNS_SndHeapDestroy(NNSSndHeapHandle heap) {
    NNS_SndHeapClear(heap);
    NNS_FndDestroyFrmHeap(heap->frmHeap);
}

#pragma force_active on

// releases every block (newest first) and frees the whole frame heap
BOOL NNS_SndHeapClear(NNSSndHeapHandle heap) {
    SndHeapSection *section;
    BOOL needSync = FALSE;
    SndHeapBlock *block;
    section = NNS_FndGetPrevListObject(&heap->sectionList, NULL);
    while (section) {
        block = NNS_FndGetPrevListObject(&section->blockList, NULL);
        while (block) {
            if (block->callback) {
                block->callback(block + 1, block->size, block->data1, block->data2);
                needSync = TRUE;
            }
            block = NNS_FndGetPrevListObject(&section->blockList, block);
        }
        NNS_FndRemoveListObject(&heap->sectionList, section);
        section = NNS_FndGetPrevListObject(&heap->sectionList, NULL);
    }
    NNS_FndFreeToFrmHeap(heap->frmHeap, SND_FRMHEAP_FREE_ALL);
    if (needSync) {
        EraseSync();
    }
    return NewSection(heap);
}

#pragma force_active off

void *NNS_SndHeapAlloc(NNSSndHeapHandle heap, u32 size, SndHeapDisposeCallback callback, u32 data1, u32 data2) {
    SndHeapBlock *block = NNS_FndAllocFromFrmHeapEx(heap->frmHeap, ((size + 31) & ~31) + sizeof(SndHeapBlock), 32);
    if (!block) {
        return NULL;
    }
    SndHeapSection *section = NNS_FndGetPrevListObject(&heap->sectionList, NULL);
    block->size = size;
    block->callback = callback;
    block->data1 = data1;
    block->data2 = data2;
    NNS_FndAppendListObject(&section->blockList, block);
    return block + 1;
}

// returns the level to pass to NNS_SndHeapLoadState, -1 on failure
int NNS_SndHeapSaveState(NNSSndHeapHandle heap) {
    u16 level = heap->sectionList.numObjects;
    NNSFndHeapHandle frmHeap = heap->frmHeap;
    if (!NNS_FndRecordStateForFrmHeap(frmHeap, level)) {
        return -1;
    }
    if (NewSection(heap)) {
        return heap->sectionList.numObjects - 1;
    }
    NNS_FndFreeByStateToFrmHeap(heap->frmHeap, 0);
    return -1;
}

#pragma force_active on

// releases the blocks of the sections saved after `level`
int NNS_SndHeapLoadState(NNSSndHeapHandle heap, int level) {
    SndHeapSection *section;
    BOOL needSync;
    SndHeapBlock *block;
    block = NULL;
    needSync = FALSE;
    if (level == 0) {
        return NNS_SndHeapClear(heap);
    }
    while (level < heap->sectionList.numObjects) {
        section = NNS_FndGetPrevListObject(&heap->sectionList, NULL);
        block = NNS_FndGetPrevListObject(&section->blockList, block);
        while (block) {
            if (block->callback) {
                block->callback(block + 1, block->size, block->data1, block->data2);
                needSync = TRUE;
            }
            block = NNS_FndGetPrevListObject(&section->blockList, block);
        }
        NNS_FndRemoveListObject(&heap->sectionList, section);
    }
    NNS_FndFreeByStateToFrmHeap(heap->frmHeap, level);
    if (needSync) {
        EraseSync();
    }
    NNS_FndRecordStateForFrmHeap(heap->frmHeap, heap->sectionList.numObjects);
    return NewSection(heap);
}

#pragma force_active off

u32 NNS_SndHeapGetSize(NNSSndHeapHandle heap) {
    NNSFndHeapHandle frmHeap = heap->frmHeap;
    return (u32)frmHeap->heapEnd - (u32)frmHeap;
}

u32 NNS_SndHeapGetFreeSize(NNSSndHeapHandle heap) {
    u32 freeSize = NNS_FndGetAllocatableSizeForFrmHeapEx(heap->frmHeap, 32);
    if (freeSize < sizeof(SndHeapBlock)) {
        return 0;
    }
    return (freeSize - sizeof(SndHeapBlock)) & ~31;
}

void InitHeapSection(SndHeapSection *section) {
    NNS_FndInitList(&section->blockList, offsetof(SndHeapBlock, link));
}

BOOL InitHeap(NNSSndHeapHandle heap, NNSFndHeapHandle frmHeap) {
    NNS_FndInitList(&heap->sectionList, offsetof(SndHeapSection, link));
    heap->frmHeap = frmHeap;
    if (NewSection(heap)) {
        return TRUE;
    }
    return FALSE;
}

BOOL NewSection(NNSSndHeapHandle heap) {
    SndHeapSection *section = NNS_FndAllocFromFrmHeapEx(heap->frmHeap, sizeof(SndHeapSection), 4);
    if (!section) {
        return FALSE;
    }
    InitHeapSection(section);
    NNS_FndAppendListObject(&heap->sectionList, section);
    return TRUE;
}

// waits until the driver no longer uses the released data
void EraseSync(void) {
    u32 tag = SND_GetCurrentCommandTag();
    SND_FlushCommand(SND_CMD_FLAG_BLOCK);
    SND_WaitForCommandProc(tag);
}
