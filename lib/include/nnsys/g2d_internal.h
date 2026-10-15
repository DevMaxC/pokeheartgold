#ifndef POKEHEARTGOLD_NNSYS_G2D_INTERNAL_H
#define POKEHEARTGOLD_NNSYS_G2D_INTERNAL_H

// Types and prototypes shared by the NitroSystem 2D graphics modules in lib/NitroSystem/src/g2d_*.c
// that the public headers in nnsys/g2d/ do not declare.

#include <nnsys/g2d.h>

// ---- binary resource loading (g2d_load.c)

typedef struct G2dBinaryFileHeader {
    u32 signature;
    u16 byteOrder;
    u16 version;
    u32 fileSize;
    u16 headerSize;
    u16 numBlocks;
} G2dBinaryFileHeader;

typedef struct G2dBinaryBlockHeader {
    u32 signature;
    u32 size;
} G2dBinaryBlockHeader;

// user extended data block of an animation bank
typedef struct AnimUserExBlock {
    NNSG2dUserExDataBlock header;
    NNSG2dUserExAnimAttrBank attrBank;
} AnimUserExBlock;

// user extended cell attributes: one attribute pointer (stored as an offset) per cell
typedef struct UserExCellAttrBank {
    u16 numCells;
    u16 numAttribute;
    u32 *pCellAttrArray;
} UserExCellAttrBank;

void *NNS_G2dFindBinaryBlock(void *pFile, u32 signature);
BOOL GetUnpackedAnimBankImpl_(void *pNanrFile, NNSG2dAnimBankData **ppAnimBank);
void NNS_G2dUnpackNAN(NNSG2dAnimBankData *pAnimBank);
NNSG2dCellOAMAttrData *GetPtrOamArrayHead_(const NNSG2dCellDataBank *pCellBank);
void UnPackExtendedData_(void *pExtendedData);
const NNSG2dCellData *NNS_G2dGetCellDataByIdx(const NNSG2dCellDataBank *pCellBank, u16 idx);
void NNS_G2dUnpackNCE(NNSG2dCellDataBank *pCellBank);
void UnpackExtendedData_(void *pExtendedData);
void NNS_G2dUnpackNMC(NNSG2dMultiCellDataBank *pMCBank);
const NNSG2dMultiCellData *NNS_G2dGetMultiCellDataByIdx(const NNSG2dMultiCellDataBank *pMCBank, u16 idx);
void NNS_G2dUnpackNCG(NNSG2dCharacterData *pCharData);
void NNS_G2dUnpackBGNCG(NNSG2dCharacterData *pCharData);
void NNSi_G2dUnpackNCLCmpInfo(NNSG2dPaletteCompressInfo *pPltCmpInfo);
void NNS_G2dUnpackNCL(NNSG2dPaletteData *pPlttData);
void NNSi_G2dUnpackUserExCellAttrBank(UserExCellAttrBank *pAttrBank);

// ---- software sprites (g2d_softsprite.c)

extern const VecFx32 gG2dSoftSpriteCameraUp;
extern const VecFx32 gG2dSoftSpriteCameraTarget;

// the NitroSDK headers declare these without a parameter list
void G3i_OrthoW_(fx32 t, fx32 b, fx32 l, fx32 r, fx32 n, fx32 f, fx32 scaleW, BOOL draw, MtxFx44 *mtx);
void G3i_LookAt_(const VecFx32 *camPos, const VecFx32 *camUp, const VecFx32 *target, BOOL draw, MtxFx43 *mtx);

void DrawOneQuad_(u32 u0, u32 u1, u32 v0, u32 v1);

// ---- animation controller (g2d_animation.c)

void SequenceEdgeHandle_(NNSG2dAnimController *pAnimCtrl);
BOOL SetAnimCtrlCurrentFrameImpl_(NNSG2dAnimController *pAnimCtrl, u16 frameIndex);
void *NNS_G2dGetAnimCtrlCurrentElement(NNSG2dAnimController *pAnimCtrl);
BOOL NNS_G2dTickAnimCtrl(NNSG2dAnimController *pAnimCtrl, fx32 frames);
BOOL NNS_G2dSetAnimCtrlCurrentFrame(NNSG2dAnimController *pAnimCtrl, u16 frameIndex);
void NNS_G2dInitAnimCtrl(NNSG2dAnimController *pAnimCtrl);
void NNS_G2dInitAnimCallBackFunctor(NNSG2dAnimCallBackFunctor *pCallback);
void NNS_G2dBindAnimCtrl(NNSG2dAnimController *pAnimCtrl, const NNSG2dAnimSequence *pAnimSeq);
BOOL NNSi_G2dIsAnimCtrlLoopAnim(const NNSG2dAnimController *pAnimCtrl);

// ---- OAM manager (g2d_oam.c)

#define OAM_MANAGER_NO_OWNER  0xffff
#define OAM_MANAGER_NO_AFFINE 0xfffe

typedef struct OamManagerRange {
    u16 first;
    u16 last;
    u16 next;
} OamManagerRange;

typedef struct OamManagerInstance {
    u32 type; // 0: main engine, 1: sub engine, 2: software emulation
    OamManagerRange oam;
    OamManagerRange affine;
    u16 managerId;
    u16 padding;
    BOOL useFastTransfer;
} OamManagerInstance;

// per OAM type: owner (manager id) of every OAM entry and affine parameter, and the OAM shadow buffer
typedef struct OamManagerBuffer {
    u16 oamOwners[128];
    GXOamAttr oamBuffer[128];
    u16 affineOwners[32];
} OamManagerBuffer;

typedef void (*OamLoadFunc)(const void *pSrc, u32 offset, u32 szByte);

extern u32 GXi_DmaId;
extern u16 gOamManagerNextId;
extern OamManagerBuffer gOamBuffers[3];
// the members of gOamBuffers, as labelled in the data
extern GXOamAttr gOamBufferMainOam[];
extern u16 gOamBufferMainAffineOwners[];
extern u16 gOamBufferSubOamOwners[];
extern GXOamAttr gOamBufferSubOam[];
extern u16 gOamBufferSubAffineOwners[];
extern u16 gOamBufferSoftOamOwners[];
extern GXOamAttr gOamBufferSoftOam[];
extern u16 gOamBufferSoftAffineOwners[];
extern OamLoadFunc gOamLoadFuncs[];

void CpuLoadOAMSub_(const void *pSrc, u32 offset, u32 szByte);
void CpuLoadOAMMain_(const void *pSrc, u32 offset, u32 szByte);
BOOL NNS_G2dGetNewOamManagerInstance(OamManagerInstance *pMan, u16 oamFirst, u16 numOam, u16 affineFirst, u16 numAffine, int type);
BOOL NNS_G2dEntryOamManagerOamWithAffineIdx(OamManagerInstance *pMan, const GXOamAttr *pOam, u16 affineIndex);
u16 NNS_G2dEntryOamManagerAffine(OamManagerInstance *pMan, const MtxFx22 *mtx);
void NNS_G2dApplyOamManagerToHW(OamManagerInstance *pMan);
void NNS_G2dResetOamManagerBuffer(OamManagerInstance *pMan);
void NNS_G2dApplyAndResetOamManagerBuffer(OamManagerInstance *pMan);

// ---- palette swap table (g2d_palette_table.c)

u16 NNS_G2dGetPaletteTableValue(const NNSG2dPaletteSwapTable *pPlttTbl, int index);

// ---- image and palette proxies, VRAM locations (g2d_image.c)

#define G2D_VRAM_ADDR_NONE 0xffffffff

// GX_load3d.h declares these without a parameter list
void GX_BeginLoadTex(void);
void GX_LoadTex(const void *pSrc, u32 destSlotAddr, u32 szByte);
void GX_EndLoadTex(void);
void GX_BeginLoadTexPltt(void);
void GX_LoadTexPltt(const void *pSrc, u32 destSlotAddr, u32 szByte);
void GX_EndLoadTexPltt(void);

void NNS_G2dSetImageLocation(NNSG2dImageProxy *pImg, NNS_G2D_VRAM_TYPE type, u32 addr);
BOOL NNS_G2dIsImageReadyToUse(const NNSG2dImageProxy *pImg, NNS_G2D_VRAM_TYPE type);
void NNS_G2dSetImagePaletteLocation(NNSG2dImagePaletteProxy *pImg, NNS_G2D_VRAM_TYPE type, u32 addr);
BOOL NNS_G2dIsImagePaletteReadyToUse(const NNSG2dImagePaletteProxy *pImg, NNS_G2D_VRAM_TYPE type);
void NNSi_G2dInitializeVRamLocation(NNSG2dVRamLocation *pVramLocation);
void NNSi_G2dSetVramLocation(NNSG2dVRamLocation *pVramLocation, NNS_G2D_VRAM_TYPE type, u32 addr);
u32 NNSi_G2dGetVramLocation(NNSG2dVRamLocation *pVramLocation, NNS_G2D_VRAM_TYPE type);

// ---- SRT control (g2d_srt_control.c)

// NNSG2dSRTData.SRT_EnableFlag
#define SRT_FLAG_SCALE  (1 << 1)
#define SRT_FLAG_ROTATE (1 << 2)
#define SRT_FLAG_TRANS  (1 << 3)

void NNSi_G2dSrtcSetTrans(NNSG2dSRTControl *pSrtCtrl, s16 x, s16 y);
void NNSi_G2dSrtcSetSRTRotZ(NNSG2dSRTControl *pSrtCtrl, u16 rotZ);
void NNSi_G2dSrtcSetSRTScale(NNSG2dSRTControl *pSrtCtrl, fx32 x, fx32 y);
void NNSi_G2dSrtcInitControl(NNSG2dSRTControl *pSrtCtrl, NNSG2dSRTControlType type);
void NNSi_G2dSrtcSetInitialValue(NNSG2dSRTControl *pSrtCtrl);

// ---- nodes (g2d_node.c)

void NNSi_G2dInitializeNode(NNSG2dNode *pNode, NNSG2dNodeType type);

// ---- cell animation (g2d_cell_animation.c)

// element formats of an animation frame (low byte of NNSG2dAnimSequenceData.animType)
#define ANIM_ELEMENT_INDEX     0 // u16 index
#define ANIM_ELEMENT_INDEX_SRT 1 // AnimFrameSRT
#define ANIM_ELEMENT_INDEX_T   2 // AnimFrameT

typedef struct AnimFrameSRT {
    u16 index;
    u16 rotZ;
    fx32 sx;
    fx32 sy;
    s16 px;
    s16 py;
} AnimFrameSRT;

typedef struct AnimFrameT {
    u16 index;
    u16 padding;
    s16 px;
    s16 py;
} AnimFrameT;

void ApplyCurrentAnimResult_(NNSG2dCellAnimation *pCellAnim);

// ---- multi cell animation (g2d_mc_animation.c)

// low nibble of NNSG2dMultiCellHierarchyData.nodeAttr: the cell animation plays in sync with the multi cell
#define MC_NODE_PLAY_SYNC 1

// cell animation of a multi cell that shares its cell animations between nodes
typedef struct SharedCellAnim {
    NNSG2dCellAnimation cellAnim;
    BOOL isAssigned;
} SharedCellAnim;

void SetMCDataToMCInstanceImpl_(NNSG2dMultiCellInstance *pMCInst, const NNSG2dMultiCellData *pMCData, u32 elapsed);
void NNS_G2dTickMCInstance(NNSG2dMultiCellInstance *pMCInst, fx32 frames);

// ---- cell VRAM transfer state manager (g2d_cell_transfer_manager.c)

typedef struct CellTransferStateManager {
    VramTransferTaskRegisterFuncPtr pTaskRegisterFunc;
    u32 numCellState;
    NNSG2dCellTransferState *pCellStateArray;
} CellTransferStateManager;

extern CellTransferStateManager gCellTransferStateManager;
extern const int gCellTransferDstTypes[]; // NNS_GFD_DST_TYPE of the character data, per NNS_G2D_VRAM_TYPE

NNSG2dCellTransferState *NNSi_G2dGetCellTransferState(u32 handle);
void NNSi_G2dInitCellTransferState(u32 handle, u32 dstAddr3D, u32 dstAddr2DMain, u32 dstAddr2DSub, u32 szDst, const void *pSrcNCGR, const void *pSrcNCBR, u32 szSrcData);
void NNS_G2dSetCellTransferStateRequested(u32 handle, u32 srcOffset, u32 szByte);

// ---- OBJ size tables, shared by the OAM software emulation and the renderer core

extern const u16 gObjWidths[3][4];  // [shape][size], in pixels
extern const u16 gObjHeights[3][4]; // [shape][size], in pixels

// GXOamAttr.attr01 bits 8-9 (rotation/scaling and double size / disable)
#define OAM_EFFECT_AFFINE        0x100
#define OAM_EFFECT_AFFINE_DOUBLE 0x300

// ---- OAM software emulation: OBJs drawn as textured quads by the geometry engine (g2d_oam_soft_emu.c)

typedef struct SpriteParams {
    fx32 u0;
    fx32 v0;
    fx32 u1;
    fx32 v1;
    fx32 w;
    fx32 h;
} SpriteParams;

typedef void (*OamSoftEmuUVCallback)(fx32 *u0, fx32 *v0, fx32 *u1, fx32 *v1, BOOL flipH, BOOL flipV);

typedef struct OamSoftEmuState {
    OamSoftEmuUVCallback pUVCallback;
    fx32 autoZOffset; // z offset of the next OBJ
    BOOL bAutoZOffset;
} OamSoftEmuState;

extern OamSoftEmuState gOamSoftEmuState;
extern fx32 gOamSoftEmuAutoZOffsetStep;
extern const int gTexSizeInChars[];           // per GXTexSizeS/T
extern const GXTexFmt gObjColorModeTexFmts[]; // per GXOamAttr.colorMode
extern const int gObjTexSizeS[3][4];          // [shape][size]
extern const int gObjTexSizeT[3][4];          // [shape][size]

void CalcSpriteParams_(const GXOamAttr *pOam, const NNSG2dImageAttr *pTexAttr, u32 texBase, u32 plttBase, SpriteParams *pParams);
void NNSi_G2dSetOamSoftEmuAutoZOffsetFlag(BOOL flag);
void NNSi_G2dResetOamSoftEmuAutoZOffset(void);
void NNSi_G2dSetOamSoftEmuAutoZOffsetStep(fx32 step);
fx32 NNSi_G2dGetOamSoftEmuAutoZOffsetStep(void);
void NNS_G2dDrawOneOam3DDirectWithPosFast(int posX, int posY, int posZ, const GXOamAttr *pOam, const NNSG2dImageAttr *pTexAttr, u32 texBaseAddr, u32 pltBaseAddr);

// ---- renderer core (g2d_renderer_core.c)

extern NNSG2dRndCoreInstance *gCurrentRndCore; // between NNS_G2dRndCoreBeginRendering and NNS_G2dRndCoreEndRendering
extern const MtxFx32 gRndCoreIdentityMtx;

void G3_LoadMtx43(const MtxFx43 *m);
void DoAffineTransforme_(const MtxFx22 *pMtx, GXOamAttr *pOam, const NNSG2dFVec2 *pBaseTrans);
void DrawCellToSurface2D_(const NNSG2dRndCoreSurface *pSurface, const NNSG2dCellData *pCell);
void DrawOamToSurface3D_(GXOamAttr *pOam);
void DrawCellToSurface3D_(const NNSG2dRndCoreSurface *pSurface, const NNSG2dCellData *pCell);
void NNS_G2dInitRndCore(NNSG2dRndCoreInstance *pRnd);
void NNS_G2dSetRndCoreImageProxy(NNSG2dRndCoreInstance *pRnd, const NNSG2dImageProxy *pImgProxy, const NNSG2dImagePaletteProxy *pPltProxy);
void NNS_G2dSetRndCoreCurrentMtx3D(const MtxFx32 *pCurrentMxt);
void NNS_G2dSetRndCoreCurrentMtx2D(const MtxFx32 *pCurrentMxt, NNSG2dRndCore2DMtxCache *pMtxCache);
void NNS_G2dSetRndCore3DSoftSpriteZvalue(NNSG2dRndCoreInstance *pRnd, fx32 z);
void NNS_G2dSetRndCoreSurface(NNSG2dRndCoreInstance *pRnd, NNSG2dRndCoreSurface *pSurface);
BOOL NNS_G2dIsRndCoreFlipH(const NNSG2dRndCoreInstance *pRnd);
BOOL NNS_G2dIsRndCoreFlipV(const NNSG2dRndCoreInstance *pRnd);
void NNS_G2dRndCoreBeginRendering(NNSG2dRndCoreInstance *pRnd);
void NNS_G2dRndCoreEndRendering(void);
void NNS_G2dRndCoreDrawCell(const NNSG2dCellData *pCell);
void NNS_G2dRndCoreDrawCellVramTransfer(const NNSG2dCellData *pCell, u32 cellVramTransferHandle);

// ---- fonts (g2d_font.c)

#define G2D_FONT_NO_GLYPH 0xffff

// G2dFontCodeMap.mappingMethod
#define G2D_FONT_MAPPING_DIRECT 0 // index = mapInfo[0] + (code - ccodeBegin)
#define G2D_FONT_MAPPING_TABLE  1 // index = mapInfo[code - ccodeBegin]
#define G2D_FONT_MAPPING_SCAN   2 // mapInfo[0] (code, index) pairs follow, sorted by code

typedef struct G2dCharWidths {
    s8 left;
    u8 glyphWidth;
    s8 charWidth;
} G2dCharWidths;

typedef struct G2dFontWidthBlock {
    u16 indexBegin;
    u16 indexEnd;
    struct G2dFontWidthBlock *pNext;
    G2dCharWidths widthTable[1]; // indexEnd - indexBegin + 1 entries
} G2dFontWidthBlock;

typedef struct G2dFontCodePair {
    u16 ccode;
    u16 index;
} G2dFontCodePair;

typedef struct G2dFontCodeMap {
    u16 ccodeBegin;
    u16 ccodeEnd;
    u16 mappingMethod;
    u16 reserved;
    struct G2dFontCodeMap *pNext;
    u16 mapInfo[1];
} G2dFontCodeMap;

typedef struct G2dFontInfo {
    u8 fontType;
    s8 linefeed;
    u16 alterCharIndex; // glyph drawn for characters the font lacks
    G2dCharWidths defaultWidth;
    u8 encoding;
    void *pGlyph;
    G2dFontWidthBlock *pWidth;
    G2dFontCodeMap *pMap;
} G2dFontInfo;

typedef u16 (*G2dCharSplitFunc)(const void **ppChar);

typedef struct G2dFont {
    G2dFontInfo *pRes;
    G2dCharSplitFunc cbCharSpliter;
} G2dFont;

typedef struct G2dTextRect {
    s32 width;
    s32 height;
} G2dTextRect;

BOOL NNSi_G2dGetUnpackedFont(void *pFontFile, G2dFontInfo **ppFontInfo);
u16 NNSi_G2dSplitCharUTF16(const void **ppChar);
u16 GetGlyphIndex(const G2dFontCodeMap *pMap, u16 c);
void NNS_G2dFontInitUTF16(G2dFont *pFont, void *pFontFile);
u16 NNS_G2dFontFindGlyphIndex(const G2dFont *pFont, u16 c);
const G2dCharWidths *NNS_G2dFontGetCharWidthsFromIndex(const G2dFont *pFont, u16 glyphIndex);
s32 NNSi_G2dFontGetStringWidth(const G2dFont *pFont, s32 hSpace, const void *pStr, const void **ppNextLine);
s32 NNSi_G2dFontGetTextHeight(const G2dFont *pFont, s32 vSpace, const void *pStr);
void NNSi_G2dFontGetTextRect(G2dTextRect *pRect, const G2dFont *pFont, s32 hSpace, s32 vSpace, const void *pStr);

// ---- character canvas helpers (g2d_char_canvas_util.c)

// log2 of the width and height, in characters, of the OBJs an area is split into
typedef struct CharShift {
    int shiftW;
    int shiftH;
} CharShift;

extern const u8 gCharShiftTable[4][4][2];  // [log2 h][log2 w] -> {shift w, shift h} of the largest OBJ
extern const u32 gObjShapeSizeAttrs[4][4]; // [shift h][shift w] -> OBJ shape | size attribute bits

u32 GetCharIndex1D(u32 x, u32 y, int w, int h, CharShift shift);
u32 OBJSizeToShape(const u8 *pShift);
void ClearChar(u32 *pChar, int x, int y, int w, int h, u32 col, int bpp);

// ---- glyph bits -> character data (g2d_char_canvas_letter.c)

typedef struct G2dBitReader {
    const u8 *pData;
    s8 availableBits;
    u8 bits;
} G2dBitReader;

// one character (8x8 pixels) of a glyph drawn at (x, y), which may be partly outside the character
typedef struct GlyphBlitParams {
    u32 *pChar;
    const u8 *pGlyph;
    int x;
    int y;
    int w;
    int h;
    int glyphStride; // bits per glyph row
    int glyphBpp;
    int charBpp;
    u32 colorBase;
} GlyphBlitParams;

u32 NNSi_G2dBitReaderRead(G2dBitReader *pReader, int numBits);
void LetterChar(GlyphBlitParams *pParams);

#endif // POKEHEARTGOLD_NNSYS_G2D_INTERNAL_H
