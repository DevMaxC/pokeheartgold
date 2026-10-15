#include <nitro.h>

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>
#include <nitro/std/std_internal.h>

// Output helpers of STD_TVSNPrintf (std_sprintf.c, built with other compiler settings): characters
// beyond the buffer are counted but not written.

#pragma force_active on

void string_put_char(STDiWriter *writer, char c) {
    if (writer->remaining) {
        *writer->cursor = c;
        writer->remaining--;
    }
    writer->cursor++;
}

#pragma push
#pragma opt_lifetimes off

void string_fill_char(STDiWriter *writer, char c, int count) {
    int i;
    u32 n;

    if (count <= 0) {
        return;
    }
    n = writer->remaining;
    if (n > (u32)count) {
        n = count;
    }
    for (i = 0; i < n; i++) {
        writer->cursor[i] = c;
    }
    writer->remaining -= n;
    writer->cursor += count;
}

void string_put_string(STDiWriter *writer, const char *s, int count) {
    int i;
    u32 n;

    if (count <= 0) {
        return;
    }
    n = writer->remaining;
    if (n > (u32)count) {
        n = count;
    }
    for (i = 0; i < n; i++) {
        writer->cursor[i] = s[i];
    }
    writer->remaining -= n;
    writer->cursor += count;
}

#pragma pop
