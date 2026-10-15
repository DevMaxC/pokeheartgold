#include <nitro.h>

extern void SDK_IRQ_STACKSIZE(void);

#define OSi_HW_DTCM                 SDK_AUTOLOAD_DTCM_START
#define RESET_HW_DTCM_IRQ_STACK_END SDK_AUTOLOAD_DTCM_START + 0x00003fc0 - HW_SVC_STACK_SIZE

#ifdef SDK_ARM9
static vu16 OSi_IsResetOccurred = FALSE;
static u16 OSi_IsInitReset = FALSE;
#else
static u16 OSi_IsInitReset = FALSE;
static vu16 OSi_IsResetOccurred = FALSE;
#endif

u32 OSi_CpuClear32(u32 value, void *ptr, u32 size);
void OSi_ReadCardRom32(u32 src, void *dst, int len);

void OSi_DoResetSystem(void);
void OSi_ReloadRomData(void);
void OSi_DoBoot(void);

void OS_InitReset(void) {
    if (OSi_IsInitReset) {
        return;
    }
    OSi_IsInitReset = TRUE;
#ifdef SDK_ARM9
    PXI_Init();
    while (!PXI_IsCallbackReady(PXI_FIFO_TAG_OS, PXI_PROC_ARM7)) {}
#endif // SDK_ARM9
    PXI_SetFifoRecvCallback(PXI_FIFO_TAG_OS, OSi_CommonCallback);
}

BOOL OS_IsResetOccurred(void) {
    return OSi_IsResetOccurred;
}

void OSi_CommonCallback(PXIFifoTag tag, u32 data, BOOL err) {
#pragma unused(tag)
#pragma unused(err)
    u16 command;
    u16 commandArg;

    command = (u16)((data & OS_PXI_COMMAND_MASK) >> OS_PXI_COMMAND_SHIFT);
    commandArg = (u16)((data & OS_PXI_DATA_MASK) >> OS_PXI_DATA_SHIFT);
    if (command == OS_PXI_COMMAND_RESET) {
        OSi_IsResetOccurred = TRUE;
    } else {
        OS_Panic("");
    }
}

void OSi_SendToPxi(u16 data) {
    u32 pxi_send_data;

    pxi_send_data = (u32)(data) << OS_PXI_COMMAND_SHIFT;
    while (PXI_SendWordByFifo(PXI_FIFO_TAG_OS, pxi_send_data, FALSE) != PXI_FIFO_SUCCESS) {}
}

#ifdef SDK_ARM9

#include <nitro/itcm_begin.h>

void OSi_DoResetSystem(void) {
    while (!OSi_IsResetOccurred) {}
    reg_OS_IME = 0;
    OSi_ReloadRomData();
    OSi_DoBoot(); // noreturn
}

void OSi_ReloadRomData(void) {
    u32 p = (u32)HW_ROM_HEADER_BUF;
    const u32 rom_base = *(u32 *)HW_ROM_BASE_OFFSET_BUF;
    if (rom_base >= 0x8000) {
        OSi_ReadCardRom32(rom_base, (void *)p, 0x160);
    }
    u32 src_arm9 = *(u32 *)(p + 0x20);
    u32 dst_arm9 = *(u32 *)(p + 0x28);
    u32 len_arm9 = *(u32 *)(p + 0x2C);
    u32 src_arm7 = *(u32 *)(p + 0x30);
    u32 dst_arm7 = *(u32 *)(p + 0x38);
    u32 len_arm7 = *(u32 *)(p + 0x3C);
    OSIntrMode bak_cpsr = OS_DisableInterrupts();
    DC_StoreAll();
    DC_InvalidateAll();
    OS_RestoreInterrupts(bak_cpsr);
    IC_InvalidateAll();
    DC_WaitWriteBufferEmpty();
    src_arm9 += rom_base;
    src_arm7 += rom_base;
    if (src_arm9 < 0x8000) {
        u32 diff = 0x8000 - src_arm9;
        src_arm9 = 0x8000;
        dst_arm9 += diff;
        len_arm9 -= diff;
    }
    OSi_ReadCardRom32(src_arm9, (void *)dst_arm9, len_arm9);
    OSi_ReadCardRom32(src_arm7, (void *)dst_arm7, len_arm7);
}

#undef reg_CARD_MASTERCNT
#undef reg_CARD_CMD
#undef reg_CARD_CNT
#undef reg_CARD_DATA

void OSi_ReadCardRom32(u32 src, void *dst, int len) {
    vu8 *reg_CARD_MASTERCNT = (vu8 *)(HW_REG_BASE + 0x1a1);
    vu8 *reg_CARD_CMD = (vu8 *)(HW_REG_BASE + 0x1a8);
    vu32 *reg_CARD_CNT = (vu32 *)(HW_REG_BASE + 0x1a4);
    vu32 *reg_CARD_DATA = (vu32 *)(HW_REG_BASE + 0x100010);
    vu32 *hdr_GAME_BUF = (vu32 *)(HW_ROM_HEADER_BUF + 0x60);

    enum {
        CARD_MASTER_SELECT_ROM = 0x00,
        CARD_MASTER_ENABLE = 0x80,
        CARD_CMD_READ_PAGE = 0xb7,
        CARD_CTRL_CMD_MASK = 0x07000000,
        CARD_CTRL_CMD_PAGE = 0x01000000,
        CARD_CTRL_READ = 0x00000000,
        CARD_CTRL_RESET_HI = 0x20000000,
        CARD_CTRL_START = 0x80000000,
        CARD_CTRL_READY = 0x00800000,
        CARD_ENUM_END
    };

    const u32 ctrl_start = ((*hdr_GAME_BUF & ~CARD_CTRL_CMD_MASK) | (CARD_CTRL_CMD_PAGE | CARD_CTRL_READ | CARD_CTRL_START | CARD_CTRL_RESET_HI));
    int pos = -(src & 0x1FF);
    while ((*reg_CARD_CNT & CARD_CTRL_START) != 0) {}
    *reg_CARD_MASTERCNT = (u32)(CARD_MASTER_SELECT_ROM | CARD_MASTER_ENABLE);
    for (src += pos; pos < len; src += 512) {
        //---- setting for command of one page reading
        reg_CARD_CMD[0] = CARD_CMD_READ_PAGE;
        reg_CARD_CMD[1] = src >> 24;
        reg_CARD_CMD[2] = src >> 16;
        reg_CARD_CMD[3] = src >> 8;
        reg_CARD_CMD[4] = src >> 0;
        reg_CARD_CMD[5] = 0;
        reg_CARD_CMD[6] = 0;
        reg_CARD_CMD[7] = 0;
        *reg_CARD_CNT = ctrl_start;
        for (;;) {
            u32 ctrl = *reg_CARD_CNT;
            if ((ctrl & CARD_CTRL_READY) != 0) {
                const u32 data = *reg_CARD_DATA;
                if ((pos >= 0) && (pos < len)) {
                    *(u32 *)(dst + pos) = data;
                }
                pos += sizeof(u32);
            }
            if (!(ctrl & CARD_CTRL_START)) {
                break;
            }
        }
    }
}

#include <nitro/itcm_end.h>

#endif
