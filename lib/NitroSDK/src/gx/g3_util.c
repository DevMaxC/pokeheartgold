#include <nitro.h>
#include <nitro/code32.h>

void G3i_OrthoW_(fx32 t, fx32 b, fx32 l, fx32 r, fx32 n, fx32 f, fx32 scaleW, BOOL draw, MtxFx44 *mtx);
void G3i_LookAt_(const VecFx32 *camPos, const VecFx32 *camUp, const VecFx32 *target, BOOL draw, MtxFx43 *mtx);
void G3_RotX(fx32 sinphi, fx32 cosphi);
void G3_RotY(fx32 sinphi, fx32 cosphi);
void G3_RotZ(fx32 sinphi, fx32 cosphi);
void MTX_LookAt(const VecFx32 *camPos, const VecFx32 *camUp, const VecFx32 *target, MtxFx43 *mtx);
void G3_LoadMtx44(const MtxFx44 *mtx);
void G3_LoadMtx43(const MtxFx43 *mtx);

void G3i_OrthoW_(fx32 t, fx32 b, fx32 l, fx32 r, fx32 n, fx32 f, fx32 scaleW, BOOL draw, MtxFx44 *mtx) {
    MtxFx44 local;
    MtxFx44 *out = mtx != NULL ? mtx : &local;
    MTX_OrthoW(t, b, l, r, n, f, scaleW, out);
    if (draw) {
        reg_G3_MTX_MODE = GX_MTXMODE_PROJECTION;
        G3_LoadMtx44(out);
    }
}

void G3i_LookAt_(const VecFx32 *camPos, const VecFx32 *camUp, const VecFx32 *target, BOOL draw, MtxFx43 *mtx) {
    MtxFx43 local;
    MtxFx43 *out = mtx != NULL ? mtx : &local;
    MTX_LookAt(camPos, camUp, target, out);
    if (draw) {
        reg_G3_MTX_MODE = GX_MTXMODE_POSITION_VECTOR;
        G3_LoadMtx43(out);
    }
}

void G3_RotX(fx32 sinphi, fx32 cosphi) {
    vu32 *reg_ptr = (vu32 *)&reg_G3_MTX_MULT_3x3;
    *reg_ptr = FX32_ONE;
    *reg_ptr = 0;
    *reg_ptr = 0;
    *reg_ptr = 0;
    *reg_ptr = (vu32)cosphi;
    *reg_ptr = (vu32)sinphi;
    *reg_ptr = 0;
    *reg_ptr = (vu32)(-sinphi);
    *reg_ptr = (vu32)cosphi;
}
void G3_RotY(fx32 sinphi, fx32 cosphi) {
    vu32 *reg_ptr = (vu32 *)&reg_G3_MTX_MULT_3x3;
    *reg_ptr = (vu32)cosphi;
    *reg_ptr = 0;
    *reg_ptr = (vu32)(-sinphi);
    *reg_ptr = 0;
    *reg_ptr = FX32_ONE;
    *reg_ptr = 0;
    *reg_ptr = (vu32)sinphi;
    *reg_ptr = 0;
    *reg_ptr = (vu32)cosphi;
}
void G3_RotZ(fx32 sinphi, fx32 cosphi) {
    vu32 *reg_ptr = (vu32 *)&reg_G3_MTX_MULT_3x3;
    *reg_ptr = (vu32)cosphi;
    *reg_ptr = (vu32)sinphi;
    *reg_ptr = 0;
    *reg_ptr = (vu32)(-sinphi);
    *reg_ptr = (vu32)cosphi;
    *reg_ptr = 0;
    *reg_ptr = 0;
    *reg_ptr = 0;
    *reg_ptr = FX32_ONE;
}
