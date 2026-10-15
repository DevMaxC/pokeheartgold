#include <nitro.h>
#include <nnsys/g2d_internal.h>

u16 NNS_G2dGetPaletteTableValue(const NNSG2dPaletteSwapTable *pPlttTbl, int index) {
    return pPlttTbl->paletteIndex[index];
}
