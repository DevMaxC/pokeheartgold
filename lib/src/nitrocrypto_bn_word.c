#include "nitrocrypto_bn.h"

// Setting a big number to a word value and clearing it.

// MWCC 1.2 emits a file's functions in reverse order: the functions are defined last-to-first here
// (link order is bottom-up).

void BN_clear(BIGNUM *a) {
    if (a->d != NULL) {
        MI_CpuFill8(a->d, 0, a->max * sizeof(u32));
    }
    a->top = 0;
    a->neg = FALSE;
}

BOOL BN_set_word(BIGNUM *a, u32 w) {
    if (bn_expand(a, BN_BITS2) == NULL) {
        return 0;
    }
    a->neg = 0;
    a->top = 0;
    a->d[0] = w;
    if (a->d[0] != 0) {
        a->top = 1;
    }
    return 1;
}
