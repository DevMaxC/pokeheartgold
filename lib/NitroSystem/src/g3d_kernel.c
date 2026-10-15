// GX_load3d.h declares the 3D load functions without parameter lists, which -W error rejects at a
// call; skip it and declare them here.
#define GUARD_GX_LOAD3D_H

#include <nitro.h>
#include <nnsys/g3d_internal.h>

void GX_BeginLoadTex(void);
void GX_LoadTex(void *src, u32 offset, u32 size);
void GX_EndLoadTex(void);
void GX_BeginLoadTexPltt(void);
void GX_LoadTexPltt(void *src, u32 offset, u32 size);
void GX_EndLoadTexPltt(void);

u32 NNS_G3dAnmObjCalcSizeRequired(const void *pResAnm, const NNSG3dResMdl *pResMdl) {
    if (pResAnm == NULL || pResMdl == NULL) {
        return 0;
    }
    switch (((const NNSG3dResAnmHeader *)pResAnm)->category0) {
    case 'M':
        return (pResMdl->info.numMat * 2 + 0x1C) & ~3;
    case 'J':
    case 'V':
        return (pResMdl->info.numNode * 2 + 0x1C) & ~3;
    default:
        return 0;
    }
}

#pragma force_active on

void NNS_G3dAnmObjInit(NNSG3dAnmObj *pAnmObj, void *pResAnm, const NNSG3dResMdl *pResMdl, const NNSG3dResTex *pResTex) {
    u32 i = 0;
    NNSG3dResAnmHeader *pHeader = pResAnm;
    pAnmObj->frame = 0;
    pAnmObj->resAnm = pResAnm;
    pAnmObj->next = NULL;
    pAnmObj->priority = 127;
    pAnmObj->ratio = FX32_ONE;
    pAnmObj->resTex = pResTex;
    pAnmObj->numMapData = 0;
    pAnmObj->funcAnm = NULL;
    u32 count = gAnmObjInitFuncCount;
    if (i < count) {
        u8 category0 = pHeader->category0;
        do {
            if (category0 == gAnmObjInitFuncs[i].category0 && pHeader->category1 == gAnmObjInitFuncs[i].category1) {
                G3dAnmObjInitFunc func = *(G3dAnmObjInitFunc *)((u8 *)gAnmObjInitFuncsFirstFunc + i * sizeof(G3dAnmObjInitEntry));
                if (!func) {
                    return;
                }
                func(pAnmObj, pResAnm, pResMdl);
                return;
            }
        } while (++i < count);
    }
}

#pragma force_active off

void NNS_G3dAnmObjEnableID(NNSG3dAnmObj *pAnmObj, int id) {
    if (id < 0 || id >= pAnmObj->numMapData) {
        return;
    }
    if ((pAnmObj->mapData[id] & G3D_ANMOBJ_MAPDATA_EXISTS) == 0) {
        return;
    }
    pAnmObj->mapData[id] &= ~G3D_ANMOBJ_MAPDATA_DISABLED;
}

void NNS_G3dAnmObjDisableID(NNSG3dAnmObj *pAnmObj, int id) {
    if (id < 0 || id >= pAnmObj->numMapData) {
        return;
    }
    if ((pAnmObj->mapData[id] & G3D_ANMOBJ_MAPDATA_EXISTS) == 0) {
        return;
    }
    pAnmObj->mapData[id] |= G3D_ANMOBJ_MAPDATA_DISABLED;
}

void NNS_G3dRenderObjInit(NNSG3dRenderObj *pRenderObj, NNSG3dResMdl *pResMdl) {
    MIi_CpuClear32(0, (u32 *)pRenderObj, sizeof(NNSG3dRenderObj));
    pRenderObj->funcBlendMat = gAnmBlendMatDefault;
    pRenderObj->funcBlendJnt = gAnmBlendJntDefault;
    pRenderObj->funcBlendVis = gAnmBlendVisDefault;
    pRenderObj->resMdl = pResMdl;
}

#pragma force_active on

// inserts pAnmObj (and the objects linked behind it) in front of the first object of the list with a
// priority at least as high
void addLink_(NNSG3dAnmObj **ppHead, NNSG3dAnmObj *pAnmObj) {
    NNSG3dAnmObj *p = *ppHead;
    NNSG3dAnmObj *q;
    NNSG3dAnmObj *pTail;
    if (!p) {
        *ppHead = pAnmObj;
        return;
    }
    q = p->next;
    if (!q) {
        if (p->priority > pAnmObj->priority) {
            pTail = pAnmObj;
            while (pTail->next) {
                pTail = pTail->next;
            }
            pTail->next = p;
            *ppHead = pAnmObj;
        } else {
            p->next = pAnmObj;
        }
        return;
    }
    while (q) {
        if (q->priority >= pAnmObj->priority) {
            pTail = pAnmObj;
            while (pTail->next) {
                pTail = pTail->next;
            }
            p->next = pAnmObj;
            pTail->next = q;
            return;
        }
        p = q;
        q = q->next;
    }
    p->next = pAnmObj;
}

#pragma force_active off

// sets the hint bit of every node/material the animation objects of the list have data for
void updateHintVec_(u32 *pHintVec, const NNSG3dAnmObj *pAnmObj) {
    if (pAnmObj == NULL) {
        return;
    }
    do {
        int i;
        for (i = 0; i < pAnmObj->numMapData; ++i) {
            if (pAnmObj->mapData[i] & G3D_ANMOBJ_MAPDATA_EXISTS) {
                pHintVec[i >> 5] |= 1 << (i & 31);
            }
        }
        pAnmObj = pAnmObj->next;
    } while (pAnmObj != NULL);
}

#pragma force_active on

void NNS_G3dRenderObjAddAnmObj(NNSG3dRenderObj *pRenderObj, NNSG3dAnmObj *pAnmObj) {
    if (!pAnmObj || !pAnmObj->resAnm) {
        return;
    }
    switch (((NNSG3dResAnmHeader *)pAnmObj->resAnm)->category0) {
    case 'M':
        updateHintVec_(pRenderObj->hintMatAnmExist, pAnmObj);
        addLink_(&pRenderObj->anmMat, pAnmObj);
        break;
    case 'J':
        updateHintVec_(pRenderObj->hintJntAnmExist, pAnmObj);
        addLink_(&pRenderObj->anmJnt, pAnmObj);
        break;
    case 'V':
        updateHintVec_(pRenderObj->hintVisAnmExist, pAnmObj);
        addLink_(&pRenderObj->anmVis, pAnmObj);
        break;
    }
}

BOOL removeLink_(NNSG3dAnmObj **ppHead, NNSG3dAnmObj *pAnmObj) {
    NNSG3dAnmObj *pNext;
    NNSG3dAnmObj *pCurrent = *ppHead;
    if (!pCurrent) {
        return FALSE;
    }
    if (pCurrent == pAnmObj) {
        *ppHead = (*ppHead)->next;
        pAnmObj->next = NULL;
        return TRUE;
    }
    pNext = pCurrent->next;
    while (pNext) {
        if (pNext == pAnmObj) {
            pCurrent->next = pNext->next;
            pNext->next = NULL;
            return TRUE;
        }
        pCurrent = pNext;
        pNext = pNext->next;
    }
    return FALSE;
}

void NNS_G3dRenderObjRemoveAnmObj(NNSG3dRenderObj *pRenderObj, NNSG3dAnmObj *pAnmObj) {
    if (removeLink_(&pRenderObj->anmMat, pAnmObj) || removeLink_(&pRenderObj->anmJnt, pAnmObj) || removeLink_(&pRenderObj->anmVis, pAnmObj)) {
        pRenderObj->flag |= G3D_RENDEROBJ_FLAG_ANMOBJ_REMOVED;
    }
}

u32 NNS_G3dTexGetRequiredSize(const NNSG3dResTex *pTex) {
    return pTex ? pTex->texInfo.sizeTex * 8 : 0;
}

u32 NNS_G3dTex4x4GetRequiredSize(const NNSG3dResTex *pTex) {
    return pTex ? pTex->tex4x4Info.sizeTex * 8 : 0;
}

void NNS_G3dTexSetTexKey(NNSG3dResTex *pTex, NNSG3dTexKey texKey, NNSG3dTexKey tex4x4Key) {
    if (texKey) {
        pTex->texInfo.vramKey = texKey;
    }
    if (tex4x4Key) {
        pTex->tex4x4Info.vramKey = tex4x4Key;
    }
}

void NNS_G3dTexLoad(NNSG3dResTex *pTex, BOOL exec_begin_end) {
    if (exec_begin_end) {
        GX_BeginLoadTex();
    }
    {
        u32 size = pTex->texInfo.sizeTex << 3;
        if (size) {
            GX_LoadTex((u8 *)pTex + pTex->texInfo.ofsTex, (pTex->texInfo.vramKey & 0xFFFF) << 3, size);
            pTex->texInfo.flag |= NNS_G3D_RESTEX_LOADED;
        }
    }
    u32 ofsTexPlttIdx;
    u32 size4x4 = pTex->tex4x4Info.sizeTex << 3;
    u32 address;
    if (size4x4) {
        address = (pTex->tex4x4Info.vramKey & 0xFFFF) << 3;
        ofsTexPlttIdx = pTex->tex4x4Info.ofsTexPlttIdx;
        GX_LoadTex((u8 *)pTex + pTex->tex4x4Info.ofsTex, address, size4x4);
        // the palette indices of 4x4 compressed texels live in texture slot 1, half the size
        GX_LoadTex((u8 *)pTex + ofsTexPlttIdx, ((address & 0x1FFFF) >> 1) + 0x20000 + ((address & 0x40000) >> 2), size4x4 >> 1);
        pTex->tex4x4Info.flag |= NNS_G3D_RESTEX_LOADED;
    }
    if (exec_begin_end) {
        GX_EndLoadTex();
    }
}

void NNS_G3dTexReleaseTexKey(NNSG3dResTex *pTex, NNSG3dTexKey *texKey, NNSG3dTexKey *tex4x4Key) {
    if (texKey) {
        pTex->texInfo.flag &= ~NNS_G3D_RESTEX_LOADED;
        *texKey = pTex->texInfo.vramKey;
        pTex->texInfo.vramKey = 0;
    }
    if (tex4x4Key) {
        pTex->tex4x4Info.flag &= ~NNS_G3D_RESTEX_LOADED;
        *tex4x4Key = pTex->tex4x4Info.vramKey;
        pTex->tex4x4Info.vramKey = 0;
    }
}

u32 NNS_G3dPlttGetRequiredSize(const NNSG3dResTex *pTex) {
    return pTex ? pTex->plttInfo.sizePltt * 8 : 0;
}

void NNS_G3dPlttSetPlttKey(NNSG3dResTex *pTex, NNSG3dPlttKey plttKey) {
    pTex->plttInfo.vramKey = plttKey;
}

void NNS_G3dPlttLoad(NNSG3dResTex *pTex, BOOL exec_begin_end) {
    if (exec_begin_end) {
        GX_BeginLoadTexPltt();
    }
    GX_LoadTexPltt((u8 *)pTex + pTex->plttInfo.ofsPlttData, (pTex->plttInfo.vramKey & 0xFFFF) * 8, pTex->plttInfo.sizePltt * 8);
    pTex->plttInfo.flag |= NNS_G3D_RESPLTT_LOADED;
    if (exec_begin_end) {
        GX_EndLoadTexPltt();
    }
}

NNSG3dPlttKey NNS_G3dPlttReleasePlttKey(NNSG3dResTex *pTex) {
    NNSG3dPlttKey plttKey;
    pTex->plttInfo.flag &= ~NNS_G3D_RESPLTT_LOADED;
    plttKey = pTex->plttInfo.vramKey;
    pTex->plttInfo.vramKey = 0;
    return plttKey;
}

#pragma force_active off
