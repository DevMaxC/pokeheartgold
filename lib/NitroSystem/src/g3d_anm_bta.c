#include <nitro.h>
#include <nnsys/g3d_anm_mat_internal.h>

#pragma force_active on

static inline G3dResTexSRTAnmData *GetTexSRTAnmData(const G3dResTexSRTAnm *pAnm, u32 idx) {
    const u8 *pDict = (const u8 *)&pAnm->dict;
    if (pDict && idx < pAnm->dict.numEntry) {
        const u8 *pEntryHeader = pDict + pAnm->dict.ofsEntry;
        return (G3dResTexSRTAnmData *)(pEntryHeader + 4 + ((const NNSG3dResDictEntryHeader *)pEntryHeader)->sizeUnit * idx);
    }
    return NULL;
}

// texture matrix (scale, rotation, translation) of a material at a frame
void GetTexSRTAnm_(const G3dResTexSRTAnm *pAnm, u32 dataIdx, u32 frame, G3dMatAnmResult *pResult) {
    G3dResTexSRTAnmData *pData = GetTexSRTAnmData(pAnm, dataIdx);
    u32 flag;
    int s, t;
    u32 sinCos;
    flag = pResult->flag;
    s = GetTexSRTAnmVectorVal_(pAnm, pData->transS.info, pData->transS.data, frame);
    t = GetTexSRTAnmVectorVal_(pAnm, pData->transT.info, pData->transT.data, frame);
    if (s == 0 && t == 0) {
        flag |= G3D_MATANM_FLAG_TEXMTX_TRANSZERO;
    } else {
        pResult->transS = s;
        pResult->transT = t;
        flag &= ~G3D_MATANM_FLAG_TEXMTX_TRANSZERO;
    }
    sinCos = GetTexSRTAnmSinCosVal_(pAnm, pData->rot.info, pData->rot.data, frame);
    if (sinCos == G3D_TEXSRTANM_ROT_ZERO) {
        flag |= G3D_MATANM_FLAG_TEXMTX_ROTZERO;
    } else {
        pResult->sinR = sinCos;
        pResult->cosR = sinCos >> 16;
        flag &= ~G3D_MATANM_FLAG_TEXMTX_ROTZERO;
    }
    s = GetTexSRTAnmVectorVal_(pAnm, pData->scaleS.info, pData->scaleS.data, frame);
    t = GetTexSRTAnmVectorVal_(pAnm, pData->scaleT.info, pData->scaleT.data, frame);
    if (s == FX32_ONE && t == FX32_ONE) {
        flag |= G3D_MATANM_FLAG_TEXMTX_SCALEONE;
    } else {
        pResult->scaleS = s;
        pResult->scaleT = t;
        flag &= ~G3D_MATANM_FLAG_TEXMTX_SCALEONE;
    }
    pResult->flag = flag;
}

void NNSi_G3dAnmObjInitNsBta(NNSG3dAnmObj *pAnmObj, void *pResAnm, const NNSG3dResMdl *pResMdl) {
    G3dResTexSRTAnm *pTexSRTAnm = pResAnm;
    G3dResMat *pMat = G3dGetResMat(pResMdl);
    u32 i;
    pAnmObj->funcAnm = (void *)gAnmCalcFuncNsBta;
    {
        u32 numMat = pResMdl->info.numMat;
        pAnmObj->numMapData = numMat;
        MIi_CpuClear16(0, pAnmObj->mapData, numMat * sizeof(u16));
    }
    for (i = 0; i < pTexSRTAnm->dict.numEntry; i++) {
        const NNSG3dResName *pName = G3dGetResNameByIdx(&pTexSRTAnm->dict, i);
        int matID = pMat ? NNS_G3dGetResDictIdxByName(&pMat->dict, pName) : -1;
        if (matID >= 0) {
            pAnmObj->mapData[matID] = i | G3D_ANMOBJ_MAPDATA_EXISTS;
        }
    }
}

void NNSi_G3dAnmCalcNsBta(G3dMatAnmResult *pResult, const NNSG3dAnmObj *pAnmObj, u32 dataIdx) {
    GetTexSRTAnm_(pAnmObj->resAnm, (u16)dataIdx, pAnmObj->frame >> FX32_SHIFT, pResult);
    pResult->prmTexImage = (pResult->prmTexImage & ~REG_G3_TEXIMAGE_PARAM_TGEN_MASK) | (GX_TEXGEN_TEXCOORD << REG_G3_TEXIMAGE_PARAM_TGEN_SHIFT);
    pResult->flag |= G3D_MATANM_FLAG_TEXMTX_SET;
}
