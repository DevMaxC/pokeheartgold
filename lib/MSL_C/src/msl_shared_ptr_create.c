#include <nitro/types.h>

#include "msl_shared_ptr_internal.h"

#pragma force_active on

// std::exception destructors, the std::tr1::shared_ptr<char> constructor taking ownership of a char array,
// and the array deleter's get_deleter / dispose.

void *_ZNSt9exceptionD2Ev(void *self) {
    return self;
}

SharedPtr *_ZNSt3tr110shared_ptrIcEC1IcNSt6detail14default_deleteIA0_cEEEEPT_T0_(SharedPtr *self, void *pointer, DefaultDelete deleter) {
    MovePtr owner;
    SharedPtrDeleter *control;
    self->pointer = pointer;
    owner.pointer = pointer;
    owner.deleter = &deleter;
    control = _Znwm(sizeof(SharedPtrDeleter));
    if (control) {
        control->vtable = (void (**)(void *))_02111540;
        control->references = 1;
        control->weakReferences = 1;
        control->vtable = (void (**)(void *))_02111558;
        control->pointer = pointer;
    }
    self->control = control;
    // ownership passed to the deleter
    owner.pointer = NULL;
    _ZN10Metrowerks8move_ptrIcRNSt6detail14default_deleteIA0_cEEED1Ev(&owner);
    return self;
}

void *_ZNSt9exceptionD0Ev(void *self) {
    _ZdlPv(self);
    return self;
}

void *_ZNSt9exceptionD1Ev(void *self) {
    return self;
}

void *_ZNKSt3tr16detail18shared_ptr_deleterIcNSt6detail14default_deleteIA0_cEEE11get_deleterERKSt9type_info(void *self, const void *type) {
    return _ZNKSt9type_infoeqERKS_(type, _02111514) ? (u8 *)self + 12 : NULL;
}

void _ZNSt3tr16detail18shared_ptr_deleterIcNSt6detail14default_deleteIA0_cEEE7disposeEv(SharedPtrDeleter *self) {
    _ZdaPv(self->pointer);
}
