#include <nitro.h>
#include <nnsys/g3d_render_internal.h>

#pragma force_active on

// applies every enabled material animation of the list in turn (the last one wins per field)
BOOL NNSi_G3dAnmBlendMat(struct NNSG3dMatAnmResult_ *pResult, const NNSG3dAnmObj *pAnmObj, u32 matID) {
    BOOL result = FALSE;
    if (!pAnmObj) {
        return result;
    }
    do {
        if (matID < pAnmObj->numMapData) {
            u16 mapData = pAnmObj->mapData[matID];
            if ((mapData & (G3D_ANMOBJ_MAPDATA_EXISTS | G3D_ANMOBJ_MAPDATA_DISABLED)) == G3D_ANMOBJ_MAPDATA_EXISTS && pAnmObj->funcAnm) {
                ((G3dFuncAnmMat)pAnmObj->funcAnm)(pResult, pAnmObj, mapData & 0xFF);
                result = TRUE;
            }
        }
        pAnmObj = pAnmObj->next;
    } while (pAnmObj);
    return result;
}

void blendScaleVec_(VecFx32 *pDst, const VecFx32 *pSrc, fx32 ratio, BOOL isOne) {
    if (isOne) {
        pDst->x += ratio;
        pDst->y += ratio;
        pDst->z += ratio;
        return;
    }
    pDst->x += (ratio * pSrc->x) >> FX32_SHIFT;
    pDst->y += (ratio * pSrc->y) >> FX32_SHIFT;
    pDst->z += (ratio * pSrc->z) >> FX32_SHIFT;
}

static inline BOOL IsEnabled(const NNSG3dAnmObj *pAnmObj, u32 nodeID) {
    return nodeID < pAnmObj->numMapData && (pAnmObj->mapData[nodeID] & (G3D_ANMOBJ_MAPDATA_EXISTS | G3D_ANMOBJ_MAPDATA_DISABLED)) == G3D_ANMOBJ_MAPDATA_EXISTS;
}

static inline fx32 MulFx32(fx32 a, fx32 b) {
    return (fx32)(((s64)a * b) >> FX32_SHIFT);
}

// weighted sum of the enabled joint animations of the list (weights: their ratios, clamped to 0..1,
// normalised by their total); the rotation is re-orthonormalised afterwards
BOOL NNSi_G3dAnmBlendJnt(G3dJntAnmResult *pResult, const NNSG3dAnmObj *pAnmObj, u32 nodeID) {
    G3dJntAnmResult temp;
    VecFx32 firstRow0;
    VecFx32 firstRow2;
    const NNSG3dAnmObj *pLast;
    const NNSG3dAnmObj *p;
    fx32 sumRatio;
    int numEnabled;
    int iteration;
    if (!pAnmObj) {
        return FALSE;
    }
    if (!pAnmObj->next) {
        if (nodeID < pAnmObj->numMapData) {
            u16 mapData = pAnmObj->mapData[nodeID];
            if ((mapData & (G3D_ANMOBJ_MAPDATA_EXISTS | G3D_ANMOBJ_MAPDATA_DISABLED)) == G3D_ANMOBJ_MAPDATA_EXISTS) {
                if (!pAnmObj->funcAnm) {
                    return FALSE;
                }
                ((G3dFuncAnmJnt)pAnmObj->funcAnm)(pResult, pAnmObj, mapData & 0xFF);
                return TRUE;
            }
            return FALSE;
        }
        return FALSE;
    }
    sumRatio = 0;
    numEnabled = 0;
    iteration = 0;
    p = pAnmObj;
    pLast = pAnmObj;
    do {
        if (IsEnabled(p, nodeID)) {
            if (p->ratio > FX32_ONE) {
                sumRatio += FX32_ONE;
            } else if (p->ratio > 0) {
                sumRatio += p->ratio;
            }
            pLast = p;
            numEnabled++;
        }
    } while ((p = p->next) != NULL);
    if (sumRatio == 0) {
        return FALSE;
    }
    if (numEnabled == 1) {
        u16 mapData = pLast->mapData[nodeID];
        if (!pLast->funcAnm) {
            return FALSE;
        }
        ((G3dFuncAnmJnt)pLast->funcAnm)(pResult, pLast, mapData & 0xFF);
        return TRUE;
    }
    MIi_CpuClearFast(0, (u32 *)pResult, sizeof(G3dJntAnmResult));
    pResult->flag = ~0;
    p = pAnmObj;
    do {
        if (IsEnabled(p, nodeID) && p->ratio > 0 && p->funcAnm) {
            fx32 ratio;
            ((G3dFuncAnmJnt)p->funcAnm)(&temp, p, p->mapData[nodeID] & 0xFF);
            if (iteration == 0) {
                MIi_CpuCopy32((const u32 *)&temp.rotRows[0], (u32 *)&firstRow0, sizeof(VecFx32));
                MIi_CpuCopy32((const u32 *)&temp.rotRows[2], (u32 *)&firstRow2, sizeof(VecFx32));
            }
            if (sumRatio == FX32_ONE) {
                ratio = p->ratio;
            } else {
                ratio = FX_Div(p->ratio, sumRatio);
            }
            blendScaleVec_(&pResult->scale, &temp.scale, ratio, temp.flag & G3D_JNTANM_FLAG_SCALE_ONE);
            blendScaleVec_(&pResult->scaleEx0, &temp.scaleEx0, ratio, temp.flag & G3D_JNTANM_FLAG_SCALEEX0_ONE);
            blendScaleVec_(&pResult->scaleEx1, &temp.scaleEx1, ratio, temp.flag & G3D_JNTANM_FLAG_SCALEEX1_ONE);
            if (!(temp.flag & G3D_JNTANM_FLAG_TRANS_ZERO)) {
                pResult->trans.x += MulFx32(ratio, temp.trans.x);
                pResult->trans.y += MulFx32(ratio, temp.trans.y);
                pResult->trans.z += MulFx32(ratio, temp.trans.z);
            }
            if (!(temp.flag & G3D_JNTANM_FLAG_ROT_ZERO)) {
                pResult->rotRows[0].x += (ratio * temp.rotRows[0].x) >> FX32_SHIFT;
                pResult->rotRows[0].y += (ratio * temp.rotRows[0].y) >> FX32_SHIFT;
                pResult->rotRows[0].z += (ratio * temp.rotRows[0].z) >> FX32_SHIFT;
                pResult->rotRows[1].x += (ratio * temp.rotRows[1].x) >> FX32_SHIFT;
                pResult->rotRows[1].y += (ratio * temp.rotRows[1].y) >> FX32_SHIFT;
                pResult->rotRows[1].z += (ratio * temp.rotRows[1].z) >> FX32_SHIFT;
            } else {
                pResult->rotRows[0].x += ratio;
                pResult->rotRows[1].y += ratio;
            }
            pResult->flag &= temp.flag;
        }
        p = p->next;
        iteration++;
    } while (p);
    VEC_CrossProduct(&pResult->rotRows[0], &pResult->rotRows[1], &pResult->rotRows[2]);
    if (pResult->rotRows[0].x == 0 && pResult->rotRows[0].y == 0 && pResult->rotRows[0].z == 0) {
        MIi_CpuCopy32((const u32 *)&firstRow0, (u32 *)&pResult->rotRows[0], sizeof(VecFx32));
    } else {
        VEC_Normalize(&pResult->rotRows[0], &pResult->rotRows[0]);
    }
    if (pResult->rotRows[2].x == 0 && pResult->rotRows[2].y == 0 && pResult->rotRows[2].z == 0) {
        MIi_CpuCopy32((const u32 *)&firstRow2, (u32 *)&pResult->rotRows[2], sizeof(VecFx32));
    } else {
        VEC_Normalize(&pResult->rotRows[2], &pResult->rotRows[2]);
    }
    VEC_CrossProduct(&pResult->rotRows[2], &pResult->rotRows[0], &pResult->rotRows[1]);
    return TRUE;
}

// ORs the visibility of every enabled visibility animation of the list
BOOL NNSi_G3dAnmBlendVis(u32 *pResult, const NNSG3dAnmObj *pAnmObj, u32 nodeID) {
    u32 visible;
    BOOL result = FALSE;
    *pResult = 0;
    do {
        if (nodeID < pAnmObj->numMapData) {
            u16 mapData = pAnmObj->mapData[nodeID];
            if ((mapData & (G3D_ANMOBJ_MAPDATA_EXISTS | G3D_ANMOBJ_MAPDATA_DISABLED)) == G3D_ANMOBJ_MAPDATA_EXISTS && pAnmObj->funcAnm) {
                ((G3dFuncAnmVis)pAnmObj->funcAnm)(&visible, pAnmObj, mapData & 0xFF);
                *pResult |= visible;
                result = TRUE;
            }
        }
        pAnmObj = pAnmObj->next;
    } while (pAnmObj);
    return result;
}

#pragma force_active off
