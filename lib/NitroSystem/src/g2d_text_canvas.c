#include <nitro.h>
#include <nnsys/g2d_canvas_internal.h>

#pragma force_active on

// draws one line of a string; *ppNext gets the start of the next line, or NULL at the end of the string
void NNSi_G2dTextCanvasDrawString(const G2dTextCanvas *pTxn, int x, int y, int color, const void *pStr, const void **ppNext, G2dTextDirection dir) {
    const void *pPos;
    int hSpace;
    const G2dFont *pFont;
    G2dCharSplitFunc splitChar;
    int advance;
    u16 c;
    int dx;
    int dy;
    hSpace = pTxn->hSpace;
    pFont = pTxn->pFont;
    pPos = pStr;
    dy = dir.y;
    splitChar = pFont->cbCharSpliter;
    c = splitChar(&pPos);
    if (c != 0) {
        dx = dir.x;
        do {
            if (c == '\n') {
                break;
            }
            advance = hSpace + NNS_G2dCharCanvasDrawChar(pTxn->pCanvas, pFont, x, y, color, c);
            x += advance * dx;
            y += advance * dy;
            c = splitChar(&pPos);
        } while (c != 0);
    }
    if (ppNext) {
        *ppNext = (c == '\n') ? pPos : NULL;
    }
}

// draws a text line by line, aligning every line in the given width (TEXT_LINE_*)
void NNSi_G2dTextCanvasDrawTextAlign(const G2dTextCanvas *pTxn, int x, int y, int width, int color, u32 flags, const void *pTxt, G2dTextDirection dir) {
    int lineFeed = pTxn->vSpace + pTxn->pFont->pRes->linefeed;
    int lineDx = lineFeed * -dir.y, lineDy = lineFeed * dir.x;
    const void *pLine = pTxt;
    int lineX;
    int lineY;
    int offsetX;
    int offsetY;
    if (!pLine) {
        return;
    }
    offsetX = 0;
    offsetY = 0;
    do {
        lineX = x + offsetX;
        lineY = y + offsetY;
        if (flags & TEXT_LINE_RIGHT) {
            int shift = width - NNSi_G2dFontGetStringWidth(pTxn->pFont, pTxn->hSpace, pLine, NULL);
            lineX += shift * dir.x;
            lineY += shift * dir.y;
        } else if (flags & TEXT_LINE_HCENTER) {
            int shift = (width + 1) / 2 - (NNSi_G2dFontGetStringWidth(pTxn->pFont, pTxn->hSpace, pLine, NULL) + 1) / 2;
            lineX += shift * dir.x;
            lineY += shift * dir.y;
        }
        NNSi_G2dTextCanvasDrawString(pTxn, lineX, lineY, color, pLine, &pLine, dir);
        offsetX += lineDx;
        offsetY += lineDy;
    } while (pLine);
}

// NNSi_G2dFontGetTextRect called as a function that returns the rectangle (same calling convention:
// the result goes through a hidden first argument); the copies this makes are needed for the match
#define FontGetTextRectRet(pFont, hSpace, vSpace, pTxt) (((G2dTextRect(*)(const G2dFont *, int, int, const void *))NNSi_G2dFontGetTextRect)((pFont), (hSpace), (vSpace), (pTxt)))

static inline G2dTextRect GetTextRect(const G2dTextCanvas *pTxn, const void *pTxt) {
    G2dTextRect rect = FontGetTextRectRet(pTxn->pFont, pTxn->hSpace, pTxn->vSpace, pTxt);
    return rect;
}

// draws a text whose origin (x, y) is given by flags (TEXT_ORIGIN_*)
void NNSi_G2dTextCanvasDrawText(const G2dTextCanvas *pTxn, int x, int y, int color, u32 flags, const void *pTxt, G2dTextDirection dir) {
    G2dTextRect rect = GetTextRect(pTxn, pTxt);
    if (flags & TEXT_ORIGIN_HCENTER) {
        int d = -(rect.width + 1) / 2;
        x += d * dir.x;
        y += d * dir.y;
    } else if (flags & TEXT_ORIGIN_RIGHT) {
        int d = -rect.width;
        x += d * dir.x;
        y += d * dir.y;
    }
    if (flags & TEXT_ORIGIN_VCENTER) {
        int d = -(rect.height + 1) / 2;
        x += d * -dir.y;
        y += d * dir.x;
    } else if (flags & TEXT_ORIGIN_BOTTOM) {
        int d = -rect.height;
        x += d * -dir.y;
        y += d * dir.x;
    }
    NNSi_G2dTextCanvasDrawTextAlign(pTxn, x, y, rect.width, color, flags, pTxt, dir);
}

// draws a text in a rectangle, placed vertically by flags (TEXT_RECT_*)
void NNSi_G2dTextCanvasDrawTextRect(const G2dTextCanvas *pTxn, int x, int y, int w, int h, int color, u32 flags, const void *pTxt, G2dTextDirection dir) {
    if (flags & TEXT_RECT_BOTTOM) {
        int d = h - NNSi_G2dFontGetTextHeight(pTxn->pFont, pTxn->vSpace, pTxt);
        x += d * -dir.y;
        y += d * dir.x;
    } else if (flags & TEXT_RECT_VCENTER) {
        int d = (h + 1) / 2 - (NNSi_G2dFontGetTextHeight(pTxn->pFont, pTxn->vSpace, pTxt) + 1) / 2;
        x += d * -dir.y;
        y += d * dir.x;
    }
    NNSi_G2dTextCanvasDrawTextAlign(pTxn, x, y, w, color, flags, pTxt, dir);
}
