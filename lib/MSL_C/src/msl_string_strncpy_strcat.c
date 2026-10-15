typedef unsigned int size_t;
#pragma thumb off

char *strncpy(char *dest, const char *src, size_t n);
char *strcat(char *dest, const char *src);
char *strncat(char *dest, const char *src, size_t n);

char *strncpy(char *dest, const char *src, size_t n) {
    char *d = dest;
    if (n != 0) {
        do {
            char *old = d;
            *d++ = *src++;
            if (*old == 0) {
                if (--n == 0) {
                    return dest;
                }
                do {
                    *d++ = 0;
                } while (--n != 0);
                return dest;
            }
        } while (--n != 0);
    }
    return dest;
}

char *strcat(char *dest, const char *src) {
    char *d = dest;
    while (*d++ != 0) {}
    --d;
    while ((*d++ = *src++) != 0) {}
    return dest;
}

char *strncat(char *dest, const char *src, size_t n) {
    char *d = dest;
    while (*d++ != 0) {}
    --d;
    if (n != 0) {
        do {
            if ((*d++ = *src++) == 0) {
                --d;
                break;
            }
        } while (--n != 0);
    }
    *d = 0;
    return dest;
}
