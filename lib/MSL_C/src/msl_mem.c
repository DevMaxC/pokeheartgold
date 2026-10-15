typedef unsigned int size_t;
#pragma thumb off

extern void __fill_mem(void *, int, size_t);
void *memcpy(void *dst, const void *src, size_t n);
void *memmove(void *dst, const void *src, size_t n);
void *memset(void *dst, int c, size_t n);
void *memchr(const void *src, int c, size_t n);
void *__memrchr(const void *src, int c, size_t n);
int memcmp(const void *lhs, const void *rhs, size_t n);

void *memcpy(void *dst, const void *src, size_t n) {
    char *d = dst;
    const char *s = src;
    if (n != 0) {
        do {
            *d++ = *s++;
        } while (--n != 0);
    }
    return dst;
}

void *memmove(void *dst, const void *src, size_t n) {
    const char *s = src;
    if (s >= (char *)dst) {
        char *d = dst;
        if (n != 0) {
            do {
                *d++ = *s++;
            } while (--n != 0);
        }
    } else {
        const char *tail = s + n;
        char *d = (char *)dst + n;
        if (n != 0) {
            do {
                *--d = *--tail;
            } while (--n != 0);
        }
    }
    return dst;
}

void *memset(void *dst, int c, size_t n) {
    void *save = dst;
    __fill_mem(dst, c, n);
    return save;
}

void *memchr(const void *src, int c, size_t n) {
    const unsigned char *s = src;
    int target = c & 0xff;
    if (n != 0) {
        do {
            if (*s++ == target) {
                return (void *)(s - 1);
            }
        } while (--n != 0);
    }
    return 0;
}

void *__memrchr(const void *src, int c, size_t n) {
    int target = c & 0xff;
    const unsigned char *s = (const unsigned char *)src + n;
    if (n != 0) {
        do {
            if (*--s == target) {
                return (void *)s;
            }
        } while (--n != 0);
    }
    return 0;
}

int memcmp(const void *lhs, const void *rhs, size_t n) {
    const unsigned char *a = lhs;
    const unsigned char *b = rhs;
    if (n != 0) {
        do {
            int ca = *a++;
            int cb = *b++;
            if (ca != cb) {
                return a[-1] < b[-1] ? -1 : 1;
            }
        } while (--n != 0);
    }
    return 0;
}
