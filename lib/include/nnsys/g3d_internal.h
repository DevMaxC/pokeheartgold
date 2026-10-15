#ifndef POKEHEARTGOLD_NNSYS_G3D_INTERNAL_H
#define POKEHEARTGOLD_NNSYS_G3D_INTERNAL_H

// NitroSystem g3d declarations the public g3d headers lack: module-private types and prototypes
// shared by the lib/NitroSystem/src/g3d_*.c modules.

#include <nitro.h>
#include <nnsys/g3d/binres/res_struct.h>
#include <nnsys/g3d/binres/res_struct_accessor_inline.h>
#include <nnsys/g3d/glbstate.h>
#include <nnsys/g3d/kernel.h>

// ---- animation and render objects (g3d_kernel.c)

#define G3D_ANMOBJ_MAPDATA_EXISTS   0x100 // NNSG3dAnmObj.mapData[]: the animation has data for the node/material
#define G3D_ANMOBJ_MAPDATA_DISABLED 0x200 // NNSG3dAnmObj.mapData[]: switched off by NNS_G3dAnmObjDisableID

#define G3D_RENDEROBJ_FLAG_ANMOBJ_REMOVED 0x10 // NNSG3dRenderObj.flag: set when an animation object was removed

typedef void (*G3dAnmObjInitFunc)(NNSG3dAnmObj *pAnmObj, void *pResAnm, const NNSG3dResMdl *pResMdl);

// one entry of the animation object init table: the animation resource category -> its init function
typedef struct G3dAnmObjInitEntry {
    u8 category0;
    u8 unk_01;
    u16 category1;
    G3dAnmObjInitFunc func;
} G3dAnmObjInitEntry;

extern u32 gAnmObjInitFuncCount;
extern G3dAnmObjInitEntry gAnmObjInitFuncs[];
extern G3dAnmObjInitFunc gAnmObjInitFuncsFirstFunc[]; // gAnmObjInitFuncs[0].func, entries 8 bytes apart
extern NNSG3dFuncAnmBlendVis gAnmBlendVisDefault;
extern NNSG3dFuncAnmBlendJnt gAnmBlendJntDefault;
extern NNSG3dFuncAnmBlendMat gAnmBlendMatDefault;

u32 NNS_G3dAnmObjCalcSizeRequired(const void *pResAnm, const NNSG3dResMdl *pResMdl);
void NNS_G3dAnmObjEnableID(NNSG3dAnmObj *pAnmObj, int id);
void NNS_G3dAnmObjDisableID(NNSG3dAnmObj *pAnmObj, int id);
void addLink_(NNSG3dAnmObj **ppHead, NNSG3dAnmObj *pAnmObj);
void updateHintVec_(u32 *pHintVec, const NNSG3dAnmObj *pAnmObj);
BOOL removeLink_(NNSG3dAnmObj **ppHead, NNSG3dAnmObj *pAnmObj);

// ---- texture / palette binding of model materials (g3d_mdl_bind.c)

// material block of a model (NNSG3dResMdl.ofsMat)
typedef struct G3dResMat {
    u16 ofsDictTexToMatList;  // texture name -> G3dResBindEntry
    u16 ofsDictPlttToMatList; // palette name -> G3dResBindEntry
    NNSG3dResDict dict;       // material -> offset of its G3dResMatData
} G3dResMat;

typedef struct G3dResMatData {
    u16 itemTag; // selects the SBC MAT handler
    u16 unk_02;
    u32 prmMatColor0;    // 0x04, diffuse, ambient
    u32 prmMatColor1;    // 0x08, specular, emission
    u32 prmPolygonAttr;  // 0x0C
    u32 polygonAttrMask; // 0x10, bits taken from prmPolygonAttr (the rest from the global state)
    u32 texImageParam;   // 0x14
    u32 unk_18;
    u16 texPlttBase; // 0x1C
    u16 flag;        // 0x1E, NNSG3dMatFlag
    u16 origWidth;   // 0x20
    u16 origHeight;  // 0x22
    fx32 scaleS;     // 0x24, texture width / origWidth
    fx32 scaleT;     // 0x28, texture height / origHeight
    u8 texMtxData[]; // 0x2C, present texture matrix parts: scale (2 fx32), rotation (2 fx16), translation (2 fx32)
} G3dResMatData;

#define G3D_RESMATDATA_TEXIMAGEPARAM_KEEP_MASK 0xC00F0000 // bits not set by a texture binding

// the materials one texture or palette is bound to
typedef struct G3dResBindEntry {
    u16 ofsMatIdxList; // from the G3dResMat, u8 material indices
    u8 numMat;
    u8 flag; // G3D_RESBIND_BOUND
} G3dResBindEntry;

#define G3D_RESBIND_BOUND 1

// NNSG3dResTex.dict entry
typedef struct G3dResTexData {
    u32 texImageParam;
    u32 extraParam; // width in bits 0-10, height in bits 11-21
} G3dResTexData;

#define G3D_RESTEXDATA_WIDTH(extraParam)  ((extraParam) & 0x7FF)
#define G3D_RESTEXDATA_HEIGHT(extraParam) (((extraParam) & 0x3FF800) >> 11)

// NNSG3dResTex.plttInfo.ofsDict dictionary entry
typedef struct G3dResPlttData {
    u16 offset;
    u16 flag; // G3D_RESPLTTDATA_4COLOR
} G3dResPlttData;

#define G3D_RESPLTTDATA_4COLOR 1 // offset in 8-byte units; other palettes are placed in 16-byte units

void *NNS_G3dGetResDataByName(const NNSG3dResDict *pDict, const NNSG3dResName *pName);
void bindMdlTex_Internal_(G3dResMat *pMat, G3dResBindEntry *pBind, const NNSG3dResTex *pTex, const G3dResTexData *pTexData);
void releaseMdlTex_Internal_(G3dResMat *pMat, G3dResBindEntry *pBind);
void bindMdlPltt_Internal_(G3dResMat *pMat, G3dResBindEntry *pBind, const NNSG3dResTex *pTex, const G3dResPlttData *pPlttData);
BOOL NNS_G3dBindMdlTex(NNSG3dResMdl *pResMdl, const NNSG3dResTex *pTex);
BOOL NNS_G3dForceBindMdlTex(NNSG3dResMdl *pResMdl, const NNSG3dResTex *pTex, u32 texToMatListIdx, u32 texIdx);
void NNS_G3dReleaseMdlTex(NNSG3dResMdl *pResMdl);
BOOL NNS_G3dBindMdlPltt(NNSG3dResMdl *pResMdl, const NNSG3dResTex *pTex);
BOOL NNS_G3dForceBindMdlPltt(NNSG3dResMdl *pResMdl, const NNSG3dResTex *pTex, u32 plttToMatListIdx, u32 plttIdx);
void NNS_G3dReleaseMdlPltt(NNSG3dResMdl *pResMdl);
void NNS_G3dReleaseMdlSet(NNSG3dResMdlSet *pMdlSet);

// ---- global state (g3d_glb.c)

void NNS_G3dGlbInit(void);

#endif // POKEHEARTGOLD_NNSYS_G3D_INTERNAL_H
