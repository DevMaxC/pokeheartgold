#include <nitro.h>
#include <nnsys/fnd_internal.h>
#include <nnsys/g3d/binres/res_struct.h>
#include <nnsys/g3d/binres/res_struct_accessor.h>
#include <nnsys/g3d/mem.h>
#include <nnsys/g3d/util.h>
#include <nnsys/g3d_util_internal.h>
#include <nnsys/gfd/VramManager/gfd_PlttVramMan_Types.h>
#include <nnsys/gfd/VramManager/gfd_TexVramMan_Types.h>

#pragma force_active on

void NNS_G3dInit(void) {
    G3X_Init();
    NNS_G3dGlbInit();
    // geometry FIFO interrupt condition: less than half full
    reg_G3X_GXSTAT = (reg_G3X_GXSTAT & ~REG_G3X_GXSTAT_FI_MASK) | (2 << REG_G3X_GXSTAT_FI_SHIFT);
}

// default set-up of a loaded g3d resource file: models and textures get VRAM, are loaded and bound;
// animations need nothing. Returns FALSE for an unknown file or when VRAM runs out
BOOL NNS_G3dResDefaultSetup(void *pResData) {
    NNSG3dResTex *pTex;
    BOOL texOk;
    BOOL tex4x4Ok;
    BOOL plttOk;
    u32 texSize;
    u32 tex4x4Size;
    u32 plttSize;
    NNSGfdTexKey texKey;
    NNSGfdTexKey tex4x4Key;
    NNSGfdPlttKey plttKey;
    switch (*(u32 *)pResData) {
    case G3D_RES_SIG_BVA0:
    case G3D_RES_SIG_BMA0:
    case G3D_RES_SIG_BCA0:
    case G3D_RES_SIG_BTA0:
    case G3D_RES_SIG_BTP0:
        goto ok;
    case G3D_RES_SIG_BMD0:
    case G3D_RES_SIG_BTX0: {
        texOk = TRUE;
        tex4x4Ok = texOk;
        plttOk = texOk;
        pTex = NNS_G3dGetTex(pResData);
        if (pTex) {
            texSize = NNS_G3dTexGetRequiredSize(pTex);
            tex4x4Size = NNS_G3dTex4x4GetRequiredSize(pTex);
            plttSize = NNS_G3dPlttGetRequiredSize(pTex);
            if (texSize) {
                texKey = NNS_GfdAllocTexVram(texSize, FALSE, 0);
                if (!texKey) {
                    texOk = FALSE;
                }
            } else {
                texKey = 0;
            }
            if (tex4x4Size) {
                tex4x4Key = NNS_GfdAllocTexVram(tex4x4Size, TRUE, 0);
                if (!tex4x4Key) {
                    tex4x4Ok = FALSE;
                }
            } else {
                tex4x4Key = 0;
            }
            if (plttSize) {
                // the 4-colour palette flag is read at offset 0x20 of the texture block (tex4x4Info.flag)
                plttKey = NNS_GfdAllocPlttVram(plttSize, pTex->tex4x4Info.flag & NNS_G3D_RESPLTT_USEPLTT4, 0);
                if (!plttKey) {
                    plttOk = FALSE;
                }
            } else {
                plttKey = 0;
            }
            if (!texOk || !tex4x4Ok || !plttOk) {
                if (plttOk) {
                    NNS_GfdFreePlttVram(plttKey);
                }
                if (tex4x4Ok) {
                    NNS_GfdFreeTexVram(tex4x4Key);
                }
                if (texOk) {
                    NNS_GfdFreeTexVram(texKey);
                }
                return FALSE;
            }
            NNS_G3dTexSetTexKey(pTex, texKey, tex4x4Key);
            NNS_G3dPlttSetPlttKey(pTex, plttKey);
            NNS_G3dTexLoad(pTex, TRUE);
            NNS_G3dPlttLoad(pTex, TRUE);
        }
        if (*(u32 *)pResData == G3D_RES_SIG_BMD0) {
            NNSG3dResMdlSet *pMdlSet = NNS_G3dGetMdlSet(pResData);
            if (pTex) {
                NNS_G3dBindMdlSet(pMdlSet, pTex);
            }
        }
        return TRUE;
    }
    default:
        goto error;
    }
ok:
    return TRUE;
error:
    return FALSE;
}

// screen position (px, py) -> the points of the line through it on the near (pNear) and far (pFar,
// optional) clip planes in world coordinates; returns -1 when the position is outside the viewport
int NNS_G3dScrPosToWorldLine(int px, int py, VecFx32 *pNear, VecFx32 *pFar) {
    const MtxFx44 *m;
    int x;
    int y;
    int height;
    u32 x1;
    u32 y1;
    u32 x2;
    u32 y2;
    int result;
    fx32 w;
    int farW;
    int farX;
    int farY;
    int nearX;
    int nearY;
    int nearZ;
    int farZ;
    NNS_G3dGlbGetViewPort(&x1, &y1, &x2, &y2);
    height = y2 - y1;
    x = FX_Div((px - x1) << FX32_SHIFT, (x2 - x1) << FX32_SHIFT);
    y = FX_Div((py + y1 - (GX_LCD_SIZE_Y - 1)) << FX32_SHIFT, (-height) << FX32_SHIFT);
    if (x < 0 || y < 0 || x > FX32_ONE || y > FX32_ONE) {
        result = -1;
    } else {
        result = 0;
    }
    fx64 inv;
    // to normalised device coordinates (-1 .. 1), then through the inverse view-projection matrix
    x = (x - (FX32_ONE / 2)) * 2;
    y = (y - (FX32_ONE / 2)) * 2;
    m = NNS_G3dGlbGetInvVP();
    w = m->_33 + (int)(((fx64)x * m->_03 + (fx64)y * m->_13) >> FX32_SHIFT);
    FX_InvAsync(w - m->_23);
    nearX = (int)(((fx64)x * m->_00 + (fx64)y * m->_10) >> FX32_SHIFT) + m->_30;
    nearY = m->_31 + (int)(((fx64)x * m->_01 + (fx64)y * m->_11) >> FX32_SHIFT);
    nearZ = m->_32 + (int)(((fx64)x * m->_02 + (fx64)y * m->_12) >> FX32_SHIFT);
    if (pFar) {
        farX = nearX + m->_20;
        farY = nearY + m->_21;
        farZ = nearZ + m->_22;
        farW = w + m->_23;
    }
    nearX -= m->_20;
    nearY -= m->_21;
    nearZ -= m->_22;
    inv = FX_GetDivResultFx64c();
    if (pFar != NULL) {
        FX_InvAsync(farW);
    }
    pNear->x = (int)((inv * nearX + 0x80000000LL) >> 32);
    pNear->y = (int)((inv * nearY + 0x80000000LL) >> 32);
    pNear->z = (int)((inv * nearZ + 0x80000000LL) >> 32);
    if (pFar) {
        inv = FX_GetDivResultFx64c();
        pFar->x = (int)((inv * farX + 0x80000000LL) >> 32);
        pFar->y = (int)((inv * farY + 0x80000000LL) >> 32);
        pFar->z = (int)((inv * farZ + 0x80000000LL) >> 32);
    }
    return result;
}

NNSG3dAnmObj *NNS_G3dAllocAnmObj(NNSFndAllocator *pAlloc, const void *pAnm, const NNSG3dResMdl *pMdl) {
    return NNS_FndAllocFromAllocator(pAlloc, NNS_G3dAnmObjCalcSizeRequired(pAnm, pMdl));
}

void NNS_G3dFreeAnmObj(NNSFndAllocator *pAlloc, NNSG3dAnmObj *pAnmObj) {
    NNS_FndFreeToAllocator(pAlloc, pAnmObj);
}
