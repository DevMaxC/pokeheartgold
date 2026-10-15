#include <nitro.h>
#include <nnsys/g2d_renderer_internal.h>

#pragma force_active on

// resets the current level of the matrix stack
void NNSi_G2dIdentity(void) {
    u32 level = gRendererWork.state.stackLevel;
    if (gRendererWork.state.translateOnly) {
        gRendererMtxStackTransX[level].value = 0;
        gRendererMtxStackTransY[level].value = 0;
    } else {
        MtxFx32 *pMtx = &gRendererMtxStack[level];
        pMtx->_00 = FX32_ONE;
        pMtx->_01 = 0;
        pMtx->_10 = 0;
        pMtx->_11 = FX32_ONE;
        pMtx->_20 = 0;
        pMtx->_21 = 0;
        gRendererAffineMtxStack[level] = *pMtx;
    }
    gRendererZStack[level] = 0;
}
