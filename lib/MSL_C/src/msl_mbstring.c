typedef unsigned short WChar;
typedef unsigned int Size;

extern Size strlen(const char *);
extern char *strncpy(char *, const char *, Size);

typedef struct {
    int (*mbtowc)(WChar *, const char *, Size);
    int (*wctomb)(char *, WChar);
} CtypeLocale;

typedef struct {
    void *time;
    void *collate;
    CtypeLocale *ctype;
} Locale;

extern Locale _current_locale;
int mbtowc(WChar *, const char *, Size);
int __mbtowc_noconv(WChar *, const char *, Size);
int __wctomb_noconv(char *, WChar);
int wctomb(char *, WChar);
Size mbstowcs(WChar *, const char *, Size);
Size wcstombs(char *, const WChar *, Size);

int mbtowc(WChar *out, const char *s, Size n) {
    return _current_locale.ctype->mbtowc(out, s, n);
}

int __mbtowc_noconv(WChar *out, const char *s, Size n) {
    if (s == 0) {
        return 0;
    }
    if (n == 0) {
        return -1;
    }
    if (out != 0) {
        *out = (unsigned char)*s;
    }
    if (*s == 0) {
        return 0;
    }
    return 1;
}

int __wctomb_noconv(char *out, WChar c) {
    if (out == 0) {
        return 0;
    }
    *out = c;
    return 1;
}

int wctomb(char *out, WChar c) {
    return _current_locale.ctype->wctomb(out, c);
}
