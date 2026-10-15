#include <nitro.h>
#include <nnsys/g2d_internal.h>

#pragma force_active on

static inline void MultVec22(const NNSG2dFVec2 *pSrc, const MtxFx22 *pMtx, NNSG2dFVec2 *pDst) {
    NNSG2dFVec2 tmp;
    NNSG2dFVec2 *dst = pDst;
    if (pSrc == pDst) {
        dst = &tmp;
    }
    dst->x = (s32)(((u64)((s64)pMtx->_10 * pSrc->y) + 0x1000 + (u64)((s64)pMtx->_00 * pSrc->x)) >> 12);
    dst->y = (s32)(((u64)((s64)pMtx->_11 * pSrc->y) + 0x1000 + (u64)((s64)pMtx->_01 * pSrc->x)) >> 12);
    if (dst == &tmp) {
        *pDst = tmp;
    }
}

static inline u32 GetOamEffect(GXOamAttr *pOam) {
    u32 effect = pOam->attr01 & 0x300;
    if (effect != OAM_EFFECT_AFFINE && effect != OAM_EFFECT_AFFINE_DOUBLE) {
        effect |= pOam->attr01 & 0x30000000; // flip bits
    }
    return effect;
}

static inline u32 IsAffineDouble(u32 effect) {
    return effect == OAM_EFFECT_AFFINE_DOUBLE;
}

static inline void SetOamEffect(GXOamAttr *pOam, u32 effect) {
    if (effect != OAM_EFFECT_AFFINE) {
        pOam->attr01 = (pOam->attr01 & 0xc1fffcff) | effect;
        return;
    }
    pOam->attr01 &= 0xc1fffcff;
    pOam->attr01 |= effect;
}

// positions an affine OBJ: its centre is transformed by the matrix, then moved by pBaseTrans
void DoAffineTransforme_(const MtxFx22 *pMtx, GXOamAttr *pOam, const NNSG2dFVec2 *pBaseTrans) {
    u32 finalEffect;
    NNSG2dFVec2 pos;
    int x;
    int y;
    u32 attr;
    u32 shapeAttr;
    int shape;
    u32 size;
    int overwriteMode;
    u32 effect;
    int halfW;
    int halfH;
    int halfWFx;
    int halfHFx;
    x = (s16)((pOam->attr01 & 0x1ff0000) >> 16);
    if (x > 255) {
        x = (s16)(x | 0xff00);
    }
    pos.x = x << FX32_SHIFT;
    y = pOam->attr01 & 255;
    if (y > 127) {
        y = (s16)(y | 0xff00);
    }
    pos.y = y << FX32_SHIFT;
    if (GetOamEffect(pOam) == OAM_EFFECT_AFFINE_DOUBLE) {
        attr = pOam->attr01;
        finalEffect = attr & 0x300;
        if (finalEffect != OAM_EFFECT_AFFINE && finalEffect != OAM_EFFECT_AFFINE_DOUBLE) {
            finalEffect |= attr & 0x30000000;
        }
        shapeAttr = attr & 0xc000c000;
        shape = (int)(shapeAttr & 0xc000) >> 14;
        size = (shapeAttr & 0xc0000000) >> 30;
        pos.x += gObjWidths[shape][size] << 11;
        pos.y += gObjHeights[shape][size] << 11;
    }
    MultVec22(&pos, pMtx, &pos);
    overwriteMode = gCurrentRndCore->affineOverwriteMode;
    if (overwriteMode != NNS_G2D_RND_AFFINE_OVERWRITE_NONE) {
        effect = overwriteMode == NNS_G2D_RND_AFFINE_OVERWRITE_DOUBLE ? OAM_EFFECT_AFFINE_DOUBLE : OAM_EFFECT_AFFINE;
        SetOamEffect(pOam, effect);
    }
    attr = pOam->attr01;
    finalEffect = attr & 0x300;
    if (finalEffect != OAM_EFFECT_AFFINE && finalEffect != OAM_EFFECT_AFFINE_DOUBLE) {
        finalEffect |= attr & 0x30000000;
    }
    shapeAttr = attr & 0xc000c000;
    shape = (int)(shapeAttr & 0xc000) >> 14;
    size = (shapeAttr & 0xc0000000) >> 30;
    halfW = gObjWidths[shape][size] >> 1;
    halfH = gObjHeights[shape][size] >> 1;
    halfWFx = halfW << FX32_SHIFT;
    halfHFx = halfH << FX32_SHIFT;
    pos.x += -halfWFx + pMtx->_00 * halfW + pMtx->_10 * halfH;
    pos.y += -halfHFx + pMtx->_01 * halfW + pMtx->_11 * halfH;
    if (IsAffineDouble(finalEffect)) {
        pos.x -= halfWFx;
        pos.y -= halfHFx;
    }
    pos.x += pBaseTrans->x;
    pos.y += pBaseTrans->y;
    pOam->attr01 = (pOam->attr01 & 0xfe00ff00) | ((pos.y >> FX32_SHIFT) & 255) | (((u32)(pos.x >> FX32_SHIFT) << 23) >> 7);
}

static inline BOOL IsAffineEnable(const NNSG2dRndCoreInstance *pRnd) {
    if (pRnd->flipFlag == 0 && pRnd->pCurrentMtxCacheFor2D != NULL) {
        return TRUE;
    }
    return FALSE;
}

void DrawCellToSurface2D_(const NNSG2dRndCoreSurface *pSurface, const NNSG2dCellData *pCell) {
    NNSG2dRndCoreInstance *pRnd;
    BOOL bAffine;
    u16 i;
    u32 baseOffset;
    NNSG2dFVec2 pos;
    const MtxFx32 *pMtx;

    pRnd = gCurrentRndCore;
    if (pRnd->pCurrentMxt != NULL) {
        pMtx = pRnd->pCurrentMxt;
    } else {
        pMtx = &gRndCoreIdentityMtx;
    }

    pos.x = pMtx->_20;
    pos.y = pMtx->_21;
    pos.x -= pSurface->viewRect.posTopLeft.x;
    pos.y -= pSurface->viewRect.posTopLeft.y;

    baseOffset = gCurrentRndCore->base2DCharOffset;
    bAffine = IsAffineEnable(gCurrentRndCore);

    for (i = 0; i < pCell->numOAMAttrs; i++) {
        u16 affineIndex;
        const NNSG2dCellOAMAttrData *pSrc;

        gCurrentRndCore->bDrawEnable = TRUE;
        pSrc = &pCell->pOamAttrArray[i];
        pRnd->currentOam.attr0 = pSrc->attr0;
        pRnd->currentOam.attr1 = pSrc->attr1;
        pRnd->currentOam.attr2 = pSrc->attr2;

        if (pSurface->pBeforeDrawOamBackFunc != NULL) {
            pSurface->pBeforeDrawOamBackFunc(gCurrentRndCore, pCell, i);
        }
        if (gCurrentRndCore->bDrawEnable) {
            pRnd->currentOam.charNo += baseOffset;
            if (bAffine) {
                NNSG2dRndCore2DMtxCache *pCache;
                MtxFx22 mtx22;
                u32 flip = (pRnd->currentOam.flipV << 1) | pRnd->currentOam.flipH;
                NNSG2dRndCoreInstance *pCore = gCurrentRndCore;
                pCache = pCore->pCurrentMtxCacheFor2D;

                affineIndex = pCache->affineIndex[flip][pSurface->type - 1];
                if (affineIndex == MtxCache_NOT_AVAILABLE) {
                    if (flip == 0) {
                        affineIndex = pCore->pFuncOamAffineRegister(&pCache->m22);
                    } else {
                        MtxFx22 mtx = pCache->m22;
                        if (flip & 1) {
                            mtx._00 = -mtx._00;
                            mtx._01 = -mtx._01;
                        }
                        if (flip & 2) {
                            mtx._10 = -mtx._10;
                            mtx._11 = -mtx._11;
                        }
                        affineIndex = pCore->pFuncOamAffineRegister(&mtx);
                    }
                    pCache->affineIndex[flip][pSurface->type - 1] = affineIndex;
                }
                mtx22._00 = pMtx->_00;
                mtx22._01 = pMtx->_01;
                mtx22._10 = pMtx->_10;
                mtx22._11 = pMtx->_11;
                DoAffineTransforme_(&mtx22, &pRnd->currentOam, &pos);
            } else {
                affineIndex = OAM_MANAGER_NO_AFFINE;
                if (gCurrentRndCore->flipFlag) {
                    u32 shapeAttr = pRnd->currentOam.attr01 & 0xC000C000;
                    u32 flipH, flipV;
                    flipH = pRnd->currentOam.flipH;
                    flipH = NNS_G2dIsRndCoreFlipH(gCurrentRndCore) ^ flipH;
                    flipV = pRnd->currentOam.flipV;
                    flipV = NNS_G2dIsRndCoreFlipV(gCurrentRndCore) ^ flipV;
                    pRnd->currentOam.attr01 = (((pRnd->currentOam.attr01 & ~0x10000000) | (flipH << 28)) & ~0x20000000) | (flipV << 29);
                    if (NNS_G2dIsRndCoreFlipH(gCurrentRndCore)) {
                        pRnd->currentOam.attr01 = (pRnd->currentOam.attr01 & 0xFE00FFFF) | (((u32)(-(gObjWidths[(s32)(shapeAttr & 0xC000) >> 14][(shapeAttr & 0xC0000000) >> 30] + pRnd->currentOam.x)) & 0x1FF) << 16);
                    }
                    if (NNS_G2dIsRndCoreFlipV(gCurrentRndCore)) {
                        pRnd->currentOam.attr01 = (pRnd->currentOam.attr01 & ~0xFF) | ((u32)(-(gObjHeights[(s32)(shapeAttr & 0xC000) >> 14][(shapeAttr & 0xC0000000) >> 30] + pRnd->currentOam.y)) & 0xFF);
                    }
                }
                pRnd->currentOam.x = (pos.x >> FX32_SHIFT) + pRnd->currentOam.x;
                pRnd->currentOam.y = (pos.y >> FX32_SHIFT) + pRnd->currentOam.y;
            }
            if (gCurrentRndCore->pFuncOamRegister(&pRnd->currentOam, affineIndex, FALSE) != TRUE) {
                return;
            }
            if (pSurface->pAfterDrawOamBackFunc != NULL) {
                pSurface->pAfterDrawOamBackFunc(gCurrentRndCore, pCell, i);
            }
        }
    }
}

static inline int GetOamX(const GXOamAttr *pOam) {
    int x = pOam->x;
    if (x > 255) {
        x = (s16)(x | 0xff00);
    }
    return x;
}

static inline int GetOamY(const GXOamAttr *pOam) {
    int y = pOam->y;
    if (y > 127) {
        y = (s16)(y | 0xff00);
    }
    return y;
}

void DrawOamToSurface3D_(GXOamAttr *pOam) {
    G3_LoadMtx43(&gCurrentRndCore->mtxFor3DGE);
    if (gCurrentRndCore->flipFlag) {
        u32 shapeAttr = pOam->attr01 & 0xc000c000;
        int x;
        u32 y, rawX;
        u32 flipH, flipV;
        if (NNS_G2dIsRndCoreFlipH(gCurrentRndCore)) {
            u16 width = gObjWidths[(int)(shapeAttr & 0xc000) >> 14][(shapeAttr & 0xc0000000) >> 30];
            int px = GetOamX(pOam);
            px += width;
            px = -px;
            rawX = (u16)px;
        } else {
            rawX = (u16)GetOamX(pOam);
        }
        x = (s16)rawX;
        if (NNS_G2dIsRndCoreFlipV(gCurrentRndCore)) {
            u16 height = gObjHeights[(int)(shapeAttr & 0xc000) >> 14][(shapeAttr & 0xc0000000) >> 30];
            int py = GetOamY(pOam);
            py += height;
            py = -py;
            y = (u16)py;
        } else {
            y = (u16)GetOamY(pOam);
        }
        flipH = pOam->flipH;
        flipH ^= NNS_G2dIsRndCoreFlipH(gCurrentRndCore);
        flipV = pOam->flipV;
        flipV ^= NNS_G2dIsRndCoreFlipV(gCurrentRndCore);
        pOam->attr01 &= ~0x10000000;
        pOam->attr01 |= flipH << 28;
        pOam->attr01 &= ~0x20000000;
        pOam->attr01 |= flipV << 29;
        NNS_G2dDrawOneOam3DDirectWithPosFast(x, (s16)y, -1, pOam, &gCurrentRndCore->pImgProxy->attr, gCurrentRndCore->baseTexAddr3D, gCurrentRndCore->basePltAddr3D);
    } else {
        NNS_G2dDrawOneOam3DDirectWithPosFast(GetOamX(pOam), GetOamY(pOam), -1, pOam, &gCurrentRndCore->pImgProxy->attr, gCurrentRndCore->baseTexAddr3D, gCurrentRndCore->basePltAddr3D);
    }
}

void DrawCellToSurface3D_(const NNSG2dRndCoreSurface *pSurface, const NNSG2dCellData *pCell) {
    NNSG2dRndCoreInstance *pRnd = gCurrentRndCore;
    u16 i = 0;
    for (; i < pCell->numOAMAttrs; i++) {
        const NNSG2dCellOAMAttrData *pSrc;
        gCurrentRndCore->bDrawEnable = TRUE;
        pSrc = &pCell->pOamAttrArray[i];
        pRnd->currentOam.attr0 = pSrc->attr0;
        pRnd->currentOam.attr1 = pSrc->attr1;
        pRnd->currentOam.attr2 = pSrc->attr2;
        if (pSurface->pBeforeDrawOamBackFunc) {
            pSurface->pBeforeDrawOamBackFunc(gCurrentRndCore, pCell, i);
        }
        if (gCurrentRndCore->bDrawEnable) {
            DrawOamToSurface3D_(&pRnd->currentOam);
        }
        if (pSurface->pAfterDrawOamBackFunc) {
            pSurface->pAfterDrawOamBackFunc(gCurrentRndCore, pCell, i);
        }
    }
}

#pragma force_active off

void NNS_G2dInitRndCore(NNSG2dRndCoreInstance *pRnd) {
    MIi_CpuClear16(0, (u16 *)pRnd, sizeof(NNSG2dRndCoreInstance));
    pRnd->pCurrentTargetSurface = NULL;
    pRnd->affineOverwriteMode = NNS_G2D_RND_AFFINE_OVERWRITE_DOUBLE;
    pRnd->pImgProxy = NULL;
    pRnd->pPltProxy = NULL;
    pRnd->flipFlag = 0;
    pRnd->bDrawEnable = TRUE;
    pRnd->pCurrentMtxCacheFor2D = NULL;
}

void NNS_G2dSetRndCoreImageProxy(NNSG2dRndCoreInstance *pRnd, const NNSG2dImageProxy *pImgProxy, const NNSG2dImagePaletteProxy *pPltProxy) {
    pRnd->pImgProxy = pImgProxy;
    pRnd->pPltProxy = pPltProxy;
}

void NNS_G2dSetRndCoreOamRegisterFunc(NNSG2dRndCoreInstance *pRnd, NNSG2dOamRegisterFunction pFuncOamRegister, NNSG2dAffineRegisterFunction pFuncOamAffineRegister) {
    pRnd->pFuncOamRegister = pFuncOamRegister;
    pRnd->pFuncOamAffineRegister = pFuncOamAffineRegister;
}

void NNS_G2dSetRndCoreAffineOverwriteMode(NNSG2dRndCoreInstance *pRnd, NNSG2dRendererAffineTypeOverwiteMode mode) {
    pRnd->affineOverwriteMode = mode;
}

// the geometry engine gets the 2D matrix as a 4x3 matrix with the soft sprite z value
void NNS_G2dSetRndCoreCurrentMtx3D(const MtxFx32 *pCurrentMxt) {
    NNSG2dRndCoreInstance *pRnd = gCurrentRndCore;
    const fx32 *src = (const fx32 *)pCurrentMxt;
    fx32 *dst = (fx32 *)&pRnd->mtxFor3DGE;
    pRnd->pCurrentMxt = pCurrentMxt;
    dst[0] = src[0];
    dst[1] = src[1];
    dst[2] = 0;
    dst[3] = src[2];
    dst[4] = src[3];
    dst[5] = 0;
    dst[6] = 0;
    dst[7] = 0;
    dst[8] = FX32_ONE;
    dst[9] = src[4];
    dst[10] = src[5];
    dst[11] = pRnd->zFor3DSoftwareSprite;
}

void NNS_G2dSetRndCoreCurrentMtx2D(const MtxFx32 *pCurrentMxt, NNSG2dRndCore2DMtxCache *pMtxCache) {
    NNSG2dRndCoreInstance *pRnd = gCurrentRndCore;
    pRnd->pCurrentMxt = pCurrentMxt;
    pRnd->pCurrentMtxCacheFor2D = pMtxCache;
}

void NNS_G2dSetRndCore3DSoftSpriteZvalue(NNSG2dRndCoreInstance *pRnd, fx32 z) {
    pRnd->zFor3DSoftwareSprite = z;
}

void NNS_G2dSetRndCoreSurface(NNSG2dRndCoreInstance *pRnd, NNSG2dRndCoreSurface *pSurface) {
    pRnd->pCurrentTargetSurface = pSurface;
}

BOOL NNS_G2dIsRndCoreFlipH(const NNSG2dRndCoreInstance *pRnd) {
    return (pRnd->flipFlag & 1) != 0;
}

BOOL NNS_G2dIsRndCoreFlipV(const NNSG2dRndCoreInstance *pRnd) {
    return (pRnd->flipFlag & 2) != 0;
}

void NNS_G2dSetRndCoreFlipMode(NNSG2dRndCoreInstance *pRnd, BOOL bFlipH, BOOL bFlipV) {
    if (bFlipH) {
        pRnd->flipFlag |= 1;
    } else {
        pRnd->flipFlag &= ~1;
    }
    if (bFlipV) {
        pRnd->flipFlag |= 2;
    } else {
        pRnd->flipFlag &= ~2;
    }
}

#pragma force_active on

void NNS_G2dRndCoreBeginRendering(NNSG2dRndCoreInstance *pRnd) {
    NNSG2dSurfaceType type;
    gCurrentRndCore = pRnd;
    type = pRnd->pCurrentTargetSurface->type;
    if (type == NNS_G2D_SURFACETYPE_MAIN3D) {
        reg_G3_MTX_MODE = GX_MTXMODE_PROJECTION;
        reg_G3_MTX_PUSH = 0;
        NNSG2dRndCoreSurface *pSurface = pRnd->pCurrentTargetSurface;
        u32 x = pSurface->viewRect.posTopLeft.x;
        u32 y = pSurface->viewRect.posTopLeft.y;
        reg_G3_MTX_TRANS = 0u - x;
        reg_G3_MTX_TRANS = 0u - y;
        reg_G3_MTX_TRANS = 0;
        reg_G3_MTX_MODE = GX_MTXMODE_POSITION;
        {
            const NNSG2dImageProxy *pImgProxy = gCurrentRndCore->pImgProxy;
            const NNSG2dImagePaletteProxy *pPltProxy;
            pRnd->baseTexAddr3D = NNS_G2dIsImageReadyToUse(pImgProxy, NNS_G2D_VRAM_TYPE_3DMAIN) ? NNS_G2dGetImageLocation(pImgProxy, NNS_G2D_VRAM_TYPE_3DMAIN) : 0;
            pPltProxy = gCurrentRndCore->pPltProxy;
            pRnd->basePltAddr3D = NNS_G2dIsImagePaletteReadyToUse(pPltProxy, NNS_G2D_VRAM_TYPE_3DMAIN) ? NNS_G2dGetImagePaletteLocation(pPltProxy, NNS_G2D_VRAM_TYPE_3DMAIN) : 0;
        }
    } else {
        const NNSG2dImageProxy *pImgProxy = pRnd->pImgProxy;
        // the VRAM location in characters of the OBJ mapping mode
        u32 charOffset = NNS_G2dIsImageReadyToUse(pImgProxy, (NNS_G2D_VRAM_TYPE)type) ? NNS_G2dGetImageLocation(pImgProxy, (NNS_G2D_VRAM_TYPE)type) >> (((*(s32 *)&pImgProxy->attr.mappingType & 0x700000) >> 20) + 5) : 0;
        gCurrentRndCore->base2DCharOffset = charOffset;
    }
}

#pragma force_active off

void NNS_G2dRndCoreEndRendering(void) {
    NNSG2dRndCoreInstance *pRnd = gCurrentRndCore;
    if (pRnd->pCurrentTargetSurface->type == NNS_G2D_SURFACETYPE_MAIN3D) {
        REGType32v *mtxRegs = &reg_G3_MTX_MODE;
        mtxRegs[0] = GX_MTXMODE_PROJECTION; // MTX_MODE
        mtxRegs[2] = 1;                     // MTX_POP
        mtxRegs[0] = GX_MTXMODE_POSITION;   // MTX_MODE
    } else {
        pRnd->base2DCharOffset = 0;
        gCurrentRndCore->pCurrentMxt = NULL;
        gCurrentRndCore->pCurrentMtxCacheFor2D = NULL;
    }
    gCurrentRndCore = NULL;
}

void NNS_G2dRndCoreDrawCell(const NNSG2dCellData *pCell) {
    NNSG2dRndCoreSurface *pSurface = gCurrentRndCore->pCurrentTargetSurface;
    if (!pSurface->bActive) {
        return;
    }
    gCurrentRndCore->bDrawEnable = TRUE;
    if (pSurface->pBeforeDrawCellBackFunc) {
        pSurface->pBeforeDrawCellBackFunc(gCurrentRndCore, pCell);
    }
    if (gCurrentRndCore->bDrawEnable) {
        switch (pSurface->type) {
        case NNS_G2D_SURFACETYPE_MAIN3D:
            DrawCellToSurface3D_(pSurface, pCell);
            break;
        case NNS_G2D_SURFACETYPE_MAIN2D:
        case NNS_G2D_SURFACETYPE_SUB2D:
            DrawCellToSurface2D_(pSurface, pCell);
            break;
        case NNS_G2D_SURFACETYPE_MAX:
            break;
        default:
            break;
        }
    }
    if (pSurface->pAfterDrawCellBackFunc) {
        pSurface->pAfterDrawCellBackFunc(gCurrentRndCore, pCell);
    }
}

#pragma force_active on

void NNS_G2dRndCoreDrawCellVramTransfer(const NNSG2dCellData *pCell, u32 cellVramTransferHandle) {
    u32 type;
    NNSG2dRndCoreSurface *pSurface = gCurrentRndCore->pCurrentTargetSurface;
    if (!pSurface->bActive) {
        return;
    }
    gCurrentRndCore->bDrawEnable = TRUE;
    if (pSurface->pBeforeDrawCellBackFunc) {
        pSurface->pBeforeDrawCellBackFunc(gCurrentRndCore, pCell);
    }
    if (gCurrentRndCore->bDrawEnable) {
        if (cellVramTransferHandle != -1) {
            type = pSurface->type;
            u32 *pDrawn = &NNSi_G2dGetCellTransferState(cellVramTransferHandle)->bDrawn;
            *pDrawn = (*pDrawn & ~(1U << type)) | (1U << type);
        }
        switch (pSurface->type) {
        case NNS_G2D_SURFACETYPE_MAIN3D:
            DrawCellToSurface3D_(pSurface, pCell);
            break;
        case NNS_G2D_SURFACETYPE_MAIN2D:
        case NNS_G2D_SURFACETYPE_SUB2D:
            DrawCellToSurface2D_(pSurface, pCell);
            break;
        case NNS_G2D_SURFACETYPE_MAX:
        default:
            break;
        }
    }
    if (pSurface->pAfterDrawCellBackFunc) {
        pSurface->pAfterDrawCellBackFunc(gCurrentRndCore, pCell);
    }
}

#pragma force_active off
