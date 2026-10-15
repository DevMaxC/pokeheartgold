#include "nitrocrypto_rc4.h"

// RC4 key setup (keys are cut to 16 bytes) for both context layouts.

#pragma force_active on

// MWCC 1.2 emits a file's functions in reverse order: the functions are defined last-to-first here
// (link order is bottom-up).

void CRYPTO_RC4Init(CRYPTORC4Context *context, const void *key, u32 key_len) {
    int i;
    u8 *s;

    if (key_len > 16) {
        key_len = 16;
    }
    context->i = 0;
    context->j = 0;
    s = context->s;
    for (i = 0; i < 256; i++) {
        s[i] = (u8)i;
    }
    {
        u8 k;
        u8 j;

        j = 0;
        k = 0;
        for (i = 0; i < 256; i++) {
            u8 x = s[i];

            j = (u8)(j + (x + ((const u8 *)key)[k]));
            k++;
            if (k == (u8)key_len) {
                k = 0;
            }
            s[i] = s[j];
            s[j] = x;
        }
    }
}

void CRYPTO_RC4FastInit(CRYPTORC4FastContext *context, const void *key, u32 key_len) {
    int i;
    u32 *s;

    if (key_len > 16) {
        key_len = 16;
    }
    context->i = 0;
    context->j = 0;
    s = context->s;
    for (i = 0; i < 256; i++) {
        s[i] = i;
    }
    {
        u32 k;
        u32 j;

        j = 0;
        k = 0;
        for (i = 0; i < 256; i++) {
            u32 x = s[i];

            j = (j + (x + ((const u8 *)key)[k])) & 0xFF;
            k++;
            if (k == key_len) {
                k = 0;
            }
            s[i] = s[j];
            s[j] = x;
        }
    }
    for (i = 0; i < 256; i++) {
        s[i] <<= 24;
    }
}
