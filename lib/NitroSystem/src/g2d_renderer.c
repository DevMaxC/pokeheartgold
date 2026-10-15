#include <nitro.h>
#include <nnsys/g2d_renderer_internal.h>

// views that make some functions reread the state at every access (needed for the match)
#define VOLATILE_STATE   (*(volatile G2dRendererState *)&gRendererWork.state)
#define VOLATILE_CONTEXT (*(volatile G2dRendererContext *)&gRendererContext)

#pragma force_active on

// the current matrix: in translate-only mode the stack holds translations only, which are put into
// gRendererContext.translationMtx
static inline const MtxFx32 *GetCurrentMtx(void) {
    if (!gRendererWork.state.translateOnly) {
        return &gRendererMtxStack[gRendererWork.state.stackLevel];
    }
    gRendererContext.translationMtx._20 = gRendererMtxStackTransX[gRendererWork.state.stackLevel].value;
    gRendererContext.translationMtx._21 = gRendererMtxStackTransY[gRendererWork.state.stackLevel].value;
    return &gRendererTranslationMtx;
}

void RndCoreCBFuncBeforeCell_(NNSG2dRndCoreInstance *pRend, const NNSG2dCellData *pCell) {
    NNSG2dRenderSurface *pSurface;
    const MtxFx32 *pMtx;
    pSurface = gRendererWork.state.pRenderer->pCurrentSurface;
    if (pSurface->pFuncVisibilityCulling) {
        if (gRendererWork.state.translateOnly) {
            gRendererContext.translationMtx._20 = gRendererMtxStackTransX[gRendererWork.state.stackLevel].value;
            gRendererContext.translationMtx._21 = gRendererMtxStackTransY[gRendererWork.state.stackLevel].value;
            pMtx = &gRendererTranslationMtx;
        } else {
            pMtx = &gRendererMtxStack[gRendererWork.state.stackLevel];
        }
        if (!pSurface->pFuncVisibilityCulling(pCell, pMtx, &pSurface->viewRect)) {
            pRend->bDrawEnable = FALSE;
            return;
        }
        pRend->bDrawEnable = TRUE;
    }
    if (pSurface->pBeforeDrawCellBackFunc) {
        pMtx = GetCurrentMtx();
        pSurface->pBeforeDrawCellBackFunc(gRendererWork.state.pRenderer, pSurface, pCell, pMtx);
    }
}

void RndCoreCBFuncAfterCell_(NNSG2dRndCoreInstance *pRend, const NNSG2dCellData *pCell) {
    NNSG2dRenderSurface *pSurface;
    const MtxFx32 *pMtx;
    NNSG2dRendererInstance *pRenderer;
    pRenderer = gRendererWork.state.pRenderer;
    pSurface = pRenderer->pCurrentSurface;
    if (pSurface->pAfterDrawCellBackFunc) {
        if (gRendererWork.state.translateOnly) {
            gRendererContext.translationMtx._20 = gRendererMtxStackTransX[gRendererWork.state.stackLevel].value;
            gRendererContext.translationMtx._21 = gRendererMtxStackTransY[gRendererWork.state.stackLevel].value;
            pMtx = &gRendererTranslationMtx;
        } else {
            pMtx = &gRendererMtxStack[gRendererWork.state.stackLevel];
        }
        pSurface->pAfterDrawCellBackFunc(pRenderer, pSurface, pCell, pMtx);
    }
}

// applies the renderer's palette swap table and attribute overwrites to the OBJ about to be drawn
void RndCoreCBFuncBeforeOBJ_(NNSG2dRndCoreInstance *pRend, const NNSG2dCellData *pCell, u16 oamIdx) {
    const NNSG2dPaletteSwapTable *pPlttTbl = NNS_G2dGetRendererPaletteTbl(gRendererWork.state.pRenderer);
    if (pPlttTbl) {
        u16 plttNo = NNS_G2dGetPaletteTableValue(pPlttTbl, (u16)((pRend->currentOam.attr2 & 0xf000) >> 12));
        pRend->currentOam.attr23 = (pRend->currentOam.attr23 & ~0xf000) | ((plttNo & 0xf) << 12);
    }
    if (gRendererWork.state.pRenderer->overwriteEnableFlag) {
        if (NNS_G2dIsRendererOverwriteEnable(gRendererWork.state.pRenderer, NNS_G2D_RND_OVERWRITE_PRIORITY)) {
            pRend->currentOam.attr23 = (pRend->currentOam.attr23 & ~0xc00) | ((gRendererWork.state.pRenderer->overwritePriority & 3) << 10);
        }
        if (NNS_G2dIsRendererOverwriteEnable(gRendererWork.state.pRenderer, NNS_G2D_RND_OVERWRITE_PLTTNO)) {
            pRend->currentOam.attr23 = (pRend->currentOam.attr23 & ~0xf000) | ((gRendererWork.state.pRenderer->overwritePlttNo & 0xf) << 12);
        }
        if (NNS_G2dIsRendererOverwriteEnable(gRendererWork.state.pRenderer, NNS_G2D_RND_OVERWRITE_PLTTNO_OFFS)) {
            u16 offset = gRendererWork.state.pRenderer->overwritePlttNoOffset;
            u32 attr23 = pRend->currentOam.attr23;
            u32 attr2 = attr23 << 16;
            pRend->currentOam.attr23 = (attr23 & ~0xf000) | ((((attr2 >> 28) + offset) & 0xf) << 12);
        }
        if (NNS_G2dIsRendererOverwriteEnable(gRendererWork.state.pRenderer, NNS_G2D_RND_OVERWRITE_MOSAIC)) {
            if (gRendererWork.state.pRenderer->overwriteMosaicFlag) {
                pRend->currentOam.attr01 |= 0x1000;
            } else {
                pRend->currentOam.attr01 &= ~0x1000;
            }
        }
        if (NNS_G2dIsRendererOverwriteEnable(gRendererWork.state.pRenderer, NNS_G2D_RND_OVERWRITE_OBJMODE)) {
            u32 attr01 = pRend->currentOam.attr01;
            int plttNo = (pRend->currentOam.attr2 & 0xf000) >> 12;
            GXOamMode mode = gRendererWork.state.pRenderer->overwriteObjMode;
            pRend->currentOam.attr01 = (mode << 10) | (attr01 & ~0xc00);
            pRend->currentOam.attr2 = (pRend->currentOam.attr2 & ~0xf000) | (plttNo << 12);
        }
    }
    {
        NNSG2dRendererInstance *pRenderer = gRendererWork.state.pRenderer;
        NNSG2dRenderSurface *pSurface = pRenderer->pCurrentSurface;
        if (pSurface->pBeforeDrawOamBackFunc) {
            const MtxFx32 *pMtx;
            if (!gRendererWork.state.translateOnly) {
                pMtx = &gRendererMtxStack[gRendererWork.state.stackLevel];
            } else {
                gRendererContext.translationMtx._20 = gRendererMtxStackTransX[gRendererWork.state.stackLevel].value;
                gRendererContext.translationMtx._21 = gRendererMtxStackTransY[gRendererWork.state.stackLevel].value;
                pMtx = &gRendererTranslationMtx;
            }
            pSurface->pBeforeDrawOamBackFunc(pRenderer, pSurface, pCell, oamIdx, pMtx);
        }
    }
}

void RndCoreCBFuncAfterOBJ_(NNSG2dRndCoreInstance *pRend, const NNSG2dCellData *pCell, u16 oamIdx) {
    NNSG2dRendererInstance *pRenderer;
    const MtxFx32 *pMtx;
    NNSG2dRenderSurface *pSurface;
    pRenderer = gRendererWork.state.pRenderer;
    pSurface = pRenderer->pCurrentSurface;
    if (pSurface->pAfterDrawOamBackFunc) {
        if (gRendererWork.state.translateOnly) {
            gRendererContext.translationMtx._20 = gRendererMtxStackTransX[gRendererWork.state.stackLevel].value;
            gRendererContext.translationMtx._21 = gRendererMtxStackTransY[gRendererWork.state.stackLevel].value;
            pMtx = &gRendererTranslationMtx;
        } else {
            pMtx = &gRendererMtxStack[gRendererWork.state.stackLevel];
        }
        pSurface->pAfterDrawOamBackFunc(pRenderer, pSurface, pCell, oamIdx, pMtx);
    }
}

// the affine matrix of the current level can be taken from a matrix cache
static inline BOOL IsMtxCacheUsable(void) {
    if (gRendererWork.state.translateOnly == FALSE && gRendererContext.affineLevel != RENDERER_NO_AFFINE_LEVEL) {
        return TRUE;
    }
    return FALSE;
}

static inline BOOL IsValidVramTransferHandle(u32 handle) {
    return handle != RENDERER_NO_VRAM_TRANSFER;
}

static inline void DrawCellByRndCore(const NNSG2dCellData *pCell) {
    switch (IsValidVramTransferHandle(gRendererContext.vramTransferHandle)) {
    default:
        NNS_G2dRndCoreDrawCellVramTransfer(pCell, gRendererContext.vramTransferHandle);
        break;
    case FALSE:
        NNS_G2dRndCoreDrawCell(pCell);
        break;
    }
}

static inline NNSG2dRndCore2DMtxCache *StoreCurrentMtxToMtxCache(void) {
    NNSi_G2dMCMStoreCurrentMtxToMtxCache();
    return &gRendererMtxCaches[gRendererMtxCacheRecords[(u16)gRendererWork.state.stackLevel].cacheIndex];
}

// the 2D matrix cache of the current level: shared by every node of a cell animation while a
// multi cell that shares its cell animations is drawn
static inline NNSG2dRndCore2DMtxCache *GetCurrentMtxCache(void) {
    NNSG2dRndCore2DMtxCache *pCache = NULL;
    if (IsMtxCacheUsable()) {
        if (gRendererWork.useCellAnimMtxCaches) {
            pCache = gRendererCellAnimMtxCacheTable[gRendererWorkB00.cellAnimIndex];
            if (pCache == NULL) {
                pCache = StoreCurrentMtxToMtxCache();
                gRendererCellAnimMtxCacheTable[gRendererWorkB00.cellAnimIndex] = pCache;
            }
        } else {
            pCache = StoreCurrentMtxToMtxCache();
        }
    }
    return pCache;
}

// same as GetCurrentMtxCache (addresses the cache table through its container)
static inline NNSG2dRndCore2DMtxCache *GetCurrentMtxCacheB(void) {
    NNSG2dRndCore2DMtxCache *pCache = NULL;
    if (IsMtxCacheUsable()) {
        if (gRendererWork.useCellAnimMtxCaches) {
            pCache = gRendererCellAnimMtxCaches.pCaches[gRendererWorkB00.cellAnimIndex];
            if (pCache == NULL) {
                pCache = StoreCurrentMtxToMtxCache();
                gRendererCellAnimMtxCaches.pCaches[gRendererWorkB00.cellAnimIndex] = pCache;
            }
        } else {
            pCache = StoreCurrentMtxToMtxCache();
        }
    }
    return pCache;
}

static inline const MtxFx32 *GetCurrentMtxB(void) {
    if (gRendererWork.state.translateOnly) {
        gRendererContext.translationMtx._20 = gRendererMtxStack[gRendererWork.state.stackLevel]._20;
        gRendererContext.translationMtx._21 = gRendererMtxStack[gRendererWork.state.stackLevel]._21;
        return &gRendererTranslationMtx;
    }
    return &gRendererMtxStack[gRendererWork.state.stackLevel];
}

static inline void DrawCellToSurface2D(const NNSG2dCellData *pCell) {
    NNSG2dRndCore2DMtxCache *pCache = GetCurrentMtxCache();
    NNS_G2dSetRndCoreCurrentMtx2D(GetCurrentMtx(), pCache);
    DrawCellByRndCore(pCell);
}

static inline void DrawCellToSurface3D(NNSG2dRendererInstance *pRenderer, const NNSG2dCellData *pCell) {
    NNS_G2dSetRndCore3DSoftSpriteZvalue(&pRenderer->rendererCore, gRendererZStack[gRendererWork.state.stackLevel]);
    NNS_G2dSetRndCoreCurrentMtx3D(GetCurrentMtx());
    DrawCellByRndCore(pCell);
}

static inline void DrawCellToSurface2DB(const NNSG2dCellData *pCell) {
    NNSG2dRndCore2DMtxCache *pCache = GetCurrentMtxCacheB();
    NNS_G2dSetRndCoreCurrentMtx2D(GetCurrentMtxB(), pCache);
    DrawCellByRndCore(pCell);
}

static inline void DrawCellToSurface3DB(NNSG2dRendererInstance *pRenderer, const NNSG2dCellData *pCell) {
    NNS_G2dSetRndCore3DSoftSpriteZvalue(&pRenderer->rendererCore, gRendererZStack[gRendererWork.state.stackLevel]);
    NNS_G2dSetRndCoreCurrentMtx3D(GetCurrentMtxB());
    DrawCellByRndCore(pCell);
}

static inline void EndSurfaceRendering(void) {
    gRendererWork.state.pRenderer->pCurrentSurface = NULL;
    NNS_G2dRndCoreEndRendering();
}

// draws a cell to every active target surface (or to the current one only, see RENDERER_OPZ_SINGLE_SURFACE)
void DrawCellImpl_(const NNSG2dCellData *pCell) {
    NNSG2dRendererInstance *pRenderer = gRendererWork.state.pRenderer;
    NNSG2dRenderSurface *pSurface = pRenderer->pTargetSurfaceList;
    if (pRenderer->opzHint & RENDERER_OPZ_SINGLE_SURFACE) {
        if (pSurface->type != NNS_G2D_SURFACETYPE_MAIN3D) {
            DrawCellToSurface2D(pCell);
        } else {
            DrawCellToSurface3D(pRenderer, pCell);
        }
        return;
    }
    for (; pSurface != NULL; pSurface = pSurface->pNextSurface) {
        if (pSurface->bActive) {
            if (pSurface->type != NNS_G2D_SURFACETYPE_MAIN3D) {
                NNSG2dRendererInstance *pCurrent = gRendererWork.state.pRenderer;
                pCurrent->pCurrentSurface = pSurface;
                NNS_G2dSetRndCoreSurface(&pCurrent->rendererCore, &pSurface->coreSurface);
                NNS_G2dSetRndCoreOamRegisterFunc(&pCurrent->rendererCore, pSurface->pFuncOamRegister, pSurface->pFuncOamAffineRegister);
                NNS_G2dRndCoreBeginRendering(&pCurrent->rendererCore);
                DrawCellToSurface2DB(pCell);
                EndSurfaceRendering();
            } else {
                NNSG2dRendererInstance *pCurrent = gRendererWork.state.pRenderer;
                pCurrent->pCurrentSurface = pSurface;
                NNS_G2dSetRndCoreSurface(&pCurrent->rendererCore, &pSurface->coreSurface);
                NNS_G2dRndCoreBeginRendering(&pCurrent->rendererCore);
                DrawCellToSurface3DB(pRenderer, pCell);
                EndSurfaceRendering();
            }
        }
    }
}

static inline BOOL HasVramTransfer(u32 handle) {
    return (BOOL)(handle != RENDERER_NO_VRAM_TRANSFER);
}

static inline void DrawCellVramTransfer(const NNSG2dCellAnimation *pCellAnim, const NNSG2dCellData *pCell) {
    if (HasVramTransfer(pCellAnim->cellTransferStateHandle)) {
        gRendererContext.vramTransferHandle = pCellAnim->cellTransferStateHandle;
        DrawCellImpl_(pCell);
        gRendererContext.vramTransferHandle = RENDERER_NO_VRAM_TRANSFER;
    } else {
        DrawCellImpl_(pCell);
    }
}

// translation of a node, mirrored when the renderer core flips
static inline void TranslateFlipped(int x, int y) {
    if (NNS_G2dIsRndCoreFlipH(&gRendererWork.state.pRenderer->rendererCore)) {
        x = -x;
    }
    if (NNS_G2dIsRndCoreFlipV(&gRendererWork.state.pRenderer->rendererCore)) {
        y = -y;
    }
    NNS_G2dTranslate(x << FX32_SHIFT, y << FX32_SHIFT, 0);
}

void DrawCellAnimationImpl_(const NNSG2dCellAnimation *pCellAnim) {
    const NNSG2dCellData *pCell = pCellAnim->pCurrentCell;
    const NNSG2dSRTData *pSrt = &pCellAnim->srtCtrl.srtData;
    if (!pSrt->SRT_EnableFlag) {
        DrawCellVramTransfer(pCellAnim, pCell);
        return;
    }
    NNS_G2dPushMtx();
    if (pSrt->SRT_EnableFlag & SRT_FLAG_TRANS) {
        TranslateFlipped(pSrt->trans.x, pSrt->trans.y);
    }
    if (pSrt->SRT_EnableFlag & SRT_FLAG_ROTATE) {
        NNS_G2dRotZ(FX_SinIdx(pSrt->rotZ), FX_CosIdx(pSrt->rotZ));
    }
    if (pSrt->SRT_EnableFlag & SRT_FLAG_SCALE) {
        NNS_G2dScale(pSrt->scale.x, pSrt->scale.y, FX32_ONE);
    }
    DrawCellVramTransfer(pCellAnim, pCell);
    NNS_G2dPopMtx(1); // the argument is needed for the match (NNS_G2dPopMtx is declared without parameters)
}

void DrawNode_(const NNSG2dNode *pNode) {
    const NNSG2dCellAnimation *pCellAnim;
    if (!pNode->bVisible) {
        return;
    }
    pCellAnim = pNode->pContent;
    NNS_G2dPushMtx();
    if (pNode->srtCtrl.srtData.SRT_EnableFlag & SRT_FLAG_TRANS) {
        TranslateFlipped(pNode->srtCtrl.srtData.trans.x, pNode->srtCtrl.srtData.trans.y);
    }
    if (pNode->srtCtrl.srtData.SRT_EnableFlag & SRT_FLAG_ROTATE) {
        NNS_G2dRotZ(FX_SinIdx(pNode->srtCtrl.srtData.rotZ), FX_CosIdx(pNode->srtCtrl.srtData.rotZ));
    }
    if (pNode->srtCtrl.srtData.SRT_EnableFlag & SRT_FLAG_SCALE) {
        NNS_G2dScale(pNode->srtCtrl.srtData.scale.x, pNode->srtCtrl.srtData.scale.y, FX32_ONE);
    }
    DrawCellAnimationImpl_(pCellAnim);
    NNS_G2dPopMtx(1); // see DrawCellAnimationImpl_
}

#pragma force_active off

void NNS_G2dInitRenderer(NNSG2dRendererInstance *pRend) {
    int i;
    NNSG2dRndCore2DMtxCache *pCache;
    NNS_G2dInitRndCore(&pRend->rendererCore);
    pRend->pTargetSurfaceList = NULL;
    pRend->pCurrentSurface = NULL;
    pRend->pPaletteSwapTbl = NULL;
    pRend->opzHint = 0;
    pRend->spriteZoffsetStep = 0;
    pRend->overwriteEnableFlag = NNS_G2D_RND_OVERWRITE_NONE;
    pRend->overwritePriority = 0;
    pRend->overwritePlttNo = 0;
    pRend->overwriteObjMode = GX_OAM_MODE_NORMAL;
    pRend->overwriteMosaicFlag = FALSE;
    pRend->overwritePlttNoOffset = 0;
    gRendererWork.state.stackLevel = 0;
    gRendererContext.affineLevel = RENDERER_NO_AFFINE_LEVEL;
    pCache = gRendererMtxCaches;
    for (i = 0; i < RENDERER_MTX_STACK_SIZE; i++, pCache++) {
        MIi_CpuClearFast(MtxCache_NOT_AVAILABLE_ForMemFill, (u32 *)pCache->affineIndex, sizeof(pCache->affineIndex));
    }
    gRendererWork.state.numMtxCaches = 0;
    gRendererWork.state.nextMtxGroupId = 0;
    MIi_CpuClearFast(0, (u32 *)gRendererMtxCacheRecords, sizeof(G2dMtxCacheRecord) * RENDERER_MTX_STACK_SIZE);
    gRendererWork.state.translateOnly = FALSE;
}

void NNS_G2dAddRendererTargetSurface(NNSG2dRendererInstance *pRend, NNSG2dRenderSurface *pNew) {
    pNew->pNextSurface = pRend->pTargetSurfaceList;
    pRend->pTargetSurfaceList = pNew;
}

void NNS_G2dInitRenderSurface(NNSG2dRenderSurface *pSurface) {
    MI_CpuClear16(pSurface, sizeof(NNSG2dRenderSurface));
    pSurface->bActive = TRUE;
    pSurface->type = NNS_G2D_SURFACETYPE_MAX;
    pSurface->pBeforeCoreDrawCellBack = RndCoreCBFuncBeforeCell_;
    pSurface->pAfterCoreDrawCellBack = RndCoreCBFuncAfterCell_;
    pSurface->pBeforeCoreDrawOamBack = RndCoreCBFuncBeforeOBJ_;
    pSurface->pAfterCoreDrawOamBack = RndCoreCBFuncAfterOBJ_;
}

#pragma force_active on

void NNS_G2dBeginRendering(NNSG2dRendererInstance *pRendererInstance) {
    int i;
    VOLATILE_STATE.pRenderer = pRendererInstance;
    VOLATILE_STATE.stackLevel = 0;
    VOLATILE_CONTEXT.affineLevel = RENDERER_NO_AFFINE_LEVEL;
    i = 0;
    if (i < VOLATILE_STATE.numMtxCaches) {
        NNSG2dRndCore2DMtxCache *pCache = gRendererMtxCaches;
        do {
            MIi_CpuClearFast(MtxCache_NOT_AVAILABLE_ForMemFill, (u32 *)pCache->affineIndex, sizeof(pCache->affineIndex));
            i++;
            pCache++;
        } while (i < VOLATILE_STATE.numMtxCaches);
    }
    VOLATILE_STATE.numMtxCaches = 0;
    VOLATILE_STATE.nextMtxGroupId = 0;
    MIi_CpuClearFast(0, (u32 *)gRendererMtxCacheRecords, sizeof(G2dMtxCacheRecord) * RENDERER_MTX_STACK_SIZE);
    G3_PushMtx();
    G3_Identity();
    NNSi_G2dIdentity();
}

#pragma force_active off

void NNS_G2dEndRendering(void) {
    u32 opzHint;
    NNSG2dRendererInstance *pRenderer;
    G3_PopMtx(1);
    opzHint = gRendererWork.state.pRenderer->opzHint;
    pRenderer = gRendererWork.state.pRenderer;
    if (opzHint != 0) {
        if (opzHint & RENDERER_OPZ_TRANSLATE_ONLY) {
            gRendererWork.state.translateOnly = FALSE;
        }
        if (opzHint & RENDERER_OPZ_SINGLE_SURFACE) {
            pRenderer->pCurrentSurface = NULL;
            NNS_G2dRndCoreEndRendering();
        }
        gRendererWork.state.pRenderer->opzHint = 0;
    }
    gRendererWork.state.pRenderer = NULL;
}

// draws a cell animation; the renderer's sprite z offset step separates its OBJs on a 3D surface
void NNS_G2dDrawCellAnimation(const NNSG2dCellAnimation *pCellAnim) {
    if (gRendererWork.state.pRenderer->spriteZoffsetStep != 0) {
        fx32 oldStep = NNSi_G2dGetOamSoftEmuAutoZOffsetStep();
        NNSi_G2dSetOamSoftEmuAutoZOffsetFlag(TRUE);
        NNSi_G2dSetOamSoftEmuAutoZOffsetStep(gRendererWork.state.pRenderer->spriteZoffsetStep);
        DrawCellAnimationImpl_(pCellAnim);
        NNSi_G2dSetOamSoftEmuAutoZOffsetFlag(FALSE);
        NNSi_G2dSetOamSoftEmuAutoZOffsetStep(oldStep);
        NNSi_G2dResetOamSoftEmuAutoZOffset();
    } else {
        DrawCellAnimationImpl_(pCellAnim);
    }
}

#pragma force_active on

// v.y doubles as the NULL the cell animation matrix caches are reset to (needed for the match)
#pragma opt_lifetimes off

void NNS_G2dDrawMultiCell(const NNSG2dMultiCellInstance *pMC) {
    struct {
        int y;
        const NNSG2dMultiCellInstance *pMC;
    } v; // a struct for the match (register allocation)

    const NNSG2dMultiCellHierarchyData *pNode;
    const SharedCellAnim *pCellAnims;
    u16 cellAnimIndex;
    u16 i;
    int x;

    v.y = 0;
    v.pMC = pMC;
    if (v.pMC->mcType == NNS_G2D_MCTYPE_SHARE_CELLANIM) {
        {
            u16 j;
            for (j = 0; j < v.pMC->pCurrentMultiCell->numCellAnim; j++) {
                gRendererCellAnimMtxCaches.pCaches[j] = (NNSG2dRndCore2DMtxCache *)v.y;
            }
        }
        gRendererWork.useCellAnimMtxCaches = TRUE;
        i = 0;
        if (gRendererWork.state.pRenderer->spriteZoffsetStep) {
            fx32 oldStep = NNSi_G2dGetOamSoftEmuAutoZOffsetStep();
            NNSi_G2dSetOamSoftEmuAutoZOffsetFlag(TRUE);
            NNSi_G2dSetOamSoftEmuAutoZOffsetStep(gRendererWork.state.pRenderer->spriteZoffsetStep);
            for (; i < v.pMC->pCurrentMultiCell->numNodes; i++) {
                pCellAnims = v.pMC->pCellAnimInstasnces;
                pNode = &v.pMC->pCurrentMultiCell->pHierDataArray[i];
                cellAnimIndex = (pNode->nodeAttr & 0xff00) >> 8;
                gRendererWorkB00.cellAnimIndex = cellAnimIndex;
                NNS_G2dPushMtx();
                v.y = pNode->posY;
                x = pNode->posX;
                if (NNS_G2dIsRndCoreFlipH(&gRendererWork.state.pRenderer->rendererCore)) {
                    x = -x;
                }
                if (NNS_G2dIsRndCoreFlipV(&gRendererWork.state.pRenderer->rendererCore)) {
                    v.y = -v.y;
                }
                NNS_G2dTranslate(x << FX32_SHIFT, v.y << FX32_SHIFT, 0);
                DrawCellAnimationImpl_(&pCellAnims[cellAnimIndex].cellAnim);
                NNS_G2dPopMtx(1); // see DrawCellAnimationImpl_
            }
            NNSi_G2dSetOamSoftEmuAutoZOffsetFlag(FALSE);
            NNSi_G2dSetOamSoftEmuAutoZOffsetStep(oldStep);
            NNSi_G2dResetOamSoftEmuAutoZOffset();
        } else {
            for (; i < v.pMC->pCurrentMultiCell->numNodes; i++) {
                pCellAnims = v.pMC->pCellAnimInstasnces;
                pNode = &v.pMC->pCurrentMultiCell->pHierDataArray[i];
                cellAnimIndex = (pNode->nodeAttr & 0xff00) >> 8;
                gRendererWorkB00.cellAnimIndex = cellAnimIndex;
                NNS_G2dPushMtx();
                v.y = pNode->posY;
                x = pNode->posX;
                if (NNS_G2dIsRndCoreFlipH(&gRendererWork.state.pRenderer->rendererCore)) {
                    x = -x;
                }
                if (NNS_G2dIsRndCoreFlipV(&gRendererWork.state.pRenderer->rendererCore)) {
                    v.y = -v.y;
                }
                NNS_G2dTranslate(x << FX32_SHIFT, v.y << FX32_SHIFT, 0);
                DrawCellAnimationImpl_(&pCellAnims[cellAnimIndex].cellAnim);
                NNS_G2dPopMtx(1); // see DrawCellAnimationImpl_
            }
        }
        gRendererWork.useCellAnimMtxCaches = FALSE;
    } else {
        const NNSG2dNode *pNodes = v.pMC->pCellAnimInstasnces;
        if (gRendererWork.state.pRenderer->spriteZoffsetStep) {
            fx32 oldStep = NNSi_G2dGetOamSoftEmuAutoZOffsetStep();
            u16 n;
            NNSi_G2dSetOamSoftEmuAutoZOffsetFlag(TRUE);
            NNSi_G2dSetOamSoftEmuAutoZOffsetStep(gRendererWork.state.pRenderer->spriteZoffsetStep);
            for (n = 0; n < v.pMC->pCurrentMultiCell->numNodes; n++) {
                DrawNode_(&pNodes[n]);
            }
            NNSi_G2dSetOamSoftEmuAutoZOffsetFlag(FALSE);
            NNSi_G2dSetOamSoftEmuAutoZOffsetStep(oldStep);
            NNSi_G2dResetOamSoftEmuAutoZOffset();
        } else {
            u16 n;
            for (n = 0; n < v.pMC->pCurrentMultiCell->numNodes; n++) {
                DrawNode_(&pNodes[n]);
            }
        }
    }
}

#pragma opt_lifetimes reset

#pragma force_active off

void NNS_G2dDrawMultiCellAnimation(const NNSG2dMultiCellAnimation *pMCAnim) {
    const NNSG2dSRTData *pSrt = &pMCAnim->srtCtrl.srtData;
    if (pSrt->SRT_EnableFlag == 0) {
        NNS_G2dDrawMultiCell(&pMCAnim->multiCellInstance);
        return;
    }
    NNS_G2dPushMtx();
    if (pSrt->SRT_EnableFlag & SRT_FLAG_TRANS) {
        int x;
        int y = pSrt->trans.y;
        x = pSrt->trans.x;
        if (NNS_G2dIsRndCoreFlipH(&gRendererWork.state.pRenderer->rendererCore)) {
            x = -x;
        }
        if (NNS_G2dIsRndCoreFlipV(&gRendererWork.state.pRenderer->rendererCore)) {
            y = -y;
        }
        NNS_G2dTranslate(x << FX32_SHIFT, y << FX32_SHIFT, 0);
    }
    if (pSrt->SRT_EnableFlag & SRT_FLAG_ROTATE) {
        NNS_G2dRotZ(FX_SinIdx(pSrt->rotZ), FX_CosIdx(pSrt->rotZ));
    }
    if (pSrt->SRT_EnableFlag & SRT_FLAG_SCALE) {
        NNS_G2dScale(pSrt->scale.x, pSrt->scale.y, FX32_ONE);
    }
    NNS_G2dDrawMultiCell(&pMCAnim->multiCellInstance);
    NNS_G2dPopMtx(1); // see DrawCellAnimationImpl_
}
