#ifndef POKEHEARTGOLD_NNSYS_G3D_RENDER_INTERNAL_H
#define POKEHEARTGOLD_NNSYS_G3D_RENDER_INTERNAL_H

// NitroSystem g3d global state accessors, animation blending and model drawing: declarations the
// public g3d headers lack, shared by the lib/NitroSystem/src/g3d_*.c modules.

#include <nitro.h>
#include <nnsys/g3d/gecom.h>
#include <nnsys/g3d_internal.h>

// ---- NitroSDK functions the nitro headers do not declare

fx64c FX_InvFx64c(fx32 x);
fx32 MTX_Inverse43(const MtxFx43 *pSrc, MtxFx43 *pDst);
void MTX_ScaleApply43(const MtxFx43 *pSrc, MtxFx43 *pDst, fx32 x, fx32 y, fx32 z);
void MTX_Copy43To44_(const MtxFx43 *pSrc, MtxFx44 *pDst);
void VEC_CrossProduct(const VecFx32 *a, const VecFx32 *b, VecFx32 *pDst);
u32 G3X_GetClipMtx(void *dst);
u32 G3X_GetVectorMtx(void *dst);
void G3_LoadMtx43(const MtxFx43 *mtx);
void G3_MultMtx43(const MtxFx43 *mtx);
void G3_MultMtx33(const MtxFx33 *mtx);
void MIi_CpuSend32(const void *pSrc, volatile void *pDst, u32 size);
void MI_Zero36B(void *pDst);

// ---- geometry command buffer (g3d_gecom.c, pkg_g3d2b)

void NNS_G3dGeSendDL(const void *pDL, u32 size);
void NNS_G3dGetCurrentMtx(MtxFx43 *pPos, MtxFx33 *pDir);

// ---- global state (g3d_glb_state.c)

MtxFx43 *NNS_G3dGlbGetInvV(void);
int mtx_inverse44(const MtxFx44 *pSrc, MtxFx44 *pDst);
MtxFx44 *NNS_G3dGlbGetInvP(void);
void calcSrtCameraMtx_(void);
MtxFx43 *NNS_G3dGlbGetWV(void);
MtxFx43 *NNS_G3dGlbGetInvWV(void);
MtxFx44 *NNS_G3dGlbGetInvVP(void);
void NNS_G3dGlbGetViewPort(u32 *x1, u32 *y1, u32 *x2, u32 *y2);

// ---- animation blending (g3d_anm_blend.c)

// joint animation result: scale, rotation and translation of one node
typedef struct NNSG3dJntAnmResult_ {
    u32 flag; // G3D_JNTANM_FLAG_*
    VecFx32 scale;
    VecFx32 scaleEx0;
    VecFx32 scaleEx1;

    union {
        MtxFx33 rot;
        VecFx32 rotRows[3];
    };

    VecFx32 trans;
} G3dJntAnmResult;

#define G3D_JNTANM_FLAG_SCALE_ONE    0x01
#define G3D_JNTANM_FLAG_ROT_ZERO     0x02 // identity rotation
#define G3D_JNTANM_FLAG_TRANS_ZERO   0x04
#define G3D_JNTANM_FLAG_SCALEEX0_ONE 0x08
#define G3D_JNTANM_FLAG_SCALEEX1_ONE 0x10

// material animation result: the material's colours, polygon attributes, texture parameters and
// texture matrix (scale, rotation, translation) after the animations
typedef struct NNSG3dMatAnmResult_ {
    u32 flag;         // G3D_MATANM_FLAG_*
    u32 prmMatColor0; // diffuse, ambient
    u32 prmMatColor1; // specular, emission
    u32 prmPolygonAttr;
    u32 prmTexImage;
    u32 prmTexPltt;
    fx32 scaleS;
    fx32 scaleT;
    fx16 sinR;
    fx16 cosR;
    fx32 transS;
    fx32 transT;
    u16 origWidth;
    u16 origHeight;
    fx32 magW;
    fx32 magH;
} G3dMatAnmResult;

#define G3D_MATANM_FLAG_TEXMTX_SCALEONE  0x01
#define G3D_MATANM_FLAG_TEXMTX_ROTZERO   0x02
#define G3D_MATANM_FLAG_TEXMTX_TRANSZERO 0x04
#define G3D_MATANM_FLAG_TEXMTX_SET       0x08
#define G3D_MATANM_FLAG_TEXMTX_MASK      0x18 // a texture matrix has to be sent
#define G3D_MATANM_FLAG_WIREFRAME        0x20

typedef void (*G3dFuncAnmMat)(struct NNSG3dMatAnmResult_ *pResult, const NNSG3dAnmObj *pAnmObj, u32 dataIdx);
typedef void (*G3dFuncAnmJnt)(G3dJntAnmResult *pResult, const NNSG3dAnmObj *pAnmObj, u32 dataIdx);
typedef void (*G3dFuncAnmVis)(u32 *pResult, const NNSG3dAnmObj *pAnmObj, u32 dataIdx);

BOOL NNSi_G3dAnmBlendMat(struct NNSG3dMatAnmResult_ *pResult, const NNSG3dAnmObj *pAnmObj, u32 matID);
void blendScaleVec_(VecFx32 *pDst, const VecFx32 *pSrc, fx32 ratio, BOOL isOne);
BOOL NNSi_G3dAnmBlendJnt(G3dJntAnmResult *pResult, const NNSG3dAnmObj *pAnmObj, u32 nodeID);
BOOL NNSi_G3dAnmBlendVis(u32 *pResult, const NNSG3dAnmObj *pAnmObj, u32 nodeID);

// ---- model drawing: render state and SBC (structure byte code) interpreter (g3d_draw.c, g3d_sbc.c)

typedef void (*G3dFuncGetJointScale)(G3dJntAnmResult *pResult, const fx32 *pData, const u8 *pCmd, u32 srtFlag);
typedef void (*G3dFuncSendJointSRT)(const G3dJntAnmResult *pResult);
typedef void (*G3dFuncSendTexSRT)(const G3dMatAnmResult *pResult);

// state of one NNS_G3dDraw call (size 0x188); the callbacks are indexed by SBC command
typedef struct NNSG3dRS_ {
    const u8 *c; // current SBC command
    NNSG3dRenderObj *pRenderObj;
    u32 flag; // G3D_RS_FLAG_*
    NNSG3dSbcCallBackFunc cbFunc[32];
    u8 cbTiming[32]; // G3D_SBC_CALLBACK_TIMING_*
    u8 currentNode;
    u8 currentMat;
    u8 currentNodeDesc;
    u8 unk_AF;
    G3dMatAnmResult *pMatAnmResult;
    G3dJntAnmResult *pJntAnmResult;
    u32 *pVisAnmResult;
    u32 matCached[2];   // bit per material: result in gMatAnmResultBuffer is valid
    u32 scaleCached[2]; // bit per node
    u32 evpCached[2];   // bit per envelope matrix: its gEvpMtxCache entry is valid
    NNSG3dResNodeInfo *pResNodeInfo;
    G3dResMat *pResMat;
    void *pResShp;
    fx32 posScale;
    fx32 invPosScale;
    G3dFuncGetJointScale funcJntScale;
    G3dFuncSendJointSRT funcJntMtx;
    G3dFuncSendTexSRT funcTexMtx;
    G3dMatAnmResult tmpMatAnmResult;
    G3dJntAnmResult tmpJntAnmResult;
    u32 tmpVisAnmResult;
} G3dRS;

#define G3D_RS_FLAG_NODE_VISIBLE     0x001
#define G3D_RS_FLAG_MAT_HIDDEN       0x002 // polygon alpha 0
#define G3D_RS_FLAG_CURRENT_NODE     0x004 // currentNode is valid
#define G3D_RS_FLAG_CURRENT_MAT      0x008 // currentMat is valid
#define G3D_RS_FLAG_CURRENT_NODEDESC 0x010 // currentNodeDesc is valid
#define G3D_RS_FLAG_END              0x020 // RET reached
#define G3D_RS_FLAG_SKIP_CMD         0x040 // set by a callback: skip the rest of the command
#define G3D_RS_FLAG_NO_RECORD        0x080 // NNSG3dRenderObj.flag bit 0: recalculate instead of using the records
#define G3D_RS_FLAG_NO_GE_OUTPUT     0x100 // NNSG3dRenderObj.flag bit 1
#define G3D_RS_FLAG_SKIP_SBC_DRAW    0x200 // NNSG3dRenderObj.flag bit 2
#define G3D_RS_FLAG_SKIP_SBC_MTXCALC 0x400 // NNSG3dRenderObj.flag bit 3

// SBC (structure byte code) commands: the opcode indexes gSbcFuncs and the per-command callback tables of NNSG3dRS
#define NNS_G3D_SBC_NOP      0x00
#define NNS_G3D_SBC_RET      0x01
#define NNS_G3D_SBC_NODE     0x02
#define NNS_G3D_SBC_MTX      0x03
#define NNS_G3D_SBC_MAT      0x04
#define NNS_G3D_SBC_SHP      0x05
#define NNS_G3D_SBC_NODEDESC 0x06
#define NNS_G3D_SBC_BB       0x07
#define NNS_G3D_SBC_BBY      0x08
#define NNS_G3D_SBC_NODEMIX  0x09
#define NNS_G3D_SBC_CALLDL   0x0A
#define NNS_G3D_SBC_POSSCALE 0x0B
#define NNS_G3D_SBC_ENVMAP   0x0C
#define NNS_G3D_SBC_PRJMAP   0x0D

#define G3D_SBC_CALLBACK_TIMING_NONE 0
#define G3D_SBC_CALLBACK_TIMING_A    1 // before the command
#define G3D_SBC_CALLBACK_TIMING_B    2 // between calculation and output
#define G3D_SBC_CALLBACK_TIMING_C    3 // after the command

// shape block of a model (NNSG3dResMdl.ofsShp): dictionary of G3dResShpData offsets
typedef struct G3dResShpData {
    u16 itemTag; // selects the SBC SHP handler
    u16 size;
    u32 unk_04;
    u32 ofsDL; // display list, from this structure
    u32 sizeDL;
} G3dResShpData;

// node block of a model (NNSG3dResMdl.nodeInfo): dictionary of G3dResNodeData offsets
typedef struct G3dResNodeData {
    u16 flag;  // G3D_RESNODE_FLAG_*
    s16 rot00; // first rotation matrix element (unless compressed or zero)
    u8 data[]; // translation (3 fx32), rotation (pivot form: 2 fx16; else 8 fx16), then the scale
} G3dResNodeData;

#define G3D_RESNODE_FLAG_TRANS_ZERO  0x001
#define G3D_RESNODE_FLAG_ROT_ZERO    0x002
#define G3D_RESNODE_FLAG_SCALE_ONE   0x004
#define G3D_RESNODE_FLAG_PIVOT_EXIST 0x008 // compressed rotation: one +-1 element and two values
#define G3D_RESNODE_FLAG_PIVOT_MASK  0x0F0 // index of the +-1 element
#define G3D_RESNODE_FLAG_PIVOT_SHIFT 4
#define G3D_RESNODE_FLAG_PIVOT_MINUS 0x100 // the pivot is -1
#define G3D_RESNODE_FLAG_SIGN_REVC   0x200 // the third value is -B
#define G3D_RESNODE_FLAG_SIGN_REVD   0x400 // the fourth value is -A

// envelope matrices of a model (NNSG3dResMdl.ofsEvpMtx), per matrix stack index
typedef struct G3dResEvpMtx {
    MtxFx43 invM; // inverse bind pose matrix
    MtxFx33 invN; // its direction matrix
} G3dResEvpMtx;

// NODEMIX: current matrix (clip coordinates) and direction matrix of an envelope matrix
typedef struct G3dEvpMtxCache {
    MtxFx44 posMtx;
    MtxFx33 dirMtx;
} G3dEvpMtxCache;

static inline G3dResMat *G3dGetResMat(const NNSG3dResMdl *pResMdl) {
    if (pResMdl) {
        u32 ofsMat = pResMdl->ofsMat;
        if (ofsMat) {
            return (G3dResMat *)((u8 *)pResMdl + ofsMat);
        }
    }
    return NULL;
}

static inline void *G3dGetResShp(const NNSG3dResMdl *pResMdl) {
    if (pResMdl) {
        u32 ofsShp = pResMdl->ofsShp;
        if (ofsShp) {
            return (u8 *)pResMdl + ofsShp;
        }
    }
    return NULL;
}

static inline G3dResMatData *G3dGetResMatDataByIdx(void *pResMat, u32 idx) {
    G3dResMat *pMat = pResMat; // through a local (needed for the match)
    if (pMat) {
        const NNSG3dResDictMdlSetData *pData = NNS_G3dGetResDataByIdx(&pMat->dict, idx);
        if (pData) {
            return (G3dResMatData *)((u8 *)pMat + pData->offset);
        }
    }
    return NULL;
}

static inline G3dResShpData *G3dGetResShpDataByIdx(void *pResShp, u32 idx) {
    NNSG3dResDict *pDict = pResShp;
    if (pDict) {
        const NNSG3dResDictMdlSetData *pData = NNS_G3dGetResDataByIdx(pDict, idx);
        if (pData) {
            return (G3dResShpData *)((u8 *)pDict + pData->offset);
        }
    }
    return NULL;
}

extern G3dRS *gCurrentRenderState;
extern G3dMatAnmResult gMatAnmResultBuffer[64];
extern const u32 gMatColorMasks[8];
extern G3dFuncSendJointSRT gSendJointSRTFuncs[3];
extern G3dFuncGetJointScale gGetJointScaleFuncs[3];
extern G3dFuncSendTexSRT gSendTexSRTFuncs[4];
extern const u8 gPivotMtxIndices[9][4]; // per pivot: the four elements outside its row and column
extern G3dEvpMtxCache gEvpMtxCache[64];
extern MtxFx33 gEvpMtxCacheFirstDirMtx; // gEvpMtxCache[0].dirMtx
// BB / BBY: one geometry command packet each, MTX_POP 1, MTX_MODE position-vector, MTX_LOAD_4x3 of
// the billboard rotation with the node's translation, MTX_SCALE by the node's scale; the parts are
// also sent separately after the inverse camera matrix
extern u32 gBillboardCmd[18];
extern u32 gBillboardCmdParams[2];
extern MtxFx43 gBillboardMtx;
extern VecFx32 gBillboardTrans; // gBillboardMtx translation
extern VecFx32 gBillboardScale;
extern u32 gBillboardYCmd[18];
extern u32 gBillboardYCmdParams[2];
extern MtxFx43 gBillboardYMtx;
extern VecFx32 gBillboardYTrans;
extern VecFx32 gBillboardYScale;
// ENVMAP / PRJMAP: {G3OP_TEXIMAGE_PARAM, PRJMAP parameter, G3OP_TEXIMAGE_PARAM, ENVMAP parameter},
// followed at word 12 by the PRJMAP texture matrix gPrjMapTexMtx
extern u32 gTexGenTexImageCmds[];
extern u32 gPrjMapTexImageParam; // gTexGenTexImageCmds[1]
extern u32 gEnvMapTexImageParam; // gTexGenTexImageCmds[3]
extern MtxFx44 gPrjMapTexMtx;
extern void (*gSbcFuncs[])(G3dRS *pRS, u32 opt);
extern void (*gSbcMatFuncs[])(G3dRS *pRS, u32 opt, const G3dResMatData *pMatData, u32 matID);
extern void (*gSbcShpFuncs[])(G3dRS *pRS, u32 opt, const G3dResShpData *pShpData, u32 shpID);

void G3dDrawInternal_Loop_(G3dRS *pRS);
void G3dDrawInternal_(G3dRS *pRS, NNSG3dRenderObj *pRenderObj);
void updateHintVec___g3d(u32 *pHintVec, const NNSG3dAnmObj *pAnmObj);

void NNSi_G3dFuncSbc_NOP(G3dRS *pRS, u32 opt);
void NNSi_G3dFuncSbc_RET(G3dRS *pRS, u32 opt);
void NNSi_G3dFuncSbc_NODE(G3dRS *pRS, u32 opt);
void NNSi_G3dFuncSbc_MTX(G3dRS *pRS, u32 opt);
void NNSi_G3dFuncSbc_MAT_InternalDefault(G3dRS *pRS, u32 opt, const G3dResMatData *pMatData, u32 matID);
void NNSi_G3dFuncSbc_MAT(G3dRS *pRS, u32 opt);
void NNSi_G3dFuncSbc_SHP_InternalDefault(G3dRS *pRS, u32 opt, const G3dResShpData *pShpData);
void NNSi_G3dFuncSbc_SHP(G3dRS *pRS, u32 opt);
void NNSi_G3dFuncSbc_NODEDESC(G3dRS *pRS, u32 opt);
void NNSi_G3dFuncSbc_BB(G3dRS *pRS, u32 opt);
void NNSi_G3dFuncSbc_BBY(G3dRS *pRS, u32 opt);
void NNSi_G3dFuncSbc_NODEMIX(G3dRS *pRS, u32 opt);
void NNSi_G3dFuncSbc_CALLDL(G3dRS *pRS, u32 opt);
void NNSi_G3dFuncSbc_POSSCALE(G3dRS *pRS, u32 opt);
void NNSi_G3dFuncSbc_ENVMAP(G3dRS *pRS, u32 opt);
void NNSi_G3dFuncSbc_PRJMAP(G3dRS *pRS, u32 opt);

#endif // POKEHEARTGOLD_NNSYS_G3D_RENDER_INTERNAL_H
