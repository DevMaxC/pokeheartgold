#include <nitro.h>

fx32 VEC_Distance(const VecFx32 *a, const VecFx32 *b);
fx32 VEC_Fx16DotProduct(const VecFx16 *a, const VecFx16 *b);
void VEC_CrossProduct(const VecFx32 *a, const VecFx32 *b, VecFx32 *dst);
void VEC_Fx16CrossProduct(const VecFx16 *a, const VecFx16 *b, VecFx16 *dst);

void VEC_MultAdd(fx32 factor, const VecFx32 *a, const VecFx32 *b, VecFx32 *dst) {
    dst->x = (fx32)(((fx64)factor * a->x) >> FX32_SHIFT) + b->x;
    dst->y = (fx32)(((fx64)factor * a->y) >> FX32_SHIFT) + b->y;
    dst->z = (fx32)(((fx64)factor * a->z) >> FX32_SHIFT) + b->z;
}

fx32 VEC_Distance(const VecFx32 *a, const VecFx32 *b) {
    fx64 l2 = (fx64)(a->x - b->x) * (a->x - b->x);
    l2 += (fx64)(a->y - b->y) * (a->y - b->y);
    l2 += (fx64)(a->z - b->z) * (a->z - b->z);
    reg_CP_SQRTCNT = 1;
    reg_CP_SQRT_PARAM = (u64)(l2 * 4);
    while (reg_CP_SQRTCNT & REG_CP_SQRTCNT_BUSY_MASK) {}
    return ((fx32)reg_CP_SQRT_RESULT + 1) >> 1;
}
