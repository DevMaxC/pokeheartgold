#include <nitro.h>
#include <nnsys/g2d_canvas_internal.h>

#define CHAR_SIZE(bpp) ((bpp) * 8 * 8 / 8) // bytes of one character

// GetCharIndex1D called with its CharShift argument as two ints (same calling convention; needed for the match)
#define GetCharIndex1DInts(x, y, w, h, shiftW, shiftH) (((u32(*)(u32, u32, int, int, int, int))GetCharIndex1D)((x), (y), (w), (h), (shiftW), (shiftH)))

static inline const G2dFontGlyph *GetFontGlyph(const G2dFont *pFont) {
    return pFont->pRes->pGlyph;
}

#pragma force_active on

// draws a glyph into a canvas whose characters are laid out in lines (BG layout)
void DrawGlyphLine(const G2dCharCanvas *pCC, const G2dFont *pFont, int x, int y, int color, const G2dGlyph *pGlyph) {
    const int charSize = CHAR_SIZE(pCC->dstBpp);
    const u32 areaWidth = pCC->areaWidth;
    const u32 areaHeight = pCC->areaHeight;
    u8 *const pCharBase = pCC->pCharBase;
    const int glyphWidth = pGlyph->pWidths->glyphWidth;
    const int glyphHeight = GetFontGlyph(pFont)->cellHeight;
    int cx;
    int numCharsY;
    int lineSkip;
    int xEnd;
    int yEnd;
    int top;
    int right;
    int left;
    int numCharsX;
    u8 *pChar;
    int bottom;
    GlyphBlitParams params;
    if (glyphWidth == 0) {
        return;
    }
    if (x + glyphWidth < 0) {
        return;
    }
    if (y + glyphHeight < 0) {
        return;
    }
    left = x <= 0 ? 0 : (u32)x >> 3;
    top = y <= 0 ? 0 : (u32)y >> 3;
    right = (u32)(x + glyphWidth + 7) >> 3;
    if (areaWidth <= (u32)right) {
        right = areaWidth;
    }
    bottom = (u32)(y + glyphHeight + 7) >> 3;
    if (areaHeight <= (u32)bottom) {
        bottom = areaHeight;
    }
    numCharsX = right - left;
    numCharsY = bottom - top;
    if (numCharsX < 0) {
        return;
    }
    if (numCharsY < 0) {
        return;
    }
    lineSkip = charSize * (pCC->param.lineWidth - numCharsX);
    pChar = pCharBase + charSize * (pCC->param.lineWidth * top + left);
    if (x >= 0) {
        x &= 7;
    }
    if (y >= 0) {
        y &= 7;
    }
    xEnd = x - numCharsX * 8;
    yEnd = y - numCharsY * 8;
    params.pGlyph = pGlyph->pImage;
    params.w = glyphWidth;
    params.colorBase = color - 1;
    params.h = glyphHeight;
    params.glyphBpp = GetFontGlyph(pFont)->bpp;
    params.charBpp = pCC->dstBpp;
    params.glyphStride = params.glyphBpp * GetFontGlyph(pFont)->cellWidth;
    for (; y > yEnd; y -= 8) {
        params.y = y;
        for (cx = x; cx > xEnd; cx -= 8) {
            params.pChar = (u32 *)pChar;
            params.x = cx;
            LetterChar(&params);
            pChar += charSize;
        }
        pChar += lineSkip;
    }
}

// draws a glyph into a canvas drawn with OBJs in 1D mapping
void DrawGlyph1D(const G2dCharCanvas *pCC, const G2dFont *pFont, int x, int y, int color, const G2dGlyph *pGlyph) {
    int px;
    int right;
    int numCharsY;
    int xEnd;
    const u32 areaWidth = pCC->areaWidth;
    int bottom;
    int left;
    int cx;
    u8 *pCharBase;
    u32 cy;
    int shiftH;
    int shiftW;
    int yEnd;
    int numCharsX;
    const int charSize = CHAR_SIZE(pCC->dstBpp);
    const u32 areaHeight = pCC->areaHeight;
    const int glyphWidth = pGlyph->pWidths->glyphWidth;
    const int glyphHeight = GetFontGlyph(pFont)->cellHeight;
    GlyphBlitParams params;
    if (glyphWidth == 0) {
        return;
    }
    if (x + glyphWidth < 0) {
        return;
    }
    if (y + glyphHeight < 0) {
        return;
    }
    left = x <= 0 ? 0 : (u32)x >> 3;
    cy = y <= 0 ? 0 : (u32)y >> 3;
    right = (u32)(x + glyphWidth + 7) >> 3;
    if (areaWidth <= (u32)right) {
        right = areaWidth;
    }
    bottom = (u32)(y + glyphHeight + 7) >> 3;
    if (areaHeight <= (u32)bottom) {
        bottom = areaHeight;
    }
    numCharsX = right - left;
    numCharsY = bottom - cy;
    if (numCharsX < 0) {
        return;
    }
    if (numCharsY < 0) {
        return;
    }
    pCharBase = pCC->pCharBase;
    if (x >= 0) {
        x &= 7;
    }
    if (y >= 0) {
        y &= 7;
    }
    xEnd = x - numCharsX * 8;
    yEnd = y - numCharsY * 8;
    params.pGlyph = pGlyph->pImage;
    params.w = glyphWidth;
    params.colorBase = color - 1;
    params.h = glyphHeight;
    params.glyphBpp = GetFontGlyph(pFont)->bpp;
    params.charBpp = pCC->dstBpp;
    params.glyphStride = params.glyphBpp * GetFontGlyph(pFont)->cellWidth;
    {
        const CharCanvasObj1DParam obj1D = pCC->param.obj1D;
        const int w = pCC->areaWidth;
        const int h = pCC->areaHeight;
        shiftW = obj1D.shiftW;
        shiftH = obj1D.shiftH;
        for (; y > yEnd; y -= 8) {
            params.y = y;
            for (cx = left, px = x; px > xEnd; px -= 8) {
                {
                    int index = GetCharIndex1DInts(cx, cy, w, h, shiftW, shiftH);
                    params.pChar = (u32 *)(pCharBase + index * charSize);
                }
                params.x = px;
                LetterChar(&params);
                cx++;
            }
            cy++;
        }
    }
}

// fills a colour index into every pixel of a 32-bit word
static inline u32 ExpandColor(u32 color, int bpp) {
    if (bpp == 4) {
        color |= color << 4;
        color |= color << 8;
        color |= color << 16;
    } else {
        color |= color << 8;
        color |= color << 16;
    }
    return color;
}

// clears a canvas whose characters are contiguous
void ClearContinuous(const G2dCharCanvas *pCC, u32 color) {
    color = ExpandColor(color, pCC->dstBpp);
    MI_CpuFillFast(pCC->pCharBase, (int)color, pCC->areaWidth * pCC->areaHeight * CHAR_SIZE(pCC->dstBpp));
}

// clears a canvas whose characters are laid out in lines (BG layout)
void ClearLine(const G2dCharCanvas *pCC, u32 color) {
    int i;
    u8 *pLine;
    color = ExpandColor(color, pCC->dstBpp);
    {
        const int charSize = CHAR_SIZE(pCC->dstBpp);
        const int lineStep = charSize * pCC->param.lineWidth;
        const int lineSize = charSize * pCC->areaWidth;
        for (i = 0, pLine = pCC->pCharBase; i < pCC->areaHeight; i++) {
            MI_CpuFillFast(pLine, (int)color, lineSize);
            pLine += lineStep;
        }
    }
}

void ClearAreaLine(const G2dCharCanvas *pCC, u32 color, int x, int y, int w, int h) {
    int cy;
    int cx;
    int charH;
    const int bpp = pCC->dstBpp;
    const int x1 = x + w;
    const int y1 = y + h;
    color = ExpandColor(color, bpp);
    {
        const int charSize = CHAR_SIZE(bpp);
        cy = y & ~7;
        const int cx0 = x & ~7;
        const int cx1 = (x1 + 7) & ~7;
        const int cy1 = (y1 + 7) & ~7;
        u8 *pLine = pCC->pCharBase + charSize * ((cy / 8) * pCC->param.lineWidth + cx0 / 8);
        const int lineStep = pCC->param.lineWidth * charSize;
        for (; cy < cy1; cy += 8) {
            const int top = (cy < y) ? y - cy : 0;
            int bottom = y1 - cy;
            u8 *pChar = pLine;
            if (bottom > 8) {
                bottom = 8;
            }
            charH = bottom - top;
            for (cx = cx0; cx < cx1; cx += 8) {
                const int left = (cx < x) ? x - cx : 0;
                int right = x1 - cx;
                if (right > 8) {
                    right = 8;
                }
                ClearChar((u32 *)pChar, left, top, right - left, charH, color, bpp);
                pChar += charSize;
            }
            pLine += lineStep;
        }
    }
}

void ClearArea1D(const G2dCharCanvas *pCC, u32 color, int x, int y, int w, int h) {
    int cy;
    int cx;
    int x1;
    int charH;
    int charX;
    int y1;
    int cy1;
    u8 *pCharBase;
    int charX0;
    int cx0;
    CharCanvasObj1DParam obj1D;
    int cx1;
    int shiftH;
    int shiftW;
    int areaHeight;
    int areaWidth;
    int charSize;
    int index;
    int charY;
    int top;
    int bottom;
    int left;
    u8 bpp;
    int right;
    bpp = pCC->dstBpp;
    x1 = x + w;
    y1 = y + h;
    if (bpp == 4) { // ExpandColor, written out (needed for the match)
        color |= color << 4;
        color |= color << 8;
        color |= color << 16;
    } else {
        color |= color << 8;
        color |= color << 16;
    }
    cx0 = x & ~7;
    cy = y & ~7;
    cy1 = (y1 + 7) & ~7;
    charSize = CHAR_SIZE(pCC->dstBpp);
    charX0 = cx0 / 8;
    charY = cy / 8;
    obj1D = pCC->param.obj1D;
    cx1 = (x1 + 7) & ~7;
    areaWidth = pCC->areaWidth;
    areaHeight = pCC->areaHeight;
    pCharBase = pCC->pCharBase;
    shiftW = obj1D.shiftW;
    shiftH = obj1D.shiftH;
    for (; cy < cy1; cy += 8) {
        top = (cy < y) ? y - cy : 0;
        bottom = y1 - cy;
        if (bottom > 8) {
            bottom = 8;
        }
        charH = bottom - top;
        for (cx = cx0, charX = charX0; cx < cx1; cx += 8) {
            index = GetCharIndex1DInts(charX, charY, areaWidth, areaHeight, shiftW, shiftH);
            left = (cx < x) ? x - cx : 0;
            right = x1 - cx;
            if (right > 8) {
                right = 8;
            }
            ClearChar((u32 *)(pCharBase + charSize * index), left, top, right - left, charH, color, bpp);
            charX++;
        }
        charY++;
    }
}

void InitCharCanvas(G2dCharCanvas *pCC, void *pCharBase, int areaWidth, int areaHeight, int dstBpp, const G2dCharCanvasVTable *vtable, int param) {
    pCC->areaWidth = areaWidth;
    pCC->areaHeight = areaHeight;
    pCC->dstBpp = dstBpp;
    pCC->pCharBase = pCharBase;
    pCC->vtable = vtable;
    pCC->param.lineWidth = param;
}

// draws one character; returns its advance width
int NNS_G2dCharCanvasDrawChar(const G2dCharCanvas *pCC, const G2dFont *pFont, int x, int y, int color, u16 ccode) {
    u16 glyphIndex = NNS_G2dFontFindGlyphIndex(pFont, ccode);
    G2dGlyph glyph;
    if (glyphIndex == G2D_FONT_NO_GLYPH) {
        glyphIndex = pFont->pRes->alterCharIndex;
    }
    glyph.pWidths = NNS_G2dFontGetCharWidthsFromIndex(pFont, glyphIndex);
    glyph.pImage = GetFontGlyph(pFont)->glyphTable + glyphIndex * GetFontGlyph(pFont)->cellSize;
    switch (GetFontGlyph(pFont)->rotation) {
    case 0:
    case 7:
        x += glyph.pWidths->left;
        break;
    case 1:
    case 2:
        x -= GetFontGlyph(pFont)->cellWidth;
        y += glyph.pWidths->left;
        break;
    case 3:
    case 4:
        x -= glyph.pWidths->left + glyph.pWidths->glyphWidth;
        y -= GetFontGlyph(pFont)->cellHeight;
        break;
    case 5:
    case 6:
        y -= glyph.pWidths->left + GetFontGlyph(pFont)->cellHeight;
        break;
    }
    pCC->vtable->pDrawGlyph(pCC, pFont, x, y, color, &glyph);
    return glyph.pWidths->charWidth;
}

#pragma force_active off

void NNS_G2dCharCanvasInitForBG(G2dCharCanvas *pCC, void *pCharBase, int areaWidth, int areaHeight, int dstBpp) {
    InitCharCanvas(pCC, pCharBase, areaWidth, areaHeight, dstBpp, &gCharCanvasVTableBG, areaWidth);
}

#pragma force_active on

// clang-format off
static inline u32 CountLeadingZeros(u32 x) {
    asm { clz x, x }
    return x;
}
// clang-format on

// log2 of n, at most 3
static inline int Log2Max3(int n) {
    return (n >= 8) ? 3 : (int)(31 - CountLeadingZeros((u32)n));
}

void NNS_G2dCharCanvasInitForOBJ1D(G2dCharCanvas *pCC, void *pCharBase, int areaWidth, int areaHeight, int dstBpp) {
    G2dCharCanvasParam param;
    int shiftW = Log2Max3(areaWidth);
    int shiftH = Log2Max3(areaHeight);
    const u8 *pShift = gCharShiftTable[shiftH][shiftW];
    param.obj1D.shiftW = pShift[0];
    param.obj1D.shiftH = pShift[1];
    InitCharCanvas(pCC, pCharBase, areaWidth, areaHeight, dstBpp, &gCharCanvasVTableObj1D, param.lineWidth);
}
