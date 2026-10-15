#ifndef POKEHEARTGOLD_NNSYS_G3D_ANM_INTERNAL_H
#define POKEHEARTGOLD_NNSYS_G3D_ANM_INTERNAL_H

// NitroSystem g3d animation resources and their evaluation: declarations the public g3d headers lack,
// shared by the lib/NitroSystem/src/g3d_anm_*.c modules.

#include <nitro.h>
#include <nnsys/g3d_render_internal.h>

// ---- joint animation (NSBCA, g3d_anm_bca.c)

typedef struct G3dResJntAnm {
    NNSG3dResAnmHeader anmHeader;
    u16 numFrame;
    u16 numNode;
    u32 flag;         // G3D_RESJNTANM_FLAG_*
    u32 ofsRot3;      // compressed rotations (pivot form)
    u32 ofsRot5;      // compressed rotations (two rows)
    u16 ofsTagData[]; // per node: G3D_JNTANM_TAG_* word, then the data of each animated part
} G3dResJntAnm;

#define G3D_RESJNTANM_FLAG_INTERPOLATION 0x1 // values between the key frames are interpolated

#define G3D_JNTANM_TAG_SRT_NONE      0x00000001 // no animation: identity
#define G3D_JNTANM_TAG_TRANS_ZERO    0x00000002
#define G3D_JNTANM_TAG_TRANS_MODEL   0x00000004 // the model's translation
#define G3D_JNTANM_TAG_TRANS_X_CONST 0x00000008
#define G3D_JNTANM_TAG_TRANS_Y_CONST 0x00000010
#define G3D_JNTANM_TAG_TRANS_Z_CONST 0x00000020
#define G3D_JNTANM_TAG_ROT_ZERO      0x00000040
#define G3D_JNTANM_TAG_ROT_MODEL     0x00000080
#define G3D_JNTANM_TAG_ROT_CONST     0x00000100 // one compressed rotation, by index
#define G3D_JNTANM_TAG_SCALE_ONE     0x00000200
#define G3D_JNTANM_TAG_SCALE_MODEL   0x00000400
#define G3D_JNTANM_TAG_SCALE_X_CONST 0x00000800
#define G3D_JNTANM_TAG_SCALE_Y_CONST 0x00001000
#define G3D_JNTANM_TAG_SCALE_Z_CONST 0x00002000
#define G3D_JNTANM_TAG_NODE_SHIFT    24 // node ID

extern G3dFuncAnmJnt gAnmCalcFuncNsBca;
extern const u8 gJntAnmPivotMtxIndices[9][4]; // the same table as gPivotMtxIndices

void NNSi_G3dAnmObjInitNsBca(NNSG3dAnmObj *pAnmObj, void *pResAnm, const NNSG3dResMdl *pResMdl);
void NNSi_G3dAnmCalcNsBca(G3dJntAnmResult *pResult, const NNSG3dAnmObj *pAnmObj, u32 dataIdx);
void getMdlTrans_(G3dJntAnmResult *pResult);
void getMdlScale_(G3dJntAnmResult *pResult);
void getMdlRot_(G3dJntAnmResult *pResult);
void getJntSRTAnmResult_(const G3dResJntAnm *pJntAnm, u32 dataIdx, fx32 frame, G3dJntAnmResult *pResult);
void getTransData_(fx32 *pVal, fx32 frame, const u32 *pData, const G3dResJntAnm *pJntAnm);
void getTransDataEx_(fx32 *pVal, fx32 frame, const u32 *pData, const G3dResJntAnm *pJntAnm);
void getRotData_(fx32 *pRot, fx32 frame, const u32 *pData, const G3dResJntAnm *pJntAnm);
void getRotDataEx_(fx32 *pRot, fx32 frame, const u32 *pData, const G3dResJntAnm *pJntAnm);
void getScaleData_(fx32 *pVal, fx32 frame, const u32 *pData, const G3dResJntAnm *pJntAnm);
void getScaleDataEx_(fx32 *pVal, fx32 frame, const u32 *pData, const G3dResJntAnm *pJntAnm);
BOOL getRotDataByIdx_(fx32 *pRot, const void *pArrayRot3, const void *pArrayRot5, u32 info);

#endif // POKEHEARTGOLD_NNSYS_G3D_ANM_INTERNAL_H
