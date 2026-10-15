#include <nitro.h>
#include <nnsys/g2d_renderer_internal.h>

#pragma force_active on

static inline BOOL IsMtxCacheRecordDirty(const G2dMtxCacheRecord *pRecord) {
    BOOL dirty = TRUE;
    if (pRecord->state != 1 && pRecord->state != 2) {
        dirty = FALSE;
    }
    return dirty;
}

static inline void InitMtxCache(NNSG2dRndCore2DMtxCache *pCache) {
    MIi_CpuClearFast(MtxCache_NOT_AVAILABLE_ForMemFill, (u32 *)pCache->affineIndex, sizeof(pCache->affineIndex));
}

#pragma push
#pragma opt_arithtransformation off
#pragma opt_propagation off

// stores the affine matrix of the current matrix stack level into a new 2D matrix cache, and makes
// the levels below that share its scale / rotation use the same cache
void NNSi_G2dMCMStoreCurrentMtxToMtxCache(void) {
    G2dMtxCacheRecord *pRecord = &gRendererMtxCacheRecords[(u16)gRendererWork.state.stackLevel];
    if (IsMtxCacheRecordDirty(pRecord)) {
        G2dRendererState *pState;
        u16 groupId;
        u16 cacheIndex = gRendererWork.state.numMtxCaches;
        const MtxFx32 *pMtx;
        int level;
        if (cacheIndex < RENDERER_MTX_STACK_SIZE - 1) {
            gRendererWork.state.numMtxCaches = cacheIndex + 1;
        }
        groupId = pRecord->groupId;
        pRecord->cacheIndex = cacheIndex;
        InitMtxCache(&gRendererMtxCaches[cacheIndex]);
        if (!gRendererWork.state.translateOnly) {
            pMtx = &gRendererAffineMtxStack[gRendererWork.state.stackLevel];
        } else {
            gRendererContext.translationMtx._20 = gRendererMtxStack[gRendererWork.state.stackLevel]._20;
            gRendererContext.translationMtx._21 = gRendererMtxStack[gRendererWork.state.stackLevel]._21;
            pMtx = &gRendererContext.translationMtx;
        }
        {
            NNSG2dRndCore2DMtxCache *pCache = gRendererMtxCaches;
            u16 index = gRendererMtxCacheRecords[(u16)gRendererWork.state.stackLevel].cacheIndex;
            pCache[index].m22._00 = pMtx->_00;
            pCache += index;
            pCache->m22._01 = pMtx->_01;
            pState = &gRendererWork.state;
            pCache->m22._10 = pMtx->_10;
            pCache->m22._11 = pMtx->_11;
        }
        for (level = (u16)pState->stackLevel; level >= 0; level--) {
            if (gRendererMtxCacheRecords[level].groupId != groupId) {
                return;
            }
            gRendererMtxCacheRecords[level].state = 3;
            gRendererMtxCacheRecords[level].cacheIndex = cacheIndex;
        }
    }
}

#pragma pop
