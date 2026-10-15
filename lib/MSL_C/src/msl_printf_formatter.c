#include <nitro.h>

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>
#include <stdarg.h>
#include <stddef.h>
#include <string.h>

// MSL formatted output: printf-family format parsing (parse_format), number conversions (long2str,
// longlong2str, double2hex, float2str with round_decimal), the formatter that drives a writer
// (__pformatter), the file / string writers, printf and the sprintf family.

// One parsed conversion specification (passed by value to the conversion functions).
typedef struct Format {
    u8 justify; // 0: left, 1: right, 2: zero padded
    u8 sign;    // 0: '-' only, 1: '+', 2: ' '
    u8 precisionSet;
    u8 alternate;  // '#'
    u8 length;     // size modifier
    u8 conversion; // conversion character (255: invalid)
    u8 pad[2];
    int width;
    int precision;
} Format;

// __num2dec input.
typedef struct DecimalFormat {
    u8 style;
    u8 pad;
    s16 digits;
} DecimalFormat;

// __num2dec output: decimal digits (characters) and exponent.
typedef struct Decimal {
    s8 sign;
    u8 pad;
    s16 exponent;
    u8 count;
    u8 digits[32];
} Decimal;

// The same decimal as round_decimal sees it.
typedef struct RoundedDecimal {
    u8 sign;
    u8 pad;
    s16 exponent;
    u8 count;
    s8 digits[33];
} RoundedDecimal;

typedef struct Double2HexWork {
    DecimalFormat form;
    Decimal decimal;
    Format integerFormat; // of the exponent
} Double2HexWork;

typedef struct Float2StrWork {
    DecimalFormat format;

    union {
        Decimal produced;
        RoundedDecimal rounded;
    } value;
} Float2StrWork;

// __pformatter's format and conversion buffer (conversions write backwards from its end).
typedef struct OutputWorkspace {
    Format info;
    char buffer[512];
} OutputWorkspace;

// __StringWrite context.
typedef struct String {
    char *buffer;
    u32 size;
    u32 count;
} String;

typedef u32 (*Writer)(void *context, const char *data, u32 count);

#define DIGIT(c)      ((c) < 0 || (c) >= 128 ? 0 : __msl_digit[(c)] & 8)
#define COPY(n, p, s) memcpy((p), (s), (n))

extern const u16 __msl_digit[];
extern const char printf_double2hex_0p0[];
extern const char printf_double2hex_neg_inf_upper[];
extern const char printf_double2hex_neg_inf_lower[];
extern const char printf_double2hex_inf_upper[];
extern const char printf_double2hex_inf_lower[];
extern const char printf_double2hex_neg_nan_upper[];
extern const char printf_double2hex_neg_nan_lower[];
extern const char printf_double2hex_nan_upper[];
extern const char printf_double2hex_nan_lower[];
extern const char __pformatter_empty_string_1[];
extern const char __pformatter_empty_string_2[];
extern OSMutex __cs[];
extern u32 __cs_id[];
extern u32 __cs_ref[];
extern u8 __files[];

extern void __num2dec(const DecimalFormat *format, double x, Decimal *decimal);
extern double fabs(double);
extern char *strchr(const char *, int);
extern unsigned int strlen(const char *);
extern void *memchr(const void *, int, u32);
extern unsigned int wcstombs(char *, const u16 *, unsigned int);
extern u32 __fwrite(const void *, u32, u32, void *);
extern int fwide(void *, int);

char *parse_format(char *start, va_list *args, Format *out);
char *long2str(long num, char *buf, Format f);
char *longlong2str(u64 value, char *end, Format f);
char *double2hex(double value, char *end, Format f);
void round_decimal(RoundedDecimal *d, int n);
char *float2str(double x, char *end, Format fmt);
int __pformatter(Writer write, void *context, const char *format, va_list ap);
u32 __FileWrite(void *file, const char *data, u32 count);
u32 __StringWrite(void *arg, const char *data, u32 count);
int printf(const char *format, ...);
int vsnprintf(char *buffer, u32 size, const char *format, va_list args);
int vsprintf(char *buffer, const char *format, va_list args);
int snprintf(char *buffer, u32 size, const char *format, ...);
int sprintf(char *buffer, const char *format, ...);

#pragma force_active on

char *parse_format(char *start, va_list *args, Format *out) {
    Format f;
    int c, more;
    char *p;
    c = start[1];
    p = start + 1;
    f.justify = 1;
    f.sign = 0;
    f.precisionSet = 0;
    f.alternate = 0;
    f.length = 0;
    f.width = 0;
    f.precision = 0;
    if (c == '%') {
        f.conversion = c;
        *out = f;
        return p + 1;
    }
    do {
        more = 1;
        switch (c) {
        case '-':
            f.justify = 0;
            break;
        case '+':
            f.sign = 1;
            break;
        case ' ':
            if (f.sign != 1) {
                f.sign = 2;
            }
            break;
        case '#':
            f.alternate = 1;
            break;
        case '0':
            if (f.justify != 0) {
                f.justify = 2;
            }
            break;
        default:
            more = 0;
            break;
        }
        if (!more) {
            break;
        }
        c = *++p;
    } while (1);
    if (c == '*') {
        *args += 4;
        f.width = *(int *)(*args - 4);
        if (f.width < 0) {
            f.justify = 0;
            f.width = -f.width;
        }
        c = *++p;
    } else {
        while (DIGIT(c)) {
            f.width = f.width * 10 + (c - '0');
            c = *++p;
        }
    }
    if (f.width > 509) {
        f.conversion = 255;
        *out = f;
        return p + 1;
    }
    if (c == '.') {
        c = *++p;
        f.precisionSet = 1;
        if (c == '*') {
            *args += 4;
            f.precision = *(int *)(*args - 4);
            c = *++p;
            if (f.precision < 0) {
                f.precisionSet = 0;
            }
        } else {
            while (DIGIT(c)) {
                f.precision = f.precision * 10 + (c - '0');
                c = *++p;
            }
        }
    }
    more = 1;
    switch (c) {
    case 'h':
        f.length = 2;
        if (p[1] == 'h') {
            f.length = 1;
            c = *++p;
        }
        break;
    case 'l':
        f.length = 3;
        if (p[1] == 'l') {
            f.length = 4;
            c = *++p;
        }
        break;
    case 'L':
        f.length = 9;
        break;
    case 'j':
        f.length = 6;
        break;
    case 't':
        f.length = 8;
        break;
    case 'z':
        f.length = 7;
        break;
    default:
        more = 0;
        break;
    }
    if (more) {
        c = *++p;
    }
    f.conversion = c;
    switch (c) {
    case 'd':
    case 'i':
    case 'o':
    case 'u':
    case 'x':
    case 'X':
        if (f.length == 9) {
            f.conversion = 255;
        } else if (!f.precisionSet) {
            f.precision = 1;
        } else if (f.justify == 2) {
            f.justify = 1;
        }
        break;
    case 'f':
    case 'F':
        if (f.length == 2 || f.length == 6 || f.length == 7 || f.length == 8 || f.length == 4) {
            f.conversion = 255;
        } else if (!f.precisionSet) {
            f.precision = 6;
        }
        break;
    case 'a':
    case 'A':
        if (!f.precisionSet) {
            f.precision = 13;
        }
        if (f.length == 2 || f.length == 6 || f.length == 7 || f.length == 8 || f.length == 4 || f.length == 1) {
            f.conversion = 255;
        }
        break;
    case 'g':
    case 'G':
        if (f.precision == 0) {
            f.precision = 1;
        }
    case 'e':
    case 'E':
        if (f.length == 2 || f.length == 6 || f.length == 7 || f.length == 8 || f.length == 4 || f.length == 1) {
            f.conversion = 255;
        } else if (!f.precisionSet) {
            f.precision = 6;
        }
        break;
    case 'p':
        f.conversion = 'x';
        f.alternate = 1;
        f.length = 3;
        f.precision = 8;
        break;
    case 'c':
        if (f.length == 3) {
            f.length = 5;
        } else if (f.precisionSet || f.length != 0) {
            f.conversion = 255;
        }
        break;
    case 's':
        if (f.length == 3) {
            f.length = 5;
        } else if (f.length != 0) {
            f.conversion = 255;
        }
        break;
    case 'n':
        if (f.length == 9) {
            f.conversion = 255;
        }
        break;
    default:
        f.conversion = 255;
        break;
    }
    *out = f;
    return p + 1;
}

char *long2str(long num, char *buf, Format f) {
    unsigned long base;
    char *p = buf;
    int d;
    int neg = 0;
    int prec = f.precision;
    int sign = f.sign;
    long digits = 0;
    unsigned long u = num;
    *--p = 0;
    if (u == 0 && prec == 0 && (!f.alternate || f.conversion != 'o')) {
        return p;
    }
    switch (f.conversion) {
    case 'd':
    case 'i':
        base = 10;
        if (num < 0) {
            if (u != 0x80000000) {
                u = -u;
            }
            neg = 1;
        }
        break;
    case 'o':
        base = 8;
        sign = 0;
        break;
    case 'u':
        base = 10;
        sign = 0;
        break;
    case 'x':
    case 'X':
        base = 16;
        sign = 0;
        break;
    }
    do {
        d = u % base;
        u /= base;
        if (d < 10) {
            d += '0';
        } else if (f.conversion == 'x') {
            d += 'a' - 10;
        } else {
            d += 'A' - 10;
        }
        *--p = d;
        digits++;
    } while (u != 0);
    if (base == 8 && f.alternate && *p != '0') {
        *--p = '0';
        digits++;
    }
    if (f.justify == 2) {
        prec = f.width;
        if (neg || sign != 0) {
            prec--;
        }
        if (base == 16 && f.alternate) {
            prec -= 2;
        }
    }
    if (buf - p + prec > 0x1fd) {
        return NULL;
    }
    while (digits < prec) {
        *--p = '0';
        digits++;
    }
    if (base == 16 && f.alternate) {
        *--p = f.conversion;
        *--p = '0';
    }
    if (neg) {
        *--p = '-';
    } else if (sign == 1) {
        *--p = '+';
    } else if (sign == 2) {
        *--p = ' ';
    }
    return p;
}

char *longlong2str(u64 value, char *end, Format f) {
    u64 base;
    char *p;
    int negative, precision, sign, width, conversion, alt, count;
    int digit;
    p = end;
    *--p = 0;
    precision = f.precision;
    alt = f.alternate;
    conversion = f.conversion;
    negative = 0;
    count = 0;
    width = *(volatile int *)&f.width; // a volatile load in the original
    sign = f.sign;
    if (value == 0 && precision == 0) {
        if (!alt || conversion != 'o') {
            return p;
        }
    }
    switch (conversion) {
    case 'd':
    case 'i':
        base = 10;
        if ((s64)value < 0) {
            if (value != 0x8000000000000000ULL) {
                value = -value;
            }
            negative = 1;
        }
        break;
    case 'o':
        sign = 0;
        base = 8;
        break;
    case 'u':
        sign = 0;
        base = 10;
        break;
    case 'x':
    case 'X':
        sign = 0;
        base = 16;
        break;
    }
    do {
        digit = value % base;
        value /= base;
        if (digit < 10) {
            digit += '0';
        } else if (conversion == 'x') {
            digit += 'a' - 10;
        } else {
            digit += 'A' - 10;
        }
        *--p = digit;
        count++;
    } while (value);
    if (base == 8 && alt && *p != '0') {
        *--p = '0';
        count++;
    }
    if (f.justify == 2) {
        precision = width;
        if (negative || sign) {
            precision--;
        }
        if (base == 16 && alt) {
            precision -= 2;
        }
    }
    if (precision + (end - p) > 509) {
        return 0;
    }
    while (count < precision) {
        *--p = '0';
        count++;
    }
    if (base == 16 && alt) {
        *--p = conversion;
        *--p = '0';
    }
    if (negative) {
        *--p = '-';
    } else if (sign == 1) {
        *--p = '+';
    } else if (sign == 2) {
        *--p = ' ';
    }
    return p;
}

#pragma push
#pragma opt_propagation off

char *double2hex(double value, char *end, Format f) {
    Double2HexWork stage;
    int sign;
    int alt;
    int conversion;
    int precision;
    int i;
    char temp;
    char *p;
    double v = value;
    precision = f.precision;
    if (precision > 509) {
        return 0;
    }
    conversion = f.conversion;
    alt = f.alternate;
    sign = f.sign;
    stage.form.style = 0;
    stage.form.digits = 32;
    __num2dec(&stage.form, v, &stage.decimal);
    if (fabs(value) == 0) {
        p = end - 6;
        COPY(6, p, printf_double2hex_0p0);
        return p;
    }
    if (stage.decimal.digits[0] == 'I') {
        if (stage.decimal.sign) {
            p = end - 5;
            if (conversion == 'A') {
                COPY(5, p, printf_double2hex_neg_inf_upper);
            } else {
                COPY(5, p, printf_double2hex_neg_inf_lower);
            }
        } else {
            p = end - 4;
            if (conversion == 'A') {
                COPY(4, p, printf_double2hex_inf_upper);
            } else {
                COPY(4, p, printf_double2hex_inf_lower);
            }
        }
        return p;
    }
    if (stage.decimal.digits[0] == 'N') {
        if (stage.decimal.sign) {
            p = end - 5;
            if (conversion == 'A') {
                COPY(5, p, printf_double2hex_neg_nan_upper);
            } else {
                COPY(5, p, printf_double2hex_neg_nan_lower);
            }
        } else {
            p = end - 4;
            if (conversion == 'A') {
                COPY(4, p, printf_double2hex_nan_upper);
            } else {
                COPY(4, p, printf_double2hex_nan_lower);
            }
        }
        return p;
    }
    {
        char *bytes;
        stage.integerFormat.justify = 1;
        stage.integerFormat.sign = 1;
        stage.integerFormat.precisionSet = 0;
        stage.integerFormat.alternate = 0;
        stage.integerFormat.length = 0;
        stage.integerFormat.width = 0;
        stage.integerFormat.precision = 1;
        stage.integerFormat.conversion = 'd';
        bytes = (char *)&value;
        i = 0;
        do {
            temp = bytes[i];
            bytes[i] = bytes[7 - i];
            bytes[7 - i] = temp;
        } while (++i < 4);
        {
            int exponent = (((u32)(u8)((char *)&value)[0] << 25) | ((u32)(u8)((char *)&value)[1] << 17)) >> 21 & 2047;
            p = long2str(exponent - 1023, end, stage.integerFormat);
        }

        if (conversion == 'a') {
            *--p = 'p';
        } else {
            *--p = 'P';
        }
        {
            char *b = (char *)&value;
            int k, index = (u32)precision * 4 + 11;
            u8 digit;
            for (k = precision; k >= 1; k--) {
                if (index < 64) {
                    digit = (u8)b[index >> 3] >> (7 - (index & 7));
                    if ((index & ~7) != ((index - 4) & ~7)) {
                        digit |= ((u8)b[(index >> 3) - 1] << 8) >> (7 - (index & 7));
                    }
                    digit &= 15;
                    if (digit < 10) {
                        digit += '0';
                    } else if (conversion == 'a') {
                        digit += 'a' - 10;
                    } else {
                        digit += 'A' - 10;
                    }
                } else {
                    digit = '0';
                }
                *--p = digit;
                index -= 4;
            }
        }
        if (precision || alt) {
            *--p = '.';
        }
        p[-1] = '1';
        *(p -= 2) = conversion == 'a' ? 'x' : 'X';
        *--p = '0';
        if (stage.decimal.sign) {
            *--p = '-';
        } else if (sign == 1) {
            *--p = '+';
        } else if (sign == 2) {
            *--p = ' ';
        }
        return p;
    }
}

#pragma pop

void round_decimal(RoundedDecimal *d, int n) {
    s8 *p, *last, *first;
    int round;
    u8 count;
    if (n < 0) {
zero:
        d->exponent = 0;
        d->count = 1;
        d->digits[0] = '0';
        return;
    }
    count = d->count;
    if (n >= count) {
        return;
    }
    first = d->digits;
    p = (s8 *)((u32)first + n);
    p = (s8 *)((u32)p + 1);
    {
        s8 digit = (s8)(*--p - '0');
        if (digit == 5) {
            last = first + count;
            do {
                --last;
                if (last <= p) {
                    break;
                }
            } while (*last == '0');
            if (last == p) {
                round = p[-1] & 1;
            } else {
                round = 1;
            }
        } else {
            round = digit > 5;
        }
    }
    while (n) {
        s8 digit = (s8)(*--p - '0' + round);
        round = digit > 9;
        if (round || digit == 0) {
            --n;
        } else {
            *p = digit + '0';
            break;
        }
    }
    if (round) {
        d->exponent++;
        d->count = 1;
        d->digits[0] = '1';
        return;
    }
    if (!n) {
        goto zero;
    }
    d->count = n;
}

char *float2str(double x, char *end, Format fmt) {
    Float2StrWork stage;
    int exp;
    int n;
    int i;
    int integer;
    int sign;
    int expsign;
    int alternate;
    int frac;
    char *p;
    int conversion = fmt.conversion;
    long precision = fmt.precision;
    char *out;
    alternate = fmt.alternate;
    sign = fmt.sign;
    if (precision > 509) {
        return NULL;
    }
    stage.format.style = 0;
    stage.format.digits = 32;
    __num2dec(&stage.format, x, &stage.value.produced);
    p = (char *)stage.value.produced.digits + stage.value.produced.count;
    while (stage.value.produced.count > 1 && *--p == '0') {
        stage.value.produced.count--;
        stage.value.produced.exponent++;
    }
    switch (stage.value.produced.digits[0]) {
    case '0':
        stage.value.produced.exponent = 0;
        break;
    case 'I':
        if (x < 0.0) {
            out = end - 5;
            if (conversion < 0 || conversion >= 128 ? 0 : __msl_digit[conversion] & 0x200) {
                memcpy(out, printf_double2hex_neg_inf_upper, 5);
            } else {
                memcpy(out, printf_double2hex_neg_inf_lower, 5);
            }
        } else {
            out = end - 4;
            if (conversion < 0 || conversion >= 128 ? 0 : __msl_digit[conversion] & 0x200) {
                memcpy(out, printf_double2hex_inf_upper, 4);
            } else {
                memcpy(out, printf_double2hex_inf_lower, 4);
            }
        }
        return out;
    case 'N':
        if (*(const s8 *)&stage.value.produced) {
            out = end - 5;
            if (conversion < 0 || conversion >= 128 ? 0 : __msl_digit[conversion] & 0x200) {
                memcpy(out, printf_double2hex_neg_nan_upper, 5);
            } else {
                memcpy(out, printf_double2hex_neg_nan_lower, 5);
            }
        } else {
            out = end - 4;
            if (conversion < 0 || conversion >= 128 ? 0 : __msl_digit[conversion] & 0x200) {
                memcpy(out, printf_double2hex_nan_upper, 4);
            } else {
                memcpy(out, printf_double2hex_nan_lower, 4);
            }
        }
        return out;
    }
    stage.value.produced.exponent += stage.value.produced.count - 1;
    out = end;
    *--out = 0;
    switch (conversion) {
    case 'g':
    case 'G':
        if (stage.value.produced.count > precision) {
            round_decimal(&stage.value.rounded, precision);
        }
        if (stage.value.produced.exponent < -4 || stage.value.produced.exponent >= precision) {
            if (alternate) {
                precision--;
            } else {
                precision = stage.value.produced.count - 1;
            }
            if (conversion == 'g') {
                conversion = 'e';
            } else {
                conversion = 'E';
            }
            goto exponential;
        }
        if (alternate) {
            precision -= stage.value.produced.exponent + 1;
        } else {
            precision = stage.value.produced.count - (stage.value.produced.exponent + 1);
            if (precision < 0) {
                precision = 0;
            }
        }
        goto fixed;
    case 'e':
    case 'E':
exponential:
        if (stage.value.produced.count > precision + 1) {
            round_decimal(&stage.value.rounded, precision + 1);
        }
        exp = stage.value.produced.exponent;
        expsign = '+';
        if (exp < 0) {
            exp = -exp;
            expsign = '-';
        }
        for (n = 0; exp != 0 || n < 2; n++) {
            *--out = exp % 10 + '0';
            exp /= 10;
        }
        *--out = expsign;
        *--out = conversion;
        if ((end - out) + precision > 509) {
            return NULL;
        }
        if (stage.value.produced.count < precision + 1) {
            n = precision + 2 - stage.value.produced.count;
            while (--n) {
                *--out = '0';
            }
        }
        p = (char *)stage.value.produced.digits + stage.value.produced.count;
        n = stage.value.produced.count;
        while (--n) {
            *--out = *--p;
        }
        if (precision != 0 || alternate) {
            *--out = '.';
        }
        *--out = stage.value.produced.digits[0];
        if (*(const s8 *)&stage.value.produced) {
            *--out = '-';
        } else if (sign == 1) {
            *--out = '+';
        } else if (sign == 2) {
            *--out = ' ';
        }
        break;
    case 'f':
    case 'F':
fixed:
        frac = stage.value.produced.count - stage.value.produced.exponent - 1;
        if (frac < 0) {
            frac = 0;
        }
        if (frac > precision) {
            round_decimal(&stage.value.rounded, stage.value.produced.count - (frac - precision));
            frac = stage.value.produced.count - stage.value.produced.exponent - 1;
            if (frac < 0) {
                frac = 0;
            }
        }
        integer = stage.value.produced.exponent + 1;
        if (integer < 0) {
            integer = 0;
        }
        if (integer + frac > 509) {
            return NULL;
        }
        p = (char *)stage.value.produced.digits + stage.value.produced.count;
        for (n = 0; n < precision - frac; n++) {
            *--out = '0';
        }
        for (i = 0; i < frac && i < stage.value.produced.count; i++) {
            *--out = *--p;
        }
        for (; i < frac; i++) {
            *--out = '0';
        }
        if (precision || alternate) {
            *--out = '.';
        }
        if (integer) {
            for (i = 0; i < integer - stage.value.produced.count; i++) {
                *--out = '0';
            }
            for (; i < integer; i++) {
                *--out = *--p;
            }
        } else {
            *--out = '0';
        }
        if (*(const s8 *)&stage.value.produced) {
            *--out = '-';
        } else if (sign == 1) {
            *--out = '+';
        } else if (sign == 2) {
            *--out = ' ';
        }
        break;
    }
    return out;
}

static inline char *Small(s32 n, char *end, const Format *f) {
    return long2str(n, end, *f);
}

static inline char *Large(u64 n, char *end, const Format *f) {
    return longlong2str(n, end, *f);
}

int __pformatter(Writer write, void *context, const char *format, va_list ap) {
    OutputWorkspace workspace;
    int field;
    char padding = ' ', space;
    double value;
    s64 wide;
    const char *percent;
    int length;
    register int number;
    register char *text;
    int count = 0;
    if (!*format) {
        goto done;
    }
    do {
        percent = strchr(format, '%');
        if (!percent) {
            length = strlen(format);
            count += length;
            if (length && !write(context, format, length)) {
                return -1;
            }
            break;
        }
        length = percent - format;
        count += length;
        if (length && !write(context, format, length)) {
            return -1;
        }
        format = parse_format((char *)percent, &ap, &workspace.info);
        switch (workspace.info.conversion) {
        case 'd':
        case 'i':
            if (workspace.info.length == 3) {
                ap += 4;
                number = *(long *)(ap - 4);
            } else if (workspace.info.length == 4) {
                ap += 8;
                wide = *(s64 *)(ap - 8);
            } else if (workspace.info.length == 6) {
                ap += 8;
                wide = *(s64 *)(ap - 8);
            } else if (workspace.info.length == 7) {
                ap += 4;
                number = *(s32 *)(ap - 4);
            } else if (workspace.info.length == 8) {
                ap += 4;
                number = *(u32 *)(ap - 4);
            } else {
                ap += 4;
                number = *(int *)(ap - 4);
            }
            if (workspace.info.length == 2) {
                number = (s16)number;
            }
            if (workspace.info.length == 1) {
                number = (s8)number;
            }
            if (workspace.info.length == 4 || workspace.info.length == 6) {
                text = Large(wide, workspace.buffer + 512, &workspace.info);
                if (!text) {
                    goto invalid;
                }
            } else {
                text = Small(number, workspace.buffer + 512, &workspace.info);
                if (!text) {
                    goto invalid;
                }
            }
            length = workspace.buffer + 511 - text;
            break;
        case 'o':
        case 'u':
        case 'x':
        case 'X':
            if (workspace.info.length == 3) {
                ap += 4;
                number = *(unsigned long *)(ap - 4);
            } else if (workspace.info.length == 4) {
                ap += 8;
                wide = *(u64 *)(ap - 8);
            } else if (workspace.info.length == 6) {
                ap += 8;
                wide = *(u64 *)(ap - 8);
            } else if (workspace.info.length == 7) {
                ap += 4;
                number = *(s32 *)(ap - 4);
            } else if (workspace.info.length == 8) {
                ap += 4;
                number = *(u32 *)(ap - 4);
            } else {
                ap += 4;
                number = *(unsigned int *)(ap - 4);
            }
            if (workspace.info.length == 2) {
                number = (u16)number;
            }
            if (workspace.info.length == 1) {
                number = (u8)number;
            }
            if (workspace.info.length == 4 || workspace.info.length == 6) {
                text = Large(wide, workspace.buffer + 512, &workspace.info);
                if (!text) {
                    goto invalid;
                }
            } else {
                text = Small(number, workspace.buffer + 512, &workspace.info);
                if (!text) {
                    goto invalid;
                }
            }
            length = workspace.buffer + 511 - text;
            break;
        case 'f':
        case 'F':
        case 'e':
        case 'E':
        case 'g':
        case 'G': {
            if (workspace.info.length == 9) {
                ap += 8;
                value = *(long double *)(ap - 8);
            } else {
                ap += 8;
                value = *(double *)(ap - 8);
            }
            text = float2str(value, workspace.buffer + 512, workspace.info);
            if (!text) {
                goto invalid;
            }
            length = workspace.buffer + 511 - text;
            break;
        }
        case 'a':
        case 'A': {
            if (workspace.info.length == 9) {
                ap += 8;
                value = *(long double *)(ap - 8);
            } else {
                ap += 8;
                value = *(double *)(ap - 8);
            }
            text = double2hex(value, workspace.buffer + 512, workspace.info);
            if (!text) {
                goto invalid;
            }
            length = workspace.buffer + 511 - text;
            break;
        }
        case 's':
            if (workspace.info.length == 5) {
                const u16 *value;
                ap += 4;
                value = *(const u16 **)(ap - 4);
                if (!value) {
                    value = (const u16 *)__pformatter_empty_string_1;
                }
                if ((s32)wcstombs(workspace.buffer, value, 512) < 0) {
                    goto invalid;
                }
                text = workspace.buffer;
            } else {
                ap += 4;
                text = *(char **)(ap - 4);
            }
            if (!text) {
                text = (char *)__pformatter_empty_string_2;
            }
            if (workspace.info.alternate) {
                length = (u8)*text++;
                if (workspace.info.precisionSet && length > workspace.info.precision) {
                    length = workspace.info.precision;
                }
            } else if (workspace.info.precisionSet) {
                const char *end;
                length = workspace.info.precision;
                end = memchr(text, 0, length);
                if (end) {
                    length = end - text;
                }
            } else {
                length = strlen(text);
            }
            break;
        case 'n': {
            ap += 4;
            text = *(char **)(ap - 4);
            switch (workspace.info.length) {
            case 0:
                *(int *)text = count;
                break;
            case 2:
                *(s16 *)text = count;
                break;
            case 3:
                *(long *)text = count;
                break;
            case 6:
                *(s64 *)text = count;
                break;
            case 7:
                *(int *)text = count;
                break;
            case 8:
                *(int *)text = count;
                break;
            case 4:
                *(s64 *)text = count;
                break;
            }
            continue;
        }
        case 'c':
            ap += 4;
            workspace.buffer[0] = *(int *)(ap - 4);
            text = workspace.buffer;
            length = 1;
            break;
        case '%':
            workspace.buffer[0] = '%';
            text = workspace.buffer;
            length = 1;
            break;
        case 255:
            goto invalid;
        default:
invalid: {
    int remainder = strlen(percent);
    if (remainder && !write(context, percent, remainder)) {
        return -1;
    }
    return count + remainder;
}
        }
        {
            field = length;
            if (workspace.info.justify != 0) {
                padding = workspace.info.justify == 2 ? '0' : ' ';
                if ((*text == '+' || *text == '-' || *text == ' ') && padding == '0') {
                    if (!write(context, text, 1)) {
                        return -1;
                    }
                    text++;
                    length--;
                }
                while (field < workspace.info.width) {
                    if (!write(context, &padding, 1)) {
                        return -1;
                    }
                    field++;
                }
            }
            if (length && !write(context, text, length)) {
                return -1;
            }
            if (workspace.info.justify == 0) {
                while (field < workspace.info.width) {
                    space = ' ';
                    if (!write(context, &space, 1)) {
                        return -1;
                    }
                    field++;
                }
            }
            count += field;
        }
    } while (*format);
done:
    return count;
}

u32 __FileWrite(void *file, const char *data, u32 count) {
    if (__fwrite(data, 1, count, file) != count) {
        file = 0;
    }
    return (u32)file;
}

u32 __StringWrite(void *arg, const char *data, u32 count) {
    String *out = arg;
    if (out->count + count > out->size) {
        count = out->size - out->count;
    }
    memcpy(out->buffer + out->count, data, count);
    out->count += count;
    return 1;
}

static inline void lock(int index) {
    if (!OS_TryLockMutex(&__cs[index])) {
        __cs_id[index] = OS_GetCurrentThread()->id;
        __cs_ref[index] = 1;
    } else if (__cs_id[index] == OS_GetCurrentThread()->id) {
        __cs_ref[index]++;
    } else {
        OS_LockMutex(&__cs[index]);
        __cs_id[index] = OS_GetCurrentThread()->id;
        __cs_ref[index] = 1;
    }
}

static inline void unlock(int index) {
    if (--__cs_ref[index] == 0) {
        OS_UnlockMutex(&__cs[index]);
    }
}

int printf(const char *format, ...) {
    va_list args;
    int result;
    if (fwide(__files + 0x4c, -1) >= 0) {
        return -1;
    }
    lock(3);
    va_start(args, format);
    result = __pformatter(__FileWrite, __files + 0x4c, format, args);
    va_end(args);
    unlock(3);
    return result;
}

int vsnprintf(char *buffer, u32 size, const char *format, va_list args) {
    String out;
    out.buffer = buffer;
    out.size = size;
    out.count = 0;
    int result = __pformatter(__StringWrite, &out, format, args);
    if (buffer) {
        if ((u32)result < size) {
            buffer[result] = 0;
        } else if (size) {
            buffer[size - 1] = 0;
        }
    }
    return result;
}

int vsprintf(char *buffer, const char *format, va_list args) {
    return vsnprintf(buffer, -1, format, args);
}

int snprintf(char *buffer, u32 size, const char *format, ...) {
    va_list args;
    va_start(args, format);
    return vsnprintf(buffer, size, format, args);
}

int sprintf(char *buffer, const char *format, ...) {
    va_list args;
    va_start(args, format);
    return vsnprintf(buffer, -1, format, args);
}
