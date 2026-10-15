#include <nitro.h>
#include <nitro/code32.h>
#include <nitro/section.h>

#define MIi_GX_LENGTH_ONCE     (118 * sizeof(u32))
#define MI_CNT_SEND32(size)    (0x84400000 | ((size) / 4))
#define MI_CNT_SEND32_IF(size) (0xc4400000 | ((size) / 4))
#define MI_CNT_GXCOPY_IF(size) (0xfc400000 | ((size) / 4))
#define OS_IE_GXFIFO           0x200000

typedef enum {
    GX_FIFOINTR_COND_DISABLE = 0,
    GX_FIFOINTR_COND_UNDERHALF = 1,
    GX_FIFOINTR_COND_EMPTY = 2
} GXFifoIntrCond;

typedef enum {
    GX_FIFOSTAT_EMPTY = 6,
    GX_FIFOSTAT_UNDERHALF = 2,
    GX_FIFOSTAT_OVERHALF = 0,
    GX_FIFOSTAT_FULL = 1
} GXFifoStat;

typedef struct {
    volatile BOOL isBusy;
    u32 dmaNo;
    u32 src;
    u32 length;
    MIDmaCallback callback;
    void *arg;
    GXFifoIntrCond fifoCond;
    void (*fifoFunc)(void);
} MIiGXDmaParams;

static inline void G3X_SetFifoIntrCond(GXFifoIntrCond cond) {
    reg_G3X_GXSTAT = (reg_G3X_GXSTAT & ~REG_G3X_GXSTAT_FI_MASK) | (cond << REG_G3X_GXSTAT_FI_SHIFT);
}

static inline GXFifoStat G3X_GetCommandFifoStatus(void) {
    return (GXFifoStat)((reg_G3X_GXSTAT & 0x07000000) >> 24);
}

static MIiGXDmaParams MIi_GXDmaParams = { FALSE };

static void MIi_FIFOCallback(void);
static void MIi_DMACallback(void *arg);
static void MIi_DMAFastCallback(void *arg);

#pragma section ITCM begin
void MI_SendGXCommand(u32 dmaNo, const void *src, u32 commandLength) {
    vu32 *dmaCntp;
    u32 leftLength = commandLength;
    u32 currentSrc = (u32)src;
    if (!leftLength) {
        return;
    }

    MIi_CheckDma0SourceAddress(dmaNo, (u32)src, commandLength, MI_DMA_SRC_INC);

    MIi_WAIT_BEFOREDMA(dmaCntp, dmaNo);

    while (leftLength > 0) {
        u32 length = (leftLength > MIi_GX_LENGTH_ONCE) ? MIi_GX_LENGTH_ONCE : leftLength;
        MIi_DmaSetParams(dmaNo, currentSrc, (u32)REG_GXFIFO_ADDR, MI_CNT_SEND32(length));
        leftLength -= length;
        currentSrc += length;
    }

    do {
        while (*dmaCntp & 0x80000000) {}
    } while (0);
}
#pragma section ITCM end

void MI_SendGXCommandAsync(u32 dmaNo, const void *src, u32 commandLength, MIDmaCallback callback, void *arg) {
    if (!commandLength) {
        MIi_CallCallback(callback, arg);
        return;
    }

    while (MIi_GXDmaParams.isBusy) {}

    while (!(G3X_GetCommandFifoStatus() & GX_FIFOSTAT_UNDERHALF)) {}

    MIi_GXDmaParams.isBusy = TRUE;
    MIi_GXDmaParams.dmaNo = dmaNo;
    MIi_GXDmaParams.src = (u32)src;
    MIi_GXDmaParams.length = commandLength;
    MIi_GXDmaParams.callback = callback;
    MIi_GXDmaParams.arg = arg;

    MIi_CheckDma0SourceAddress(dmaNo, (u32)src, commandLength, MI_DMA_SRC_INC);

    MI_WaitDma(dmaNo);
    {
        OSIntrMode lastIntrMode = OS_DisableInterrupts();

        MIi_GXDmaParams.fifoCond = (GXFifoIntrCond)((reg_G3X_GXSTAT & REG_G3X_GXSTAT_FI_MASK) >> REG_G3X_GXSTAT_FI_SHIFT);
        MIi_GXDmaParams.fifoFunc = OS_GetIrqFunction(OS_IE_GXFIFO);

        G3X_SetFifoIntrCond(GX_FIFOINTR_COND_UNDERHALF);
        OS_SetIrqFunction(OS_IE_GXFIFO, MIi_FIFOCallback);
        (void)OS_EnableIrqMask(OS_IE_GXFIFO);

        MIi_FIFOCallback();

        (void)OS_RestoreInterrupts(lastIntrMode);
    }
}

static void MIi_FIFOCallback(void) {
    if (!MIi_GXDmaParams.length) {
        return;
    }

    u32 length = (MIi_GXDmaParams.length >= MIi_GX_LENGTH_ONCE) ? MIi_GX_LENGTH_ONCE : MIi_GXDmaParams.length;
    u32 src = MIi_GXDmaParams.src;

    MIi_GXDmaParams.length -= length;
    MIi_GXDmaParams.src += length;

    if (!MIi_GXDmaParams.length) {
        OSi_EnterDmaCallback(MIi_GXDmaParams.dmaNo, MIi_DMACallback, NULL);
        MIi_DmaSetParams(MIi_GXDmaParams.dmaNo, src, (u32)REG_GXFIFO_ADDR, MI_CNT_SEND32_IF(length));
        (void)OS_ResetRequestIrqMask(OS_IE_GXFIFO);
    } else {
        MIi_DmaSetParams(MIi_GXDmaParams.dmaNo, src, (u32)REG_GXFIFO_ADDR, MI_CNT_SEND32(length));
        (void)OS_ResetRequestIrqMask(OS_IE_GXFIFO);
    }
}

static void MIi_DMACallback(void *arg) {
#pragma unused(arg)
    (void)OS_DisableIrqMask(OS_IE_GXFIFO);

    G3X_SetFifoIntrCond(MIi_GXDmaParams.fifoCond);
    OS_SetIrqFunction(OS_IE_GXFIFO, MIi_GXDmaParams.fifoFunc);

    MIi_GXDmaParams.isBusy = FALSE;

    MIi_CallCallback(MIi_GXDmaParams.callback, MIi_GXDmaParams.arg);
}

void MI_SendGXCommandAsyncFast(u32 dmaNo, const void *src, u32 commandLength, MIDmaCallback callback, void *arg) {
    if (!commandLength) {
        MIi_CallCallback(callback, arg);
        return;
    }

    while (MIi_GXDmaParams.isBusy) {}

    MIi_GXDmaParams.isBusy = TRUE;
    MIi_GXDmaParams.dmaNo = dmaNo;
    MIi_GXDmaParams.callback = callback;
    MIi_GXDmaParams.arg = arg;

    MIi_CheckAnotherAutoDMA(dmaNo, 0x38000000);

    MIi_CheckDma0SourceAddress(dmaNo, (u32)src, commandLength, MI_DMA_SRC_INC);

    MI_WaitDma(dmaNo);

    OSi_EnterDmaCallback(dmaNo, MIi_DMAFastCallback, NULL);
    MIi_DmaSetParams(dmaNo, (u32)src, (u32)REG_GXFIFO_ADDR, MI_CNT_GXCOPY_IF(commandLength));
}

static void MIi_DMAFastCallback(void *arg) {
#pragma unused(arg)
    MIi_GXDmaParams.isBusy = FALSE;

    MIi_CallCallback(MIi_GXDmaParams.callback, MIi_GXDmaParams.arg);
}
