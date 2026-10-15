#include <nitro.h>
#include <nnsys/gfd_internal.h>

// Region search orders: 2 entries for 4x4-compressed textures, directly followed by the 5 entries
// for other textures (gFrmTexVramSearchNormal).
extern FrmTexVramRegion *gFrmTexVramSearch4x4[];
extern FrmTexVramRegion *gFrmTexVramSearchNormal[5];
extern FrmTexVramRegion gFrmTexVramRegions[5]; // the slots
extern FrmTexVramRegion gFrmTexVramRegion1;    // slot 1 (palette index data for slot 0)
extern FrmTexVramRegion gFrmTexVramRegion2;    // slot 2 (palette index data for slot 3)
extern u16 gFrmTexVramSlotCount;               // number of slots in use

#pragma force_active on

void NNSi_GfdSetTexNrmSearchArray(int first, int second, int third, int fourth, int fifth) {
    FrmTexVramRegion *regions = gFrmTexVramRegions;
    (&gFrmTexVramSearch4x4[2])[0] = &regions[first];
    (&gFrmTexVramSearch4x4[2])[1] = &regions[second];
    (&gFrmTexVramSearch4x4[2])[2] = &regions[third];
    (&gFrmTexVramSearch4x4[2])[3] = &regions[fourth];
    (&gFrmTexVramSearch4x4[2])[4] = &regions[fifth];
}

void NNS_GfdInitFrmTexVramManager(u16 numSlot, BOOL useAsDefault) {
    if (numSlot <= 2) {
        NNSi_GfdSetTexNrmSearchArray(4, 3, 2, 0, 1);
    } else {
        NNSi_GfdSetTexNrmSearchArray(4, 3, 0, 2, 1);
    }
    gFrmTexVramSlotCount = numSlot;
    NNS_GfdResetFrmTexVramState();
    if (useAsDefault) {
        NNS_GfdDefaultFuncAllocTexVram = NNS_GfdAllocFrmTexVram;
        NNS_GfdDefaultFuncFreeTexVram = NNS_GfdFreeFrmTexVram;
    }
}

void NNS_GfdResetFrmTexVramState(void) {
    int i = 0;
    FrmTexVramRegion *region = gFrmTexVramRegions;
    u32 numActive = gFrmTexVramSlotCount;
    if (numActive > 1) {
        numActive++;
    }
    for (i = 0; i < 5; i++, region++) {
        if (i < (int)numActive) {
            region->active = TRUE;
        } else {
            region->active = FALSE;
        }
        if (region->is4x4Region) {
            region->head = 0;
            region->tail = 0x10000;
        } else {
            region->head = 0;
            region->tail = 0x20000;
        }
    }
}

static inline BOOL IsAllocatable(FrmTexVramRegion *region, u32 size) {
    return region->active && region->tail - region->head >= size;
}

static inline BOOL IsAllocatableC(const FrmTexVramRegion *region, u32 size) {
    return region->active && region->tail - region->head >= size;
}

static inline FrmTexVramRegion *GetPlttIndexRegion(u16 slot) {
    switch (slot) {
    case 0:
        return &gFrmTexVramRegion1;
    case 3:
        return &gFrmTexVramRegion2;
    default:
        return NULL;
    }
}

static inline BOOL Alloc4x4(u32 size, u32 *addr) {
    int i;
    for (i = 0; i < 2; i++) {
        FrmTexVramRegion *region = gFrmTexVramSearch4x4[i];
        if (IsAllocatable(region, size)) {
            FrmTexVramRegion *plttIndex = GetPlttIndexRegion(region->plttIndexSlot);
            if (IsAllocatable(plttIndex, size >> 1)) {
                u32 head = region->head;
                region->head = head + size;
                plttIndex->head += size >> 1;
                *addr = head + region->baseAddr;
                return TRUE;
            }
        }
    }
    return FALSE;
}

static inline BOOL AllocNormal(u32 size, u32 *addr) {
    int i;
    for (i = 0; i < 5; i++) {
        FrmTexVramRegion *region = gFrmTexVramSearchNormal[i];
        if (IsAllocatableC(region, size)) {
            region->tail -= size;
            *addr = region->tail + region->baseAddr;
            return TRUE;
        }
    }
    return FALSE;
}

NNSGfdTexKey NNS_GfdAllocFrmTexVram(u32 szByte, BOOL is4x4comp, u32 opt) {
    u32 addr;
    BOOL ok;
    u32 size;
    if (szByte == 0) {
        size = 16;
    } else {
        size = (szByte + 15) & ~15;
    }
    if (size >= 0x7fff0) {
        return NNS_GFD_ALLOC_ERROR_TEXKEY;
    }
    if (is4x4comp) {
        ok = Alloc4x4(size, &addr);
    } else {
        ok = AllocNormal(size, &addr);
    }
    if (!ok) {
        return NNS_GFD_ALLOC_ERROR_TEXKEY;
    }
    return ((size >> 4) << 16) | ((addr << 13) >> 16) | (is4x4comp << 31);
}

#pragma force_active reset

int NNS_GfdFreeFrmTexVram(NNSGfdTexKey key) {
    return 0;
}

void NNS_GfdGetFrmTexVramState(u32 *state) {
    int i = 0;
    u8 *region = (u8 *)gFrmTexVramRegions;
    int j = 0;
    do {
        state[j] = ((FrmTexVramRegion *)region)->head;
        state[j + 1] = ((FrmTexVramRegion *)region)->tail;
        i++;
        region += sizeof(FrmTexVramRegion);
        j += 2;
    } while (i < 5);
}

void NNS_GfdSetFrmTexVramState(const u32 *state) {
    int i = 0;
    int j;
    u8 *region = (u8 *)gFrmTexVramRegions;
    j = i;
    do {
        ((FrmTexVramRegion *)region)->head = state[j];
        ((FrmTexVramRegion *)region)->tail = state[j + 1];
        i++;
        j += 2;
        region += sizeof(FrmTexVramRegion);
    } while (i < 5);
}
