#include <nitro.h>
#include <nnsys/g3d_anm_mat_internal.h>

#pragma force_active on

// rotation of a frame from a texture SRT track: sine in the low, cosine in the high 16 bits; frames
// between the stored values are averaged per half
u32 GetTexSRTAnmSinCosVal_(const void *pAnm, u32 info, u32 data, u32 frame) {
    const u8 *pValues;
    u32 last, idx0, idx1;
    const s16 *p;
    if (info & G3D_TEXSRTANM_TRACK_CONST) {
        return data;
    }
    pValues = (const u8 *)pAnm + data;
    if (info & G3D_ANM_TRACK_STEP_MASK) {
        last = (u16)info;
        if (info & G3D_ANM_TRACK_STEP_2) {
            if (frame & 1) {
                if (frame > last) {
                    frame = (last >> 1) + 1;
                    goto direct;
                }
                idx0 = frame >> 1;
                goto half;
            }
            frame >>= 1;
            goto direct;
        }
        if (frame & 3) {
            if (frame > last) {
                frame = (frame & 3) + (last >> 2);
                goto direct;
            }
            if (frame & 1) {
                // a quarter between two values: 3/4 of the nearer one
                if (frame & 2) {
                    idx1 = frame >> 2;
                    idx0 = idx1 + 1;
                } else {
                    idx0 = frame >> 2;
                    idx1 = idx0 + 1;
                }
                {
                    const s16 *p = (const s16 *)pValues;
                    s32 cos3 = p[idx0 * 2 + 1] * 3;
                    s32 cos = (cos3 + p[idx1 * 2 + 1]) >> 2;
                    s32 sin3 = p[idx0 * 2] * 3;
                    s32 sin = (sin3 + p[idx1 * 2]) >> 2;
                    return (u16)sin | (cos << 16);
                }
            }
            idx0 = frame >> 2;
            goto half;
        }
        frame >>= 2;
    }
direct:
    return ((const u32 *)pValues)[frame];
half:
    p = (const s16 *)pValues;
    return (u16)((p[idx0 * 2] + p[idx0 * 2 + 2]) >> 1) | (((p[idx0 * 2 + 1] + p[idx0 * 2 + 3]) >> 1) << 16);
}
