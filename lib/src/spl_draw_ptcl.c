#include "spl_internal.h"

// particle drawing for each draw type, parents and children: billboard (bb), directional billboard
// (dbb), polygon (pol) and directional polygon (dpl), with the texture set-up, the polygon rotation
// matrices and the quad drawn in the XY / XZ plane

static inline void TexCoord(fx32 s, fx32 t) {
    reg_G3_TEXCOORD = (u16)(s >> 8) | ((u16)(t >> 8) << REG_G3_TEXCOORD_DECIMAL_T_SHIFT);
}

static inline void Vtx10(fx16 x, fx16 y, fx16 z) {
    reg_G3_VTX_10 = ((x >> 6) & 0x3FF) | (((y >> 6) & 0x3FF) << REG_G3_VTX_10_DECIMAL_Y_SHIFT) | (((z >> 6) & 0x3FF) << REG_G3_VTX_10_DECIMAL_Z_SHIFT);
}

static inline void MtxScale(fx32 x, fx32 y, fx32 z) {
    reg_G3_MTX_SCALE = x;
    reg_G3_MTX_SCALE = y;
    reg_G3_MTX_SCALE = z;
}

// MWCC 1.2 applies force_active as set at the end of the file and emits a file's functions in
// reverse order: the functions are defined last-to-first here (link order is bottom-up).
#pragma force_active on

// a 2x2 quad around (x, y) in the XY plane, texture coordinates up to (s, t)
void drawXYPlane(fx32 s, fx32 t, fx32 x, fx32 y) {
    reg_G3_BEGIN_VTXS = GX_BEGIN_QUADS;
    TexCoord(0, 0);
    Vtx10((fx16)(x - FX32_ONE), (fx16)(y + FX32_ONE), 0);
    TexCoord(s, 0);
    Vtx10((fx16)(x + FX32_ONE), (fx16)(y + FX32_ONE), 0);
    TexCoord(s, t);
    Vtx10((fx16)(x + FX32_ONE), (fx16)(y - FX32_ONE), 0);
    TexCoord(0, t);
    Vtx10((fx16)(x - FX32_ONE), (fx16)(y - FX32_ONE), 0);
    reg_G3_END_VTXS = 0;
}

// a 2x2 quad around (x, z) in the XZ plane, texture coordinates up to (s, t)
void drawXZPlane(fx32 s, fx32 t, fx32 x, fx32 z) {
    reg_G3_BEGIN_VTXS = GX_BEGIN_QUADS;
    TexCoord(0, 0);
    Vtx10((fx16)(x - FX32_ONE), 0, (fx16)(z + FX32_ONE));
    TexCoord(s, 0);
    Vtx10((fx16)(x + FX32_ONE), 0, (fx16)(z + FX32_ONE));
    TexCoord(s, t);
    Vtx10((fx16)(x + FX32_ONE), 0, (fx16)(z - FX32_ONE));
    TexCoord(0, t);
    Vtx10((fx16)(x - FX32_ONE), 0, (fx16)(z - FX32_ONE));
    reg_G3_END_VTXS = 0;
}

// rotation by the angle (sin, cos) about the axis (1, 1, 1) / sqrt(3)
void rotTypeXYZ(fx32 sin, fx32 cos, MtxFx43 *mtx) {
    fx32 a = FX_Mul(FX32_ONE - cos, 0x555); // (1 - cos) / 3
    fx32 b = FX_Mul(sin, 0x93D);            // sin / sqrt(3)
    fx32 diag, pos, neg;

    pos = a + b;
    diag = a + cos;
    neg = a - b;
    mtx->_00 = diag;
    mtx->_10 = pos;
    mtx->_20 = neg;
    mtx->_30 = 0;
    mtx->_01 = neg;
    mtx->_11 = diag;
    mtx->_21 = pos;
    mtx->_31 = 0;
    mtx->_02 = pos;
    mtx->_12 = neg;
    mtx->_22 = diag;
    mtx->_32 = 0;
}

// rotation by the angle (sin, cos) about the y axis
void rotTypeY(fx32 sin, fx32 cos, MtxFx43 *mtx) {
    mtx->_00 = cos;
    mtx->_10 = 0;
    mtx->_20 = sin;
    mtx->_30 = 0;
    mtx->_01 = 0;
    mtx->_11 = FX32_ONE;
    mtx->_21 = 0;
    mtx->_31 = 0;
    mtx->_02 = -sin;
    mtx->_12 = 0;
    mtx->_22 = cos;
    mtx->_32 = 0;
}

void spl_draw_bb(SPLManager *mgr, SPLParticle *ptcl) {
    VecFx32 pos;
    MtxFx43 m;
    fx32 sx;
    int alpha;
    SPLResBase *def;
    s64 sy;
    u16 pclr;
    const MtxFx43 *cmr;
    u16 eclr;
    fx32 cs;
    s16 factor;
    s16 aspect;
    fx32 sn;
    u8 mode;
    def = mgr->current_state.p_emtr->p_res->p_base;
    aspect = def->aspect;
    mode = def->etc.scl_anm_direct;
    eclr = mgr->current_state.p_emtr->clr;
    factor = ptcl->anm_scl;
    pclr = ptcl->clr;
    cmr = mgr->current_state.p_cmr;
    alpha = ptcl->alp.base_alp * (ptcl->alp.anm_alp + 1) >> 5;
    // alpha from the particle, polygon ID, both faces displayed (0xC0) on top of the manager's attributes
    reg_G3_POLYGON_ATTR = (ptcl->alp.current_polygonID << REG_G3_POLYGON_ATTR_ID_SHIFT) | (mgr->misc_flag | 0xC0) | (alpha << REG_G3_POLYGON_ATTR_ALPHA_SHIFT);
    (void)reg_G3_POLYGON_ATTR; // read back: needed for the match
    if (alpha == 0) {
        return;
    }
    sx = FX_MUL(ptcl->base_scl, aspect);
    sy = ptcl->base_scl;
    if (mode == 0) {
        sx = FX_MUL(sx, factor);
        sy = (sy * factor + 0x800) >> 12;
    } else if (mode == 1) {
        sx = FX_MUL(sx, factor);
    } else {
        sy = (sy * factor + 0x800) >> 12;
    }
    if (!mgr->current_state.p_emtr->p_res->p_base->flag.camera_offset) {
        pos.x = ptcl->ptcl_pos.x + ptcl->emtr_pos.x;
        pos.y = ptcl->ptcl_pos.y + ptcl->emtr_pos.y;
        pos.z = ptcl->ptcl_pos.z + ptcl->emtr_pos.z;
        MTX_MultVec43(&pos, cmr, &pos);
        sn = FX_SinIdx(ptcl->rtt);
        cs = FX_CosIdx(ptcl->rtt);
        m._00 = FX_MUL(cs, sx);
        m._01 = FX_MUL(sn, sx);
        m._02 = 0;
        m._10 = FX_MUL(-sn, (fx32)sy);
        m._11 = FX_MUL(cs, (fx32)sy);
        m._12 = 0;
        m._20 = 0;
        m._21 = 0;
        m._22 = FX32_ONE;
        m._30 = pos.x;
        m._31 = pos.y;
        m._32 = pos.z;
        reg_G3_MTX_IDENTITY = 0;
        G3_MultMtx43(&m);
    } else {
        pos.x = ptcl->ptcl_pos.x + ptcl->emtr_pos.x - mgr->current_state.p_emtr->p_res->p_base->pos.x;
        pos.y = ptcl->ptcl_pos.y + ptcl->emtr_pos.y - mgr->current_state.p_emtr->p_res->p_base->pos.y;
        pos.z = ptcl->ptcl_pos.z + ptcl->emtr_pos.z - mgr->current_state.p_emtr->p_res->p_base->pos.z;
        MTX_MultVec43(&pos, cmr, &pos);
        sn = FX_SinIdx(ptcl->rtt);
        cs = FX_CosIdx(ptcl->rtt);
        m._00 = FX_MUL(cs, sx);
        m._01 = FX_MUL(sn, sx);
        m._02 = 0;
        m._10 = FX_MUL(-sn, (fx32)sy);
        m._11 = FX_MUL(cs, (fx32)sy);
        m._12 = 0;
        m._20 = 0;
        m._21 = 0;
        m._22 = FX32_ONE;
        m._30 = pos.x;
        m._31 = pos.y;
        m._32 = pos.z;
        reg_G3_MTX_IDENTITY = 0;
        // camera offset: relative to the emitter resource position
        {
            SPLResBase *d = mgr->current_state.p_emtr->p_res->p_base;
            int z = d->pos.z, y = d->pos.y, x = d->pos.x;
            reg_G3_MTX_TRANS = x;
            reg_G3_MTX_TRANS = y;
            reg_G3_MTX_TRANS = z;
        }
        G3_MultMtx43(&m);
    }
    // particle colour modulated by the emitter colour
    reg_G3_COLOR = (u16)((((pclr & 0x1f) * (eclr & 0x1f)) >> 5) | ((((pclr & 0x3e0) * (eclr & 0x3e0)) >> 15) << REG_G3_COLOR_GREEN_SHIFT) | ((((pclr & 0x7c00) * (eclr & 0x7c00)) >> 25) << REG_G3_COLOR_BLUE_SHIFT));
    drawXYPlane(mgr->current_state.p_emtr->tex_s, mgr->current_state.p_emtr->tex_t, mgr->current_state.p_emtr->p_res->p_base->offset_x, mgr->current_state.p_emtr->p_res->p_base->offset_y);
}

void spl_draw_chld_bb(SPLManager *mgr, SPLParticle *ptcl) {
    VecFx32 pos;
    MtxFx43 m;
    s16 aspect;
    fx32 cs;
    const MtxFx43 *cmr;
    fx32 sn;
    int alpha;
    fx32 sx;
    s64 sy;

    aspect = mgr->current_state.p_emtr->p_res->p_base->aspect;
    cmr = mgr->current_state.p_cmr;
    alpha = ptcl->alp.base_alp * (ptcl->alp.anm_alp + 1) >> 5;
    // alpha from the particle, polygon ID, both faces displayed (0xC0) on top of the manager's attributes
    reg_G3_POLYGON_ATTR = (ptcl->alp.current_polygonID << REG_G3_POLYGON_ATTR_ID_SHIFT) | (mgr->misc_flag | 0xC0) | (alpha << REG_G3_POLYGON_ATTR_ALPHA_SHIFT);
    (void)reg_G3_POLYGON_ATTR; // read back: needed for the match
    if (alpha == 0) {
        return;
    }
    sx = FX_MUL(ptcl->base_scl, aspect);
    sy = ptcl->base_scl;
    switch (mgr->current_state.p_emtr->p_res->p_base->etc.scl_anm_direct) {
    case 0:
        sx = FX_MUL(sx, ptcl->anm_scl);
        sy = (sy * ptcl->anm_scl + 0x800) >> 12;
        break;
    case 1:
        sx = FX_MUL(sx, ptcl->anm_scl);
        break;
    case 2:
        sy = (sy * ptcl->anm_scl + 0x800) >> 12;
        break;
    }
    if (!mgr->current_state.p_emtr->p_res->p_base->flag.camera_offset) {
        pos.x = ptcl->ptcl_pos.x + ptcl->emtr_pos.x;
        pos.y = ptcl->ptcl_pos.y + ptcl->emtr_pos.y;
        pos.z = ptcl->ptcl_pos.z + ptcl->emtr_pos.z;
        MTX_MultVec43(&pos, cmr, &pos);
        sn = FX_SinIdx(ptcl->rtt);
        cs = FX_CosIdx(ptcl->rtt);
        m._00 = FX_MUL(cs, sx);
        m._01 = FX_MUL(sn, sx);
        m._02 = 0;
        m._10 = FX_MUL(-sn, (fx32)sy);
        m._11 = FX_MUL(cs, (fx32)sy);
        m._12 = 0;
        m._20 = 0;
        m._21 = 0;
        m._22 = FX32_ONE;
        m._30 = pos.x;
        m._31 = pos.y;
        m._32 = pos.z;
        reg_G3_MTX_IDENTITY = 0;
        G3_MultMtx43(&m);
    } else {
        pos.x = ptcl->ptcl_pos.x + ptcl->emtr_pos.x - mgr->current_state.p_emtr->p_res->p_base->pos.x;
        pos.y = ptcl->ptcl_pos.y + ptcl->emtr_pos.y - mgr->current_state.p_emtr->p_res->p_base->pos.y;
        pos.z = ptcl->ptcl_pos.z + ptcl->emtr_pos.z - mgr->current_state.p_emtr->p_res->p_base->pos.z;
        MTX_MultVec43(&pos, cmr, &pos);
        sn = FX_SinIdx(ptcl->rtt);
        cs = FX_CosIdx(ptcl->rtt);
        m._00 = FX_MUL(cs, sx);
        m._01 = FX_MUL(sn, sx);
        m._02 = 0;
        m._10 = FX_MUL(-sn, (fx32)sy);
        m._11 = FX_MUL(cs, (fx32)sy);
        m._12 = 0;
        m._20 = 0;
        m._21 = 0;
        m._22 = FX32_ONE;
        m._30 = pos.x;
        m._31 = pos.y;
        m._32 = pos.z;
        reg_G3_MTX_IDENTITY = 0;
        // camera offset: relative to the emitter resource position
        {
            SPLResBase *d = mgr->current_state.p_emtr->p_res->p_base;
            int z = d->pos.z, y = d->pos.y, x = d->pos.x;
            reg_G3_MTX_TRANS = x;
            reg_G3_MTX_TRANS = y;
            reg_G3_MTX_TRANS = z;
        }
        G3_MultMtx43(&m);
    }
    {
        int a = ptcl->clr, b = mgr->current_state.p_emtr->clr;
        // particle colour modulated by the emitter colour
        reg_G3_COLOR = (u16)((((a & 0x1f) * (b & 0x1f)) >> 5) | ((((a & 0x3e0) * (b & 0x3e0)) >> 15) << REG_G3_COLOR_GREEN_SHIFT) | ((((a & 0x7c00) * (b & 0x7c00)) >> 25) << REG_G3_COLOR_BLUE_SHIFT));
    }
    drawXYPlane(mgr->current_state.p_emtr->chld_tex_s, mgr->current_state.p_emtr->chld_tex_t, 0, 0);
}

void spl_draw_dbb(SPLManager *mgr, SPLParticle *ptcl) {
    VecFx32 vel;
    VecFx32 pos;
    VecFx32 dir;
    VecFx32 camZ;
    MtxFx33 rot;
    MtxFx43 m;
    const MtxFx43 *cmr;
    s16 aspect;
    fx32 sx;
    fx32 sy32;
    int alpha;
    fx32 syd;
    fx32 dot;
    s64 sy;
    aspect = mgr->current_state.p_emtr->p_res->p_base->aspect;
    cmr = mgr->current_state.p_cmr;
    alpha = ptcl->alp.base_alp * (ptcl->alp.anm_alp + 1) >> 5;
    // alpha from the particle, polygon ID, both faces displayed (0xC0) on top of the manager's attributes
    reg_G3_POLYGON_ATTR = (ptcl->alp.current_polygonID << REG_G3_POLYGON_ATTR_ID_SHIFT) | (mgr->misc_flag | 0xC0) | (alpha << REG_G3_POLYGON_ATTR_ALPHA_SHIFT);
    (void)reg_G3_POLYGON_ATTR; // read back: needed for the match
    if (alpha == 0) {
        return;
    }
    sx = FX_MUL(ptcl->base_scl, aspect);
    sy = ptcl->base_scl;
    switch (mgr->current_state.p_emtr->p_res->p_base->etc.scl_anm_direct) {
    case 0:
        sx = FX_MUL(sx, ptcl->anm_scl);
        sy = (sy * ptcl->anm_scl + 0x800) >> 12;
        break;
    case 1:
        sx = FX_MUL(sx, ptcl->anm_scl);
        break;
    case 2:
        sy = (sy * ptcl->anm_scl + 0x800) >> 12;
        break;
    }
    sy32 = sy;
    if (!mgr->current_state.p_emtr->p_res->p_base->flag.camera_offset) {
        pos.x = ptcl->ptcl_pos.x + ptcl->emtr_pos.x;
        pos.y = ptcl->ptcl_pos.y + ptcl->emtr_pos.y;
        pos.z = ptcl->ptcl_pos.z + ptcl->emtr_pos.z;
        dir = ptcl->vel;
        camZ.x = cmr->_02;
        camZ.y = cmr->_12;
        camZ.z = cmr->_22;
        VEC_CrossProduct(&dir, &camZ, &dir);
        if (dir.x == 0 && dir.y == 0 && dir.z == 0) {
            return;
        }
        VEC_Normalize(&dir, &dir);
        MTX_Copy33((const MtxFx33 *)cmr, &rot);
        MTX_MultVec33(&dir, &rot, &dir);
        MTX_MultVec43(&pos, cmr, &pos);
        vel = ptcl->vel;
        VEC_Normalize(&vel, &vel);
        dot = FX_MUL(vel.z, -cmr->_22) + (FX_MUL(vel.x, -cmr->_02) + FX_MUL(vel.y, -cmr->_12));
        if (dot < 0) {
            dot = -dot;
        }
        syd = FX_MUL(sy32, FX_MUL(FX32_ONE - dot, (fx32)mgr->current_state.p_emtr->p_res->p_base->etc.dbb_scale) + FX32_ONE);
        m._00 = FX_MUL(dir.x, sx);
        m._10 = FX_MUL(-dir.y, syd);
        m._20 = 0;
        m._21 = 0;
        m._30 = pos.x;
        m._01 = FX_MUL(dir.y, sx);
        m._11 = FX_MUL(dir.x, syd);
        m._31 = pos.y;
        m._02 = 0;
        m._12 = 0;
        m._22 = FX32_ONE;
        m._32 = pos.z;
        reg_G3_MTX_IDENTITY = 0;
        G3_MultMtx43(&m);
    } else {
        pos.x = ptcl->ptcl_pos.x + ptcl->emtr_pos.x - mgr->current_state.p_emtr->p_res->p_base->pos.x;
        pos.y = ptcl->ptcl_pos.y + ptcl->emtr_pos.y - mgr->current_state.p_emtr->p_res->p_base->pos.y;
        pos.z = ptcl->ptcl_pos.z + ptcl->emtr_pos.z - mgr->current_state.p_emtr->p_res->p_base->pos.z;
        dir = ptcl->vel;
        camZ.x = cmr->_02;
        camZ.y = cmr->_12;
        camZ.z = cmr->_22;
        VEC_CrossProduct(&dir, &camZ, &dir);
        if (dir.x == 0 && dir.y == 0 && dir.z == 0) {
            return;
        }
        VEC_Normalize(&dir, &dir);
        MTX_Copy33((const MtxFx33 *)cmr, &rot);
        MTX_MultVec33(&dir, &rot, &dir);
        MTX_MultVec43(&pos, cmr, &pos);
        vel = ptcl->vel;
        VEC_Normalize(&vel, &vel);
        dot = FX_MUL(vel.z, -cmr->_22) + (FX_MUL(vel.x, -cmr->_02) + FX_MUL(vel.y, -cmr->_12));
        if (dot < 0) {
            dot = -dot;
        }
        syd = FX_MUL(sy32, FX_MUL(FX32_ONE - dot, (fx32)mgr->current_state.p_emtr->p_res->p_base->etc.dbb_scale) + FX32_ONE);
        m._00 = FX_MUL(dir.x, sx);
        m._10 = FX_MUL(-dir.y, syd);
        m._20 = 0;
        m._30 = pos.x;
        m._01 = FX_MUL(dir.y, sx);
        m._11 = FX_MUL(dir.x, syd);
        m._21 = 0;
        m._02 = 0;
        m._31 = pos.y;
        m._12 = 0;
        m._22 = FX32_ONE;
        m._32 = pos.z;
        reg_G3_MTX_IDENTITY = 0;
        // camera offset: relative to the emitter resource position
        {
            SPLResBase *d = mgr->current_state.p_emtr->p_res->p_base;
            int z = d->pos.z, y = d->pos.y, x = d->pos.x;
            reg_G3_MTX_TRANS = x;
            reg_G3_MTX_TRANS = y;
            reg_G3_MTX_TRANS = z;
        }
        G3_MultMtx43(&m);
    }
    {
        int a = ptcl->clr, b = mgr->current_state.p_emtr->clr;
        // particle colour modulated by the emitter colour
        reg_G3_COLOR = (u16)((((a & 0x1f) * (b & 0x1f)) >> 5) | ((((a & 0x3e0) * (b & 0x3e0)) >> 15) << REG_G3_COLOR_GREEN_SHIFT) | ((((a & 0x7c00) * (b & 0x7c00)) >> 25) << REG_G3_COLOR_BLUE_SHIFT));
    }
    drawXYPlane(mgr->current_state.p_emtr->tex_s, mgr->current_state.p_emtr->tex_t, mgr->current_state.p_emtr->p_res->p_base->offset_x, mgr->current_state.p_emtr->p_res->p_base->offset_y);
}

void spl_draw_chld_dbb(SPLManager *mgr, SPLParticle *ptcl) {
    VecFx32 vel;
    VecFx32 pos;
    VecFx32 dir;
    VecFx32 camZ;
    MtxFx33 rot;
    MtxFx43 m;
    const MtxFx43 *cmr;
    s16 aspect;
    fx32 sx;
    fx32 sy32;
    int alpha;
    fx32 syd;
    fx32 dot;
    s64 sy;
    aspect = mgr->current_state.p_emtr->p_res->p_base->aspect;
    cmr = mgr->current_state.p_cmr;
    alpha = ptcl->alp.base_alp * (ptcl->alp.anm_alp + 1) >> 5;
    // alpha from the particle, polygon ID, both faces displayed (0xC0) on top of the manager's attributes
    reg_G3_POLYGON_ATTR = (ptcl->alp.current_polygonID << REG_G3_POLYGON_ATTR_ID_SHIFT) | (mgr->misc_flag | 0xC0) | (alpha << REG_G3_POLYGON_ATTR_ALPHA_SHIFT);
    (void)reg_G3_POLYGON_ATTR; // read back: needed for the match
    if (alpha == 0) {
        return;
    }
    sx = FX_MUL(ptcl->base_scl, aspect);
    sy = ptcl->base_scl;
    switch (mgr->current_state.p_emtr->p_res->p_base->etc.scl_anm_direct) {
    case 0:
        sx = FX_MUL(sx, ptcl->anm_scl);
        sy = (sy * ptcl->anm_scl + 0x800) >> 12;
        break;
    case 1:
        sx = FX_MUL(sx, ptcl->anm_scl);
        break;
    case 2:
        sy = (sy * ptcl->anm_scl + 0x800) >> 12;
        break;
    }
    sy32 = sy;
    if (!mgr->current_state.p_emtr->p_res->p_base->flag.camera_offset) {
        pos.x = ptcl->ptcl_pos.x + ptcl->emtr_pos.x;
        pos.y = ptcl->ptcl_pos.y + ptcl->emtr_pos.y;
        pos.z = ptcl->ptcl_pos.z + ptcl->emtr_pos.z;
        dir = ptcl->vel;
        camZ.x = cmr->_02;
        camZ.y = cmr->_12;
        camZ.z = cmr->_22;
        VEC_CrossProduct(&dir, &camZ, &dir);
        if (dir.x == 0 && dir.y == 0 && dir.z == 0) {
            return;
        }
        VEC_Normalize(&dir, &dir);
        MTX_Copy33((const MtxFx33 *)cmr, &rot);
        MTX_MultVec33(&dir, &rot, &dir);
        MTX_MultVec43(&pos, cmr, &pos);
        vel = ptcl->vel;
        VEC_Normalize(&vel, &vel);
        dot = FX_MUL(vel.z, -cmr->_22) + (FX_MUL(vel.x, -cmr->_02) + FX_MUL(vel.y, -cmr->_12));
        if (dot < 0) {
            dot = -dot;
        }
        syd = FX_MUL(sy32, FX_MUL(FX32_ONE - dot, (fx32)mgr->current_state.p_emtr->p_res->p_base->etc.dbb_scale) + FX32_ONE);
        m._00 = FX_MUL(dir.x, sx);
        m._10 = FX_MUL(-dir.y, syd);
        m._20 = 0;
        m._21 = 0;
        m._30 = pos.x;
        m._01 = FX_MUL(dir.y, sx);
        m._11 = FX_MUL(dir.x, syd);
        m._31 = pos.y;
        m._02 = 0;
        m._12 = 0;
        m._22 = FX32_ONE;
        m._32 = pos.z;
        reg_G3_MTX_IDENTITY = 0;
        G3_MultMtx43(&m);
    } else {
        pos.x = ptcl->ptcl_pos.x + ptcl->emtr_pos.x - mgr->current_state.p_emtr->p_res->p_base->pos.x;
        pos.y = ptcl->ptcl_pos.y + ptcl->emtr_pos.y - mgr->current_state.p_emtr->p_res->p_base->pos.y;
        pos.z = ptcl->ptcl_pos.z + ptcl->emtr_pos.z - mgr->current_state.p_emtr->p_res->p_base->pos.z;
        dir = ptcl->vel;
        camZ.x = cmr->_02;
        camZ.y = cmr->_12;
        camZ.z = cmr->_22;
        VEC_CrossProduct(&dir, &camZ, &dir);
        if (dir.x == 0 && dir.y == 0 && dir.z == 0) {
            return;
        }
        VEC_Normalize(&dir, &dir);
        MTX_Copy33((const MtxFx33 *)cmr, &rot);
        MTX_MultVec33(&dir, &rot, &dir);
        MTX_MultVec43(&pos, cmr, &pos);
        vel = ptcl->vel;
        VEC_Normalize(&vel, &vel);
        dot = FX_MUL(vel.z, -cmr->_22) + (FX_MUL(vel.x, -cmr->_02) + FX_MUL(vel.y, -cmr->_12));
        if (dot < 0) {
            dot = -dot;
        }
        syd = FX_MUL(sy32, FX_MUL(FX32_ONE - dot, (fx32)mgr->current_state.p_emtr->p_res->p_base->etc.dbb_scale) + FX32_ONE);
        m._00 = FX_MUL(dir.x, sx);
        m._10 = FX_MUL(-dir.y, syd);
        m._20 = 0;
        m._30 = pos.x;
        m._01 = FX_MUL(dir.y, sx);
        m._11 = FX_MUL(dir.x, syd);
        m._21 = 0;
        m._02 = 0;
        m._31 = pos.y;
        m._12 = 0;
        m._22 = FX32_ONE;
        m._32 = pos.z;
        reg_G3_MTX_IDENTITY = 0;
        // camera offset: relative to the emitter resource position
        {
            SPLResBase *d = mgr->current_state.p_emtr->p_res->p_base;
            int z = d->pos.z, y = d->pos.y, x = d->pos.x;
            reg_G3_MTX_TRANS = x;
            reg_G3_MTX_TRANS = y;
            reg_G3_MTX_TRANS = z;
        }
        G3_MultMtx43(&m);
    }
    {
        int a = ptcl->clr, b = mgr->current_state.p_emtr->clr;
        // particle colour modulated by the emitter colour
        reg_G3_COLOR = (u16)((((a & 0x1f) * (b & 0x1f)) >> 5) | ((((a & 0x3e0) * (b & 0x3e0)) >> 15) << REG_G3_COLOR_GREEN_SHIFT) | ((((a & 0x7c00) * (b & 0x7c00)) >> 25) << REG_G3_COLOR_BLUE_SHIFT));
    }
    drawXYPlane(mgr->current_state.p_emtr->chld_tex_s, mgr->current_state.p_emtr->chld_tex_t, 0, 0);
}

void spl_draw_pol(SPLManager *mgr, SPLParticle *ptcl) {
    MtxFx43 matrix, rotation, scale;

    u32 attributes = mgr->misc_flag;
    int alpha = ptcl->alp.base_alp * (ptcl->alp.anm_alp + 1) >> 5;
    // alpha from the particle, polygon ID, both faces displayed (0xC0) on top of the manager's attributes
    reg_G3_POLYGON_ATTR = (ptcl->alp.current_polygonID << REG_G3_POLYGON_ATTR_ID_SHIFT) | (attributes | 0xC0) | (alpha << REG_G3_POLYGON_ATTR_ALPHA_SHIFT);
    (void)reg_G3_POLYGON_ATTR; // read back: needed for the match
    if (alpha == 0) {
        return;
    }
    gSplRotateFuncs[mgr->current_state.p_emtr->p_res->p_base->flag.pol_rot_axis](FX_SinIdx(ptcl->rtt), FX_CosIdx(ptcl->rtt), &rotation);
    {
        s64 sy = ptcl->base_scl;
        fx32 sx = ((s64)ptcl->base_scl * mgr->current_state.p_emtr->p_res->p_base->aspect + 2048) >> 12;
        switch (mgr->current_state.p_emtr->p_res->p_base->etc.scl_anm_direct) {
        case 0:
            sx = ((s64)sx * ptcl->anm_scl + 2048) >> 12;
            sy = (sy * ptcl->anm_scl + 2048) >> 12;
            break;
        case 1:
            sx = ((s64)sx * ptcl->anm_scl + 2048) >> 12;
            break;
        case 2:
            sy = (sy * ptcl->anm_scl + 2048) >> 12;
            break;
        }
        MTX_Scale43(&scale, sx, sy, sy);
    }
    MTX_Concat43(&scale, &rotation, &matrix);
    if (!mgr->current_state.p_emtr->p_res->p_base->flag.camera_offset) {
        matrix._30 = ptcl->ptcl_pos.x + ptcl->emtr_pos.x;
        matrix._31 = ptcl->ptcl_pos.y + ptcl->emtr_pos.y;
        matrix._32 = ptcl->ptcl_pos.z + ptcl->emtr_pos.z;
        G3_LoadMtx43(mgr->current_state.p_cmr);
        G3_MultMtx43(&matrix);
    } else {
        matrix._30 = ptcl->ptcl_pos.x + ptcl->emtr_pos.x - mgr->current_state.p_emtr->p_res->p_base->pos.x;
        matrix._31 = ptcl->ptcl_pos.y + ptcl->emtr_pos.y - mgr->current_state.p_emtr->p_res->p_base->pos.y;
        matrix._32 = ptcl->ptcl_pos.z + ptcl->emtr_pos.z - mgr->current_state.p_emtr->p_res->p_base->pos.z;
        reg_G3_MTX_IDENTITY = 0;
        // camera offset: relative to the emitter resource position
        {
            SPLResBase *d = mgr->current_state.p_emtr->p_res->p_base;
            int z = d->pos.z, y = d->pos.y, x = d->pos.x;
            reg_G3_MTX_TRANS = x;
            reg_G3_MTX_TRANS = y;
            reg_G3_MTX_TRANS = z;
        }
        G3_MultMtx43(mgr->current_state.p_cmr);
        G3_MultMtx43(&matrix);
    }
    {
        int a = ptcl->clr, b = mgr->current_state.p_emtr->clr;
        // particle colour modulated by the emitter colour
        reg_G3_COLOR = (u16)((((a & 31) * (b & 31)) >> 5) | ((((a & 0x3E0) * (b & 0x3E0)) >> 15) << REG_G3_COLOR_GREEN_SHIFT) | ((((a & 0x7C00) * (b & 0x7C00)) >> 25) << REG_G3_COLOR_BLUE_SHIFT));
    }
    gSplDrawPlaneFuncs[mgr->current_state.p_emtr->p_res->p_base->flag.pol_baseplane](mgr->current_state.p_emtr->tex_s, mgr->current_state.p_emtr->tex_t, mgr->current_state.p_emtr->p_res->p_base->offset_x, mgr->current_state.p_emtr->p_res->p_base->offset_y);
}

void spl_draw_chld_pol(SPLManager *mgr, SPLParticle *ptcl) {
    MtxFx43 matrix, rotation, scale;

    u32 attributes = mgr->misc_flag;
    int alpha = ptcl->alp.base_alp * (ptcl->alp.anm_alp + 1) >> 5;
    // alpha from the particle, polygon ID, both faces displayed (0xC0) on top of the manager's attributes
    reg_G3_POLYGON_ATTR = (ptcl->alp.current_polygonID << REG_G3_POLYGON_ATTR_ID_SHIFT) | (attributes | 0xC0) | (alpha << REG_G3_POLYGON_ATTR_ALPHA_SHIFT);
    (void)reg_G3_POLYGON_ATTR; // read back: needed for the match
    if (alpha == 0) {
        return;
    }
    gSplRotateFuncs[mgr->current_state.p_emtr->p_res->p_chld->flag.pol_rot_axis](FX_SinIdx(ptcl->rtt), FX_CosIdx(ptcl->rtt), &rotation);
    {
        s64 sy = ptcl->base_scl;
        fx32 sx = ((s64)ptcl->base_scl * mgr->current_state.p_emtr->p_res->p_base->aspect + 2048) >> 12;
        switch (mgr->current_state.p_emtr->p_res->p_base->etc.scl_anm_direct) {
        case 0:
            sx = ((s64)sx * ptcl->anm_scl + 2048) >> 12;
            sy = (sy * ptcl->anm_scl + 2048) >> 12;
            break;
        case 1:
            sx = ((s64)sx * ptcl->anm_scl + 2048) >> 12;
            break;
        case 2:
            sy = (sy * ptcl->anm_scl + 2048) >> 12;
            break;
        }
        MTX_Scale43(&scale, sx, sy, sy);
    }
    MTX_Concat43(&rotation, &scale, &matrix);
    if (!mgr->current_state.p_emtr->p_res->p_base->flag.camera_offset) {
        matrix._30 = ptcl->ptcl_pos.x + ptcl->emtr_pos.x;
        matrix._31 = ptcl->ptcl_pos.y + ptcl->emtr_pos.y;
        matrix._32 = ptcl->ptcl_pos.z + ptcl->emtr_pos.z;
        G3_LoadMtx43(mgr->current_state.p_cmr);
        G3_MultMtx43(&matrix);
    } else {
        matrix._30 = ptcl->ptcl_pos.x + ptcl->emtr_pos.x - mgr->current_state.p_emtr->p_res->p_base->pos.x;
        matrix._31 = ptcl->ptcl_pos.y + ptcl->emtr_pos.y - mgr->current_state.p_emtr->p_res->p_base->pos.y;
        matrix._32 = ptcl->ptcl_pos.z + ptcl->emtr_pos.z - mgr->current_state.p_emtr->p_res->p_base->pos.z;
        reg_G3_MTX_IDENTITY = 0;
        // camera offset: relative to the emitter resource position
        {
            SPLResBase *d = mgr->current_state.p_emtr->p_res->p_base;
            int z = d->pos.z, y = d->pos.y, x = d->pos.x;
            reg_G3_MTX_TRANS = x;
            reg_G3_MTX_TRANS = y;
            reg_G3_MTX_TRANS = z;
        }
        G3_MultMtx43(mgr->current_state.p_cmr);
        G3_MultMtx43(&matrix);
    }
    {
        int a = ptcl->clr, b = mgr->current_state.p_emtr->clr;
        // particle colour modulated by the emitter colour
        reg_G3_COLOR = (u16)((((a & 31) * (b & 31)) >> 5) | ((((a & 0x3E0) * (b & 0x3E0)) >> 15) << REG_G3_COLOR_GREEN_SHIFT) | ((((a & 0x7C00) * (b & 0x7C00)) >> 25) << REG_G3_COLOR_BLUE_SHIFT));
    }
    gSplDrawPlaneFuncs[mgr->current_state.p_emtr->p_res->p_chld->flag.pol_baseplane](mgr->current_state.p_emtr->chld_tex_s, mgr->current_state.p_emtr->chld_tex_t, 0, 0);
}

void spl_draw_dpl(SPLManager *mgr, SPLParticle *ptcl) {
    MtxFx43 matrix, rotation, scale;
    VecFx32 direction, cross1, cross2, up;
    MtxFx43 basis;

    u32 attributes = mgr->misc_flag;
    int alpha = ptcl->alp.base_alp * (ptcl->alp.anm_alp + 1) >> 5;
    // alpha from the particle, polygon ID, both faces displayed (0xC0) on top of the manager's attributes
    reg_G3_POLYGON_ATTR = (ptcl->alp.current_polygonID << REG_G3_POLYGON_ATTR_ID_SHIFT) | (attributes | 0xC0) | (alpha << REG_G3_POLYGON_ATTR_ALPHA_SHIFT);
    (void)reg_G3_POLYGON_ATTR; // read back: needed for the match
    if (alpha == 0) {
        return;
    }
    gSplRotateFuncs[mgr->current_state.p_emtr->p_res->p_base->flag.pol_rot_axis](FX_SinIdx(ptcl->rtt), FX_CosIdx(ptcl->rtt), &rotation);
    MTX_Identity43(&basis);
    if (!mgr->current_state.p_emtr->p_res->p_base->etc.dpol_center) {
        VEC_Normalize(&ptcl->vel, &direction);
    } else {
        VEC_Normalize(&ptcl->ptcl_pos, &direction);
        direction.x = -direction.x;
        direction.y = -direction.y;
        direction.z = -direction.z;
    }
    up.x = 0;
    up.y = 4096;
    up.z = 0;
    {
        int dot = VEC_DotProduct(&direction, &up);
        if (dot > 3277 || dot < -3277) {
            up.x = 4096;
            up.y = 0;
            up.z = 0;
        }
    }
    VEC_CrossProduct(&direction, &up, &cross1);
    VEC_CrossProduct(&direction, &cross1, &cross2);
    basis._00 = cross1.x;
    basis._01 = cross1.y;
    basis._02 = cross1.z;
    basis._10 = direction.x;
    basis._11 = direction.y;
    basis._12 = direction.z;
    basis._20 = cross2.x;
    basis._21 = cross2.y;
    basis._22 = cross2.z;
    MTX_Concat43(&rotation, &basis, &rotation);
    {
        s64 sy = ptcl->base_scl;
        fx32 sx = ((s64)ptcl->base_scl * mgr->current_state.p_emtr->p_res->p_base->aspect + 2048) >> 12;
        switch (mgr->current_state.p_emtr->p_res->p_base->etc.scl_anm_direct) {
        case 0:
            sx = ((s64)sx * ptcl->anm_scl + 2048) >> 12;
            sy = (sy * ptcl->anm_scl + 2048) >> 12;
            break;
        case 1:
            sx = ((s64)sx * ptcl->anm_scl + 2048) >> 12;
            break;
        case 2:
            sy = (sy * ptcl->anm_scl + 2048) >> 12;
            break;
        }
        MTX_Scale43(&scale, sx, sy, sy);
    }
    MTX_Concat43(&scale, &rotation, &matrix);
    if (!mgr->current_state.p_emtr->p_res->p_base->flag.camera_offset) {
        matrix._30 = ptcl->ptcl_pos.x + ptcl->emtr_pos.x;
        matrix._31 = ptcl->ptcl_pos.y + ptcl->emtr_pos.y;
        matrix._32 = ptcl->ptcl_pos.z + ptcl->emtr_pos.z;
        G3_LoadMtx43(mgr->current_state.p_cmr);
        G3_MultMtx43(&matrix);
    } else {
        matrix._30 = ptcl->ptcl_pos.x + ptcl->emtr_pos.x - mgr->current_state.p_emtr->p_res->p_base->pos.x;
        matrix._31 = ptcl->ptcl_pos.y + ptcl->emtr_pos.y - mgr->current_state.p_emtr->p_res->p_base->pos.y;
        matrix._32 = ptcl->ptcl_pos.z + ptcl->emtr_pos.z - mgr->current_state.p_emtr->p_res->p_base->pos.z;
        reg_G3_MTX_IDENTITY = 0;
        // camera offset: relative to the emitter resource position
        {
            SPLResBase *d = mgr->current_state.p_emtr->p_res->p_base;
            int z = d->pos.z, y = d->pos.y, x = d->pos.x;
            reg_G3_MTX_TRANS = x;
            reg_G3_MTX_TRANS = y;
            reg_G3_MTX_TRANS = z;
        }
        G3_MultMtx43(mgr->current_state.p_cmr);
        G3_MultMtx43(&matrix);
    }
    {
        int a = ptcl->clr, b = mgr->current_state.p_emtr->clr;
        // particle colour modulated by the emitter colour
        reg_G3_COLOR = (u16)((((a & 31) * (b & 31)) >> 5) | ((((a & 0x3E0) * (b & 0x3E0)) >> 15) << REG_G3_COLOR_GREEN_SHIFT) | ((((a & 0x7C00) * (b & 0x7C00)) >> 25) << REG_G3_COLOR_BLUE_SHIFT));
    }
    gSplDrawPlaneFuncs[mgr->current_state.p_emtr->p_res->p_base->flag.pol_baseplane](mgr->current_state.p_emtr->tex_s, mgr->current_state.p_emtr->tex_t, mgr->current_state.p_emtr->p_res->p_base->offset_x, mgr->current_state.p_emtr->p_res->p_base->offset_y);
}

void spl_draw_chld_dpl(SPLManager *mgr, SPLParticle *ptcl) {
    MtxFx43 matrix, rotation, scale;
    VecFx32 direction, cross1, cross2, up;
    MtxFx43 basis;

    u32 attributes = mgr->misc_flag;
    int alpha = ptcl->alp.base_alp * (ptcl->alp.anm_alp + 1) >> 5;
    // alpha from the particle, polygon ID, both faces displayed (0xC0) on top of the manager's attributes
    reg_G3_POLYGON_ATTR = (ptcl->alp.current_polygonID << REG_G3_POLYGON_ATTR_ID_SHIFT) | (attributes | 0xC0) | (alpha << REG_G3_POLYGON_ATTR_ALPHA_SHIFT);
    (void)reg_G3_POLYGON_ATTR; // read back: needed for the match
    if (alpha == 0) {
        return;
    }
    gSplRotateFuncs[mgr->current_state.p_emtr->p_res->p_chld->flag.pol_rot_axis](FX_SinIdx(ptcl->rtt), FX_CosIdx(ptcl->rtt), &rotation);
    MTX_Identity43(&basis);
    if (!mgr->current_state.p_emtr->p_res->p_chld->etc.dpol_center) {
        VEC_Normalize(&ptcl->vel, &direction);
    } else {
        VEC_Normalize(&ptcl->ptcl_pos, &direction);
        direction.x = -direction.x;
        direction.y = -direction.y;
        direction.z = -direction.z;
    }
    up.x = 0;
    up.y = 4096;
    up.z = 0;
    {
        int dot = VEC_DotProduct(&direction, &up);
        if (dot > 3277 || dot < -3277) {
            up.x = 4096;
            up.y = 0;
            up.z = 0;
        }
    }
    VEC_CrossProduct(&direction, &up, &cross1);
    VEC_CrossProduct(&direction, &cross1, &cross2);
    basis._00 = cross1.x;
    basis._01 = cross1.y;
    basis._02 = cross1.z;
    basis._10 = direction.x;
    basis._11 = direction.y;
    basis._12 = direction.z;
    basis._20 = cross2.x;
    basis._21 = cross2.y;
    basis._22 = cross2.z;
    MTX_Concat43(&rotation, &basis, &rotation);
    {
        s64 sy = ptcl->base_scl;
        fx32 sx = ((s64)ptcl->base_scl * mgr->current_state.p_emtr->p_res->p_base->aspect + 2048) >> 12;
        switch (mgr->current_state.p_emtr->p_res->p_base->etc.scl_anm_direct) {
        case 0:
            sx = ((s64)sx * ptcl->anm_scl + 2048) >> 12;
            sy = (sy * ptcl->anm_scl + 2048) >> 12;
            break;
        case 1:
            sx = ((s64)sx * ptcl->anm_scl + 2048) >> 12;
            break;
        case 2:
            sy = (sy * ptcl->anm_scl + 2048) >> 12;
            break;
        }
        MTX_Scale43(&scale, sx, sy, sy);
    }
    MTX_Concat43(&rotation, &scale, &matrix);
    if (!mgr->current_state.p_emtr->p_res->p_base->flag.camera_offset) {
        matrix._30 = ptcl->ptcl_pos.x + ptcl->emtr_pos.x;
        matrix._31 = ptcl->ptcl_pos.y + ptcl->emtr_pos.y;
        matrix._32 = ptcl->ptcl_pos.z + ptcl->emtr_pos.z;
        G3_LoadMtx43(mgr->current_state.p_cmr);
        G3_MultMtx43(&matrix);
    } else {
        matrix._30 = ptcl->ptcl_pos.x + ptcl->emtr_pos.x - mgr->current_state.p_emtr->p_res->p_base->pos.x;
        matrix._31 = ptcl->ptcl_pos.y + ptcl->emtr_pos.y - mgr->current_state.p_emtr->p_res->p_base->pos.y;
        matrix._32 = ptcl->ptcl_pos.z + ptcl->emtr_pos.z - mgr->current_state.p_emtr->p_res->p_base->pos.z;
        reg_G3_MTX_IDENTITY = 0;
        // camera offset: relative to the emitter resource position
        {
            SPLResBase *d = mgr->current_state.p_emtr->p_res->p_base;
            int z = d->pos.z, y = d->pos.y, x = d->pos.x;
            reg_G3_MTX_TRANS = x;
            reg_G3_MTX_TRANS = y;
            reg_G3_MTX_TRANS = z;
        }
        G3_MultMtx43(mgr->current_state.p_cmr);
        G3_MultMtx43(&matrix);
    }
    {
        int a = ptcl->clr, b = mgr->current_state.p_emtr->clr;
        // particle colour modulated by the emitter colour
        reg_G3_COLOR = (u16)((((a & 31) * (b & 31)) >> 5) | ((((a & 0x3E0) * (b & 0x3E0)) >> 15) << REG_G3_COLOR_GREEN_SHIFT) | ((((a & 0x7C00) * (b & 0x7C00)) >> 25) << REG_G3_COLOR_BLUE_SHIFT));
    }
    gSplDrawPlaneFuncs[mgr->current_state.p_emtr->p_res->p_chld->flag.pol_baseplane](mgr->current_state.p_emtr->chld_tex_s, mgr->current_state.p_emtr->chld_tex_t, 0, 0);
}

void spl_set_tex(const SPLTexture *tex) {
    SPLTexParam param = tex->tex_param;

    G3_TexImageParam((GXTexFmt)param.fmt, GX_TEXGEN_TEXCOORD, (GXTexSizeS)param.s, (GXTexSizeT)param.t, (GXTexRepeat)param.rep, (GXTexFlip)param.flp, (GXTexPlttColor0)param.plt0, tex->tex_addr);
    G3_TexPlttBase(tex->plt_addr, (GXTexFmt)param.fmt);
    // texture matrix: texel units
    G3_MtxMode(GX_MTXMODE_TEXTURE);
    G3_Identity();
    MtxScale(tex->wdt << FX32_SHIFT, tex->hgt << FX32_SHIFT, 0);
    G3_MtxMode(GX_MTXMODE_POSITION);
}

void spl_set_tex_dummy(const SPLTexture *tex) {
}
