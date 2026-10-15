#include <nitro.h>
#include <nnsys/g3d_anm_mat_internal.h>

#pragma force_active on

// Maya texture matrix: scale and translation (no rotation)
void texmtxCalc_flagR_(MtxFx44 *pMtx, const G3dMatAnmResult *pResult) {
    pMtx->_00 = pResult->scaleS;
    pMtx->_11 = pResult->scaleT;
    pMtx->_01 = 0;
    pMtx->_30 = -(s32)(((s64)pResult->scaleS * pResult->transS) >> 8) * pResult->origWidth;
    pMtx->_31 = (s32)(((s64)pResult->scaleT * pResult->transT) >> 8) * pResult->origHeight + ((-2 * pResult->scaleT + 0x2000) * pResult->origHeight << 3);
    pMtx->_10 = 0;
}
