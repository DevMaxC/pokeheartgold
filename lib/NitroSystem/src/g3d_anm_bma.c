#include <nitro.h>
#include <nnsys/g3d_anm_mat_internal.h>

#pragma force_active on

// colour (GX_RGB) of a frame from a material colour track; frames between the stored colours are
// averaged per component
u16 GetMatColAnmValue_(G3dResMatCAnm *pAnm, u32 info, u32 frame) {
    const u16 *p;
    u32 last, idx, idx0, idx1;
    if (info & G3D_MATCANM_TRACK_CONST) {
        return (u16)info;
    }
    p = (const u16 *)((const u8 *)pAnm + (u16)info);
    if (!(info & G3D_ANM_TRACK_STEP_MASK)) {
        return p[frame];
    }
    last = (info & G3D_ANM_TRACK_LAST_MASK) >> G3D_ANM_TRACK_LAST_SHIFT;
    if (info & G3D_ANM_TRACK_STEP_2) {
        if (frame & 1) {
            if (frame > last) {
                return p[(last >> 1) + 1];
            }
            idx = frame >> 1;
            goto half;
        }
        return p[frame >> 1];
    }
    if (frame & 3) {
        if (frame > last) {
            return (p + (last >> 2))[frame & 3];
        }
        if (frame & 1) {
            // a quarter between two colours: 3/4 of the nearer one
            if (frame & 2) {
                idx1 = frame >> 2;
                idx0 = idx1 + 1;
            } else {
                idx0 = frame >> 2;
                idx1 = idx0 + 1;
            }
            {
                u32 a = p[idx0];
                u32 b = p[idx1];
                u32 g3 = (a & GX_RGB_G_MASK) * 3;
                u32 rb3 = (a & (GX_RGB_R_MASK | GX_RGB_B_MASK)) * 3;
                u32 g = (g3 + (b & GX_RGB_G_MASK)) >> 2;
                u32 rb = (rb3 + (b & (GX_RGB_R_MASK | GX_RGB_B_MASK))) >> 2;
                return (u16)((rb & (GX_RGB_R_MASK | GX_RGB_B_MASK)) | (g & GX_RGB_G_MASK));
            }
        }
        idx = frame >> 2;
        goto half;
    }
    return p[frame >> 2];
half: {
    u32 a = p[idx];
    u32 b = p[idx + 1];
    u32 g = ((a & GX_RGB_G_MASK) + (b & GX_RGB_G_MASK)) >> 1;
    u32 rb = ((a & (GX_RGB_R_MASK | GX_RGB_B_MASK)) + (b & (GX_RGB_R_MASK | GX_RGB_B_MASK))) >> 1;
    return (u16)((rb & (GX_RGB_R_MASK | GX_RGB_B_MASK)) | (g & GX_RGB_G_MASK));
}
}

// polygon alpha of a frame from a material colour track
u16 GetMatColAnmuAlphaValue_(G3dResMatCAnm *pAnm, u32 info, u32 frame) {
    const u8 *p;
    u32 last, idx;
    if (info & G3D_MATCANM_TRACK_CONST) {
        return (u16)info;
    }
    p = (const u8 *)pAnm + (u16)info;
    if (!(info & G3D_ANM_TRACK_STEP_MASK)) {
        return p[frame];
    }
    last = (info & G3D_ANM_TRACK_LAST_MASK) >> G3D_ANM_TRACK_LAST_SHIFT;
    if (info & G3D_ANM_TRACK_STEP_2) {
        if (frame & 1) {
            if (frame > last) {
                return p[(last >> 1) + 1];
            }
            return (u16)((p[frame >> 1] + p[(frame >> 1) + 1]) >> 1);
        }
        return p[frame >> 1];
    }
    if (frame & 3) {
        if (frame > last) {
            return p[(last >> 2) + (frame & 3)];
        }
        if (frame & 1) {
            // a quarter between two values: 3/4 of the nearer one (frame is reused, needed for the match)
            if (frame & 2) {
                frame >>= 2;
                idx = frame + 1;
            } else {
                idx = frame >> 2;
                frame = idx + 1;
            }
            {
                u32 a = p[idx], b = p[frame];
                a *= 3;
                return (u16)((a + b) >> 2);
            }
        }
        return (u16)((p[frame >> 2] + p[(frame >> 2) + 1]) >> 1);
    }
    return p[frame >> 2];
}

void NNSi_G3dAnmObjInitNsBma(NNSG3dAnmObj *pAnmObj, void *pResAnm, const NNSG3dResMdl *pResMdl) {
    G3dResMatCAnm *pMatCAnm = pResAnm;
    G3dResMat *pMat = G3dGetResMat(pResMdl);
    u32 i;
    pAnmObj->funcAnm = (void *)gAnmCalcFuncNsBma;
    {
        u32 numMat = pResMdl->info.numMat;
        pAnmObj->numMapData = numMat;
        MIi_CpuClear16(0, pAnmObj->mapData, numMat * sizeof(u16));
    }
    for (i = 0; i < pMatCAnm->dict.numEntry; i++) {
        const NNSG3dResName *pName = G3dGetResNameByIdx(&pMatCAnm->dict, i);
        int matID = pMat ? NNS_G3dGetResDictIdxByName(&pMat->dict, pName) : -1;
        if (matID >= 0) {
            pAnmObj->mapData[matID] = i | G3D_ANMOBJ_MAPDATA_EXISTS;
        }
    }
}

// bit 15 of a colour word (GX_*_VTXCOLOR / GX_SPECULAR_USE_SHININESS) is kept by the animation
static inline u32 KeepBit15(u32 prm) {
    return (prm & 0x8000) != 0;
}

// the calls below see the colour getters with an int frame and a u32 result (needed for the match)
typedef u32 (*GetMatColAnmValueFunc)(G3dResMatCAnm *pAnm, u32 info, int frame);
#define GET_COLOR(info) ((GetMatColAnmValueFunc)GetMatColAnmValue_)(pMatCAnm, info, frame)
#define GET_ALPHA(info) ((GetMatColAnmValueFunc)GetMatColAnmuAlphaValue_)(pMatCAnm, info, frame)

void NNSi_G3dAnmCalcNsBma(G3dMatAnmResult *pResult, const NNSG3dAnmObj *pAnmObj, u32 dataIdx) {
    G3dResMatCAnm *pMatCAnm = pAnmObj->resAnm;
    int frame = pAnmObj->frame >> FX32_SHIFT;
    NNSG3dResDict *pDict = &pMatCAnm->dict;
    u32 *pData; // G3dResMatCAnmData
    u32 col0, col1;
    u32 dictAddr = (u32)pDict; // compared as an integer (needed for the match)
    if (dictAddr && (u32)pMatCAnm->dict.numEntry > (u32)(u16)dataIdx) {
        u16 ofsEntry = pMatCAnm->dict.ofsEntry;
        u16 sizeUnit = *(u16 *)((u8 *)pDict + ofsEntry);
        pData = (u32 *)((u8 *)pDict + ofsEntry + 4 + sizeUnit * (u16)dataIdx);
    } else {
        pData = NULL;
    }
    col0 = GET_COLOR(pData[0] /* diffuse */);
    col1 = GET_COLOR(pData[1] /* ambient */);
    pResult->prmMatColor0 = (col0 | (col1 << 16)) | (KeepBit15(pResult->prmMatColor0) << 15);
    col0 = GET_COLOR(pData[3] /* emission */);
    col1 = GET_COLOR(pData[2] /* specular */);
    pResult->prmMatColor1 = (col1 | (col0 << 16)) | (KeepBit15(pResult->prmMatColor1) << 15);
    {
        u32 alpha = GET_ALPHA(pData[4] /* polygonAlpha */);
        pResult->prmPolygonAttr = (pResult->prmPolygonAttr & ~REG_G3_POLYGON_ATTR_ALPHA_MASK) | (alpha << REG_G3_POLYGON_ATTR_ALPHA_SHIFT);
    }
}
