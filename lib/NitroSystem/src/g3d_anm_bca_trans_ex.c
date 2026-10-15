#include <nitro.h>
#include <nnsys/g3d_anm_mat_internal.h>

#pragma force_active on

// translation of a frame from a key frame track, interpolated linearly between the stored values
void getTransDataEx_(fx32 *pVal, fx32 frame, const u32 *pData, const G3dResJntAnm *pJntAnm) {
    const u8 *pValues;
    u32 idx, ofs;
    ofs = pData[1];
    idx = frame >> FX32_SHIFT;
    pValues = (const u8 *)pJntAnm + ofs;
    u32 info = pData[0];
    int factor, shift;
    u32 last;
    s32 a, b;
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
            u32 frac = frame & FX32_DEC_MASK;
            s32 val, first;
            if (info & G3D_JNTANM_TRACK_FX16) {
                val = ((s16 *)pValues)[idx];
                first = ((s16 *)pValues)[0];
            } else {
                val = ((s32 *)pValues)[idx];
                first = ((s32 *)pValues)[0];
            }
            *pVal = val + ((s32)(frac * (first - val)) >> FX32_SHIFT);
        } else {
            s32 val;
            if (info & G3D_JNTANM_TRACK_FX16) {
                val = ((s16 *)pValues)[idx];
            } else {
                val = ((s32 *)pValues)[idx];
            }
            *pVal = val;
        }
        return;
    }
    if (info & G3D_ANM_TRACK_STEP_MASK) {
        last = (info & G3D_ANM_TRACK_LAST_MASK) >> G3D_ANM_TRACK_LAST_SHIFT;
        if (info & G3D_ANM_TRACK_STEP_2) {
            if (idx >= last) {
                idx = last >> 1;
                goto step1;
            }
            idx >>= 1;
            frame &= 0x1FFF;
            factor = 2;
            shift = 1;
            goto interpolate;
        }
        if (idx >= last) {
            idx = (idx & 3) + (idx >> 2);
            goto step1;
        }
        idx >>= 2;
        frame &= 0x3FFF;
        factor = 4;
        shift = 2;
        goto interpolate;
    }
step1:
    frame &= FX32_DEC_MASK;
    factor = 1;
    shift = 0;
interpolate:
    if (info & G3D_JNTANM_TRACK_FX16) {
        a = ((s16 *)pValues)[idx];
        b = ((s16 *)pValues)[idx + 1];
    } else {
        a = ((s32 *)pValues)[idx];
        b = ((s32 *)pValues)[idx + 1];
    }
    *pVal = (a * factor + ((frame * (b - a)) >> FX32_SHIFT)) >> shift;
}
