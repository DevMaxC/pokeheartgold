#include <nitro.h>
#include <nnsys/g2d_internal.h>

#pragma force_active on

// glyph index of character code c in one code map block
u16 GetGlyphIndex(const G2dFontCodeMap *pMap, u16 c) {
    u16 index = G2D_FONT_NO_GLYPH;
    switch (pMap->mappingMethod) {
    case G2D_FONT_MAPPING_DIRECT: {
        int offset = c - pMap->ccodeBegin;
        index = pMap->mapInfo[0] + offset;
    } break;
    case G2D_FONT_MAPPING_TABLE: {
        u32 offset = c - pMap->ccodeBegin;
        index = pMap->mapInfo[offset];
        break;
    }
    case G2D_FONT_MAPPING_SCAN: {
        // mapInfo[0]: number of (code, index) pairs, sorted by code
        const G2dFontCodePair *lo = (const G2dFontCodePair *)&pMap->mapInfo[1];
        const G2dFontCodePair *hi = lo + (pMap->mapInfo[0] - 1);
        while (lo <= hi) {
            const G2dFontCodePair *mid = lo + (hi - lo) / 2;
            if (mid->ccode < c) {
                lo = mid + 1;
            } else if (c < mid->ccode) {
                hi = mid - 1;
            } else {
                index = mid->index;
                break;
            }
        }
        break;
    }
    }
    return index;
}

void NNS_G2dFontInitUTF16(G2dFont *pFont, void *pFontFile) {
    NNSi_G2dGetUnpackedFont(pFontFile, &pFont->pRes);
    pFont->cbCharSpliter = NNSi_G2dSplitCharUTF16;
}

u16 NNS_G2dFontFindGlyphIndex(const G2dFont *pFont, u16 c) {
    const G2dFontCodeMap *pMap = pFont->pRes->pMap;
    while (pMap) {
        if (pMap->ccodeBegin <= c && c <= pMap->ccodeEnd) {
            return GetGlyphIndex(pMap, c);
        }
        pMap = pMap->pNext;
    }
    return G2D_FONT_NO_GLYPH;
}

const G2dCharWidths *NNS_G2dFontGetCharWidthsFromIndex(const G2dFont *pFont, u16 glyphIndex) {
    const G2dFontWidthBlock *pBlock;
    const G2dFontInfo *pInfo = pFont->pRes;
    pBlock = pInfo->pWidth;
    while (pBlock) {
        if (pBlock->indexBegin <= glyphIndex && glyphIndex <= pBlock->indexEnd) {
            return &pBlock->widthTable[glyphIndex - pBlock->indexBegin];
        }
        pBlock = pBlock->pNext;
    }
    return &pInfo->defaultWidth;
}

// width of the line that starts at pStr; *ppNextLine: start of the next line, or NULL
s32 NNSi_G2dFontGetStringWidth(const G2dFont *pFont, s32 hSpace, const void *pStr, const void **ppNextLine) {
    const void *pos = pStr;
    s32 width = 0;
    G2dCharSplitFunc splitChar = pFont->cbCharSpliter;
    u16 c = splitChar(&pos);
    while (c) {
        if (c == '\n') {
            break;
        }
        u16 glyphIndex = NNS_G2dFontFindGlyphIndex(pFont, c);
        if (glyphIndex == G2D_FONT_NO_GLYPH) {
            glyphIndex = pFont->pRes->alterCharIndex;
        }
        const G2dCharWidths *pWidths = NNS_G2dFontGetCharWidthsFromIndex(pFont, glyphIndex);
        width += hSpace + pWidths->charWidth;
        c = splitChar(&pos);
    }
    if (ppNextLine) {
        *ppNextLine = (c == '\n') ? pos : NULL;
    }
    if (width > 0) {
        width -= hSpace;
    }
    return width;
}

s32 NNSi_G2dFontGetTextHeight(const G2dFont *pFont, s32 vSpace, const void *pStr) {
    const void *pos = pStr;
    G2dTextRect rect = { 0, 0 }; // unused: needed for the match
    s32 lines = 1;
    G2dCharSplitFunc splitChar = pFont->cbCharSpliter;
    u16 c = splitChar(&pos);
    while (c) {
        if (c == '\n') {
            lines++;
        }
        c = splitChar(&pos);
    }
    return lines * (vSpace + pFont->pRes->linefeed) - vSpace;
}

void NNSi_G2dFontGetTextRect(G2dTextRect *pRect, const G2dFont *pFont, s32 hSpace, s32 vSpace, const void *pStr) {
    G2dTextRect rect = { 0, 0 };
    s32 lines = 1;
    if (pStr) {
        do {
            s32 width = NNSi_G2dFontGetStringWidth(pFont, hSpace, pStr, &pStr);
            if (width > rect.width) {
                rect.width = width;
            }
            lines++;
        } while (pStr);
    }
    rect.height = (lines - 1) * (vSpace + pFont->pRes->linefeed) - vSpace;
    *pRect = rect;
}

#pragma force_active off
