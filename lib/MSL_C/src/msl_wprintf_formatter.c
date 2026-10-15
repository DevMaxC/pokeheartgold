#pragma dollar_identifiers on
#include <nitro.h>

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>
#include <stdarg.h>
#include <string.h>

// MSL wide formatted output: the u16 versions of the printf machinery (parse_format__wide, the number
// conversions, round_decimal__wide, __wpformatter), the string writer and swprintf / vswprintf.

typedef u16 Wide;

// One parsed conversion specification (passed by value to the conversion functions).
typedef struct Format {
    u8 justify; // 0: left, 1: right, 2: zero padded
    u8 sign;    // 0: '-' only, 1: '+', 2: ' '
    u8 precisionSet;
    u8 alternate; // '#'
    u8 length;    // size modifier
    u8 pad;
    u16 conversion; // conversion character
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
    u8 length;
    u8 digits[32];
} Decimal;

// The same decimal as round_decimal__wide sees it.
typedef struct RoundedDecimal {
    u8 sign;
    u8 pad;
    s16 exponent;
    u8 count;
    s8 digits[33];
} RoundedDecimal;

typedef struct Float2StrWork {
    DecimalFormat input;
    Decimal output;
} Float2StrWork;

// float2str__wide builds the narrow string here, then widens it.
typedef struct OutputBuffer {
    char bytes[512];
} OutputBuffer;

// __wStringWrite context.
typedef struct WideString {
    u16 *buffer;
    u32 size;
    u32 count;
} WideString;

typedef u16 *(*WideWriter)(void *context, const u16 *data, u32 count);

#define DIGIT(c) ((u32)(c) >= 128 ? 0 : __wctype_mapC[(c)] & 8)
#define NEXT(t)  (*(t *)((char *)(args = (char *)args + sizeof(t)) - sizeof(t)))

extern const u16 __wctype_mapC[];
extern u16 wstr$6DE4[]; // string constants of double2hex__wide / float2str__wide
extern u16 wstr$6DF0[];
extern u16 wstr$6DFC[];
extern u16 wstr$6E08[];
extern u16 wstr$6E10[];
extern u16 wstr$6E18[];
extern u16 wstr$6E24[];
extern u16 wstr$6E30[];
extern u16 wstr$6E38[];
extern Wide buff_ptr$6E40[];
extern char strptr$6E44[];

extern void __num2dec(const DecimalFormat *format, double x, Decimal *decimal);
extern double fabs(double);
extern u16 *wcscpy(u16 *, const u16 *);
extern Wide *wcschr(const Wide *, int);
extern u32 wcslen(const Wide *);
extern Wide *wmemchr(const Wide *, int, u32);
extern u16 *wmemcpy(u16 *, const u16 *, u32);
extern int mbstowcs(Wide *, const char *, u32);
extern int mbtowc(Wide *, const char *, u32);

u16 *parse_format__wide(u16 *start, char **args, Format *out);
u16 *long2str__wide(long num, u16 *buf, Format f);
u16 *longlong2str__wide(u64 value, u16 *end, Format f);
u16 *double2hex__wide(double value, u16 *end, Format f);
void round_decimal__wide(RoundedDecimal *d, int n);
u16 *float2str__wide(double x, u16 *wideend, Format fmt);
int __wpformatter(WideWriter write, void *cookie, u16 *format, char *args);
u16 *__wStringWrite(void *arg, const u16 *data, u32 count);
int swprintf(u16 *buffer, u32 size, const u16 *format, ...);
int vswprintf(u16 *buffer, u32 size, const u16 *format, va_list args);

#pragma force_active on

u16 *parse_format__wide(u16 *start, char **args, Format *out) {
    Format f;
    int c, more;
    u16 *p;
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
        f.conversion = 65535;
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
            f.length = 4;
        }
        if (!f.precisionSet) {
            f.precision = 1;
        } else if (f.justify == 2) {
            f.justify = 1;
        }
        break;
    case 'f':
    case 'F':
        if (f.length == 2 || f.length == 6 || f.length == 7 || f.length == 8 || f.length == 4) {
            f.conversion = 65535;
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
            f.conversion = 65535;
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
            f.conversion = 65535;
        } else if (!f.precisionSet) {
            f.precision = 6;
        }
        break;
    case 'p':
        f.length = 3;
        f.alternate = 1;
        f.conversion = 'x';
        f.precision = 8;
        break;
    case 'c':
        if (f.length == 3) {
            f.length = 5;
        } else if (f.precisionSet || f.length != 0) {
            f.conversion = 65535;
        }
        break;
    case 's':
        if (f.length == 3) {
            f.length = 5;
        } else if (f.length != 0) {
            f.conversion = 65535;
        }
        break;
    case 'n':
        if (f.length == 9) {
            f.length = 4;
        }
        break;
    default:
        f.conversion = 65535;
        break;
    }
    *out = f;
    return p + 1;
}

u16 *long2str__wide(long num, u16 *buf, Format f);

u16 *long2str__wide(long num, u16 *buf, Format f) {
    unsigned long base;
    u16 *p = buf;
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

u16 *longlong2str__wide(u64 value, u16 *end, Format f) {
    u64 base;
    u16 *p;
    int negative, precision, sign, count;
    s32 width, conversion, alt;
    int digit;
    p = end;
    *--p = 0;
    precision = f.precision;
    alt = f.alternate;
    conversion = f.conversion;
    negative = 0;
    count = 0;
    width = f.width;
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

u16 *double2hex__wide(double value, u16 *end, Format f) {
    Format ef;
    DecimalFormat form;
    Decimal dec;
    u32 exponent;
    char temp;
    u8 *hb;
    int i;
    double v = value;
    int index;
    int j;
    char *bytes;
    u16 *p;
    u8 digit;
    if (f.precision > 509) {
        return 0;
    }
    form.style = 0;
    form.digits = 32;
    __num2dec(&form, v, &dec);
    if (fabs(value) == 0) {
        p = end - 6;
        wcscpy(p, wstr$6DE4);
        return p;
    }
    if (dec.digits[0] == 'I') {
        if (dec.sign) {
            p = end - 5;
            if (f.conversion == 'A') {
                wcscpy(p, wstr$6DF0);
            } else {
                wcscpy(p, wstr$6DFC);
            }
        } else {
            p = end - 4;
            if (f.conversion == 'A') {
                wcscpy(p, wstr$6E08);
            } else {
                wcscpy(p, wstr$6E10);
            }
        }
        return p;
    }
    if (dec.digits[0] == 'N') {
        if (dec.sign) {
            p = end - 5;
            if (f.conversion == 'A') {
                wcscpy(p, wstr$6E18);
            } else {
                wcscpy(p, wstr$6E24);
            }
        } else {
            p = end - 4;
            if (f.conversion == 'A') {
                wcscpy(p, wstr$6E30);
            } else {
                wcscpy(p, wstr$6E38);
            }
        }
        return p;
    }
    ef.justify = 1;
    ef.sign = 1;
    ef.precisionSet = 0;
    ef.alternate = 0;
    ef.length = 0;
    ef.width = 0;
    ef.precision = 1;
    ef.conversion = 'd';
    bytes = (char *)&value;
    for (j = 0; j < 4; j++) {
        temp = bytes[j];
        bytes[j] = bytes[7 - j];
        bytes[7 - j] = temp;
    }
    exponent = (u32)((u8 *)&value)[0] << 25 | (u32)((u8 *)&value)[1] << 17;
    exponent = exponent >> 21 & 0x7ff;
    p = long2str__wide(exponent - 1023, end, ef);
    if (f.conversion == 'a') {
        *--p = 'p';
    } else {
        *--p = 'P';
    }
    hb = (u8 *)&value;
    index = f.precision * 4 + 11;
    for (i = f.precision; i >= 1; i--) {
        if (index < 64) {
            digit = hb[index >> 3] >> (7 - (index & 7));
            if ((index & ~7) != ((index - 4) & ~7)) {
                digit |= (hb[(index >> 3) - 1] << 8) >> (7 - (index & 7));
            }
            digit &= 15;
            if (digit < 10) {
                digit += '0';
            } else if (f.conversion == 'a') {
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
    if (f.precision || f.alternate) {
        *--p = '.';
    }
    *--p = '1';
    if (f.conversion == 'a') {
        *--p = 'x';
    } else {
        *--p = 'X';
    }
    *--p = '0';
    if (dec.sign) {
        *--p = '-';
    } else if (f.sign == 1) {
        *--p = '+';
    } else if (f.sign == 2) {
        *--p = ' ';
    }
    return p;
}

void round_decimal__wide(RoundedDecimal *d, int n) {
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

u16 *float2str__wide(double x, u16 *wideend, Format fmt) {
    Float2StrWork stage;
    OutputBuffer backing;
    int exp;
    int n;
    int i;
    int integer;
    int sign;
    int expsign;
    int alternate;
    u16 *wide;
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
    stage.input.style = 0;
    stage.input.digits = 32;
    __num2dec(&stage.input, x, &stage.output);
    p = (char *)stage.output.digits + stage.output.length;
    while (stage.output.length > 1 && *--p == '0') {
        stage.output.length--;
        stage.output.exponent++;
    }
    switch (stage.output.digits[0]) {
    case '0':
        stage.output.exponent = 0;
        break;
    case 'I':
        if (x < 0.0) {
            wide = wideend - 5;
            if ((unsigned)conversion >= 128 ? 0 : __wctype_mapC[conversion] & 0x200) {
                wcscpy(wide, wstr$6DF0);
            } else {
                wcscpy(wide, wstr$6DFC);
            }
        } else {
            wide = wideend - 4;
            if ((unsigned)conversion >= 128 ? 0 : __wctype_mapC[conversion] & 0x200) {
                wcscpy(wide, wstr$6E08);
            } else {
                wcscpy(wide, wstr$6E10);
            }
        }
        return wide;
    case 'N':
        if (stage.output.sign) {
            wide = wideend - 5;
            if ((unsigned)conversion >= 128 ? 0 : __wctype_mapC[conversion] & 0x200) {
                wcscpy(wide, wstr$6E18);
            } else {
                wcscpy(wide, wstr$6E24);
            }
        } else {
            wide = wideend - 4;
            if ((unsigned)conversion >= 128 ? 0 : __wctype_mapC[conversion] & 0x200) {
                wcscpy(wide, wstr$6E30);
            } else {
                wcscpy(wide, wstr$6E38);
            }
        }
        return wide;
    }
    stage.output.exponent += stage.output.length - 1;
    out = backing.bytes + 512;
    *--out = 0;
    switch (conversion) {
    case 'g':
    case 'G':
        if (stage.output.length > precision) {
            round_decimal__wide((RoundedDecimal *)&stage.output, precision);
        }
        if (stage.output.exponent < -4 || stage.output.exponent >= precision) {
            if (alternate) {
                precision--;
            } else {
                precision = stage.output.length - 1;
            }
            if (conversion == 'g') {
                conversion = 'e';
            } else {
                conversion = 'E';
            }
            goto exponential;
        }
        if (alternate) {
            precision -= stage.output.exponent + 1;
        } else {
            precision = stage.output.length - (stage.output.exponent + 1);
            if (precision < 0) {
                precision = 0;
            }
        }
        goto fixed;
    case 'e':
    case 'E':
exponential:
        if (stage.output.length > precision + 1) {
            round_decimal__wide((RoundedDecimal *)&stage.output, precision + 1);
        }
        exp = stage.output.exponent;
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
        if ((backing.bytes - out) + precision > 509) {
            return NULL;
        }
        if (stage.output.length < precision + 1) {
            n = precision + 2 - stage.output.length;
            while (--n) {
                *--out = '0';
            }
        }
        p = (char *)stage.output.digits + stage.output.length;
        n = stage.output.length;
        while (--n) {
            *--out = *--p;
        }
        if (precision != 0 || alternate) {
            *--out = '.';
        }
        *--out = stage.output.digits[0];
        if (stage.output.sign) {
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
        frac = stage.output.length - stage.output.exponent - 1;
        if (frac < 0) {
            frac = 0;
        }
        if (frac > precision) {
            round_decimal__wide((RoundedDecimal *)&stage.output, stage.output.length - (frac - precision));
            frac = stage.output.length - stage.output.exponent - 1;
            if (frac < 0) {
                frac = 0;
            }
        }
        integer = stage.output.exponent + 1;
        if (integer < 0) {
            integer = 0;
        }
        if (integer + frac > 509) {
            return NULL;
        }
        p = (char *)stage.output.digits + stage.output.length;
        for (n = 0; n < precision - frac; n++) {
            *--out = '0';
        }
        for (i = 0; i < frac && i < stage.output.length; i++) {
            *--out = *--p;
        }
        for (; i < frac; i++) {
            *--out = '0';
        }
        if (precision || alternate) {
            *--out = '.';
        }
        if (integer) {
            for (i = 0; i < integer - stage.output.length; i++) {
                *--out = '0';
            }
            for (; i < integer; i++) {
                *--out = *--p;
            }
        } else {
            *--out = '0';
        }
        if (stage.output.sign) {
            *--out = '-';
        } else if (sign == 1) {
            *--out = '+';
        } else if (sign == 2) {
            *--out = ' ';
        }
        break;
    }
    wide = wideend - strlen(out) - 1;
    mbstowcs(wide, out, strlen(out));
    return wide;
}

int __wpformatter(WideWriter write, void *cookie, u16 *format, char *args) {
    Wide buffer[512];
    Format spec;
    Wide padding = 32, space;
    char narrow;
    long long large;
    int total = 0;
    Wide *start, *text;
    int length, width;
    int number;
    while (*format) {
        start = wcschr(format, 37);
        if (!start) {
            length = wcslen(format);
            total += length;
            if (length && !write(cookie, format, length)) {
                return -1;
            }
            break;
        }
        length = start - format;
        total += length;
        if (length && !write(cookie, format, length)) {
            return -1;
        }
        format = parse_format__wide(start, &args, &spec);
        switch (spec.conversion) {
        case 'd':
        case 'i':
            if (spec.length == 3) {
                number = NEXT(long);
            } else if (spec.length == 4) {
                large = NEXT(long long);
            } else if (spec.length == 6) {
                large = NEXT(long long);
            } else if (spec.length == 7) {
                number = NEXT(long);
            } else if (spec.length == 8) {
                number = NEXT(unsigned int);
            } else {
                number = NEXT(int);
            }
            if (spec.length == 2) {
                number = (s16)number;
            }
            if (spec.length == 4 || spec.length == 6) {
                text = longlong2str__wide(large, buffer + 512, spec);
                if (!text) {
                    goto invalid;
                }
            } else {
                text = long2str__wide(number, buffer + 512, spec);
                if (!text) {
                    goto invalid;
                }
            }
            length = buffer + 511 - text;
            break;
        case 'X':
        case 'o':
        case 'u':
        case 'x':
            if (spec.length == 3) {
                number = NEXT(unsigned long);
            } else if (spec.length == 4) {
                large = NEXT(unsigned long long);
            } else if (spec.length == 6) {
                large = NEXT(unsigned long long);
            } else if (spec.length == 7) {
                number = NEXT(unsigned long);
            } else if (spec.length == 8) {
                number = NEXT(u32);
            } else {
                number = NEXT(unsigned int);
            }
            if (spec.length == 2) {
                number = (u16)number;
            }
            if (spec.length == 4 || spec.length == 6) {
                text = longlong2str__wide(large, buffer + 512, spec);
                if (!text) {
                    goto invalid;
                }
            } else {
                text = long2str__wide(number, buffer + 512, spec);
                if (!text) {
                    goto invalid;
                }
            }
            length = buffer + 511 - text;
            break;
        case 'E':
        case 'F':
        case 'G':
        case 'e':
        case 'f':
        case 'g': {
            double value;
            if (spec.length == 9) {
                value = NEXT(long double);
            } else {
                value = NEXT(double);
            }
            text = float2str__wide(value, buffer + 512, spec);
            if (!text) {
                goto invalid;
            }
            length = buffer + 511 - text;
            break;
        }
        case 'A':
        case 'a': {
            double value;
            if (spec.length == 9) {
                value = NEXT(long double);
            } else {
                value = NEXT(double);
            }
            text = double2hex__wide(value, buffer + 512, spec);
            if (!text) {
                goto invalid;
            }
            length = buffer + 511 - text;
            break;
        }
        case 's':
            if (spec.length == 5) {
                text = NEXT(Wide *);
                if (!text) {
                    text = buff_ptr$6E40;
                }
                if (spec.alternate) {
                    length = *text++ & 255;
                    if (spec.precisionSet && length > spec.precision) {
                        length = spec.precision;
                    }
                } else if (spec.precisionSet) {
                    Wide *end;
                    length = spec.precision;
                    end = wmemchr(text, 0, length);
                    if (end) {
                        length = end - text;
                    }
                } else {
                    length = wcslen(text);
                }
            } else {
                char *str = NEXT(char *);
                int count;
                if (!str) {
                    str = strptr$6E44;
                }
                if (spec.alternate) {
                    count = *text & 255;
                    if (spec.precisionSet && count > spec.precision) {
                        count = spec.precision;
                    }
                } else if (spec.precisionSet) {
                    char *end;
                    count = spec.precision;
                    end = memchr(str, 0, count);
                    if (end) {
                        count = end - str;
                    }
                } else {
                    count = strlen(str);
                }
                length = mbstowcs(buffer, str, count);
                if (length < 0) {
                    goto invalid;
                }
                text = buffer;
            }
            break;
        case 'n': {
            text = NEXT(Wide *);
            switch (spec.length) {
            case 0:
                *(int *)text = total;
                break;
            case 2:
                *(short *)text = total;
                break;
            case 3:
                *(long *)text = total;
                break;
            case 6:
                *(long long *)text = total;
                break;
            case 7:
                *(int *)text = total;
                break;
            case 8:
                *(int *)text = total;
                break;
            case 4:
                *(long long *)text = total;
                break;
            default:
                break;
            }
            continue;
        }
        case 'c':
            text = buffer;
            if (spec.length == 5) {
                *text = NEXT(int);
                length = 1;
            } else {
                narrow = NEXT(int);
                length = mbtowc(text, &narrow, 1);
            }
            break;
        case '%':
            buffer[0] = 37;
            text = buffer;
            length = 1;
            break;
        case 65535:
        default:
invalid:
            length = wcslen(start);
            if (length && !write(cookie, start, length)) {
                return -1;
            }
            return total + length;
        }
        width = length;
        if (spec.justify) {
            u32 pad = spec.justify == 2 ? 48 : 32;
            padding = pad;
            if ((*text == 43 || *text == 45 || *text == 32) && pad == 48) {
                if (!write(cookie, text, 1)) {
                    return -1;
                }
                text++;
                length--;
            }
            while (width < spec.width) {
                if (!write(cookie, &padding, 1)) {
                    return -1;
                }
                width++;
            }
        }
        if (length && !write(cookie, text, length)) {
            return -1;
        }
        if (!spec.justify) {
            while (width < spec.width) {
                space = 32;
                if (!write(cookie, &space, 1)) {
                    return -1;
                }
                width++;
            }
        }
        total += width;
    }
    return total;
}

u16 *__wStringWrite(void *arg, const u16 *data, u32 count) {
    WideString *out = arg;
    u16 *result;
    if (out->count + count > out->size) {
        count = out->size - out->count;
    }
    result = wmemcpy(out->buffer + out->count, data, count);
    out->count += count;
    return result;
}

int swprintf(u16 *buffer, u32 size, const u16 *format, ...) {
    va_list args;
    va_start(args, format);
    return vswprintf(buffer, size, format, args);
}

int vswprintf(u16 *buffer, u32 size, const u16 *format, va_list args) {
    WideString out;
    out.buffer = buffer;
    out.size = size;
    out.count = 0;
    int result = __wpformatter(__wStringWrite, &out, (u16 *)format, args);
    if (result < 0) {
        return result;
    }
    if ((u32)result < size) {
        buffer[result] = 0;
    } else {
        buffer[size - 1] = 0;
        return -1;
    }
    return result;
}
