#include <nitro/fx/fx.h>
#include <nitro/fx/fx_mtx33.h>

#define RND(a, b, c, d) ((fx32)(((s64)(a) * (b) - (s64)(c) * (d) + 0x800) >> 12))
#define RAW(a, b, c, d) ((fx32)(((s64)(a) * (b) - (s64)(d) * (c)) >> 12))
#define MUL(a, b)       ((fx32)(((s64)(a) * (b)) >> 12))

void FX_InvAsync(fx32);
fx32 FX_GetDivResult(void);
void MI_Copy36B(const void *, void *);
int MTX_Inverse33(const MtxFx33 *, MtxFx33 *);

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

#pragma force_active on

int MTX_Inverse33(const MtxFx33 *s, MtxFx33 *dst) {
    MtxFx33 temp;
    fx32 a22, a10, a20, a12, a11, a21;
    a12 = s->_12;
    a20 = s->_20;
    a10 = s->_10;
    a22 = s->_22;
    a11 = s->_11;
    a21 = s->_21;
    MtxFx33 *out = s == dst ? &temp : dst;
    s64 c0 = RND(a10, a22, a12, a20);
    s64 c1 = RND(a11, a22, a12, a21);
    s64 c2 = RND(a10, a21, a11, a20);
    fx32 det = (fx32)(((s64)s->_00 * (fx32)c1 - (s64)s->_01 * (fx32)c0 + (s64)s->_02 * (fx32)c2 + 0x800) >> 12);
    fx32 d01, d02, d11, d12, inv;
    if (!det) {
        return -1;
    }
    FX_InvAsync(det);
    d01 = RAW(s->_01, s->_22, s->_02, s->_21);
    d02 = RAW(s->_01, s->_12, s->_02, s->_11);
    d11 = RAW(s->_00, s->_22, s->_02, s->_20);
    d12 = RAW(s->_00, s->_12, s->_02, s->_10);
    inv = FX_GetDivResult();
    out->_00 = MUL(inv, c1);
    out->_01 = -MUL(inv, d01);
    out->_02 = MUL(inv, d02);
    out->_10 = -MUL(inv, c0);
    out->_11 = MUL(inv, d11);
    out->_12 = -MUL(inv, d12);
    out->_20 = MUL(inv, c2);
    out->_21 = -MUL(inv, RAW(s->_00, s->_21, s->_01, s->_20));
    out->_22 = MUL(inv, RAW(s->_00, s->_11, s->_01, s->_10));
    if (out == &temp) {
        MI_Copy36B(&temp, dst);
    }
    return 0;
}

#pragma force_active off

void MTX_Concat33(const MtxFx33 *a, const MtxFx33 *b, MtxFx33 *c) {
    MtxFx33 temp;
    MtxFx33 *dst;
    fx32 a0, a1, a2;
    fx32 b0, b1, b2;

    if (c == b) {
        dst = &temp;
    } else {
        dst = c;
    }

    a0 = a->a[0];
    a1 = a->a[1];
    a2 = a->a[2];
    dst->a[0] = (fx32)(((fx64)a0 * b->a[0] + (fx64)a1 * b->a[3] + (fx64)a2 * b->a[6]) >> FX32_SHIFT);
    dst->a[1] = (fx32)(((fx64)a0 * b->a[1] + (fx64)a1 * b->a[4] + (fx64)a2 * b->a[7]) >> FX32_SHIFT);
    b0 = b->a[2];
    b1 = b->a[5];
    b2 = b->a[8];
    dst->a[2] = (fx32)(((fx64)a0 * b0 + (fx64)a1 * b1 + (fx64)a2 * b2) >> FX32_SHIFT);
    a0 = a->a[3];
    a1 = a->a[4];
    a2 = a->a[5];
    dst->a[5] = (fx32)(((fx64)a0 * b0 + (fx64)a1 * b1 + (fx64)a2 * b2) >> FX32_SHIFT);
    dst->a[4] = (fx32)(((fx64)a0 * b->a[1] + (fx64)a1 * b->a[4] + (fx64)a2 * b->a[7]) >> FX32_SHIFT);
    b0 = b->a[0];
    b1 = b->a[3];
    b2 = b->a[6];
    dst->a[3] = (fx32)(((fx64)a0 * b0 + (fx64)a1 * b1 + (fx64)a2 * b2) >> FX32_SHIFT);
    a0 = a->a[6];
    a1 = a->a[7];
    a2 = a->a[8];
    dst->a[6] = (fx32)(((fx64)a0 * b0 + (fx64)a1 * b1 + (fx64)a2 * b2) >> FX32_SHIFT);
    dst->a[7] = (fx32)(((fx64)a0 * b->a[1] + (fx64)a1 * b->a[4] + (fx64)a2 * b->a[7]) >> FX32_SHIFT);
    b0 = b->a[2];
    b1 = b->a[5];
    b2 = b->a[8];
    dst->a[8] = (fx32)(((fx64)a0 * b0 + (fx64)a1 * b1 + (fx64)a2 * b2) >> FX32_SHIFT);

    if (dst == &temp) {
        *c = temp;
    }
}

void MTX_MultVec33(const VecFx32 *vec, const MtxFx33 *mtx, VecFx32 *dst) {
    fx32 x, y, z;
    x = vec->x;
    y = vec->y;
    z = vec->z;
    dst->x = (fx32)(((fx64)x * mtx->a[0] + (fx64)y * mtx->a[3] + (fx64)z * mtx->a[6]) >> FX32_SHIFT);
    dst->y = (fx32)(((fx64)x * mtx->a[1] + (fx64)y * mtx->a[4] + (fx64)z * mtx->a[7]) >> FX32_SHIFT);
    dst->z = (fx32)(((fx64)x * mtx->a[2] + (fx64)y * mtx->a[5] + (fx64)z * mtx->a[8]) >> FX32_SHIFT);
}
