#include <nitro/code32.h>
#include <nitro/fx/fx.h>
#include <nitro/gx/g3b.h>
#include <nitro/mi/memory.h>
#include <nitro/types.h>

void G3BS_LoadMtx44(GXDLInfo *displaylist, const MtxFx44 *mtx);

void G3BS_LoadMtx44(GXDLInfo *displaylist, const MtxFx44 *mtx) {
    *(u32 *)displaylist->curr_cmd = G3OP_MTX_LOAD_4x4;
    MI_Copy64B(mtx, displaylist->curr_param);
}

void G3B_PushMtx(GXDLInfo *displaylist) {
    *(u32 *)displaylist->curr_cmd = G3OP_MTX_PUSH;
    displaylist->curr_cmd = (u8 *)displaylist->curr_param;
    displaylist->curr_param = (u32 *)displaylist->curr_cmd + 1;
}

void G3B_PopMtx(GXDLInfo *displaylist, int mtx) {
    *(u32 *)displaylist->curr_cmd = G3OP_MTX_POP;
    *displaylist->curr_param = (u32)mtx;
    displaylist->curr_cmd = (u8 *)displaylist->curr_param + 0x4;
    displaylist->curr_param = (u32 *)displaylist->curr_cmd + 1;
}

void G3B_LoadMtx44(GXDLInfo *displaylist, const MtxFx44 *mtx) {
    G3BS_LoadMtx44(displaylist, mtx);
    displaylist->curr_cmd = (u8 *)displaylist->curr_param + sizeof(MtxFx44);
    displaylist->curr_param = (u32 *)displaylist->curr_cmd + 1;
}

// color format is RGB555, stored in the lower bits
void G3B_Color(GXDLInfo *displaylist, GXRgb vtx_col) {
    *(u32 *)displaylist->curr_cmd = G3OP_COLOR;
    *displaylist->curr_param = vtx_col;
    displaylist->curr_cmd = (u8 *)displaylist->curr_param + 0x4;
    displaylist->curr_param = (u32 *)displaylist->curr_cmd + 1;
}

/*
Only feed normalized Vectors
only the fractional part and the sign, which is in the first nonfraction bit
since the vector is assumed to be normalized, are used
*/
void G3B_Normal(GXDLInfo *displaylist, fx16 x, fx16 y, fx16 z) {
    *(u32 *)displaylist->curr_cmd = G3OP_NORMAL;
    *displaylist->curr_param = (u32)(((x >> 3) & 0x3FF) | (((y >> 3) & 0x3FF) << REG_G3_NORMAL_NY_SHIFT) | (((z >> 3) & 0x3FF) << REG_G3_NORMAL_NZ_SHIFT));
    displaylist->curr_cmd = (u8 *)displaylist->curr_param + 0x4;
    displaylist->curr_param = (u32 *)displaylist->curr_cmd + 1;
}

void G3B_Vtx(GXDLInfo *displaylist, fx16 x, fx16 y, fx16 z) {
    *(u32 *)displaylist->curr_cmd = G3OP_VTX_16;
    displaylist->curr_param[0] = (u32)(u16)x | (u32)(u16)y << 0x10;
    displaylist->curr_param[1] = (u32)(u16)z;
    displaylist->curr_cmd = (u8 *)displaylist->curr_param + 0x8;
    displaylist->curr_param = (u32 *)displaylist->curr_cmd + 1;
}

// TODO: name arguments
void G3B_PolygonAttr(GXDLInfo *displaylist, int r1, GXPolygonMode r2, GXCull r3, int r4, int r5, int r6) {
    *(u32 *)displaylist->curr_cmd = G3OP_POLYGON_ATTR;
    *displaylist->curr_param = r1 | r2 << REG_G3_POLYGON_ATTR_PM_SHIFT | r3 << REG_G3_POLYGON_ATTR_BK_SHIFT | r6 | r4 << REG_G3_POLYGON_ATTR_ID_SHIFT | r5 << REG_G3_POLYGON_ATTR_ALPHA_SHIFT;
    displaylist->curr_cmd = (u8 *)displaylist->curr_param + 0x4;
    displaylist->curr_param = (u32 *)displaylist->curr_cmd + 1;
}

void G3B_MaterialColorDiffAmb(GXDLInfo *displaylist, GXRgb diffuse_col, GXRgb ambient_col, BOOL replace) {
    *(u32 *)displaylist->curr_cmd = G3OP_DIF_AMB;
    u32 replace_vtx_color_with_diffuse;
    if (replace) {
        replace_vtx_color_with_diffuse = TRUE;
    } else {
        replace_vtx_color_with_diffuse = FALSE;
    }
    *displaylist->curr_param = diffuse_col | ambient_col << REG_G3_DIF_AMB_AMBIENT_RED_SHIFT | replace_vtx_color_with_diffuse << REG_G3_DIF_AMB_C_SHIFT;
    displaylist->curr_cmd = (u8 *)displaylist->curr_param + 0x4;
    displaylist->curr_param = (u32 *)displaylist->curr_cmd + 1;
}

void G3B_MaterialColorSpecEmi(GXDLInfo *displaylist, GXRgb specular_col, GXRgb emission_col, BOOL shiny_table) {
    *(u32 *)displaylist->curr_cmd = G3OP_SPE_EMI;
    u32 enable_shininess_table;
    if (shiny_table) {
        enable_shininess_table = TRUE;
    } else {
        enable_shininess_table = FALSE;
    }
    *displaylist->curr_param = specular_col | emission_col << REG_G3_SPE_EMI_EMISSION_RED_SHIFT | enable_shininess_table << REG_G3_SPE_EMI_S_SHIFT;
    displaylist->curr_cmd = (u8 *)displaylist->curr_param + 0x4;
    displaylist->curr_param = (u32 *)displaylist->curr_cmd + 1;
}

/*
Only feed normalized Vectors
only the fractional part and the sign, which is in the first nonfraction bit
since the vector is assumed to be normalized, are used
*/
void G3B_LightVector(GXDLInfo *displaylist, GXLightId light_num, fx16 x, fx16 y, fx16 z) {
    *(u32 *)displaylist->curr_cmd = G3OP_LIGHT_VECTOR;
    *displaylist->curr_param = ((x >> 3) & 0x3FF) | (((y >> 3) & 0x3FF) << REG_G3_LIGHT_VECTOR_DECIMAL_Y_SHIFT) | (((z >> 3) & 0x3FF) << REG_G3_LIGHT_VECTOR_DECIMAL_Z_SHIFT) | light_num << REG_G3_LIGHT_VECTOR_LNUM_SHIFT;
    displaylist->curr_cmd = (u8 *)displaylist->curr_param + 0x4;
    displaylist->curr_param = (u32 *)displaylist->curr_cmd + 1;
}

void G3B_LightColor(GXDLInfo *displaylist, GXLightId light_num, GXRgb col) {
    *(u32 *)displaylist->curr_cmd = G3OP_LIGHT_COLOR;
    *displaylist->curr_param = col | light_num << REG_G3_LIGHT_COLOR_LNUM_SHIFT;
    displaylist->curr_cmd = (u8 *)displaylist->curr_param + 0x4;
    displaylist->curr_param = (u32 *)displaylist->curr_cmd + 1;
}

void G3B_Begin(GXDLInfo *displaylist, GXBegin type) {
    *(u32 *)displaylist->curr_cmd = G3OP_BEGIN;
    *displaylist->curr_param = type;
    displaylist->curr_cmd = (u8 *)displaylist->curr_param + 0x4;
    displaylist->curr_param = (u32 *)displaylist->curr_cmd + 1;
}

void G3B_End(GXDLInfo *displaylist) {
    *(u32 *)displaylist->curr_cmd = G3OP_END;
    displaylist->curr_cmd = (u8 *)displaylist->curr_param;
    displaylist->curr_param = (u32 *)displaylist->curr_cmd + 1;
}
