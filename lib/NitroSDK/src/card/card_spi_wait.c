#include <nitro.h>

// The code below is compiled as ARM (32-bit) code.
#include <nitro/card/card_spi_wait_internal.h>
#include <nitro/code32.h>

// Card SPI transfers with a wait before every byte: read a length-prefixed block, write a block, read the
// status register.

extern CardSpiWait gCardSpiWait;

#pragma force_active on

u8 CARDi_SpiWaitWriteByte(CardSpiTransfer *transfer) {
    u64 start = OS_GetTick();
    volatile u16 read;

    while (CARD_SPI_TICKS_TO_US(OS_GetTick() - start) < gCardSpiWait.writeWait) {}
    reg_MI_MCD0 = *transfer->input;
    transfer->input++;
    while (reg_MI_MCCNT0 & CARD_SPI_BUSY) {}
    read = reg_MI_MCD0;
    return read & REG_MI_MCD0_DATA_MASK;
}

void CARDi_SpiWaitReadByte(CardSpiTransfer *transfer) {
    u64 start = OS_GetTick();

    while (CARD_SPI_TICKS_TO_US(OS_GetTick() - start) < gCardSpiWait.readWait) {}
    reg_MI_MCD0 = 0;
    while (reg_MI_MCCNT0 & CARD_SPI_BUSY) {}
    *transfer->output = reg_MI_MCD0;
    transfer->output++;
}

static inline void CardSpiSetTransfer(const u8 *input, u8 *output) {
    gCardSpiWait.input = input;
    gCardSpiWait.output = output;
}

#pragma push
#pragma optimization_level 2

// Reads a block whose first byte is its length (bytes are stored XOR 0xAA); returns the length.
int CARD_SpiWaitReadRange(u8 *buffer) {
    int size;
    int i;

    CardSpiSetTransfer(gCardSpiCommand, buffer);
    gCardSpiCommand[0] = CARD_SPI_COMMAND_READ;
    buffer[0] = 0;
    CARD_LockBackup(gCardSpiLockId);
    OS_LockCard(gCardSpiLockId);
    while (reg_MI_MCCNT0 & CARD_SPI_BUSY) {}
    reg_MI_MCCNT0 = CARD_SPI_SELECT;
    CARDi_SpiWaitWriteByte(&gCardSpiTransfer);
    CARDi_SpiDummyWait();
    CARDi_SpiWaitReadByte(&gCardSpiTransfer);
    CARDi_SpiDummyWait();
    size = buffer[0];
    if ((u32)size > CARD_SPI_READ_MAX) {
        size = 0;
    }
    CardSpiSetTransfer(NULL, buffer);
    i = 0;
    buffer[0] = 0;
    if (size != 0) {
        for (; i < size; i++) {
            if (i == size - 1) {
                reg_MI_MCCNT0 = CARD_SPI_LAST_BYTE;
            }
            CARDi_SpiWaitReadByte(&gCardSpiTransfer);
        }
    } else {
        reg_MI_MCCNT0 = CARD_SPI_LAST_BYTE;
        CARDi_SpiWaitReadByte(&gCardSpiTransfer);
    }
    for (i = 0; i < size; i++) {
        buffer[i] ^= 0xAA;
    }
    while (reg_MI_MCCNT0 & CARD_SPI_BUSY) {}
    OS_UnLockCard(gCardSpiLockId);
    CARD_UnlockBackup(gCardSpiLockId);
    return size;
}

#pragma pop

#pragma push
#pragma opt_rotateloops off

void CARD_SpiWaitWriteRange(const void *data, int size) {
    int i;

    gCardSpiWait.input = gCardSpiWriteCommand;
    gCardSpiWait.output = NULL;
    gCardSpiWriteCommand[0] = CARD_SPI_COMMAND_WRITE;
    CARD_LockBackup(gCardSpiLockId);
    OS_LockCard(gCardSpiLockId);
    while (reg_MI_MCCNT0 & CARD_SPI_BUSY) {}
    reg_MI_MCCNT0 = CARD_SPI_SELECT;
    CARDi_SpiWaitWriteByte(&gCardSpiTransfer);
    CARDi_SpiDummyWait();
    gCardSpiWait.input = data;
    for (i = 0; i < size; i++) {
        if (i == size - 1) {
            reg_MI_MCCNT0 = CARD_SPI_LAST_BYTE;
        }
        CARDi_SpiWaitWriteByte(&gCardSpiTransfer);
    }
    while (reg_MI_MCCNT0 & CARD_SPI_BUSY) {}
    OS_UnLockCard(gCardSpiLockId);
    CARD_UnlockBackup(gCardSpiLockId);
}

#pragma pop

#pragma push
#pragma opt_arithtransformation off

int CARD_SpiWaitGetStatus(void) {
    u8 status;
    u64 start;
    u64 elapsed;

    gCardSpiWait.input = gCardSpiCommand;
    gCardSpiWait.output = &status;
    gCardSpiCommand[0] = CARD_SPI_COMMAND_STATUS;
    CARD_LockBackup(gCardSpiLockId);
    (void)OS_LockCard(gCardSpiLockId);
    start = OS_GetTick();
    do {
        elapsed = (OS_GetTick() - start) * 64;
    } while (elapsed * 1000 / 33514 < 60);
    while (reg_MI_MCCNT0 & CARD_SPI_BUSY) {}
    reg_MI_MCCNT0 = CARD_SPI_SELECT;
    status = CARDi_SpiWaitWriteByte(&gCardSpiTransfer);
    start = OS_GetTick();
    do {
        elapsed = (OS_GetTick() - start) * 64;
    } while (elapsed * 1000 / 33514 < 50);
    reg_MI_MCCNT0 = CARD_SPI_LAST_BYTE;
    CARDi_SpiWaitReadByte(&gCardSpiTransfer);
    while (reg_MI_MCCNT0 & CARD_SPI_BUSY) {}
    (void)OS_UnLockCard(gCardSpiLockId);
    CARD_UnlockBackup(gCardSpiLockId);
    return status;
}

#pragma pop
