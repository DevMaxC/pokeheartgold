#include <nitro.h>
#include <nitro/code32.h>

typedef struct GXState {
    u16 lcdc;
    u16 bg;
    u16 obj;
    u16 arm7;
    u16 tex;
    u16 texPltt;
    u16 clrImg;
    u16 bgExtPltt;
    u16 objExtPltt;
    u16 sub_bg;
    u16 sub_obj;
    u16 sub_bgExtPltt;
    u16 sub_objExtPltt;
    u16 _padding;
} GXState;

GXState gGXState ALIGN(4);

void GX_InitGXState(void);

void GX_InitGXState(void) {
    gGXState.lcdc = 0;
    gGXState.bg = 0;
    gGXState.obj = 0;
    gGXState.arm7 = 0;
    gGXState.tex = 0;
    gGXState.texPltt = 0;
    gGXState.clrImg = 0;
    gGXState.bgExtPltt = 0;
    gGXState.objExtPltt = 0;
    gGXState.sub_bg = 0;
    gGXState.sub_obj = 0;
    gGXState.sub_bgExtPltt = 0;
    gGXState.sub_objExtPltt = 0;
    reg_GX_VRAMCNT = 0;
    reg_GX_VRAMCNT_E = 0;
    reg_GX_VRAMCNT_F = 0;
    reg_GX_VRAMCNT_G = 0;
    reg_GX_VRAM_HI_CNT = 0;
}
