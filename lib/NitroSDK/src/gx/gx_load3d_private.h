#ifndef SDK08_GX_LOAD3D_PRIVATE_H
#define SDK08_GX_LOAD3D_PRIVATE_H
#include <nitro.h>
void GX_BeginLoadTex(void);
void GX_LoadTex(void *src, u32 offset, u32 size);
void GX_EndLoadTex(void);
void GX_BeginLoadTexPltt(void);
void GX_LoadTexPltt(void *src, u32 offset, u32 size);
void GX_EndLoadTexPltt(void);
void GX_BeginLoadClearImage(void);
void GX_LoadClearImageColor(void *src, u32 size);
void GX_LoadClearImageDepth(void *src, u32 size);
void GX_EndLoadClearImage(void);
#define GX_DMA_NOT_USE ((u32)-1)
#define GX_CPU_FASTER32_SIZE 0x30
extern u32 GXi_DmaId;
static inline void GXi_DmaCopy32(u32 dmaNo, const void *src, void *dest, u32 size) {
    if (dmaNo != GX_DMA_NOT_USE && size > GX_CPU_FASTER32_SIZE) MI_DmaCopy32(dmaNo, src, dest, size);
    else MIi_CpuCopy32((const u32 *)src, (u32 *)dest, size);
}
static inline void GXi_DmaCopy32Async(u32 dmaNo, const void *src, void *dest, u32 size, MIDmaCallback callback, void *arg) {
    if (dmaNo != GX_DMA_NOT_USE) MI_DmaCopy32Async(dmaNo, src, dest, size, callback, arg);
    else MIi_CpuCopy32((const u32 *)src, (u32 *)dest, size);
}
static inline void GXi_WaitDma(u32 dmaNo) { if (dmaNo != GX_DMA_NOT_USE) MI_WaitDma(dmaNo); }
#endif
