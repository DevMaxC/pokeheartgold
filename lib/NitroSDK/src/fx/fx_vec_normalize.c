#pragma force_active on
#include "global.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>
void VEC_Normalize(const VecFx32 *src, VecFx32 *dst);
void VEC_Fx16Normalize(const VecFx16 *src, VecFx16 *dst);

void VEC_Normalize(const VecFx32 *src, VecFx32 *dst) {
    s64 len;
    s32 root;
    s64 factor;
    len = (s64)src->x * src->x;
    len = (s64)src->y * src->y + len;
    len += (s64)src->z * src->z;
    reg_CP_DIVCNT = 2;
    *(s64 *)REG_DIV_NUMER_ADDR = 0x0100000000000000LL;
    *(s64 *)REG_DIV_DENOM_ADDR = len;
    reg_CP_SQRTCNT = 1;
    *(s64 *)REG_SQRT_PARAM_ADDR = len << 2;
    while (reg_CP_SQRTCNT & REG_CP_SQRTCNT_BUSY_MASK) {
    }
    root = reg_CP_SQRT_RESULT;
    while (reg_CP_DIVCNT & REG_CP_DIVCNT_BUSY_MASK) {
    }
    factor = reg_CP_DIV_RESULT * root;
    dst->x = (fx32)((factor * src->x + (1LL << 44)) >> 45);
    dst->y = (fx32)((factor * src->y + (1LL << 44)) >> 45);
    dst->z = (fx32)((factor * src->z + (1LL << 44)) >> 45);
}

void VEC_Fx16Normalize(const VecFx16 *src, VecFx16 *dst) {
    s64 len;
    s32 root;
    s64 factor;
    len = src->x * src->x;
    len += src->y * src->y;
    len += src->z * src->z;
    reg_CP_DIVCNT = 2;
    *(s64 *)REG_DIV_NUMER_ADDR = 0x0100000000000000LL;
    *(s64 *)REG_DIV_DENOM_ADDR = len;
    reg_CP_SQRTCNT = 1;
    *(s64 *)REG_SQRT_PARAM_ADDR = len << 2;
    while (reg_CP_SQRTCNT & REG_CP_SQRTCNT_BUSY_MASK) {
    }
    root = reg_CP_SQRT_RESULT;
    while (reg_CP_DIVCNT & REG_CP_DIVCNT_BUSY_MASK) {
    }
    factor = reg_CP_DIV_RESULT * root;
    dst->x = (fx16)((factor * src->x + (1LL << 44)) >> 45);
    dst->y = (fx16)((factor * src->y + (1LL << 44)) >> 45);
    dst->z = (fx16)((factor * src->z + (1LL << 44)) >> 45);
}
