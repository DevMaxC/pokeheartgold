#include <nitro/code32.h>
#include <nitro/mi/dma.h>
#include <nitro/types.h>

void MI_HBlankDmaCopy32(u32 dmaNo, const void *src, void *dest, u32 size);
void MI_HBlankDmaCopy16(u32 dmaNo, const void *src, void *dest, u32 size);

void MI_HBlankDmaCopy32(u32 dmaNo, const void *src, void *dest, u32 size) {
    MIi_CheckAnotherAutoDMA(dmaNo, MI_DMA_TIMING_H_BLANK);
    MIi_CheckDma0SourceAddress(dmaNo, (u32)src, size, MI_DMA_SRC_INC);
    if (size == 0) {
        return;
    }
    MI_WaitDma(dmaNo);
    MIi_DmaSetParams(dmaNo, (u32)src, (u32)dest, 0x96600000 | (size / 4));
}

void MI_HBlankDmaCopy16(u32 dmaNo, const void *src, void *dest, u32 size) {
    MIi_CheckAnotherAutoDMA(dmaNo, MI_DMA_TIMING_H_BLANK);
    MIi_CheckDma0SourceAddress(dmaNo, (u32)src, size, MI_DMA_SRC_INC);
    if (size == 0) {
        return;
    }
    MI_WaitDma(dmaNo);
    MIi_DmaSetParams(dmaNo, (u32)src, (u32)dest, 0x92600000 | (size / 2));
}
