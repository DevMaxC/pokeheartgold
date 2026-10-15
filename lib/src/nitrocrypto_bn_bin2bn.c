#include "nitrocrypto_bn.h"

// Big number from big-endian bytes.

// MWCC 1.2 applies force_active as set at the end of the file, so the pieces with and without it
// stay in separate files.
#pragma force_active on

BIGNUM *BN_bin2bn(const u8 *s, int len, BIGNUM *ret) {
    u32 i, m;
    u32 n;
    u32 l;

    if (ret == NULL) {
        ret = BN_new();
    }
    if (ret == NULL) {
        return NULL;
    }
    l = 0;
    n = len;
    if (n == 0) {
        ret->top = 0;
        return ret;
    }
    if (bn_expand(ret, (int)(n + 2) * 8) == NULL) {
        return NULL;
    }
    i = ((n - 1) / 4) + 1;
    m = ((n - 1) % 4);
    ret->top = i;
    while (n--) {
        l = (l << 8L) | *(s++);
        if (m-- == 0) {
            ret->d[--i] = l;
            l = 0;
            m = 3;
        }
    }
    bn_fix_top(ret);
    return ret;
}
