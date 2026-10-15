#pragma force_active on
#include "global.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>
#pragma force_active on
void SNDi_SetPlayerParam(int, int, int, int);
void SND_SetPlayerTempoRatio(int, int);

void SND_SetPlayerTempoRatio(int player, int ratio) {
    SNDi_SetPlayerParam(player, 0x1a, ratio, 2);
}
