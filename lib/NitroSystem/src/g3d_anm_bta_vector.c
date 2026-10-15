#include <nitro.h>
#include <nnsys/g3d_anm_mat_internal.h>

#pragma force_active on

// scale or translation of a frame from a texture SRT track (info: G3D_ANM_TRACK_* bits, low 16 bits the
// last frame stored at every step; data: the value, or the offset of the values from the animation)
s32 GetTexSRTAnmVectorVal_(const void *pAnm, u32 info, u32 data, u32 frame) {
    u32 last;
    if (info & G3D_TEXSRTANM_TRACK_CONST) {
        return (s32)data;
    }
    pAnm = (const u8 *)pAnm + data; // the values (the parameter is reused, needed for the match)
    if (!(info & G3D_ANM_TRACK_STEP_MASK)) {
        goto direct;
    }
    last = (u16)info;
    if (info & G3D_ANM_TRACK_STEP_2) {
        if (frame & 1) {
            if (frame > last) {
                frame = (last >> 1) + 1;
                goto direct;
            }
            frame >>= 1;
            goto average;
        }
        frame >>= 1;
        goto direct;
    } else {
        u32 step = frame & 3;
        if (step) {
            if (frame > last) {
                frame = (last >> 2) + step;
                goto direct;
            }
            if (frame & 1) {
                // a quarter between two values: 3/4 of the nearer one
                u32 idx;
                s32 a, b;
                if (frame & 2) {
                    frame >>= 2;
                    idx = frame + 1;
                } else {
                    idx = frame >> 2;
                    frame = idx + 1;
                }
                if (!(info & G3D_TEXSRTANM_TRACK_FX16)) {
                    a = ((const s32 *)pAnm)[idx];
                    b = ((const s32 *)pAnm)[frame];
                } else {
                    a = ((const s16 *)pAnm)[idx];
                    b = ((const s16 *)pAnm)[frame];
                }
                a *= 3;
                a += b;
                return a >> 2;
            }
            frame >>= 2;
            goto average;
        }
        frame >>= 2;
    }
direct:
    if (info & G3D_TEXSRTANM_TRACK_FX16) {
        return ((const s16 *)pAnm)[frame];
    }
    return ((const s32 *)pAnm)[frame];
average: {
    s32 a, b;
    if (info & G3D_TEXSRTANM_TRACK_FX16) {
        a = ((const s16 *)pAnm)[frame];
        b = ((const s16 *)pAnm)[frame + 1];
    } else {
        a = ((const s32 *)pAnm)[frame];
        b = ((const s32 *)pAnm)[frame + 1];
    }
    return (a + b) >> 1;
}
}
