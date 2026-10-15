#ifndef POKEHEARTGOLD_NNSYS_G3D_ANM_MAT_INTERNAL_H
#define POKEHEARTGOLD_NNSYS_G3D_ANM_MAT_INTERNAL_H

// NitroSystem g3d joint animation key frames, material colour / texture SRT / texture pattern /
// visibility animations and the per-tool (basic, Maya, Softimage 3D, 3ds Max, XSI) joint and texture
// matrix senders: declarations the public g3d headers lack, shared by the lib/NitroSystem/src/g3d_anm_*.c
// and g3d_cgtool_*.c modules.

#include <nitro.h>
#include <nnsys/g3d_anm_internal.h>
#include <nnsys/g3d_util_internal.h>

// ---- NitroSDK functions the nitro headers do not declare

void FX_DivAsync(fx32 numer, fx32 denom);
fx32 FX_GetDivResult(void);

// ---- key frame tracks (joint, material colour and texture SRT animations)

// track info word: how the values are stored
#define G3D_ANM_TRACK_STEP_MASK   0xC0000000 // 0: one value per frame
#define G3D_ANM_TRACK_STEP_2      0x40000000 // one value every 2 frames
#define G3D_ANM_TRACK_STEP_4      0x80000000 // one value every 4 frames
#define G3D_ANM_TRACK_LAST_MASK   0x1FFF0000 // first frame stored one per frame (the end of the animation)
#define G3D_ANM_TRACK_LAST_SHIFT  16
#define G3D_JNTANM_TRACK_FX16     0x20000000 // joint: values are fx16 (else fx32)
#define G3D_MATCANM_TRACK_CONST   0x20000000 // material colour: the low 16 bits are the value
#define G3D_TEXSRTANM_TRACK_CONST 0x20000000 // texture SRT: the second word is the value
#define G3D_TEXSRTANM_TRACK_FX16  0x10000000 // texture SRT: values are fx16 (else fx32)

// joint animation flag: the last frame is interpolated towards the first one
#define G3D_RESJNTANM_FLAG_LOOP 0x2

// ---- resource dictionaries

static inline const NNSG3dResName *G3dGetResNameByIdx(const NNSG3dResDict *pDict, u32 idx) {
    u32 ofsEntry;
    const u8 *pEntryHeader;
    if (pDict && idx < pDict->numEntry) {
        ofsEntry = pDict->ofsEntry;
        pEntryHeader = (const u8 *)pDict + ofsEntry;
        return (const NNSG3dResName *)(pEntryHeader + ((const NNSG3dResDictEntryHeader *)pEntryHeader)->ofsName + idx * sizeof(NNSG3dResName));
    }
    return NULL;
}

// ---- material colour animation (NSBMA, g3d_anm_bma.c)

typedef struct G3dResMatCAnm {
    NNSG3dResAnmHeader anmHeader;
    u16 numFrame;
    u16 unk_06;
    NNSG3dResDict dict; // material name -> G3dResMatCAnmData
} G3dResMatCAnm;

// one track word per colour: G3D_ANM_TRACK_* bits, low 16 bits the value (G3D_MATCANM_TRACK_CONST) or
// the offset of the values (u16 colours, u8 alpha) from the animation
typedef struct G3dResMatCAnmData {
    u32 diffuse;
    u32 ambient;
    u32 specular;
    u32 emission;
    u32 polygonAlpha;
} G3dResMatCAnmData;

extern G3dFuncAnmMat gAnmCalcFuncNsBma;

u16 GetMatColAnmValue_(G3dResMatCAnm *pAnm, u32 info, u32 frame);
u16 GetMatColAnmuAlphaValue_(G3dResMatCAnm *pAnm, u32 info, u32 frame);
void NNSi_G3dAnmObjInitNsBma(NNSG3dAnmObj *pAnmObj, void *pResAnm, const NNSG3dResMdl *pResMdl);
void NNSi_G3dAnmCalcNsBma(G3dMatAnmResult *pResult, const NNSG3dAnmObj *pAnmObj, u32 dataIdx);

// ---- texture SRT animation (NSBTA, g3d_anm_bta*.c)

typedef struct G3dResTexSRTAnm {
    NNSG3dResAnmHeader anmHeader;
    u16 numFrame;
    u16 unk_06;
    NNSG3dResDict dict; // material name -> G3dResTexSRTAnmData
} G3dResTexSRTAnm;

// info: G3D_ANM_TRACK_* / G3D_TEXSRTANM_TRACK_* bits, low 16 bits the last frame stored at every step;
// data: the value (G3D_TEXSRTANM_TRACK_CONST) or the offset of the values from the animation
typedef struct G3dResTexSRTAnmTrack {
    u32 info;
    u32 data;
} G3dResTexSRTAnmTrack;

typedef struct G3dResTexSRTAnmData {
    G3dResTexSRTAnmTrack scaleS;
    G3dResTexSRTAnmTrack scaleT;
    G3dResTexSRTAnmTrack rot; // sine in the low, cosine in the high 16 bits
    G3dResTexSRTAnmTrack transS;
    G3dResTexSRTAnmTrack transT;
} G3dResTexSRTAnmData;

#define G3D_TEXSRTANM_ROT_ZERO 0x10000000 // sine 0, cosine FX16_ONE

extern G3dFuncAnmMat gAnmCalcFuncNsBta;

s32 GetTexSRTAnmVectorVal_(const void *pAnm, u32 info, u32 data, u32 frame);
u32 GetTexSRTAnmSinCosVal_(const void *pAnm, u32 info, u32 data, u32 frame);
void GetTexSRTAnm_(const G3dResTexSRTAnm *pAnm, u32 dataIdx, u32 frame, G3dMatAnmResult *pResult);
void NNSi_G3dAnmObjInitNsBta(NNSG3dAnmObj *pAnmObj, void *pResAnm, const NNSG3dResMdl *pResMdl);
void NNSi_G3dAnmCalcNsBta(G3dMatAnmResult *pResult, const NNSG3dAnmObj *pAnmObj, u32 dataIdx);

// ---- texture pattern animation (NSBTP, g3d_anm_btp*.c; resource types in g3d_util_internal.h)

extern G3dFuncAnmMat gAnmCalcFuncNsBtp;

void NNSi_G3dAnmObjInitNsBtp(NNSG3dAnmObj *pAnmObj, void *pResAnm, const NNSG3dResMdl *pResMdl);
void SetTexParamaters_(const NNSG3dResTex *pTex, const NNSG3dResName *pTexName, G3dMatAnmResult *pResult);
void SetPlttParamaters_(const NNSG3dResTex *pTex, const NNSG3dResName *pPlttName, G3dMatAnmResult *pResult);
void NNSi_G3dAnmCalcNsBtp(G3dMatAnmResult *pResult, const NNSG3dAnmObj *pAnmObj, u32 dataIdx);

// ---- visibility animation (NSBVA, g3d_anm_bva.c)

typedef struct G3dResVisAnm {
    NNSG3dResAnmHeader anmHeader;
    u16 numFrame;
    u16 numNode;
    u16 size;
    u32 visData[]; // bit per node and frame: frame * numNode + node
} G3dResVisAnm;

extern G3dFuncAnmVis gAnmCalcFuncNsBva;

void NNSi_G3dAnmObjInitNsBva(NNSG3dAnmObj *pAnmObj, void *pResAnm, const NNSG3dResMdl *pResMdl);
void NNSi_G3dAnmCalcNsBva(u32 *pResult, const NNSG3dAnmObj *pAnmObj, u32 dataIdx);

// ---- joint matrices and scale per tool (g3d_cgtool_*.c)

#define G3D_JNTANM_FLAG_MAYA_SSC_APPLY 0x20 // G3dJntAnmResult.flag: scaleEx0 is the parent's inverse scale

// NODEDESC flags (command byte 3)
#define G3D_NODEDESC_FLAG_MAYA_SSC_APPLY  0x01 // the node compensates its parent's scale
#define G3D_NODEDESC_FLAG_MAYA_SSC_PARENT 0x02 // the node's children compensate its scale

// scale compensation (Maya / Softimage 3D): per node the scale and its inverse
typedef struct G3dScaleCacheEntry {
    VecFx32 scale;
    VecFx32 invScale;
} G3dScaleCacheEntry;

extern G3dScaleCacheEntry gScaleCache[NNS_G3D_SIZE_JNT_MAX];
// the code addresses some members of gScaleCache[0] as symbols of their own
extern fx32 gScaleCacheScaleY[];
extern fx32 gScaleCacheScaleZ[];
extern VecFx32 gScaleCacheInvScale[]; // gScaleCache[0].invScale, entries 2 VecFx32 apart
extern fx32 gScaleCacheInvScaleY[];
extern fx32 gScaleCacheInvScaleZ[];

void NNSi_G3dSendJointSRTBasic(const G3dJntAnmResult *pResult);
void NNSi_G3dGetJointScaleBasic(G3dJntAnmResult *pResult, const fx32 *pData, const u8 *pCmd, u32 srtFlag);
void NNSi_G3dSendJointSRTMaya(const G3dJntAnmResult *pResult);
void NNSi_G3dGetJointScaleMaya(G3dJntAnmResult *pResult, const fx32 *pData, const u8 *pCmd, u32 srtFlag);
void NNSi_G3dSendJointSRTSi3d(const G3dJntAnmResult *pResult);
void NNSi_G3dGetJointScaleSi3d(G3dJntAnmResult *pResult, const fx32 *pData, const u8 *pCmd, u32 srtFlag);

// ---- texture matrices per tool (g3d_cgtool_*.c)

// three geometry commands packed into one command word
#define G3D_GE_PACK_OP3(op0, op1, op2) ((op0) | ((op1) << 8) | ((op2) << 16))

// calculates the texture matrix of a material for one combination of
// G3D_MATANM_FLAG_TEXMTX_SCALEONE / _ROTZERO / _TRANSZERO (the function table index)
// texture matrix packet of the Maya / 3ds Max / XSI senders: MTX_MODE texture, MTX_LOAD_4x4 or
// MTX_MULT_4x4, MTX_MODE position-vector
typedef struct G3dTexMtx44Packet {
    u32 cmd;
    u32 mtxMode;
    MtxFx44 mtx;
    u32 restoreMtxMode;
} G3dTexMtx44Packet;

typedef void (*G3dFuncTexMtxCalc)(MtxFx44 *pMtx, const G3dMatAnmResult *pResult);

extern G3dFuncTexMtxCalc gTexMtxCalcFuncsMaya[8];
extern G3dFuncTexMtxCalc gTexMtxCalcFuncs3dsMax[8];
extern G3dFuncTexMtxCalc gTexMtxCalcFuncsXsi[8];

void texmtxCalc_flag_(MtxFx44 *pMtx, const G3dMatAnmResult *pResult);
void texmtxCalc_flagS_(MtxFx44 *pMtx, const G3dMatAnmResult *pResult);
void texmtxCalc_flagR_(MtxFx44 *pMtx, const G3dMatAnmResult *pResult);
void texmtxCalc_flagRS_(MtxFx44 *pMtx, const G3dMatAnmResult *pResult);
void texmtxCalc_flagT_(MtxFx44 *pMtx, const G3dMatAnmResult *pResult);
void texmtxCalc_flagTS_(MtxFx44 *pMtx, const G3dMatAnmResult *pResult);
void texmtxCalc_flagTR_(MtxFx44 *pMtx, const G3dMatAnmResult *pResult);
void texmtxCalc_flagTRS_(MtxFx44 *pMtx, const G3dMatAnmResult *pResult);
void NNSi_G3dSendTexSRTMaya(const G3dMatAnmResult *pResult);
void NNSi_G3dSendTexSRTSi3d(const G3dMatAnmResult *pResult);
void texmtxCalc_flag___3dsmax(MtxFx44 *pMtx, const G3dMatAnmResult *pResult);
void texmtxCalc_flagS___3dsmax(MtxFx44 *pMtx, const G3dMatAnmResult *pResult);
void texmtxCalc_flagR___3dsmax(MtxFx44 *pMtx, const G3dMatAnmResult *pResult);
void texmtxCalc_flagRS___3dsmax(MtxFx44 *pMtx, const G3dMatAnmResult *pResult);
void texmtxCalc_flagT___3dsmax(MtxFx44 *pMtx, const G3dMatAnmResult *pResult);
void texmtxCalc_flagTS___3dsmax(MtxFx44 *pMtx, const G3dMatAnmResult *pResult);
void texmtxCalc_flagTR___3dsmax(MtxFx44 *pMtx, const G3dMatAnmResult *pResult);
void texmtxCalc_flagTRS___3dsmax(MtxFx44 *pMtx, const G3dMatAnmResult *pResult);
void NNSi_G3dSendTexSRT3dsMax(const G3dMatAnmResult *pResult);
void texmtxCalc_flag___xsi(MtxFx44 *pMtx, const G3dMatAnmResult *pResult);
void texmtxCalc_flagS___xsi(MtxFx44 *pMtx, const G3dMatAnmResult *pResult);
void texmtxCalc_flagR___xsi(MtxFx44 *pMtx, const G3dMatAnmResult *pResult);
void texmtxCalc_flagRS___xsi(MtxFx44 *pMtx, const G3dMatAnmResult *pResult);
void texmtxCalc_flagT___xsi(MtxFx44 *pMtx, const G3dMatAnmResult *pResult);
void texmtxCalc_flagTS___xsi(MtxFx44 *pMtx, const G3dMatAnmResult *pResult);
void texmtxCalc_flagTR___xsi(MtxFx44 *pMtx, const G3dMatAnmResult *pResult);
void texmtxCalc_flagTRS___xsi(MtxFx44 *pMtx, const G3dMatAnmResult *pResult);
void NNSi_G3dSendTexSRTXsi(G3dMatAnmResult *pResult); // also fills in the parts the flags mark as unused

#endif // POKEHEARTGOLD_NNSYS_G3D_ANM_MAT_INTERNAL_H
