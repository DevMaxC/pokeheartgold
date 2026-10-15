typedef unsigned int size_t;
#pragma thumb off

char *strstr(const char *haystack, const char *needle);

char *strstr(const char *haystack, const char *needle) {
    const unsigned char *bytes = (const unsigned char *)needle;
    if (needle == 0 || *bytes == 0) {
        return (char *)haystack;
    }
    int first = *bytes;
    int cur = (unsigned char)*haystack;
    const char *next = haystack + 1;
    if (cur != 0) {
        do {
            if (cur == first) {
                const char *h = next;
                const unsigned char *n = bytes + 1;
                int hc;
                do {
                    cur = *n++;
                    hc = (unsigned char)*h++;
                    if (hc != cur) {
                        break;
                    }
                } while (hc != 0);
                if (cur == 0) {
                    return (char *)(next - 1);
                }
            }
            cur = (unsigned char)*next++;
        } while (cur != 0);
    }
    return 0;
}
