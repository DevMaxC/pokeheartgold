#include <nitro.h>
#include <nnsys/g3d_render_internal.h>

#pragma force_active on

void NNS_G3dGlbSetBaseTrans(const VecFx32 *pTrans) {
    if (!pTrans) {
        return;
    }
    NNS_G3dGlb.prmBaseTrans = *pTrans;
    NNS_G3dGlb.flag &= ~(NNS_G3D_GLB_FLAG_INVBASE_UPTODATE | NNS_G3D_GLB_FLAG_INVBASECAMERA_UPTODATE | NNS_G3D_GLB_FLAG_BASECAMERA_UPTODATE);
}

void NNS_G3dGlbSetBaseScale(const VecFx32 *pScale) {
    if (!pScale) {
        return;
    }
    NNS_G3dGlb.prmBaseScale = *pScale;
    NNS_G3dGlb.flag &= ~(NNS_G3D_GLB_FLAG_INVBASE_UPTODATE | NNS_G3D_GLB_FLAG_INVBASECAMERA_UPTODATE | NNS_G3D_GLB_FLAG_BASECAMERA_UPTODATE);
}

void NNS_G3dGlbLightVector(GXLightId lightID, fx16 x, fx16 y, fx16 z) {
    NNS_G3dGlb.lightVec[lightID] = (((u32)(x >> 3)) & 0x3FF) | ((((u32)(y >> 3)) & 0x3FF) << REG_G3_LIGHT_VECTOR_DECIMAL_Y_SHIFT) | ((((u32)(z >> 3)) & 0x3FF) << REG_G3_LIGHT_VECTOR_DECIMAL_Z_SHIFT) | ((u32)lightID << REG_G3_LIGHT_VECTOR_LNUM_SHIFT);
}

void NNS_G3dGlbLightColor(GXLightId lightID, GXRgb rgb) {
    NNS_G3dGlb.lightColor[lightID] = rgb | ((u32)lightID << REG_G3_LIGHT_COLOR_LNUM_SHIFT);
}

void NNS_G3dGlbMaterialColorDiffAmb(GXRgb diffuse, GXRgb ambient, BOOL IsSetVtxColor) {
    NNS_G3dGlb.prmMatColor0 = diffuse | ((u32)ambient << REG_G3_DIF_AMB_AMBIENT_RED_SHIFT) | ((IsSetVtxColor != FALSE) << REG_G3_DIF_AMB_C_SHIFT);
}

void NNS_G3dGlbMaterialColorSpecEmi(GXRgb specular, GXRgb emission, BOOL IsShininess) {
    NNS_G3dGlb.prmMatColor1 = specular | ((u32)emission << REG_G3_SPE_EMI_EMISSION_RED_SHIFT) | ((IsShininess != FALSE) << REG_G3_SPE_EMI_S_SHIFT);
}

void NNS_G3dGlbPolygonAttr(int light, GXPolygonMode polyMode, GXCull cullMode, int polygonID, int alpha, int misc) {
    NNS_G3dGlb.prmPolygonAttr = light | (polyMode << REG_G3_POLYGON_ATTR_PM_SHIFT) | (cullMode << REG_G3_POLYGON_ATTR_BK_SHIFT) | misc | (polygonID << REG_G3_POLYGON_ATTR_ID_SHIFT) | (alpha << REG_G3_POLYGON_ATTR_ALPHA_SHIFT);
}

MtxFx43 *NNS_G3dGlbGetInvV(void) {
    if (!(NNS_G3dGlb.flag & NNS_G3D_GLB_FLAG_INVCAMERA_UPTODATE)) {
        MTX_Inverse43(&NNS_G3dGlb.cameraMtx, &NNS_G3dGlb.invCameraMtx);
        NNS_G3dGlb.flag |= NNS_G3D_GLB_FLAG_INVCAMERA_UPTODATE;
    }
    return &NNS_G3dGlb.invCameraMtx;
}

static inline void SwapRows(fx32 *pRowA, fx32 *pRowB, fx32 *pOutRowA, fx32 *pOutRowB) {
    int k;
    for (k = 0; k < 4; k++) {
        fx32 t = pRowA[k];
        pRowA[k] = pRowB[k];
        pRowB[k] = t;
        t = pOutRowA[k];
        pOutRowA[k] = pOutRowB[k];
        pOutRowB[k] = t;
    }
}

static inline void ScaleRows(fx32 *pRow, fx32 *pOutRow, fx64c inverse) {
    int k;
    for (k = 0; k < 4; k++) {
        pRow[k] = (s32)(((u64)inverse * (u64)(s64)pRow[k] + 0x80000000ULL) >> 32);
        pOutRow[k] = (s32)(((u64)inverse * (u64)(s64)pOutRow[k] + 0x80000000ULL) >> 32);
    }
}

// Gauss-Jordan elimination with partial pivoting; -1 if the matrix is singular
int mtx_inverse44(const MtxFx44 *pSrc, MtxFx44 *pDst) {
    MtxFx44 copy;
    int i;
    int j;
    int pivot;
    fx32 maximum;
    fx32 x;
    fx64 f;
    int r;
    int k;
    MI_Copy64B(pSrc, &copy);
    MTX_Identity44_(pDst);
    for (i = 0; i < 4; i++) {
        pivot = i;
        maximum = 0;
        fx64c inverse;
        for (j = i; j < 4; j++) {
            x = copy.m[j][i];
            if (x < 0) {
                x = (s32)(0u - (u32)x);
            }
            if (x > maximum) {
                maximum = x;
                pivot = j;
            }
        }
        if (maximum == 0) {
            return -1;
        }
        if (pivot != i) {
            SwapRows(copy.m[i], copy.m[pivot], pDst->m[i], pDst->m[pivot]);
        }
        inverse = FX_InvFx64c(copy.m[i][i]);
        ScaleRows(copy.m[i], pDst->m[i], inverse);
        for (r = 0; r < 4; r++) {
            if (r != i) {
                f = copy.m[r][i];
                for (k = 0; k < 4; k++) {
                    copy.m[r][k] = (s32)((u32)copy.m[r][k] - (u32)(f * copy.m[i][k] >> FX32_SHIFT));
                    pDst->m[r][k] = (s32)((u32)pDst->m[r][k] - (u32)(f * pDst->m[i][k] >> FX32_SHIFT));
                }
            }
        }
    }
    return 0;
}

MtxFx44 *NNS_G3dGlbGetInvP(void) {
    if (!(NNS_G3dGlb.flag & NNS_G3D_GLB_FLAG_INVPROJ_UPTODATE)) {
        mtx_inverse44(&NNS_G3dGlb.projMtx, &NNS_G3dGlb.invProjMtx);
        NNS_G3dGlb.flag |= NNS_G3D_GLB_FLAG_INVPROJ_UPTODATE;
    }
    return &NNS_G3dGlb.invProjMtx;
}

// camera matrix with the base rotation and scale applied, and its inverse
void calcSrtCameraMtx_(void) {
    MTX_Concat43((MtxFx43 *)&NNS_G3dGlb.prmBaseRot, &NNS_G3dGlb.cameraMtx, &NNS_G3dGlb.srtCameraMtx);
    MTX_ScaleApply43(&NNS_G3dGlb.srtCameraMtx, &NNS_G3dGlb.srtCameraMtx, NNS_G3dGlb.prmBaseScale.x, NNS_G3dGlb.prmBaseScale.y, NNS_G3dGlb.prmBaseScale.z);
    MTX_Inverse43(&NNS_G3dGlb.srtCameraMtx, &NNS_G3dGlb.invSrtCameraMtx);
}

MtxFx43 *NNS_G3dGlbGetWV(void) {
    if (!(NNS_G3dGlb.flag & NNS_G3D_GLB_FLAG_SRTCAMERA_UPTODATE)) {
        calcSrtCameraMtx_();
        NNS_G3dGlb.flag |= NNS_G3D_GLB_FLAG_SRTCAMERA_UPTODATE;
    }
    return &NNS_G3dGlb.srtCameraMtx;
}

MtxFx43 *NNS_G3dGlbGetInvWV(void) {
    if (!(NNS_G3dGlb.flag & NNS_G3D_GLB_FLAG_SRTCAMERA_UPTODATE)) {
        calcSrtCameraMtx_();
        NNS_G3dGlb.flag |= NNS_G3D_GLB_FLAG_SRTCAMERA_UPTODATE;
    }
    return &NNS_G3dGlb.invSrtCameraMtx;
}

MtxFx44 *NNS_G3dGlbGetInvVP(void) {
    MtxFx44 invV;
    const MtxFx43 *pInvV;
    const MtxFx44 *pInvP;
    if (!(NNS_G3dGlb.flag & NNS_G3D_GLB_FLAG_INVCAMERAPROJ_UPTODATE)) {
        pInvV = NNS_G3dGlbGetInvV();
        pInvP = NNS_G3dGlbGetInvP();
        MTX_Copy43To44_(pInvV, &invV);
        MTX_Concat44(pInvP, &invV, &NNS_G3dGlb.invCameraProjMtx);
        NNS_G3dGlb.flag |= NNS_G3D_GLB_FLAG_INVCAMERAPROJ_UPTODATE;
    }
    return &NNS_G3dGlb.invCameraProjMtx;
}

void NNS_G3dGlbGetViewPort(u32 *x1, u32 *y1, u32 *x2, u32 *y2) {
    if (x1) {
        *x1 = NNS_G3dGlb.prmViewPort & 0xFF;
    }
    if (y1) {
        *y1 = (NNS_G3dGlb.prmViewPort >> 8) & 0xFF;
    }
    if (x2) {
        *x2 = (NNS_G3dGlb.prmViewPort >> 16) & 0xFF;
    }
    if (y2) {
        *y2 = (NNS_G3dGlb.prmViewPort >> 24) & 0xFF;
    }
}

#pragma force_active off
