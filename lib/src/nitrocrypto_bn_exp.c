#include "nitrocrypto_bn.h"

// Modular arithmetic on big numbers: reciprocal division, Montgomery and reciprocal
// exponentiation, squaring, BN_mod / BN_mod_exp.

// MWCC 1.2 emits a file's functions in reverse order: the functions are defined last-to-first here
// (link order is bottom-up).

BOOL BN_mod(BIGNUM *rem, const BIGNUM *m, const BIGNUM *d, BN_CTX *ctx) {
    return BN_div(NULL, rem, m, d, ctx);
}

BOOL BN_mod_exp(BIGNUM *r, BIGNUM *a, const BIGNUM *p, const BIGNUM *m, BN_CTX *ctx) {
    if (BN_is_odd(m)) {
        return BN_mod_exp_mont(r, a, p, m, ctx, NULL);
    }
    return BN_mod_exp_recp(r, a, p, m, ctx);
}

BOOL BN_sqr(BIGNUM *r, BIGNUM *a, BN_CTX *ctx) {
    int max, al;
    BIGNUM *tmp = &ctx->bn[ctx->tos];
    BIGNUM *rr = a != r ? r : &ctx->bn[ctx->tos + 1];

    al = a->top;
    if (al <= 0) {
        r->top = 0;
        return TRUE;
    }

    max = al + al;
    if (bn_wexpand(rr, max) == NULL) {
        return FALSE;
    }
    rr->top = max;
    rr->neg = FALSE;
    if (al == 4) {
        u32 t[8];
        bn_sqr_normal(rr->d, a->d, 4, t);
    } else if (al == 8) {
        u32 t[16];
        bn_sqr_normal(rr->d, a->d, 8, t);
    } else {
        if (bn_wexpand(tmp, max) == NULL) {
            return FALSE;
        }
        bn_sqr_normal(rr->d, a->d, al, tmp->d);
    }

    if (max > 0 && rr->d[max - 1] == 0) {
        rr->top--;
    }
    if (rr != r) {
        (void)BN_copy(r, rr);
    }
    return TRUE;
}

void bn_sqr_normal(u32 *r, u32 *a, int n, u32 *tmp) {
    int i, j;
    int max = n * 2;
    u32 *ap = a;
    u32 *rp = r;
    rp[0] = rp[max - 1] = 0;
    rp++;
    j = n;

    if (--j > 0) {
        ap++;
        rp[j] = bn_mul_words(rp, ap, j, *a);
        rp += 2;
    }

    for (i = n - 2; i > 0; i--) {
        u32 *prevAP = ap;
        j--;
        ap++;
        rp[j] = bn_mul_add_words(rp, ap, j, *prevAP);
        rp += 2;
    }

    (void)bn_add_words(r, r, r, max);
    (void)bn_sqr_words(tmp, a, n);
    (void)bn_add_words(r, r, tmp, max);
}

void bn_from_montgomery_words(u32 *r, u32 *a, u32 *n, int num, u32 n0) {
    u32 carry = 0;
    u32 *hi = a + num;
    int n0w = n0;

    for (int i = 0; i < num; i++) {
        u32 t = bn_mul_add_words(a, n, num, *a * n0w);
        t += carry;
        *hi += t;
        if (t < carry) {
            carry = 1;
        } else {
            carry = 0;
        }
        if (*hi < t) {
            carry += 1;
        }
        a += 1;
        hi += 1;
    }

    int top = num - 1;
    if (carry == 0) {
        if (a[top] == n[top] && top > 0) {
            do {
                if (a[top] != n[top]) {
                    break;
                }
                top--;
            } while (top > 0);
        }
        if (a[top] >= n[top]) {
            carry = 1;
        } else {
            carry = 0;
        }
    }

    if (carry != 0) {
        (void)bn_sub_words(r, a, n, num);
        return;
    }
    for (int i = 0; i < num; i++) {
        r[i] = a[i];
    }
}

u32 BN_mod_inverse_word(u32 word) {
    u32 a;
    u32 x1;
    u32 b = -word % word;
    a = word;
    u32 x0 = 0;
    x1 = 1;
    int sign = -1;
    while (b != 0) {
        u32 rem = a % b;
        u32 q = a / b;
        q *= x1;
        q += x0;
        x0 = x1;
        x1 = q;
        a = b;
        b = rem;
        sign = -sign;
    }
    if (sign < 0) {
        x0 = word - x0;
    }
    u32 ret;
    if (a != 1) {
        ret = 0;
    } else {
        ret = x0 % word;
    }
    return ret;
}

int BN_gen_exp_bits(const BIGNUM *e, u8 **out, int unused, BN_CTX *ctx) {
    int window;
    int numTable;
    int digitsPerWord;
    u8 *str = NULL;
    BIGNUM *tmp = &ctx->bn[ctx->tos];
    int bits = e->top << 5;
    if (e->top == 0) {
        return 0;
    }

    if (e->top == 1) {
        if (BN_is_word(e, 0x10001)) {
            str = (u8 *)gNitroCryptoExpP16;
        } else if (BN_is_word2(e, 0x11)) {
            str = (u8 *)gNitroCryptoExpP4;
        } else if (BN_is_word2(e, 3)) {
            str = (u8 *)gNitroCryptoExpP2;
        }
        window = 1;
        numTable = 1;
        digitsPerWord = 32;
    } else if (bits >= 256) {
        window = 5;
        numTable = 16;
        digitsPerWord = 7;
    } else if (bits >= 128) {
        window = 4;
        numTable = 8;
        digitsPerWord = 8;
    } else {
        window = 3;
        numTable = 4;
        digitsPerWord = 11;
    }

    int len;
    int words = ((e->top * digitsPerWord * 2) + 7) / 4;
    if (str == NULL) {
        if (bn_wexpand(tmp, words) == NULL) {
            return 0;
        }
        str = (u8 *)tmp->d;
        len = BN_gen_exp_string(str + 4, e, window) + 2;
        str[0] = len >> 8;
        str[1] = len;
        str[2] = window;
        str[3] = numTable;
    } else {
        len = 8;
    }
    *out = str;
    return len + 2;
}

int BN_gen_exp_string(u8 *out, const BIGNUM *e, int window) {
    u8 *p;
    int mask;
    u32 nextWord;
    u32 word;
    u32 *wp;
    u32 run;
    int digit;

    if (window > 6) {
        window = 6;
    }
    const u8 *shift = gNitroCryptoShiftVal[window];
    mask = (1 << window) - 1;
    u32 bitPos = 0;
    p = out + ((window + (e->top << 5) - 1) / window * 2 + 2);
    *p-- = 0;
    *p-- = 0;
    int wordsLeft = e->top;
    wp = e->d + 1;
    word = e->d[0];
    u32 bits = e->d[0];
    nextWord = 0;
    if (wordsLeft > 1) {
        nextWord = *wp++;
    }
    run = 0;

    while (TRUE) {
        digit = bits & mask;
        if (shift[digit] != 0) {
            run += shift[digit];
            bitPos += shift[digit];
            if (bitPos >= 32) {
                if (wordsLeft > 1) {
                    wordsLeft -= 1;
                    word = nextWord;
                    if (wordsLeft <= 1) {
                        nextWord = 0;
                    } else {
                        nextWord = *wp++;
                    }
                    bitPos -= 32;
                } else {
                    goto emitDigit;
                }
            }
            if (bitPos == 0) {
                bits = word;
            } else {
                bits = (word >> bitPos) | (nextWord << (32 - bitPos));
            }
            continue;
        }
emitDigit:
        if (digit != 0) {
            *p-- = run;
            *p-- = digit;
            if (run >= 256) {
                for (; run >= 256; run -= 256) {
                    *p-- = 0xFF;
                    *p-- = 0;
                }
            }
            run = window;
            bitPos += window;
            if (bitPos >= 32) {
                if (wordsLeft > 1) {
                    wordsLeft -= 1;
                    word = nextWord;
                    bitPos -= 32;
                    if (wordsLeft <= 1) {
                        nextWord = 0;
                    } else {
                        nextWord = *wp++;
                    }
                } else {
                    break;
                }
            }
            if (bitPos == 0) {
                bits = word;
            } else {
                bits = (word >> bitPos) | (nextWord << (32 - bitPos));
            }
        } else {
            break;
        }
    }
    p++;
    int ret = 2;
    while (p[0] || p[1]) {
        out[0] = p[0];
        out[1] = p[1];
        out += 2;
        p += 2;
        ret += 2;
    }
    out[0] = 0;
    out[1] = 0;
    return ret;
}

BOOL BN_MONT_CTX_set_word(BN_MONT_CTX *mont, const BIGNUM *modulus, BN_CTX *ctx) {
    BIGNUM Ri;

    if (modulus->top == 0) {
        return FALSE;
    }
    BIGNUM *R = &mont->RR;
    if (!BN_copy(&mont->N, modulus)) {
        return FALSE;
    }
    BN_init(&Ri);
    mont->use_word = 1;
    mont->ri = (BN_num_bits(modulus) + (BN_BITS2 - 1)) / BN_BITS2;
    if (!BN_zero(R)) {
        return FALSE;
    }
    if (!BN_set_bit(R, BN_BITS2)) {
        goto err;
    }

    u32 word = modulus->d[0];
    if (BN_set_word(&Ri, BN_mod_inverse_word(word)) == 0) {
        goto err;
    }
    if (!BN_lshift(&Ri, &Ri, BN_BITS2)) {
        goto err;
    }
    if (Ri.top != 0 && (Ri.top != 1 || Ri.d[0])) {
        (void)BN_sub_word(&Ri, 1);
    } else {
        if (!BN_set_word(&Ri, BN_MASK2)) {
            goto err;
        }
    }
    mont->n0 = bn_div_words(Ri.top >= 2 ? Ri.d[1] : 0, Ri.top >= 1 ? Ri.d[0] : 0, word);
    (void)BN_zero(&mont->RR);
    if (!BN_set_bit(&mont->RR, mont->ri * 64)) {
        goto err;
    }
    (void)BN_mod(&mont->RR, &mont->RR, &mont->N, ctx);
    (void)bn_zexpand(&mont->RR, mont->ri);
err:
    BN_free(&Ri);
    return TRUE;
}

BN_MONT_CTX *BN_MONT_CTX_new(void) {
    BN_MONT_CTX *ret = CRYPTOi_MyAlloc(sizeof(BN_MONT_CTX));

    if (ret == NULL) {
        return NULL;
    }
    BN_MONT_CTX_init(ret);
    ret->flags = BN_FLG_MALLOCED;
    return ret;
}

void BN_MONT_CTX_init(BN_MONT_CTX *ctx) {
    ctx->use_word = 0;
    ctx->ri = 0;
    BN_init(&ctx->RR);
    BN_init(&ctx->N);
    BN_init(&ctx->Ni);
    ctx->flags = 0;
}

void BN_MONT_CTX_free(BN_MONT_CTX *mont) {
    BN_free(&mont->RR);
    BN_free(&mont->N);
    BN_free(&mont->Ni);
    if (mont->flags & BN_FLG_MALLOCED) {
        CRYPTOi_MyFree(mont);
    }
}

void BN_RECP_CTX_init(BN_RECP_CTX *recp) {
    BN_init(&recp->N);
    BN_init(&recp->Nr);
    recp->num_bits = 0;
    recp->flags = 0;
}

void BN_RECP_CTX_free(BN_RECP_CTX *recp) {
    BN_free(&recp->N);
    BN_free(&recp->Nr);
    if (recp->flags & BN_FLG_MALLOCED) {
        CRYPTOi_MyFree(recp);
    }
}

int BN_RECP_CTX_set(BN_RECP_CTX *recp, const BIGNUM *d, BN_CTX *ctx) {
    (void)BN_copy(&recp->N, d);
    (void)BN_zero(&recp->Nr);
    recp->num_bits = BN_num_bits(d);
    recp->shift = 0;
    return 1;
}

BOOL BN_mod_mul_reciprocal(BIGNUM *r, BIGNUM *x, BIGNUM *y, BN_RECP_CTX *recp, BN_CTX *ctx) {
    int ret = FALSE;

    BIGNUM *a = &ctx->bn[ctx->tos++];
    if (y != NULL) {
        if (x == y) {
            if (!BN_sqr(a, x, ctx)) {
                goto err;
            }
        } else {
            if (!BN_mul(a, x, y, ctx)) {
                goto err;
            }
        }
    } else {
        a = x; /* Just do the mod */
    }

    (void)BN_div_recp(NULL, r, a, recp, ctx);
    ret = TRUE;
err:
    ctx->tos--;
    return ret;
}

BOOL BN_div_recp(BIGNUM *dv, BIGNUM *rem, BIGNUM *m, BN_RECP_CTX *recp, BN_CTX *ctx) {
    BOOL ret = FALSE;

    int tos = ctx->tos;
    BIGNUM *a = &ctx->bn[ctx->tos++];
    BIGNUM *b = &ctx->bn[ctx->tos++];
    BIGNUM *d, *r;
    if (dv != NULL) {
        d = dv;
    } else {
        d = &ctx->bn[ctx->tos++];
    }
    if (rem != NULL) {
        r = rem;
    } else {
        r = &ctx->bn[ctx->tos++];
    }

    if (BN_ucmp(m, &recp->N) < 0) {
        (void)BN_zero(d);
        (void)BN_copy(r, m);
        ctx->tos = tos;
        return TRUE;
    }

    /* We want the remainder
     * Given input of ABCDEF / ab
     * we need multiply ABCDEF by 3 digests of the reciprocal of ab
     *
     */
    int i = BN_num_bits(m);

    int j = recp->num_bits * 2;
    int ex;
    if (j > i) {
        i = j;
        ex = 0;
    } else {
        ex = (i - j) / 2;
    }

    j = i / 2;

    if (i != recp->shift) {
        recp->shift = BN_reciprocal(&recp->Nr, &recp->N, i, ctx);
    }

    if (!BN_rshift(a, m, j - ex)) {
        goto err;
    }
    if (!BN_mul(b, a, &recp->Nr, ctx)) {
        goto err;
    }
    if (!BN_rshift(d, b, j + ex)) {
        goto err;
    }
    d->neg = FALSE;
    if (!BN_mul(b, &recp->N, d, ctx)) {
        goto err;
    }
    if (!BN_usub(r, m, b)) {
        goto err;
    }
    r->neg = FALSE;

    j = 0;

    while (BN_ucmp(r, &recp->N) >= 0) {
        if (j++ > 2) {
            goto err;
        }
        if (!BN_usub(r, r, &recp->N)) {
            goto err;
        }
        if (!BN_add_word(d, 1)) {
            goto err;
        }
    }

    r->neg = BN_is_zero(r) ? 0 : m->neg;
    d->neg = m->neg ^ recp->N.neg;
    ret = TRUE;
err:
    ctx->tos = tos;
    return ret;
}

int BN_reciprocal(BIGNUM *r, BIGNUM *m, int len, BN_CTX *ctx) {
    int ret = -1;
    BIGNUM t;

    BN_init(&t);

    (void)BN_zero(&t);
    if (!BN_set_bit(&t, len)) {
        goto err;
    }

    if (!BN_div(r, NULL, &t, m, ctx)) {
        goto err;
    }
    ret = len;
err:
    BN_free(&t);
    return ret;
}

u32 bn_div_words(u32 h, u32 l, u32 d) {
    u32 ret = 0;
    u32 dh, dl, q;
    int count = 2;

    if (d == 0) {
        return BN_MASK2;
    }

    int i = BN_num_bits_word(d);
    if (i != BN_BITS2 && h > 1 << i) {
        return 0;
    }
    i = BN_BITS2 - i;
    if (h >= d) {
        h -= d;
    }

    if (i) {
        d <<= i;
        h = (h << i) | (l >> (BN_BITS2 - i));
        l <<= i;
    }
    dh = BN_MASK2l & (d >> BN_BITS4);
    dl = d & BN_MASK2l;
    while (TRUE) {
        if (h >> BN_BITS4 == dh) {
            q = BN_MASK2l;
        } else {
            q = h / dh;
        }

        u32 th = q * dh;
        u32 tl = q * dl;
        u32 t;
        while (TRUE) {
            t = h - th;
            if (t & BN_MASK2h || tl <= (t << BN_BITS4) + (BN_MASK2l & (l >> BN_BITS4))) {
                break;
            }
            th -= dh;
            tl -= dl;
            q--;
        }
        th = q * dh;
        t = q * dl >> BN_BITS4;
        tl = (q * dl & BN_MASK2l) << BN_BITS4;
        th += t;

        if (l < tl) {
            th++;
        }
        l -= tl;
        if (h < th) {
            h += d;
            q--;
        }
        h -= th;

        if (--count == 0) {
            break;
        }

        ret = (q & BN_MASK2l) << BN_BITS4;
        h = ((h << BN_BITS4) | (l >> BN_BITS4)) & BN_MASK2;
        l = (l & BN_MASK2l) << BN_BITS4;
    }
    ret |= q;
    return ret;
}

BOOL BN_mod_exp_recp(BIGNUM *r, const BIGNUM *a, const BIGNUM *p, const BIGNUM *m, BN_CTX *ctx) {
    int i, j;
    BOOL ret = FALSE;
    int start = 1, ts = 0;
    BIGNUM val[16];
    BN_RECP_CTX recp;

    int bits = BN_num_bits(p);
    if (BN_is_zero(a)) {
        (void)BN_zero(r);
        return TRUE;
    }

    if (BN_is_zero(p)) {
        (void)BN_one(r);
        return TRUE;
    }

    if (BN_is_one(p)) {
        (void)BN_copy(r, a);
        return TRUE;
    }

    BN_RECP_CTX_init(&recp);
    if (BN_RECP_CTX_set(&recp, m, ctx) <= 0) {
        goto err;
    }

    BN_init(&val[0]);
    BIGNUM *aa = &ctx->bn[ctx->tos++];
    ts = 1;

    if (!BN_mod(&val[0], a, m, ctx)) {
        goto err; /* 1 */
    }
    if (!BN_mod_mul_reciprocal(aa, &val[0], &val[0], &recp, ctx)) {
        goto err; /* 2 */
    }

    int window;
    if (bits <= 17) { /* This is probably 3 or 0x10001, so just do singles */
        window = 1;
    } else if (bits >= 256) {
        window = 5; /* max size of window */
    } else if (bits >= 128) {
        window = 4;
    } else {
        window = 3;
    }

    j = 1 << (window - 1);
    for (i = 1; i < j; i++) {
        BN_init(&val[i]);
        if (!BN_mod_mul_reciprocal(&val[i], &val[i - 1], aa, &recp, ctx)) {
            goto err;
        }
    }
    ts = i;

    start = 1; /* This is used to avoid multiplication etc
                * when there is only the value '1' in the
                * buffer. */
    int wstart, wend;
    int wvalue = 0;    /* The 'value' of the window */
    wstart = bits - 1; /* The top bit of the window */
    wend = 0;          /* The bottom bit of the window */

    if (!BN_one(r)) {
        goto err;
    }

    while (TRUE) {
        if (!BN_is_bit_set(p, wstart)) {
            if (!start) {
                if (!BN_mod_mul_reciprocal(r, r, r, &recp, ctx)) {
                    goto err;
                }
            }
            if (wstart == 0) {
                break;
            }
            wstart--;
            continue;
        }
        /* We now have wstart on a 'set' bit, we now need to work out
         * how bit a window to do.  To do this we need to scan
         * forward until the last set bit before the end of the
         * window */
        j = wstart;
        wvalue = 1;
        wend = 0;
        for (i = 1; i < window; i++) {
            if (wstart - i < 0) {
                break;
            }
            if (BN_is_bit_set(p, wstart - i)) {
                wvalue <<= (i - wend);
                wvalue |= 1;
                wend = i;
            }
        }

        /* wend is the size of the current window */
        j = wend + 1;
        /* add the 'bytes above' */
        if (!start) {
            for (i = 0; i < j; i++) {
                if (!BN_mod_mul_reciprocal(r, r, r, &recp, ctx)) {
                    goto err;
                }
            }
        }

        /* wvalue will be an odd number < 2^window */
        if (!BN_mod_mul_reciprocal(r, r, &val[wvalue >> 1], &recp, ctx)) {
            goto err;
        }

        /* move the 'window' down further */
        wstart -= wend + 1;
        wvalue = 0;
        start = 0;
        if (wstart < 0) {
            break;
        }
    }
    ret = TRUE;
err:
    ctx->tos--;
    for (i = 0; i < ts; i++) {
        BN_clear_free(&val[i]);
    }
    BN_RECP_CTX_free(&recp);
    return ret;
}

BOOL BN_mod_exp_mont(BIGNUM *rr, BIGNUM *a, const BIGNUM *p, const BIGNUM *m, BN_CTX *ctx, BN_MONT_CTX *in_mont) {
    int ret = FALSE;
    int tosBackup;
    int numTable;
    BIGNUM *aa;
    BN_MONT_CTX *mont = NULL;
    u8 *expBits = NULL;
    UnusedFunc *unusedFunc = NULL;
    int progress = 0;

    if (!(m->d[0] & 1)) {
        return FALSE;
    }

    tosBackup = ctx->tos;
    if (BN_is_zero(a)) {
        (void)BN_zero(rr);
        return TRUE;
    }

    if (BN_is_zero(p)) {
        (void)BN_one(rr);
        return TRUE;
    }

    if (BN_is_one(p)) {
        (void)BN_copy(rr, a);
        return TRUE;
    }

    if (in_mont != NULL) {
        mont = in_mont;
    } else {
        if ((mont = BN_MONT_CTX_new()) == NULL) {
            goto err;
        }
        if (!BN_MONT_CTX_set_word(mont, m, ctx)) {
            goto err;
        }
    }

    unusedFunc = ctx->unusedFunc;
    if (!BN_gen_exp_bits(p, &expBits, 0, ctx)) {
        goto err;
    }

    ctx->tos++;
    numTable = expBits[3];
    int digitsPerWord = (expBits[2] + 63) / expBits[2];
    expBits += 4;

    int nTop = mont->N.top;
    if (a->top == nTop && a->d[nTop - 1] < m->d[nTop - 1]) {
        aa = a;
    } else if (a->top < nTop) {
        aa = &ctx->bn[ctx->tos++];
        aa->top = a->top;
        bn_zexpand(aa, nTop);
        for (int i = 0; i < a->top; i++) {
            aa->d[i] = a->d[i];
        }
    } else {
        aa = &ctx->bn[ctx->tos++];
        if (BN_mod(aa, a, m, ctx) == 0) {
            goto err;
        }
        bn_zexpand(aa, nTop);
    }

    BIGNUM *tmp;
    BIGNUM *acc;
    BIGNUM *prod;
    int tableWords = numTable * nTop + (p->top * digitsPerWord * 2 + 7) / 4;
    BIGNUM *table = &ctx->bn[ctx->tos++];
    tmp = &ctx->bn[ctx->tos++];
    acc = &ctx->bn[ctx->tos++];
    prod = &ctx->bn[ctx->tos++];
    if (bn_wexpand(rr, nTop) == NULL) {
        goto err;
    }
    if (bn_wexpand(tmp, nTop * 4) == NULL) {
        goto err;
    }
    if (bn_wexpand(acc, nTop * 2) == NULL) {
        goto err;
    }
    if (bn_wexpand(table, tableWords) == NULL) {
        goto err;
    }
    if (bn_wexpand(prod, nTop * 2) == NULL) {
        goto err;
    }

    int squares;
    u32 *tmpD = tmp->d;
    u32 *accD = acc->d;
    u32 n0w = mont->n0;
    u32 *prodD = prod->d;
    u32 *nD = mont->N.d;
    u32 *tableD[0x10];
    tableD[0] = table->d;
    bn_mul_normal(prodD, aa->d, nTop, mont->RR.d, nTop);
    bn_from_montgomery_words(tableD[0], prodD, nD, nTop, n0w);

    if (numTable > 1) {
        bn_sqr_normal(prodD, tableD[0], nTop, tmpD);
        bn_from_montgomery_words(tmpD, prodD, nD, nTop, n0w);
        for (int i = 1; i < numTable; i++) {
            tableD[i] = &tableD[i - 1][nTop];
            bn_mul_normal(prodD, tableD[i - 1], nTop, tmpD, nTop);
            bn_from_montgomery_words(tableD[i], prodD, nD, nTop, n0w);
        }
    }

    int digit = *expBits++;
    squares = *expBits++;
    if (squares == 0xFF && digit == 0) {
        digit = *expBits++;
        while (expBits[0] == 0xFF && digit == 0) {
            squares += 0x100;
            expBits++;
            digit = *expBits++;
        }
        squares += *expBits++ + 1;
    }

    MI_CpuCopy8(tableD[digit >> 1], accD, nTop * sizeof(u32));

    while (squares != 0) {
        if (!((unusedFunc == NULL || (*unusedFunc)(unusedFunc, -1, progress++) == 0) && !(ctx->flags & 0x4000))) {
            goto err;
        }

        for (int i = 0; i < squares; i++) {
            bn_sqr_normal(prodD, accD, nTop, tmpD);
            bn_from_montgomery_words(accD, prodD, nD, nTop, n0w);
        }

        digit = *expBits++;
        squares = *expBits++;
        if (squares == 0xFF && digit == 0) {
            digit = *expBits++;
            while (expBits[0] == 0xFF && digit == 0) {
                squares += 0x100;
                expBits++;
                digit = *expBits++;
            }
            squares += *expBits++ + 1;
        }

        if (digit != 0 || squares != 0) {
            if (squares != 0 || digit != 1) {
                bn_mul_normal(prodD, accD, nTop, tableD[digit >> 1], nTop);
                bn_from_montgomery_words(accD, prodD, nD, nTop, n0w);
            } else {
                bn_mul_normal(prodD, accD, nTop, aa->d, nTop);
                bn_from_montgomery_words(rr->d, prodD, nD, nTop, n0w);
                goto done;
            }
        } else {
            break;
        }
    }

    for (int i = nTop; i < nTop * 2; i++) {
        accD[i] = 0;
    }
    bn_from_montgomery_words(rr->d, accD, nD, nTop, n0w);

done:
    if (!(ctx->flags & 0x4000)) {
        rr->top = nTop;
        bn_fix_top(rr);
        ret = TRUE;
    }
err:
    if (unusedFunc) {
        if ((*unusedFunc)(unusedFunc, -1, -1) != 0) {
            ret = FALSE;
        }
    }

    if (in_mont == NULL && mont != NULL) {
        BN_MONT_CTX_free(mont);
    }

    ctx->tos = tosBackup;
    return ret;
}
