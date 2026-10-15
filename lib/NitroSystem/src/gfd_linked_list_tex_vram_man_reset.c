#include <nitro.h>
#include <nnsys/gfd_internal.h>

// Built with a different compiler version than the rest of the module (see the Makefile), so it is
// its own translation unit. It also defines the manager state.

#pragma force_active on

// Free/normal/4x4 byte counts of the four 128 KB texture VRAM slots.
typedef struct LnkTexVramSlot {
    u32 szFree;
    u32 szNrm;
    u32 sz4x4;
} LnkTexVramSlot;

typedef struct LnkTexVramSlotTable {
    LnkTexVramSlot slot[4];
} LnkTexVramSlotTable;

LnkVramBlock *gLnkTexVramFreeList4x4; // free list for 4x4-compressed texel data
LnkVramBlock *gLnkTexVramFreeList;    // free list for other textures (start of the whole manager state)
LnkTexVramManagerWork gLnkTexVramWork;

extern const LnkTexVramSlotTable gLnkTexVramSlotTable;

void NNS_GfdResetLnkTexVramState(void) {
    u32 restNrm;
    LnkTexVramSlotTable tbl = gLnkTexVramSlotTable;
    LnkTexVramSlot *t;
    u32 j;
    LnkTexVramSlot *s;
    u32 rest4x4 = ((LnkTexVramManager *)&gLnkTexVramFreeList)->work.szByteFor4x4;
    restNrm = ((LnkTexVramManager *)&gLnkTexVramFreeList)->work.szByte - (rest4x4 + rest4x4 / 2);
    u32 pltt = rest4x4 / 2;
    u32 i;
    u32 n;
    for (i = 0, s = tbl.slot; i < 4; i++, s++) {
        if (i == 0 || i == 2) {
            if (s->szFree != 0 && rest4x4 != 0) {
                n = s->szFree;
                if (n > rest4x4) {
                    n = rest4x4;
                }
                s->sz4x4 += n;
                rest4x4 -= n;
                s->szFree -= n;
            }
        }
    }
    tbl.slot[1].szFree -= pltt;
    for (j = 0, t = tbl.slot; j < 4; j++, t++) {
        if (t->szFree != 0 && restNrm != 0) {
            n = t->szFree;
            if (n > restNrm) {
                n = restNrm;
            }
            t->szNrm += n;
            t->szFree -= n;
            restNrm -= n;
        }
    }
    NNSi_GfdInitLnkVramMan(&gLnkTexVramFreeList);
    NNSi_GfdInitLnkVramMan(&gLnkTexVramFreeList4x4);
    gLnkTexVramWork.blockPool = NNSi_GfdInitLnkVramBlockPool(gLnkTexVramWork.pWork, gLnkTexVramWork.szWork / 16);
    if (tbl.slot[0].sz4x4 != 0) {
        NNSi_GfdAddNewFreeBlock(&gLnkTexVramFreeList4x4, &gLnkTexVramWork.blockPool, 0, tbl.slot[0].sz4x4);
    }
    {
        u32 sz = tbl.slot[0].szNrm;
        u32 ofs = tbl.slot[0].sz4x4;
        if (sz != 0) {
            NNSi_GfdAddNewFreeBlock(&gLnkTexVramFreeList, &gLnkTexVramWork.blockPool, ofs, sz);
        }
    }
    if (tbl.slot[2].sz4x4 != 0) {
        NNSi_GfdAddNewFreeBlock(&gLnkTexVramFreeList4x4, &gLnkTexVramWork.blockPool, 0x40000, tbl.slot[2].sz4x4);
    }
    {
        u32 sz = tbl.slot[2].szNrm;
        u32 ofs = tbl.slot[2].sz4x4;
        if (sz != 0) {
            NNSi_GfdAddNewFreeBlock(&gLnkTexVramFreeList, &gLnkTexVramWork.blockPool, 0x40000 + ofs, sz);
        }
    }
    if (tbl.slot[3].szNrm != 0) {
        NNSi_GfdAddNewFreeBlock(&gLnkTexVramFreeList, &gLnkTexVramWork.blockPool, 0x60000, tbl.slot[3].szNrm);
    }
    if (tbl.slot[1].szNrm != 0) {
        NNSi_GfdAddNewFreeBlock(&gLnkTexVramFreeList, &gLnkTexVramWork.blockPool, pltt + 0x20000, tbl.slot[1].szNrm);
    }
    NNSi_GfdMergeAllFreeBlocks(&gLnkTexVramFreeList, &gLnkTexVramWork.blockPool);
    NNSi_GfdMergeAllFreeBlocks(&gLnkTexVramFreeList4x4, &gLnkTexVramWork.blockPool);
}
