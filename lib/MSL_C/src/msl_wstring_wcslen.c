typedef unsigned int size_t;
typedef unsigned short wchar_t;
#pragma thumb off

size_t wcslen(const wchar_t *s);
wchar_t *wcscpy(wchar_t *dest, const wchar_t *src);
wchar_t *wcschr(const wchar_t *s, int c);

size_t wcslen(const wchar_t *s) {
    size_t n = (size_t)-1;
    do {
        ++n;
    } while (*s++ != 0);
    return n;
}
