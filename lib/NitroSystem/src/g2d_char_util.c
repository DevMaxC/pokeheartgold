#include <nitro.h>
#include <nnsys/g2d_internal.h>

// reads the next numBits bits (at most 8) of a glyph bitmap, most significant bit first
u32 NNSi_G2dBitReaderRead(G2dBitReader *pReader, int numBits) {
    int availableBits = pReader->availableBits;
    u8 bits = pReader->bits;
    u32 value;
    if (availableBits < numBits) {
        const u8 *pData = pReader->pData;
        int remainingBits = numBits - availableBits;
        pReader->pData = pData + 1;
        pReader->bits = *pData;
        pReader->availableBits = 8;
        value = NNSi_G2dBitReaderRead(pReader, remainingBits) | (bits << remainingBits);
    } else {
        int leftBits = availableBits - numBits;
        value = (u32)bits >> leftBits;
        pReader->availableBits = leftBits;
    }
    return value & ((s32)0xFF >> (8 - numBits));
}

u16 NNSi_G2dSplitCharUTF16(const void **ppChar) {
    const u16 **ppUTF16 = (const u16 **)ppChar;
    u16 c = **ppUTF16;
    ++*ppUTF16;
    return c;
}
