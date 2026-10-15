#include <nitro/code32.h>
#include <nitro/hw/io_reg.h>
#include <nitro/mi/dma.h>
#include <nitro/mi/memory.h>
#include <nitro/types.h>

void MI_Copy32B(const void *src, void *dst);
void GXi_NopClearFifo128_(void *reg);
void G3X_Init(void);
void G3X_Reset(void);
void G3X_ClearFifo(void);
void G3X_InitMtxStack(void);
void G3X_ResetMtxStack(void);
void G3X_SetFog(u32 enable, u32 alphamode, u32 depth, s32 offset);
u32 G3X_GetClipMtx(void *dst);
u32 G3X_GetVectorMtx(void *dst);
void G3X_SetEdgeColorTable(void *tbl_ptr);
void G3X_SetFogTable(void *tbl_ptr);
void G3X_SetClearColor(u32 col, u32 alpha, u32 depth, u32 polygon_id, u32 enable_fog);
void G3X_InitTable(void);
u32 G3X_GetMtxStackLevelPV(u32 *level);
u32 G3X_GetMtxStackLevelPJ(u32 *level);
u32 G3X_GetBoxTestResult(u32 *result);
void G3X_SetHOffset(u32 offset);

extern u32 GXi_DmaId;

void G3X_Init() {
    G3X_ClearFifo();
    reg_G3_END_VTXS = 0x0;
    while (reg_G3X_GXSTAT & REG_G3X_GXSTAT_B_MASK) {} // wait for geometry engine to not be busy
    reg_G3X_DISP3DCNT = 0x0;
    reg_G3X_GXSTAT = 0x0;
    reg_G2_BG0OFS = 0x0;
    reg_G3X_DISP3DCNT |= REG_G3X_DISP3DCNT_GO_MASK;
    reg_G3X_DISP3DCNT |= REG_G3X_DISP3DCNT_RO_MASK;
    reg_G3X_DISP3DCNT &= ~(REG_G3X_DISP3DCNT_GO_MASK | REG_G3X_DISP3DCNT_RO_MASK | REG_G3X_DISP3DCNT_THS_MASK);
    reg_G3X_DISP3DCNT = (u16)((reg_G3X_DISP3DCNT & ~(REG_G3X_DISP3DCNT_GO_MASK | REG_G3X_DISP3DCNT_RO_MASK)) | REG_G3X_DISP3DCNT_AAE_MASK);
    reg_G3X_DISP3DCNT = (u16)(reg_G3X_DISP3DCNT & (u16)~(REG_G3X_DISP3DCNT_GO_MASK | REG_G3X_DISP3DCNT_RO_MASK | REG_G3X_DISP3DCNT_ATE_MASK));
    reg_G3X_GXSTAT |= REG_G3X_GXSTAT_SE_MASK;
    reg_G3X_GXSTAT = (reg_G3X_GXSTAT & ~REG_G3X_GXSTAT_FI_MASK) | 0x80000000;
    G3X_InitMtxStack();
    reg_G3X_CLEAR_COLOR = 0x0;
    reg_G3X_CLEAR_DEPTH = 0x7FFF;
    reg_G3X_CLRIMAGE_OFFSET = 0x0;
    reg_G3X_FOG_COLOR = 0x0;
    reg_G3X_FOG_OFFSET = 0x0;
    reg_G2_BG0CNT &= ~REG_G2_BG0CNT_PRIORITY_MASK;
    G3X_InitTable();
    reg_G3_POLYGON_ATTR = 0x1F0080;
    reg_G3_TEXIMAGE_PARAM = 0x0;
    reg_G3_TEXPLTT_BASE = 0x0;
}

void G3X_Reset() {
    while (reg_G3X_GXSTAT & REG_G3X_GXSTAT_B_MASK) {}
    reg_G3X_GXSTAT |= REG_G3X_GXSTAT_SE_MASK;
    reg_G3X_DISP3DCNT |= REG_G3X_DISP3DCNT_GO_MASK;
    reg_G3X_DISP3DCNT |= REG_G3X_DISP3DCNT_RO_MASK;
    G3X_ResetMtxStack();
    reg_G3_POLYGON_ATTR = 0x1F0080;
    reg_G3_TEXIMAGE_PARAM = 0x0;
    reg_G3_TEXPLTT_BASE = 0x0;
}

void G3X_ClearFifo() {
    GXi_NopClearFifo128_((void *)&reg_G3X_GXFIFO);
    while (reg_G3X_GXSTAT & REG_G3X_GXSTAT_B_MASK) {}
}

void G3X_InitMtxStack() {
    u32 PV_level, PJ_level;
    reg_G3X_GXSTAT |= REG_G3X_GXSTAT_SE_MASK;
    while (G3X_GetMtxStackLevelPV(&PV_level)) {}
    while (G3X_GetMtxStackLevelPJ(&PJ_level)) {}
    reg_G3_MTX_MODE = 0x3;
    reg_G3_MTX_IDENTITY = 0x0;
    reg_G3_MTX_MODE = 0x0;
    if (PJ_level) {
        reg_G3_MTX_POP = PJ_level;
    }
    reg_G3_MTX_IDENTITY = 0x0;
    reg_G3_MTX_MODE = 0x2;
    reg_G3_MTX_POP = PV_level;
    reg_G3_MTX_IDENTITY = 0x0;
}

void G3X_ResetMtxStack() {
    u32 PV_level, PJ_level;
    reg_G3X_GXSTAT |= REG_G3X_GXSTAT_SE_MASK;
    while (G3X_GetMtxStackLevelPV(&PV_level)) {}
    while (G3X_GetMtxStackLevelPJ(&PJ_level)) {}
    reg_G3_MTX_MODE = 0x3;
    reg_G3_MTX_IDENTITY = 0x0;
    reg_G3_MTX_MODE = 0x0;
    if (PJ_level) {
        reg_G3_MTX_POP = PJ_level;
    }

    reg_G3_MTX_MODE = 0x2;
    reg_G3_MTX_POP = PV_level;
    reg_G3_MTX_IDENTITY = 0x0;
}

void G3X_SetFog(u32 enable, u32 alphamode, u32 depth, s32 offset) {
    if (enable) {
        reg_G3X_FOG_OFFSET = (u16)offset;
        reg_G3X_DISP3DCNT = (u16)((reg_G3X_DISP3DCNT & ~0x3f40) | ((depth << REG_G3X_DISP3DCNT_FOG_SHIFT_SHIFT) | (alphamode << REG_G3X_DISP3DCNT_FMOD_SHIFT) | 0x80));

    } else {
        reg_G3X_DISP3DCNT = (u16)(reg_G3X_DISP3DCNT & (u16)~(REG_G3X_DISP3DCNT_GO_MASK | REG_G3X_DISP3DCNT_RO_MASK | REG_G3X_DISP3DCNT_FME_MASK));
    }
}

u32 G3X_GetClipMtx(void *dst) {
    if (reg_G3X_GXSTAT & REG_G3X_GXSTAT_B_MASK) {
        return (u32)-1;
    } else {
        MI_Copy64B((void *)&reg_G3X_CLIPMTX_RESULT_0, dst);
        return 0;
    }
}

u32 G3X_GetVectorMtx(void *dst) {
    if (reg_G3X_GXSTAT & REG_G3X_GXSTAT_B_MASK) {
        return (u32)-1;
    } else {
        MI_Copy36B((void *)&reg_G3X_VECMTX_RESULT_0, dst);
        return 0;
    }
}

void G3X_SetEdgeColorTable(void *tbl_ptr) {
    MIi_CpuCopy16(tbl_ptr, (void *)&reg_G3X_EDGE_COLOR_0, 0x10);
}

void G3X_SetFogTable(void *tbl_ptr) {
    MI_Copy32B(tbl_ptr, (void *)&reg_G3X_FOG_TABLE_0);
}

void G3X_SetClearColor(u32 col, u32 alpha, u32 depth, u32 polygon_id, u32 enable_fog) {
    u32 temp = col | (alpha << 0x10) | (polygon_id << 0x18);
    if (enable_fog) {
        temp |= 0x8000;
    }
    reg_G3X_CLEAR_COLOR = temp;
    reg_G3X_CLEAR_DEPTH = (u16)depth;
}

void G3X_InitTable() {
    if (GXi_DmaId != -1) {
        MI_DmaFill32Async(GXi_DmaId, (void *)&reg_G3X_EDGE_COLOR_0, 0x0, 0x10, 0x0, 0x0);
        MI_DmaFill32(GXi_DmaId, (void *)&reg_G3X_FOG_TABLE_0, 0x0, 0x60);
    } else {
        MIi_CpuClear32(0x0, (void *)&reg_G3X_EDGE_COLOR_0, 0x10);
        MIi_CpuClear32(0x0, (void *)&reg_G3X_FOG_TABLE_0, 0x60);
    }
    for (int i = 0; i < 0x20; i++) {
        reg_G3_SHININESS = 0x0;
    }
}

u32 G3X_GetMtxStackLevelPV(u32 *level) {
    if (reg_G3X_GXSTAT & REG_G3X_GXSTAT_SB_MASK) {
        return (u32)-1;
    } else {
        *level = (reg_G3X_GXSTAT & REG_G3X_GXSTAT_PV_MASK) >> REG_G3X_GXSTAT_PV_SHIFT;
        return 0;
    }
}

u32 G3X_GetMtxStackLevelPJ(u32 *level) {
    if (reg_G3X_GXSTAT & REG_G3X_GXSTAT_SB_MASK) {
        return (u32)-1;
    } else {
        *level = (reg_G3X_GXSTAT & REG_G3X_GXSTAT_PJ_MASK) >> REG_G3X_GXSTAT_PJ_SHIFT;
        return 0;
    }
}

u32 G3X_GetBoxTestResult(u32 *result) {
    if (reg_G3X_GXSTAT & REG_G3X_GXSTAT_TB_MASK) {
        return (u32)-1;
    } else {
        *result = (reg_G3X_GXSTAT & REG_G3X_GXSTAT_TR_MASK);
        return 0;
    }
}

void G3X_SetHOffset(u32 offset) {
    reg_G2_BG0OFS = offset;
}
