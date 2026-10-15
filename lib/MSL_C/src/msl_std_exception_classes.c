#include <nitro/types.h>

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

#pragma force_active on

// std::bad_exception deleting destructor and what(), throwing std::bad_alloc, std::bad_alloc complete
// object destructor (written as C under their mangled names).

extern const char _ZZNKSt13bad_exception4whatEvEs[];
extern u8 _02111734;
extern const u8 _ZTVSt9bad_alloc[];
extern char sStr_StdExceptionStdBadAlloc[];

void _ZdlPv(void *ptr);
void __throw(char *throwtype, void *location, void (*dtor)(void *));

void *_ZNSt13bad_exceptionD0Ev(void *self);
const char *_ZNKSt13bad_exception4whatEv(const void *self);
void _ZSt17__throw_bad_allocv(void);
void _ZNSt9bad_allocD1Ev(void *self);

void *_ZNSt13bad_exceptionD0Ev(void *self) {
    _ZdlPv(self);
    return self;
}

const char *_ZNKSt13bad_exception4whatEv(const void *self) {
    return _ZZNKSt13bad_exception4whatEvEs;
}

void _ZSt17__throw_bad_allocv(void) {
    const void *vtable;
    if (_02111734) {
        vtable = _ZTVSt9bad_alloc;
        __throw(sStr_StdExceptionStdBadAlloc, &vtable, _ZNSt9bad_allocD1Ev);
    }
}

void _ZNSt9bad_allocD1Ev(void *self) {
}
