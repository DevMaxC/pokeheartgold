typedef unsigned int size_t;
typedef unsigned short wchar_t;
#pragma thumb off

size_t wcslen(const wchar_t *s);
wchar_t *wcscpy(wchar_t *dest, const wchar_t *src);
wchar_t *wcschr(const wchar_t *s, int c);

wchar_t *wcschr(const wchar_t *s, int c) {
    wchar_t value = *s++;
    if (value != 0) {
        do {
            if (value == c) {
                return (wchar_t *)(s - 1);
            }
            value = *s++;
        } while (value != 0);
    }
    return c != 0 ? 0 : (wchar_t *)(s - 1);
}
