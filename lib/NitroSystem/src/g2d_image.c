#include <nitro.h>
#include <nnsys/g2d_internal.h>

void NNS_G2dInitImageProxy(NNSG2dImageProxy *pImg) {
    int i;
    for (i = 0; i < NNS_G2D_VRAM_TYPE_MAX; i++) {
        pImg->vramLocation.baseAddrOfVram[i] = G2D_VRAM_ADDR_NONE;
    }
}

void NNS_G2dSetImageLocation(NNSG2dImageProxy *pImg, NNS_G2D_VRAM_TYPE type, u32 addr) {
    pImg->vramLocation.baseAddrOfVram[type] = addr;
}

u32 NNS_G2dGetImageLocation(const NNSG2dImageProxy *pImg, NNS_G2D_VRAM_TYPE type) {
    return pImg->vramLocation.baseAddrOfVram[type];
}

BOOL NNS_G2dIsImageReadyToUse(const NNSG2dImageProxy *pImg, NNS_G2D_VRAM_TYPE type) {
    return pImg->vramLocation.baseAddrOfVram[type] != G2D_VRAM_ADDR_NONE;
}

void NNS_G2dInitImagePaletteProxy(NNSG2dImagePaletteProxy *pImg) {
    int i;
    for (i = 0; i < NNS_G2D_VRAM_TYPE_MAX; i++) {
        pImg->vramLocation.baseAddrOfVram[i] = G2D_VRAM_ADDR_NONE;
    }
}

void NNS_G2dSetImagePaletteLocation(NNSG2dImagePaletteProxy *pImg, NNS_G2D_VRAM_TYPE type, u32 addr) {
    pImg->vramLocation.baseAddrOfVram[type] = addr;
}

u32 NNS_G2dGetImagePaletteLocation(const NNSG2dImagePaletteProxy *pImg, NNS_G2D_VRAM_TYPE type) {
    return pImg->vramLocation.baseAddrOfVram[type];
}

BOOL NNS_G2dIsImagePaletteReadyToUse(const NNSG2dImagePaletteProxy *pImg, NNS_G2D_VRAM_TYPE type) {
    return pImg->vramLocation.baseAddrOfVram[type] != G2D_VRAM_ADDR_NONE;
}

#pragma force_active on

// texture size code (GXTexSizeS/T) for a size in characters
static inline u32 GetTexSizeCode(u16 numChars) {
    switch (numChars) {
    case 1:
        return 0;
    case 2:
        return 1;
    case 4:
        return 2;
    case 8:
        return 3;
    case 16:
        return 4;
    case 32:
        return 5;
    default:
        return 0;
    }
}

void NNS_G2dLoadImage1DMapping(const NNSG2dCharacterData *pSrcData, u32 baseAddr, NNS_G2D_VRAM_TYPE type, NNSG2dImageProxy *pImgProxy) {
    GXOBJVRamModeChar mappingType = pSrcData->mapingType;
    switch (type) {
    case NNS_G2D_VRAM_TYPE_3DMAIN:
        break;
    case NNS_G2D_VRAM_TYPE_2DMAIN:
        reg_GX_DISPCNT = (reg_GX_DISPCNT & 0xffcfffef) | mappingType;
        break;
    case NNS_G2D_VRAM_TYPE_2DSUB:
        reg_GXS_DB_DISPCNT = (reg_GXS_DB_DISPCNT & 0xffcfffef) | mappingType;
        break;
    default:
        break;
    }
    DC_FlushRange(pSrcData->pRawData, pSrcData->szByte);
    switch (type) {
    case NNS_G2D_VRAM_TYPE_3DMAIN:
        GX_BeginLoadTex();
        GX_LoadTex(pSrcData->pRawData, baseAddr, pSrcData->szByte);
        GX_EndLoadTex();
        break;
    case NNS_G2D_VRAM_TYPE_2DMAIN:
        GX_LoadOBJ(pSrcData->pRawData, baseAddr, pSrcData->szByte);
        break;
    case NNS_G2D_VRAM_TYPE_2DSUB:
        GXS_LoadOBJ(pSrcData->pRawData, baseAddr, pSrcData->szByte);
        break;
    default:
        break;
    }
    if (pSrcData->mapingType == GX_OBJVRAMMODE_CHAR_2D) {
        pImgProxy->attr.sizeS = (GXTexSizeS)GetTexSizeCode(pSrcData->W);
        pImgProxy->attr.sizeT = (GXTexSizeT)GetTexSizeCode(pSrcData->H);
    } else {
        pImgProxy->attr.sizeS = (GXTexSizeS)pSrcData->W;
        pImgProxy->attr.sizeT = (GXTexSizeT)pSrcData->H;
    }
    pImgProxy->attr.fmt = pSrcData->pixelFmt;
    pImgProxy->attr.bExtendedPlt = FALSE;
    pImgProxy->attr.plttUse = GX_TEXPLTTCOLOR0_TRNS;
    pImgProxy->attr.mappingType = pSrcData->mapingType;
    NNS_G2dSetImageLocation(pImgProxy, type, baseAddr);
}

void NNS_G2dLoadImage2DMapping(const NNSG2dCharacterData *pSrcData, u32 baseAddr, NNS_G2D_VRAM_TYPE type, NNSG2dImageProxy *pImgProxy) {
    GXOBJVRamModeChar mappingType = pSrcData->mapingType;
    switch (type) {
    case NNS_G2D_VRAM_TYPE_3DMAIN:
        break;
    case NNS_G2D_VRAM_TYPE_2DMAIN:
        reg_GX_DISPCNT = (reg_GX_DISPCNT & 0xffcfffef) | mappingType;
        break;
    case NNS_G2D_VRAM_TYPE_2DSUB:
        reg_GXS_DB_DISPCNT = (reg_GXS_DB_DISPCNT & 0xffcfffef) | mappingType;
        break;
    default:
        break;
    }
    DC_FlushRange(pSrcData->pRawData, pSrcData->szByte);
    switch (type) {
    case NNS_G2D_VRAM_TYPE_3DMAIN:
        GX_BeginLoadTex();
        GX_LoadTex(pSrcData->pRawData, baseAddr, pSrcData->szByte);
        GX_EndLoadTex();
        break;
    case NNS_G2D_VRAM_TYPE_2DMAIN:
        GX_LoadOBJ(pSrcData->pRawData, baseAddr, pSrcData->szByte);
        break;
    case NNS_G2D_VRAM_TYPE_2DSUB:
        GXS_LoadOBJ(pSrcData->pRawData, baseAddr, pSrcData->szByte);
        break;
    default:
        break;
    }
    if (pSrcData->mapingType == GX_OBJVRAMMODE_CHAR_2D) {
        pImgProxy->attr.sizeS = (GXTexSizeS)GetTexSizeCode(pSrcData->W);
        pImgProxy->attr.sizeT = (GXTexSizeT)GetTexSizeCode(pSrcData->H);
    } else {
        pImgProxy->attr.sizeS = (GXTexSizeS)pSrcData->W;
        pImgProxy->attr.sizeT = (GXTexSizeT)pSrcData->H;
    }
    pImgProxy->attr.fmt = pSrcData->pixelFmt;
    pImgProxy->attr.bExtendedPlt = FALSE;
    pImgProxy->attr.plttUse = GX_TEXPLTTCOLOR0_TRNS;
    pImgProxy->attr.mappingType = pSrcData->mapingType;
    NNS_G2dSetImageLocation(pImgProxy, type, baseAddr);
}

#pragma force_active off

void NNS_G2dLoadImageVramTransfer(const NNSG2dCharacterData *pSrcData, u32 baseAddr, NNS_G2D_VRAM_TYPE type, NNSG2dImageProxy *pImgProxy) {
    u32 sizeCode;
    u32 mappingType;
    DC_FlushRange(pSrcData->pRawData, pSrcData->szByte);
    mappingType = *(volatile const u32 *)&pSrcData->mapingType; // volatile read: needed for the match
    switch (type) {
    case NNS_G2D_VRAM_TYPE_3DMAIN:
        break;
    case NNS_G2D_VRAM_TYPE_2DMAIN:
        reg_GX_DISPCNT = (reg_GX_DISPCNT & 0xffcfffef) | mappingType;
        break;
    case NNS_G2D_VRAM_TYPE_2DSUB:
        reg_GXS_DB_DISPCNT = (reg_GXS_DB_DISPCNT & 0xffcfffef) | mappingType;
        break;
    default:
        break;
    }
    if (pSrcData->mapingType == GX_OBJVRAMMODE_CHAR_2D) {
        switch (pSrcData->W) {
        case 1:
            sizeCode = 0;
            break;
        case 2:
            sizeCode = 1;
            break;
        case 4:
            sizeCode = 2;
            break;
        case 8:
            sizeCode = 3;
            break;
        case 16:
            sizeCode = 4;
            break;
        case 32:
            sizeCode = 5;
            break;
        default:
            sizeCode = 0;
            break;
        }
        pImgProxy->attr.sizeS = (GXTexSizeS)sizeCode;
        switch (pSrcData->H) {
        case 1:
            sizeCode = 0;
            break;
        case 2:
            sizeCode = 1;
            break;
        case 4:
            sizeCode = 2;
            break;
        case 8:
            sizeCode = 3;
            break;
        case 16:
            sizeCode = 4;
            break;
        case 32:
            sizeCode = 5;
            break;
        default:
            sizeCode = 0;
            break;
        }
        pImgProxy->attr.sizeT = (GXTexSizeT)sizeCode;
    } else {
        pImgProxy->attr.sizeS = (GXTexSizeS)pSrcData->W;
        pImgProxy->attr.sizeT = (GXTexSizeT)pSrcData->H;
    }
    pImgProxy->attr.fmt = pSrcData->pixelFmt;
    pImgProxy->attr.bExtendedPlt = FALSE;
    pImgProxy->attr.plttUse = GX_TEXPLTTCOLOR0_TRNS;
    pImgProxy->attr.mappingType = pSrcData->mapingType;
    NNS_G2dSetImageLocation(pImgProxy, type, baseAddr);
}

void NNS_G2dLoadPalette(const NNSG2dPaletteData *pSrcData, u32 addr, NNS_G2D_VRAM_TYPE type, NNSG2dImagePaletteProxy *pPltProxy) {
    void *pRawData = pSrcData->pRawData;
    u32 szByte = pSrcData->szByte;
    DC_FlushRange(pRawData, szByte);
    switch (type) {
    case NNS_G2D_VRAM_TYPE_2DMAIN:
        if (pSrcData->bExtendedPlt) {
            GX_BeginLoadOBJExtPltt();
            GX_LoadOBJExtPltt(pRawData, addr, szByte);
            GX_EndLoadOBJExtPltt();
        } else {
            GX_LoadOBJPltt(pRawData, addr, szByte);
        }
        break;
    case NNS_G2D_VRAM_TYPE_2DSUB:
        if (pSrcData->bExtendedPlt) {
            GXS_BeginLoadOBJExtPltt();
            GXS_LoadOBJExtPltt(pRawData, addr, szByte);
            GXS_EndLoadOBJExtPltt();
        } else {
            GXS_LoadOBJPltt(pRawData, addr, szByte);
        }
        break;
    case NNS_G2D_VRAM_TYPE_3DMAIN:
        GX_BeginLoadTexPltt();
        GX_LoadTexPltt(pRawData, addr, szByte);
        GX_EndLoadTexPltt();
        break;
    default:
        break;
    }
    pPltProxy->fmt = pSrcData->fmt;
    pPltProxy->bExtendedPlt = pSrcData->bExtendedPlt;
    NNS_G2dSetImagePaletteLocation(pPltProxy, type, addr);
}

// loads only the palettes listed in the compression info, each to its original slot
void NNS_G2dLoadPaletteEx(const NNSG2dPaletteData *pSrcData, const NNSG2dPaletteCompressInfo *pCmpInfo, u32 addr, NNS_G2D_VRAM_TYPE type, NNSG2dImagePaletteProxy *pPltProxy) {
    u32 szPltt;
    u16 numPalette;
    u32 srcOffset;
    void *pRawData;
    u32 dstOffset;
    u16 i;
    if (pSrcData->fmt == GX_TEXFMT_PLTT16) {
        szPltt = 0x20;
    } else {
        szPltt = 0x200;
    }
    numPalette = pCmpInfo->numPalette;
    for (i = 0; i < numPalette; i++) {
        srcOffset = szPltt * i;
        dstOffset = szPltt * ((u16 *)pCmpInfo->pPlttIdxTbl)[i];
        pRawData = pSrcData->pRawData;
        DC_FlushRange(pRawData, pSrcData->szByte);
        switch (type) {
        case NNS_G2D_VRAM_TYPE_2DMAIN:
            if (pSrcData->bExtendedPlt) {
                GX_BeginLoadOBJExtPltt();
                GX_LoadOBJExtPltt((u8 *)pRawData + srcOffset, addr + dstOffset, szPltt);
                GX_EndLoadOBJExtPltt();
            } else {
                GX_LoadOBJPltt((u8 *)pRawData + srcOffset, addr + dstOffset, szPltt);
            }
            break;
        case NNS_G2D_VRAM_TYPE_2DSUB:
            if (pSrcData->bExtendedPlt) {
                GXS_BeginLoadOBJExtPltt();
                GXS_LoadOBJExtPltt((u8 *)pRawData + srcOffset, addr + dstOffset, szPltt);
                GXS_EndLoadOBJExtPltt();
            } else {
                GXS_LoadOBJPltt((u8 *)pRawData + srcOffset, addr + dstOffset, szPltt);
            }
            break;
        case NNS_G2D_VRAM_TYPE_3DMAIN:
            GX_BeginLoadTexPltt();
            GX_LoadTexPltt((u8 *)pRawData + srcOffset, addr + dstOffset, szPltt);
            GX_EndLoadTexPltt();
            break;
        default:
            break;
        }
    }
    pPltProxy->fmt = pSrcData->fmt;
    pPltProxy->bExtendedPlt = pSrcData->bExtendedPlt;
    NNS_G2dSetImagePaletteLocation(pPltProxy, type, addr);
}

void NNSi_G2dInitializeVRamLocation(NNSG2dVRamLocation *pVramLocation) {
    s32 i;
    for (i = 0; i < NNS_G2D_VRAM_TYPE_MAX; i++) {
        pVramLocation->baseAddrOfVram[i] = G2D_VRAM_ADDR_NONE;
    }
}

void NNSi_G2dSetVramLocation(NNSG2dVRamLocation *pVramLocation, NNS_G2D_VRAM_TYPE type, u32 addr) {
    pVramLocation->baseAddrOfVram[type] = addr;
}

u32 NNSi_G2dGetVramLocation(NNSG2dVRamLocation *pVramLocation, NNS_G2D_VRAM_TYPE type) {
    return pVramLocation->baseAddrOfVram[type];
}
