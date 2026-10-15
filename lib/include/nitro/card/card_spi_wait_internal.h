#ifndef NITRO_CARD_CARD_SPI_WAIT_INTERNAL_H
#define NITRO_CARD_CARD_SPI_WAIT_INTERNAL_H

// Byte-wise transfers on the card SPI bus with a wait (in microseconds) before every byte.
// lib/NitroSDK/src/card/card_spi_wait*.c. The modules declare gCardSpiWait themselves (see
// card_spi_wait_init.c).

// Current transfer: the next byte to send and where to store the next received byte.
typedef struct CardSpiTransfer {
    u32 active;
    const u8 *input; // 0x04
    u8 *output;      // 0x08
    u32 unk_0C;
} CardSpiTransfer;

typedef struct CardSpiWait {
    u8 dummyWait; // wait of CARDi_SpiDummyWait
    u8 writeWait;
    u8 readWait;
    u8 unk_03;
    u32 active;      // 0x04: from here the same layout as CardSpiTransfer (gCardSpiTransfer)
    const u8 *input; // 0x08
    u8 *output;      // 0x0C
    u32 unk_10;
} CardSpiWait;

#define CARD_SPI_TICKS_TO_US(ticks) ((ticks) * 64000 / 33514)
#define CARD_SPI_BUSY               0x80
#define CARD_SPI_SELECT             0xA042 // enable, hold chip select
#define CARD_SPI_LAST_BYTE          0xA002 // enable, release chip select after the byte
#define CARD_SPI_COMMAND_READ       1
#define CARD_SPI_COMMAND_WRITE      2
#define CARD_SPI_COMMAND_STATUS     8
#define CARD_SPI_READ_MAX           185

extern CardSpiTransfer gCardSpiTransfer; // label of gCardSpiWait.active (transfer fields)
extern u8 gCardSpiCommand[];             // command byte of reads and status requests
extern u8 gCardSpiWriteCommand[];        // command byte of writes
extern u16 gCardSpiLockId;               // 0xFFFD until CARD_SpiWaitInit

void CARD_SetSpiReadWaitCycles(u32 cycles);
void CARD_SetSpiWriteWaitCycles(u32 cycles);
void CARDi_SpiDummyWait(void);
void CARD_SpiWaitInit(void);
u8 CARDi_SpiWaitWriteByte(CardSpiTransfer *transfer);
void CARDi_SpiWaitReadByte(CardSpiTransfer *transfer);
int CARD_SpiWaitReadRange(u8 *buffer);
void CARD_SpiWaitWriteRange(const void *data, int size);
int CARD_SpiWaitGetStatus(void);

#endif // NITRO_CARD_CARD_SPI_WAIT_INTERNAL_H
