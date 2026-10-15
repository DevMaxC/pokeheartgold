#include <nitro/types.h>

#include "msl_shared_ptr_internal.h"

#pragma force_active on

// std::tr1::detail::shared_ptr_deleter_common::release_weak(): deletes the control block with the last weak
// reference.

void _ZNSt3tr16detail25shared_ptr_deleter_common12release_weakEv(SharedPtrDeleter *self) {
    if (--self->weakReferences != 0) {
        return;
    }
    if (self) {
        self->vtable[1](self);
    }
}
