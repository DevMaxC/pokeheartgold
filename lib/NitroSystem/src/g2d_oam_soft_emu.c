#include <nitro.h>
#include <nnsys/g2d_internal.h>

#pragma force_active on

static inline void TexImageParam(GXTexFmt fmt, GXTexGen gen, GXTexSizeS s, GXTexSizeT t, GXTexRepeat rep, GXTexFlip flip, GXTexPlttColor0 pltt0, u32 addr) {
    reg_G3_TEXIMAGE_PARAM = GX_PACK_TEXIMAGE_PARAM(fmt, gen, s, t, rep, flip, pltt0, addr);
}

static inline void TexPlttBase(u32 addr, GXTexFmt fmt) {
    reg_G3_TEXPLTT_BASE = GX_PACK_TEXPLTTBASE_PARAM(addr, fmt);
}

// sets the texture and palette of an OBJ drawn as a quad and computes its texture coordinates
void CalcSpriteParams_(const GXOamAttr *pOam, const NNSG2dImageAttr *pTexAttr, u32 texBase, u32 plttBase, SpriteParams *pParams) {
    u32 shapeAttr = pOam->attr01 & 0xC000C000;
    u32 size = (shapeAttr & 0xC0000000) >> 30;
    int shape = (int)(shapeAttr & 0xC000) >> 14;
    u16 charNo = pOam->charNo;
    BOOL flipH, flipV;

    pParams->w = gObjWidths[shape][size];
    pParams->h = gObjHeights[shape][size];

    if (pTexAttr->mappingType == GX_OBJVRAMMODE_CHAR_2D) {
        TexImageParam(pTexAttr->fmt, GX_TEXGEN_TEXCOORD, pTexAttr->sizeS, pTexAttr->sizeT, GX_TEXREPEAT_NONE, GX_TEXFLIP_NONE, pTexAttr->plttUse, texBase);
        if (pTexAttr->fmt == GX_TEXFMT_PLTT256) {
            charNo >>= 1;
        }
        pParams->u0 = (charNo & (gTexSizeInChars[pTexAttr->sizeS] - 1)) << FX32_SHIFT + 3;
        pParams->v0 = (charNo >> pTexAttr->sizeS) << FX32_SHIFT + 3;
    } else {
        u16 shape16 = shape;
        u16 size16 = size;
        u32 addr = texBase + (charNo << (((pTexAttr->mappingType & 0x700000) >> 20) + 5));
        reg_G3_TEXIMAGE_PARAM = (pTexAttr->fmt << REG_G3_TEXIMAGE_PARAM_TEXFMT_SHIFT) | (addr >> 3) | (GX_TEXGEN_TEXCOORD << REG_G3_TEXIMAGE_PARAM_TGEN_SHIFT) | (gObjTexSizeS[shape16][size16] << REG_G3_TEXIMAGE_PARAM_V_SIZE_SHIFT) | (gObjTexSizeT[shape16][size16] << REG_G3_TEXIMAGE_PARAM_T_SIZE_SHIFT) | (pTexAttr->plttUse << REG_G3_TEXIMAGE_PARAM_TR_SHIFT);
        pParams->u0 = 0;
        pParams->v0 = 0;
    }
    pParams->u1 = pParams->u0 + (pParams->w << FX32_SHIFT);
    pParams->v1 = pParams->v0 + (pParams->h << FX32_SHIFT);

    flipV = pOam->flipV;
    flipH = pOam->flipH;
    if (flipH) {
        fx32 t = pParams->u0;
        pParams->u0 = pParams->u1;
        pParams->u1 = t;
    }
    if (flipV) {
        fx32 t = pParams->v0;
        pParams->v0 = pParams->v1;
        pParams->v1 = t;
    }
    if (gOamSoftEmuState.pUVCallback) {
        gOamSoftEmuState.pUVCallback(&pParams->u0, &pParams->v0, &pParams->u1, &pParams->v1, flipH, flipV);
    }
    {
        GXTexFmt fmt = gObjColorModeTexFmts[pOam->colorMode];
        u16 plttNo = pOam->cParam;
        u32 offset;
        if (pTexAttr->bExtendedPlt) {
            offset = plttNo << 9;
        } else if (fmt == GX_TEXFMT_PLTT256) {
            offset = 0;
        } else {
            offset = plttNo << 5;
        }
        TexPlttBase(plttBase + offset, fmt);
    }
}

#pragma force_active off

void NNSi_G2dSetOamSoftEmuAutoZOffsetFlag(BOOL flag) {
    gOamSoftEmuState.bAutoZOffset = flag;
}

void NNSi_G2dResetOamSoftEmuAutoZOffset(void) {
    gOamSoftEmuState.autoZOffset = 0;
}

void NNSi_G2dSetOamSoftEmuAutoZOffsetStep(fx32 step) {
    gOamSoftEmuAutoZOffsetStep = step;
}

fx32 NNSi_G2dGetOamSoftEmuAutoZOffsetStep(void) {
    return gOamSoftEmuAutoZOffsetStep;
}

#pragma force_active on

static inline fx32 GetZ(int z) {
    if (gOamSoftEmuState.bAutoZOffset) {
        return gOamSoftEmuState.autoZOffset + (z << FX32_SHIFT);
    }
    return z << FX32_SHIFT;
}

static inline void Scale(fx32 x, fx32 y, fx32 z) {
    reg_G3_MTX_SCALE = (u32)x;
    reg_G3_MTX_SCALE = (u32)y;
    reg_G3_MTX_SCALE = (u32)z;
}

static inline void TexCoord(fx32 s, fx32 t) {
    s16 tt = (s16)(t >> 8);
    s16 ss = (s16)(s >> 8);
    reg_G3_TEXCOORD = (u16)ss | ((u32)(u16)tt << REG_G3_TEXCOORD_DECIMAL_T_SHIFT);
}

void NNS_G2dDrawOneOam3DDirectWithPosFast(int posX, int posY, int posZ, const GXOamAttr *pOam, const NNSG2dImageAttr *pTexAttr, u32 texBaseAddr, u32 pltBaseAddr) {
    SpriteParams params;
    u32 effect;
    CalcSpriteParams_(pOam, pTexAttr, texBaseAddr, pltBaseAddr, &params);
    effect = pOam->attr01 & 0x300;
    if (effect != OAM_EFFECT_AFFINE && effect != OAM_EFFECT_AFFINE_DOUBLE) {
        effect |= pOam->attr01 & 0x30000000; // flip bits
    }
    if (effect == OAM_EFFECT_AFFINE_DOUBLE) {
        u32 shapeAttr = pOam->attr01 & 0xC000C000;
        u32 size;
        int shape;
        int halfH;
        int halfW;
        shape = (int)(shapeAttr & 0xC000) >> 14;
        size = (shapeAttr & 0xC0000000) >> 30;
        halfW = gObjWidths[shape][size] >> 1;
        halfH = gObjHeights[shape][size] >> 1;
        G3_Translate((posX + halfW) << FX32_SHIFT, (posY + halfH) << FX32_SHIFT, GetZ(posZ));
    } else {
        G3_Translate(posX << FX32_SHIFT, posY << FX32_SHIFT, GetZ(posZ));
    }
    Scale(params.w << FX32_SHIFT, params.h << FX32_SHIFT, FX32_ONE);
    reg_G3_BEGIN_VTXS = GX_BEGIN_QUADS;
    TexCoord(params.u0, params.v1);
    reg_G3_VTX_10 = 0x10000;
    TexCoord(params.u1, params.v1);
    reg_G3_VTX_10 = 0x10040;
    TexCoord(params.u1, params.v0);
    reg_G3_VTX_10 = 0x40;
    TexCoord(params.u0, params.v0);
    reg_G3_VTX_10 = 0;
    reg_G3_END_VTXS = 0;
    if (gOamSoftEmuState.bAutoZOffset) {
        gOamSoftEmuState.autoZOffset += gOamSoftEmuAutoZOffsetStep;
    }
}

#pragma force_active off
