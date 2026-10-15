#include <nitro.h>
#include <nnsys/g2d_internal.h>
#include <stddef.h>

void CpuLoadOAMSub_(const void *pSrc, u32 offset, u32 szByte) {
    MIi_CpuCopy16(pSrc, (void *)(offset + HW_DB_OAM), szByte);
}

void CpuLoadOAMMain_(const void *pSrc, u32 offset, u32 szByte) {
    MIi_CpuCopy16(pSrc, (void *)(offset + HW_OAM), szByte);
}

void NNS_G2dInitOamManagerModule(void) {
    MIi_CpuClear16(0xc0, (u16 *)gOamBufferMainOam, sizeof(gOamBuffers[0].oamBuffer));
    MIi_CpuClear16(0xc0, (u16 *)gOamBufferSubOam, sizeof(gOamBuffers[0].oamBuffer));
    MIi_CpuClear16(0xc0, (u16 *)gOamBufferSoftOam, sizeof(gOamBuffers[0].oamBuffer));
    MIi_CpuClear16(OAM_MANAGER_NO_OWNER, gOamBuffers[0].oamOwners, sizeof(gOamBuffers[0].oamOwners));
    MIi_CpuClear16(OAM_MANAGER_NO_OWNER, gOamBufferSubOamOwners, sizeof(gOamBuffers[0].oamOwners));
    MIi_CpuClear16(OAM_MANAGER_NO_OWNER, gOamBufferSoftOamOwners, sizeof(gOamBuffers[0].oamOwners));
    MIi_CpuClear16(OAM_MANAGER_NO_OWNER, gOamBufferMainAffineOwners, sizeof(gOamBuffers[0].affineOwners));
    MIi_CpuClear16(OAM_MANAGER_NO_OWNER, gOamBufferSubAffineOwners, sizeof(gOamBuffers[0].affineOwners));
    MIi_CpuClear16(OAM_MANAGER_NO_OWNER, gOamBufferSoftAffineOwners, sizeof(gOamBuffers[0].affineOwners));
}

#pragma force_active on

static inline BOOL IsOamRangeFree(const u16 *owners, u16 first, u16 last) {
    const u16 *p = owners + first;
    const u16 *end = owners + last;
    for (; p <= end; p++) {
        if (*p != OAM_MANAGER_NO_OWNER) {
            return FALSE;
        }
    }
    return TRUE;
}

static inline BOOL IsAffineRangeFree(const u16 *owners, u32 first, u32 last) {
    const u16 *p = owners + first;
    const u16 *end = owners + last;
    for (; p <= end; p++) {
        if (*p != OAM_MANAGER_NO_OWNER) {
            return FALSE;
        }
    }
    return TRUE;
}

BOOL NNS_G2dGetNewOamManagerInstance(OamManagerInstance *pMan, u16 oamFirst, u16 numOam, u16 affineFirst, u16 numAffine, int type) {
    OamManagerBuffer *buffer = &gOamBuffers[type];
    u16 oamLast = oamFirst + (numOam - 1);
    if (IsOamRangeFree(buffer->oamOwners, oamFirst, oamLast)) {
        pMan->managerId = gOamManagerNextId++;
        pMan->oam.first = oamFirst;
        pMan->oam.last = oamLast;
        pMan->oam.next = oamFirst;
        MIi_CpuClear16(pMan->managerId, &buffer->oamOwners[oamFirst], (oamLast - oamFirst + 1) * 2);
    } else {
        return FALSE;
    }
    u16 *affineOwners = buffer->affineOwners;
    if (numAffine == 0) {
        pMan->affine.first = 32;
        pMan->affine.last = 0;
        pMan->affine.next = pMan->affine.first;
    } else {
        u16 affineLast = affineFirst + (numAffine - 1);
        if (IsAffineRangeFree(affineOwners, affineFirst, affineLast)) {
            pMan->affine.first = affineFirst;
            pMan->affine.last = affineLast;
            pMan->affine.next = affineFirst;
            MIi_CpuClear16(pMan->managerId, &affineOwners[affineFirst], (affineLast - affineFirst + 1) * 2);
        } else {
            return FALSE;
        }
    }
    pMan->useFastTransfer = FALSE;
    pMan->type = type;
    return TRUE;
}

static inline BOOL IsRangeValid(OamManagerRange *range) {
    BOOL result = FALSE;
    if (range->next <= range->last + 1) {
        if (range->first <= range->last) {
            result = TRUE;
        }
    }
    return result;
}

static inline u16 GetRangeCapacity(OamManagerRange *range) {
    if (IsRangeValid(range)) {
        return range->last - range->next + 1;
    }
    return 0;
}

static inline BOOL CanEntry(OamManagerRange *range) {
    return GetRangeCapacity(range) >= 1;
}

#pragma opt_propagation off

BOOL NNS_G2dEntryOamManagerOamWithAffineIdx(OamManagerInstance *pMan, const GXOamAttr *pOam, u16 affineIndex) {
    BOOL available = CanEntry((void *)&pMan->oam); // through void *: needed for the match
    if (available) {
        u32 type = pMan->type;
        u8 *oamBuffer = (u8 *)gOamBuffers + type * sizeof(OamManagerBuffer) + offsetof(OamManagerBuffer, oamBuffer);
        GXOamAttr *dst = (GXOamAttr *)(oamBuffer + pMan->oam.next * sizeof(GXOamAttr));
        dst->attr0 = pOam->attr0;
        dst->attr1 = pOam->attr1;
        dst->attr2 = pOam->attr2;
        if (affineIndex != OAM_MANAGER_NO_AFFINE) {
            GXOamAttr *attr = dst;
            if (attr->rsMode & 1) {
                attr->rsParam = affineIndex & 31;
            }
        }
        ++pMan->oam.next;
        return TRUE;
    }
    return FALSE;
}

// the affine parameters live in the fourth halfword of four consecutive OAM entries
u16 NNS_G2dEntryOamManagerAffine(OamManagerInstance *pMan, const MtxFx22 *mtx) {
    u8 *dst;
    u32 type;
    u8 *buffers;
    BOOL available = CanEntry((void *)&pMan->affine); // through void *: needed for the match
    if (available) {
        type = pMan->type;
        buffers = (u8 *)gOamBuffers;
        dst = buffers + type * sizeof(OamManagerBuffer) + offsetof(OamManagerBuffer, oamBuffer) + pMan->affine.next * 4 * sizeof(GXOamAttr);
        u16 affineIndex = pMan->affine.next;
        ((GXOamAttr *)dst)[0]._3 = mtx->_00 >> 4;
        ((GXOamAttr *)dst)[1]._3 = mtx->_01 >> 4;
        ((GXOamAttr *)dst)[2]._3 = mtx->_10 >> 4;
        ((GXOamAttr *)dst)[3]._3 = mtx->_11 >> 4;
        ++pMan->affine.next;
        return affineIndex;
    }
    return OAM_MANAGER_NO_AFFINE;
}

#pragma opt_propagation reset

static inline void LoadOam(OamManagerInstance *pMan) {
    u32 type = pMan->type;
    GXOamAttr *src = gOamBuffers[type].oamBuffer + pMan->oam.first;
    u16 count = pMan->oam.last - pMan->oam.first + 1;
    u16 offset = pMan->oam.first * 8;
    u16 i;
    OamLoadFunc load = gOamLoadFuncs[type];
    for (i = 0; i < count; i++) {
        load(src, offset, 6);
        offset += 8;
        src++;
    }
}

static inline void LoadAffine(OamManagerInstance *pMan) {
    u32 type = pMan->type;
    u8 *src = (u8 *)gOamBuffers[type].oamBuffer + pMan->affine.first * 32;
    u16 count = pMan->affine.last - pMan->affine.first + 1;
    u16 offset = pMan->affine.first * 32;
    u16 i;
    OamLoadFunc load = gOamLoadFuncs[type];
    for (i = 0; i < count; i++) {
        load(src + 6, offset + 6, 2);
        load(src + 14, offset + 14, 2);
        load(src + 22, offset + 22, 2);
        load(src + 30, offset + 30, 2);
        offset += 32;
        src += 32;
    }
}

void NNS_G2dApplyOamManagerToHW(OamManagerInstance *pMan) {
    if (pMan->useFastTransfer) {
        u32 type = pMan->type;
        GXOamAttr *src = gOamBuffers[type].oamBuffer + pMan->oam.first;
        u16 offset = (u16)(pMan->oam.first * 8);
        u16 szByte = (u16)((pMan->oam.last - pMan->oam.first + 1) * 8);
        DC_FlushRange(src, szByte);
        switch (type) {
        case 0:
            GX_LoadOAM(src, offset, szByte);
            break;
        case 1:
            GXS_LoadOAM(src, offset, szByte);
            break;
        }
    } else {
        LoadOam(pMan);
        if (IsRangeValid((void *)&pMan->affine)) { // through void *: needed for the match
            LoadAffine(pMan);
        }
    }
}

void NNS_G2dResetOamManagerBuffer(OamManagerInstance *pMan) {
    u8 *oam;
    if (pMan->useFastTransfer) {
        u32 szByte = IsRangeValid(&pMan->oam) ? (u16)(pMan->oam.last - pMan->oam.first + 1) * 8 : 0;
        u32 addr = pMan->type;
        addr = (u32)&gOamBuffers[addr].oamBuffer[pMan->oam.first];
        oam = (u8 *)addr;
        DC_InvalidateRange(oam, szByte);
        if (GXi_DmaId != (u32)-1) { // -1: no DMA channel
            MI_DmaFill32(GXi_DmaId, oam, 0xc0, szByte);
        } else {
            MIi_CpuClear32(0xc0, (void *)oam, szByte);
        }
    } else {
        u16 n;
        u16 i = 0;
        u32 addr = pMan->type;
        addr = (u32)&gOamBuffers[addr].oamBuffer[pMan->oam.first];
        oam = (u8 *)addr;
        n = pMan->oam.last - pMan->oam.first + 1;
        for (; i < n; i++, oam += 8) {
            ((GXOamAttr *)oam)->attr0 = 0xc0;
        }
    }
    pMan->oam.next = pMan->oam.first;
    pMan->affine.next = pMan->affine.first;
}

#pragma force_active off

void NNS_G2dApplyAndResetOamManagerBuffer(OamManagerInstance *pMan) {
    NNS_G2dApplyOamManagerToHW(pMan);
    NNS_G2dResetOamManagerBuffer(pMan);
}
