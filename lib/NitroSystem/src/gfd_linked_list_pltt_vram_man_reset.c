#include <nitro.h>
#include <nnsys/gfd_internal.h>

// Built with a different compiler version than the rest of the module (see the Makefile), so it is
// its own translation unit. It also defines the manager state.

#pragma force_active on

LnkPlttVramManager gLnkPlttVramManager;

void NNS_GfdResetLnkPlttVramState(void) {
    gLnkPlttVramManager.blockPool = NNSi_GfdInitLnkVramBlockPool(gLnkPlttVramManager.pWork, gLnkPlttVramManager.szWork / 16);
    NNSi_GfdInitLnkVramMan(&gLnkPlttVramManager.freeList);
    NNSi_GfdAddNewFreeBlock(&gLnkPlttVramManager.freeList, &gLnkPlttVramManager.blockPool, 0, gLnkPlttVramManager.szByte);
    NNSi_GfdMergeAllFreeBlocks(&gLnkPlttVramManager.freeList, &gLnkPlttVramManager.blockPool);
}
