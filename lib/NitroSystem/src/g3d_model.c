#include <nitro.h>
#include <nnsys/g3d/model.h>
#include <nnsys/g3d/model_inline.h>
#include <nnsys/g3d_util_internal.h>

#pragma force_active on

// the pieces' material accessors (several variants; each is needed for the match where it is used)
static inline G3dResMat *GetMatBlock(NNSG3dResMdl *pResMdl) {
    if (pResMdl && pResMdl->ofsMat) {
        return (G3dResMat *)((u32)pResMdl + pResMdl->ofsMat);
    }
    return NULL;
}

static inline u8 *GetDictData(NNSG3dResDict *pDict, u32 idx) {
    if (pDict && idx < pDict->numEntry) {
        u16 *pEntryHeader = (u16 *)((u8 *)pDict + pDict->ofsEntry);
        return (u8 *)(pEntryHeader + 2) + pEntryHeader[0] * idx;
    }
    return NULL;
}

static inline G3dResMatData *GetMatData(G3dResMat *pResMat, u32 idx) {
    if (pResMat) {
        u8 *pData = GetDictData(&pResMat->dict, idx);
        if (pData) {
            return (G3dResMatData *)((u8 *)pResMat + *(u32 *)pData);
        }
    }
    return NULL;
}

#pragma opt_lifetimes off
#pragma opt_common_subs off

void NNSi_G3dModifyMatFlag(NNSG3dResMdl *pMdl, BOOL isOn, NNSG3dMatFlag flag) {
    u32 numMat = pMdl->info.numMat;
    u32 i;
    G3dResMat *pResMat = GetMatBlock(pMdl);
    for (i = 0; i < numMat; i++) {
        G3dResMatData *pMatData = GetMatData(pResMat, i);
        u32 matFlag = pMatData->flag;
        if (isOn) {
            matFlag |= flag;
        } else {
            matFlag &= ~flag;
        }
        pMatData->flag = matFlag;
    }
}

#pragma opt_lifetimes reset
#pragma opt_common_subs reset

#pragma opt_lifetimes off
#pragma opt_common_subs off

void NNSi_G3dModifyPolygonAttrMask(NNSG3dResMdl *pMdl, BOOL isOn, u32 mask) {
    u32 numMat = pMdl->info.numMat;
    u32 i;
    G3dResMat *pResMat = GetMatBlock(pMdl);
    for (i = 0; i < numMat; i++) {
        G3dResMatData *pMatData = GetMatData(pResMat, i);
        u32 attrMask = pMatData->polygonAttrMask;
        if (isOn) {
            attrMask |= mask;
        } else {
            attrMask &= ~mask;
        }
        pMatData->polygonAttrMask = attrMask;
    }
}

#pragma opt_lifetimes reset
#pragma opt_common_subs reset

#define LOW_COLOR_MASK  0x7FFF     // diffuse / specular colour (bits 0-14)
#define HIGH_COLOR_KEEP 0x8000FFFF // all but the ambient / emission colour (bits 16-30)

static inline u8 *GetMatBlock2(NNSG3dResMdl *pResMdl) {
    if (pResMdl && pResMdl->ofsMat) {
        return (u8 *)pResMdl + pResMdl->ofsMat;
    }
    return NULL;
}

static inline u8 *GetDictData2(u32 idx, u8 *pDict) {
    if (pDict && idx < ((NNSG3dResDict *)pDict)->numEntry) {
        u32 ofsEntry = ((NNSG3dResDict *)pDict)->ofsEntry;
        u32 sizeUnit = *(u16 *)((u32)pDict + ofsEntry);
        u8 *pData = (u8 *)((u32)pDict + ofsEntry + 4);
        return (u8 *)((u32)pData + sizeUnit * idx);
    }
    return NULL;
}

static inline G3dResMatData *GetMatData2(u8 *pResMat, u32 idx) {
    if (pResMat) {
        idx = (u32)GetDictData2(idx, pResMat + 4); // the dictionary entry, through idx (needed for the match)
        if (idx) {
            return (G3dResMatData *)(pResMat + *(u32 *)idx);
        }
    }
    return NULL;
}

static inline G3dResMatData *GetMdlMatData(NNSG3dResMdl *pResMdl, u32 matID) {
    return GetMatData2(GetMatBlock2(pResMdl), matID);
}

void NNS_G3dMdlSetMdlDiff(NNSG3dResMdl *pResMdl, u32 matID, u32 col) {
    G3dResMatData *pMatData = GetMdlMatData(pResMdl, matID);
    pMatData->prmMatColor0 = (pMatData->prmMatColor0 & ~LOW_COLOR_MASK) | col;
}

void NNS_G3dMdlSetMdlAmb(NNSG3dResMdl *pResMdl, u32 matID, u32 col) {
    G3dResMatData *pMatData = GetMdlMatData(pResMdl, matID);
    pMatData->prmMatColor0 = (pMatData->prmMatColor0 & HIGH_COLOR_KEEP) | (col << 16);
}

void NNS_G3dMdlSetMdlSpec(NNSG3dResMdl *pResMdl, u32 matID, u32 col) {
    G3dResMatData *pMatData = GetMdlMatData(pResMdl, matID);
    pMatData->prmMatColor1 = (pMatData->prmMatColor1 & ~LOW_COLOR_MASK) | col;
}

void NNS_G3dMdlSetMdlEmi(NNSG3dResMdl *pResMdl, u32 matID, u32 col) {
    G3dResMatData *pMatData = GetMdlMatData(pResMdl, matID);
    pMatData->prmMatColor1 = (pMatData->prmMatColor1 & HIGH_COLOR_KEEP) | (col << 16);
}

void NNS_G3dMdlSetMdlLightEnableFlag(NNSG3dResMdl *pResMdl, u32 matID, u32 light) {
    G3dResMatData *pMatData = GetMdlMatData(pResMdl, matID);
    pMatData->prmPolygonAttr = (pMatData->prmPolygonAttr & ~REG_G3_POLYGON_ATTR_LE_MASK) | light;
}

void NNS_G3dMdlSetMdlPolygonMode(NNSG3dResMdl *pResMdl, u32 matID, u32 polyMode) {
    G3dResMatData *pMatData = GetMdlMatData(pResMdl, matID);
    pMatData->prmPolygonAttr = (pMatData->prmPolygonAttr & ~REG_G3_POLYGON_ATTR_PM_MASK) | (polyMode << REG_G3_POLYGON_ATTR_PM_SHIFT);
}

void NNS_G3dMdlSetMdlCullMode(NNSG3dResMdl *pResMdl, u32 matID, u32 cullMode) {
    G3dResMatData *pMatData = GetMdlMatData(pResMdl, matID);
    pMatData->prmPolygonAttr = (pMatData->prmPolygonAttr & ~(REG_G3_POLYGON_ATTR_BK_MASK | REG_G3_POLYGON_ATTR_FR_MASK)) | (cullMode << REG_G3_POLYGON_ATTR_BK_SHIFT);
}

void NNS_G3dMdlSetMdlPolygonID(NNSG3dResMdl *pResMdl, u32 matID, u32 polygonID) {
    G3dResMatData *pMatData = GetMdlMatData(pResMdl, matID);
    pMatData->prmPolygonAttr = (pMatData->prmPolygonAttr & ~REG_G3_POLYGON_ATTR_ID_MASK) | (polygonID << REG_G3_POLYGON_ATTR_ID_SHIFT);
}

void NNS_G3dMdlSetMdlAlpha(NNSG3dResMdl *pResMdl, u32 matID, u32 alpha) {
    G3dResMatData *pMatData = GetMdlMatData(pResMdl, matID);
    pMatData->prmPolygonAttr = (pMatData->prmPolygonAttr & ~REG_G3_POLYGON_ATTR_ALPHA_MASK) | (alpha << REG_G3_POLYGON_ATTR_ALPHA_SHIFT);
}

void NNS_G3dMdlSetMdlFogEnableFlag(NNSG3dResMdl *pResMdl, u32 matID, BOOL flag) {
    G3dResMatData *pMatData = GetMdlMatData(pResMdl, matID);
    u32 attr = pMatData->prmPolygonAttr;
    if (flag) {
        attr |= REG_G3_POLYGON_ATTR_FE_MASK;
    } else {
        attr &= ~REG_G3_POLYGON_ATTR_FE_MASK;
    }
    pMatData->prmPolygonAttr = attr;
}

void NNS_G3dMdlSetMdlDepthTestCond(NNSG3dResMdl *pResMdl, u32 matID, BOOL flag) {
    G3dResMatData *pMatData = GetMdlMatData(pResMdl, matID);
    u32 attr = pMatData->prmPolygonAttr;
    if (flag) {
        attr |= REG_G3_POLYGON_ATTR_DT_MASK;
    } else {
        attr &= ~REG_G3_POLYGON_ATTR_DT_MASK;
    }
    pMatData->prmPolygonAttr = attr;
}

void NNS_G3dMdlSetMdl1Dot(NNSG3dResMdl *pResMdl, u32 matID, BOOL flag) {
    G3dResMatData *pMatData = GetMdlMatData(pResMdl, matID);
    u32 attr = pMatData->prmPolygonAttr;
    if (flag) {
        attr |= REG_G3_POLYGON_ATTR_D1_MASK;
    } else {
        attr &= ~REG_G3_POLYGON_ATTR_D1_MASK;
    }
    pMatData->prmPolygonAttr = attr;
}

void NNS_G3dMdlSetMdlFarClip(NNSG3dResMdl *pResMdl, u32 matID, BOOL flag) {
    G3dResMatData *pMatData = GetMdlMatData(pResMdl, matID);
    u32 attr = pMatData->prmPolygonAttr;
    if (flag) {
        attr |= REG_G3_POLYGON_ATTR_FC_MASK;
    } else {
        attr &= ~REG_G3_POLYGON_ATTR_FC_MASK;
    }
    pMatData->prmPolygonAttr = attr;
}

void NNS_G3dMdlSetMdlXLDepthUpdate(NNSG3dResMdl *pResMdl, u32 matID, BOOL flag) {
    G3dResMatData *pMatData = GetMdlMatData(pResMdl, matID);
    u32 attr = pMatData->prmPolygonAttr;
    if (flag) {
        attr |= REG_G3_POLYGON_ATTR_XL_MASK;
    } else {
        attr &= ~REG_G3_POLYGON_ATTR_XL_MASK;
    }
    pMatData->prmPolygonAttr = attr;
}

u32 NNS_G3dMdlGetMdlLightEnableFlag(const NNSG3dResMdl *pResMdl, u32 matID) {
    G3dResMatData *pMatData = GetMdlMatData((NNSG3dResMdl *)pResMdl, matID);
    return pMatData->prmPolygonAttr & REG_G3_POLYGON_ATTR_LE_MASK;
}

u32 NNS_G3dMdlGetMdlFogEnableFlag(const NNSG3dResMdl *pResMdl, u32 matID) {
    G3dResMatData *pMatData = GetMdlMatData((NNSG3dResMdl *)pResMdl, matID);
    return pMatData->prmPolygonAttr & REG_G3_POLYGON_ATTR_FE_MASK;
}

#pragma force_active off

void NNS_G3dMdlSetMdlDiffAll(NNSG3dResMdl *pResMdl, u32 col) {
    u32 i;
    for (i = 0; i < pResMdl->info.numMat; i++) {
        NNS_G3dMdlSetMdlDiff(pResMdl, i, col);
    }
}

void NNS_G3dMdlSetMdlAmbAll(NNSG3dResMdl *pResMdl, u32 col) {
    u32 i;
    for (i = 0; i < pResMdl->info.numMat; i++) {
        NNS_G3dMdlSetMdlAmb(pResMdl, i, col);
    }
}

void NNS_G3dMdlSetMdlSpecAll(NNSG3dResMdl *pResMdl, u32 col) {
    u32 i;
    for (i = 0; i < pResMdl->info.numMat; i++) {
        NNS_G3dMdlSetMdlSpec(pResMdl, i, col);
    }
}

void NNS_G3dMdlSetMdlEmiAll(NNSG3dResMdl *pResMdl, u32 col) {
    u32 i;
    for (i = 0; i < pResMdl->info.numMat; i++) {
        NNS_G3dMdlSetMdlEmi(pResMdl, i, col);
    }
}

void NNS_G3dMdlSetMdlLightEnableFlagAll(NNSG3dResMdl *pResMdl, u32 light) {
    u32 i;
    for (i = 0; i < pResMdl->info.numMat; i++) {
        NNS_G3dMdlSetMdlLightEnableFlag(pResMdl, i, light);
    }
}

void NNS_G3dMdlSetMdlPolygonModeAll(NNSG3dResMdl *pResMdl, u32 polyMode) {
    u32 i;
    for (i = 0; i < pResMdl->info.numMat; i++) {
        NNS_G3dMdlSetMdlPolygonMode(pResMdl, i, polyMode);
    }
}

void NNS_G3dMdlSetMdlCullModeAll(NNSG3dResMdl *pResMdl, u32 cullMode) {
    u32 i;
    for (i = 0; i < pResMdl->info.numMat; i++) {
        NNS_G3dMdlSetMdlCullMode(pResMdl, i, cullMode);
    }
}

void NNS_G3dMdlSetMdlPolygonIDAll(NNSG3dResMdl *pResMdl, u32 polygonID) {
    u32 i;
    for (i = 0; i < pResMdl->info.numMat; i++) {
        NNS_G3dMdlSetMdlPolygonID(pResMdl, i, polygonID);
    }
}

void NNS_G3dMdlSetMdlAlphaAll(NNSG3dResMdl *pResMdl, u32 alpha) {
    u32 i;
    for (i = 0; i < pResMdl->info.numMat; i++) {
        NNS_G3dMdlSetMdlAlpha(pResMdl, i, alpha);
    }
}

void NNS_G3dMdlSetMdlFogEnableFlagAll(NNSG3dResMdl *pResMdl, BOOL flag) {
    u32 i;
    for (i = 0; i < pResMdl->info.numMat; i++) {
        NNS_G3dMdlSetMdlFogEnableFlag(pResMdl, i, flag);
    }
}

void NNS_G3dMdlSetMdlDepthTestCondAll(NNSG3dResMdl *pResMdl, BOOL flag) {
    u32 i;
    for (i = 0; i < pResMdl->info.numMat; i++) {
        NNS_G3dMdlSetMdlDepthTestCond(pResMdl, i, flag);
    }
}

void NNS_G3dMdlSetMdl1DotAll(NNSG3dResMdl *pResMdl, BOOL flag) {
    u32 i;
    for (i = 0; i < pResMdl->info.numMat; i++) {
        NNS_G3dMdlSetMdl1Dot(pResMdl, i, flag);
    }
}

void NNS_G3dMdlSetMdlFarClipAll(NNSG3dResMdl *pResMdl, BOOL flag) {
    u32 i;
    for (i = 0; i < pResMdl->info.numMat; i++) {
        NNS_G3dMdlSetMdlFarClip(pResMdl, i, flag);
    }
}

void NNS_G3dMdlSetMdlXLDepthUpdateAll(NNSG3dResMdl *pResMdl, BOOL flag) {
    u32 i;
    for (i = 0; i < pResMdl->info.numMat; i++) {
        NNS_G3dMdlSetMdlXLDepthUpdate(pResMdl, i, flag);
    }
}
