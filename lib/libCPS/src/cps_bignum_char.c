#include "cps/cps_crypto.h"

// Conversion between big-endian byte strings and libCPS big numbers.

#pragma force_active on

void CPSi_big_from_char(u16 *out, const u8 *bytes, int length, int digits) {
    MI_CpuFill8(out, 0, digits * 2);
    bytes += length - 1;
    while (length > 1) {
        *out++ = *bytes + bytes[-1] * 256;
        length -= 2;
        bytes -= 2;
    }
    if (length > 0) {
        *out = *bytes;
    }
}

void CPSi_char_from_big(u8 *bytes, const u16 *a, int length, int digits) {
    bytes += length - 1;
    while (length > 1) {
        u8 *high = bytes - 1;
        *bytes = *a;
        bytes -= 2;
        *high = *a++ >> 8;
        length -= 2;
    }
    if (length > 0) {
        *bytes = *a;
    }
}
