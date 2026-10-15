#ifndef CLEAN_SOURCE_R1_GX_LOAD2D_PRIVATE_H
#define CLEAN_SOURCE_R1_GX_LOAD2D_PRIVATE_H
#include <nitro/types.h>
#include <nitro/mi/dma.h>
#include <nitro/mi/memory.h>
#include <nitro/gx/gx_bgcnt.h>
#include <nitro/gx/gx_load.h>
#include <nitro/gx/gx_vramcnt.h>

extern u32 GXi_DmaId;
#define GX_DMA_NOT_USE ((u32)-1)
#define GX_CPU_FASTER32_SIZE 0x30
#define GX_CPU_FASTER16_SIZE 0x1C
static inline void GXi_DmaCopy32(u32 dmaNo, const void *src, void *dest, u32 size) {
    if (dmaNo != GX_DMA_NOT_USE && size > GX_CPU_FASTER32_SIZE) MI_DmaCopy32(dmaNo, src, dest, size);
    else MIi_CpuCopy32(src, dest, size);
}
static inline void GXi_DmaCopy16(u32 dmaNo, const void *src, void *dest, u32 size) {
    if (dmaNo != GX_DMA_NOT_USE && size > GX_CPU_FASTER16_SIZE) MI_DmaCopy16(dmaNo, src, dest, size);
    else MIi_CpuCopy16(src, dest, size);
}
static inline void GXi_DmaCopy32Async(u32 dmaNo, const void *src, void *dest, u32 size, MIDmaCallback callback, void *arg) {
    if (dmaNo != GX_DMA_NOT_USE) MI_DmaCopy32Async(dmaNo, src, dest, size, callback, arg);
    else MIi_CpuCopy32(src, dest, size);
}
static inline void GXi_WaitDma(u32 dmaNo) {
    if (dmaNo != GX_DMA_NOT_USE) MI_WaitDma(dmaNo);
}
#endif
