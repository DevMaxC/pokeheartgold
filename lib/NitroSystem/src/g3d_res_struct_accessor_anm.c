#include <nitro.h>
#include <nnsys/g3d_util_internal.h>

const NNSG3dResName *NNSi_G3dGetTexPatAnmTexNameByIdx(const G3dResTexPatAnm *pAnm, u32 texIdx) {
    if (pAnm != NULL) {
        if (texIdx < pAnm->numTex) {
            return (const NNSG3dResName *)((u8 *)pAnm + pAnm->ofsTexName + texIdx * sizeof(NNSG3dResName));
        }
    }
    return NULL;
}

const NNSG3dResName *NNSi_G3dGetTexPatAnmPlttNameByIdx(const G3dResTexPatAnm *pAnm, u32 plttIdx) {
    if (pAnm != NULL) {
        if (plttIdx < pAnm->numPltt) {
            return (const NNSG3dResName *)((u8 *)pAnm + pAnm->ofsPlttName + plttIdx * sizeof(NNSG3dResName));
        }
    }
    return NULL;
}

#pragma force_active on

// the key of a frame: start at the guess from the ratio, then step to the key that contains the frame
const G3dResTexPatAnmFV *NNSi_G3dGetTexPatAnmFV(const G3dResTexPatAnm *pAnm, u32 idx, u32 frame) {
    const G3dResTexPatAnmData *pData = NNSi_G3dGetTexPatAnmDataByIdx(pAnm, idx);
    u32 idxFV;
    const G3dResTexPatAnmFV *pFV = (const G3dResTexPatAnmFV *)((u8 *)pAnm + pData->ofsFV);
    idxFV = ((u32)(pData->ratioDataFrame * frame)) >> FX32_SHIFT;
    while (idxFV && pFV[idxFV].idxFrame >= frame) {
        idxFV--;
    }
    while (idxFV + 1 < pData->numFV && pFV[idxFV + 1].idxFrame <= frame) {
        idxFV++;
    }
    return &pFV[idxFV];
}

#pragma force_active off

const G3dResTexPatAnmData *NNSi_G3dGetTexPatAnmDataByIdx(const G3dResTexPatAnm *pAnm, u32 idx) {
    const NNSG3dResDict *pDict = &pAnm->dict;
    if (pDict != NULL) {
        if (idx < pAnm->dict.numEntry) {
            u16 ofsEntry = pAnm->dict.ofsEntry;
            u16 sizeUnit = *(u16 *)((u8 *)pDict + ofsEntry);
            return (const G3dResTexPatAnmData *)((u8 *)pDict + ofsEntry + 4 + sizeUnit * idx);
        }
    }
    return NULL;
}
