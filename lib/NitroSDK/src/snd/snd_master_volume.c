#pragma force_active on
#include "global.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>
#pragma force_active on
void PushCommand_impl(int, int, int, int, int);
void SND_SetMasterVolume(int);

void SND_SetMasterVolume(int value) {
    PushCommand_impl(0x17, value, 0, 0, 0);
}
