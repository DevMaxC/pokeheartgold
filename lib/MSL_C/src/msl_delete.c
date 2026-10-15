#include <nitro/types.h>

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

#pragma force_active on

// operator delete(void *) (written as C under its mangled name).

void free(void *ptr);
void _ZdlPv(void *ptr);

void _ZdlPv(void *ptr) {
    if (ptr) {
        free(ptr);
    }
}
