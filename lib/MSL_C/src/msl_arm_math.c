#pragma force_active on
#include "global.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>
#pragma force_active on
extern float __float_nan;
double nan(const char *);

double nan(const char *tag) {
    return (double)__float_nan;
}
