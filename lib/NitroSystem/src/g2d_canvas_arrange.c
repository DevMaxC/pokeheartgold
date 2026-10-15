#include <nitro.h>
#include <nnsys/g2d_canvas_internal.h>

#pragma force_active on

// fills the screen data of a canvas area with consecutive character numbers; screens wider than
// 32 characters are made of 32x32 blocks
void NNS_G2dMapScrToCharText(u16 *pScrBase, int areaWidth, int areaHeight, int areaLeft, int areaTop, int scnWidth, int charNo, int cplt) {
    if (scnWidth <= 32) {
        NNS_G2dMapScrToChar256x16Pltt(pScrBase + (scnWidth * areaTop + areaLeft), areaWidth, areaHeight, scnWidth, charNo, cplt);
        return;
    }
    {
        int right = areaLeft + areaWidth;
        int bottom = areaTop + areaHeight;
        u16 plttBits = (u16)(cplt << 12);
        for (; areaTop < bottom; areaTop++) {
            int blockY = areaTop < 32 ? areaTop : areaTop + 32;
            int x;
            u16 *pLine = pScrBase + blockY * 32;
            for (x = areaLeft; x < right; x++) {
                int blockX = x < 32 ? x : x + 992;
                pLine[blockX] = charNo++ | plttBits;
            }
        }
    }
}

void NNS_G2dMapScrToChar256x16Pltt(u16 *pScrBase, int areaWidth, int areaHeight, int scnWidth, int charNo, int cplt) {
    struct {
        int y;
        u16 *pScr;
    } v; // a struct for the match (register allocation)

    v.y = 0;
    u16 plttBits = (u16)(cplt << 12);
    for (; v.y < areaHeight; v.y++) {
        v.pScr = pScrBase;
        int x;
        for (x = 0; x < areaWidth; x++) {
            *v.pScr++ = charNo++ | plttBits;
        }
        pScrBase += scnWidth;
    }
}

// number of OBJs NNS_G2dArrangeOBJ1D needs for an area of the given size, in characters
u32 NNSi_G2dCalcRequiredOBJ(u32 areaWidth, u32 areaHeight) {
    const u32 numX8 = areaWidth / 8;
    const u32 numY8 = areaHeight / 8;
    u32 num = 0;
    const u32 numX1or2 = ((areaWidth & 2) >> 1) + (areaWidth & 1);
    const u32 numX4 = (areaWidth & 4) >> 2;
    const u32 numY1or2 = ((areaHeight & 2) >> 1) + (areaHeight & 1);
    const u32 numY4 = (areaHeight & 4) >> 2;
    num += numX8 * numY8;
    num += numY8 * (numX1or2 * 2 + numX4);
    num += numX8 * (numY1or2 * 2 + numY4);
    num += (numX1or2 + numX4) * (numY1or2 + numY4);
    return num;
}

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

// sets up the OBJs that show a canvas drawn in 1D mapping: the area is covered with the largest
// OBJs that fit, the rest recursively; returns the number of OBJs used
int NNS_G2dArrangeOBJ1D(GXOamAttr *pOam, int areaWidth, int areaHeight, int x, int y, int colorMode, int charName, int vramMode) {
    int shiftW = Log2Max3(areaWidth);
    int shiftH = Log2Max3(areaHeight);
    const u8 *pShift = gCharShiftTable[shiftH][shiftW];
    int objShiftW = pShift[0];
    int objShiftH = pShift[1];
    u32 fullWidth = areaWidth & (-1 << objShiftW);
    u32 fullHeight = areaHeight & (-1 << objShiftH);
    int charUnit = (colorMode == 0) ? 1 : 2; // 16 or 256 colours
    int numObjs = 0;
    u32 shapeSize = OBJSizeToShape(pShift);
    int charStep;
    int numX = areaWidth >> objShiftW;
    int numY = areaHeight >> objShiftH;
    charStep = (charUnit << objShiftW) << objShiftH;
    int i, j;
    for (j = 0; j < numY; j++) {
        int objY = y + ((j << objShiftH) << 3);
        for (i = 0; i < numX; i++) {
            int objX = x + ((i << objShiftW) << 3);
            pOam->attr01 = (pOam->attr01 & 0xFE00FF00) | (objY & 0xff) | (((u32)objX << 23) >> 7);
            pOam->attr01 = (pOam->attr01 & 0x3FFF3FFF) | shapeSize;
            pOam->attr2 = (u16)((pOam->attr2 & ~0x3ff) | charName);
            charName += charStep >> vramMode;
            pOam->attr01 = (pOam->attr01 & ~0x2000) | (colorMode << 13);
            pOam++;
        }
    }
    numObjs += numX * numY;
    if (fullWidth < areaWidth) {
        int restWidth = areaWidth - fullWidth;
        int restX = x + fullWidth * 8;
        int num = NNS_G2dArrangeOBJ1D(pOam, restWidth, fullHeight, restX, y, colorMode, charName, vramMode);
        pOam += num;
        charName += (charUnit * restWidth * fullHeight) >> vramMode;
        numObjs += num;
    }
    if (fullHeight < areaHeight) {
        int restHeight = areaHeight - fullHeight;
        int num = NNS_G2dArrangeOBJ1D(pOam, fullWidth, restHeight, x, y + fullHeight * 8, colorMode, charName, vramMode);
        pOam += num;
        charName += (charUnit * fullWidth * restHeight) >> vramMode;
        numObjs += num;
    }
    if (fullWidth < areaWidth && fullHeight < areaHeight) {
        numObjs += NNS_G2dArrangeOBJ1D(pOam, areaWidth - fullWidth, areaHeight - fullHeight, x + fullWidth * 8, y + fullHeight * 8, colorMode, charName, vramMode);
    }
    return numObjs;
}
