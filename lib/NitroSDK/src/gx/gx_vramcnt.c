// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>
#include <nitro/gx/gx_vramcnt.h>
#include <nitro/hw/io_reg.h>
#include <nitro/os/ARM9/vramExclusive.h>
#include <nitro/types.h>

// VRAM bank assignment: sets / resets / disables the VRAMCNT registers per use and keeps the banks
// of each use in gGXState (banks not in use are mapped to the LCDC).

struct GX_State {
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
};

void GX_VRAMCNT_SetLCDC_(u32 mask);
void GX_SetBankForARM7(s32 arm7);
u32 resetBankForX_(u16 *ptr);
u32 disableBankForX_(u16 *ptr);
u32 GX_DisableBankForARM7();
u32 GX_GetBankForLCDC();

extern u16 GXi_VRamLockId;
extern struct GX_State gGXState;

void GX_VRAMCNT_SetLCDC_(u32 mask) {
    if (mask & GX_VRAM_A) {
        reg_GX_VRAMCNT_A = 0x80;
    }
    if (mask & GX_VRAM_B) {
        reg_GX_VRAMCNT_B = 0x80;
    }
    if (mask & GX_VRAM_C) {
        reg_GX_VRAMCNT_C = 0x80;
    }
    if (mask & GX_VRAM_D) {
        reg_GX_VRAMCNT_D = 0x80;
    }
    if (mask & GX_VRAM_E) {
        reg_GX_VRAMCNT_E = 0x80;
    }
    if (mask & GX_VRAM_F) {
        reg_GX_VRAMCNT_F = 0x80;
    }
    if (mask & GX_VRAM_G) {
        reg_GX_VRAMCNT_G = 0x80;
    }
    if (mask & GX_VRAM_H) {
        reg_GX_VRAMCNT_H = 0x80;
    }
    if (mask & GX_VRAM_I) {
        reg_GX_VRAMCNT_I = 0x80;
    }
}

void GX_SetBankForBG(GXVRamBG bg) {
    gGXState.lcdc = (u16)(~bg & (gGXState.lcdc | gGXState.bg));
    gGXState.bg = (u16)bg;
    switch (bg) {
    case GX_VRAM_BG_128_D:
        reg_GX_VRAMCNT_D = 0x81;
        break;
    case GX_VRAM_BG_256_CD:
        reg_GX_VRAMCNT_D = 0x89;
    case GX_VRAM_BG_128_C:
        reg_GX_VRAMCNT_C = 0x81;
        break;
    case GX_VRAM_BG_384_BCD:
        reg_GX_VRAMCNT_D = 0x91;
    case GX_VRAM_BG_256_BC:
        reg_GX_VRAMCNT_C = 0x89;
    case GX_VRAM_BG_128_B:
        reg_GX_VRAMCNT_B = 0x81;
        break;
    case GX_VRAM_BG_512_ABCD:
        reg_GX_VRAMCNT_D = 0x99;
    case GX_VRAM_BG_384_ABC:
        reg_GX_VRAMCNT_C = 0x91;
    case GX_VRAM_BG_256_AB:
        reg_GX_VRAMCNT_B = 0x89;
    case GX_VRAM_BG_128_A:
        reg_GX_VRAMCNT_A = 0x81;
        break;
    case GX_VRAM_BG_384_ABD:
        reg_GX_VRAMCNT_A = 0x81;
        reg_GX_VRAMCNT_B = 0x89;
        reg_GX_VRAMCNT_D = 0x91;
        break;
    case GX_VRAM_BG_384_ACD:
        reg_GX_VRAMCNT_D = 0x91;
    case GX_VRAM_BG_256_AC:
        reg_GX_VRAMCNT_A = 0x81;
        reg_GX_VRAMCNT_C = 0x89;
        break;
    case GX_VRAM_BG_256_AD:
        reg_GX_VRAMCNT_A = 0x81;
        reg_GX_VRAMCNT_D = 0x89;
        break;
    case GX_VRAM_BG_256_BD:
        reg_GX_VRAMCNT_B = 0x81;
        reg_GX_VRAMCNT_D = 0x89;
        break;
    case GX_VRAM_BG_96_EFG:
        reg_GX_VRAMCNT_G = 0x99;
    case GX_VRAM_BG_80_EF:
        reg_GX_VRAMCNT_F = 0x91;
    case GX_VRAM_BG_64_E:
        reg_GX_VRAMCNT_E = 0x81;
        break;
    case GX_VRAM_BG_80_EG:
        reg_GX_VRAMCNT_G = 0x91;
        reg_GX_VRAMCNT_E = 0x81;
        break;
    case GX_VRAM_BG_32_FG:
        reg_GX_VRAMCNT_G = 0x89;
    case GX_VRAM_BG_16_F:
        reg_GX_VRAMCNT_F = 0x81;
        break;
    case GX_VRAM_BG_16_G:
        reg_GX_VRAMCNT_G = 0x81;
        break;
    default:
        break;
    }
    GX_VRAMCNT_SetLCDC_(gGXState.lcdc);
}

void GX_SetBankForOBJ(GXVRamOBJ obj) {
    gGXState.lcdc = (u16)(~obj & (gGXState.lcdc | gGXState.obj));
    gGXState.obj = (u16)obj;
    switch (obj) {
    case GX_VRAM_OBJ_256_AB:
        reg_GX_VRAMCNT_B = 0x8A;
    case GX_VRAM_OBJ_128_A:
        reg_GX_VRAMCNT_A = 0x82;
    case GX_VRAM_OBJ_NONE: // needed to match
        break;
    case GX_VRAM_OBJ_128_B:
        reg_GX_VRAMCNT_B = 0x82;
        break;
    case GX_VRAM_OBJ_96_EFG:
        reg_GX_VRAMCNT_G = 0x9A;
    case GX_VRAM_OBJ_80_EF:
        reg_GX_VRAMCNT_F = 0x92;
    case GX_VRAM_OBJ_64_E:
        reg_GX_VRAMCNT_E = 0x82;
        break;
    case GX_VRAM_OBJ_80_EG:
        reg_GX_VRAMCNT_G = 0x92;
        reg_GX_VRAMCNT_E = 0x82;
        break;
    case GX_VRAM_OBJ_32_FG:
        reg_GX_VRAMCNT_G = 0x8A;
    case GX_VRAM_OBJ_16_F:
        reg_GX_VRAMCNT_F = 0x82;
        break;
    case GX_VRAM_OBJ_16_G:
        reg_GX_VRAMCNT_G = 0x82;
        break;
    default:
        break;
    }
    GX_VRAMCNT_SetLCDC_(gGXState.lcdc);
}

void GX_SetBankForBGExtPltt(GXVRamBGExtPltt bgextpltt) {
    gGXState.lcdc = (u16)(~bgextpltt & (gGXState.lcdc | gGXState.bgExtPltt));
    gGXState.bgExtPltt = (u16)bgextpltt;
    switch (bgextpltt) {
    case GX_VRAM_BGEXTPLTT_0123_E:
        reg_GX_DISPCNT |= REG_GX_DISPCNT_BG_MASK;
        reg_GX_VRAMCNT_E = 0x84;
        break;
    case GX_VRAM_BGEXTPLTT_23_G:
        reg_GX_DISPCNT |= REG_GX_DISPCNT_BG_MASK;
        reg_GX_VRAMCNT_G = 0x8C;
        break;
    case GX_VRAM_BGEXTPLTT_0123_FG:
        reg_GX_VRAMCNT_G = 0x8C;
    case GX_VRAM_BGEXTPLTT_01_F:
        reg_GX_VRAMCNT_F = 0x84;
        reg_GX_DISPCNT |= REG_GX_DISPCNT_BG_MASK;
        break;
    case GX_VRAM_BGEXTPLTT_NONE:
        reg_GX_DISPCNT &= ~REG_GX_DISPCNT_BG_MASK;
        break;
    }
    GX_VRAMCNT_SetLCDC_(gGXState.lcdc);
}

void GX_SetBankForOBJExtPltt(GXVRamOBJExtPltt objextpltt) {
    gGXState.lcdc = (u16)(~objextpltt & (gGXState.lcdc | gGXState.objExtPltt));
    gGXState.objExtPltt = (u16)objextpltt;
    switch (objextpltt) {
    case GX_VRAM_OBJEXTPLTT_0_F:
        reg_GX_DISPCNT |= REG_GX_DISPCNT_O_MASK;
        reg_GX_VRAMCNT_F = 0x85;
        break;
    case GX_VRAM_OBJEXTPLTT_0_G:
        reg_GX_DISPCNT |= REG_GX_DISPCNT_O_MASK;
        reg_GX_VRAMCNT_G = 0x85;
        break;
    case GX_VRAM_OBJEXTPLTT_NONE:
        reg_GX_DISPCNT &= ~REG_GX_DISPCNT_O_MASK;
        break;
    }
    GX_VRAMCNT_SetLCDC_(gGXState.lcdc);
}

void GX_SetBankForTex(GXVRamTex tex) {
    gGXState.lcdc = (u16)(~tex & (gGXState.lcdc | gGXState.tex));
    gGXState.tex = (u16)tex;
    if (tex == GX_VRAM_TEX_NONE) {
        reg_G3X_DISP3DCNT &= 0x0000CFFE;
    } else {
        reg_G3X_DISP3DCNT = (u16)((reg_G3X_DISP3DCNT & ~(REG_G3X_DISP3DCNT_GO_MASK | REG_G3X_DISP3DCNT_RO_MASK)) | REG_G3X_DISP3DCNT_TME_MASK);
        switch (tex) {
        case GX_VRAM_TEX_01_AC:
            reg_GX_VRAMCNT_A = 0x83;
            reg_GX_VRAMCNT_C = 0x8B;
            break;
        case GX_VRAM_TEX_01_AD:
            reg_GX_VRAMCNT_A = 0x83;
            reg_GX_VRAMCNT_D = 0x8B;
            break;
        case GX_VRAM_TEX_01_BD:
            reg_GX_VRAMCNT_B = 0x83;
            reg_GX_VRAMCNT_D = 0x8B;
            break;
        case GX_VRAM_TEX_012_ABD:
            reg_GX_VRAMCNT_A = 0x83;
            reg_GX_VRAMCNT_B = 0x8B;
            reg_GX_VRAMCNT_D = 0x93;
            break;
        case GX_VRAM_TEX_012_ACD:
            reg_GX_VRAMCNT_A = 0x83;
            reg_GX_VRAMCNT_C = 0x8B;
            reg_GX_VRAMCNT_D = 0x93;
            break;
        case GX_VRAM_TEX_0_D:
            reg_GX_VRAMCNT_D = 0x83;
            break;
        case GX_VRAM_TEX_01_CD:
            reg_GX_VRAMCNT_D = 0x8B;
        case GX_VRAM_TEX_0_C:
            reg_GX_VRAMCNT_C = 0x83;
            break;
        case GX_VRAM_TEX_012_BCD:
            reg_GX_VRAMCNT_D = 0x93;
        case GX_VRAM_TEX_01_BC:
            reg_GX_VRAMCNT_C = 0x8B;
        case GX_VRAM_TEX_0_B:
            reg_GX_VRAMCNT_B = 0x83;
            break;
        case GX_VRAM_TEX_0123_ABCD:
            reg_GX_VRAMCNT_D = 0x9B;
        case GX_VRAM_TEX_012_ABC:
            reg_GX_VRAMCNT_C = 0x93;
        case GX_VRAM_TEX_01_AB:
            reg_GX_VRAMCNT_B = 0x8B;
        case GX_VRAM_TEX_0_A:
            reg_GX_VRAMCNT_A = 0x83;
            break;
        }
    }
    GX_VRAMCNT_SetLCDC_(gGXState.lcdc);
}

#pragma force_active on

void GX_SetBankForTexPltt(GXVRamTexPltt texPltt) {
    gGXState.lcdc = (gGXState.lcdc | gGXState.texPltt) & ~texPltt;
    gGXState.texPltt = texPltt;
    switch (texPltt) {
    case GX_VRAM_TEXPLTT_01_FG:
        reg_GX_VRAMCNT_G = 0x8B;
    case GX_VRAM_TEXPLTT_0_F:
        reg_GX_VRAMCNT_F = 0x83;
        break;
    case GX_VRAM_TEXPLTT_0_G:
        reg_GX_VRAMCNT_G = 0x83;
        break;
    case GX_VRAM_TEXPLTT_012345_EFG:
        reg_GX_VRAMCNT_G = 0x9B;
    case GX_VRAM_TEXPLTT_01234_EF:
        reg_GX_VRAMCNT_F = 0x93;
    case GX_VRAM_TEXPLTT_0123_E:
        reg_GX_VRAMCNT_E = 0x83;
        break;
    case GX_VRAM_TEXPLTT_NONE:
        break;
    default:
        break;
    }
    GX_VRAMCNT_SetLCDC_(gGXState.lcdc);
}

#pragma force_active off

void GX_SetBankForClearImage(GXVRamClearImage clearimage) {
    gGXState.lcdc = (u16)(~clearimage & (gGXState.lcdc | gGXState.clrImg));
    gGXState.clrImg = (u16)clearimage;
    switch (clearimage) {
    case GX_VRAM_CLEARIMAGE_256_AB:
        reg_GX_VRAMCNT_A = 0x93;
    case GX_VRAM_CLEARDEPTH_128_B:
        reg_GX_VRAMCNT_B = 0x9B;
        reg_G3X_DISP3DCNT |= REG_G3X_DISP3DCNT_PRI_MASK;
        break;
    case GX_VRAM_CLEARIMAGE_256_CD:
        reg_GX_VRAMCNT_C = 0x93;
    case GX_VRAM_CLEARDEPTH_128_D:
        reg_GX_VRAMCNT_D = 0x9B;
        reg_G3X_DISP3DCNT |= REG_G3X_DISP3DCNT_PRI_MASK;
        break;
    case GX_VRAM_CLEARIMAGE_NONE:
        reg_G3X_DISP3DCNT &= ~REG_G3X_DISP3DCNT_PRI_MASK;
        break;
    case GX_VRAM_CLEARDEPTH_128_A:
        reg_GX_VRAMCNT_A = 0x9B;
        reg_G3X_DISP3DCNT |= REG_G3X_DISP3DCNT_PRI_MASK;
        break;
    case GX_VRAM_CLEARDEPTH_128_C:
        reg_GX_VRAMCNT_C = 0x9B;
        reg_G3X_DISP3DCNT |= REG_G3X_DISP3DCNT_PRI_MASK;
    }
    GX_VRAMCNT_SetLCDC_(gGXState.lcdc);
}

void GX_SetBankForARM7(s32 arm7) {
    gGXState.lcdc = (u16)(~arm7 & (gGXState.lcdc | gGXState.arm7));
    gGXState.arm7 = (u16)arm7;
    switch (arm7) {
    case 0: // needed to match
        break;
    case 12:
        reg_GX_VRAMCNT_D = 0x8A;
        reg_GX_VRAMCNT_C = 0x82;
        break;
    case 4:
        reg_GX_VRAMCNT_C = 0x82;
        break;
    case 8:
        reg_GX_VRAMCNT_D = 0x82;
    }
    GX_VRAMCNT_SetLCDC_(gGXState.lcdc);
}

void GX_SetBankForLCDC(GXVRamLCDC lcdc) {
    gGXState.lcdc |= lcdc;
    GX_VRAMCNT_SetLCDC_((u32)lcdc);
}

void GX_SetBankForSubBG(GXVRamSubBG subbg) {
    gGXState.lcdc = (u16)(~subbg & (gGXState.lcdc | gGXState.sub_bg));
    gGXState.sub_bg = (u16)subbg;
    switch (subbg) {
    case GX_VRAM_SUB_BG_NONE: // needed to match
        break;
    case GX_VRAM_SUB_BG_128_C:
        reg_GX_VRAMCNT_C = 0x84;
        break;
    case GX_VRAM_SUB_BG_48_HI:
        reg_GX_VRAMCNT_I = 0x81;
    case GX_VRAM_SUB_BG_32_H:
        reg_GX_VRAMCNT_H = 0x81;
    }
    GX_VRAMCNT_SetLCDC_(gGXState.lcdc);
}

void GX_SetBankForSubOBJ(GXVRamSubOBJ subobj) {
    gGXState.lcdc = (u16)(~subobj & (gGXState.lcdc | gGXState.sub_obj));
    gGXState.sub_obj = (u16)subobj;
    switch (subobj) {
    case GX_VRAM_SUB_OBJ_128_D:
        reg_GX_VRAMCNT_D = 0x84;
        break;
    case GX_VRAM_SUB_OBJ_16_I:
        reg_GX_VRAMCNT_I = 0x82;
        break;
    case GX_VRAM_SUB_OBJ_NONE: // needed to match
        break;
    }
    GX_VRAMCNT_SetLCDC_(gGXState.lcdc);
}

void GX_SetBankForSubBGExtPltt(GXVRamSubBGExtPltt subbgextpltt) {
    gGXState.lcdc = (u16)(~subbgextpltt & (gGXState.lcdc | gGXState.sub_bgExtPltt));
    gGXState.sub_bgExtPltt = (u16)subbgextpltt;
    switch (subbgextpltt) {
    case GX_VRAM_SUB_BGEXTPLTT_0123_H:
        reg_GXS_DB_DISPCNT |= REG_GXS_DB_DISPCNT_BG_MASK;
        reg_GX_VRAMCNT_H = 0x82;
        break;
    case GX_VRAM_SUB_BGEXTPLTT_NONE:
        reg_GXS_DB_DISPCNT &= ~REG_GXS_DB_DISPCNT_BG_MASK;
        break;
    }
    GX_VRAMCNT_SetLCDC_(gGXState.lcdc);
}

void GX_SetBankForSubOBJExtPltt(GXVRamSubOBJExtPltt subobjextpltt) {
    gGXState.lcdc = (u16)(~subobjextpltt & (gGXState.lcdc | gGXState.sub_objExtPltt));
    gGXState.sub_objExtPltt = (u16)subobjextpltt;
    switch (subobjextpltt) {
    case GX_VRAM_SUB_OBJEXTPLTT_0_I:
        reg_GXS_DB_DISPCNT |= REG_GXS_DB_DISPCNT_O_MASK;
        reg_GX_VRAMCNT_I = 0x83;
        break;
    case GX_VRAM_SUB_OBJEXTPLTT_NONE:
        reg_GXS_DB_DISPCNT &= ~REG_GXS_DB_DISPCNT_O_MASK;
        break;
    }
    GX_VRAMCNT_SetLCDC_(gGXState.lcdc);
}

u32 resetBankForX_(u16 *ptr) {
    u16 temp = *ptr;
    *ptr = 0;
    gGXState.lcdc |= temp;
    GX_VRAMCNT_SetLCDC_(temp);
    return temp;
}

GXVRamBG GX_ResetBankForBG(void) {
    return (GXVRamBG)resetBankForX_(&gGXState.bg);
}

GXVRamOBJ GX_ResetBankForOBJ(void) {
    return (GXVRamOBJ)resetBankForX_(&gGXState.obj);
}

GXVRamBGExtPltt GX_ResetBankForBGExtPltt(void) {
    reg_GX_DISPCNT &= ~REG_GX_DISPCNT_BG_MASK;
    return (GXVRamBGExtPltt)resetBankForX_(&gGXState.bgExtPltt);
}

GXVRamOBJExtPltt GX_ResetBankForOBJExtPltt(void) {
    reg_GX_DISPCNT &= ~REG_GX_DISPCNT_O_MASK;
    return (GXVRamOBJExtPltt)resetBankForX_(&gGXState.objExtPltt);
}

GXVRamTex GX_ResetBankForTex(void) {
    return (GXVRamTex)resetBankForX_(&gGXState.tex);
}

GXVRamTexPltt GX_ResetBankForTexPltt(void) {
    return (GXVRamTexPltt)resetBankForX_(&gGXState.texPltt);
}

GXVRamClearImage GX_ResetBankForClearImage(void) {
    return (GXVRamClearImage)resetBankForX_(&gGXState.clrImg);
}

GXVRamSubBG GX_ResetBankForSubBG(void) {
    return (GXVRamSubBG)resetBankForX_(&gGXState.sub_bg);
}

GXVRamSubOBJ GX_ResetBankForSubOBJ(void) {
    return (GXVRamSubOBJ)resetBankForX_(&gGXState.sub_obj);
}

GXVRamSubBGExtPltt GX_ResetBankForSubBGExtPltt(void) {
    reg_GXS_DB_DISPCNT &= ~REG_GXS_DB_DISPCNT_BG_MASK;
    return (GXVRamSubBGExtPltt)resetBankForX_(&gGXState.sub_bgExtPltt);
}

GXVRamSubOBJExtPltt GX_ResetBankForSubOBJExtPltt(void) {
    reg_GXS_DB_DISPCNT &= ~REG_GXS_DB_DISPCNT_O_MASK;
    return (GXVRamSubOBJExtPltt)resetBankForX_(&gGXState.sub_objExtPltt);
}

u32 disableBankForX_(u16 *ptr) {
    u32 temp = *ptr;
    *ptr = 0;
    if (temp & GX_VRAM_A) {
        reg_GX_VRAMCNT_A = 0x0;
    }
    if (temp & GX_VRAM_B) {
        reg_GX_VRAMCNT_B = 0x0;
    }
    if (temp & GX_VRAM_C) {
        reg_GX_VRAMCNT_C = 0x0;
    }
    if (temp & GX_VRAM_D) {
        reg_GX_VRAMCNT_D = 0x0;
    }
    if (temp & GX_VRAM_E) {
        reg_GX_VRAMCNT_E = 0x0;
    }
    if (temp & GX_VRAM_F) {
        reg_GX_VRAMCNT_F = 0x0;
    }
    if (temp & GX_VRAM_G) {
        reg_GX_VRAMCNT_G = 0x0;
    }
    if (temp & GX_VRAM_H) {
        reg_GX_VRAMCNT_H = 0x0;
    }
    if (temp & GX_VRAM_I) {
        reg_GX_VRAMCNT_I = 0x0;
    }
    OSi_UnlockVram((u16)temp, GXi_VRamLockId);
    return temp;
}

GXVRamBG GX_DisableBankForBG(void) {
    return (GXVRamBG)disableBankForX_(&gGXState.bg);
}

GXVRamOBJ GX_DisableBankForOBJ(void) {
    return (GXVRamOBJ)disableBankForX_(&gGXState.obj);
}

GXVRamBGExtPltt GX_DisableBankForBGExtPltt(void) {
    reg_GX_DISPCNT &= ~REG_GX_DISPCNT_BG_MASK;
    return (GXVRamBGExtPltt)disableBankForX_(&gGXState.bgExtPltt);
}

GXVRamOBJExtPltt GX_DisableBankForOBJExtPltt(void) {
    reg_GX_DISPCNT &= ~REG_GX_DISPCNT_O_MASK;
    return (GXVRamOBJExtPltt)disableBankForX_(&gGXState.objExtPltt);
}

GXVRamTex GX_DisableBankForTex(void) {
    return (GXVRamTex)disableBankForX_(&gGXState.tex);
}

GXVRamTexPltt GX_DisableBankForTexPltt(void) {
    return (GXVRamTexPltt)disableBankForX_(&gGXState.texPltt);
}

GXVRamClearImage GX_DisableBankForClearImage(void) {
    return (GXVRamClearImage)disableBankForX_(&gGXState.clrImg);
}

u32 GX_DisableBankForARM7() {
    return disableBankForX_(&gGXState.arm7);
}

GXVRamLCDC GX_DisableBankForLCDC(void) {
    return (GXVRamLCDC)disableBankForX_(&gGXState.lcdc);
}

GXVRamSubBG GX_DisableBankForSubBG(void) {
    return (GXVRamSubBG)disableBankForX_(&gGXState.sub_bg);
}

GXVRamSubOBJ GX_DisableBankForSubOBJ(void) {
    return (GXVRamSubOBJ)disableBankForX_(&gGXState.sub_obj);
}

GXVRamSubBGExtPltt GX_DisableBankForSubBGExtPltt(void) {
    reg_GXS_DB_DISPCNT &= ~REG_GX_DISPCNT_BG_MASK;
    return (GXVRamSubBGExtPltt)disableBankForX_(&gGXState.sub_bgExtPltt);
}

GXVRamSubOBJExtPltt GX_DisableBankForSubOBJExtPltt(void) {
    reg_GXS_DB_DISPCNT &= ~REG_GX_DISPCNT_O_MASK;
    return (GXVRamSubOBJExtPltt)disableBankForX_(&gGXState.sub_objExtPltt);
}

GXVRamOBJ GX_GetBankForOBJ(void) {
    return (GXVRamOBJ)gGXState.obj;
}

GXVRamOBJExtPltt GX_GetBankForOBJExtPltt(void) {
    return (GXVRamOBJExtPltt)gGXState.objExtPltt;
}

u32 GX_GetBankForLCDC() {
    return gGXState.lcdc;
}

GXVRamSubOBJ GX_GetBankForSubOBJ(void) {
    return (GXVRamSubOBJ)gGXState.sub_obj;
}

GXVRamSubOBJExtPltt GX_GetBankForSubOBJExtPltt(void) {
    return (GXVRamSubOBJExtPltt)gGXState.sub_objExtPltt;
}
