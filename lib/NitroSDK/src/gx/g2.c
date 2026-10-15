#include <nitro.h>
#include <nitro/code32.h>

void G2x_SetBGyAffine_(u32 ptr, const MtxFx22 *mtx, fx32 a, fx32 b, fx32 c, fx32 d);
void G2x_SetBlendAlpha_(u32 ptr, int plane1, int plane2, int ev1, int ev2);
void G2x_SetBlendBrightness_(volatile u16 *ptr, fx32 a, fx32 brightness);
void G2x_ChangeBlendBrightness_(u16 *ptr, fx32 brightness);

void G2x_SetBGyAffine_(u32 ptr, const MtxFx22 *mtx, fx32 a, fx32 b, fx32 c, fx32 d) {
    fx32 temp0, temp1, temp2, temp3;
    *((vu32 *)ptr + 0) = (u32)((u16)(fx16)(mtx->_00 >> 4) | (u16)(fx16)(mtx->_01 >> 4) << 16);
    *((vu32 *)ptr + 1) = (u32)((u16)(fx16)(mtx->_10 >> 4) | (u16)(fx16)(mtx->_11 >> 4) << 16);
    temp0 = c - a;
    temp1 = d - b;
    temp2 = mtx->_00 * temp0 + mtx->_01 * temp1 + (a << FX32_SHIFT);
    temp3 = mtx->_10 * temp0 + mtx->_11 * temp1 + (b << FX32_SHIFT);
    *((vu32 *)ptr + 2) = (u32)(temp2 >> 4);
    *((vu32 *)ptr + 3) = (u32)(temp3 >> 4);
}

void G2x_SetBlendAlpha_(u32 ptr, int plane1, int plane2, int ev1, int ev2) {
    *(vu32 *)ptr = (u32)(((plane1 | 0x40) | (plane2 << 8)) | ((ev1 | (ev2 << 8)) << 16));
}

void G2x_SetBlendBrightness_(volatile u16 *ptr, fx32 a, fx32 brightness) {
    if (brightness < 0) {
        ptr[0] = (u16)(a | 0xC0);
        ptr[2] = (u16)(-brightness);
    } else {
        ptr[0] = (u16)(a | 0x80);
        ptr[2] = (u16)brightness;
    }
}

void G2x_ChangeBlendBrightness_(u16 *ptr, fx32 brightness) {
    u32 temp = *ptr;
    if (brightness < 0) {
        if ((temp & 0xC0) == 0x80) {
            ptr[0] = (u16)((temp & ~0xC0) | 0xC0);
        }
        ptr[2] = (u16)(-brightness);
    } else {
        if ((temp & 0xC0) == 0xC0) {
            ptr[0] = (u16)((temp & ~0xC0) | 0x80);
        }
        ptr[2] = (u16)brightness;
    }
}
