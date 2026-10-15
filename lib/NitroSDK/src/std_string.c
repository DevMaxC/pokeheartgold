#include <nitro.h>

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>
#include <nitro/std/std_internal.h>

// NitroSDK STD string functions: bounded copy, length, comparison.

#pragma force_active on

#pragma push
#pragma opt_lifetimes off

// Copies at most count - 1 characters and terminates dst; returns the length of src.
int STD_CopyLString(char *dst, const char *src, int count) {
    int i;
    const char *p;

    for (i = 0, p = src; i < count - 1; i++, p++) {
        dst[i] = *p;
        if (!*p) {
            break;
        }
    }
    if (i >= count - 1 && count) {
        dst[i] = 0;
    }
    return STD_GetStringLength(src);
}

#pragma pop

u32 STD_GetStringLength(const char *s) {
    u32 length = 0;

    while (s[length]) {
        length++;
    }
    return length;
}

int STD_CompareString(const char *a, const char *b) {
    while (*a == *b && *a) {
        a++;
        b++;
    }
    return *a - *b;
}

int STD_CompareNString(const char *a, const char *b, int count) {
    int i;

    if (count) {
        for (i = 0; i < count; i++) {
            if ((u8)a[i] != (u8)b[i]) {
                return (u8)a[i] - (u8)b[i];
            }
        }
    }
    return 0;
}
