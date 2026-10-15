#include "spl_internal.h"

// emitters: set-up from a resource, and the per-frame update (particle generation, animations,
// fields, motion, polygon IDs, ageing) of an emitter's particles and children

// particle animation step and which life rate it runs with
typedef struct SplAnim {
    SplAnimFunc func;
    int loop; // 0: life rate over the particle's life, 1: looping life rate
} SplAnim;

#define COLLISION_Y_UNSET ((fx32)0x80000000)

// velocity damped by air resistance (resist / 512) plus the field acceleration, position moved by it
// and the emitter's velocity
static inline void MoveParticle(SPLParticle *ptcl, SPLEmitter *emtr, int resist, const VecFx32 *acc) {
    ptcl->rtt += ptcl->rtt_vel;
    ptcl->vel.x = (s32)((u32)ptcl->vel.x * (u32)resist) >> 9;
    ptcl->vel.y = (s32)((u32)ptcl->vel.y * (u32)resist) >> 9;
    ptcl->vel.z = (s32)((u32)ptcl->vel.z * (u32)resist) >> 9;
    ptcl->vel.x = (s32)((u32)ptcl->vel.x + (u32)acc->x);
    ptcl->vel.y = (s32)((u32)ptcl->vel.y + (u32)acc->y);
    ptcl->vel.z = (s32)((u32)ptcl->vel.z + (u32)acc->z);
    ptcl->ptcl_pos.x = (s32)((u32)ptcl->ptcl_pos.x + ((u32)ptcl->vel.x + (u32)emtr->emtr_vel.x));
    ptcl->ptcl_pos.y = (s32)((u32)ptcl->ptcl_pos.y + ((u32)ptcl->vel.y + (u32)emtr->emtr_vel.y));
    ptcl->ptcl_pos.z = (s32)((u32)ptcl->ptcl_pos.z + ((u32)ptcl->vel.z + (u32)emtr->emtr_vel.z));
}

// the resource's fixed polygon ID, or the next one of the manager's min..max cycle
#define SET_POLYGON_ID(mgr, emtr, ptcl, fixed_flag)                    \
    if ((emtr)->p_res->p_base->flag.fixed_flag) {                      \
        (ptcl)->alp.current_polygonID = (u16)(mgr)->polygonID.fix;     \
    } else {                                                           \
        (ptcl)->alp.current_polygonID = (u16)(mgr)->polygonID.current; \
        (mgr)->polygonID.current++;                                    \
        if ((mgr)->polygonID.current > (mgr)->polygonID.max) {         \
            (mgr)->polygonID.current = (mgr)->polygonID.min;           \
        }                                                              \
    }

static inline int SetChildAnims(const SPLResChld *chld, SplAnim *anims) {
    int num = 0;

    if (chld->flag.use_scl_anm) {
        anims[num].func = spl_chld_scl_out;
        anims[num].loop = 0;
        num++;
    }
    if (chld->flag.use_alp_anm) {
        anims[num].func = spl_chld_alp_out;
        anims[num].loop = 0;
        num++;
    }
    return num;
}

// MWCC 1.2 applies force_active as set at the end of the file and emits a file's functions in
// reverse order: the functions are defined last-to-first here (link order is bottom-up).
#pragma force_active on

void spl_init(SPLEmitter *emtr, SPLResource *res, const VecFx32 *pos) {
    SPLResBase *base;

    emtr->p_res = res;
    emtr->flag.all = 0;
    emtr->emtr_pos.x = pos->x + emtr->p_res->p_base->pos.x;
    emtr->emtr_pos.y = pos->y + emtr->p_res->p_base->pos.y;
    emtr->emtr_pos.z = pos->z + emtr->p_res->p_base->pos.z;
    emtr->emtr_init_vel.x = 0;
    emtr->emtr_init_vel.y = 0;
    emtr->emtr_init_vel.z = 0;
    emtr->emtr_vel.z = 0;
    emtr->emtr_vel.y = emtr->emtr_vel.z;
    emtr->emtr_vel.x = emtr->emtr_vel.y;
    emtr->age = 0;
    emtr->gen_num_dec = 0;
    base = emtr->p_res->p_base;
    emtr->axis = base->axis;
    emtr->init_rtt = emtr->p_res->p_base->init_rtt;
    emtr->gen_num = emtr->p_res->p_base->gen_num;
    emtr->radius = emtr->p_res->p_base->radius;
    emtr->length = emtr->p_res->p_base->length;
    emtr->init_vel_mag_pos = emtr->p_res->p_base->init_vel_mag_pos;
    emtr->init_vel_mag_axis = emtr->p_res->p_base->init_vel_mag_axis;
    emtr->base_scl = emtr->p_res->p_base->base_scl;
    emtr->ptcl_life = emtr->p_res->p_base->ptcl_life;
    emtr->clr = GX_RGB(31, 31, 31);
    emtr->etc.gen_intvl = emtr->p_res->p_base->etc.gen_intvl;
    emtr->etc.base_alp = emtr->p_res->p_base->etc.base_alp;
    emtr->etc.calc_cycle = 0;
    emtr->etc.reserved = 0;
    emtr->simple_collision_y = COLLISION_Y_UNSET;
    // texture repeat count and mirroring as texture coordinate scales
    emtr->tex_s = FX16_ONE << emtr->p_res->p_base->etc.tex_repeat_num_s;
    emtr->tex_t = FX16_ONE << emtr->p_res->p_base->etc.tex_repeat_num_t;
    if (emtr->p_res->p_base->etc.reverse_tex_s) {
        emtr->tex_s *= (s16)-1;
    }
    if (emtr->p_res->p_base->etc.reverse_tex_t) {
        emtr->tex_t *= (s16)-1;
    }
    if (emtr->p_res->p_base->flag.use_chld) {
        emtr->chld_tex_s = FX16_ONE << emtr->p_res->p_chld->etc.tex_repeat_num_s;
        emtr->chld_tex_t = FX16_ONE << emtr->p_res->p_chld->etc.tex_repeat_num_t;
        if (emtr->p_res->p_chld->etc.reverse_tex_s) {
            emtr->chld_tex_s *= (s16)-1;
        }
        if (emtr->p_res->p_chld->etc.reverse_tex_t) {
            emtr->chld_tex_t *= (s16)-1;
        }
    }
    emtr->p_prev = NULL;
    emtr->p_next = emtr->p_prev;
    emtr->act_chld_list.p_begin = NULL;
    emtr->act_ptcl_list.p_begin = emtr->act_chld_list.p_begin;
    emtr->act_chld_list.node_num = 0;
    emtr->act_ptcl_list.node_num = emtr->act_chld_list.node_num;
    emtr->callbackfunc = NULL;
    emtr->emtr_userdata = NULL;
    emtr->userwork.uw_u32 = 0;
}

void spl_calc(SPLManager *mgr, SPLEmitter *emtr) {
    int i;
    SPLResource *res = emtr->p_res;
    // holds the resource base first, then walks the particles (needed for the match)
    SPLParticle *ptcl = (SPLParticle *)res->p_base;
    SPLParticle *next;
    SPLResChld *chld = res->p_chld;
    SPLResBaseFlag flag = ((SPLResBase *)ptcl)->flag;
    int resist = ((SPLResBase *)ptcl)->etc.air_resist + 0x180;
    int fld_num = res->fld_num;
    SplAnim anims[4];
    SplAnim chld_anims[4];
    VecFx32 acc;
    u8 life_rate[2];

    // locals kept together in one struct (needed for the match)
    struct {
        struct {
            u32 follow_emtr;
            u32 use_chld;
        } flag;

        SPLParticle *next_chld;
    } walk;

    int anim_num = 0;

    if (emtr->callbackfunc != NULL) {
        emtr->callbackfunc(emtr, 0);
    }
    if ((((SPLResBase *)ptcl)->emtr_life == 0 || emtr->age < ((SPLResBase *)ptcl)->emtr_life) && emtr->age % emtr->etc.gen_intvl == 0 && !emtr->flag.terminate && !emtr->flag.stop_generate && emtr->flag.started) {
        spl_gen_ptcl(emtr, &mgr->ina_ptcl_list);
    }

    if (flag.use_scl_anm) {
        anims[anim_num].func = spl_scl_in_out;
        anims[anim_num].loop = res->p_scl_anm->etc.loop;
        anim_num++;
    }
    if (flag.use_clr_anm && !res->p_clr_anm->etc.use_rndm) {
        anims[anim_num].func = spl_clr_in_out;
        anims[anim_num++].loop = res->p_clr_anm->etc.loop;
    }
    if (flag.use_alp_anm) {
        anims[anim_num].func = spl_alp_in_out;
        anims[anim_num++].loop = res->p_alp_anm->etc.loop;
    }
    if (flag.use_tex_anm && !res->p_tex_anm->etc.use_rndm) {
        anims[anim_num].func = spl_tex_ptn_anm;
        anims[anim_num].loop = res->p_tex_anm->etc.loop;
        anim_num++;
    }

    ptcl = emtr->act_ptcl_list.p_begin;
    if (ptcl != NULL) {
        walk.flag.follow_emtr = flag.follow_emtr;
        walk.flag.use_chld = flag.use_chld;
        do {
            next = ptcl->p_next;
            life_rate[0] = (s32)((u32)ptcl->life_rate_diff_noloop * ptcl->age) >> 8;
            life_rate[1] = ptcl->etc.life_rate_offset + ((s32)((u32)ptcl->life_rate_diff_loop * ptcl->age) >> 8);
            {
                int n;
                for (n = 0; n < anim_num; n++) {
                    anims[n].func(ptcl, res, life_rate[anims[n].loop]);
                }
            }
            acc.x = acc.y = acc.z = 0;
            if (walk.flag.follow_emtr) {
                ptcl->emtr_pos = emtr->emtr_pos;
            }
            for (i = 0; i < fld_num; i++) {
                res->fld_ary[i].p_exec(res->fld_ary[i].p_obj, ptcl, &acc, emtr);
            }
            MoveParticle(ptcl, emtr, resist, &acc);
            if (walk.flag.use_chld) {
                // children from gen_start / 256 of the particle's life on, every gen_intvl frames
                int since = (ptcl->age << FX32_SHIFT) - (FX_Mul(ptcl->life << FX32_SHIFT, chld->etc.gen_start << FX32_SHIFT) >> 8);
                if (since >= 0 && (since >> FX32_SHIFT) % chld->etc.gen_intvl == 0) {
                    spl_gen_child(ptcl, emtr, &mgr->ina_ptcl_list);
                }
            }
            SET_POLYGON_ID(mgr, emtr, ptcl, polygonID_fixed);
            ptcl->age++;
            if (ptcl->age > ptcl->life) {
                spl_push_front((SplList *)&mgr->ina_ptcl_list, spl_del((SplList *)&emtr->act_ptcl_list, (SplNode *)ptcl));
            }
        } while ((ptcl = next) != NULL);
    }

    if (flag.use_chld) {
        int chld_anim_num = SetChildAnims(chld, chld_anims);
        SPLParticle *chld_ptcl;

        if (!chld->flag.affect_fld) {
            fld_num = 0;
        }
        for (chld_ptcl = emtr->act_chld_list.p_begin; chld_ptcl != NULL; chld_ptcl = walk.next_chld) {
            walk.next_chld = chld_ptcl->p_next;
            life_rate[0] = (chld_ptcl->age << 8) / chld_ptcl->life;
            i = 0;
            if (chld_anim_num > 0) {
                u8 rate = life_rate[0];
                do {
                    chld_anims[i].func(chld_ptcl, res, rate);
                    i++;
                } while (i < chld_anim_num);
            }
            acc.x = acc.y = acc.z = 0;
            if (chld->flag.follow_emtr) {
                chld_ptcl->emtr_pos = emtr->emtr_pos;
            }
            for (i = 0; i < fld_num; i++) {
                res->fld_ary[i].p_exec(res->fld_ary[i].p_obj, chld_ptcl, &acc, emtr);
            }
            MoveParticle(chld_ptcl, emtr, resist, &acc);
            SET_POLYGON_ID(mgr, emtr, chld_ptcl, child_polygonID_fixed);
            chld_ptcl->age++;
            if (chld_ptcl->age > chld_ptcl->life) {
                spl_push_front((SplList *)&mgr->ina_ptcl_list, spl_del((SplList *)&emtr->act_chld_list, (SplNode *)chld_ptcl));
            }
        }
    }

    emtr->age++;
    if (emtr->callbackfunc != NULL) {
        emtr->callbackfunc(emtr, 1);
    }
}
