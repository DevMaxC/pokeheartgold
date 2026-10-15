#include "vct/vct_decoder_internal.h"

// G.711 u-law and 8-bit raw codecs (16-bit samples).

#pragma force_active on

static inline int segment(int sample) {
    const int *p = ulaw_segment;
    int i;
    for (i = 0; i < 8; i++) {
        if (sample <= *p++) {
            return i;
        }
    }
    return 8;
}

static inline int EncodeUlaw(int sample) {
    int mask, seg;
    sample >>= 2;
    if (sample < 0) {
        mask = 127;
        sample = -sample;
    } else {
        mask = 255;
    }
    if (sample > 8159) {
        sample = 8159;
    }
    seg = segment(sample + 33);
    if (seg >= 8) {
        return mask ^ 127;
    }
    seg = (((sample + 33) >> (seg + 1)) & 15) | (seg << 4);
    return seg ^ mask;
}

void vct_encode_g711_ulaw(u8 *out, const s16 *in, u32 count) {
    int i;
    for (i = 0; i < count; i++) {
        int s = in[i];
        out[i] = EncodeUlaw(s);
    }
}

void vct_decode_g711_ulaw(u8 *in, s16 *out, u32 n) {
    for (u32 i = 0; i < n; i++) {
        int u = ~in[i];
        int t = ((u & 15) << 3) + 0x84;
        t <<= (u & 0x70) >> 4;
        out[i] = (u & 0x80) ? 0x84 - t : t - 0x84;
    }
}

void vct_encode_8bit_raw(u8 *out, s16 *in, u32 n) {
    for (u32 i = 0; i < n; i++) {
        out[i] = in[i] >> 8;
    }
}

void vct_decode_8bit_raw(s8 *in, s16 *out, u32 n) {
    for (u32 i = 0; i < n; i++) {
        out[i] = in[i] << 8;
    }
}
