#include "spl_internal.h"

// drawing of the current emitter: its particles and children with the draw function of their draw
// type (billboard, directional billboard, polygon, directional polygon)

// MWCC 1.2 applies force_active as set at the end of the file and emits a file's functions in
// reverse order: the functions are defined last-to-first here (link order is bottom-up).
#pragma force_active on

void sDrawParent(SPLManager *mgr) {
    void (*set_tex)(const SPLTexture *);
    SPLParticle *ptcl;
    SPLEmitter *emtr = mgr->current_state.p_emtr;
    SPLResource *res = emtr->p_res;
    SPLResBase *base = res->p_base;
    SplDrawFunc draw = NULL;

    spl_set_tex(&mgr->tex_ary[base->etc.tex_no]);
    switch (base->flag.draw_type) {
    case 0:
        draw = spl_draw_bb;
        break;
    case 1:
        draw = spl_draw_dbb;
        break;
    case 2:
        draw = spl_draw_pol;
        break;
    case 3:
        draw = spl_draw_dpl;
        break;
    case 4:
        draw = spl_draw_dpl;
        break;
    }
    // with a texture animation every particle sets its own texture
    if (((volatile SPLResBaseFlag *)&base->flag)->use_tex_anm) { // volatile: needed for the match
        set_tex = spl_set_tex;
    } else {
        set_tex = spl_set_tex_dummy;
    }
    ptcl = emtr->act_ptcl_list.p_begin;
    while (ptcl != NULL) {
        set_tex(&mgr->tex_ary[ptcl->etc.tex_no]);
        draw(mgr, ptcl);
        ptcl = ptcl->p_next;
    }
}

void sDrawChild(SPLManager *mgr) {
    SPLEmitter *emtr = mgr->current_state.p_emtr;
    SPLResource *res = emtr->p_res;
    SplDrawFunc draw = NULL;

    if (!res->p_base->flag.use_chld) {
        return;
    }
    spl_set_tex(&mgr->tex_ary[res->p_chld->etc.tex_no]);
    switch (res->p_chld->flag.draw_type) {
    case 0:
        draw = spl_draw_chld_bb;
        break;
    case 1:
        draw = spl_draw_chld_dbb;
        break;
    case 2:
        draw = spl_draw_chld_pol;
        break;
    case 3:
        draw = spl_draw_chld_dpl;
        break;
    case 4:
        draw = spl_draw_chld_dpl;
        break;
    }
    SPLParticle *ptcl = emtr->act_chld_list.p_begin;
    while (ptcl != NULL) {
        draw(mgr, ptcl);
        ptcl = ptcl->p_next;
    }
}

void spl_draw(SPLManager *mgr) {
    SPLResBase *base = mgr->current_state.p_emtr->p_res->p_base;

    if (base->flag.draw_child_first) {
        sDrawChild(mgr);
        if (!base->flag.draw_parent) {
            sDrawParent(mgr);
        }
    } else {
        if (!base->flag.draw_parent) {
            sDrawParent(mgr);
        }
        sDrawChild(mgr);
    }
}
