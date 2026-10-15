#include "nitro/types.h"
#include "CARD_pullOut.h"
#include "CARD_rom.h"
#include "MI_dma_card.h"
#include "MI_memory.h"
#include "OS_cache.h"
#include "OS_interrupt.h"
#include "code32.h"

extern u32 cardi_rom_base;
u32 cardi_rom_base;
u32 cardi_rom_header_addr = HW_ROM_HEADER_BUF;

CARDRomStat rom_stat ALIGN(32);

BOOL CARDi_ReadFromCache(CARDRomStat *p);
void CARDi_SetRomOp(u32 cmd1, u32 cmd2);
void CARDi_SetCardDma(void);
void CARDi_OnReadCard(void);
void CARDi_ReadRomSyncCore(CARDiCommon *c);

static inline BOOL CARDi_OnReadPageDirect(CARDRomStat *arg)
{
#pragma unused(arg)
    CARDiCommon *p = &cardi_common;
    p->src += CARD_ROM_PAGE_SIZE;
    p->dst += CARD_ROM_PAGE_SIZE;
    p->len -= CARD_ROM_PAGE_SIZE;
    return (p->len > 0);
}

BOOL CARDi_ReadFromCache(CARDRomStat *p)
{
    CARDiCommon *c = &cardi_common;
    const u32 cur_page = CARD_ALIGN_HI_BIT(c->src);
    if (cur_page == (u32)p->cache_page)
    {
        const u32 mod = c->src - cur_page;
        u32 len = CARD_ROM_PAGE_SIZE - mod;
        if (len > c->len)
        {
            len = c->len;
        }
        MI_CpuCopy8(p->cache_buf + mod, (void *)c->dst, len);
        c->src += len;
        c->dst += len;
        c->len -= len;
    }
    return (c->len > 0);
}

void CARDi_SetRomOp(u32 cmd1, u32 cmd2)
{
    while ((reg_CARD_CNT & CARD_START) != 0) {}

    reg_CARD_MASTERCNT = CARDMST_SEL_ROM | CARDMST_ENABLE | CARDMST_IF_ENABLE;
    {
        vu8 *p_cmd = &reg_CARD_CMD;
        p_cmd[0] = (u8)(cmd1 >> (8 * 3));
        p_cmd[1] = (u8)(cmd1 >> (8 * 2));
        p_cmd[2] = (u8)(cmd1 >> (8 * 1));
        p_cmd[3] = (u8)(cmd1 >> (8 * 0));
        p_cmd[4] = (u8)(cmd2 >> (8 * 3));
        p_cmd[5] = (u8)(cmd2 >> (8 * 2));
        p_cmd[6] = (u8)(cmd2 >> (8 * 1));
        p_cmd[7] = (u8)(cmd2 >> (8 * 0));
    }
}

static inline void CARDi_SetRomOpReadPage1(u32 src)
{
    CARDi_SetRomOp((u32)(MROMOP_G_READ_PAGE | (src >> 8)), (u32)(src << 24));
}

void CARDi_SetCardDma(void)
{
    CARDiCommon *const c = &cardi_common;
    CARDRomStat *const p = &rom_stat;
    MIi_CardDmaCopy32(c->dma, (const void *)&reg_CARD_DATA, (void *)c->dst, CARD_ROM_PAGE_SIZE);
    CARDi_SetRomOpReadPage1(c->src);
    reg_CARD_CNT = p->ctrl;
}

void CARDi_OnReadCard(void)
{
    CARDRomStat *const p = &rom_stat;
    CARDiCommon *const c = &cardi_common;
    MI_StopDma(c->dma);
    if (!CARDi_OnReadPageDirect(p))
    {
        (void)OS_DisableIrqMask(OS_IE_CARD_DATA);
        (void)OS_ResetRequestIrqMask(OS_IE_CARD_DATA);
        CARDi_ReadEnd();
    }
    else
    {
        CARDi_SetCardDma();
    }
}

/* unmatched CARDi_TryReadCardDma remains in assembly */


/* unmatched CARDi_ReadCard remains in assembly */


u32 CARDi_ReadRomIDCore(void)
{
    CARDi_SetRomOp(MROMOP_G_READ_ID, 0);
    reg_CARD_CNT = (u32)(CARDi_GetRomFlag(CARD_COMMAND_ID) & ~CARD_LATENCY1_MASK);
    while (!(reg_CARD_CNT & CARD_DATA_READY)) {}
    return reg_CARD_DATA;
}

void CARDi_ReadRomSyncCore(CARDiCommon *c)
{
#pragma unused(c)
    CARDRomStat *const p = &rom_stat;

    if (CARDi_ReadFromCache(p))
    {
        (*p->read_func) (p);
    }
    CARDi_ReadEnd();
}

void CARDi_ReadRom(u32 dma, const void *src, void *dst, u32 len, MIDmaCallback callback, void *arg, BOOL is_async)
{
    CARDRomStat *const p = &rom_stat;
    CARDiCommon *const c = &cardi_common;

    CARD_CheckEnabled();

    CARDi_WaitTask(c, callback, arg);

    c->dma = dma;
    c->src = (u32)((u32)src + cardi_rom_base);
    c->dst = (u32)dst;
    c->len = (u32)len;
    if (dma <= MI_DMA_MAX_NUM)
    {
        MI_StopDma(dma);
    }

    if (CARDi_TryReadCardDma(p))
    {
        if (!is_async)
        {
            CARD_WaitRomAsync();
        }
    }
    else if (is_async)
    {
        CARDi_SetTask(CARDi_ReadRomSyncCore);
    }
    else
    {
        c->cur_th = OS_GetCurrentThread();
        CARDi_ReadRomSyncCore(c);
    }
}

void CARD_Init(void)
{
    CARDiCommon *const p = &cardi_common;

    if (!p->flag)
    {
        p->flag = CARD_STAT_INIT;
        p->src = p->dst = p->len = 0;
        p->dma = (u32)~0;
        p->callback = NULL;
        p->callback_arg = NULL;

        cardi_rom_base = 0;

        CARDi_InitCommon();

        rom_stat.read_func = CARDi_GetRomAccessor();

        CARD_InitPulledOutCallback();
    }
}

void CARD_WaitRomAsync(void)
{
    (void)CARDi_WaitAsync();
}

void (*CARDi_GetRomAccessor(void)) (CARDRomStat *)
{
    return CARDi_ReadCard;
}
