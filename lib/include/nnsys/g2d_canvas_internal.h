#ifndef POKEHEARTGOLD_NNSYS_G2D_CANVAS_INTERNAL_H
#define POKEHEARTGOLD_NNSYS_G2D_CANVAS_INTERNAL_H

// Character canvases (text drawn into character data) and text canvases of the NitroSystem 2D
// library (lib/NitroSystem/src/g2d_char_canvas.c, g2d_canvas_arrange.c, g2d_text_canvas.c,
// g2d_font_load.c).

#include <nnsys/g2d_internal.h>

// glyph block of a font resource (G2dFontInfo.pGlyph)
typedef struct G2dFontGlyph {
    u8 cellWidth;  // pixels
    u8 cellHeight; // pixels
    u16 cellSize;  // bytes per glyph
    s8 baselinePos;
    u8 maxCharWidth;
    u8 bpp;
    u8 rotation; // glyph orientation, see NNS_G2dCharCanvasDrawChar
    u8 glyphTable[1];
} G2dFontGlyph;

typedef struct G2dGlyph {
    const G2dCharWidths *pWidths;
    const u8 *pImage;
} G2dGlyph;

struct G2dCharCanvas;

typedef void (*G2dCharCanvasDrawGlyphFunc)(const struct G2dCharCanvas *pCC, const G2dFont *pFont, int x, int y, int color, const G2dGlyph *pGlyph);
typedef void (*G2dCharCanvasClearFunc)(const struct G2dCharCanvas *pCC, u32 color);
typedef void (*G2dCharCanvasClearAreaFunc)(const struct G2dCharCanvas *pCC, u32 color, int x, int y, int w, int h);

typedef struct G2dCharCanvasVTable {
    G2dCharCanvasDrawGlyphFunc pDrawGlyph;
    G2dCharCanvasClearFunc pClear;
    G2dCharCanvasClearAreaFunc pClearArea;
} G2dCharCanvasVTable;

// how the characters of a canvas that is drawn with OBJs (1D mapping) are grouped
typedef struct CharCanvasObj1DParam {
    u32 shiftW : 8; // log2 of the width, in characters, of the largest OBJ
    u32 shiftH : 8; // log2 of its height
    u32 padding : 16;
} CharCanvasObj1DParam;

typedef union G2dCharCanvasParam {
    int lineWidth; // characters per line of the character data (BG layout)
    CharCanvasObj1DParam obj1D;
} G2dCharCanvasParam;

typedef struct G2dCharCanvas {
    u8 *pCharBase;
    int areaWidth;  // characters
    int areaHeight; // characters
    u8 dstBpp;
    u8 padding[3];
    G2dCharCanvasParam param;
    const G2dCharCanvasVTable *vtable;
} G2dCharCanvas;

// direction of a text: unit step of the next character (the next line goes 90 degrees clockwise)
typedef struct G2dTextDirection {
    s8 x;
    s8 y;
} G2dTextDirection;

typedef struct G2dTextCanvas {
    G2dCharCanvas *pCanvas;
    const G2dFont *pFont;
    int hSpace;
    int vSpace;
} G2dTextCanvas;

// position flags of NNSi_G2dTextCanvasDrawText / DrawTextRect / DrawTextAlign
#define TEXT_ORIGIN_VCENTER (1 << 1)  // (x, y) is the vertical centre of the text
#define TEXT_ORIGIN_BOTTOM  (1 << 2)  // (x, y) is the bottom of the text
#define TEXT_ORIGIN_HCENTER (1 << 4)  // (x, y) is the horizontal centre of the text
#define TEXT_ORIGIN_RIGHT   (1 << 5)  // (x, y) is the right end of the text
#define TEXT_RECT_VCENTER   (1 << 7)  // centred vertically in the rectangle
#define TEXT_RECT_BOTTOM    (1 << 8)  // at the bottom of the rectangle
#define TEXT_LINE_HCENTER   (1 << 10) // every line centred in the text width
#define TEXT_LINE_RIGHT     (1 << 11) // every line aligned right in the text width

extern const G2dCharCanvasVTable gCharCanvasVTableBG;
extern const G2dCharCanvasVTable gCharCanvasVTableObj1D;

void DrawGlyphLine(const G2dCharCanvas *pCC, const G2dFont *pFont, int x, int y, int color, const G2dGlyph *pGlyph);
void DrawGlyph1D(const G2dCharCanvas *pCC, const G2dFont *pFont, int x, int y, int color, const G2dGlyph *pGlyph);
void ClearContinuous(const G2dCharCanvas *pCC, u32 color);
void ClearLine(const G2dCharCanvas *pCC, u32 color);
void ClearAreaLine(const G2dCharCanvas *pCC, u32 color, int x, int y, int w, int h);
void ClearArea1D(const G2dCharCanvas *pCC, u32 color, int x, int y, int w, int h);
void InitCharCanvas(G2dCharCanvas *pCC, void *pCharBase, int areaWidth, int areaHeight, int dstBpp, const G2dCharCanvasVTable *vtable, int param); // param: G2dCharCanvasParam
int NNS_G2dCharCanvasDrawChar(const G2dCharCanvas *pCC, const G2dFont *pFont, int x, int y, int color, u16 ccode);
void NNS_G2dCharCanvasInitForBG(G2dCharCanvas *pCC, void *pCharBase, int areaWidth, int areaHeight, int dstBpp);
void NNS_G2dCharCanvasInitForOBJ1D(G2dCharCanvas *pCC, void *pCharBase, int areaWidth, int areaHeight, int dstBpp);
void NNS_G2dMapScrToCharText(u16 *pScrBase, int areaWidth, int areaHeight, int areaLeft, int areaTop, int scnWidth, int charNo, int cplt);
void NNS_G2dMapScrToChar256x16Pltt(u16 *pScrBase, int areaWidth, int areaHeight, int scnWidth, int charNo, int cplt);
u32 NNSi_G2dCalcRequiredOBJ(u32 areaWidth, u32 areaHeight);
int NNS_G2dArrangeOBJ1D(GXOamAttr *pOam, int areaWidth, int areaHeight, int x, int y, int colorMode, int charName, int vramMode);
void NNSi_G2dTextCanvasDrawString(const G2dTextCanvas *pTxn, int x, int y, int color, const void *pStr, const void **ppNext, G2dTextDirection dir);
void NNSi_G2dTextCanvasDrawTextAlign(const G2dTextCanvas *pTxn, int x, int y, int width, int color, u32 flags, const void *pTxt, G2dTextDirection dir);
void NNSi_G2dTextCanvasDrawText(const G2dTextCanvas *pTxn, int x, int y, int color, u32 flags, const void *pTxt, G2dTextDirection dir);
void NNSi_G2dTextCanvasDrawTextRect(const G2dTextCanvas *pTxn, int x, int y, int w, int h, int color, u32 flags, const void *pTxt, G2dTextDirection dir);
void NNSi_G2dUnpackNFT(G2dBinaryFileHeader *pHeader);

#endif // POKEHEARTGOLD_NNSYS_G2D_CANVAS_INTERNAL_H
