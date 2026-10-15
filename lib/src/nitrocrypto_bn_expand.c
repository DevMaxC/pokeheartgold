#include "nitrocrypto_bn.h"

// Copying big numbers and growing their word arrays.

// MWCC 1.2 applies force_active as set at the end of the file, so the pieces with and without it
// stay in separate files.
#pragma force_active on

// MWCC 1.2 emits a file's functions in reverse order: the functions are defined last-to-first here
// (link order is bottom-up).

BIGNUM *bn_expand2(BIGNUM *b, int words) {
    u32 *a;

    if (words > b->max) {
        if (BN_get_flags(b, BN_FLG_STATIC_DATA)) {
            return NULL;
        }
        a = CRYPTOi_MyAlloc((words + 1) * sizeof(u32));
        if (a == NULL) {
            return NULL;
        }
        if (b->d != NULL) {
            MI_CpuCopy8(b->d, a, b->top * sizeof(u32));
            CRYPTOi_MyFree(b->d);
        }
        b->d = a;
        b->max = words;
    }
    return b;
}

BIGNUM *BN_copy(BIGNUM *a, const BIGNUM *b) {
    if (a == b) {
        return a;
    }
    if (bn_wexpand(a, b->top) == NULL) {
        return NULL;
    }
    MI_CpuCopy8(b->d, a->d, b->top * sizeof(u32));
    a->top = b->top;
    if (a->top == 0 && a->d != NULL) {
        a->d[0] = 0;
    }
    a->neg = b->neg;
    return a;
}
