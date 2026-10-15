#include "nitrocrypto_bn.h"

// Freeing big numbers.

// MWCC 1.2 emits a file's functions in reverse order: the functions are defined last-to-first here
// (link order is bottom-up).

void BN_clear_free(BIGNUM *a) {
    if (a == NULL) {
        return;
    }
    BN_clear(a);
    BN_free(a);
}

void BN_free(BIGNUM *a) {
    if (a == NULL) {
        return;
    }
    if (a->d != NULL && !BN_get_flags(a, BN_FLG_STATIC_DATA)) {
        CRYPTOi_MyFree(a->d);
    }
    a->flags |= BN_FLG_FREE;
    if (a->flags & BN_FLG_MALLOCED) {
        CRYPTOi_MyFree(a);
    }
}
