#include <nitro.h>
#include <nnsys/gfd_internal.h>

// The manager state is defined (as three objects) next to NNS_GfdResetLnkTexVramState; the init and
// alloc code addresses all of it through its first object.
extern LnkTexVramManager gLnkTexVramFreeList;
extern LnkVramBlock *gLnkTexVramFreeList4x4; // free list for 4x4-compressed texel data
extern LnkTexVramManagerWork gLnkTexVramWork;

u32 NNS_GfdGetLnkTexVramManagerWorkSize(u32 numMemBlk) {
    return numMemBlk << 4;
}

void NNS_GfdInitLnkTexVramManager(u32 szByte, u32 szByteFor4x4, void *pManagementWork, u32 szByteManagementWork, BOOL useAsDefault) {
    gLnkTexVramFreeList.work.szByte = szByte;
    gLnkTexVramFreeList.work.szByteFor4x4 = szByteFor4x4;
    gLnkTexVramFreeList.work.pWork = pManagementWork;
    gLnkTexVramFreeList.work.szWork = szByteManagementWork;
    NNS_GfdResetLnkTexVramState();
    if (useAsDefault) {
        NNS_GfdDefaultFuncAllocTexVram = NNS_GfdAllocLnkTexVram;
        NNS_GfdDefaultFuncFreeTexVram = NNS_GfdFreeLnkTexVram;
    }
}

NNSGfdTexKey NNS_GfdAllocLnkTexVram(u32 szByte, BOOL is4x4comp, u32 opt) {
    u32 size;
    u32 addr;
    u32 ret;
    if (szByte == 0) {
        size = 16;
    } else {
        size = (szByte + 15) & ~15;
    }
    if (size >= 0x7FFF0) {
        return NNS_GFD_ALLOC_ERROR_TEXKEY;
    }
    if (is4x4comp != 0) {
        ret = NNSi_GfdAllocLnkVram(&gLnkTexVramFreeList.freeListFor4x4, &gLnkTexVramFreeList.work.blockPool, &addr, size);
    } else {
        ret = NNSi_GfdAllocLnkVram(&gLnkTexVramFreeList.freeList, &gLnkTexVramFreeList.work.blockPool, &addr, size);
    }
    if (ret == 0) {
        return NNS_GFD_ALLOC_ERROR_TEXKEY;
    }
    return ((size >> 4) << 16) | ((addr << 13) >> 16) | (is4x4comp << 31);
}

#pragma force_active on

int NNS_GfdFreeLnkTexVram(NNSGfdTexKey key) {
    u32 addr = (key & 0xffff) << 3;
    u32 size = ((key & 0x7fff0000) >> 16) << 4;
    u32 is4x4comp = (key & 0x80000000) >> 31;
    BOOL ok;
    if (size != 0) {
        if (is4x4comp) {
            ok = NNSi_GfdFreeLnkVram(&gLnkTexVramFreeList4x4, &gLnkTexVramWork.blockPool, addr, size);
        } else {
            ok = NNSi_GfdFreeLnkVram(&gLnkTexVramFreeList.freeList, &gLnkTexVramWork.blockPool, addr, size);
        }
        if (ok) {
            return 0;
        } else {
            return 1;
        }
    }
    return 2;
}
