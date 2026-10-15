#include <string.h>

#include "cps/cps_crypto.h"

// Big number arithmetic: add / subtract / multiply / divide, modular power (plain and Montgomery) and
// modular inverse for the SSL key exchange.

#pragma force_active on

// number of digits without the leading zeros
int count_digits(const u16 *a, int digits) {
    while (digits && a[digits - 1] == 0) {
        digits--;
    }
    return digits;
}

int CPSi_big_sign(const u16 *a, int digits) {
    if (a[digits - 1] & 0x8000) {
        return -1;
    }
    return count_digits(a, digits) != 0;
}

void CPSi_big_add(u16 *out, const u16 *a, const u16 *b, int digits) {
    int n = count_digits(a, digits), m = count_digits(b, digits), i;
    u32 carry = 0;
    if (n < m) {
        n = m;
    }
    if (n != digits) {
        n++;
    }
    i = carry = 0;
    for (; i < n; i++) {
        u32 sum = a[i] + b[i] + carry;
        out[i] = sum;
        carry = sum >> 16;
    }
    if (out != a && out != b) {
        MI_CpuFill8(out + i, 0, (digits - i) * 2);
    }
}

void CPSi_big_add_small(u16 *out, const u16 *a, u32 b, int digits) {
    int i;
    for (i = 0; i < digits; i++) {
        b += a[i];
        out[i] = b;
        b >>= 16;
        if (!b) {
            break;
        }
    }
    if (out != a) {
        for (i++; i < digits; i++) {
            out[i] = a[i];
        }
    }
}

void CPSi_big_negate(u16 *a, int digits) {
    int i;
    for (i = 0; i < digits; i++) {
        a[i] = ~a[i];
    }
    CPSi_big_add_small(a, a, 1, digits);
}

void CPSi_big_sub(u16 *out, const u16 *a, const u16 *b, int digits) {
    int limit = count_digits(a, digits), j = count_digits(b, digits), i, borrow;
    if (limit < j) {
        limit = j;
    }
    if (limit != digits) {
        limit++;
    }
    borrow = 0;
    i = 0;
    while (i < limit || (i < digits && borrow != 0)) {
        int difference = a[i] - b[i] + borrow;
        out[i] = difference;
        borrow = difference >> 16;
        i++;
    }
    if (out != a && out != b) {
        MI_CpuFill8(out + i, 0, (digits - i) * 2);
    }
}

void CPSi_big_sub_small(u16 *out, const u16 *a, u32 b, int digits) {
    int i;
    for (i = 0; i < digits; i++) {
        u32 difference = a[i] - b;
        out[i] = difference;
        b = (difference >> 16) & 1;
        if (!b) {
            break;
        }
    }
    if (out != a) {
        for (i++; i < digits; i++) {
            out[i] = a[i];
        }
    }
}

int CPSi_big_compare(const u16 *a, const u16 *b, int digits) {
    int i;
    for (i = digits - 1; i >= 0; i--) {
        if (a[i] > b[i]) {
            return 1;
        }
        if (a[i] < b[i]) {
            return -1;
        }
    }
    return 0;
}

// adds value at digit index, propagating the carry
void CPSi_big_add_part(u16 *out, u32 value, int index, int digits) {
    while (value && index < digits) {
        value += out[index];
        out[index++] = value;
        value >>= 16;
    }
}

void CPSi_big_mult(u16 *out, const u16 *a, const u16 *b, int digits) {
    int n, m, i, j;
    MI_CpuFill8(out, 0, digits * 2);
    n = count_digits(a, digits);
    m = count_digits(b, digits);
    for (i = 0; i < m; i++) {
        for (j = 0; j < n && j < digits - i; j++) {
            CPSi_big_add_part(out, (u32)a[j] * b[i], i + j, digits);
        }
    }
}

void CPSi_big_mult_small(u16 *out, const u16 *a, u16 b, int digits) {
    int n = count_digits(a, digits), i;
    u32 carry = 0;
    for (i = 0; i < n; i++) {
        u32 product = b * a[i] + carry;
        out[i] = product;
        carry = product >> 16;
    }
    if (i < digits) {
        out[i++] = carry;
    }
    MI_CpuFill8(out + i, 0, (digits - i) * 2);
}

#pragma push
#pragma opt_lifetimes off

void CPSi_big_sqr(u16 *out, const u16 *a, int digits) {
    int count = count_digits(a, digits);
    int i, j;
    if (digits > count * 2) {
        MI_CpuFill8(out + count * 2, 0, (digits - count * 2) * 2);
    }
    // squares of the digits
    i = 0;
    if (count > 0) {
        j = i;
        do {
            u32 square;
            if (j >= digits) {
                break;
            }
            square = a[i] * a[i];
            out[j] = square;
            if (j == digits - 1) {
                break;
            }
            out[j + 1] = square >> 16;
            i++;
            j += 2;
        } while (i < count);
    }
    // twice the cross products
    {
        int k;
        for (k = 0; k < count; k++) {
            for (i = k + 1; i < count && (j = k + i) < digits; i++) {
                u32 product = (u32)a[i] * a[k];
                if (product <= 0x7FFF8000) {
                    CPSi_big_add_part(out, product * 2, j, digits);
                } else {
                    CPSi_big_add_part(out, product, j, digits);
                    CPSi_big_add_part(out, product, j, digits);
                }
            }
        }
    }
}

#pragma pop

// The top 1 / 2 / 3 / 4 digits ending at top, as a 64-bit value (top digit at bit 32 or 48).
u64 get48bits_1(const u16 *top) {
    return (u64)top[0] << 32;
}

// clang-format off
asm u64 get48bits_2(const u16 *top) {
    ldrh r1, [r0]
    ldrh r0, [r0, #-2]
    mov r0, r0, lsl #0x10
    bx lr
}
// clang-format on

// clang-format off
asm u64 get48bits_3(const u16 *top) {
    ldrh r1, [r0]
    ldrh r2, [r0, #-2]
    ldrh r3, [r0, #-4]
    orr r0, r3, r2, lsl #16
    bx lr
}
// clang-format on

// clang-format off
asm u64 get64bits(const u16 *top) {
    ldrh r2, [r0]
    ldrh r3, [r0, #-2]
    orr r1, r3, r2, lsl #16
    ldrh r2, [r0, #-4]
    ldrh r3, [r0, #-6]
    orr r0, r3, r2, lsl #16
    bx lr
}
// clang-format on

// Long division; scratch holds 3 * digits digits (product, shifted quotient, remainder).
void CPSi_big_div(u16 *quotient, const u16 *numerator, const u16 *denominator, u16 *remainder, int digits, u16 *scratch) {
    int shift;
    u32 estimate;
    u16 *q = scratch + digits, *r = q + digits;
    int denominatorDigits, numeratorDigits;
    u64 divisor;
    MI_CpuFill8(q, 0, digits * 4);
    numeratorDigits = count_digits(numerator, digits);
    denominatorDigits = count_digits(denominator, digits);
    if (numeratorDigits > 0 && denominatorDigits > 0) {
        shift = digits - numeratorDigits + denominatorDigits - 1;
        if (shift >= digits) {
            MI_CpuCopy8(numerator, r, digits * 2);
            goto finish;
        }
        MI_CpuCopy8(numerator, q + shift, numeratorDigits * 2);
        if (denominatorDigits > 2) {
            divisor = get48bits_3(denominator + denominatorDigits - 1);
        } else if (denominatorDigits > 1) {
            divisor = get48bits_2(denominator + denominatorDigits - 1);
        } else {
            divisor = get48bits_1(denominator + denominatorDigits - 1);
        }
        for (; shift < digits; shift++) {
            memmove(q + 1, q, (digits * 2 - 1) * 2);
            estimate = (u32)(get64bits(r + denominatorDigits) / divisor);
            if (estimate > 0xFFFF) {
                estimate = 0xFFFF;
            }
            for (;;) {
                CPSi_big_mult_small(scratch, denominator, (u16)estimate, digits);
                if (CPSi_big_compare(r, scratch, digits) >= 0) {
                    break;
                }
                estimate--;
            }
            CPSi_big_sub(r, r, scratch, digits);
            q[0] = (u16)estimate;
        }
    }
finish:
    if (quotient) {
        MI_CpuCopy8(q, quotient, digits * 2);
    }
    if (remainder) {
        MI_CpuCopy8(r, remainder, digits * 2);
    }
}

// out = base ^ power (mod modulus, if not NULL), square and multiply from the top bit.
void CPSi_big_power(u16 *out, const u16 *base, const u16 *power, int digits, const u16 *modulus) {
    u16 *buffer = gCpsAlloc(digits * 8), *scratch;
    int bit;
    if (!buffer) {
        return;
    }
    scratch = buffer + digits;
    MI_CpuFill8(out + 1, 0, (digits - 1) * 2);
    out[0] = 1;
    bit = (digits - count_digits(power, digits)) * 16;
    for (; bit < (u32)(digits * 16); bit++) {
        if (power[digits - (bit >> 4) - 1] & (0x8000u >> (bit & 15))) {
            MI_CpuCopy8(base, out, digits * 2);
            bit++;
            break;
        }
    }
    for (; bit < (u32)(digits * 16); bit++) {
        CPSi_big_sqr(buffer, out, digits);
        MI_CpuCopy8(buffer, out, digits * 2);
        if (modulus) {
            CPSi_big_div(NULL, out, modulus, out, digits, scratch);
        }
        if (power[digits - (bit >> 4) - 1] & (0x8000u >> (bit & 15))) {
            CPSi_big_mult(buffer, out, base, digits);
            MI_CpuCopy8(buffer, out, digits * 2);
            if (modulus) {
                CPSi_big_div(NULL, out, modulus, out, digits, scratch);
            }
        }
    }
    gCpsFree(buffer);
}

// Extended Euclid; scratch holds 7 * digits digits.
void CPSi_big_modinv(u16 *out, const u16 *a, const u16 *modulus, int digits, u16 *scratch) {
    u16 *quotient = scratch + digits, *dividend = quotient + digits, *coefficient = dividend + digits, *previous = coefficient + digits, *remainder = previous + digits, *extra = remainder + digits;
    int bytes = digits * 2;
    MI_CpuCopy8(a, scratch, bytes);
    MI_CpuCopy8(modulus, dividend, bytes);
    *(u16 *)((u8 *)dividend + bytes) = 1;
    while (CPSi_big_sign(scratch, digits) > 0) {
        CPSi_big_div(quotient, dividend, scratch, remainder, digits, extra);
        MI_CpuCopy8(scratch, dividend, bytes);
        MI_CpuCopy8(remainder, scratch, bytes);
        CPSi_big_mult(remainder, quotient, coefficient, digits);
        CPSi_big_sub(remainder, previous, remainder, digits);
        MI_CpuCopy8(coefficient, previous, bytes);
        MI_CpuCopy8(remainder, coefficient, bytes);
    }
    CPSi_big_add(previous, previous, modulus, digits);
    CPSi_big_div(NULL, previous, modulus, out, digits, extra);
}

// Montgomery multiplication: out = out * factor * R^-1 mod modulus (factor 1: square, NULL: none).
void CPSi_big_montmult(u16 *out, u16 *save, const u16 *factor, int digits, int modDigits, const u16 *modulus, const u16 *inverse, u16 *product, u16 *scratch) {
    int order;
    MI_CpuCopy8(out, save, digits * 2);
    if (factor == (u16 *)1) {
        CPSi_big_sqr(out, save, digits);
    } else if (factor) {
        CPSi_big_mult(out, save, factor, digits);
    }
    CPSi_big_mult(product, out, inverse, modDigits);
    MI_CpuFill8(product + modDigits, 0, (digits - modDigits) * 2);
    CPSi_big_mult(scratch, product, modulus, digits);
    CPSi_big_add(out, out, scratch, digits);
    memmove(out, out + modDigits, (digits - modDigits) * 2);
    MI_CpuFill8(out + digits - modDigits, 0, modDigits * 2);
    order = CPSi_big_compare(out, modulus, digits);
    switch (order) {
    case 0:
        MI_CpuFill8(out, 0, digits * 2);
        return;
    case 1:
        CPSi_big_sub(out, out, modulus, digits);
        return;
    }
}

void CPSi_big_montpower(u16 *out, const u16 *base, const u16 *power, int digits, const u16 *modulus) {
    int modDigits, i;
    u16 *scratch, *inverse, *product, *work, *radix, *montBase, *save;
    u32 bits;
    radix = gCpsAlloc(digits * 22);
    if (radix == NULL) {
        return;
    }
    MI_CpuFill8(radix, 0, digits * 22);
    inverse = radix + digits;
    montBase = inverse + digits;
    product = montBase + digits;
    work = product + digits;
    save = work + digits;
    scratch = save + digits;
    modDigits = count_digits(modulus, digits);
    radix[modDigits] = 1;
    // inverse = (R * (R^-1 mod modulus) - 1) / modulus
    CPSi_big_modinv(inverse, radix, modulus, digits, montBase);
    CPSi_big_mult(product, radix, inverse, digits);
    CPSi_big_sub_small(inverse, product, 1, digits);
    CPSi_big_div(inverse, inverse, modulus, NULL, digits, scratch);
    CPSi_big_mult(montBase, base, radix, digits);
    CPSi_big_div(NULL, montBase, modulus, montBase, digits, scratch);
    CPSi_big_div(NULL, radix, modulus, out, digits, scratch);
    i = 0;
    bits = modDigits << 4;
    for (; i < bits; i++) {
        CPSi_big_montmult(out, save, (u16 *)1, digits, modDigits, modulus, inverse, product, work);
        if (power[modDigits - (i >> 4) - 1] & (0x8000U >> (i & 15))) {
            CPSi_big_montmult(out, save, montBase, digits, modDigits, modulus, inverse, product, work);
        }
    }
    CPSi_big_montmult(out, save, NULL, digits, modDigits, modulus, inverse, product, work);
    gCpsFree(radix);
}
