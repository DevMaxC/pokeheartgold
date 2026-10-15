typedef unsigned int size_t;
#pragma thumb off

int strncmp(const char *a, const char *b, size_t n);
char *strchr(const char *s, int c);
size_t strspn(const char *s, const char *accept);

int strncmp(const char *a, const char *b, size_t n) {
    if (n != 0) {
        do {
            int cb = (unsigned char)*b++;
            int ca = (unsigned char)*a++;
            if (ca != cb) {
                return ca - cb;
            }
            if (ca == 0) {
                break;
            }
        } while (--n != 0);
    }
    return 0;
}

char *strchr(const char *s, int c) {
    signed char ch = *s++;
    c = (signed char)c;
    if (ch != 0) {
        do {
            if (ch == c) {
                return (char *)(s - 1);
            }
            ch = *s++;
        } while (ch != 0);
    }
    return c != 0 ? 0 : (char *)(s - 1);
}

size_t strspn(const char *s, const char *accept) {
    unsigned char bits[32] = { 0 };
    const unsigned char *q = (const unsigned char *)accept;
    int c = *q++;
    while (c != 0) {
        bits[(unsigned char)c >> 3] |= (unsigned char)(1 << (c & 7));
        c = *q++;
    }
    const unsigned char *p = (const unsigned char *)s;
    c = *p++;
    while (c != 0) {
        if (bits[(unsigned char)c >> 3] & (unsigned char)(1 << (c & 7))) {
            break;
        }
        c = *p++;
    }
    return p - (const unsigned char *)s - 1;
}
