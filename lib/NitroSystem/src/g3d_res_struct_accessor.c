#include <nitro.h>
#include <nnsys/g3d/binres/res_struct.h>
#include <nnsys/g3d/binres/res_struct_accessor.h>
#include <nnsys/g3d/binres/res_struct_accessor_anm.h>
#include <nnsys/g3d_util_internal.h>

#pragma force_active on

static inline const NNSG3dResName *GetDictName(const NNSG3dResDict *pDict, u32 idx) {
    if (pDict && idx < pDict->numEntry) {
        NNSG3dResDictEntryHeader *pHeader = (NNSG3dResDictEntryHeader *)((u8 *)pDict + pDict->ofsEntry);
        return (const NNSG3dResName *)((u8 *)pHeader + pHeader->ofsName) + idx;
    }
    return NULL;
}

static inline void *GetDictData(const NNSG3dResDict *pDict, u32 idx) {
    if (pDict && idx < pDict->numEntry) {
        NNSG3dResDictEntryHeader *pHeader = (NNSG3dResDictEntryHeader *)((u8 *)pDict + pDict->ofsEntry);
        return pHeader->data + pHeader->sizeUnit * idx;
    }
    return NULL;
}

void *NNS_G3dGetResDataByName(const NNSG3dResDict *pDict, const NNSG3dResName *pName) {
    u32 idx;
    if (!pName) {
        return NULL;
    }
    if (pDict->numEntry < 16) {
        // few entries: linear search
        u32 val0 = pName->val[0];
        u32 val1 = pName->val[1];
        u32 val2 = pName->val[2];
        u32 val3 = pName->val[3];
        for (idx = 0; idx < pDict->numEntry; idx++) {
            const NNSG3dResName *pEntryName = GetDictName(pDict, idx);
            if (pEntryName->val[0] == val0 && pEntryName->val[1] == val1 && pEntryName->val[2] == val2 && pEntryName->val[3] == val3) {
                return GetDictData(pDict, idx);
            }
        }
    } else {
        // Patricia tree on the name bits
        const NNSG3dResDictTreeNode *pBase = pDict->node;
        const NNSG3dResDictTreeNode *pParent = pBase;
        const NNSG3dResDictTreeNode *pNode;
        const NNSG3dResDictTreeNode *pNext;
        u32 child = pParent->idxLeft;
        if (child) {
            pNext = pBase + child;
            while (pParent->refBit > pNext->refBit) {
                s32 bit = pNext->refBit;
                u32 dir = (pName->val[bit >> 5] >> (bit & 31)) & 1;
                pNode = pNext;
                child = *((const u8 *)((u32)pNode + dir) + 1); // idxLeft or idxRight
                pNext = pBase + child;
                pParent = pNode;
            }
            idx = pNext->idxEntry;
            {
                const NNSG3dResName *pEntryName = GetDictName(pDict, idx);
                if (pEntryName->val[0] == pName->val[0] && pEntryName->val[1] == pName->val[1] && pEntryName->val[2] == pName->val[2] && pEntryName->val[3] == pName->val[3]) {
                    return GetDictData(pDict, idx);
                }
            }
        }
    }
    return NULL;
}

int NNS_G3dGetResDictIdxByName(const NNSG3dResDict *pDict, const NNSG3dResName *pName) {
    u32 idx;
    if (!pName) {
        return -1;
    }
    if (pDict->numEntry < 16) {
        // few entries: linear search
        u32 val0 = pName->val[0];
        u32 val1 = pName->val[1];
        u32 val2 = pName->val[2];
        u32 val3 = pName->val[3];
        for (idx = 0; idx < pDict->numEntry; idx++) {
            const NNSG3dResName *pEntryName = GetDictName(pDict, idx);
            if (pEntryName->val[0] == val0 && pEntryName->val[1] == val1 && pEntryName->val[2] == val2 && pEntryName->val[3] == val3) {
                return idx;
            }
        }
    } else {
        // Patricia tree on the name bits
        const NNSG3dResDictTreeNode *pBase = pDict->node;
        const NNSG3dResDictTreeNode *pParent = pBase;
        const NNSG3dResDictTreeNode *pNode;
        const NNSG3dResDictTreeNode *pNext;
        u32 child = pParent->idxLeft;
        if (child) {
            pNext = pBase + child;
            while (pParent->refBit > pNext->refBit) {
                s32 bit = pNext->refBit;
                u32 dir = (pName->val[bit >> 5] >> (bit & 31)) & 1;
                pNode = pNext;
                child = *((const u8 *)((u32)pNode + dir) + 1); // idxLeft or idxRight
                pNext = pBase + child;
                pParent = pNode;
            }
            idx = pNext->idxEntry;
            {
                const NNSG3dResName *pEntryName = GetDictName(pDict, idx);
                if (pEntryName->val[0] == pName->val[0] && pEntryName->val[1] == pName->val[1] && pEntryName->val[2] == pName->val[2] && pEntryName->val[3] == pName->val[3]) {
                    return idx;
                }
            }
        }
    }
    return -1;
}

#pragma force_active off

NNSG3dResMdlSet *NNS_G3dGetMdlSet(const NNSG3dResFileHeader *header) {
    const u8 *pFile = (const u8 *)header;
    u16 ofsBlockOffsets = header->headerSize;
    return (NNSG3dResMdlSet *)(pFile + *(const u32 *)(pFile + ofsBlockOffsets));
}

NNSG3dResTex *NNS_G3dGetTex(const NNSG3dResFileHeader *header) {
    const u8 *pFile = (const u8 *)header;
    u16 ofsBlockOffsets = header->headerSize;
    u16 numBlocks = header->dataBlocks;
    const u8 *pBlockOffsets = pFile + ofsBlockOffsets;
    if (numBlocks == 1) {
        // a texture file has only the texture block; a model file's single block is the model set
        if (header->sigVal == G3D_RES_SIG_BTX0) {
            return (NNSG3dResTex *)(pFile + ((const u32 *)pBlockOffsets)[0]);
        }
        return NULL;
    }
    return (NNSG3dResTex *)(pFile + ((const u32 *)pBlockOffsets)[1]);
}

#pragma force_active on

// the first animation block of an animation file, its dictionary of animations
void *NNS_G3dGetAnmByIdx(const void *pRes, u32 idx) {
    const NNSG3dResFileHeader *pHeader = pRes;
    if (pHeader) {
        u8 *pBlock = (u8 *)pHeader + *(u32 *)((u8 *)pHeader + pHeader->headerSize);
        NNSG3dResDict *pDict = (NNSG3dResDict *)(pBlock + 8);
        u32 *pData;
        if (pDict && idx < pBlock[9]) {
            u8 *pEntries = (u8 *)pDict + *(u16 *)(pBlock + 14);
            u16 sizeUnit = *(u16 *)pEntries;
            pData = (u32 *)(pEntries + 4 + sizeUnit * idx);
        } else {
            pData = NULL;
        }
        if (pData) {
            return pBlock + *pData;
        }
    }
    return NULL;
}
