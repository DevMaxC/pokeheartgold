#include <nitro/code32.h>
#include <nitro/fx/fx.h>
#include <nitro/types.h>

void FX_Init(void);
fx32 FX_Modf(fx32 x, fx32 *iptr);

void FX_Init(void) {
    return;
}

fx32 FX_Modf(fx32 x, fx32 *iptr) {
    if (x >= 0) {
        *iptr = x & 0x7FFFF000;
        return x & 0xFFF;
    } else {
        *iptr = -(-x & 0x7FFFF000);
        return -(-x & 0xFFF);
    }
}
