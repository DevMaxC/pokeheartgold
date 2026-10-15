#pragma force_active on
#include <nitro/types.h>

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>
extern BOOL OSi_IsThreadInitialized;
BOOL OS_IsThreadAvailable(void);

BOOL OS_IsThreadAvailable(void) {
    return OSi_IsThreadInitialized;
}
