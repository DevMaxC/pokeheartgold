#include <nitro.h>
#include <nitro/code32.h>

void MI_Copy48B(const void *pSrc, void *pDest);

void MTX_Concat44(const MtxFx44 *a, const MtxFx44 *b, MtxFx44 *c) {
    MtxFx44 temp;
    MtxFx44 *dst;
    fx32 a0, a1, a2, a3;
    fx32 b0, b1, b2, b3;

    if (c == b) {
        dst = &temp;
    } else {
        dst = c;
    }

    a0 = a->a[0];
    a1 = a->a[1];
    a2 = a->a[2];
    a3 = a->a[3];
    dst->a[0] = (fx32)(((fx64)a0 * b->a[0] + (fx64)a1 * b->a[4] + (fx64)a2 * b->a[8] + (fx64)a3 * b->a[12]) >> FX32_SHIFT);
    dst->a[1] = (fx32)(((fx64)a0 * b->a[1] + (fx64)a1 * b->a[5] + (fx64)a2 * b->a[9] + (fx64)a3 * b->a[13]) >> FX32_SHIFT);
    dst->a[3] = (fx32)(((fx64)a0 * b->a[3] + (fx64)a1 * b->a[7] + (fx64)a2 * b->a[11] + (fx64)a3 * b->a[15]) >> FX32_SHIFT);
    b0 = b->a[2];
    b1 = b->a[6];
    b2 = b->a[10];
    b3 = b->a[14];
    dst->a[2] = (fx32)(((fx64)a0 * b0 + (fx64)a1 * b1 + (fx64)a2 * b2 + (fx64)a3 * b3) >> FX32_SHIFT);
    a0 = a->a[4];
    a1 = a->a[5];
    a2 = a->a[6];
    a3 = a->a[7];
    dst->a[6] = (fx32)(((fx64)a0 * b0 + (fx64)a1 * b1 + (fx64)a2 * b2 + (fx64)a3 * b3) >> FX32_SHIFT);
    dst->a[5] = (fx32)(((fx64)a0 * b->a[1] + (fx64)a1 * b->a[5] + (fx64)a2 * b->a[9] + (fx64)a3 * b->a[13]) >> FX32_SHIFT);
    dst->a[7] = (fx32)(((fx64)a0 * b->a[3] + (fx64)a1 * b->a[7] + (fx64)a2 * b->a[11] + (fx64)a3 * b->a[15]) >> FX32_SHIFT);
    b0 = b->a[0];
    b1 = b->a[4];
    b2 = b->a[8];
    b3 = b->a[12];
    dst->a[4] = (fx32)(((fx64)a0 * b0 + (fx64)a1 * b1 + (fx64)a2 * b2 + (fx64)a3 * b3) >> FX32_SHIFT);
    a0 = a->a[8];
    a1 = a->a[9];
    a2 = a->a[10];
    a3 = a->a[11];
    dst->a[8] = (fx32)(((fx64)a0 * b0 + (fx64)a1 * b1 + (fx64)a2 * b2 + (fx64)a3 * b3) >> FX32_SHIFT);
    dst->a[9] = (fx32)(((fx64)a0 * b->a[1] + (fx64)a1 * b->a[5] + (fx64)a2 * b->a[9] + (fx64)a3 * b->a[13]) >> FX32_SHIFT);
    dst->a[11] = (fx32)(((fx64)a0 * b->a[3] + (fx64)a1 * b->a[7] + (fx64)a2 * b->a[11] + (fx64)a3 * b->a[15]) >> FX32_SHIFT);
    b0 = b->a[2];
    b1 = b->a[6];
    b2 = b->a[10];
    b3 = b->a[14];
    dst->a[10] = (fx32)(((fx64)a0 * b0 + (fx64)a1 * b1 + (fx64)a2 * b2 + (fx64)a3 * b3) >> FX32_SHIFT);
    a0 = a->a[12];
    a1 = a->a[13];
    a2 = a->a[14];
    a3 = a->a[15];
    dst->a[14] = (fx32)(((fx64)a0 * b0 + (fx64)a1 * b1 + (fx64)a2 * b2 + (fx64)a3 * b3) >> FX32_SHIFT);
    dst->a[13] = (fx32)(((fx64)a0 * b->a[1] + (fx64)a1 * b->a[5] + (fx64)a2 * b->a[9] + (fx64)a3 * b->a[13]) >> FX32_SHIFT);
    dst->a[12] = (fx32)(((fx64)a0 * b->a[0] + (fx64)a1 * b->a[4] + (fx64)a2 * b->a[8] + (fx64)a3 * b->a[12]) >> FX32_SHIFT);
    dst->a[15] = (fx32)(((fx64)a0 * b->a[3] + (fx64)a1 * b->a[7] + (fx64)a2 * b->a[11] + (fx64)a3 * b->a[15]) >> FX32_SHIFT);
    if (dst == &temp) {
        *c = temp;
    }
}
