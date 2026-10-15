#ifndef POKEHEARTGOLD_CPS_CRYPTO_H
#define POKEHEARTGOLD_CPS_CRYPTO_H

#include <nitro.h>

// libCPS hashes, RC4 and big numbers (used by its SSL). Big numbers are arrays of u16 digits, least
// significant first, all of the same length (digits).

typedef struct CpsMd5Context {
    u32 state[4];  // 0x00
    u32 countLo;   // 0x10, message length in bits
    u32 countHi;   // 0x14
    u8 buffer[64]; // 0x18
} CpsMd5Context;

typedef struct CpsSha1Context {
    u32 state[5];  // 0x00
    u32 countHi;   // 0x14, message length in bits
    u32 countLo;   // 0x18
    u8 buffer[64]; // 0x1C
} CpsSha1Context;

typedef struct CpsRc4Context {
    u8 x;
    u8 y;
    u8 s[256];
} CpsRc4Context;

// libCPS allocator (CPS_Startup's)
extern void *(*gCpsAlloc)(u32 size);
extern void (*gCpsFree)(void *ptr);

extern const u8 gCpsMd5WordIndex[64];
extern const u8 gCpsMd5Padding[64];
extern const u32 gCpsMd5Constants[64];
extern const u8 gCpsSha1Padding[];
extern const u8 _02110899[]; // gCpsSha1Padding + 1: zeros

// cps_md5.c
void CPSi_md5_block(u32 *state, const u8 *block);
void CPSi_md5_init(CpsMd5Context *context);
void CPSi_md5_calc(CpsMd5Context *context, const u8 *data, u32 length);
void CPSi_md5_result(CpsMd5Context *context, u8 *digest);

// cps_sha1.c
u32 R(u32 index, u32 *words);
void char_from_long__sha1(u8 *dest, const u32 *src, u32 size);
void long_from_char__sha1(u32 *dest, const u8 *src, u32 size);
void CPSi_sha1_block(u32 *state, const u8 *block);
void CPSi_sha1_init(CpsSha1Context *context);
void CPSi_sha1_calc(CpsSha1Context *context, const u8 *data, u32 length);
void CPSi_sha1_result(CpsSha1Context *context, u8 *digest);
void CPSi_sha1_result_prng(CpsSha1Context *context, u8 *digest);

// cps_rc4.c
void CPSi_rc4_init(CpsRc4Context *context, const u8 *key, int length);
void CPSi_rc4_crypt(CpsRc4Context *context, u8 *data, int length);

// cps_bignum.c
int count_digits(const u16 *a, int digits);
int CPSi_big_sign(const u16 *a, int digits);
void CPSi_big_add(u16 *out, const u16 *a, const u16 *b, int digits);
void CPSi_big_add_small(u16 *out, const u16 *a, u32 b, int digits);
void CPSi_big_negate(u16 *a, int digits);
void CPSi_big_sub(u16 *out, const u16 *a, const u16 *b, int digits);
void CPSi_big_sub_small(u16 *out, const u16 *a, u32 b, int digits);
int CPSi_big_compare(const u16 *a, const u16 *b, int digits);
void CPSi_big_add_part(u16 *out, u32 value, int index, int digits);
void CPSi_big_mult(u16 *out, const u16 *a, const u16 *b, int digits);
void CPSi_big_mult_small(u16 *out, const u16 *a, u16 b, int digits);
void CPSi_big_sqr(u16 *out, const u16 *a, int digits);
u64 get48bits_1(const u16 *top);
u64 get48bits_2(const u16 *top);
u64 get48bits_3(const u16 *top);
u64 get64bits(const u16 *top);
void CPSi_big_div(u16 *quotient, const u16 *numerator, const u16 *denominator, u16 *remainder, int digits, u16 *scratch);
void CPSi_big_power(u16 *out, const u16 *base, const u16 *power, int digits, const u16 *modulus);
void CPSi_big_modinv(u16 *out, const u16 *a, const u16 *modulus, int digits, u16 *scratch);
void CPSi_big_montmult(u16 *out, u16 *save, const u16 *factor, int digits, int modDigits, const u16 *modulus, const u16 *inverse, u16 *product, u16 *scratch);
void CPSi_big_montpower(u16 *out, const u16 *base, const u16 *power, int digits, const u16 *modulus);

// cps_bignum_char.c (big endian bytes <-> big number)
void CPSi_big_from_char(u16 *out, const u8 *bytes, int length, int digits);
void CPSi_char_from_big(u8 *bytes, const u16 *a, int length, int digits); // digits: unused

// libCPS SSL helpers (memory copies on this little-endian CPU)
void char_from_long(void *dest, const void *src, int size);
void long_from_char(void *dest, const void *src, int size);

#endif // POKEHEARTGOLD_CPS_CRYPTO_H
