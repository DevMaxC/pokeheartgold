#include <nitro/types.h>

#include "msl_shared_ptr_internal.h"

#pragma force_active on

// Destructors: Metrowerks::move_ptr<char>, the shared_ptr<char> array deleter, shared_ptr_deleter_common,
// std::logic_error and std::length_error (their message is a shared_ptr<char> at offset 4).

void *_ZN10Metrowerks8move_ptrIcRNSt6detail14default_deleteIA0_cEEED1Ev(void *self) {
    if (*(void **)self) {
        _ZdaPv(*(void **)self);
    }
    return self;
}

void *_ZNSt3tr16detail18shared_ptr_deleterIcNSt6detail14default_deleteIA0_cEEED0Ev(void *self) {
    _ZdlPv(self);
    return self;
}

void *_ZNSt3tr16detail18shared_ptr_deleterIcNSt6detail14default_deleteIA0_cEEED1Ev(void *self) {
    return self;
}

void *_ZNSt3tr16detail25shared_ptr_deleter_commonD2Ev(SharedPtrDeleter *self) {
    return (void *)self->references;
}

void *_ZNSt11logic_errorD1Ev(void *self) {
    _ZNSt3tr110shared_ptrIcED1Ev((u8 *)self + 4);
    return self;
}

void *_ZNSt11logic_errorD0Ev(void *self) {
    _ZNSt3tr110shared_ptrIcED1Ev((u8 *)self + 4);
    _ZdlPv(self);
    return self;
}

void *_ZNSt12length_errorD1Ev(void *self) {
    _ZNSt3tr110shared_ptrIcED1Ev((u8 *)self + 4);
    return self;
}

void *_ZNSt12length_errorD0Ev(void *self) {
    _ZNSt3tr110shared_ptrIcED1Ev((u8 *)self + 4);
    _ZdlPv(self);
    return self;
}
