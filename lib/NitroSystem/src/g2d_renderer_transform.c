#include <nitro.h>
#include <nnsys/g2d_renderer_internal.h>

#pragma force_active on

static inline BOOL IsAffineLevelSet(void) {
    return !gRendererWork.state.translateOnly && gRendererContext.affineLevel != RENDERER_NO_AFFINE_LEVEL;
}

// a scale or rotation at the current level: the level needs a new matrix cache
static inline void MarkCurrentLevelAffine(void) {
    G2dMtxCacheRecord *pRecord;
    if (IsAffineLevelSet() == FALSE) {
        gRendererContext.affineLevel = (u16)gRendererWork.state.stackLevel;
    }
    pRecord = &gRendererWork.mtxCacheRecords[(u16)gRendererWork.state.stackLevel];
    switch (pRecord->state) {
    case 0:
    case 2:
    case 3:
        pRecord->groupId = gRendererWork.state.nextMtxGroupId++;
        pRecord->state = 1;
        break;
    case 1:
        break;
    }
}

void NNS_G2dScale(fx32 x, fx32 y, fx32 z) {
    MtxFx32 mtx;
    mtx._00 = x;
    mtx._01 = 0;
    mtx._10 = 0;
    mtx._11 = y;
    mtx._20 = 0;
    mtx._21 = 0;
    NNSi_G2dMtxConcat32(&mtx, &gRendererWork.mtxStack[gRendererWork.state.stackLevel], &gRendererWork.mtxStack[gRendererWork.state.stackLevel]);
    mtx._00 = FX_Inv(x);
    mtx._01 = 0;
    mtx._10 = 0;
    mtx._11 = FX_Inv(y);
    mtx._20 = 0;
    mtx._21 = 0;
    NNSi_G2dMtxConcat32(&mtx, &gRendererWork.affineMtxStack[gRendererWork.state.stackLevel], &gRendererWork.affineMtxStack[gRendererWork.state.stackLevel]);
    MarkCurrentLevelAffine();
}

void NNS_G2dRotZ(fx32 sin, fx32 cos) {
    MtxFx32 mtx;
    mtx._00 = cos;
    mtx._01 = sin;
    mtx._10 = -sin;
    mtx._11 = cos;
    mtx._20 = 0;
    mtx._21 = 0;
    NNSi_G2dMtxConcat32(&mtx, &gRendererWork.mtxStack[gRendererWork.state.stackLevel], &gRendererWork.mtxStack[gRendererWork.state.stackLevel]);
    NNSi_G2dMtxConcat32(&mtx, &gRendererWork.affineMtxStack[gRendererWork.state.stackLevel], &gRendererWork.affineMtxStack[gRendererWork.state.stackLevel]);
    MarkCurrentLevelAffine();
}

#pragma force_active off

const NNSG2dPaletteSwapTable *NNS_G2dGetRendererPaletteTbl(const NNSG2dRendererInstance *pRend) {
    return pRend->pPaletteSwapTbl;
}

void NNS_G2dSetRendererImageProxy(NNSG2dRendererInstance *pRend, const NNSG2dImageProxy *pImgProxy, const NNSG2dImagePaletteProxy *pPltProxy) {
    NNS_G2dSetRndCoreImageProxy(&pRend->rendererCore, pImgProxy, pPltProxy);
}

#pragma force_active on

// ab = a * b; ab may be b
void NNSi_G2dMtxConcat32(const MtxFx32 *a, const MtxFx32 *b, MtxFx32 *ab) {
    MtxFx32 tmp;
    MtxFx32 *pDst = ab;
    if (ab == b) {
        pDst = &tmp;
    }
    pDst->_00 = (fx32)(((s64)a->_00 * b->_00 + (s64)a->_01 * b->_10) >> FX32_SHIFT);
    pDst->_01 = (fx32)(((s64)a->_00 * b->_01 + (s64)a->_01 * b->_11) >> FX32_SHIFT);
    pDst->_10 = (fx32)(((s64)a->_10 * b->_00 + (s64)a->_11 * b->_10) >> FX32_SHIFT);
    pDst->_11 = (fx32)(((s64)a->_10 * b->_01 + (s64)a->_11 * b->_11) >> FX32_SHIFT);
    pDst->_20 = b->_20 + (fx32)(((s64)a->_20 * b->_00 + (s64)a->_21 * b->_10) >> FX32_SHIFT);
    pDst->_21 = b->_21 + (fx32)(((s64)a->_20 * b->_01 + (s64)a->_21 * b->_11) >> FX32_SHIFT);
    if (pDst == &tmp) {
        *ab = tmp;
    }
}
