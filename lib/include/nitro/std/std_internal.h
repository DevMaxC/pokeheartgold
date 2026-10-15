#ifndef POKEHEARTGOLD_NITRO_STD_STD_INTERNAL_H
#define POKEHEARTGOLD_NITRO_STD_STD_INTERNAL_H

// NitroSDK STD: string functions and the output writer of STD_TVSNPrintf.

#include <nitro/types.h>

// Output of STD_TVSNPrintf: bytes left in the buffer and the write position (advanced past the end
// when the output is truncated, so the full length can be returned).
typedef struct STDiWriter {
    u32 remaining;
    char *cursor;
    char *base;
} STDiWriter;

int STD_CopyLString(char *dst, const char *src, int count);
u32 STD_GetStringLength(const char *s);
int STD_CompareString(const char *a, const char *b);
int STD_CompareNString(const char *a, const char *b, int count);

void string_put_char(STDiWriter *writer, char c);
void string_fill_char(STDiWriter *writer, char c, int count);
void string_put_string(STDiWriter *writer, const char *s, int count);

#endif // POKEHEARTGOLD_NITRO_STD_STD_INTERNAL_H
