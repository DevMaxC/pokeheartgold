#include <nitro.h>
#include <nitro/code32.h>

void *G2_GetBG0ScrPtr() {
    u32 temp = (u32)(((reg_G2_BG0CNT & REG_G2_BG0CNT_SCREENBASE_MASK) >> REG_G2_BG0CNT_SCREENBASE_SHIFT) << 0xB);
    return (void *)(HW_BG_VRAM + (((reg_GX_DISPCNT & REG_GX_DISPCNT_BGSCREENOFFSET_MASK) >> REG_GX_DISPCNT_BGSCREENOFFSET_SHIFT) << 0x10) + temp);
}

void *G2S_GetBG0ScrPtr() {
    return (void *)(HW_DB_BG_VRAM + (((reg_G2S_DB_BG0CNT & REG_G2S_DB_BG0CNT_SCREENBASE_MASK) >> REG_G2S_DB_BG0CNT_SCREENBASE_SHIFT) << 0xB));
}

void *G2_GetBG1ScrPtr() {
    u32 temp = (u32)(((reg_G2_BG1CNT & REG_G2_BG1CNT_SCREENBASE_MASK) >> REG_G2_BG1CNT_SCREENBASE_SHIFT) << 0xB);
    return (void *)(HW_BG_VRAM + (((reg_GX_DISPCNT & REG_GX_DISPCNT_BGSCREENOFFSET_MASK) >> REG_GX_DISPCNT_BGSCREENOFFSET_SHIFT) << 0x10) + temp);
}

void *G2S_GetBG1ScrPtr() {
    return (void *)(HW_DB_BG_VRAM + (((reg_G2S_DB_BG1CNT & REG_G2S_DB_BG1CNT_SCREENBASE_MASK) >> REG_G2S_DB_BG1CNT_SCREENBASE_SHIFT) << 0xB));
}

void *G2_GetBG2ScrPtr() {
    u32 temp12 = (reg_GX_DISPCNT & REG_GX_DISPCNT_BGMODE_MASK);
    u32 temp3 = reg_G2_BG2CNT;
    u32 temp2 = (((reg_GX_DISPCNT & REG_GX_DISPCNT_BGSCREENOFFSET_MASK) >> REG_GX_DISPCNT_BGSCREENOFFSET_SHIFT) << 0x10);
    u32 temp1 = ((temp3 & REG_G2_BG2CNT_SCREENBASE_MASK) >> REG_G2_BG2CNT_SCREENBASE_SHIFT);
    switch (temp12) {
    case GX_BGMODE_0:
    case GX_BGMODE_1:
    case GX_BGMODE_2:
    case GX_BGMODE_3:
    case GX_BGMODE_4:
        return (void *)(HW_BG_VRAM + temp2 + (temp1 << 0xB));
    case GX_BGMODE_5:
        if (temp3 & REG_G2_BG2CNT_COLORMODE_MASK) {
            return (void *)(HW_BG_VRAM + (temp1 << 0xE));
        } else {
            return (void *)(HW_BG_VRAM + temp2 + (temp1 << 0xB));
        }
    case GX_BGMODE_6:
        return (void *)HW_BG_VRAM;
    default:
        return NULL;
    }
}

void *G2S_GetBG2ScrPtr() {
    u32 temp12 = (reg_GXS_DB_DISPCNT & REG_GXS_DB_DISPCNT_BGMODE_MASK);
    u32 temp3 = reg_G2S_DB_BG2CNT;
    u32 temp1 = ((temp3 & REG_G2S_DB_BG2CNT_SCREENBASE_MASK) >> REG_G2S_DB_BG2CNT_SCREENBASE_SHIFT);
    switch (temp12) {
    case GX_BGMODE_0:
    case GX_BGMODE_1:
    case GX_BGMODE_2:
    case GX_BGMODE_3:
    case GX_BGMODE_4:
        return (void *)(HW_DB_BG_VRAM + (temp1 << 0xB));
    case GX_BGMODE_5:
        if (temp3 & REG_G2S_DB_BG2CNT_COLORMODE_MASK) {
            return (void *)(HW_DB_BG_VRAM + (temp1 << 0xE));
        } else {
            return (void *)(HW_DB_BG_VRAM + (temp1 << 0xB));
        }
    case GX_BGMODE_6:
        return NULL;
    default:
        return NULL;
    }
}

void *G2_GetBG3ScrPtr() {
    u32 temp12 = (reg_GX_DISPCNT & REG_GX_DISPCNT_BGMODE_MASK);
    u32 temp3 = reg_G2_BG3CNT;
    u32 temp2 = (((reg_GX_DISPCNT & REG_GX_DISPCNT_BGSCREENOFFSET_MASK) >> REG_GX_DISPCNT_BGSCREENOFFSET_SHIFT) << 0x10);
    u32 temp1 = ((temp3 & REG_G2_BG3CNT_SCREENBASE_MASK) >> REG_G2_BG3CNT_SCREENBASE_SHIFT);
    switch (temp12) {
    case GX_BGMODE_0:
    case GX_BGMODE_1:
    case GX_BGMODE_2:
        return (void *)(HW_BG_VRAM + temp2 + (temp1 << 0xB));
    case GX_BGMODE_3:
    case GX_BGMODE_4:
    case GX_BGMODE_5:
        if (temp3 & REG_G2_BG3CNT_COLORMODE_MASK) {
            return (void *)(HW_BG_VRAM + (temp1 << 0xE));
        } else {
            return (void *)(HW_BG_VRAM + temp2 + (temp1 << 0xB));
        }
    case GX_BGMODE_6:
        return NULL;
    default:
        return NULL;
    }
}

void *G2S_GetBG3ScrPtr() {
    u32 temp12 = (reg_GXS_DB_DISPCNT & REG_GXS_DB_DISPCNT_BGMODE_MASK);
    u32 temp3 = reg_G2S_DB_BG3CNT;
    u32 temp1 = ((temp3 & REG_G2S_DB_BG3CNT_SCREENBASE_MASK) >> REG_G2S_DB_BG3CNT_SCREENBASE_SHIFT);
    switch (temp12) {
    case GX_BGMODE_0:
    case GX_BGMODE_1:
    case GX_BGMODE_2:
        return (void *)(HW_DB_BG_VRAM + (temp1 << 0xB));
    case GX_BGMODE_3:
    case GX_BGMODE_4:
    case GX_BGMODE_5:
        if (temp3 & REG_G2S_DB_BG3CNT_COLORMODE_MASK) {
            return (void *)(HW_DB_BG_VRAM + (temp1 << 0xE));
        } else {
            return (void *)(HW_DB_BG_VRAM + (temp1 << 0xB));
        }
    case GX_BGMODE_6:
        return NULL;
    default:
        return NULL;
    }
}

void *G2_GetBG0CharPtr() {
    u32 temp = (u32)(((reg_G2_BG0CNT & REG_G2_BG0CNT_CHARBASE_MASK) >> REG_G2_BG0CNT_CHARBASE_SHIFT) << 0xE);
    return (void *)(HW_BG_VRAM + (((reg_GX_DISPCNT & REG_GX_DISPCNT_BGCHAROFFSET_MASK) >> REG_GX_DISPCNT_BGCHAROFFSET_SHIFT) << 0x10) + temp);
}

void *G2S_GetBG0CharPtr() {
    return (void *)(HW_DB_BG_VRAM + (((reg_G2S_DB_BG0CNT & REG_G2S_DB_BG0CNT_CHARBASE_MASK) >> REG_G2S_DB_BG0CNT_CHARBASE_SHIFT) << 0xE));
}

void *G2_GetBG1CharPtr() {
    u32 temp = (u32)(((reg_G2_BG1CNT & REG_G2_BG1CNT_CHARBASE_MASK) >> REG_G2_BG1CNT_CHARBASE_SHIFT) << 0xE);
    return (void *)(HW_BG_VRAM + (((reg_GX_DISPCNT & REG_GX_DISPCNT_BGCHAROFFSET_MASK) >> REG_GX_DISPCNT_BGCHAROFFSET_SHIFT) << 0x10) + temp);
}

void *G2S_GetBG1CharPtr() {
    return (void *)(HW_DB_BG_VRAM + (((reg_G2S_DB_BG1CNT & REG_G2S_DB_BG1CNT_CHARBASE_MASK) >> REG_G2S_DB_BG1CNT_CHARBASE_SHIFT) << 0xE));
}

void *G2_GetBG2CharPtr() {
    s32 temp1 = (s32)(reg_GX_DISPCNT & REG_GX_DISPCNT_BGMODE_MASK);
    u32 temp = reg_G2_BG2CNT;
    if (temp1 < GX_BGMODE_5 || !(temp & REG_G2_BG2CNT_COLORMODE_MASK)) {
        u32 temp1 = (((reg_GX_DISPCNT & REG_GX_DISPCNT_BGCHAROFFSET_MASK) >> REG_GX_DISPCNT_BGCHAROFFSET_SHIFT) << 0x10);
        u32 temp2 = (temp & REG_G2_BG2CNT_CHARBASE_MASK) >> REG_G2_BG2CNT_CHARBASE_SHIFT;
        return (void *)(HW_BG_VRAM + temp1 + (temp2 << 0xE));
    } else {
        return NULL;
    }
}

void *G2S_GetBG2CharPtr() {
    s32 temp1 = (s32)(reg_GXS_DB_DISPCNT & REG_GXS_DB_DISPCNT_BGMODE_MASK);
    u32 temp = reg_G2S_DB_BG2CNT;
    if (temp1 < GX_BGMODE_5 || !(temp & REG_G2S_DB_BG2CNT_COLORMODE_MASK)) {
        u32 temp2 = ((temp & REG_G2S_DB_BG2CNT_CHARBASE_MASK) >> REG_G2S_DB_BG2CNT_CHARBASE_SHIFT) << 0xE;
        return (void *)(HW_DB_BG_VRAM + temp2);
    } else {
        return NULL;
    }
}

void *G2_GetBG3CharPtr() {
    s32 temp1 = (s32)(reg_GX_DISPCNT & REG_GX_DISPCNT_BGMODE_MASK);
    u32 temp = reg_G2_BG3CNT;
    if (temp1 < GX_BGMODE_3 || (temp1 < GX_BGMODE_6 && !(temp & REG_G2_BG3CNT_COLORMODE_MASK))) {
        u32 temp1 = (((reg_GX_DISPCNT & REG_GX_DISPCNT_BGCHAROFFSET_MASK) >> REG_GX_DISPCNT_BGCHAROFFSET_SHIFT) << 0x10);
        u32 temp2 = (temp & REG_G2_BG3CNT_CHARBASE_MASK) >> REG_G2_BG3CNT_CHARBASE_SHIFT;
        return (void *)(HW_BG_VRAM + temp1 + (temp2 << 0xE));
    } else {
        return NULL;
    }
}

void *G2S_GetBG3CharPtr() {
    s32 temp1 = (s32)(reg_GXS_DB_DISPCNT & REG_GXS_DB_DISPCNT_BGMODE_MASK);
    u32 temp = reg_G2S_DB_BG3CNT;
    if (temp1 < GX_BGMODE_3 || (temp1 < GX_BGMODE_6 && !(temp & REG_G2S_DB_BG3CNT_COLORMODE_MASK))) {
        u32 temp2 = ((temp & REG_G2S_DB_BG3CNT_CHARBASE_MASK) >> REG_G2S_DB_BG3CNT_CHARBASE_SHIFT) << 0xE;
        return (void *)(HW_DB_BG_VRAM + temp2);
    } else {
        return NULL;
    }
}
