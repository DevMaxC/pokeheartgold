#include "spl_internal.h"

// random unit vectors

// MWCC 1.2 applies force_active as set at the end of the file and emits a file's functions in
// reverse order: the functions are defined last-to-first here (link order is bottom-up).
#pragma force_active on

void spl_rndm_get_arb_vec_xyz(VecFx32 *vec) {
    vec->x = (s32)SPL_RNDM_NEXT() >> 8;
    vec->y = (s32)SPL_RNDM_NEXT() >> 8;
    vec->z = (s32)SPL_RNDM_NEXT() >> 8;
    VEC_Normalize(vec, vec);
}

void spl_rndm_get_arb_vec_xy(VecFx32 *vec) {
    vec->x = (s32)SPL_RNDM_NEXT() >> 8;
    vec->y = (s32)SPL_RNDM_NEXT() >> 8;
    vec->z = 0;
    VEC_Normalize(vec, vec);
}
