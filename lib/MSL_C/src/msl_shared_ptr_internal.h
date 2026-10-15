#ifndef MSL_SHARED_PTR_INTERNAL_H
#define MSL_SHARED_PTR_INTERNAL_H

#include <nitro/types.h>

// std::tr1::shared_ptr<char> support (the message string of std::logic_error), written as C under the
// mangled C++ names.

// std::tr1::detail::shared_ptr_deleter<char, std::detail::default_delete<char[]> >
typedef struct SharedPtrDeleter {
    void (**vtable)(void *); // D1, D0, get_deleter, dispose
    int references;
    int weakReferences;
    void *pointer; // also the address of the (empty) deleter object
} SharedPtrDeleter;

// std::detail::default_delete<char[]> (empty)
typedef struct DefaultDelete {
    u8 unused;
} DefaultDelete;

// std::tr1::shared_ptr<char>
typedef struct SharedPtr {
    void *pointer;
    SharedPtrDeleter *control;
} SharedPtr;

// Metrowerks::move_ptr<char, std::detail::default_delete<char[]> &>
typedef struct MovePtr {
    void *pointer;
    DefaultDelete *deleter;
} MovePtr;

extern u8 _02111514[]; // typeid(std::detail::default_delete<char[]>)
extern u8 _02111540[]; // vtable stored by the shared_ptr_deleter_common base constructor
extern u8 _02111558[]; // shared_ptr_deleter<char, default_delete<char[]> > vtable

void *_Znwm(u32 size);
void _ZdlPv(void *ptr);
void _ZdaPv(void *ptr);
int _ZNKSt9type_infoeqERKS_(const void *self, const void *other);

void *_ZNSt9exceptionD2Ev(void *self);
void *_ZNSt9exceptionD0Ev(void *self);
void *_ZNSt9exceptionD1Ev(void *self);
SharedPtr *_ZNSt3tr110shared_ptrIcEC1IcNSt6detail14default_deleteIA0_cEEEEPT_T0_(SharedPtr *self, void *pointer, DefaultDelete deleter);
void *_ZNSt3tr110shared_ptrIcED1Ev(void *self);
void *_ZNKSt3tr16detail18shared_ptr_deleterIcNSt6detail14default_deleteIA0_cEEE11get_deleterERKSt9type_info(void *self, const void *type);
void _ZNSt3tr16detail18shared_ptr_deleterIcNSt6detail14default_deleteIA0_cEEE7disposeEv(SharedPtrDeleter *self);
void *_ZN10Metrowerks8move_ptrIcRNSt6detail14default_deleteIA0_cEEED1Ev(void *self);
void *_ZNSt3tr16detail18shared_ptr_deleterIcNSt6detail14default_deleteIA0_cEEED0Ev(void *self);
void *_ZNSt3tr16detail18shared_ptr_deleterIcNSt6detail14default_deleteIA0_cEEED1Ev(void *self);
void *_ZNSt3tr16detail25shared_ptr_deleter_commonD2Ev(SharedPtrDeleter *self);
void *_ZNSt11logic_errorD1Ev(void *self);
void *_ZNSt11logic_errorD0Ev(void *self);
void *_ZNSt12length_errorD1Ev(void *self);
void *_ZNSt12length_errorD0Ev(void *self);
void _ZNSt3tr16detail25shared_ptr_deleter_common7releaseEv(SharedPtrDeleter *self);
void _ZNSt3tr16detail25shared_ptr_deleter_common12release_weakEv(SharedPtrDeleter *self);

#endif // MSL_SHARED_PTR_INTERNAL_H
