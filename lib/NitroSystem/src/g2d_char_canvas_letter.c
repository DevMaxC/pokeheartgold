#include <nitro.h>
#include <nnsys/g2d_internal.h>

#pragma force_active on

// draws one character worth of glyph bits into a character, skipping colour 0
void LetterChar(GlyphBlitParams *pParams) {
    int x;
    int y;
    int ny;
    u32 left;
    int bitpos;
    u32 pal8;
    int top;
    u32 right;
    int bottom;
    const u8 *src;
    u32 v0;
    int bpp;
    u32 c;
    int stride;
    u32 v1;
    u32 *p;
    int bits;
    u32 i;
    u32 pal4;
    u32 v;
    u32 *end;
    x = pParams->x;
    y = pParams->y;
    left = x >= 0 ? x : 0;
    top = y >= 0 ? y : 0;
    right = x + pParams->w < 8 ? x + pParams->w : 8;
    bottom = y + pParams->h < 8 ? y + pParams->h : 8;
    y = y > 0 ? 0 : y;
    ny = -y;
    x = x > 0 ? 0 : x;
    bits = pParams->glyphBpp;
    stride = pParams->glyphStride;
    bitpos = ny * stride;
    bitpos += bits * (-x);
    bpp = pParams->charBpp;
    left *= bpp;
    right *= bpp;
    src = pParams->pGlyph;
    if (bpp == 4) {
        pal4 = pParams->colorBase;
        p = pParams->pChar + top;
        end = pParams->pChar + bottom;
        for (; p < end; p++) {
            G2dBitReader r;
            v = *p;
            r.pData = src + ((u32)bitpos >> 3);
            r.availableBits = 0;
            r.bits = 0;
            NNSi_G2dBitReaderRead(&r, bitpos % 8);
            for (i = left; i < right; i += 4) {
                c = NNSi_G2dBitReaderRead(&r, bits);
                if (c != 0) {
                    v = (v & ~(0xF << i)) | ((pal4 + c) << i);
                }
            }
            *p = v;
            bitpos += stride;
        }
    } else {
        pal8 = pParams->colorBase;
        end = pParams->pChar + bottom * 2;
        p = pParams->pChar + top * 2;
        for (; p < end; p += 2) {
            G2dBitReader r;
            v0 = p[0];
            v1 = p[1];
            r.pData = src + ((u32)bitpos >> 3);
            r.availableBits = 0;
            r.bits = 0;
            NNSi_G2dBitReaderRead(&r, bitpos % 8);
            for (i = left; i < right; i += 8) {
                c = NNSi_G2dBitReaderRead(&r, bits);
                if (c != 0) {
                    if (i < 32) {
                        v0 = (v0 & ~(0xFF << i)) | ((pal8 + c) << i);
                    } else {
                        v1 = (v1 & ~(0xFF << (i - 32))) | ((pal8 + c) << (i - 32));
                    }
                }
            }
            p[0] = v0;
            p[1] = v1;
            bitpos += stride;
        }
    }
}

#pragma force_active off
