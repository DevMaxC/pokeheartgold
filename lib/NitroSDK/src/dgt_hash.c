#include <nitro.h>

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

#include "DGT_dgt.h"
#include "dgt.h"

// DGT digests: Hash1 (MD5: 64-byte blocks, 16-byte digest), Hash2 (SHA-1: 20-byte digest, the block
// function is the asm routine gDgtHash2ProcessBlock points at) and HMAC over Hash2.

#define ROTATE_LEFT(x, s) (((x) << (s)) | ((x) >> (32 - (s))))
#define F(b, c, d)        (((b) & (c)) | (~(b) & (d)))
#define G(b, c, d)        (((b) & (d)) | ((c) & ~(d)))
#define H(b, c, d)        (((b) ^ (c)) ^ (d))
#define I(b, c, d)        ((c) ^ ((b) | ~(d)))
#define STEP(f, a, b, c, d, x, k, s)              \
    {                                             \
        u32 t = (k) + ((x) + ((a) + f(b, c, d))); \
        (a) = (b) + ROTATE_LEFT(t, s);            \
    }

// HmacCalc's view of a hash: sizes, a context and digest buffer, and its three functions.
typedef struct DgtHmacParams {
    int digestSize;
    int blockSize;
    struct DGTHash2Context *context;
    u8 *digest;
    void (*reset)(struct DGTHash2Context *context);
    void (*setSource)(struct DGTHash2Context *context, u8 *input, u32 length);
    void (*getDigest)(struct DGTHash2Context *context, u8 *digest);
} DgtHmacParams;

extern const DgtHmacParams gDgtHmacHash2Params; // sizes of Hash2 (the rest is filled in)
extern u8 gDgtHash1Padding[];                   // 0x80
extern const u32 gDgtHash1MessageOrder[];       // message word order of rounds 2..4
extern const u32 gDgtHash1Constants[];          // the 64 round constants
extern void (*gDgtHash2ProcessBlock)(struct DGTHash2Context *context, const void *input, u32 length);

void ProcessBlock(struct DGTHash1Context *context);
void HmacCalc(void *digest, const void *input, int length, const void *key, int keyLength, DgtHmacParams *params);

#pragma force_active on

void DGT_Hash1Reset(struct DGTHash1Context *context) {
    context->state[0] = 0x67452301;
    context->state[1] = 0xEFCDAB89;
    context->state[2] = 0x98BADCFE;
    context->state[3] = 0x10325476;
    context->length = 0;
}

void DGT_Hash1SetSource(struct DGTHash1Context *context, u8 *input, u32 length) {
    const u8 *src = input;
    u32 used = (u32)context->length & 63;
    u32 remaining = 64 - used;
    int blocks;
    const u8 *block;

    context->length += length;
    if (remaining > length) {
        if (length) {
            MI_CpuCopy8(src, context->buffer8 + used, length);
        }
        return;
    }
    MI_CpuCopy8(src, context->buffer8 + used, remaining);
    ProcessBlock(context);
    length -= remaining;
    blocks = length >> 6;
    block = src + remaining;
    while (blocks > 0) {
        MI_CpuCopy8(block, context->buffer8, 64);
        block += 64;
        ProcessBlock(context);
        blocks--;
    }
    if (length & 63) {
        MI_CpuCopy8(block, context->buffer8, length & 63);
    }
}

// Pads the message (0x80, zeros, the bit length), writes the digest and clears the context.
void DGT_Hash1GetDigest_R(u8 *digest, struct DGTHash1Context *context) {
    u64 bits = context->length << 3;
    u32 high = (u32)(bits >> 32);
    u32 low = (u32)bits;
    u32 used, remaining;

    DGT_Hash1SetSource(context, gDgtHash1Padding, 1);
    used = context->length & 63;
    remaining = 64 - used;
    if (remaining < 8) {
        MI_CpuClear8(context->buffer8 + used, remaining);
        ProcessBlock(context);
        used = 0;
        remaining = 64;
    }
    if (remaining > 8) {
        MI_CpuClear8(context->buffer8 + used, remaining - 8);
    }
    context->buffer32[14] = low;
    context->buffer32[15] = high;
    ProcessBlock(context);
    MI_CpuCopy8(context, digest, 16);
    MI_CpuClear8(context, sizeof(struct DGTHash1Context));
}

// The four rounds of 16 steps on the buffered block.
void ProcessBlock(struct DGTHash1Context *context) {
    const u32 *order;
    u32 a = context->a, b = context->b, c = context->c, d = context->d;
    u32 *words = context->buffer32;
    const u32 *k = gDgtHash1Constants;
    u32 *w = words;
    int i;

    for (i = 0; i < 4; i++) {
        STEP(F, a, b, c, d, *w++, *k++, 7);
        STEP(F, d, a, b, c, *w++, *k++, 12);
        STEP(F, c, d, a, b, *w++, *k++, 17);
        STEP(F, b, c, d, a, *w++, *k++, 22);
    }
    order = gDgtHash1MessageOrder;
    for (i = 0; i < 4; i++) {
        STEP(G, a, b, c, d, words[*order++], *k++, 5);
        STEP(G, d, a, b, c, words[*order++], *k++, 9);
        STEP(G, c, d, a, b, words[*order++], *k++, 14);
        STEP(G, b, c, d, a, words[*order++], *k++, 20);
    }
    for (i = 0; i < 4; i++) {
        STEP(H, a, b, c, d, words[*order++], *k++, 4);
        STEP(H, d, a, b, c, words[*order++], *k++, 11);
        STEP(H, c, d, a, b, words[*order++], *k++, 16);
        STEP(H, b, c, d, a, words[*order++], *k++, 23);
    }
    for (i = 0; i < 4; i++) {
        STEP(I, a, b, c, d, words[*order++], *k++, 6);
        STEP(I, d, a, b, c, words[*order++], *k++, 10);
        STEP(I, c, d, a, b, words[*order++], *k++, 15);
        STEP(I, b, c, d, a, words[*order++], *k++, 21);
    }
    context->a += a;
    context->b += b;
    context->c += c;
    context->d += d;
}

void DGT_Hash2Reset(struct DGTHash2Context *context) {
    context->Intermediate_Hash[0] = 0x67452301;
    context->Intermediate_Hash[1] = 0xEFCDAB89;
    context->Intermediate_Hash[2] = 0x98BADCFE;
    context->Intermediate_Hash[3] = 0x10325476;
    context->Intermediate_Hash[4] = 0xC3D2E1F0;
    context->Length_Low = 0;
    context->Length_High = 0;
    context->Message_Block_Index = 0;
}

void DGT_Hash2SetSource(struct DGTHash2Context *context, u8 *input, u32 length) {
    const u8 *src = input;
    u8 *block = context->Message_Block;
    u32 n;
    int count;

    if (!length) {
        return;
    }
    n = context->Length_Low + (length << 3);
    if (n < context->Length_Low) {
        context->Length_High++;
    }
    context->Length_High += length >> 29;
    context->Length_Low = n;
    if (context->Message_Block_Index) {
        if (context->Message_Block_Index + length >= 64) {
            n = 64 - context->Message_Block_Index;
            MI_CpuCopy8(src, block + context->Message_Block_Index, n);
            length -= n;
            src += n;
            gDgtHash2ProcessBlock(context, block, 64);
            context->Message_Block_Index = 0;
        } else {
            MI_CpuCopy8(src, block + context->Message_Block_Index, length);
            context->Message_Block_Index += length;
            return;
        }
    }
    if (length >= 64) {
        count = length & ~63;
        length -= count;
        if (!((u32)src & 3)) {
            gDgtHash2ProcessBlock(context, src, count);
            src += count;
        } else {
            do {
                MI_CpuCopy8(src, block, 64);
                src += 64;
                gDgtHash2ProcessBlock(context, block, 64);
                count -= 64;
            } while (count > 0);
        }
    }
    context->Message_Block_Index = length;
    if (length) {
        MI_CpuCopy8(src, block, length);
    }
}

// Pads the message (0x80, zeros, the big-endian bit length) and writes the big-endian digest.
void DGT_Hash2GetDigest(struct DGTHash2Context *context, u8 *digest) {
    int n = context->Message_Block_Index, index = n >> 2;
    u32 *words = context->Message_Block_Words;
    u8 *bytes;
    u32 value;

    if (!(n & 3)) {
        words[index] = 0;
    }
    bytes = context->Message_Block;
    bytes[n++] = 0x80;
    while (n & 3) {
        bytes[n++] = 0;
    }
    index++;
    if (context->Message_Block_Index >= 56) {
        while (index < 16) {
            words[index] = 0;
            index++;
        }
        gDgtHash2ProcessBlock(context, words, 64);
        index = 0;
    }
    while (index < 14) {
        words[index] = 0;
        index++;
    }
    value = context->Length_Low;
    bytes[63] = value;
    bytes[62] = value >> 8;
    bytes[61] = value >> 16;
    bytes[60] = value >> 24;
    value = context->Length_High;
    bytes[59] = value;
    bytes[58] = value >> 8;
    bytes[57] = value >> 16;
    bytes[56] = value >> 24;
    gDgtHash2ProcessBlock(context, words, 64);
    value = context->Intermediate_Hash[0];
    digest[0] = value >> 24;
    digest[1] = value >> 16;
    digest[2] = value >> 8;
    digest[3] = value;
    value = context->Intermediate_Hash[1];
    digest[4] = value >> 24;
    digest[5] = value >> 16;
    digest[6] = value >> 8;
    digest[7] = value;
    value = context->Intermediate_Hash[2];
    digest[8] = value >> 24;
    digest[9] = value >> 16;
    digest[10] = value >> 8;
    digest[11] = value;
    value = context->Intermediate_Hash[3];
    digest[12] = value >> 24;
    digest[13] = value >> 16;
    digest[14] = value >> 8;
    digest[15] = value;
    value = context->Intermediate_Hash[4];
    digest[16] = value >> 24;
    digest[17] = value >> 16;
    digest[18] = value >> 8;
    digest[19] = value;
    context->Message_Block_Index = 0;
    MI_CpuClear32(&context, 4); // clears the local pointer, not the context
}

void DGT_Hash2CalcHmac(void *digest, const void *input, u32 length, const void *key, u32 keyLength) {
    struct DGTHash2Context context;
    u8 hash[20];
    DgtHmacParams params = gDgtHmacHash2Params;

    params.context = &context;
    params.digest = hash;
    params.reset = DGT_Hash2Reset;
    params.setSource = DGT_Hash2SetSource;
    params.getDigest = DGT_Hash2GetDigest;
    HmacCalc(digest, input, length, key, keyLength, &params);
}

// HMAC: hash((key ^ 0x5C..) + hash((key ^ 0x36..) + input)); a key longer than a block is hashed first.
void HmacCalc(void *digest, const void *input, int length, const void *key, int keyLength, DgtHmacParams *params) {
    u8 keyHash[64], innerPad[64], outerPad[64];
    const u8 *k = key;
    int i;

    if (!digest || !input || !length || !key || !keyLength || !params) {
        return;
    }
    if (keyLength > params->blockSize) {
        params->reset(params->context);
        params->setSource(params->context, (u8 *)key, keyLength);
        params->getDigest(params->context, keyHash);
        keyLength = params->digestSize;
        k = keyHash;
    }
    for (i = 0; i < keyLength; i++) {
        innerPad[i] = k[i] ^ 0x36;
    }
    for (; i < params->blockSize; i++) {
        innerPad[i] = 0x36;
    }
    params->reset(params->context);
    params->setSource(params->context, innerPad, params->blockSize);
    params->setSource(params->context, (u8 *)input, length);
    params->getDigest(params->context, params->digest);
    for (i = 0; i < keyLength; i++) {
        outerPad[i] = k[i] ^ 0x5C;
    }
    for (; i < params->blockSize; i++) {
        outerPad[i] = 0x5C;
    }
    params->reset(params->context);
    params->setSource(params->context, outerPad, params->blockSize);
    params->setSource(params->context, params->digest, params->digestSize);
    params->getDigest(params->context, (u8 *)digest);
}
