#include "spl_internal.h"

// fields: per-frame forces and position changes applied to every particle of an emitter
// (the SPLField p_exec functions; obj points at the field's parameter block in the resource, see
// spl_internal.h)

#define COLLISION_Y_UNSET ((fx32)0x80000000)

// MWCC 1.2 applies force_active as set at the end of the file and emits a file's functions in
// reverse order: the functions are defined last-to-first here (link order is bottom-up).
#pragma force_active on

void spl_calc_gravity(const void *obj, SPLParticle *ptcl, VecFx32 *acc, SPLEmitter *emtr) {
    const SplGravityField *field = obj;

    acc->x += field->mag.x;
    acc->y += field->mag.y;
    acc->z += field->mag.z;
}

void spl_calc_random(const void *obj, SPLParticle *ptcl, VecFx32 *acc, SPLEmitter *emtr) {
    const SplRandomField *field = obj;

    if (ptcl->age % field->interval != 0) {
        return;
    }
    // (seed >> 23) - 256 is in [-256, 256): a random value in [-mag, mag)
    SPL_RNDM_NEXT();
    acc->x += (field->mag.x * (int)(spl_rndm_seed >> 23) - (field->mag.x << 8)) >> 8;
    SPL_RNDM_NEXT();
    acc->y += (field->mag.y * (int)(spl_rndm_seed >> 23) - (field->mag.y << 8)) >> 8;
    SPL_RNDM_NEXT();
    acc->z += (field->mag.z * (int)(spl_rndm_seed >> 23) - (field->mag.z << 8)) >> 8;
}

void spl_calc_magnet(const void *obj, SPLParticle *ptcl, VecFx32 *acc, SPLEmitter *emtr) {
    const SplMagnetField *field = obj;

    acc->x += field->mag * (field->pos.x - ptcl->ptcl_pos.x - ptcl->vel.x) >> FX32_SHIFT;
    acc->y += field->mag * (field->pos.y - ptcl->ptcl_pos.y - ptcl->vel.y) >> FX32_SHIFT;
    acc->z += field->mag * (field->pos.z - ptcl->ptcl_pos.z - ptcl->vel.z) >> FX32_SHIFT;
}

void spl_calc_spin(const void *obj, SPLParticle *ptcl, VecFx32 *acc, SPLEmitter *emtr) {
    const SplSpinField *field = obj;
    MtxFx33 mtx;

    switch (field->axis_type) {
    case 0:
        MTX_RotX33(&mtx, FX_SinIdx(field->rotation), FX_CosIdx(field->rotation));
        break;
    case 1:
        MTX_RotY33(&mtx, FX_SinIdx(field->rotation), FX_CosIdx(field->rotation));
        break;
    case 2:
        MTX_RotZ33(&mtx, FX_SinIdx(field->rotation), FX_CosIdx(field->rotation));
        break;
    }
    MTX_MultVec33(&ptcl->ptcl_pos, &mtx, &ptcl->ptcl_pos);
}

static inline void BounceOffPlane(const SplCollisionField *field, SPLParticle *ptcl, fx32 y, fx32 emtr_y) {
    ptcl->ptcl_pos.y = y - emtr_y;
    ptcl->vel.y = -(s32)(((s64)ptcl->vel.y * field->coeff_bounce + 0x800) >> FX32_SHIFT);
}

void spl_calc_scfield(const void *obj, SPLParticle *ptcl, VecFx32 *acc, SPLEmitter *emtr) {
    const SplCollisionField *field = obj;
    fx32 y = field->y;

    if (emtr->simple_collision_y != COLLISION_Y_UNSET) {
        y = emtr->simple_collision_y;
    }
    switch (field->type) {
    case 0: {
        fx32 emtr_y = ptcl->emtr_pos.y;
        if (emtr_y < y) {
            if (emtr_y + ptcl->ptcl_pos.y > y) {
                ptcl->ptcl_pos.y = y - emtr_y;
                ptcl->age = ptcl->life;
                return;
            }
        }
        if (emtr_y >= y) {
            if (emtr_y + ptcl->ptcl_pos.y < y) {
                ptcl->ptcl_pos.y = y - emtr_y;
                ptcl->age = ptcl->life;
            }
        }
    } break;
    case 1: {
        fx32 emtr_y = ptcl->emtr_pos.y;
        if (emtr_y < y && emtr_y + ptcl->ptcl_pos.y > y) {
            BounceOffPlane(field, ptcl, y, emtr_y);
            return;
        }
        if (emtr_y >= y && emtr_y + ptcl->ptcl_pos.y < y) {
            BounceOffPlane(field, ptcl, y, emtr_y);
        }
    } break;
    }
}

void spl_calc_convergence(const void *obj, SPLParticle *ptcl, VecFx32 *acc, SPLEmitter *emtr) {
    const SplConvergenceField *field = obj;

    ptcl->ptcl_pos.x = ptcl->ptcl_pos.x + FX_Mul(field->ratio, field->pos.x - ptcl->ptcl_pos.x);
    ptcl->ptcl_pos.y = ptcl->ptcl_pos.y + FX_Mul(field->ratio, field->pos.y - ptcl->ptcl_pos.y);
    ptcl->ptcl_pos.z = ptcl->ptcl_pos.z + FX_Mul(field->ratio, field->pos.z - ptcl->ptcl_pos.z);
}
