#include "nitrocrypto_bn.h"

// Bit length of a big number / a word.

#pragma dollar_identifiers on

// asm/nitrocrypto_data.s: bit length of each value 0-15
extern const s8 bits$7808[];

// MWCC 1.2 applies force_active as set at the end of the file, so the pieces with and without it
// stay in separate files.
#pragma force_active on

// MWCC 1.2 emits a file's functions in reverse order: the functions are defined last-to-first here
// (link order is bottom-up).

int BN_num_bits_word(u32 l) {
    int n;

    if (l & 0xFFFF0000) {
        n = (l & 0xFF000000) ? 24 : 16;
    } else {
        n = (l & 0xFF00) ? 8 : 0;
    }
    l >>= n;
    if (l & 0xF0) {
        return bits$7808[l >> 4] + n + 4;
    }
    return bits$7808[l] + n;
}

int BN_num_bits(const BIGNUM *a) {
    int i;

    if (a->top == 0) {
        return 0;
    }
    i = a->top - 1;
    return BN_num_bits_word(a->d[i]) + (i << 5);
}
