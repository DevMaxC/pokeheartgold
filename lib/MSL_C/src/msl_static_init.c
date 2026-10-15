#include <nitro/types.h>

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

#pragma force_active on

// C++ static initialisation and the chain of global destructors.

typedef void (*StaticInitializer)(void);

typedef struct DestructorChain DestructorChain;

struct DestructorChain {
    DestructorChain *next;
    void (*destructor)(void *, int);
    void *object;
};

extern StaticInitializer __sinit__[];
extern DestructorChain *__global_destructor_chain;

void __call_static_initializers(void);
void __destroy_global_chain(void);

void __call_static_initializers(void) {
    StaticInitializer *it = __sinit__;
    while (it && *it) {
        (*it)();
        it++;
    }
}

void __destroy_global_chain(void) {
    DestructorChain *node = __global_destructor_chain;
    if (node) {
        do {
            __global_destructor_chain = node->next;
            node->destructor(node->object, -1);
            node = __global_destructor_chain;
        } while (node);
    }
}
