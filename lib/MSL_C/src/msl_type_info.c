#include <nitro/types.h>

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

#pragma force_active on

// std::type_info and the __cxxabiv1 class type info destructors and comparison. (Written as C with the
// mangled names.)

typedef struct TypeInfo {
    void *vtable;
    const char *name;
} TypeInfo;

int strcmp(const char *, const char *);
void _ZdlPv(void *p);

void _ZNSt9type_infoD2Ev(void *self);
int _ZNKSt9type_infoeqERKS_(const TypeInfo *a, const TypeInfo *b);
void *_ZN10__cxxabiv117__class_type_infoD1Ev(void *p);
void *_ZN10__cxxabiv117__class_type_infoD0Ev(void *p);
void *_ZN10__cxxabiv117__class_type_infoD2Ev(void *p);
void *_ZN10__cxxabiv120__si_class_type_infoD1Ev(void *p);
void *_ZN10__cxxabiv120__si_class_type_infoD0Ev(void *p);

void _ZNSt9type_infoD2Ev(void *);

void _ZNSt9type_infoD2Ev(void *self) {
}

int _ZNKSt9type_infoeqERKS_(const TypeInfo *a, const TypeInfo *b) {
    if (a == b || strcmp(a->name, b->name) == 0) {
        return 1;
    }
    return 0;
}

void *_ZN10__cxxabiv117__class_type_infoD1Ev(void *p) {
    _ZNSt9type_infoD2Ev(p);
    return p;
}

void *_ZN10__cxxabiv117__class_type_infoD0Ev(void *p) {
    _ZNSt9type_infoD2Ev(p);
    _ZdlPv(p);
    return p;
}

void *_ZN10__cxxabiv117__class_type_infoD2Ev(void *p) {
    _ZNSt9type_infoD2Ev(p);
    return p;
}

void *_ZN10__cxxabiv120__si_class_type_infoD1Ev(void *p) {
    _ZN10__cxxabiv117__class_type_infoD2Ev(p);
    return p;
}

void *_ZN10__cxxabiv120__si_class_type_infoD0Ev(void *p) {
    _ZN10__cxxabiv117__class_type_infoD2Ev(p);
    _ZdlPv(p);
    return p;
}
