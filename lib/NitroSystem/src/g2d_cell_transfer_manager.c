#include <nitro.h>
#include <nnsys/g2d_internal.h>
#include <stddef.h>

NNSG2dCellTransferState *NNSi_G2dGetCellTransferState(u32 handle) {
    return &gCellTransferStateManager.pCellStateArray[handle];
}

void NNSi_G2dInitCellTransferState(u32 handle, u32 dstAddr3D, u32 dstAddr2DMain, u32 dstAddr2DSub, u32 szDst, const void *pSrcNCGR, const void *pSrcNCBR, u32 szSrcData) {
    NNSG2dCellTransferState *state = &gCellTransferStateManager.pCellStateArray[handle];
    NNSi_G2dInitializeVRamLocation(&state->dstVramLocation);
    if (dstAddr3D != G2D_VRAM_ADDR_NONE) {
        NNSi_G2dSetVramLocation(&state->dstVramLocation, NNS_G2D_VRAM_TYPE_3DMAIN, dstAddr3D);
    }
    if (dstAddr2DMain != G2D_VRAM_ADDR_NONE) {
        NNSi_G2dSetVramLocation(&state->dstVramLocation, NNS_G2D_VRAM_TYPE_2DMAIN, dstAddr2DMain);
    }
    if (dstAddr2DSub != G2D_VRAM_ADDR_NONE) {
        NNSi_G2dSetVramLocation(&state->dstVramLocation, NNS_G2D_VRAM_TYPE_2DSUB, dstAddr2DSub);
    }
    state->szDst = szDst;
    state->pSrcNCGR = pSrcNCGR;
    state->pSrcNCBR = pSrcNCBR;
    state->szSrcData = szSrcData;
}

// the public header declares this without a return type (implicit int); nothing is returned
int NNS_G2dInitCellTransferStateManager(NNSG2dCellTransferState *pCellStateArray, u32 numCellState, VramTransferTaskRegisterFuncPtr pTaskRegisterFunc) {
    u8 *state = (u8 *)pCellStateArray;                // walked as bytes and cleared as words: needed for the match
    u32 *manager = (u32 *)&gCellTransferStateManager; // written as words: needed for the match
    u32 i;
    manager[0] = (u32)pTaskRegisterFunc;
    manager[1] = numCellState;
    manager[2] = (u32)pCellStateArray;
    for (i = 0; i < numCellState; i++, state += sizeof(NNSG2dCellTransferState)) {
        u32 *fields = (u32 *)(state + offsetof(NNSG2dCellTransferState, szDst)); // szDst ... szByte
        NNSi_G2dInitializeVRamLocation((NNSG2dVRamLocation *)state);
        fields[0] = 0;
        fields[1] = 0;
        fields[2] = 0;
        fields[3] = 0;
        fields[4] = 0;
        fields[5] = 0;
        fields[6] = 0;
        fields[7] = 0;
        fields[8] = 0;
    }
}

#pragma force_active on

// queues the VRAM transfer of every active state that was requested and drawn, per VRAM type
void NNS_G2dUpdateCellTransferStateManager(void) {
    for (u32 i = 0; i < gCellTransferStateManager.numCellState; i++) {
        NNS_G2D_VRAM_TYPE type;
        NNSG2dCellTransferState *state = &gCellTransferStateManager.pCellStateArray[i];
        if (state->bActive) {
            for (type = NNS_G2D_VRAM_TYPE_3DMAIN; type < NNS_G2D_VRAM_TYPE_MAX; type = (NNS_G2D_VRAM_TYPE)(type + 1)) {
                int requested = 0;
                if (state->bTransferRequested & (1 << type)) {
                    if (state->bDrawn & (1 << type)) {
                        requested = 1;
                    }
                }
                if (requested) {
                    int dstType = gCellTransferDstTypes[type];
                    const u8 *pSrc;
                    if (type == NNS_G2D_VRAM_TYPE_3DMAIN) {
                        pSrc = state->pSrcNCBR;
                    } else {
                        pSrc = state->pSrcNCGR;
                    }
                    u32 dstAddr = NNSi_G2dGetVramLocation(&state->dstVramLocation, type);
                    if (gCellTransferStateManager.pTaskRegisterFunc((NNS_GFD_DST_TYPE)dstType, dstAddr, (void *)(pSrc + state->srcOffset), state->szByte)) {
                        state->bTransferRequested &= ~(1 << type);
                    }
                }
            }
            state->bDrawn = 0;
        }
    }
}

#pragma force_active off

void NNS_G2dSetCellTransferStateRequested(u32 handle, u32 srcOffset, u32 szByte) {
    NNSG2dCellTransferState *state = NNSi_G2dGetCellTransferState(handle);
    state->bTransferRequested = 0xffffffff; // every VRAM type
    state->srcOffset = srcOffset;
    state->szByte = szByte;
}

#pragma force_active on

u32 NNS_G2dGetNewCellTransferStateHandle(void) {
    for (u32 i = 0; i < gCellTransferStateManager.numCellState; i++) {
        if (gCellTransferStateManager.pCellStateArray[i].bActive != TRUE) {
            gCellTransferStateManager.pCellStateArray[i].bActive = TRUE;
            return i;
        }
    }
    return -1;
}

#pragma force_active off

void NNS_G2dFreeCellTransferStateHandle(u32 handle) {
    NNSG2dCellTransferState *state = &gCellTransferStateManager.pCellStateArray[handle];
    NNSi_G2dInitializeVRamLocation(&state->dstVramLocation);
    state->szDst = 0;
    state->pSrcNCGR = NULL;
    state->pSrcNCBR = NULL;
    state->szSrcData = 0;
    state->bActive = FALSE;
    state->bDrawn = 0;
    state->bTransferRequested = 0;
    state->srcOffset = 0;
    state->szByte = 0;
}
