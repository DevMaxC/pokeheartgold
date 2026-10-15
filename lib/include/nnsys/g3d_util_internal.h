#ifndef POKEHEARTGOLD_NNSYS_G3D_UTIL_INTERNAL_H
#define POKEHEARTGOLD_NNSYS_G3D_UTIL_INTERNAL_H

// NitroSystem g3d geometry command buffer, utilities, model material setters, resource accessors and
// joint animation: declarations the public g3d headers lack, shared by the lib/NitroSystem/src/g3d_*.c
// modules.

#include <nitro.h>
#include <nnsys/g3d_render_internal.h>

// ---- NitroSDK / NitroSystem functions and data the headers do not declare

extern u32 GXi_DmaId;
fx64c FX_GetDivResultFx64c(void);
void FX_InvAsync(fx32 x);

// ---- geometry command buffer (g3d_gecom.c)

typedef struct G3dGeBufferState {
    u32 *pBuffer;          // [0]: words in use, then the buffered commands (at most G3D_GE_BUFFER_WORDS)
    volatile u32 isLocked; // a display list is being sent by DMA
    u32 useFastDma;
} G3dGeBufferState;

#define G3D_GE_BUFFER_WORDS 192

extern G3dGeBufferState gGeBufferState;
extern volatile u32 gGeBufferStateIsLocked; // gGeBufferState.isLocked

void NNS_G3dGeWaitSendDL(void);
void simpleUnlock_(void *pLocked);

// ---- resource files and accessors (g3d_util.c, g3d_res_struct_accessor.c)

#define G3D_RES_SIG_BVA0 0x30415642 // "BVA0"
#define G3D_RES_SIG_BMA0 0x30414D42 // "BMA0"
#define G3D_RES_SIG_BCA0 0x30414342 // "BCA0"
#define G3D_RES_SIG_BTA0 0x30415442 // "BTA0"
#define G3D_RES_SIG_BTP0 0x30505442 // "BTP0"
#define G3D_RES_SIG_BMD0 0x30444D42 // "BMD0"
#define G3D_RES_SIG_BTX0 0x30585442 // "BTX0"

void *NNS_G3dGetResDataByName(const NNSG3dResDict *pDict, const NNSG3dResName *pName);
int NNS_G3dGetResDictIdxByName(const NNSG3dResDict *pDict, const NNSG3dResName *pName);

// ---- texture pattern animation resources (g3d_res_struct_accessor_anm.c)

typedef struct G3dResTexPatAnm {
    NNSG3dResAnmHeader anmHeader;
    u16 numFrame;
    u8 numTex;
    u8 numPltt;
    u16 ofsTexName;     // texture names (NNSG3dResName each)
    u16 ofsPlttName;    // palette names
    NNSG3dResDict dict; // material -> G3dResTexPatAnmData
} G3dResTexPatAnm;

typedef struct G3dResTexPatAnmData {
    u16 numFV;
    u16 flag;
    fx16 ratioDataFrame; // key frames per frame, to guess the key frame of a frame
    u16 ofsFV;           // G3dResTexPatAnmFV[numFV], from the start of the animation
} G3dResTexPatAnmData;

typedef struct G3dResTexPatAnmFV {
    u16 idxFrame; // first frame of the key
    u8 idxTex;
    u8 idxPltt;
} G3dResTexPatAnmFV;

const NNSG3dResName *NNSi_G3dGetTexPatAnmTexNameByIdx(const G3dResTexPatAnm *pAnm, u32 texIdx);
const NNSG3dResName *NNSi_G3dGetTexPatAnmPlttNameByIdx(const G3dResTexPatAnm *pAnm, u32 plttIdx);
const G3dResTexPatAnmFV *NNSi_G3dGetTexPatAnmFV(const G3dResTexPatAnm *pAnm, u32 idx, u32 frame);
const G3dResTexPatAnmData *NNSi_G3dGetTexPatAnmDataByIdx(const G3dResTexPatAnm *pAnm, u32 idx);

// ---- model material setters (g3d_model.c); values as in the material's colour / polygon attribute words

void NNS_G3dMdlSetMdlDiff(NNSG3dResMdl *pResMdl, u32 matID, u32 col);
void NNS_G3dMdlSetMdlAmb(NNSG3dResMdl *pResMdl, u32 matID, u32 col);
void NNS_G3dMdlSetMdlSpec(NNSG3dResMdl *pResMdl, u32 matID, u32 col);
void NNS_G3dMdlSetMdlEmi(NNSG3dResMdl *pResMdl, u32 matID, u32 col);
void NNS_G3dMdlSetMdlLightEnableFlag(NNSG3dResMdl *pResMdl, u32 matID, u32 light);
void NNS_G3dMdlSetMdlPolygonMode(NNSG3dResMdl *pResMdl, u32 matID, u32 polyMode);
void NNS_G3dMdlSetMdlCullMode(NNSG3dResMdl *pResMdl, u32 matID, u32 cullMode);
void NNS_G3dMdlSetMdlPolygonID(NNSG3dResMdl *pResMdl, u32 matID, u32 polygonID);
void NNS_G3dMdlSetMdlAlpha(NNSG3dResMdl *pResMdl, u32 matID, u32 alpha);
void NNS_G3dMdlSetMdlFogEnableFlag(NNSG3dResMdl *pResMdl, u32 matID, BOOL flag);
void NNS_G3dMdlSetMdlDepthTestCond(NNSG3dResMdl *pResMdl, u32 matID, BOOL flag);
void NNS_G3dMdlSetMdl1Dot(NNSG3dResMdl *pResMdl, u32 matID, BOOL flag);
void NNS_G3dMdlSetMdlFarClip(NNSG3dResMdl *pResMdl, u32 matID, BOOL flag);
void NNS_G3dMdlSetMdlXLDepthUpdate(NNSG3dResMdl *pResMdl, u32 matID, BOOL flag);
u32 NNS_G3dMdlGetMdlLightEnableFlag(const NNSG3dResMdl *pResMdl, u32 matID);
u32 NNS_G3dMdlGetMdlFogEnableFlag(const NNSG3dResMdl *pResMdl, u32 matID);
void NNS_G3dMdlSetMdlDiffAll(NNSG3dResMdl *pResMdl, u32 col);
void NNS_G3dMdlSetMdlAmbAll(NNSG3dResMdl *pResMdl, u32 col);
void NNS_G3dMdlSetMdlSpecAll(NNSG3dResMdl *pResMdl, u32 col);
void NNS_G3dMdlSetMdlEmiAll(NNSG3dResMdl *pResMdl, u32 col);
void NNS_G3dMdlSetMdlLightEnableFlagAll(NNSG3dResMdl *pResMdl, u32 light);
void NNS_G3dMdlSetMdlPolygonModeAll(NNSG3dResMdl *pResMdl, u32 polyMode);
void NNS_G3dMdlSetMdlCullModeAll(NNSG3dResMdl *pResMdl, u32 cullMode);
void NNS_G3dMdlSetMdlPolygonIDAll(NNSG3dResMdl *pResMdl, u32 polygonID);
void NNS_G3dMdlSetMdlAlphaAll(NNSG3dResMdl *pResMdl, u32 alpha);
void NNS_G3dMdlSetMdlDepthTestCondAll(NNSG3dResMdl *pResMdl, BOOL flag);
void NNS_G3dMdlSetMdl1DotAll(NNSG3dResMdl *pResMdl, BOOL flag);
void NNS_G3dMdlSetMdlFarClipAll(NNSG3dResMdl *pResMdl, BOOL flag);
void NNS_G3dMdlSetMdlXLDepthUpdateAll(NNSG3dResMdl *pResMdl, BOOL flag);

#endif // POKEHEARTGOLD_NNSYS_G3D_UTIL_INTERNAL_H
