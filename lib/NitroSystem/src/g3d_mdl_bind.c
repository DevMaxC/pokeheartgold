#include <nitro.h>
#include <nnsys/g3d_internal.h>

#pragma force_active on

static inline G3dResMat *GetResMat(NNSG3dResMdl *pResMdl) {
    if (pResMdl && pResMdl->ofsMat) {
        return (G3dResMat *)((u8 *)pResMdl + pResMdl->ofsMat);
    }
    return NULL;
}

static inline G3dResMatData *GetResMatDataByIdx(G3dResMat *pMat, u32 idx) {
    if (pMat) {
        u32 *pOffset = NNS_G3dGetResDataByIdx(&pMat->dict, idx);
        if (pOffset) {
            return (G3dResMatData *)((u8 *)pMat + *pOffset);
        }
    }
    return NULL;
}

static inline const NNSG3dResName *GetResNameByIdx(const NNSG3dResDict *pDict, u32 idx) {
    if (pDict && idx < pDict->numEntry) {
        NNSG3dResDictEntryHeader *pHeader = (NNSG3dResDictEntryHeader *)((u8 *)pDict + pDict->ofsEntry);
        return (const NNSG3dResName *)((u8 *)pHeader + pHeader->ofsName + idx * sizeof(NNSG3dResName));
    }
    return NULL;
}

// binds a texture to the materials of pBind: image address, format and size, and the scale from the
// material's original size
void bindMdlTex_Internal_(G3dResMat *pMat, G3dResBindEntry *pBind, const NNSG3dResTex *pTex, const G3dResTexData *pTexData) {
    u32 texBase;
    u32 i;
    u8 *pMatIdx = (u8 *)pMat + pBind->ofsMatIdxList;
    if ((pTexData->texImageParam & 0x1C000000) != (GX_TEXFMT_COMP4x4 << 26)) {
        texBase = (u16)pTex->texInfo.vramKey & ~0xE0000000;
    } else {
        texBase = (u16)pTex->tex4x4Info.vramKey & ~0xE0000000;
    }
    for (i = 0; i < pBind->numMat; i++) {
        G3dResMatData *pMatData = GetResMatDataByIdx(pMat, pMatIdx[i]);
        u32 width, height;
        pMatData->texImageParam |= pTexData->texImageParam + texBase;
        width = G3D_RESTEXDATA_WIDTH(pTexData->extraParam);
        height = G3D_RESTEXDATA_HEIGHT(pTexData->extraParam);
        pMatData->scaleS = width == pMatData->origWidth ? FX32_ONE : FX_Div(width << FX32_SHIFT, pMatData->origWidth << FX32_SHIFT);
        pMatData->scaleT = height == pMatData->origHeight ? FX32_ONE : FX_Div(height << FX32_SHIFT, pMatData->origHeight << FX32_SHIFT);
    }
    pBind->flag |= G3D_RESBIND_BOUND;
}

void releaseMdlTex_Internal_(G3dResMat *pMat, G3dResBindEntry *pBind) {
    u8 *pMatIdx = (u8 *)pMat + pBind->ofsMatIdxList;
    u32 i = 0;
    while (i < pBind->numMat) {
        G3dResMatData *pMatData = GetResMatDataByIdx(pMat, pMatIdx[i]);
        pMatData->texImageParam &= G3D_RESMATDATA_TEXIMAGEPARAM_KEEP_MASK;
        pMatData->scaleS = FX32_ONE;
        pMatData->scaleT = FX32_ONE;
        i++;
    }
    pBind->flag &= ~G3D_RESBIND_BOUND;
}

// binds the textures of pTex to the materials that use them by name; FALSE if any texture is missing
BOOL NNS_G3dBindMdlTex(NNSG3dResMdl *pResMdl, const NNSG3dResTex *pTex) {
    NNSG3dResDict *pDict;
    u32 i;
    BOOL result = TRUE;
    G3dResMat *pMat = GetResMat(pResMdl);
    pDict = (NNSG3dResDict *)((u8 *)pMat + pMat->ofsDictTexToMatList);
    i = 0;
    while (i < pDict->numEntry) {
        const NNSG3dResName *pName = GetResNameByIdx(pDict, i);
        const G3dResTexData *pTexData;
        if (pTex) {
            pTexData = NNS_G3dGetResDataByName(&pTex->dict, pName);
        } else {
            pTexData = NULL;
        }
        if (pTexData) {
            G3dResBindEntry *pBind = NNS_G3dGetResDataByIdx(pDict, i);
            if (!(pBind->flag & G3D_RESBIND_BOUND)) {
                bindMdlTex_Internal_(pMat, pBind, pTex, pTexData);
            }
        } else {
            result = FALSE;
        }
        i++;
    }
    return result;
}

BOOL NNS_G3dForceBindMdlTex(NNSG3dResMdl *pResMdl, const NNSG3dResTex *pTex, u32 texToMatListIdx, u32 texIdx) {
    G3dResMat *pMat = GetResMat(pResMdl);
    NNSG3dResDict *pDict = (NNSG3dResDict *)((u8 *)pMat + pMat->ofsDictTexToMatList);
    const G3dResTexData *pTexData = pTex ? NNS_G3dGetResDataByIdx(&pTex->dict, texIdx) : NULL;
    G3dResBindEntry *pBind = NNS_G3dGetResDataByIdx(pDict, texToMatListIdx);
    if (!pBind) {
        return FALSE;
    }
    bindMdlTex_Internal_(pMat, pBind, pTex, pTexData);
    return TRUE;
}

void NNS_G3dReleaseMdlTex(NNSG3dResMdl *pResMdl) {
    G3dResMat *pMat = GetResMat(pResMdl);
    NNSG3dResDict *pDict = (NNSG3dResDict *)((u8 *)pMat + pMat->ofsDictTexToMatList);
    u32 i = 0;
    while (i < pDict->numEntry) {
        G3dResBindEntry *pBind = NNS_G3dGetResDataByIdx(pDict, i);
        if (pBind->flag & G3D_RESBIND_BOUND) {
            releaseMdlTex_Internal_(pMat, pBind);
        }
        i++;
    }
}

// sets the palette base of the materials of pBind
void bindMdlPltt_Internal_(G3dResMat *pMat, G3dResBindEntry *pBind, const NNSG3dResTex *pTex, const G3dResPlttData *pPlttData) {
    u16 flag;
    u16 offset;
    u32 plttKey;
    u16 plttBase;
    u8 *pMatIdx;
    u32 i;
    plttKey = (u16)pTex->plttInfo.vramKey;
    flag = pPlttData->flag;
    pMatIdx = (u8 *)pMat + pBind->ofsMatIdxList;
    plttBase = (u16)(plttKey & ~0xE0000000);
    offset = pPlttData->offset;
    if (!(flag & G3D_RESPLTTDATA_4COLOR)) {
        offset = (u16)(offset >> 1);
        plttBase = (u16)(plttBase >> 1);
    }
    i = 0;
    if (i < pBind->numMat) {
        do {
            G3dResMatData *pMatData = GetResMatDataByIdx(pMat, pMatIdx[i]);
            pMatData->texPlttBase = (u16)(offset + plttBase);
            i++;
        } while (i < pBind->numMat);
    }
    pBind->flag |= G3D_RESBIND_BOUND;
}

// binds the palettes of pTex to the materials that use them by name; FALSE if any palette is missing
BOOL NNS_G3dBindMdlPltt(NNSG3dResMdl *pResMdl, const NNSG3dResTex *pTex) {
    NNSG3dResDict *pDict;
    u32 i;
    BOOL result = TRUE;
    G3dResMat *pMat = GetResMat(pResMdl);
    pDict = (NNSG3dResDict *)((u8 *)pMat + pMat->ofsDictPlttToMatList);
    i = 0;
    while (i < pDict->numEntry) {
        const NNSG3dResName *pName = GetResNameByIdx(pDict, i);
        const G3dResPlttData *pPlttData;
        if (pTex && pTex->plttInfo.ofsDict) {
            pPlttData = NNS_G3dGetResDataByName((NNSG3dResDict *)((u8 *)pTex + pTex->plttInfo.ofsDict), pName);
        } else {
            pPlttData = NULL;
        }
        if (pPlttData) {
            G3dResBindEntry *pBind = NNS_G3dGetResDataByIdx(pDict, i);
            if (!(pBind->flag & G3D_RESBIND_BOUND)) {
                bindMdlPltt_Internal_(pMat, pBind, pTex, pPlttData);
            }
        } else {
            result = FALSE;
        }
        i++;
    }
    return result;
}

BOOL NNS_G3dForceBindMdlPltt(NNSG3dResMdl *pResMdl, const NNSG3dResTex *pTex, u32 plttToMatListIdx, u32 plttIdx) {
    G3dResMat *pMat = GetResMat(pResMdl);
    NNSG3dResDict *pDict = (NNSG3dResDict *)((u8 *)pMat + pMat->ofsDictPlttToMatList);
    const G3dResPlttData *pPlttData;
    if (pTex && pTex->plttInfo.ofsDict) {
        pPlttData = NNS_G3dGetResDataByIdx((NNSG3dResDict *)((u8 *)pTex + pTex->plttInfo.ofsDict), plttIdx);
    } else {
        pPlttData = NULL;
    }
    G3dResBindEntry *pBind = NNS_G3dGetResDataByIdx(pDict, plttToMatListIdx);
    if (pBind && !(pBind->flag & G3D_RESBIND_BOUND)) {
        bindMdlPltt_Internal_(pMat, pBind, pTex, pPlttData);
        return TRUE;
    }
    return FALSE;
}

void NNS_G3dReleaseMdlPltt(NNSG3dResMdl *pResMdl) {
    G3dResMat *pMat = GetResMat(pResMdl);
    NNSG3dResDict *pDict = (NNSG3dResDict *)((u8 *)pMat + pMat->ofsDictPlttToMatList);
    u32 i = 0;
    while (i < pDict->numEntry) {
        G3dResBindEntry *pBind = NNS_G3dGetResDataByIdx(pDict, i);
        if (pBind->flag & G3D_RESBIND_BOUND) {
            pBind->flag &= ~G3D_RESBIND_BOUND;
        }
        i++;
    }
}

BOOL NNS_G3dBindMdlSet(NNSG3dResMdlSet *pMdlSet, const NNSG3dResTex *pTex) {
    u32 i;
    BOOL result = TRUE;
    i = 0;
    while (i < pMdlSet->dict.numEntry) {
        NNSG3dResMdl *pResMdl = NNS_G3dGetMdlByIdx(pMdlSet, i);
        result &= NNS_G3dBindMdlTex(pResMdl, pTex);
        result &= NNS_G3dBindMdlPltt(pResMdl, pTex);
        i++;
    }
    return result;
}

void NNS_G3dReleaseMdlSet(NNSG3dResMdlSet *pMdlSet) {
    u32 i = 0;
    while (i < pMdlSet->dict.numEntry) {
        NNSG3dResMdl *pResMdl = NNS_G3dGetMdlByIdx(pMdlSet, i);
        NNS_G3dReleaseMdlTex(pResMdl);
        NNS_G3dReleaseMdlPltt(pResMdl);
        i++;
    }
}

#pragma force_active off
