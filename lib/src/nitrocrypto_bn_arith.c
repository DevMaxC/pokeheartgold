#include "nitrocrypto_bn.h"

// Big-number division, multiplication, signed and unsigned addition / subtraction, shifts,
// word arithmetic and the word-array primitives they use.

// MWCC 1.2 emits a file's functions in reverse order: the functions are defined last-to-first here
// (link order is bottom-up).

u32 bn_mul_add_words(u32 *rp, u32 *ap, int num, u32 w) {
    u32 c = 0;

    if (num <= 0) {
        return 0;
    }

    u32 bl = LBITS(w);
    u32 bh = HBITS(w);

    while (TRUE) {
        mul_add(rp[0], ap[0], bl, bh, c);
        if (--num == 0) {
            break;
        }
        mul_add(rp[1], ap[1], bl, bh, c);
        if (--num == 0) {
            break;
        }
        mul_add(rp[2], ap[2], bl, bh, c);
        if (--num == 0) {
            break;
        }
        mul_add(rp[3], ap[3], bl, bh, c);
        if (--num == 0) {
            break;
        }
        ap += 4;
        rp += 4;
    }
    return c;
}

u32 bn_mul_words(u32 *rp, u32 *ap, int num, u32 w) {
    u32 carry = 0;

    if (num <= 0) {
        return 0;
    }

    u32 bl = LBITS(w);
    u32 bh = HBITS(w);

    while (TRUE) {
        mul(rp[0], ap[0], bl, bh, carry);
        if (--num == 0) {
            break;
        }
        mul(rp[1], ap[1], bl, bh, carry);
        if (--num == 0) {
            break;
        }
        mul(rp[2], ap[2], bl, bh, carry);
        if (--num == 0) {
            break;
        }
        mul(rp[3], ap[3], bl, bh, carry);
        if (--num == 0) {
            break;
        }
        ap += 4;
        rp += 4;
    }
    return carry;
}

void bn_sqr_words(u32 *r, u32 *a, int n) {
    if (n <= 0) {
        return;
    }
    while (TRUE) {
        sqr64(r[0], r[1], a[0]);
        if (--n == 0) {
            break;
        }

        sqr64(r[2], r[3], a[1]);
        if (--n == 0) {
            break;
        }

        sqr64(r[4], r[5], a[2]);
        if (--n == 0) {
            break;
        }

        sqr64(r[6], r[7], a[3]);
        if (--n == 0) {
            break;
        }

        a += 4;
        r += 8;
    }
}

u32 bn_add_words(u32 *r, u32 *a, u32 *b, int n) {
    if (n <= 0) {
        return 0;
    }

    u32 c = 0;
    u32 l, t;
    while (TRUE) {
        t = a[0];
        t = (t + c) & BN_MASK2;
        c = t < c;
        l = (t + b[0]) & BN_MASK2;
        c += l < t;
        r[0] = l;
        if (--n <= 0) {
            break;
        }

        t = a[1];
        t = (t + c) & BN_MASK2;
        c = t < c;
        l = (t + b[1]) & BN_MASK2;
        c += l < t;
        r[1] = l;
        if (--n <= 0) {
            break;
        }

        t = a[2];
        t = (t + c) & BN_MASK2;
        c = t < c;
        l = (t + b[2]) & BN_MASK2;
        c += l < t;
        r[2] = l;
        if (--n <= 0) {
            break;
        }

        t = a[3];
        t = (t + c) & BN_MASK2;
        c = t < c;
        l = (t + b[3]) & BN_MASK2;
        c += l < t;
        r[3] = l;
        if (--n <= 0) {
            break;
        }

        a += 4;
        b += 4;
        r += 4;
    }

    return c;
}

u32 bn_sub_words(u32 *r, u32 *a, u32 *b, int n) {
    if (n <= 0) {
        return 0;
    }

    u32 c = 0;
    while (TRUE) {
        u32 t1 = a[0];
        u32 t2 = b[0];
        r[0] = (t1 - t2 - c) & BN_MASK2;
        if (t1 != t2) {
            c = t1 < t2;
        }
        if (--n <= 0) {
            break;
        }

        t1 = a[1];
        t2 = b[1];
        r[1] = (t1 - t2 - c) & BN_MASK2;
        if (t1 != t2) {
            c = t1 < t2;
        }
        if (--n <= 0) {
            break;
        }

        t1 = a[2];
        t2 = b[2];
        r[2] = (t1 - t2 - c) & BN_MASK2;
        if (t1 != t2) {
            c = t1 < t2;
        }
        if (--n <= 0) {
            break;
        }

        t1 = a[3];
        t2 = b[3];
        r[3] = (t1 - t2 - c) & BN_MASK2;
        if (t1 != t2) {
            c = t1 < t2;
        }
        if (--n <= 0) {
            break;
        }

        a += 4;
        b += 4;
        r += 4;
    }

    return c;
}

BOOL BN_lshift(BIGNUM *r, const BIGNUM *a, int n) {
    if (bn_wexpand(r, a->top + (n / BN_BITS2) + 1) == NULL) {
        return 0;
    }

    r->neg = a->neg;
    int nw = n / BN_BITS2;
    int lb = n % BN_BITS2;
    int rb = BN_BITS2 - lb;
    u32 *f = a->d;
    u32 *t = r->d;
    t[a->top + nw] = 0;
    if (lb == 0) {
        for (int i = a->top - 1; i >= 0; i--) {
            t[nw + i] = f[i];
        }
    } else {
        for (int i = a->top - 1; i >= 0; i--) {
            u32 l = f[i];
            t[nw + i + 1] |= (l >> rb) & BN_MASK2;
            t[nw + i] = (l << lb) & BN_MASK2;
        }
    }
    MI_CpuFill8(t, 0, nw * sizeof(t[0]));
    r->top = a->top + nw + 1;
    bn_fix_top(r);
    return TRUE;
}

BOOL BN_rshift(BIGNUM *r, BIGNUM *a, int n) {
    int i, j;

    int nw = n / BN_BITS2;
    int lb;
    int rb = n % BN_BITS2;
    lb = BN_BITS2 - rb;
    if (nw > a->top) {
        (void)BN_zero(r);
        return TRUE;
    }
    if (r != a) {
        if (bn_wexpand(r, a->top - nw + 2) == NULL) {
            return FALSE;
        }

        r->neg = a->neg;
    }
    u32 *f = &a->d[nw];
    u32 *t = r->d;
    j = a->top - nw;
    r->top = j;

    if (rb == 0) {
        for (i = j + 1; i > 0; i--) {
            *t++ = *f++;
        }
    } else {
        u32 l = *f++;
        for (i = 1; i < j; i++) {
            u32 tmp = (l >> rb) & BN_MASK2;
            l = *f++;
            *t++ = (tmp | (l << lb)) & BN_MASK2;
        }
        *t++ = (l >> rb) & BN_MASK2;
        *t = 0;
    }
    bn_fix_top(r);
    return TRUE;
}

BOOL BN_add_word(BIGNUM *a, u32 w) {
    if (w == 0) {
        return TRUE;
    }

    if (a->neg) {
        if (a->top > 1) {
            a->neg = FALSE;
            int result = BN_sub_word(a, w);
            a->neg = TRUE;
            return result;
        } else {
            u32 d = a->d[0];
            if (d > w) {
                a->d[0] -= w;
            } else if (d < w) {
                a->neg = FALSE;
                a->d[0] = w - d;
            } else {
                a->neg = FALSE;
                a->top = 0;
            }
            return TRUE;
        }
    }

    if (bn_wexpand(a, a->top + 1) == NULL) {
        return FALSE;
    }

    int i = 0;
    a->d[a->top] = 0;
    while (TRUE) {
        u32 l = (a->d[i] + w) & BN_MASK2;
        a->d[i] = l;
        if (w > l) {
            w = 1;
        } else {
            break;
        }
        i++;
    }

    if (i >= a->top) {
        a->top++;
    }

    return TRUE;
}

BOOL BN_sub_word(BIGNUM *a, u32 w) {
    if (w == 0) {
        return TRUE;
    }

    if (a->neg) {
        a->neg = FALSE;
        int result = BN_add_word(a, w);
        a->neg = TRUE;
        return result;
    }

    if (a->top <= 1) {
        if (a->top == 0) {
            if (bn_wexpand(a, 1) == NULL) {
                return FALSE;
            }

            a->d[0] = w;
            a->neg = TRUE;
            a->top = 1;
            return TRUE;
        } else {
            u32 d = a->d[0];
            if (d == w) {
                a->top = 0;
            } else if (d > w) {
                a->d[0] -= w;
            } else {
                a->neg = TRUE;
                a->d[0] = w - d;
            }
            return TRUE;
        }
    }
    int i = 0;
    while (TRUE) {
        if (a->d[i] >= w) {
            a->d[i] -= w;
            break;
        } else {
            a->d[i] = (a->d[i] - w) & BN_MASK2;
            i++;
            w = 1;
        }
    }
    if (a->d[i] == 0 && i == a->top - 1) {
        a->top--;
    }
    return TRUE;
}

BOOL BN_add(BIGNUM *r, const BIGNUM *a, const BIGNUM *b) {
    /*  a +  b	a+b
     *  a + -b	a-b
     * -a +  b	b-a
     * -a + -b	-(a+b)
     */
    if (a->neg ^ b->neg) {
        /* only one is negative */
        if (a->neg) {
            const BIGNUM *tmp = a;
            a = b;
            b = tmp;
        }

        /* we are now a - b */

        if (BN_ucmp(a, b) < 0) {
            if (!BN_usub(r, b, a)) {
                return FALSE;
            }
            r->neg = TRUE;
        } else {
            if (!BN_usub(r, a, b)) {
                return FALSE;
            }
            r->neg = FALSE;
        }
        return TRUE;
    }

    if (a->neg) { /* both are neg */
        r->neg = TRUE;
    } else {
        r->neg = FALSE;
    }

    if (!BN_uadd(r, a, b)) {
        return FALSE;
    }
    return TRUE;
}

BOOL BN_uadd(BIGNUM *r, const BIGNUM *a, const BIGNUM *b) {
    int i;

    if (a->top < b->top) {
        const BIGNUM *tmp = a;
        a = b;
        b = tmp;
    }
    int max = a->top;
    int min = b->top;

    if (bn_wexpand(r, max + 1) == NULL) {
        return FALSE;
    }

    r->top = max;

    u32 *ap = a->d;
    u32 *bp = b->d;
    u32 *rp = r->d;
    u32 carry = bn_add_words(rp, ap, bp, min);

    rp += min;
    ap += min;
    bp += min;
    i = min;

    if (carry) {
        while (i < max) {
            i++;
            u32 t1 = *ap++;
            if ((*rp++ = (t1 + 1) & BN_MASK2) >= t1) {
                carry = 0;
                break;
            }
        }
        if (i >= max && carry) {
            *rp++ = 1;
            r->top++;
        }
    }

    if (rp != ap) {
        for (; i < max; i++) {
            *rp++ = *ap++;
        }
    }

    return TRUE;
}

BOOL BN_usub(BIGNUM *r, const BIGNUM *a, const BIGNUM *b) {
    u32 t1, t2;

    if (a->top < b->top) /* hmm... should not be happening */
    {
        return FALSE;
    }

    int max = a->top;
    int min = b->top;
    if (bn_wexpand(r, max) == NULL) {
        return FALSE;
    }

    u32 *ap = a->d;
    u32 *bp = b->d;
    u32 *rp = r->d;

    BOOL carry = FALSE;
    int i;
    for (i = 0; i < min; i++) {
        t1 = *ap++;
        t2 = *bp++;
        if (carry) {
            carry = t1 <= t2;
            t1 = (t1 - t2 - 1) & BN_MASK2;
        } else {
            carry = t1 < t2;
            t1 = (t1 - t2) & BN_MASK2;
        }
        *rp++ = t1 & BN_MASK2;
    }

    if (carry) /* subtracted */
    {
        while (i < max) {
            i++;
            t1 = *(ap++);
            t2 = (t1 - 1) & BN_MASK2;
            *rp++ = t2;
            if (t1 > t2) {
                break;
            }
        }
    }

    if (rp != ap) {
        while (TRUE) {
            if (i++ >= max) {
                break;
            }
            rp[0] = ap[0];
            if (i++ >= max) {
                break;
            }
            rp[1] = ap[1];
            if (i++ >= max) {
                break;
            }
            rp[2] = ap[2];
            if (i++ >= max) {
                break;
            }
            rp[3] = ap[3];
            rp += 4;
            ap += 4;
        }
    }

    r->top = max;
    bn_fix_top(r);
    return TRUE;
}

BOOL BN_sub(BIGNUM *r, const BIGNUM *a, const BIGNUM *b) {
    BOOL add = FALSE, neg = FALSE;

    /*  a -  b	a-b
     *  a - -b	a+b
     * -a -  b	-(a+b)
     * -a - -b	b-a
     */
    if (a->neg) {
        if (b->neg) {
            const BIGNUM *tmp = a;
            a = b;
            b = tmp;
        } else {
            add = TRUE;
            neg = TRUE;
        }
    } else {
        if (b->neg) {
            add = TRUE;
            neg = FALSE;
        }
    }

    if (add) {
        if (!BN_uadd(r, a, b)) {
            return FALSE;
        }
        r->neg = neg;
        return TRUE;
    }

    /* We are actually doing a - b :-) */

    int max = a->top > b->top ? a->top : b->top;
    if (bn_wexpand(r, max) == NULL) {
        return FALSE;
    }

    if (BN_ucmp(a, b) < 0) {
        if (!BN_usub(r, b, a)) {
            return FALSE;
        }
        r->neg = TRUE;
    } else {
        if (!BN_usub(r, a, b)) {
            return FALSE;
        }
        r->neg = FALSE;
    }

    return TRUE;
}

BOOL BN_mul(BIGNUM *r, BIGNUM *a, BIGNUM *b, BN_CTX *ctx) {
    int top;

    int al = a->top;
    int bl = b->top;

    if (al == 0 || bl == 0) {
        (void)(void)BN_zero(r);
        return TRUE;
    }

    top = al + bl;
    BOOL neg = a->neg ^ b->neg;

    BIGNUM *rr;
    if (r == a || r == b) {
        rr = &ctx->bn[ctx->tos + 1];
    } else {
        rr = r;
    }

    /* asymmetric and >= 4 */
    if (bn_wexpand(rr, top) == NULL) {
        return FALSE;
    }

    rr->top = top;
    bn_mul_normal(rr->d, a->d, al, b->d, bl);
    r->neg = neg;

    bn_fix_top(rr);
    if (r != rr) {
        (void)BN_copy(r, rr);
    }
    return TRUE;
}

void bn_mul_normal(u32 *r, u32 *a, int na, u32 *b, int nb) {
    if (na < nb) {
        int itmp = na;
        na = nb;
        nb = itmp;
        u32 *ltmp = a;
        a = b;
        b = ltmp;
    }

    u32 *rr = &r[na];
    rr[0] = bn_mul_words(r, a, na, b[0]);

    while (TRUE) {
        if (--nb <= 0) {
            return;
        }
        rr[1] = bn_mul_add_words(&r[1], a, na, b[1]);
        if (--nb <= 0) {
            return;
        }
        rr[2] = bn_mul_add_words(&r[2], a, na, b[2]);
        if (--nb <= 0) {
            return;
        }
        rr[3] = bn_mul_add_words(&r[3], a, na, b[3]);
        if (--nb <= 0) {
            return;
        }
        rr[4] = bn_mul_add_words(&r[4], a, na, b[4]);
        rr += 4;
        r += 4;
        b += 4;
    }
}

BOOL BN_div(BIGNUM *dv, BIGNUM *rm, const BIGNUM *num, const BIGNUM *divisor, BN_CTX *ctx) {
    int norm_shift, i, j, loop;
    BIGNUM *tmp, wnum, *snum, *sdiv, *res;
    u32 *resp, *wnump;
    u32 d0, d1;

    if (BN_is_zero(divisor)) {
        return FALSE;
    }

    if (BN_ucmp(num, divisor) < 0) {
        if (rm != NULL) {
            if (BN_copy(rm, num) == NULL) {
                return FALSE;
            }
        }
        if (dv != NULL) {
            (void)BN_zero(dv);
        }
        return TRUE;
    }

    tmp = &ctx->bn[ctx->tos];
    tmp->neg = FALSE;
    snum = &ctx->bn[ctx->tos + 1];
    sdiv = &ctx->bn[ctx->tos + 2];
    if (dv == NULL) {
        res = &ctx->bn[ctx->tos + 3];
    } else {
        res = dv;
    }

    /* First we normalise the numbers */
    norm_shift = BN_BITS2 - BN_num_bits(divisor) % BN_BITS2;
    if (!BN_lshift(sdiv, divisor, norm_shift)) {
        return FALSE;
    }
    sdiv->neg = FALSE;
    norm_shift += BN_BITS2;
    if (!BN_lshift(snum, num, norm_shift)) {
        return FALSE;
    }
    snum->neg = FALSE;
    int div_n = sdiv->top;
    int num_n = snum->top;
    loop = num_n - div_n;

    /* Lets setup a 'window' into snum
     * This is the part that corresponds to the current
     * 'area' being divided */
    BN_init(&wnum);
    wnum.d = &snum->d[loop];
    wnum.top = div_n;
    wnum.max = snum->max + 1; /* a bit of a lie */

    /* Get the top 2 words of sdiv */
    d0 = sdiv->d[div_n - 1];
    d1 = div_n == 1 ? 0 : sdiv->d[div_n - 2];

    /* pointer to the 'top' of snum */
    wnump = &snum->d[num_n - 1];

    /* Setup to 'res' */

    if (bn_wexpand(res, loop + 1) == NULL) {
        goto err;
    }

    res->neg = num->neg ^ divisor->neg;
    res->top = loop;
    resp = &res->d[loop - 1];

    /* space for temp */
    if (bn_wexpand(tmp, div_n + 1) == NULL) {
        goto err;
    }

    if (BN_ucmp(&wnum, sdiv) >= 0) {
        if (!BN_usub(&wnum, &wnum, sdiv)) {
            goto err;
        }
        *resp = 1;
        res->d[res->top - 1] = 1;
    } else {
        res->top--;
    }
    resp--;

    for (i = 0; i < loop - 1; i++) {
        u32 q;

        wnum.d--;
        wnum.top++;
        u32 n0 = wnump[0];
        u32 n1 = wnump[-1];
        if (n0 == d0) {
            q = BN_MASK2;
        } else { /* n0 < d0 */
            q = bn_div_words(n0, n1, d0);
        }

        u32 t1h = n0;
        u32 t1l = n1;
        while (TRUE) {
            u32 t2l = LBITS(d1);
            u32 t2h = HBITS(d1);
            u32 t3l, t3h;
            u32 ql = LBITS(q);
            u32 qh = HBITS(q);
            mul64(t2l, t2h, ql, qh); /* t2=(BN_ULLONG)d1*q; */

            u32 t3t = LBITS(d0);
            t3h = HBITS(d0);
            mul64(t3t, t3h, ql, qh); /* t3=t1-(BN_ULLONG)q*d0; */
            t3l = (t1l - t3t) & BN_MASK2;
            if (t3l > t1l) {
                t3h++;
            }
            t3h = (t1h - t3h) & BN_MASK2;

            if (t3h) {
                break;
            }
            if (t2h < t3l) {
                break;
            }
            if (t2h == t3l && t2l <= wnump[-2]) {
                break;
            }

            q--;
        }

        tmp->d[div_n] = bn_mul_words(tmp->d, sdiv->d, div_n, q);
        for (j = div_n + 1; j > 0; j--) {
            if (tmp->d[j - 1]) {
                break;
            }
        }
        tmp->top = j;

        j = wnum.top;
        (void)BN_sub(&wnum, &wnum, tmp);

        snum->top = snum->top + wnum.top - j;

        if (wnum.neg) {
            q--;
            j = wnum.top;
            (void)BN_add(&wnum, &wnum, sdiv);
            snum->top += wnum.top - j;
        }
        *resp-- = q;
        wnump--;
    }
    bn_fix_top(snum);
    if (rm != NULL) {
        BOOL neg = num->neg;
        if (!BN_rshift(rm, snum, norm_shift)) {
            return FALSE;
        }
        rm->neg = neg;
    }
    return TRUE;
err:
    return FALSE;
}
