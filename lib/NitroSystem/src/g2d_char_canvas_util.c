#include <nitro.h>
#include <nnsys/g2d_internal.h>

#pragma force_active on

// clang-format off
static inline u32 CountLeadingZeros(u32 x) {
    asm { clz x, x }
    return x;
}
// clang-format on

// log2 of a size in characters, at most 3
#define LOG2_CHARS(n) (((n) >= 8) ? 3 : (int)(31 - CountLeadingZeros((u32)(n))))

static inline const u8 *GetCharShiftEntry(int numCharsW, int numCharsH) {
    int shiftW = LOG2_CHARS(numCharsW);
    int shiftH = LOG2_CHARS(numCharsH);
    return gCharShiftTable[shiftH][shiftW];
}

// index of character (x, y) in an area of w x h characters laid out as 1D-mapped OBJs: the area is
// split into the largest OBJs that fit, row block by row block
u32 GetCharIndex1D(u32 x, u32 y, int w, int h, CharShift shift) {
    int index = 0;
    int ones;
    int shiftH;
    u32 objAreaW;
    int shiftW;
    shiftW = shift.shiftW;
    shiftH = shift.shiftH;
    for (;;) {
        ones = -1;
        objAreaW = w & (ones << shiftW);
        int objAreaH = h & (-1 << shiftH);
        if (objAreaH <= y) {
            index += w * objAreaH;
            if (objAreaW <= x) {
                h -= objAreaH;
                index += objAreaW * h;
                x -= objAreaW;
                y -= objAreaH;
                w -= objAreaW;
            } else {
                y -= objAreaH;
                w = objAreaW;
                h -= objAreaH;
            }
        } else {
            h = ~(-1 << shiftH);
            if (objAreaW <= x) {
                h = objAreaH;
                index += objAreaW * objAreaH;
                x -= objAreaW;
                w -= objAreaW;
            } else {
                int lowMaskW = ~(-1 << shiftW);
                index += objAreaW * ((-1 << shiftH) & y);
                index += ((-1 << shiftW) & x) << shiftH;
                index += (y & h) << shiftW;
                return index + (x & lowMaskW);
            }
        }
        {
            const u8 *entry = GetCharShiftEntry(w, h);
            shiftW = entry[0];
            shiftH = entry[1];
        }
        shift.shiftW = shiftW;
        shift.shiftH = shiftH;
    }
}

// OBJ shape and size attribute bits for an OBJ of (1 << shift.w) x (1 << shift.h) characters
u32 OBJSizeToShape(const u8 *pShift) {
    return gObjShapeSizeAttrs[pShift[1]][pShift[0]];
}

// fills the w x h pixel rectangle at (x, y) of one character with the colour pattern col
void ClearChar(u32 *pChar, int x, int y, int w, int h, u32 col, int bpp) {
    if (w == 8 && h == 8) {
        MIi_CpuClearFast(col, pChar, bpp * 8);
    } else if (bpp == 4) {
        const int s = x * 4;
        const int e = 32 - (s + w * 4);
        const u32 mask = ((0xFFFFFFFFu >> s) << (e + x * 4)) >> e;
        u32 *p = pChar + y;
        const u32 value = col & mask;
        const u32 keep = ~mask;
        u32 *end = p + h;
        for (; p < end; p++) {
            *p = (*p & keep) | value;
        }
    } else {
        u32 lo, hi;
        u32 s = x * 8;
        u32 e = 64 - (s + w * 8);
        lo = 0xFFFFFFFFu >> s;
        if (e < 32) {
            lo <<= s;
        } else {
            u32 t = e - 32;
            lo = (lo << (s + t)) >> t;
        }
        hi = 0xFFFFFFFFu << e;
        if (s < 32) {
            hi >>= e;
        } else {
            u32 t = s - 32;
            hi = (hi >> (t + e)) << t;
        }
        {
            const u32 value0 = col & lo;
            const u32 value1 = col & hi;
            u32 *p = pChar + y * 2;
            u32 *end = p + h * 2;
            const u32 keep0 = ~lo;
            const u32 keep1 = ~hi;
            for (; p < end; p += 2) {
                p[0] = (p[0] & keep0) | value0;
                p[1] = (p[1] & keep1) | value1;
            }
        }
    }
}

#pragma force_active off
