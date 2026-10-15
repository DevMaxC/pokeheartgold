#include <nitro.h>
#include <nnsys/g3d_anm_mat_internal.h>

#pragma force_active on

// stored scale value: the scale and its inverse
typedef struct ScaleFx32 {
    fx32 scale;
    fx32 invScale;
} ScaleFx32;

typedef struct ScaleFx16 {
    fx16 scale;
    fx16 invScale;
} ScaleFx16;

// scale of a frame from a key frame track (pVal[0] scale, pVal[1] its inverse), interpolated linearly
// between the stored values
void getScaleDataEx_(fx32 *pVal, fx32 frame, const u32 *pData, const G3dResJntAnm *pJntAnm) {
    u8 *pValues;
    u32 idx;
    idx = frame >> FX32_SHIFT;
    pValues = (u8 *)pJntAnm + pData[1];
    u32 info = pData[0];
    u32 next;
    int factor, shift;
    if (pJntAnm->numFrame - 1 == (frame >> FX32_SHIFT)) {
        // the last frame
        if (info & G3D_ANM_TRACK_STEP_MASK) {
            if (info & G3D_ANM_TRACK_STEP_2) {
                idx = (idx & 1) + (idx >> 1);
            } else {
                idx = (idx & 3) + (idx >> 2);
            }
        }
        if (pJntAnm->flag & G3D_RESJNTANM_FLAG_LOOP) {
            next = 0;
        } else {
            if (info & G3D_JNTANM_TRACK_FX16) {
                ScaleFx16 *p = (ScaleFx16 *)pValues;
                pVal[0] = p[idx].scale;
                pVal[1] = p[idx].invScale;
            } else {
                ScaleFx32 *p = (ScaleFx32 *)pValues;
                pVal[0] = p[idx].scale;
                pVal[1] = p[idx].invScale;
            }
            return;
        }
        goto step1;
    }
    if (info & G3D_ANM_TRACK_STEP_MASK) {
        u32 last = (info & G3D_ANM_TRACK_LAST_MASK) >> G3D_ANM_TRACK_LAST_SHIFT;
        if (info & G3D_ANM_TRACK_STEP_2) {
            if (idx >= last) {
                idx = last >> 1;
                next = idx + 1;
                goto step1;
            }
            idx >>= 1;
            next = idx + 1;
            frame &= 0x1FFF;
            factor = 2;
            shift = 1;
            goto interpolate;
        } else {
            if (idx >= last) {
                idx = (idx & 3) + (idx >> 2);
                next = idx + 1;
                goto step1;
            }
            idx >>= 2;
            next = idx + 1;
            frame &= 0x3FFF;
            factor = 4;
            shift = 2;
            goto interpolate;
        }
    }
    next = idx + 1;
step1:
    frame &= FX32_DEC_MASK;
    factor = 1;
    shift = 0;
interpolate: {
    int scale0, invScale0, scale1, invScale1;
    if (info & G3D_JNTANM_TRACK_FX16) {
        ScaleFx16 *p = (ScaleFx16 *)pValues;
        scale0 = p[idx].scale;
        invScale0 = p[idx].invScale;
        scale1 = p[next].scale;
        invScale1 = p[next].invScale;
    } else {
        ScaleFx32 *p = (ScaleFx32 *)pValues;
        scale0 = p[idx].scale;
        invScale0 = p[idx].invScale;
        scale1 = p[next].scale;
        invScale1 = p[next].invScale;
    }
    pVal[0] = (scale0 * factor + ((frame * (scale1 - scale0)) >> FX32_SHIFT)) >> shift;
    pVal[1] = (invScale0 * factor + ((frame * (invScale1 - invScale0)) >> FX32_SHIFT)) >> shift;
}
}

// third row of a rotation matrix given as two rows: their cross product (unsigned products needed for
// the match)
#define ROT_ROW2_FROM_CROSS(rows)                                                                           \
    {                                                                                                       \
        fx32 x, y, z;                                                                                       \
        x = (s32)((u32)(rows)[0].y * (u32)(rows)[1].z - (u32)(rows)[0].z * (u32)(rows)[1].y) >> FX32_SHIFT; \
        y = (s32)((u32)(rows)[0].z * (u32)(rows)[1].x - (u32)(rows)[0].x * (u32)(rows)[1].z) >> FX32_SHIFT; \
        z = (s32)((u32)(rows)[0].x * (u32)(rows)[1].y - (u32)(rows)[0].y * (u32)(rows)[1].x) >> FX32_SHIFT; \
        (rows)[2].x = x;                                                                                    \
        (rows)[2].y = y;                                                                                    \
        (rows)[2].z = z;                                                                                    \
    }

// rotation of a frame from a key frame track of rotation indices (pRot: MtxFx33); frames between the
// stored rotations are averaged and normalised
void getRotData_(fx32 *pRot, fx32 frame, const u32 *pData, const G3dResJntAnm *pJntAnm) {
    VecFx32 rows1[3], rowsAvg[3];
    u32 ofsRot5, ofsRot3;
    u16 *pIdx;
    u32 info, idx0;
    register int twoRows;
    register u32 idx;
    VecFx32 *rows = (VecFx32 *)pRot;
    info = pData[0];
    idx = frame >> FX32_SHIFT;
    pIdx = (u16 *)((u8 *)pJntAnm + pData[1]);
    ofsRot3 = pJntAnm->ofsRot3;
    ofsRot5 = pJntAnm->ofsRot5;
    if (info & G3D_ANM_TRACK_STEP_MASK) {
        u32 last = (info & G3D_ANM_TRACK_LAST_MASK) >> G3D_ANM_TRACK_LAST_SHIFT;
        if (info & G3D_ANM_TRACK_STEP_2) {
            if (idx & 1) {
                if (idx > last) {
                    idx = (last >> 1) + 1;
                    goto direct;
                }
                idx0 = idx >> 1;
                goto average;
            }
            idx >>= 1;
            goto direct;
        } else {
            u32 step = idx & 3;
            if (step) {
                if (idx > last) {
                    idx = step + (last >> 2);
                    goto direct;
                }
                if (idx & 1) {
                    // a quarter between two rotations: 3/4 of the nearer one
                    u32 idx1;
                    twoRows = 0;
                    if (idx & 2) {
                        idx0 = idx >> 2;
                        idx1 = idx0 + 1;
                    } else {
                        idx1 = idx >> 2;
                        idx0 = idx1 + 1;
                    }
                    twoRows |= getRotDataByIdx_(pRot, (s16 *)((u8 *)pJntAnm + ofsRot3), (s16 *)((u8 *)pJntAnm + ofsRot5), pIdx[idx1]);
                    twoRows |= getRotDataByIdx_((fx32 *)rows1, (s16 *)((u8 *)pJntAnm + ofsRot3), (s16 *)((u8 *)pJntAnm + ofsRot5), pIdx[idx0]);
                    rows[0].x = (s32)(3U * (u32)rows[0].x + (u32)rows1[0].x);
                    rows[0].y = (s32)(3U * (u32)rows[0].y + (u32)rows1[0].y);
                    rows[0].z = (s32)(3U * (u32)rows[0].z + (u32)rows1[0].z);
                    rows[1].x = (s32)(3U * (u32)rows[1].x + (u32)rows1[1].x);
                    rows[1].y = (s32)(3U * (u32)rows[1].y + (u32)rows1[1].y);
                    rows[1].z = (s32)(3U * (u32)rows[1].z + (u32)rows1[1].z);
                    VEC_Normalize(&rows[0], &rows[0]);
                    VEC_Normalize(&rows[1], &rows[1]);
                    if (!twoRows) {
                        rows[2].x = (s32)(3U * (u32)rows[2].x + (u32)rows1[2].x);
                        rows[2].y = (s32)(3U * (u32)rows[2].y + (u32)rows1[2].y);
                        rows[2].z = (s32)(3U * (u32)rows[2].z + (u32)rows1[2].z);
                        VEC_Normalize(&rows[2], &rows[2]);
                        return;
                    }
                    ROT_ROW2_FROM_CROSS(rows);
                    return;
                }
                idx0 = idx >> 2;
                goto average;
            }
            idx >>= 2;
            goto direct;
        }
    }
    goto direct;
average:
    twoRows = 0;
    twoRows |= getRotDataByIdx_(pRot, (s16 *)((u8 *)pJntAnm + ofsRot3), (s16 *)((u8 *)pJntAnm + ofsRot5), pIdx[idx0]);
    twoRows |= getRotDataByIdx_((fx32 *)rowsAvg, (s16 *)((u8 *)pJntAnm + ofsRot3), (s16 *)((u8 *)pJntAnm + ofsRot5), pIdx[idx0 + 1]);
    rows[0].x = (s32)((u32)rows[0].x + (u32)rowsAvg[0].x);
    rows[0].y = (s32)((u32)rows[0].y + (u32)rowsAvg[0].y);
    rows[0].z = (s32)((u32)rows[0].z + (u32)rowsAvg[0].z);
    rows[1].x = (s32)((u32)rows[1].x + (u32)rowsAvg[1].x);
    rows[1].y = (s32)((u32)rows[1].y + (u32)rowsAvg[1].y);
    rows[1].z = (s32)((u32)rows[1].z + (u32)rowsAvg[1].z);
    VEC_Normalize(&rows[0], &rows[0]);
    VEC_Normalize(&rows[1], &rows[1]);
    if (!twoRows) {
        rows[2].x = (s32)((u32)rows[2].x + (u32)rowsAvg[2].x);
        rows[2].y = (s32)((u32)rows[2].y + (u32)rowsAvg[2].y);
        rows[2].z = (s32)((u32)rows[2].z + (u32)rowsAvg[2].z);
        VEC_Normalize(&rows[2], &rows[2]);
        return;
    }
    ROT_ROW2_FROM_CROSS(rows);
    return;
direct:
    twoRows = getRotDataByIdx_(pRot, (s16 *)((u8 *)pJntAnm + ofsRot3), (s16 *)((u8 *)pJntAnm + ofsRot5), pIdx[idx]);
    if (twoRows) {
        ROT_ROW2_FROM_CROSS(rows);
    } else {
        VEC_Normalize(&rows[2], &rows[2]);
    }
    return;
}

#define MTX_ROW2_FROM_CROSS(m)                                         \
    {                                                                  \
        fx32 x, y, z;                                                  \
        x = ((m)->_01 * (m)->_12 - (m)->_02 * (m)->_11) >> FX32_SHIFT; \
        y = ((m)->_02 * (m)->_10 - (m)->_00 * (m)->_12) >> FX32_SHIFT; \
        z = ((m)->_00 * (m)->_11 - (m)->_01 * (m)->_10) >> FX32_SHIFT; \
        (m)->_20 = x;                                                  \
        (m)->_21 = y;                                                  \
        (m)->_22 = z;                                                  \
    }

// rotation of a frame from a key frame track of rotation indices (pRot: MtxFx33), interpolated linearly
// between the stored rotations and normalised
void getRotDataEx_(fx32 *pRot, fx32 frame, const u32 *pData, const G3dResJntAnm *pJntAnm) {
    MtxFx33 rot0, rot1;
    u32 ofsRot5;
    u32 ofsRot3, next;
    int frac, factor;
    u16 *pIdx;
    u32 idx, info;
    int twoRows;
    MtxFx33 *pMtx = (MtxFx33 *)pRot;
    ofsRot3 = pData[1]; // the register is reused (needed for the match)
    pIdx = (u16 *)((u8 *)pJntAnm + ofsRot3);
    idx = frame >> FX32_SHIFT;
    ofsRot3 = pJntAnm->ofsRot3;
    ofsRot5 = pJntAnm->ofsRot5;
    info = pData[0];
    if (pJntAnm->numFrame - 1 == (frame >> FX32_SHIFT)) {
        // the last frame
        if (info & G3D_ANM_TRACK_STEP_MASK) {
            if (info & G3D_ANM_TRACK_STEP_2) {
                idx = (idx & 1) + (idx >> 1);
            } else {
                idx = (idx & 3) + (idx >> 2);
            }
        }
        if (pJntAnm->flag & G3D_RESJNTANM_FLAG_LOOP) {
            next = 0;
        } else {
            twoRows = getRotDataByIdx_(pRot, (s16 *)((u8 *)pJntAnm + ofsRot3), (s16 *)((u8 *)pJntAnm + ofsRot5), pIdx[idx]);
            if (twoRows) {
                MTX_ROW2_FROM_CROSS(pMtx);
            } else {
                VEC_Normalize((VecFx32 *)&pMtx->_20, (VecFx32 *)&pMtx->_20);
            }
            return;
        }
        goto step1;
    }
    if (info & G3D_ANM_TRACK_STEP_MASK) {
        u32 last = (info & G3D_ANM_TRACK_LAST_MASK) >> G3D_ANM_TRACK_LAST_SHIFT;
        if (info & G3D_ANM_TRACK_STEP_2) {
            if (idx >= last) {
                idx = last >> 1;
                next = idx + 1;
                goto step1;
            }
            idx >>= 1;
            next = idx + 1;
            frac = frame & 0x1FFF;
            factor = 2;
            goto interpolate;
        } else {
            if (idx >= last) {
                idx = (idx & 3) + (idx >> 2);
                next = idx + 1;
                goto step1;
            }
            idx >>= 2;
            next = idx + 1;
            frac = frame & 0x3FFF;
            factor = 4;
            goto interpolate;
        }
    }
    next = idx + 1;
step1:
    frac = frame & FX32_DEC_MASK;
    factor = 1;
interpolate:
    twoRows = 0;
    twoRows |= getRotDataByIdx_(rot0.a, (s16 *)((u8 *)pJntAnm + ofsRot3), (s16 *)((u8 *)pJntAnm + ofsRot5), pIdx[idx]);
    twoRows |= getRotDataByIdx_(rot1.a, (s16 *)((u8 *)pJntAnm + ofsRot3), (s16 *)((u8 *)pJntAnm + ofsRot5), pIdx[next]);
    pMtx->_00 = rot0._00 * factor + ((frac * (rot1._00 - rot0._00)) >> FX32_SHIFT);
    pMtx->_01 = rot0._01 * factor + ((frac * (rot1._01 - rot0._01)) >> FX32_SHIFT);
    pMtx->_02 = rot0._02 * factor + ((frac * (rot1._02 - rot0._02)) >> FX32_SHIFT);
    pMtx->_10 = rot0._10 * factor + ((frac * (rot1._10 - rot0._10)) >> FX32_SHIFT);
    pMtx->_11 = rot0._11 * factor + ((frac * (rot1._11 - rot0._11)) >> FX32_SHIFT);
    pMtx->_12 = rot0._12 * factor + ((frac * (rot1._12 - rot0._12)) >> FX32_SHIFT);
    VEC_Normalize((VecFx32 *)pMtx, (VecFx32 *)pMtx);
    VEC_Normalize((VecFx32 *)&pMtx->_10, (VecFx32 *)&pMtx->_10);
    if (!twoRows) {
        pMtx->_20 = rot0._20 * factor + ((frac * (rot1._20 - rot0._20)) >> FX32_SHIFT);
        pMtx->_21 = rot0._21 * factor + ((frac * (rot1._21 - rot0._21)) >> FX32_SHIFT);
        pMtx->_22 = rot0._22 * factor + ((frac * (rot1._22 - rot0._22)) >> FX32_SHIFT);
        VEC_Normalize((VecFx32 *)&pMtx->_20, (VecFx32 *)&pMtx->_20);
        return;
    }
    MTX_ROW2_FROM_CROSS(pMtx);
}

// one compressed rotation (pRot: MtxFx33). Index bit 15 set: pivot form (3 fx16 in pArrayRot3: pivot
// element, sign bits, A, B; the rest of the matrix is zero). Otherwise two rows (5 fx16 in pArrayRot5,
// 13-bit values whose low 3 bits together make the sixth); returns TRUE then, the caller computes the
// third row.
#pragma push
#pragma opt_common_subs off

BOOL getRotDataByIdx_(fx32 *restrict pRot, const void *pArrayRot3, const void *pArrayRot5, u32 info) {
    s32 mode;
    s16 c;
    if (info & 0x8000) {
        s32 pivot;
        const s16 *p;
        u32 j;
        pRot[8] = 0;
        pRot[7] = 0;
        pRot[6] = 0;
        pRot[5] = 0;
        pRot[4] = 0;
        pRot[3] = 0;
        pRot[2] = 0;
        pRot[1] = 0;
        pRot[0] = 0;
        info &= 0x7FFF;
        info += info << 1;
        p = (const s16 *)pArrayRot3 + info;
        mode = p[0];
        s32 a = p[1];
        info = p[2]; // B (register reused, needed for the match)
        if (mode & 0x10) {
            pivot = -FX32_ONE;
        } else {
            pivot = FX32_ONE;
        }
        mode &= 0xF;
        int i = gJntAnmPivotMtxIndices[mode][0];
        pRot[mode] = pivot;
        j = gJntAnmPivotMtxIndices[mode][1];
        pRot[i] = a;
        pRot[j] = info;
        if (p[0] & 0x20) {
            info = -info;
        }
        pRot[gJntAnmPivotMtxIndices[mode][2]] = info;
        if (p[0] & 0x40) {
            a = -a;
        }
        pRot[gJntAnmPivotMtxIndices[mode][3]] = a;
        return FALSE;
    } else {
        s32 x0, x1, x2, x3, x4;
        const s16 *p;
        info &= 0x7FFF;
        info += info << 2;
        p = (const s16 *)pArrayRot5 + info;
        x4 = p[4];
        pRot[4] = x4 >> 3;
        x0 = p[0];
        pRot[0] = x0 >> 3;
        c = (s16)(x4 & 7);
        c = ((x0 & 7) | (c << 3));
        x1 = p[1];
        pRot[1] = x1 >> 3;
        c = (s16)((x1 & 7) | (c << 3));
        x2 = p[2];
        pRot[2] = x2 >> 3;
        x3 = p[3];
        pRot[3] = x3 >> 3;
        c = (s16)((x2 & 7) | (c << 3));
        c = (s16)((x3 & 7) | (c << 3));
        pRot[5] = (s32)((s32)c << 19) >> 19;
        return TRUE;
    }
}

#pragma pop
