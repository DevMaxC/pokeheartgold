#pragma force_active on
#include "global.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>
#pragma force_active on

typedef struct {
    u8 pad[0x118];
    u32 first, second;
} CacheCommon;

void CARD_SetCacheFlushThreshold(u32, u32);

void CARD_SetCacheFlushThreshold(u32 first, u32 second) {
    CacheCommon *p = (CacheCommon *)&cardi_common;
    p->first = first;
    p->second = second;
}
