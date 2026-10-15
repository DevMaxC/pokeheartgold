#include "cps/cps_crypto.h"

// RC4 key schedule and stream cipher.

#pragma force_active on

void CPSi_rc4_init(CpsRc4Context *context, const u8 *key, int length) {
    int a;
    u8 *s;
    int i;
    int j;
    int b;
    int k;
    s = context->s;
    context->x = 0;
    context->y = 0;
    for (i = 0; i < 256; i++) {
        s[i] = i;
    }
    k = 0;
    j = 0;
    for (i = 0; i < 256; i++) {
        a = s[i];
        b = key[k];
        k = (k + 1) & 255;
        j = (j + (a + b)) & 255;
        b = s[j];
        if (k >= length) {
            k = 0;
        }
        s[i] = b;
        s[j] = a;
    }
}

void CPSi_rc4_crypt(CpsRc4Context *context, u8 *data, int length) {
    int i, x = context->x, y = context->y;
    u8 *s = context->s;
    for (i = 0; i < length; i++) {
        int a, b;
        x = (x + 1) & 255;
        a = s[x];
        y = (y + a) & 255;
        b = s[y];
        s[x] = b;
        s[y] = a;
        data[i] ^= s[(a + b) & 255];
    }
    context->x = x;
    context->y = y;
}
