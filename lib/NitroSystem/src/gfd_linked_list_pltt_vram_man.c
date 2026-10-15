#include <nitro.h>
#include <nnsys/gfd_internal.h>

extern LnkPlttVramManager gLnkPlttVramManager;

u32 NNS_GfdGetLnkPlttVramManagerWorkSize(u32 numMemBlk) {
    return numMemBlk << 4;
}

void NNS_GfdInitLnkPlttVramManager(u32 szByte, void *pManagementWork, u32 szByteManagementWork, BOOL useAsDefault) {
    gLnkPlttVramManager.szByte = szByte;
    gLnkPlttVramManager.pWork = pManagementWork;
    gLnkPlttVramManager.szWork = szByteManagementWork;
    NNS_GfdResetLnkPlttVramState();
    if (useAsDefault) {
        NNS_GfdDefaultFuncAllocPlttVram = NNS_GfdAllocLnkPlttVram;
        NNS_GfdDefaultFuncFreePlttVram = NNS_GfdFreeLnkPlttVram;
    }
}

NNSGfdPlttKey NNS_GfdAllocLnkPlttVram(u32 szByte, BOOL is4pltt, u32 opt) {
    u32 size;
    u32 addr;
    u32 ret;
    if (szByte == 0) {
        size = 8;
    } else {
        size = (szByte + 7) & ~7;
    }
    if (size >= 0x7FFF8) {
        return NNS_GFD_ALLOC_ERROR_PLTTKEY;
    }
    if (is4pltt) {
        // 4-colour palettes must lie in the first 64 KB
        ret = NNSi_GfdAllocLnkVramAligned(&gLnkPlttVramManager.freeList, &gLnkPlttVramManager.blockPool, &addr, size, 8);
        if (addr + size > 0x10000) {
            NNSi_GfdFreeLnkVram(&gLnkPlttVramManager.freeList, &gLnkPlttVramManager.blockPool, addr, size);
            return NNS_GFD_ALLOC_ERROR_PLTTKEY;
        }
    } else {
        ret = NNSi_GfdAllocLnkVramAligned(&gLnkPlttVramManager.freeList, &gLnkPlttVramManager.blockPool, &addr, size, 16);
    }
    if (ret == 0) {
        return NNS_GFD_ALLOC_ERROR_PLTTKEY;
    }
    return ((size >> 3) << 16) | ((addr << 13) >> 16);
}

int NNS_GfdFreeLnkPlttVram(NNSGfdPlttKey key) {
    u32 size = ((key & 0xFFFF0000) >> 16) << 3;
    u32 addr = (key << 16) >> 13;
    int ret = NNSi_GfdFreeLnkVram(&gLnkPlttVramManager.freeList, &gLnkPlttVramManager.blockPool, addr, size);
    return ret == 0;
}
