#include <nitro/types.h>

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

#pragma force_active on

// The out-of-line parts of the C++ allocation support: operator delete[], std::bad_alloc's deleting
// destructor and what(). (Written as C with the mangled names.)

extern const char sStr_bad_alloc[]; // what() string

void _ZdlPv(void *p);
void _ZdaPv(void *p);
void *_ZNSt9bad_allocD0Ev(void *p);
const char *_ZNKSt9bad_alloc4whatEv(const void *p);

void _ZdaPv(void *);
#pragma force_active on

void _ZdaPv(void *p) {
    _ZdlPv(p);
}

void *_ZNSt9bad_allocD0Ev(void *);

void *_ZNSt9bad_allocD0Ev(void *p) {
    _ZdlPv(p);
    return p;
}

const char *_ZNKSt9bad_alloc4whatEv(const void *);
#pragma force_active on

const char *_ZNKSt9bad_alloc4whatEv(const void *p) {
    return sStr_bad_alloc;
}
