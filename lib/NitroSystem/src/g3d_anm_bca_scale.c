#include <nitro.h>
#include <nnsys/g3d_anm_mat_internal.h>

#pragma force_active on

// scale of a frame from a key frame track: pVal[0] scale, pVal[1] its inverse; frames between the
// stored values are averaged
#pragma opt_propagation off

void getScaleData_(fx32 *pVal, fx32 frame, const u32 *pData, const G3dResJntAnm *pJntAnm) {
    u32 info;
    u32 idx = (u32)(frame >> FX32_SHIFT);
    const u8 *pValues = (const u8 *)pJntAnm + pData[1];
    u32 last, idx0, idx1, step;
    info = pData[0];
    if (info & G3D_ANM_TRACK_STEP_MASK) {
        last = (info & G3D_ANM_TRACK_LAST_MASK) >> G3D_ANM_TRACK_LAST_SHIFT;
        if (info & G3D_ANM_TRACK_STEP_2) {
            if (idx & 1) {
                if (idx > last) {
                    idx = (last >> 1) + 1;
                    goto direct;
                }
                idx0 = idx >> 1;
                goto half;
            }
            idx >>= 1;
            goto direct;
        }
        step = idx & 3;
        if (step) {
            if (idx > last) {
                idx = (last >> 2) + step;
                goto direct;
            }
            if (idx & 1) {
                // a quarter between two values: 3/4 of the nearer one
                if (idx & 2) {
                    idx1 = idx >> 2;
                    idx0 = idx1 + 1;
                } else {
                    idx0 = idx >> 2;
                    idx1 = idx0 + 1;
                }
                if (info & G3D_JNTANM_TRACK_FX16) {
                    const s16 *p = (const s16 *)pValues;
                    {
                        s32 a = p[idx0 * 2];
                        s32 b = p[idx1 * 2];
                        a = a * 3 + b;
                        pVal[0] = a >> 2;
                    }
                    {
                        s32 a = p[idx0 * 2 + 1];
                        s32 b = p[idx1 * 2 + 1];
                        a = a * 3 + b;
                        pVal[1] = a >> 2;
                    }
                } else {
                    const s32 *p = (const s32 *)pValues;
                    {
                        s32 b = p[idx1 * 2];
                        s32 a = p[idx0 * 2];
                        pVal[0] = (s32)(((s64)a * 3 - -(s64)b) >> 2); // "- -" needed for the match
                    }
                    {
                        s32 a = p[idx0 * 2 + 1];
                        pVal[1] = (s32)(((s64)a * 3 + p[idx1 * 2 + 1]) >> 2);
                    }
                }
                return;
            }
            idx0 = idx >> 2;
            goto half;
        }
        idx >>= 2;
    }
direct:
    if (info & G3D_JNTANM_TRACK_FX16) {
        const s16 *p = (const s16 *)pValues;
        pVal[0] = p[idx * 2];
        pVal[1] = p[idx * 2 + 1];
    } else {
        const s32 *p = (const s32 *)pValues;
        pVal[0] = p[idx * 2];
        pVal[1] = p[idx * 2 + 1];
    }
    return;
half:
    if (info & G3D_JNTANM_TRACK_FX16) {
        const s16 *p = (const s16 *)pValues;
        pVal[0] = (p[idx0 * 2] + p[idx0 * 2 + 2]) >> 1;
        pVal[1] = (p[idx0 * 2 + 1] + p[idx0 * 2 + 3]) >> 1;
    } else {
        const s32 *p = (const s32 *)pValues;
        pVal[0] = (p[idx0 * 2] + p[idx0 * 2 + 2]) >> 1;
        pVal[1] = (p[idx0 * 2 + 1] + p[idx0 * 2 + 3]) >> 1;
    }
    return;
}

#pragma opt_propagation reset
