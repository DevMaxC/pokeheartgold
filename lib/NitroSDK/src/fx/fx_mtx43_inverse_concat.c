// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>
#include <nitro/fx.h>
#include <nitro/mi/memory.h>
#include <nitro/types.h>

#define FX32_INT_SHIFT FX32_SHIFT
#define _              a

void MI_Copy48B(const void *src, void *dst);
void MTX_ScaleApply33(const MtxFx33 *mtx, MtxFx33 *dst, fx32 x, fx32 y, fx32 z);
void MTX_ScaleApply43(const MtxFx43 *mtx, MtxFx43 *dst, fx32 x, fx32 y, fx32 z);
fx32 MTX_Inverse43(const MtxFx43 *mtx, MtxFx43 *inv);
void MTX_MultVec43(const VecFx32 *vec, const MtxFx43 *mtx, VecFx32 *dst);
void FX_InvAsync(fx32 denominator);
fx32 FX_GetDivResult(void);
void VEC_CrossProduct(const VecFx32 *, const VecFx32 *, VecFx32 *);
void MTX_LookAt(const VecFx32 *, const VecFx32 *, const VecFx32 *, MtxFx43 *);

fx32 MTX_Inverse43(const MtxFx43 *mtx, MtxFx43 *inv) {
    MtxFx43 tempmat;
    MtxFx43 *dst;
    fx32 det0, det1, det2, det;
    fx32 var0, var1, var2, var3;
    if (mtx == inv) {
        dst = &tempmat;
    } else {
        dst = inv;
    }
    // subdeterminants
    det0 = (fx32)(((fx64)mtx->_[4] * mtx->_[8] - (fx64)mtx->_[5] * mtx->_[7] + (fx64)(1 << (FX32_INT_SHIFT - 1))) >> FX32_INT_SHIFT);
    det1 = (fx32)(((fx64)mtx->_[3] * mtx->_[8] - (fx64)mtx->_[5] * mtx->_[6] + (fx64)(1 << (FX32_INT_SHIFT - 1))) >> FX32_INT_SHIFT);
    det2 = (fx32)(((fx64)mtx->_[3] * mtx->_[7] - (fx64)mtx->_[4] * mtx->_[6] + (fx64)(1 << (FX32_INT_SHIFT - 1))) >> FX32_INT_SHIFT);
    // matrix determinant
    det = (fx32)(((fx64)mtx->_[0] * det0 - (fx64)mtx->_[1] * det1 + (fx64)mtx->_[2] * det2 + (fx64)(1 << (FX32_INT_SHIFT - 1))) >> FX32_INT_SHIFT);

    if (det == 0) {
        return -1; // not invertible
    }

    FX_InvAsync(det);

    var0 = (fx32)(((fx64)mtx->_[1] * mtx->_[8] - (fx64)mtx->_[7] * mtx->_[2]) >> FX32_INT_SHIFT);
    var1 = (fx32)(((fx64)mtx->_[1] * mtx->_[5] - (fx64)mtx->_[4] * mtx->_[2]) >> FX32_INT_SHIFT);
    var2 = (fx32)(((fx64)mtx->_[0] * mtx->_[8] - (fx64)mtx->_[6] * mtx->_[2]) >> FX32_INT_SHIFT);
    var3 = (fx32)(((fx64)mtx->_[0] * mtx->_[5] - (fx64)mtx->_[3] * mtx->_[2]) >> FX32_INT_SHIFT);

    fx32 ret = FX_GetDivResult();
    dst->_[0] = (fx32)(((fx64)ret * det0) >> FX32_INT_SHIFT);
    dst->_[1] = -(fx32)(((fx64)ret * var0) >> FX32_INT_SHIFT);
    dst->_[2] = (fx32)(((fx64)ret * var1) >> FX32_INT_SHIFT);
    dst->_[3] = -(fx32)(((fx64)ret * det1) >> FX32_INT_SHIFT);
    dst->_[4] = (fx32)(((fx64)ret * var2) >> FX32_INT_SHIFT);
    dst->_[5] = -(fx32)(((fx64)ret * var3) >> FX32_INT_SHIFT);

    dst->_[6] = (fx32)(((fx64)ret * det2) >> FX32_INT_SHIFT);
    fx32 temp = (fx32)(((fx64)mtx->_[0] * mtx->_[7] - (fx64)mtx->_[6] * mtx->_[1]) >> FX32_INT_SHIFT);
    dst->_[7] = -(fx32)(((fx64)ret * temp) >> FX32_INT_SHIFT);
    fx32 temp1 = (fx32)(((fx64)mtx->_[0] * mtx->_[4] - (fx64)mtx->_[3] * mtx->_[1]) >> FX32_INT_SHIFT);
    dst->_[8] = (fx32)(((fx64)ret * temp1) >> FX32_INT_SHIFT);
    dst->_[9] = -(fx32)(((fx64)dst->_[0] * mtx->_[9] + (fx64)dst->_[3] * mtx->_[10] + (fx64)dst->_[6] * mtx->_[11]) >> FX32_INT_SHIFT);
    dst->_[10] = -(fx32)(((fx64)dst->_[1] * mtx->_[9] + (fx64)dst->_[4] * mtx->_[10] + (fx64)dst->_[7] * mtx->_[11]) >> FX32_INT_SHIFT);
    dst->_[11] = -(fx32)(((fx64)dst->_[2] * mtx->_[9] + (fx64)dst->_[5] * mtx->_[10] + (fx64)dst->_[8] * mtx->_[11]) >> FX32_INT_SHIFT);

    if (dst == &tempmat) {
        MI_Copy48B(&tempmat, inv);
    }
    return 0;
}

void MTX_Concat43(const MtxFx43 *a, const MtxFx43 *b, MtxFx43 *c) {
    MtxFx43 temp;
    MtxFx43 *dst;
    fx32 a0, a1, a2;
    fx32 b0, b1, b2;

    if (c == b) {
        dst = &temp;
    } else {
        dst = c;
    }

    a0 = a->_[0];
    a1 = a->_[1];
    a2 = a->_[2];
    dst->_[0] = (fx32)(((fx64)a0 * b->_[0] + (fx64)a1 * b->_[3] + (fx64)a2 * b->_[6]) >> FX32_INT_SHIFT);
    dst->_[1] = (fx32)(((fx64)a0 * b->_[1] + (fx64)a1 * b->_[4] + (fx64)a2 * b->_[7]) >> FX32_INT_SHIFT);
    b0 = b->_[2];
    b1 = b->_[5];
    b2 = b->_[8];
    dst->_[2] = (fx32)(((fx64)a0 * b0 + (fx64)a1 * b1 + (fx64)a2 * b2) >> FX32_INT_SHIFT);
    a0 = a->_[3];
    a1 = a->_[4];
    a2 = a->_[5];
    dst->_[5] = (fx32)(((fx64)a0 * b0 + (fx64)a1 * b1 + (fx64)a2 * b2) >> FX32_INT_SHIFT);
    dst->_[4] = (fx32)(((fx64)a0 * b->_[1] + (fx64)a1 * b->_[4] + (fx64)a2 * b->_[7]) >> FX32_INT_SHIFT);
    b0 = b->_[0];
    b1 = b->_[3];
    b2 = b->_[6];
    dst->_[3] = (fx32)(((fx64)a0 * b0 + (fx64)a1 * b1 + (fx64)a2 * b2) >> FX32_INT_SHIFT);
    a0 = a->_[6];
    a1 = a->_[7];
    a2 = a->_[8];
    dst->_[6] = (fx32)(((fx64)a0 * b0 + (fx64)a1 * b1 + (fx64)a2 * b2) >> FX32_INT_SHIFT);
    dst->_[7] = (fx32)(((fx64)a0 * b->_[1] + (fx64)a1 * b->_[4] + (fx64)a2 * b->_[7]) >> FX32_INT_SHIFT);
    b0 = b->_[2];
    b1 = b->_[5];
    b2 = b->_[8];
    dst->_[8] = (fx32)(((fx64)a0 * b0 + (fx64)a1 * b1 + (fx64)a2 * b2) >> FX32_INT_SHIFT);
    a0 = a->_[9];
    a1 = a->_[10];
    a2 = a->_[11];
    dst->_[11] = (fx32)((((fx64)a0 * b0 + (fx64)a1 * b1 + (fx64)a2 * b2) >> FX32_INT_SHIFT) + b->_[11]);
    dst->_[10] = (fx32)((((fx64)a0 * b->_[1] + (fx64)a1 * b->_[4] + (fx64)a2 * b->_[7]) >> FX32_INT_SHIFT) + b->_[10]);
    dst->_[9] = (fx32)((((fx64)a0 * b->_[0] + (fx64)a1 * b->_[3] + (fx64)a2 * b->_[6]) >> FX32_INT_SHIFT) + b->_[9]);
    if (dst == &temp) {
        *c = temp;
    }
}

void MTX_MultVec43(const VecFx32 *vec, const MtxFx43 *mtx, VecFx32 *dst) {
    fx32 x, y, z;
    x = vec->x;
    y = vec->y;
    z = vec->z;
    dst->x = (fx32)(((fx64)x * mtx->_[0] + (fx64)y * mtx->_[3] + (fx64)z * mtx->_[6]) >> FX32_INT_SHIFT);
    dst->x += mtx->_[9];
    dst->y = (fx32)(((fx64)x * mtx->_[1] + (fx64)y * mtx->_[4] + (fx64)z * mtx->_[7]) >> FX32_INT_SHIFT);
    dst->y += mtx->_[10];
    dst->z = (fx32)(((fx64)x * mtx->_[2] + (fx64)y * mtx->_[5] + (fx64)z * mtx->_[8]) >> FX32_INT_SHIFT);
    dst->z += mtx->_[11];
}

#pragma force_active on

void MTX_LookAt(const VecFx32 *eye, const VecFx32 *up, const VecFx32 *target, MtxFx43 *m) {
    VecFx32 z, x, y;
    z.x = eye->x - target->x;
    z.y = eye->y - target->y;
    z.z = eye->z - target->z;
    VEC_Normalize(&z, &z);
    VEC_CrossProduct(up, &z, &x);
    VEC_Normalize(&x, &x);
    VEC_CrossProduct(&z, &x, &y);
    m->_00 = x.x;
    m->_01 = y.x;
    m->_02 = z.x;
    m->_10 = x.y;
    m->_11 = y.y;
    m->_12 = z.y;
    m->_20 = x.z;
    m->_21 = y.z;
    m->_22 = z.z;
    m->_30 = -VEC_DotProduct(eye, &x);
    m->_31 = -VEC_DotProduct(eye, &y);
    m->_32 = -VEC_DotProduct(eye, &z);
}
