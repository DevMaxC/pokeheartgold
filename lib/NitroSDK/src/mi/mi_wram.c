#include <nitro.h>
#include <nitro/code32.h>

typedef enum {
    MI_WRAM_ARM9_ALL = 0,
    MI_WRAM_1616_1 = 1,
    MI_WRAM_1616_2 = 2,
    MI_WRAM_ARM7_ALL = 3
} MIWram;

void MI_SetWramBank(MIWram cnt);

void MI_SetWramBank(MIWram cnt) {
    reg_GX_VRAMCNT_WRAM = (u8)cnt;
}
