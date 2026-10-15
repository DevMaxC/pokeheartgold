#include <nitro.h>
#include <nnsys/g3d_anm_mat_internal.h>

#pragma force_active on

void NNSi_G3dAnmObjInitNsBtp(NNSG3dAnmObj *pAnmObj, void *pResAnm, const NNSG3dResMdl *pResMdl) {
    G3dResTexPatAnm *pTexPatAnm = pResAnm;
    G3dResMat *pMat = G3dGetResMat(pResMdl);
    u32 i;
    pAnmObj->funcAnm = (void *)gAnmCalcFuncNsBtp;
    pAnmObj->numMapData = pResMdl->info.numMat;
    pAnmObj->resAnm = pResAnm;
    MIi_CpuClear16(0, pAnmObj->mapData, pAnmObj->numMapData * sizeof(u16));
    for (i = 0; i < pTexPatAnm->dict.numEntry; i++) {
        const NNSG3dResName *pName = G3dGetResNameByIdx(&pTexPatAnm->dict, i);
        int matID = pMat ? NNS_G3dGetResDictIdxByName(&pMat->dict, pName) : -1;
        if (matID >= 0) {
            pAnmObj->mapData[matID] = i | G3D_ANMOBJ_MAPDATA_EXISTS;
        }
    }
}
