#include <nitro.h>
#include <nnsys/g3d/gecom.h>
#include <nnsys/g3d_util_internal.h>

#pragma force_active on

// sends the buffered geometry commands
void NNS_G3dGeFlushBuffer(void) {
    if (gGeBufferState.isLocked) {
        NNS_G3dGeWaitSendDL();
    }
    if (gGeBufferState.pBuffer && gGeBufferState.pBuffer[0]) {
        MIi_CpuSend32(gGeBufferState.pBuffer + 1, &reg_G3X_GXFIFO, gGeBufferState.pBuffer[0] * sizeof(u32));
        gGeBufferState.pBuffer[0] = 0;
    }
}

// waits for the display list DMA
void NNS_G3dGeWaitSendDL(void) {
    while (gGeBufferState.isLocked) {
    }
}

// DMA completion callback
void simpleUnlock_(void *pLocked) {
    *(u32 *)pLocked = 0;
}

// sends a display list: small ones (or without a DMA channel) through the buffer, others by DMA
void NNS_G3dGeSendDL(const void *pDL, u32 size) {
    if (size < 256 || GXi_DmaId == (u32)-1) {
        NNS_G3dGeBufferOP_N(((const u32 *)pDL)[0], (const u32 *)pDL + 1, (size >> 2) - 1);
        return;
    }
    NNS_G3dGeFlushBuffer();
    gGeBufferState.isLocked = TRUE;
    if (gGeBufferState.useFastDma) {
        MI_SendGXCommandAsyncFast(GXi_DmaId, pDL, size, simpleUnlock_, (void *)&gGeBufferStateIsLocked);
    } else {
        MI_SendGXCommandAsync(GXi_DmaId, pDL, size, simpleUnlock_, (void *)&gGeBufferStateIsLocked);
    }
}

// queues a geometry command while a display list is being sent, otherwise sends it directly
void NNS_G3dGeBufferOP_N(u32 op, const u32 *args, u32 num) {
    if (gGeBufferState.pBuffer) {
        if (gGeBufferState.isLocked && gGeBufferState.pBuffer[0] + 1 + num <= G3D_GE_BUFFER_WORDS) {
            u32 pos = gGeBufferState.pBuffer[0]++;
            gGeBufferState.pBuffer[pos + 1] = op;
            if (num) {
                MIi_CpuCopyFast(args, gGeBufferState.pBuffer + 1 + gGeBufferState.pBuffer[0], num * sizeof(u32));
                gGeBufferState.pBuffer[0] += num;
            }
            return;
        }
        if (gGeBufferState.pBuffer[0]) {
            NNS_G3dGeFlushBuffer();
        } else if (gGeBufferState.isLocked) {
            NNS_G3dGeWaitSendDL();
        }
    } else if (gGeBufferState.isLocked) {
        NNS_G3dGeWaitSendDL();
    }
    reg_G3X_GXFIFO = op;
    MIi_CpuSend32(args, &reg_G3X_GXFIFO, num * sizeof(u32));
}

// reads the current position (pPos) and direction (pDir) matrices
void NNS_G3dGetCurrentMtx(MtxFx43 *pPos, MtxFx33 *pDir) {
    MtxFx44 clip;
    NNS_G3dGeFlushBuffer();
    // clip matrix with an identity projection = position matrix
    reg_G3_MTX_MODE = GX_MTXMODE_PROJECTION;
    reg_G3_MTX_PUSH = 0;
    reg_G3_MTX_IDENTITY = 0;
    if (pPos) {
        while (G3X_GetClipMtx(&clip)) {
        }
        MTX_Copy44To43_(&clip, pPos);
    }
    if (pDir) {
        while (G3X_GetVectorMtx(pDir)) {
        }
    }
    reg_G3_MTX_POP = 1;
    reg_G3_MTX_MODE = GX_MTXMODE_POSITION_VECTOR;
}
