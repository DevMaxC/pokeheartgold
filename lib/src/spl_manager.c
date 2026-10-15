#include "spl_internal.h"

// after spl_internal.h, which includes <nitro.h> in an MWCC 1.2-safe way
#include <nnsys/gfd/VramManager/gfd_PlttVramMan_Types.h>
#include <nnsys/gfd/VramManager/gfd_TexVramMan_Types.h>

// particle manager: set-up, resource and texture loading, emitter creation / deletion, per-frame
// update and drawing of all emitters

// texture block of a resource file: this header, then the texel data, then the palette
typedef struct SplTexHeader {
    u32 magic;
    SPLTexParam param;
    u32 tex_size;
    u32 pltt_offset; // from the start of the header
    u32 pltt_size;
    u32 reserved[2];
    u32 block_size;
} SplTexHeader;

// resource file header; the resources start at 0x20
typedef struct SplFileHeader {
    u32 magic;
    u32 version;
    u16 res_num;
    u16 tex_num;
} SplFileHeader;

#define SPL_FILE_HEADER_SIZE 0x20

// MWCC 1.2 applies force_active as set at the end of the file and emits a file's functions in
// reverse order: the functions are defined last-to-first here (link order is bottom-up).
#pragma force_active on

u32 sAllocTex(u32 size, BOOL is4x4comp) {
    return NNS_GfdGetTexKeyAddr(NNS_GfdAllocTexVram(size, is4x4comp, 0));
}

u32 sAllocTexPalette(u32 size, BOOL is4pltt) {
    return (NNS_GfdAllocPlttVram(size, is4pltt, 0) & 0xFFFF) << NNS_GFD_PLTTKEY_ADDR_SHIFT;
}

// needed for the match
#pragma opt_strength_reduction off

SPLManager *SPL_Init(SPLAlloc alloc, int max_emtr_num, int max_ptcl_num, u16 fix_polygon_id, u16 min_polygon_id, u16 max_polygon_id) {
    SPLManager *mgr = alloc(sizeof(SPLManager));
    int size;
    int i;
    u8 *pool;

    MI_CpuFill8(mgr, 0, sizeof(SPLManager));
    mgr->max_emtr_num = max_emtr_num;
    mgr->max_ptcl_num = max_ptcl_num;
    mgr->polygonID.min = min_polygon_id;
    mgr->polygonID.max = max_polygon_id;
    mgr->polygonID.current = mgr->polygonID.min;
    mgr->polygonID.fix = fix_polygon_id;
    mgr->polygonID.drawOrder = 0;
    mgr->polygonID.reserved = 0;
    mgr->alloc = alloc;
    mgr->act_emtr_list.node_num = 0;
    mgr->ina_emtr_list.node_num = 0;
    mgr->ina_ptcl_list.node_num = 0;
    mgr->act_emtr_list.p_begin = NULL;
    mgr->ina_emtr_list.p_begin = NULL;
    mgr->ina_ptcl_list.p_begin = NULL;
    mgr->misc_flag = 0;
    mgr->uCurrentCycle = 0;

    size = max_emtr_num * sizeof(SPLEmitter);
    pool = alloc(size);
    MI_CpuFill8(pool, 0, size);
    for (i = 0; i < max_emtr_num; i++) {
        spl_push_front((SplList *)&mgr->ina_emtr_list, (SplNode *)pool);
        pool += sizeof(SPLEmitter);
    }

    size = max_ptcl_num * sizeof(SPLParticle);
    pool = alloc(size);
    MI_CpuFill8(pool, 0, size);
    for (i = 0; i < max_ptcl_num; i++) {
        spl_push_front((SplList *)&mgr->ina_ptcl_list, (SplNode *)pool);
        pool += sizeof(SPLParticle);
    }

    mgr->res_ary = NULL;
    mgr->tex_ary = NULL;
    mgr->tex_num = 0;
    mgr->res_num = mgr->tex_num;
    return mgr;
}

#pragma opt_strength_reduction reset

void SPL_Load(SPLManager *mgr, const void *data) {
    const u8 *p = data;
    u32 offset = SPL_FILE_HEADER_SIZE;
    int i;

    mgr->res_num = ((const SplFileHeader *)data)->res_num;
    mgr->tex_num = ((const SplFileHeader *)data)->tex_num;
    mgr->res_ary = mgr->alloc(mgr->res_num * sizeof(SPLResource));
    MI_CpuFill8(mgr->res_ary, 0, mgr->res_num * sizeof(SPLResource));
    for (i = 0; i < mgr->res_num; i++) {
        SPLResource *res = &mgr->res_ary[i];
        SPLResBaseFlag flag;

        res->p_base = (SPLResBase *)(p + offset);
        flag = res->p_base->flag;
        offset += sizeof(SPLResBase);
        if (flag.use_scl_anm) {
            res->p_scl_anm = (SPLResSclAnm *)(p + offset);
            offset += sizeof(SPLResSclAnm);
        } else {
            res->p_scl_anm = NULL;
        }
        if (flag.use_clr_anm) {
            res->p_clr_anm = (SPLResClrAnm *)(p + offset);
            offset += sizeof(SPLResClrAnm);
        } else {
            res->p_clr_anm = NULL;
        }
        if (flag.use_alp_anm) {
            res->p_alp_anm = (SPLResAlpAnm *)(p + offset);
            offset += sizeof(SPLResAlpAnm);
        } else {
            res->p_alp_anm = NULL;
        }
        if (flag.use_tex_anm) {
            res->p_tex_anm = (SPLResTexAnm *)(p + offset);
            offset += sizeof(SPLResTexAnm);
        } else {
            res->p_tex_anm = NULL;
        }
        if (flag.use_chld) {
            res->p_chld = (SPLResChld *)(p + offset);
            offset += sizeof(SPLResChld);
        } else {
            res->p_chld = NULL;
        }
        res->fld_num = flag.use_fld_grvt + flag.use_fld_rndm + flag.use_fld_mgnt + flag.use_fld_spin + flag.use_fld_scfld + flag.use_fld_cngc;
        if (res->fld_num != 0) {
            SPLField *fld;

            res->fld_ary = mgr->alloc(res->fld_num * sizeof(SPLField));
            fld = res->fld_ary;
            if (flag.use_fld_grvt) {
                fld->p_obj = p + offset;
                fld->p_exec = spl_calc_gravity;
                offset += sizeof(SplGravityField);
                fld++;
            }
            if (flag.use_fld_rndm) {
                fld->p_obj = p + offset;
                fld->p_exec = spl_calc_random;
                offset += sizeof(SplRandomField);
                fld++;
            }
            if (flag.use_fld_mgnt) {
                fld->p_obj = p + offset;
                fld->p_exec = spl_calc_magnet;
                offset += sizeof(SplMagnetField);
                fld++;
            }
            if (flag.use_fld_spin) {
                fld->p_obj = p + offset;
                fld->p_exec = spl_calc_spin;
                offset += sizeof(SplSpinField);
                fld++;
            }
            if (flag.use_fld_scfld) {
                fld->p_obj = p + offset;
                fld->p_exec = spl_calc_scfield;
                offset += sizeof(SplCollisionField);
                fld++;
            }
            if (flag.use_fld_cngc) {
                fld->p_obj = p + offset;
                fld->p_exec = spl_calc_convergence;
                offset += sizeof(SplConvergenceField);
                fld++;
            }
        } else {
            res->fld_ary = NULL;
        }
    }

    mgr->tex_ary = mgr->alloc(mgr->tex_num * sizeof(SPLTexture));
    MI_CpuFill8(mgr->tex_ary, 0, mgr->tex_num * sizeof(SPLTexture));
    for (i = 0; i < mgr->tex_num; i++) {
        SPLTexture *tex = &mgr->tex_ary[i];
        const SplTexHeader *hdr = (const SplTexHeader *)(p + offset);

        tex->p_obj = hdr;
        tex->wdt = 1 << (hdr->param.s + 3);
        tex->hgt = 1 << (hdr->param.t + 3);
        tex->tex_param = hdr->param;
        offset += hdr->block_size;
    }
}

BOOL SPL_LoadTexByCallbackFunction(SPLManager *mgr, u32 (*alloc)(u32 size, BOOL is4x4comp)) {
    GX_BeginLoadTex();
    for (int i = 0; i < mgr->tex_num; i++) {
        SPLTexture *tex = &mgr->tex_ary[i];
        const SplTexHeader *hdr = tex->p_obj;

        if (hdr->param.overlaped) {
            // shares the texels of an earlier texture
            tex->tex_addr = mgr->tex_ary[hdr->param.sharedTexNo].tex_addr;
        } else {
            u32 addr = alloc(hdr->tex_size, hdr->param.fmt == GX_TEXFMT_COMP4x4);
            GX_LoadTex((const u8 *)tex->p_obj + sizeof(SplTexHeader), addr, hdr->tex_size);
            tex->tex_addr = addr;
        }
    }
    GX_EndLoadTex();
    return TRUE;
}

BOOL SPL_LoadTexPlttByCallbackFunction(SPLManager *mgr, u32 (*alloc)(u32 size, BOOL is4pltt)) {
    GX_BeginLoadTexPltt();
    for (int i = 0; i < mgr->tex_num; i++) {
        SPLTexture *tex = &mgr->tex_ary[i];
        const SplTexHeader *hdr = tex->p_obj;
        u32 addr = 0;

        if (hdr->pltt_size != 0) {
            addr = alloc(hdr->pltt_size, hdr->param.fmt == GX_TEXFMT_PLTT4);
            GX_LoadTexPltt((const u8 *)tex->p_obj + hdr->pltt_offset, addr, hdr->pltt_size);
        }
        tex->plt_addr = addr;
    }
    GX_EndLoadTexPltt();
    return TRUE;
}

BOOL SPL_LoadTexByVRAMManager(SPLManager *mgr) {
    return SPL_LoadTexByCallbackFunction(mgr, sAllocTex);
}

BOOL SPL_LoadTexPlttByVRAMManager(SPLManager *mgr) {
    return SPL_LoadTexPlttByCallbackFunction(mgr, sAllocTexPalette);
}

void SPL_Calc(SPLManager *mgr) {
    SPLEmitter *emtr;
    SPLEmitter *next;
    SPLResBase *base;

    emtr = mgr->act_emtr_list.p_begin;
    if (emtr != NULL) {
        do {
            base = emtr->p_res->p_base;
            next = emtr->p_next;
            if (!emtr->flag.started && emtr->age >= base->start_offset) {
                emtr->flag.started = TRUE;
                emtr->age = 0;
            }
            if (!emtr->flag.stop_calc) {
                // calc_cycle n > 0: update on one frame of every two
                u32 cycle = emtr->etc.calc_cycle;
                if (cycle == 0 || mgr->uCurrentCycle == cycle - 1) {
                    spl_calc(mgr, emtr);
                }
            }
            if ((base->flag.self_dest && base->emtr_life != 0 && emtr->flag.started && emtr->age > base->emtr_life) || emtr->flag.terminate) {
                // delete the emitter once its last particle is gone
                if (emtr->act_ptcl_list.node_num == 0 && emtr->act_chld_list.node_num == 0) {
                    spl_push_front((SplList *)&mgr->ina_emtr_list, spl_del((SplList *)&mgr->act_emtr_list, (SplNode *)emtr));
                }
            }
            emtr = next;
        } while (emtr != NULL);
    }
    ++mgr->uCurrentCycle;
    if (mgr->uCurrentCycle > 1) {
        mgr->uCurrentCycle = 0;
    }
}

void SPL_Draw(SPLManager *mgr, const MtxFx43 *camera) {
    G3X_AlphaBlend(TRUE);
    mgr->current_state.p_cmr = camera;
    if (!mgr->polygonID.drawOrder) {
        SPLEmitter *emtr = mgr->act_emtr_list.p_begin;
        while (emtr != NULL) {
            mgr->current_state.p_emtr = emtr;
            if (!emtr->flag.stop_draw) {
                spl_draw(mgr);
            }
            emtr = emtr->p_next;
        }
    } else {
        SPLEmitter *emtr = mgr->act_emtr_list.p_end;
        while (emtr != NULL) {
            mgr->current_state.p_emtr = emtr;
            if (!emtr->flag.stop_draw) {
                spl_draw(mgr);
            }
            emtr = emtr->p_prev;
        }
    }
}

SPLEmitter *SPL_Create(SPLManager *mgr, int res_no, const VecFx32 *pos) {
    SPLEmitter *emtr = NULL;

    if (mgr->ina_emtr_list.p_begin != NULL) {
        emtr = (SPLEmitter *)spl_pop_front((SplList *)&mgr->ina_emtr_list);
        spl_init(emtr, &mgr->res_ary[res_no], pos);
        spl_push_front((SplList *)&mgr->act_emtr_list, (SplNode *)emtr);
        // a self-destroying emitter is not handed out
        if (emtr->p_res->p_base->flag.self_dest) {
            emtr = NULL;
        }
    }
    return emtr;
}

SPLEmitter *SPL_CreateWithInitialize(SPLManager *mgr, int res_no, void (*callback)(SPLEmitter *)) {
    SPLEmitter *emtr = NULL;

    if (mgr->ina_emtr_list.p_begin != NULL) {
        VecFx32 pos = { 0, 0, 0 };
        emtr = (SPLEmitter *)spl_pop_front((SplList *)&mgr->ina_emtr_list);
        spl_init(emtr, &mgr->res_ary[res_no], &pos);
        if (callback != NULL) {
            callback(emtr);
        }
        spl_push_front((SplList *)&mgr->act_emtr_list, (SplNode *)emtr);
        if (emtr->p_res->p_base->flag.self_dest) {
            emtr = NULL;
        }
    }
    return emtr;
}

void SPL_Delete(SPLManager *mgr, SPLEmitter *emtr) {
    SplNode *ptcl;

    while ((ptcl = spl_pop_front((SplList *)&emtr->act_ptcl_list)) != NULL) {
        spl_push_front((SplList *)&mgr->ina_ptcl_list, ptcl);
    }
    while ((ptcl = spl_pop_front((SplList *)&emtr->act_chld_list)) != NULL) {
        spl_push_front((SplList *)&mgr->ina_ptcl_list, ptcl);
    }
    (void)spl_del((SplList *)&mgr->act_emtr_list, (SplNode *)emtr);
    spl_push_front((SplList *)&mgr->ina_emtr_list, (SplNode *)emtr);
}

void SPL_DeleteAll(SPLManager *mgr) {
    SPLEmitter *emtr = mgr->act_emtr_list.p_begin;

    while (emtr != NULL) {
        SPLEmitter *next = emtr->p_next;
        SPL_Delete(mgr, emtr);
        emtr = next;
    }
}
