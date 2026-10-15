#include "cps/cps_crypto.h"

// SHA-1 (FIPS 180-1); the message schedule is computed in place in a 16-word ring (R).

#pragma force_active on

u32 R(u32 index, u32 *words) {
    u32 x = words[(index + 13) & 15] ^ words[index ^ 8] ^ words[(index + 2) & 15] ^ words[index];
    words[index] = (x << 1) | (x >> 31);
    return words[index];
}

void char_from_long__sha1(u8 *dest, const u32 *src, u32 size) {
    u32 i;
    size >>= 2;
    for (i = 0; i < size; i++) {
        u32 value = *src++;
        dest[0] = value >> 24;
        dest[1] = value >> 16;
        dest[2] = value >> 8;
        dest[3] = value;
        dest += 4;
    }
}

void long_from_char__sha1(u32 *dest, const u8 *src, u32 size) {
    u32 i;
    for (i = 0; i < size; i += 4) {
        *dest++ = src[i + 3] | (((u32)src[i + 2] << 8) | (((u32)src[i] << 24) | ((u32)src[i + 1] << 16)));
    }
}

#define ROT5(a)                      (((a) << 5) | ((a) >> 27))
#define ROT30(a)                     (((a) << 30) | ((a) >> 2))
#define CH(b, c, d)                  ((d) ^ ((b) & ((c) ^ (d))))
#define PAR(b, c, d)                 ((b) ^ (c) ^ (d))
#define MAJ(b, c, d)                 (((b) & ((c) | (d))) | ((c) & (d)))
#define STEP(a, b, c, d, e, w, k, f) ((e) += ROT5(a) + f(b, c, d) + (w) + (k), (b) = ROT30(b))

void CPSi_sha1_block(u32 *state, const u8 *block) {
    u32 a = state[0], b = state[1], c = state[2], d = state[3], e = state[4], words[16];
    int i, j;
    long_from_char__sha1(words, block, 64);
    for (i = 0, j = 0; j < 3; i += 5, j++) {
        STEP(a, b, c, d, e, words[i], 0x5A827999, CH);
        STEP(e, a, b, c, d, words[i + 1], 0x5A827999, CH);
        STEP(d, e, a, b, c, words[i + 2], 0x5A827999, CH);
        STEP(c, d, e, a, b, words[i + 3], 0x5A827999, CH);
        STEP(b, c, d, e, a, words[i + 4], 0x5A827999, CH);
    }
    STEP(a, b, c, d, e, words[15], 0x5A827999, CH);
    STEP(e, a, b, c, d, R(0, words), 0x5A827999, CH);
    STEP(d, e, a, b, c, R(1, words), 0x5A827999, CH);
    STEP(c, d, e, a, b, R(2, words), 0x5A827999, CH);
    STEP(b, c, d, e, a, R(3, words), 0x5A827999, CH);
    i = 4;
    for (j = 0; j < 4; j++) {
        STEP(a, b, c, d, e, R(i, words), 0x6ED9EBA1, PAR);
        STEP(e, a, b, c, d, R(i + 1, words), 0x6ED9EBA1, PAR);
        i = (i + 2) & 15;
        STEP(d, e, a, b, c, R(i, words), 0x6ED9EBA1, PAR);
        STEP(c, d, e, a, b, R(i + 1, words), 0x6ED9EBA1, PAR);
        STEP(b, c, d, e, a, R(i + 2, words), 0x6ED9EBA1, PAR);
        i += 3;
    }
    for (j = 0; j < 4; j++) {
        STEP(a, b, c, d, e, R(i, words), 0x8F1BBCDC, MAJ);
        STEP(e, a, b, c, d, R(i + 1, words), 0x8F1BBCDC, MAJ);
        STEP(d, e, a, b, c, R(i + 2, words), 0x8F1BBCDC, MAJ);
        i = (i + 3) & 15;
        STEP(c, d, e, a, b, R(i, words), 0x8F1BBCDC, MAJ);
        STEP(b, c, d, e, a, R(i + 1, words), 0x8F1BBCDC, MAJ);
        i += 2;
    }
    for (j = 0; j < 4; j++) {
        STEP(a, b, c, d, e, R(i, words), 0xCA62C1D6, PAR);
        STEP(e, a, b, c, d, R(i + 1, words), 0xCA62C1D6, PAR);
        STEP(d, e, a, b, c, R(i + 2, words), 0xCA62C1D6, PAR);
        STEP(c, d, e, a, b, R(i + 3, words), 0xCA62C1D6, PAR);
        i = (i + 4) & 15;
        STEP(b, c, d, e, a, R(i, words), 0xCA62C1D6, PAR);
        i++;
    }
    state[0] += a;
    state[1] += b;
    state[2] += c;
    state[3] += d;
    state[4] += e;
}

void CPSi_sha1_init(CpsSha1Context *context) {
    MI_CpuFill8(context, 0, sizeof(CpsSha1Context));
    context->state[0] = 0x67452301;
    context->state[1] = 0xEFCDAB89;
    context->state[2] = 0x98BADCFE;
    context->state[3] = 0x10325476;
    context->state[4] = 0xC3D2E1F0;
}

void CPSi_sha1_calc(CpsSha1Context *context, const u8 *data, u32 length) {
    u32 count = context->countLo;
    u32 index = (count >> 3) & 63U;
    u32 part;
    u32 i;
    context->countLo += length << 3;
    if (context->countLo < (length << 3)) {
        context->countHi++;
    }
    context->countHi += length >> 29;
    part = 64 - index;
    if (length >= part) {
        MI_CpuCopy8(data, context->buffer + index, part);
        index = 0;
        CPSi_sha1_block(context->state, context->buffer);
        for (i = part; i + 63 < length; i += 64) {
            CPSi_sha1_block(context->state, data + i);
        }
    } else {
        i = 0;
    }
    MI_CpuCopy8(data + i, context->buffer + index, length - i);
}

void CPSi_sha1_result(CpsSha1Context *context, u8 *digest) {
    int index;
    char_from_long__sha1(digest, &context->countHi, 8);
    index = (context->countLo >> 3) & 63;
    CPSi_sha1_calc(context, gCpsSha1Padding, index < 56 ? 56 - index : 120 - index);
    CPSi_sha1_calc(context, digest, 8);
    char_from_long__sha1(digest, context->state, 20);
}

// Pseudo-random output: the state after 44 more zero bytes, without the length padding.
void CPSi_sha1_result_prng(CpsSha1Context *context, u8 *digest) {
    CPSi_sha1_calc(context, _02110899, 44);
    char_from_long__sha1(digest, context->state, 20);
}
