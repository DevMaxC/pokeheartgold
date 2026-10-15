#ifndef POKEHEARTGOLD_NNSYS_G2D_RENDERER_INTERNAL_H
#define POKEHEARTGOLD_NNSYS_G2D_RENDERER_INTERNAL_H

// State of the NitroSystem 2D renderer (lib/NitroSystem/src/g2d_renderer*.c): the current renderer,
// the matrix stack and the 2D matrix caches that hold the OBJ affine parameters of its levels.

#include <nnsys/g2d_internal.h>

#define RENDERER_MTX_STACK_SIZE   32
#define RENDERER_NO_AFFINE_LEVEL  0xfffe     // G2dRendererContext.affineLevel: no scale or rotation applied
#define RENDERER_NO_VRAM_TRANSFER 0xffffffff // G2dRendererContext.vramTransferHandle: no cell VRAM transfer

// NNSG2dRendererInstance.opzHint
#define RENDERER_OPZ_TRANSLATE_ONLY (1 << 0) // the matrix stack holds translations only
#define RENDERER_OPZ_SINGLE_SURFACE (1 << 1) // draw to the first target surface only, without switching surfaces

typedef struct G2dRendererState {
    u16 numMtxCaches;   // 2D matrix caches in use
    u16 nextMtxGroupId; // id of the next scale / rotation applied to the matrix stack
    BOOL translateOnly;
    NNSG2dRendererInstance *pRenderer; // between NNS_G2dBeginRendering and NNS_G2dEndRendering
    s32 stackLevel;                    // current level of the matrix stack
} G2dRendererState;

// matrix cache use of one matrix stack level
typedef struct G2dMtxCacheRecord {
    u16 cacheIndex; // index in gRendererWork.mtxCaches once stored
    u16 groupId;    // levels that share one scale / rotation share the id
    u16 state;      // 0: no scale / rotation, 1: scaled / rotated at this level, 2: inherited from the level below, 3: stored in a cache
    u16 padding;
} G2dMtxCacheRecord;

// matrix caches of the cell animations of the multi cell being drawn (their nodes share them)
typedef struct G2dCellAnimMtxCaches {
    u16 cellAnimIndex; // cell animation of the node being drawn
    u16 padding;
    NNSG2dRndCore2DMtxCache *pCaches[256];
} G2dCellAnimMtxCaches;

typedef struct G2dRendererWork {
    G2dRendererState state;
    fx32 zStack[RENDERER_MTX_STACK_SIZE];
    G2dMtxCacheRecord mtxCacheRecords[RENDERER_MTX_STACK_SIZE];
    MtxFx32 mtxStack[RENDERER_MTX_STACK_SIZE];
    MtxFx32 affineMtxStack[RENDERER_MTX_STACK_SIZE]; // for the OBJ affine parameters: inverse scale
    NNSG2dRndCore2DMtxCache mtxCaches[RENDERER_MTX_STACK_SIZE];
    G2dCellAnimMtxCaches cellAnimMtxCaches;
    BOOL useCellAnimMtxCaches; // while a multi cell that shares its cell animations is drawn
} G2dRendererWork;

typedef struct G2dRendererContext {
    u16 affineLevel; // lowest matrix stack level with a scale or rotation
    u16 padding;
    u32 vramTransferHandle; // of the cell animation being drawn
    MtxFx32 translationMtx; // current matrix in translate-only mode: identity + the current translation
} G2dRendererContext;

// a matrix stack entry seen from one of its members (the asm labels the members of mtxStack[0])
typedef struct G2dMtxStackMemberView {
    fx32 value;
    u8 rest[sizeof(MtxFx32) - sizeof(fx32)];
} G2dMtxStackMemberView;

// gRendererWork + 0xb00: the code addresses cellAnimMtxCaches.cellAnimIndex from there
typedef struct G2dRendererWorkB00 {
    u8 unused[0x90];
    u16 cellAnimIndex;
} G2dRendererWorkB00;

#ifndef G2D_RENDERER_WORK_AS_STATE
extern G2dRendererWork gRendererWork;
#else
extern G2dRendererState gRendererWork;
#endif
extern G2dRendererContext gRendererContext;
// the members of gRendererWork and gRendererContext, as labelled in the data
extern fx32 gRendererZStack[];
extern G2dMtxCacheRecord gRendererMtxCacheRecords[];
extern MtxFx32 gRendererMtxStack[];
extern G2dMtxStackMemberView gRendererMtxStackTransX[]; // gRendererMtxStack[i]._20
extern G2dMtxStackMemberView gRendererMtxStackTransY[]; // gRendererMtxStack[i]._21
extern MtxFx32 gRendererAffineMtxStack[];
extern NNSG2dRndCore2DMtxCache gRendererMtxCaches[];
extern G2dRendererWorkB00 gRendererWorkB00;
extern G2dCellAnimMtxCaches gRendererCellAnimMtxCaches;
extern NNSG2dRndCore2DMtxCache *gRendererCellAnimMtxCacheTable[];
extern MtxFx32 gRendererTranslationMtx;

void NNSi_G2dIdentity(void);
void NNSi_G2dMCMStoreCurrentMtxToMtxCache(void);
void RndCoreCBFuncBeforeCell_(NNSG2dRndCoreInstance *pRend, const NNSG2dCellData *pCell);
void RndCoreCBFuncAfterCell_(NNSG2dRndCoreInstance *pRend, const NNSG2dCellData *pCell);
void RndCoreCBFuncBeforeOBJ_(NNSG2dRndCoreInstance *pRend, const NNSG2dCellData *pCell, u16 oamIdx);
void RndCoreCBFuncAfterOBJ_(NNSG2dRndCoreInstance *pRend, const NNSG2dCellData *pCell, u16 oamIdx);
void DrawCellImpl_(const NNSG2dCellData *pCell);
void DrawCellAnimationImpl_(const NNSG2dCellAnimation *pCellAnim);
void DrawNode_(const NNSG2dNode *pNode);
void NNS_G2dAddRendererTargetSurface(NNSG2dRendererInstance *pRend, NNSG2dRenderSurface *pNew);
void NNS_G2dInitRenderSurface(NNSG2dRenderSurface *pSurface);
const NNSG2dPaletteSwapTable *NNS_G2dGetRendererPaletteTbl(const NNSG2dRendererInstance *pRend);
void NNSi_G2dMtxConcat32(const MtxFx32 *a, const MtxFx32 *b, MtxFx32 *ab);

#endif // POKEHEARTGOLD_NNSYS_G2D_RENDERER_INTERNAL_H
