#include <nitro.h>

fx32 VEC_Distance(const VecFx32 *a, const VecFx32 *b);
fx32 VEC_Fx16DotProduct(const VecFx16 *a, const VecFx16 *b);
void VEC_CrossProduct(const VecFx32 *a, const VecFx32 *b, VecFx32 *dst);
void VEC_Fx16CrossProduct(const VecFx16 *a, const VecFx16 *b, VecFx16 *dst);

void VEC_Add(const VecFx32 *a, const VecFx32 *b, VecFx32 *dst) {
    dst->x = a->x + b->x;
    dst->y = a->y + b->y;
    dst->z = a->z + b->z;
}

void VEC_Subtract(const VecFx32 *a, const VecFx32 *b, VecFx32 *dst) {
    dst->x = a->x - b->x;
    dst->y = a->y - b->y;
    dst->z = a->z - b->z;
}

void VEC_Fx16Add(const VecFx16 *a, const VecFx16 *b, VecFx16 *dst) {
    dst->x = (s16)(a->x + b->x);
    dst->y = (s16)(a->y + b->y);
    dst->z = (s16)(a->z + b->z);
}

fx32 VEC_DotProduct(const VecFx32 *a, const VecFx32 *b) {
    return (fx32)(((fx64)a->x * b->x + (fx64)a->y * b->y + (fx64)a->z * b->z + (1 << (FX32_SHIFT - 1))) >> FX32_SHIFT);
}

fx32 VEC_Fx16DotProduct(const VecFx16 *a, const VecFx16 *b) {
    fx32 temp1, temp2;
    temp1 = (a->x * b->x) + (a->y * b->y);
    temp2 = (a->z * b->z) + (1 << (FX32_SHIFT - 1));
    return (fx32)(((fx64)temp1 + temp2) >> FX32_SHIFT);
}

void VEC_CrossProduct(const VecFx32 *a, const VecFx32 *b, VecFx32 *dst) {
    fx32 x, y, z;
    x = (fx32)(((fx64)a->y * b->z - (fx64)a->z * b->y + (1 << (FX32_SHIFT - 1))) >> FX32_SHIFT);
    y = (fx32)(((fx64)a->z * b->x - (fx64)a->x * b->z + (1 << (FX32_SHIFT - 1))) >> FX32_SHIFT);
    z = (fx32)(((fx64)a->x * b->y - (fx64)a->y * b->x + (1 << (FX32_SHIFT - 1))) >> FX32_SHIFT);
    dst->x = x;
    dst->y = y;
    dst->z = z;
}

void VEC_Fx16CrossProduct(const VecFx16 *a, const VecFx16 *b, VecFx16 *dst) {
    fx32 x, y, z;
    x = ((a->y * b->z - a->z * b->y + (1 << (FX32_SHIFT - 1))) >> FX32_SHIFT);
    y = ((a->z * b->x - a->x * b->z + (1 << (FX32_SHIFT - 1))) >> FX32_SHIFT);
    z = ((a->x * b->y - a->y * b->x + (1 << (FX32_SHIFT - 1))) >> FX32_SHIFT);
    dst->x = (fx16)x;
    dst->y = (fx16)y;
    dst->z = (fx16)z;
}

fx32 VEC_Mag(VecFx32 *a) {
    fx64 l2 = (fx64)a->x * a->x;
    l2 += (fx64)a->y * a->y;
    l2 += (fx64)a->z * a->z;
    reg_CP_SQRTCNT = 0x1;
    reg_CP_SQRT_PARAM = (u64)(l2 << 2);
    while (reg_CP_SQRTCNT & REG_CP_SQRTCNT_BUSY_MASK) {} // wait for coprocessor to finish
    return ((fx32)reg_CP_SQRT_RESULT + 1) >> 1;
}
