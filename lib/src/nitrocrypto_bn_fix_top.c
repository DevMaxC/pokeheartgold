#include "nitrocrypto_bn.h"

// Trimming leading zero words and zero-extending big numbers.

// MWCC 1.2 applies force_active as set at the end of the file, so the pieces with and without it
// stay in separate files.
#pragma force_active on

// MWCC 1.2 emits a file's functions in reverse order: the functions are defined last-to-first here
// (link order is bottom-up).

void bn_zexpand(BIGNUM *a, int words) {
    int i;

    if (a->top >= words) {
        return;
    }
    if (words > a->max) {
        (void)bn_expand2(a, words);
    }
    if (a->d == NULL) {
        return;
    }
    for (i = a->top; i < words; i++) {
        a->d[i] = 0;
    }
}

void bn_fix_top(BIGNUM *a) {
    u32 *ftl;

    if (a->top <= 0) {
        return;
    }
    ftl = a->d + (a->top - 1);
    while (a->top > 0) {
        if (*ftl-- != 0) {
            return;
        }
        a->top--;
    }
}
