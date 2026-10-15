#include "spl_internal.h"

// per-particle animations over the particle's life (life_rate 0-255): child fade / shrink out,
// texture pattern, alpha, colour and scale in / peak / out curves

// MWCC 1.2 applies force_active as set at the end of the file and emits a file's functions in
// reverse order: the functions are defined last-to-first here (link order is bottom-up).
#pragma force_active on

void spl_scl_in_out(SPLParticle *ptcl, SPLResource *res, int life_rate) {
    SPLResSclAnm *anm = res->p_scl_anm;
    int in = anm->in_out.in;
    int out = anm->in_out.out;

    if (life_rate < in) {
        int start = anm->scl_s;
        int normal = anm->scl_n;
        ptcl->anm_scl = start + (normal - start) * life_rate / in;
    } else if (life_rate < out) {
        ptcl->anm_scl = anm->scl_n;
    } else {
        int end = anm->scl_e;
        int normal = anm->scl_n;
        ptcl->anm_scl = end + (end - normal) * (life_rate - 255) / (255 - out);
    }
}

void spl_clr_in_out(SPLParticle *ptcl, SPLResource *res, int life_rate) {
    SPLResClrAnm *anm = res->p_clr_anm;
    SPLResBase *base = res->p_base;
    int in = anm->in_peak_out.in;
    int peak = anm->in_peak_out.peak;
    int out = anm->in_peak_out.out;

    if (life_rate < in) {
        ptcl->clr = anm->clr_s;
    } else if (life_rate < peak) {
        GXRgb end = base->clr_n;
        GXRgb start = anm->clr_s;
        int end_r = end & 0x1F;
        int start_r = start & 0x1F;
        int end_g = (end >> 5) & 0x1F;
        int start_g = (start >> 5) & 0x1F;
        int end_b = (end >> 10) & 0x1F;
        int start_b = (start >> 10) & 0x1F;
        if (!anm->etc.interpolation) {
            ptcl->clr = GX_RGB(end_r, end_g, end_b);
        } else {
            int t = life_rate - in;
            int span = peak - in;
            int db = t * (end_b - start_b) / span;
            int dr = t * (end_r - start_r) / span;
            int dg = t * (end_g - start_g) / span;
            ptcl->clr = GX_RGB(start_r + dr, start_g + dg, start_b + db);
        }
    } else if (life_rate < out) {
        GXRgb end = anm->clr_e;
        GXRgb start = base->clr_n;
        int start_r = start & 0x1F;
        int end_r = end & 0x1F;
        int start_g = (start >> 5) & 0x1F;
        int end_g = (end >> 5) & 0x1F;
        int start_b = (start >> 10) & 0x1F;
        int end_b = (end >> 10) & 0x1F;
        if (!anm->etc.interpolation) {
            ptcl->clr = GX_RGB(end_r, end_g, end_b);
        } else {
            int t = life_rate - peak;
            int span = out - peak;
            int db = t * (end_b - start_b) / span;
            int dr = t * (end_r - start_r) / span;
            int dg = t * (end_g - start_g) / span;
            ptcl->clr = GX_RGB(start_r + dr, start_g + dg, start_b + db);
        }
    } else {
        ptcl->clr = anm->clr_e;
    }
}

void spl_alp_in_out(SPLParticle *ptcl, SPLResource *res, int life_rate) {
    SPLResAlpAnm *anm = res->p_alp_anm;
    int alp;
    int in = anm->in_out.in;
    int out = anm->in_out.out;

    if (life_rate < in) {
        alp = anm->alp.s + life_rate * (anm->alp.n - anm->alp.s) / in;
    } else if (life_rate < out) {
        alp = anm->alp.n;
    } else {
        alp = anm->alp.e + (life_rate - 255) * (anm->alp.e - anm->alp.n) / (255 - out);
    }
    // flicker: scale down by a random fraction of up to flick / 256
    SPL_RNDM_NEXT();
    ptcl->alp.anm_alp = (alp * (255 - ((anm->etc.flick * (int)(spl_rndm_seed >> 24)) >> 8))) >> 8;
}

void spl_tex_ptn_anm(SPLParticle *ptcl, SPLResource *res, int life_rate) {
    SPLResTexAnm *anm = res->p_tex_anm;
    int i;

    for (i = 0; i < anm->etc.use_num; i++) {
        if (life_rate < anm->etc.diff * (i + 1)) {
            ptcl->etc.tex_no = anm->tex_no[i];
            return;
        }
    }
}

void spl_chld_scl_out(SPLParticle *ptcl, SPLResource *res, int life_rate) {
    fx16 scl_e = res->p_chld->scl_e;

    ptcl->anm_scl = scl_e + (scl_e - FX16_ONE) * (life_rate - 255) / 255;
}

void spl_chld_alp_out(SPLParticle *ptcl, SPLResource *res, int life_rate) {
    ptcl->alp.anm_alp = (255 - life_rate) * 31 / 255;
}
