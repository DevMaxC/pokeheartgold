#include "spl_internal.h"

// particle generation: new particles of an emitter (initial position by init_pos_type, velocity,
// scale, colour, rotation, life, texture) and the children a particle spawns

// a random fx32 in [-1, 1)
#define RANDOM_SIGNED_ONE() (((int)((SPL_RNDM_NEXT() >> 23) << FX32_SHIFT) - 0x100000) >> 8)
// a random fx32 in [0.5, 1)
#define RANDOM_HALF_TO_ONE() ((((int)((SPL_RNDM_NEXT() >> 23) << FX32_SHIFT) - 0x100000) >> 9) + 0x800)
// value scaled by a random factor in [1 - range / 256, 1 + range / 256]
#define RANDOMIZE(value, range) (((int)((range) + 255 - (((int)(SPL_RNDM_NEXT() >> 24) * (int)(range)) >> 7)) * (value)) >> 8)

// MWCC 1.2 applies force_active as set at the end of the file and emits a file's functions in
// reverse order: the functions are defined last-to-first here (link order is bottom-up).
#pragma force_active on

void spl_set_cross_to_axis(SPLEmitter *emtr) {
    VecFx16 base = gSplAxisY;
    VecFx16 axis;
    fx32 dot;

    switch (emtr->p_res->p_base->flag.circle_axis) {
    case 2:
        axis.x = FX32_ONE;
        axis.y = 0;
        axis.z = 0;
        break;
    case 1:
        axis.x = 0;
        axis.y = FX32_ONE;
        axis.z = 0;
        break;
    case 0:
        axis.x = 0;
        axis.y = 0;
        axis.z = FX32_ONE;
        break;
    default:
        VEC_Fx16Normalize(&emtr->axis, &axis);
        break;
    }
    // the base vector must not be parallel to the axis
    dot = VEC_Fx16DotProduct(&base, &axis);
    if (dot == FX32_ONE || dot == -FX32_ONE) {
        base.x = FX32_ONE;
        base.y = 0;
        base.z = 0;
    }
    emtr->cross_to_axis_1.x = FX_Mul(axis.y, base.z) - FX_Mul(axis.z, base.y);
    emtr->cross_to_axis_1.y = FX_Mul(axis.z, base.x) - FX_Mul(axis.x, base.z);
    emtr->cross_to_axis_1.z = FX_Mul(axis.x, base.y) - FX_Mul(axis.y, base.x);
    emtr->cross_to_axis_2.x = FX_Mul(axis.y, emtr->cross_to_axis_1.z) - FX_Mul(axis.z, emtr->cross_to_axis_1.y);
    emtr->cross_to_axis_2.y = FX_Mul(axis.z, emtr->cross_to_axis_1.x) - FX_Mul(axis.x, emtr->cross_to_axis_1.z);
    emtr->cross_to_axis_2.z = FX_Mul(axis.x, emtr->cross_to_axis_1.y) - FX_Mul(axis.y, emtr->cross_to_axis_1.x);
    VEC_Fx16Normalize(&emtr->cross_to_axis_1, &emtr->cross_to_axis_1);
    VEC_Fx16Normalize(&emtr->cross_to_axis_2, &emtr->cross_to_axis_2);
}

// out = vec in the emitter's axis frame (x along cross_to_axis_1, y along cross_to_axis_2, z along
// their cross product)
void spl_set_circle_axis(VecFx32 *out, const VecFx32 *vec, const SPLEmitter *emtr) {
    VecFx16 normal;

    VEC_Fx16CrossProduct(&emtr->cross_to_axis_1, &emtr->cross_to_axis_2, &normal);
    VEC_Fx16Normalize(&normal, &normal);
    out->x = FX_Mul(vec->z, normal.x) + (FX_Mul(vec->x, emtr->cross_to_axis_1.x) + FX_Mul(vec->y, emtr->cross_to_axis_2.x));
    out->y = FX_Mul(vec->z, normal.y) + (FX_Mul(vec->x, emtr->cross_to_axis_1.y) + FX_Mul(vec->y, emtr->cross_to_axis_2.y));
    out->z = FX_Mul(vec->z, normal.z) + (FX_Mul(vec->x, emtr->cross_to_axis_1.z) + FX_Mul(vec->y, emtr->cross_to_axis_2.z));
}

void spl_gen_ptcl(SPLEmitter *emtr, SPLParticleList *ptcl_list) {
    SPLResource *res = emtr->p_res;
    SPLResBase *base = res->p_base;
    SPLParticle *ptcl;
    int gen_num = emtr->gen_num + emtr->gen_num_dec;
    int i;
    int count = gen_num >> 12;
    fx32 vel_pos, vel_axis;
    int angle;
    VecFx16 hemi_axis16, half_ball_axis16;
    u16 colors[3];
    VecFx32 on_circle, even_circle, in_disc, hemi_axis, half_ball_axis, on_cylinder, in_cylinder, normal, cylinder_dir;
    emtr->gen_num_dec = gen_num & 0xfff;
    // the circle, disc, cylinder and hemisphere types place particles relative to the emitter axis
    if (base->flag.init_pos_type == 2 || base->flag.init_pos_type == 3 || (u32)(base->flag.init_pos_type - 5) <= 4) {
        spl_set_cross_to_axis(emtr);
    }
    i = 0;
    if (count <= 0) {
        return;
    }
    angle = 0;
    do {
        ptcl = (SPLParticle *)spl_pop_front((SplList *)ptcl_list);
        if (!ptcl) {
            return;
        }
        spl_push_front((SplList *)&emtr->act_ptcl_list, (SplNode *)ptcl);
        switch (base->flag.init_pos_type) {
        case 0: // point
            ptcl->ptcl_pos.x = ptcl->ptcl_pos.y = ptcl->ptcl_pos.z = 0;
            break;
        case 1: // sphere surface
            spl_rndm_get_arb_vec_xyz(&ptcl->ptcl_pos);
            ptcl->ptcl_pos.x = FX_Mul(ptcl->ptcl_pos.x, emtr->radius);
            ptcl->ptcl_pos.y = FX_Mul(ptcl->ptcl_pos.y, emtr->radius);
            ptcl->ptcl_pos.z = FX_Mul(ptcl->ptcl_pos.z, emtr->radius);
            break;
        case 2: // random point on a circle
            spl_rndm_get_arb_vec_xy(&on_circle);
            on_circle.x = FX_Mul(on_circle.x, emtr->radius);
            on_circle.y = FX_Mul(on_circle.y, emtr->radius);
            on_circle.z = 0;
            spl_set_circle_axis(&ptcl->ptcl_pos, &on_circle, emtr);
            break;
        case 3: { // evenly spaced on a circle
            int index = angle / count;
            fx16 sine, cosine;
            angle += 0x10000;
            index >>= 4;
            sine = FX_SinCosTable_[index * 2];
            cosine = FX_SinCosTable_[index * 2 + 1];
            even_circle.x = FX_Mul(sine, emtr->radius);
            even_circle.y = FX_Mul(cosine, emtr->radius);
            even_circle.z = 0;
            spl_set_circle_axis(&ptcl->ptcl_pos, &even_circle, emtr);
            break;
        }
        case 4: // sphere volume
            spl_rndm_get_arb_vec_xyz(&ptcl->ptcl_pos);
            ptcl->ptcl_pos.x = FX_Mul(FX_Mul(ptcl->ptcl_pos.x, emtr->radius), RANDOM_SIGNED_ONE());
            ptcl->ptcl_pos.y = FX_Mul(FX_Mul(ptcl->ptcl_pos.y, emtr->radius), RANDOM_SIGNED_ONE());
            ptcl->ptcl_pos.z = FX_Mul(FX_Mul(ptcl->ptcl_pos.z, emtr->radius), RANDOM_SIGNED_ONE());
            break;
        case 5: // disc
            spl_rndm_get_arb_vec_xy(&in_disc);
            {
                fx32 factor = RANDOM_SIGNED_ONE();
                in_disc.x = FX_Mul(FX_Mul(in_disc.x, emtr->radius), factor);
            }
            {
                fx32 factor = RANDOM_SIGNED_ONE();
                in_disc.y = FX_Mul(FX_Mul(in_disc.y, emtr->radius), factor);
            }
            spl_set_circle_axis(&ptcl->ptcl_pos, &in_disc, emtr);
            break;
        case 8: // hemisphere surface
            spl_rndm_get_arb_vec_xyz(&ptcl->ptcl_pos);
            VEC_Fx16CrossProduct(&emtr->cross_to_axis_1, &emtr->cross_to_axis_2, &hemi_axis16);
            hemi_axis.x = hemi_axis16.x;
            hemi_axis.y = hemi_axis16.y;
            hemi_axis.z = hemi_axis16.z;
            if (VEC_DotProduct(&hemi_axis, &ptcl->ptcl_pos) <= 0) {
                ptcl->ptcl_pos.x = -ptcl->ptcl_pos.x;
                ptcl->ptcl_pos.y = -ptcl->ptcl_pos.y;
                ptcl->ptcl_pos.z = -ptcl->ptcl_pos.z;
            }
            ptcl->ptcl_pos.x = FX_Mul(ptcl->ptcl_pos.x, emtr->radius);
            ptcl->ptcl_pos.y = FX_Mul(ptcl->ptcl_pos.y, emtr->radius);
            ptcl->ptcl_pos.z = FX_Mul(ptcl->ptcl_pos.z, emtr->radius);
            break;
        case 9: // hemisphere volume
            spl_rndm_get_arb_vec_xyz(&ptcl->ptcl_pos);
            VEC_Fx16CrossProduct(&emtr->cross_to_axis_1, &emtr->cross_to_axis_2, &half_ball_axis16);
            half_ball_axis.x = half_ball_axis16.x;
            half_ball_axis.y = half_ball_axis16.y;
            half_ball_axis.z = half_ball_axis16.z;
            if (VEC_DotProduct(&half_ball_axis, &ptcl->ptcl_pos) < 0) {
                ptcl->ptcl_pos.x = -ptcl->ptcl_pos.x;
                ptcl->ptcl_pos.y = -ptcl->ptcl_pos.y;
                ptcl->ptcl_pos.z = -ptcl->ptcl_pos.z;
            }
            {
                fx32 factor = RANDOM_HALF_TO_ONE();
                ptcl->ptcl_pos.x = FX_Mul(FX_Mul(ptcl->ptcl_pos.x, emtr->radius), factor);
            }
            {
                fx32 factor = RANDOM_HALF_TO_ONE();
                ptcl->ptcl_pos.y = FX_Mul(FX_Mul(ptcl->ptcl_pos.y, emtr->radius), factor);
            }
            {
                fx32 factor = RANDOM_HALF_TO_ONE();
                ptcl->ptcl_pos.z = FX_Mul(FX_Mul(ptcl->ptcl_pos.z, emtr->radius), factor);
            }
            break;
        case 6: // cylinder surface
            spl_rndm_get_arb_vec_xy(&ptcl->vel);
            on_cylinder.x = FX_Mul(ptcl->vel.x, emtr->radius);
            on_cylinder.y = FX_Mul(ptcl->vel.y, emtr->radius);
            on_cylinder.z = ((int)(emtr->length * (int)(SPL_RNDM_NEXT() >> 23)) - (emtr->length << 8)) >> 8;
            spl_set_circle_axis(&ptcl->ptcl_pos, &on_cylinder, emtr);
            break;
        case 7: // cylinder volume
            spl_rndm_get_arb_vec_xy(&ptcl->vel);
            in_cylinder.x = FX_Mul(FX_Mul(ptcl->vel.x, emtr->radius), RANDOM_SIGNED_ONE());
            in_cylinder.y = FX_Mul(FX_Mul(ptcl->vel.y, emtr->radius), RANDOM_SIGNED_ONE());
            in_cylinder.z = ((int)(emtr->length * (int)(SPL_RNDM_NEXT() >> 23)) - (emtr->length << 8)) >> 8;
            spl_set_circle_axis(&ptcl->ptcl_pos, &in_cylinder, emtr);
            break;
        }
        vel_pos = RANDOMIZE(emtr->init_vel_mag_pos, base->rndm.init_vel_mag);
        vel_axis = RANDOMIZE(emtr->init_vel_mag_axis, base->rndm.init_vel_mag);
        if (base->flag.init_pos_type == 6) {
            cylinder_dir.x = FX_Mul(ptcl->vel.x, emtr->cross_to_axis_1.x) + FX_Mul(ptcl->vel.y, emtr->cross_to_axis_2.x);
            cylinder_dir.y = FX_Mul(ptcl->vel.x, emtr->cross_to_axis_1.y) + FX_Mul(ptcl->vel.y, emtr->cross_to_axis_2.y);
            cylinder_dir.z = FX_Mul(ptcl->vel.x, emtr->cross_to_axis_1.z) + FX_Mul(ptcl->vel.y, emtr->cross_to_axis_2.z);
            VEC_Normalize(&cylinder_dir, &normal);
        } else if (ptcl->ptcl_pos.x == 0 && ptcl->ptcl_pos.y == 0 && ptcl->ptcl_pos.z == 0) {
            spl_rndm_get_arb_vec_xyz(&normal);
        } else {
            VEC_Normalize(&ptcl->ptcl_pos, &normal);
        }
        ptcl->vel.x = emtr->emtr_init_vel.x + (FX_Mul(normal.x, vel_pos) + FX_Mul(emtr->axis.x, vel_axis));
        ptcl->vel.y = emtr->emtr_init_vel.y + (FX_Mul(normal.y, vel_pos) + FX_Mul(emtr->axis.y, vel_axis));
        ptcl->vel.z = emtr->emtr_init_vel.z + (FX_Mul(normal.z, vel_pos) + FX_Mul(emtr->axis.z, vel_axis));
        ptcl->emtr_pos = emtr->emtr_pos;
        ptcl->base_scl = RANDOMIZE(emtr->base_scl, base->rndm.base_scl);
        ptcl->anm_scl = 0x1000;
        if (base->flag.use_clr_anm && res->p_clr_anm->etc.use_rndm) {
            u32 index = (SPL_RNDM_NEXT() >> 20) % 3;
            colors[0] = res->p_clr_anm->clr_s;
            colors[1] = base->clr_n;
            colors[2] = res->p_clr_anm->clr_e;
            ptcl->clr = colors[index];
        } else {
            ptcl->clr = base->clr_n;
        }
        ptcl->alp.base_alp = emtr->etc.base_alp;
        ptcl->alp.anm_alp = 31;
        if (base->flag.use_init_rtt_rndm) {
            ptcl->rtt = SPL_RNDM_NEXT();
        } else {
            ptcl->rtt = emtr->init_rtt;
        }
        if (base->flag.use_rtt_anm) {
            ptcl->rtt_vel = (u32)((base->rtt_min << 12) + (base->rtt_max - base->rtt_min) * (SPL_RNDM_NEXT() >> 20)) >> 12;
        } else {
            ptcl->rtt_vel = 0;
        }
        ptcl->life = (((255 - (((int)(SPL_RNDM_NEXT() >> 24) * (int)base->rndm.ptcl_life) >> 8)) * emtr->ptcl_life) >> 8) + 1;
        ptcl->age = 0;
        if (base->flag.use_tex_anm && res->p_tex_anm->etc.use_rndm) {
            u32 index = (SPL_RNDM_NEXT() >> 20) % res->p_tex_anm->etc.use_num;
            ptcl->etc.tex_no = res->p_tex_anm->tex_no[index];
        } else if (base->flag.use_tex_anm && !res->p_tex_anm->etc.use_rndm) {
            ptcl->etc.tex_no = res->p_tex_anm->tex_no[0];
        } else {
            ptcl->etc.tex_no = base->etc.tex_no;
        }
        ptcl->life_rate_diff_loop = 65535 / (int)res->p_base->etc.loop_frame;
        ptcl->life_rate_diff_noloop = 65535 / ptcl->life;
        ptcl->etc.life_rate_offset = 0;
        if (base->flag.ptcl_random_loop_anm) {
            ptcl->etc.life_rate_offset = SPL_RNDM_NEXT() >> 24;
        }
        i++;
    } while (i < count);
}

// needed for the match: no common subexpression elimination in spl_gen_child
#pragma opt_common_subs off

void spl_gen_child(SPLParticle *parent, SPLEmitter *emtr, SPLParticleList *ptcl_list) {
    SPLParticle *ptcl;
    VecFx32 *emtr_pos;
    SPLResChld *chld = emtr->p_res->p_chld;
    int vel_ratio = FX_Mul(chld->ratio.vel_ratio << FX32_SHIFT, 16); // vel_ratio / 256
    int i;
    s32 vel;
    s32 scaled;

    for (i = 0; i < chld->etc.gen_num; i++) {
        ptcl = (SPLParticle *)spl_pop_front((SplList *)ptcl_list);
        if (ptcl == NULL) {
            return;
        }
        spl_push_front((SplList *)&emtr->act_chld_list, (SplNode *)ptcl);
        emtr_pos = &ptcl->emtr_pos;
        // the parent's position, its velocity scaled plus a random part in [-mag, mag)
        {
            VecFx32 *dst = &ptcl->ptcl_pos;
            const VecFx32 *src = &parent->ptcl_pos;
            s32 x;
            *dst = *src;
            x = parent->vel.x;
            scaled = FX_Mul(x, vel_ratio);
            SPL_RNDM_NEXT();
            ptcl->vel.x = scaled + ((chld->init_vel_mag_rndm * (int)(spl_rndm_seed >> 23) - (chld->init_vel_mag_rndm * 256)) >> 8);
        }
        vel = parent->vel.y;
        scaled = FX_Mul(vel, vel_ratio);
        SPL_RNDM_NEXT();
        ptcl->vel.y = scaled + ((chld->init_vel_mag_rndm * (int)(spl_rndm_seed >> 23) - (chld->init_vel_mag_rndm * 256)) >> 8);
        vel = parent->vel.z;
        scaled = FX_Mul(vel, vel_ratio);
        SPL_RNDM_NEXT();
        ptcl->vel.z = scaled + ((chld->init_vel_mag_rndm * (int)(spl_rndm_seed >> 23) - (chld->init_vel_mag_rndm * 256)) >> 8);
        *emtr_pos = parent->emtr_pos;
        scaled = (s32)((u32)parent->base_scl * (u32)(s32)parent->anm_scl) >> FX32_SHIFT;
        ptcl->base_scl = (scaled * (chld->ratio.scl_ratio + 1)) >> 6;
        ptcl->anm_scl = FX16_ONE;
        if (chld->flag.use_chld_clr) {
            ptcl->clr = chld->clr;
        } else {
            ptcl->clr = parent->clr;
        }
        ptcl->alp.base_alp = (parent->alp.base_alp * (parent->alp.anm_alp + 1)) >> 5;
        ptcl->alp.anm_alp = 31;
        switch (chld->flag.rtt_type) {
        case 0:
            ptcl->rtt = 0;
            ptcl->rtt_vel = 0;
            break;
        case 1:
            ptcl->rtt = parent->rtt;
            ptcl->rtt_vel = 0;
            break;
        case 2:
            ptcl->rtt = parent->rtt;
            ptcl->rtt_vel = parent->rtt_vel;
            break;
        }
        ptcl->life = chld->life;
        ptcl->age = 0;
        ptcl->etc.tex_no = chld->etc.tex_no;
        ptcl->life_rate_diff_loop = 0xFFFF / (int)((u32)parent->life >> 1);
        ptcl->life_rate_diff_noloop = 0xFFFF / parent->life;
        ptcl->etc.life_rate_offset = 0;
    }
}

#pragma opt_common_subs reset
