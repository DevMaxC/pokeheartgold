#pragma force_active on
#include "vct/vct_adpcm.h"

#include <nitro/types.h>

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

void vct_decode_adpcm_32(u8 *in, s16 *out, u32 count, AdpcmState *state) {
    u32 i;
    for (i = 0; i < count;) {
        {
            s32 index = state->index;
            s32 code = (in[0] >> 0) & 15;
            s32 value = state->sample;
            s16 step = cAdpcmStepSizeTable[index];
            s32 diff = step >> 3;
            if (code & 4) {
                diff += step;
            }
            if (code & 2) {
                diff += step >> 1;
            }
            if (code & 1) {
                diff += step >> 2;
            }
            if (code & 8) {
                value -= diff;
                if (value < -32768) {
                    value = -32768;
                }
            } else {
                value += diff;
                if (value > 32767) {
                    value = 32767;
                }
            }
            index += cAdpcmIndexTable4[code];
            if (index < 0) {
                index = 0;
            } else if (index > 88) {
                index = 88;
            }
            {
                s16 sample = value;
                state->sample = sample;
                state->index = index;
                *out++ = sample;
            }
        }
        {
            s32 index = state->index;
            s32 code = (in[0] >> 4) & 15;
            s32 value = state->sample;
            s16 step = cAdpcmStepSizeTable[index];
            s32 diff = step >> 3;
            if (code & 4) {
                diff += step;
            }
            if (code & 2) {
                diff += step >> 1;
            }
            if (code & 1) {
                diff += step >> 2;
            }
            if (code & 8) {
                value -= diff;
                if (value < -32768) {
                    value = -32768;
                }
            } else {
                value += diff;
                if (value > 32767) {
                    value = 32767;
                }
            }
            index += cAdpcmIndexTable4[code];
            if (index < 0) {
                index = 0;
            } else if (index > 88) {
                index = 88;
            }
            {
                s16 sample = value;
                state->sample = sample;
                state->index = index;
                i++;
                *out++ = sample;
            }
        }
        in++;
    }
}

static inline u8 EncodeSample4(const s16 *in, AdpcmState *state) {
    int index;
    int code;
    int diff;
    int step;
    int delta;
    int sample;
    delta = *in - state->sample;
    index = state->index;
    if (delta < 0) {
        code = 8;
        delta = -delta;
    } else {
        code = 0;
    }
    step = cAdpcmStepSizeTable[index];
    if (delta >= step) {
        code |= 4;
        delta -= step;
    }
    if (delta >= (step >> 1)) {
        code |= 2;
        delta -= step >> 1;
    }
    if (delta >= (step >> 2)) {
        code |= 1;
    }
    diff = step >> 3;
    if (code & 4) {
        diff += step;
    }
    if (code & 2) {
        diff += step >> 1;
    }
    if (code & 1) {
        diff += step >> 2;
    }
    if (code & 8) {
        diff = -diff;
    }
    sample = state->sample + diff;
    if (sample < -32768) {
        sample = -32768;
    }
    if (sample > 32767) {
        sample = 32767;
    }
    index += cAdpcmIndexTable4[code];
    if (index < 0) {
        index = 0;
    } else if (index > 88) {
        index = 88;
    }
    state->sample = sample;
    state->index = index;
    return code;
}

void vct_encode_adpcm_32(u8 *out, const s16 *in, u32 count, AdpcmState *state) {
    u32 i;
    for (i = 0; i < count >> 1; i++) {
        u8 c0, c1;
        c0 = EncodeSample4(in++, state);
        c1 = EncodeSample4(in++, state);
        *out++ = c0 | (c1 << 4);
    }
}

static inline s16 DecodeSample3(int code, AdpcmState *state) {
    s32 previous = state->sample, index = state->index, step = cAdpcmStepSizeTable[index], diff = step >> 2;
    if (code & 2) {
        diff += step;
    }
    if (code & 1) {
        diff += step >> 1;
    }
    if (code & 4) {
        previous -= diff;
        if (previous < -32768) {
            previous = -32768;
        }
    } else {
        previous += diff;
        if (previous > 32767) {
            previous = 32767;
        }
    }
    index += cAdpcmIndexTable3[code];
    if (index < 0) {
        index = 0;
    } else if (index > 88) {
        index = 88;
    }
    state->sample = (s16)previous;
    state->index = index;
    return (s16)previous;
}

// Eight 3-bit codes are packed big-endian into three bytes.
void vct_decode_adpcm_24(u8 *in, s16 *out, u32 size, AdpcmState *state) {
    u32 i;
    for (i = 0; i < size / 3; i++) {
        u8 a = in[0], b = in[1], c = in[2];
        out[0] = DecodeSample3(a >> 5, state);
        out[1] = DecodeSample3((a >> 2) & 7, state);
        out[2] = DecodeSample3(((a << 1) & 7) | (b >> 7), state);
        out[3] = DecodeSample3((b >> 4) & 7, state);
        out[4] = DecodeSample3((b >> 1) & 7, state);
        out[5] = DecodeSample3(((b << 2) & 7) | (c >> 6), state);
        out[6] = DecodeSample3((c >> 3) & 7, state);
        out[7] = DecodeSample3(c & 7, state);
        in += 3;
        out += 8;
    }
}

static inline u8 EncodeSample3(const s16 *in, AdpcmState *state) {
    s32 previous, step, index, diff, code, sample;
    previous = state->sample;
    diff = *in - previous;
    index = state->index;
    if (diff < 0) {
        code = 4;
        diff = -diff;
    } else {
        code = 0;
    }
    step = cAdpcmStepSizeTable[index];
    if (diff >= step) {
        code |= 2;
        diff -= step;
    }
    if (diff >= (step >> 1)) {
        code |= 1;
    }
    diff = step >> 2;
    if (code & 2) {
        diff += step;
    }
    if (code & 1) {
        diff += step >> 1;
    }
    if (code & 4) {
        diff = -diff;
    }
    sample = previous + diff;
    if (sample < -32768) {
        sample = -32768;
    }
    if (sample > 32767) {
        sample = 32767;
    }
    index += cAdpcmIndexTable3[code];
    if (index < 0) {
        index = 0;
    } else if (index > 88) {
        index = 88;
    }
    state->sample = (s16)sample;
    state->index = index;
    return code;
}

void vct_encode_adpcm_24(u8 *out, const s16 *in, u32 size, AdpcmState *state) {
    u32 i;
    for (i = 0; i < size / 8; i++) {
        u8 c0, c1, c2, c3, c4, c5, c6, c7, t;
        c0 = EncodeSample3(in++, state);
        t = c0 << 5;
        c1 = EncodeSample3(in++, state);
        t |= c1 << 2;
        c2 = EncodeSample3(in++, state);
        out[0] = t | (c2 >> 1);
        c3 = EncodeSample3(in++, state);
        t = c3 << 4;
        c4 = EncodeSample3(in++, state);
        t |= c4 << 1;
        c5 = EncodeSample3(in++, state);
        out[1] = (c2 << 7) | t | (c5 >> 2);
        c6 = EncodeSample3(in++, state);
        t = c6 << 3;
        c7 = EncodeSample3(in++, state);
        t |= c7;
        out[2] = (c5 << 6) | t;
        out += 3;
    }
}

static inline s16 DecodeSample2(int code, AdpcmState *state) {
    s32 previous = state->sample, index = state->index, step = cAdpcmStepSizeTable[index];
    if (!(code & 1)) {
        step = 0;
    }
    if (code & 2) {
        previous -= step;
        if (previous < -32768) {
            previous = -32768;
        }
    } else {
        previous += step;
        if (previous > 32767) {
            previous = 32767;
        }
    }
    index += cAdpcmIndexTable2[code];
    if (index < 0) {
        index = 0;
    } else if (index > 88) {
        index = 88;
    }
    state->sample = (s16)previous;
    state->index = index;
    return (s16)previous;
}

void vct_decode_adpcm_16(u8 *in, s16 *out, u32 count, AdpcmState *state) {
    int i;
    for (i = 0; i < count; i++) {
        *out++ = DecodeSample2(*in & 3, state);
        *out++ = DecodeSample2((*in >> 2) & 3, state);
        *out++ = DecodeSample2((*in >> 4) & 3, state);
        *out++ = DecodeSample2((*in >> 6) & 3, state);
        in++;
    }
}

static inline u8 EncodeSample2(const s16 *in, AdpcmState *state) {
    int index;
    int diff;
    int delta;
    int code;
    int sample;
    int step;
    delta = *in - state->sample;
    index = state->index;
    if (delta < 0) {
        code = 2;
        delta = -delta;
    } else {
        code = 0;
    }
    step = cAdpcmStepSizeTable[index];
    if (delta >= step) {
        code |= 1;
    }
    if (code & 1) {
        diff = step;
    } else {
        diff = 0;
    }
    if (code & 2) {
        diff = -diff;
    }
    sample = state->sample + diff;
    if (sample < -32768) {
        sample = -32768;
    }
    if (sample > 32767) {
        sample = 32767;
    }
    index += cAdpcmIndexTable2[code];
    if (index < 0) {
        index = 0;
    } else if (index > 88) {
        index = 88;
    }
    state->sample = sample;
    state->index = index;
    return code;
}

void vct_encode_adpcm_16(u8 *out, const s16 *in, u32 count, AdpcmState *state) {
    u32 i;
    for (i = 0; i < count >> 2; i++) {
        u8 c;
        c = EncodeSample2(in++, state);
        c |= EncodeSample2(in++, state) << 2;
        c |= EncodeSample2(in++, state) << 4;
        c |= EncodeSample2(in++, state) << 6;
        *out++ = c;
    }
}

void vct_decode_adpcm(u8 *in, s16 *out, u32 size, s32 codec) {
    AdpcmState state;
    state.sample = *(s16 *)in;
    state.index = in[2];
    switch (codec) {
    case 2:
        vct_decode_adpcm_16(in + 4, out, size - 4, &state);
        break;
    case 3:
        vct_decode_adpcm_24(in + 4, out, size - 4, &state);
        break;
    case 4:
        vct_decode_adpcm_32(in + 4, out, size - 4, &state);
        break;
    }
}

void vct_encode_adpcm(u8 *out, s16 *in, u32 size, AdpcmState *state, s32 codec) {
    *(s16 *)out = state->sample;
    out[2] = state->index;
    out[3] = 0;
    switch (codec) {
    case 2:
        vct_encode_adpcm_16(out + 4, in, size, state);
        break;
    case 3:
        vct_encode_adpcm_24(out + 4, in, size, state);
        break;
    case 4:
        vct_encode_adpcm_32(out + 4, in, size, state);
        break;
    }
}
