typedef unsigned int size_t;
#pragma thumb off

size_t strlen(const char *s);

size_t strlen(const char *s) {
    size_t n = (size_t)-1;
    do {
        n++;
    } while (*s++ != 0);
    return n;
}
