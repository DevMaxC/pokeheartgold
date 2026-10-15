#include "cps/cps_crypto.h"

// MD5 (RFC 1321).

#pragma force_active on

#define ROTATE(x, n) (((x) << (n)) | ((x) >> (32 - (n))))
#define F(b, c, d)   ((d) ^ ((b) & ((c) ^ (d))))
#define G(b, c, d)   ((c) ^ ((d) & ((b) ^ (c))))
#define H(b, c, d)   ((d) ^ ((b) ^ (c)))
#define I(b, c, d)   ((c) ^ ((b) | ~(d)))
#define STEP(f, a, b, c, d, n, j)                                                      \
    {                                                                                  \
        u32 t = (a) + (f(b, c, d) + words[gCpsMd5WordIndex[j]] + gCpsMd5Constants[j]); \
        (a) = (b) + ROTATE(t, n);                                                      \
    }

void CPSi_md5_block(u32 *state, const u8 *block) {
    u32 a = state[0], b = state[1], c = state[2], d = state[3], words[16];
    int index, i;
    long_from_char(words, block, 64);
    index = 0;
    for (i = 0; i < 4; i++) {
        STEP(F, a, b, c, d, 7, index + 0);
        STEP(F, d, a, b, c, 12, index + 1);
        STEP(F, c, d, a, b, 17, index + 2);
        STEP(F, b, c, d, a, 22, index + 3);
        index += 4;
    }
    for (i = 0; i < 4; i++) {
        STEP(G, a, b, c, d, 5, index + 0);
        STEP(G, d, a, b, c, 9, index + 1);
        STEP(G, c, d, a, b, 14, index + 2);
        STEP(G, b, c, d, a, 20, index + 3);
        index += 4;
    }
    for (i = 0; i < 4; i++) {
        STEP(H, a, b, c, d, 4, index + 0);
        STEP(H, d, a, b, c, 11, index + 1);
        STEP(H, c, d, a, b, 16, index + 2);
        STEP(H, b, c, d, a, 23, index + 3);
        index += 4;
    }
    for (i = 0; i < 4; i++) {
        STEP(I, a, b, c, d, 6, index + 0);
        STEP(I, d, a, b, c, 10, index + 1);
        STEP(I, c, d, a, b, 15, index + 2);
        STEP(I, b, c, d, a, 21, index + 3);
        index += 4;
    }
    state[0] += a;
    state[1] += b;
    state[2] += c;
    state[3] += d;
}

void CPSi_md5_init(CpsMd5Context *context) {
    MI_CpuFill8(context, 0, sizeof(CpsMd5Context));
    context->state[0] = 0x67452301;
    context->state[1] = 0xEFCDAB89;
    context->state[2] = 0x98BADCFE;
    context->state[3] = 0x10325476;
}

static inline void AddLength(CpsMd5Context *context, u32 length) {
    context->countLo += length << 3;
    if (context->countLo < (length << 3)) {
        context->countHi++;
    }
    context->countHi += length >> 29;
}

void CPSi_md5_calc(CpsMd5Context *context, const u8 *data, u32 length) {
    u32 i;
    u32 index;
    u32 count;
    u32 part;
    count = context->countLo;
    index = (u32)((count >> 3) & 63U);
    AddLength(context, length);
    part = 64 - index;
    if (length >= part) {
        MI_CpuCopy8(data, context->buffer + index, part);
        index = 0;
        CPSi_md5_block(context->state, context->buffer);
        for (i = part; i + 63 < length; i += 64) {
            CPSi_md5_block(context->state, data + i);
        }
    } else {
        i = 0;
    }
    MI_CpuCopy8(data + i, context->buffer + index, length - i);
}

void CPSi_md5_result(CpsMd5Context *context, u8 *digest) {
    int index;
    char_from_long(digest, &context->countLo, 8);
    index = (context->countLo >> 3) & 63;
    CPSi_md5_calc(context, gCpsMd5Padding, index < 56 ? 56 - index : 120 - index);
    CPSi_md5_calc(context, digest, 8);
    char_from_long(digest, context->state, 16);
}
