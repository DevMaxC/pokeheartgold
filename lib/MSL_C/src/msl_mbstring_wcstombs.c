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

Size wcstombs(char *dest, const WChar *src, Size count) {
    Size written = 0;
    char buffer[4];
    if (dest == 0 || src == 0) {
        return 0;
    }
    while (1) {
        Size converted;
        if (*src == 0) {
            dest[written] = 0;
            break;
        }
        converted = wctomb(buffer, *src++);
        if (written + converted > count) {
            break;
        }
        strncpy(dest + written, buffer, converted);
        written += converted;
        if (written > count) {
            break;
        }
    }
    return written;
}
