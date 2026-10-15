#include <nitro.h>

// The code below is compiled as ARM (32-bit) code.
#include <nitro/card/card_spi_wait_internal.h>
#include <nitro/code32.h>

// Card SPI waits: initial wait settings and the lock id.

// Only the head of CardSpiWait: with the full type in this function's TU, MWCC loads gCardSpiLockId before
// the stores to gCardSpiWait (the original code was compiled with this smaller view).
typedef struct CardSpiWaitHead {
    u8 dummyWait;
    u8 writeWait;
    u8 readWait;
    u8 unk_03;
    u32 active;
} CardSpiWaitHead;

extern CardSpiWaitHead gCardSpiWait;

#pragma force_active on

void CARD_SpiWaitInit(void) {
    gCardSpiWait.dummyWait = gCardSpiWait.writeWait = gCardSpiWait.readWait = 50;
    gCardSpiWait.active = 1;
    if (gCardSpiLockId == 0xFFFD) {
        gCardSpiLockId = OS_GetLockID();
    }
}
