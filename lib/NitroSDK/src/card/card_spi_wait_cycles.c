#include <nitro.h>

// The code below is compiled as ARM (32-bit) code.
#include <nitro/card/card_spi_wait_internal.h>
#include <nitro/code32.h>

// Card SPI waits: the wait settings and the wait between a transfer's command and its data.

extern CardSpiWait gCardSpiWait;

#pragma force_active on

void CARD_SetSpiReadWaitCycles(u32 cycles) {
    gCardSpiWait.readWait = cycles;
}

void CARD_SetSpiWriteWaitCycles(u32 cycles) {
    gCardSpiWait.writeWait = cycles;
}

void CARDi_SpiDummyWait(void) {
    u64 start = OS_GetTick();

    while (CARD_SPI_TICKS_TO_US(OS_GetTick() - start) < gCardSpiWait.dummyWait) {}
}
