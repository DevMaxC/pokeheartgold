#include "nitrocrypto_bn.h"

// Big number and BN_CTX construction / destruction.

// MWCC 1.2 emits a file's functions in reverse order: the functions are defined last-to-first here
// (link order is bottom-up).

void BN_init(BIGNUM *a) {
    MI_CpuFill8(a, 0, sizeof(BIGNUM));
}

BIGNUM *BN_new(void) {
    BIGNUM *ret = CRYPTOi_MyAlloc(sizeof(BIGNUM));

    if (ret == NULL) {
        return NULL;
    }
    ret->flags = BN_FLG_MALLOCED;
    ret->top = 0;
    ret->neg = FALSE;
    ret->max = 0;
    ret->d = NULL;
    return ret;
}

BN_CTX *BN_CTX_new(void) {
    BN_CTX *ret = CRYPTOi_MyAlloc(sizeof(BN_CTX));

    if (ret == NULL) {
        return NULL;
    }
    BN_CTX_init(ret);
    ret->flags = BN_FLG_MALLOCED;
    return ret;
}

void BN_CTX_init(BN_CTX *c) {
    MI_CpuFill8(c, 0, sizeof(BN_CTX));
    c->tos = 0;
    c->flags = 0;
}

void BN_CTX_free(BN_CTX *c) {
    int i;

    for (i = 0; i < BN_CTX_NUM; i++) {
        BN_clear_free(&c->bn[i]);
    }
    if (c->flags & BN_FLG_MALLOCED) {
        CRYPTOi_MyFree(c);
    }
}
