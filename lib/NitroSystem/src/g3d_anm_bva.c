#include <nitro.h>
#include <nnsys/g3d_anm_mat_internal.h>

#pragma force_active on

void NNSi_G3dAnmObjInitNsBva(NNSG3dAnmObj *pAnmObj, void *pResAnm, const NNSG3dResMdl *pResMdl) {
    u32 i = 0;
    pAnmObj->funcAnm = (void *)gAnmCalcFuncNsBva;
    pAnmObj->numMapData = pResMdl->info.numNode;
    pAnmObj->resAnm = pResAnm;
    for (; i < pAnmObj->numMapData; i++) {
        pAnmObj->mapData[i] = i | G3D_ANMOBJ_MAPDATA_EXISTS;
    }
}

void NNSi_G3dAnmCalcNsBva(u32 *pResult, const NNSG3dAnmObj *pAnmObj, u32 dataIdx) {
    G3dResVisAnm *pVisAnm = pAnmObj->resAnm;
    u32 bit = (pAnmObj->frame >> FX32_SHIFT) * pVisAnm->numNode + dataIdx;
    *pResult = pVisAnm->visData[bit >> 5] & (1 << (bit & 31));
}
