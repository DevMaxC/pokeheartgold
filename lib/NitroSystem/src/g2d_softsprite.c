#include <nitro.h>
#include <nnsys/g2d_internal.h>

// draws a unit quad; the texture coordinates are texels in fx32 format
void DrawOneQuad_(u32 u0, u32 u1, u32 v0, u32 v1) {
    u16 s0 = (s32)(u0 << 8) >> 16;
    u16 s1 = (s32)(u1 << 8) >> 16;
    u16 t0 = (s32)(v0 << 8) >> 16;
    u16 t1 = (short)(v1 >> 8);
    REGType32v *texCoord = &reg_G3_TEXCOORD;
    REGType32v *vtx16 = &reg_G3_VTX_16;
    reg_G3_BEGIN_VTXS = GX_BEGIN_QUADS;
    *texCoord = s0 | (t1 << 16);
    *vtx16 = 0x10000000;
    *vtx16 = 0;
    *texCoord = s1 | (t1 << 16);
    *vtx16 = 0x10001000;
    *vtx16 = 0;
    *texCoord = s1 | (t0 << 16);
    *vtx16 = 0x1000;
    *vtx16 = 0;
    *texCoord = s0 | (t0 << 16);
    *vtx16 = 0;
    *vtx16 = 0;
    reg_G3_END_VTXS = 0;
}

#pragma force_active on

static inline void OrthoW(fx32 t, fx32 b, fx32 l, fx32 r, fx32 n, fx32 f, fx32 scaleW, MtxFx44 *mtx) {
    G3i_OrthoW_(t, b, l, r, n, f, scaleW, TRUE, mtx);
}

static inline void LookAt(const VecFx32 *camPos, const VecFx32 *camUp, const VecFx32 *target, MtxFx43 *mtx) {
    G3i_LookAt_(camPos, camUp, target, TRUE, mtx);
}

void NNS_G2dSetupSoftwareSpriteCamera(void) {
    G3_ViewPort(0, 0, 255, 191);
    OrthoW(0, 192 * FX32_ONE, 0, 256 * FX32_ONE, -1024 * FX32_ONE, 1024 * FX32_ONE, 1024 * FX32_ONE, NULL);
    reg_G3_MTX_STORE = 0;
    {
        VecFx32 camPos = { 0, 0, 0 };
        VecFx32 camUp = gG2dSoftSpriteCameraUp;
        VecFx32 target = gG2dSoftSpriteCameraTarget;
        LookAt(&camPos, &camUp, &target, NULL);
    }
    G3_MtxMode(GX_MTXMODE_POSITION);
}

#pragma force_active off

void NNS_G2dDrawSpriteFast(s16 px, s16 py, int pz, int sx, int sy, int U0, int V0, int U1, int V1) {
    reg_G3_MTX_TRANS = px << FX32_SHIFT;
    reg_G3_MTX_TRANS = py << FX32_SHIFT;
    reg_G3_MTX_TRANS = pz << FX32_SHIFT;
    reg_G3_MTX_SCALE = sx << FX32_SHIFT;
    reg_G3_MTX_SCALE = sy << FX32_SHIFT;
    reg_G3_MTX_SCALE = FX32_ONE;
    DrawOneQuad_(U0 << FX32_SHIFT, U1 << FX32_SHIFT, V0 << FX32_SHIFT, V1 << FX32_SHIFT);
}
