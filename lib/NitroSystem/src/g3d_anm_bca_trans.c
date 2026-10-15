#include <nitro.h>
#include <nnsys/g3d_anm_mat_internal.h>

#pragma force_active on

// translation of a frame from a key frame track (pData: info word, data offset); frames between the
// stored values are averaged
void getTransData_(fx32 *pVal, fx32 frame, const u32 *pData, const G3dResJntAnm *pJntAnm) {
    u32 info;
    u32 last, idx0, idx1, step;
    u32 idx = (u32)(frame >> FX32_SHIFT);
    const u8 *pValues = (const u8 *)pJntAnm + pData[1];
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
                        s32 a = p[idx0];
                        *pVal = (a * 3 + p[idx1]) >> 2;
                    }
                } else {
                    const s32 *p = (const s32 *)pValues;
                    {
                        s32 a = p[idx0];
                        *pVal = (s32)(((s64)a * 3 + p[idx1]) >> 2);
                    }
                }
                return;
            }
            idx0 = idx >> 2;
        } else {
            idx >>= 2;
            goto direct;
        }
half:
        if (info & G3D_JNTANM_TRACK_FX16) {
            const s16 *p = (const s16 *)pValues;
            *pVal = (p[idx0] + p[idx0 + 1]) >> 1;
        } else {
            const s32 *p = (const s32 *)pValues;
            *pVal = (p[idx0] >> 1) + (p[idx0 + 1] >> 1);
        }
        return;
    }
direct:
    if (info & G3D_JNTANM_TRACK_FX16) {
        *pVal = ((const s16 *)pValues)[idx];
    } else {
        *pVal = ((const s32 *)pValues)[idx];
    }
}
