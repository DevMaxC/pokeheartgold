#pragma force_active on
#include "global.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>
#pragma force_active on
void CARDi_SetRomOp(u32, u32);
int CARDi_ReadFromCache(CARDRomStat *);

void CARDi_ReadCard(CARDRomStat *card) {
    CARDiCommon *common = &cardi_common;
    for (;;) {
        u32 address = common->src & ~511U;
        u32 *destination;
        u32 status, index, bytes;
        if (address == common->src && !((u32)common->dst & 3) && common->len >= 512) {
            destination = (u32 *)common->dst;
        } else {
            card->cache_page = (u8 *)address;
            destination = (u32 *)card->cache_buf;
        }
        CARDi_SetRomOp((address >> 8) | 0xb7000000, address << 24);
        index = 0;
        bytes = index;
        reg_MI_MCCNT1 = card->ctrl;
        do {
            status = reg_MI_MCCNT1;
            if (status & REG_MI_MCCNT1_RDY_MASK) {
                u32 data = reg_MI_MCD1;
                if (bytes < 512) {
                    destination[index] = data;
                    bytes += 4;
                    index++;
                }
            }
        } while (status & REG_MI_MCCNT1_START_MASK);
        if ((u32)destination == common->dst) {
            cardi_common.src += 512;
            cardi_common.dst += 512;
            cardi_common.len -= 512;
            if (!cardi_common.len) {
                break;
            }
        } else if (!CARDi_ReadFromCache(card)) {
            return;
        }
    }
}
