#include <nitro.h>
#include <nnsys/g3d_anm_mat_internal.h>

#pragma force_active on

// texture image address field (texel offset / 8) of a texture of pTex
static inline u32 GetTexAddr_(const NNSG3dResTex *pTex, const G3dResTexData *pTexData) {
    if ((pTexData->texImageParam & REG_G3_TEXIMAGE_PARAM_TEXFMT_MASK) != (GX_TEXFMT_COMP4x4 << REG_G3_TEXIMAGE_PARAM_TEXFMT_SHIFT)) {
        return (u16)pTex->texInfo.vramKey & ~0xE0000000;
    }
    return (u16)pTex->tex4x4Info.vramKey & ~0xE0000000;
}

// texture image parameter, original size and size ratio of the texture pTexName
void SetTexParamaters_(const NNSG3dResTex *pTex, const NNSG3dResName *pTexName, G3dMatAnmResult *pResult) {
    G3dResTexData *pTexData = pTex ? NNS_G3dGetResDataByName(&pTex->dict, pTexName) : NULL;
    u32 width, height;
    u32 addr;
    addr = GetTexAddr_(pTex, pTexData);
    pResult->prmTexImage &= G3D_RESMATDATA_TEXIMAGEPARAM_KEEP_MASK;
    pResult->prmTexImage |= pTexData->texImageParam + addr;
    pResult->origWidth = G3D_RESTEXDATA_WIDTH(pTexData->extraParam);
    pResult->origHeight = G3D_RESTEXDATA_HEIGHT(pTexData->extraParam);
    width = G3D_RESTEXDATA_WIDTH(pTexData->extraParam);
    height = G3D_RESTEXDATA_HEIGHT(pTexData->extraParam);
    pResult->magW = width == pResult->origWidth ? FX32_ONE : FX_Div(width << FX32_SHIFT, pResult->origWidth << FX32_SHIFT);
    pResult->magH = height == pResult->origHeight ? FX32_ONE : FX_Div(height << FX32_SHIFT, pResult->origHeight << FX32_SHIFT);
}

// palette base of the palette pPlttName
void SetPlttParamaters_(const NNSG3dResTex *pTex, const NNSG3dResName *pPlttName, G3dMatAnmResult *pResult) {
    G3dResPlttData *pPlttData = pTex && pTex->plttInfo.ofsDict ? NNS_G3dGetResDataByName((NNSG3dResDict *)((u8 *)pTex + pTex->plttInfo.ofsDict), pPlttName) : NULL;
    u16 vramOffset = (u16)((u16)pTex->plttInfo.vramKey & 0x1FFFFFFF);
    u16 offset = pPlttData->offset;
    if (!(pPlttData->flag & G3D_RESPLTTDATA_4COLOR)) {
        offset >>= 1;
        vramOffset >>= 1;
    }
    pResult->prmTexPltt = offset + vramOffset;
}

void NNSi_G3dAnmCalcNsBtp(G3dMatAnmResult *pResult, const NNSG3dAnmObj *pAnmObj, u32 dataIdx) {
    G3dResTexPatAnm *pTexPatAnm = pAnmObj->resAnm;
    const G3dResTexPatAnmFV *pFV = NNSi_G3dGetTexPatAnmFV(pTexPatAnm, (u16)dataIdx, (u16)(pAnmObj->frame >> FX32_SHIFT));
    const NNSG3dResName *pName = NNSi_G3dGetTexPatAnmTexNameByIdx(pTexPatAnm, pFV->idxTex);
    SetTexParamaters_(pAnmObj->resTex, pName, pResult);
    if (pFV->idxPltt == 0xFF) {
        return; // no palette change
    }
    pName = NNSi_G3dGetTexPatAnmPlttNameByIdx(pTexPatAnm, pFV->idxPltt);
    SetPlttParamaters_(pAnmObj->resTex, pName, pResult);
}
