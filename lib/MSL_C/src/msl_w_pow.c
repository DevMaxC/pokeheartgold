#pragma force_active on
#include "global.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>
extern double __ieee754_pow(double, double);
double pow(double, double);
#pragma force_active on

double pow(double a, double b) {
    return __ieee754_pow(a, b);
}
