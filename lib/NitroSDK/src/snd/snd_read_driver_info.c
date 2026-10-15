#pragma force_active on
#include "global.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>
#pragma force_active on
void PushCommand_impl(int, void *, int, int, int);
void SND_ReadDriverInfo(void *);

void SND_ReadDriverInfo(void *info) {
    PushCommand_impl(0x21, info, 0, 0, 0);
}
