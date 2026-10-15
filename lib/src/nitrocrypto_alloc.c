#include "nitrocrypto_bn.h"

// Allocator hooks of the library (default: the main arena heap).

// MWCC 1.2 emits a file's functions in reverse order: the functions are defined last-to-first here
// (link order is bottom-up).

void *CRYPTOi_MyAlloc(u32 size) {
    if (CRYPTOi_MyAllocFunc != NULL) {
        return CRYPTOi_MyAllocFunc(size);
    }
    return OS_AllocFromHeap(OS_ARENA_MAIN, -1, size); // -1: the arena's current heap
}

void CRYPTOi_MyFree(void *ptr) {
    if (CRYPTOi_MyFreeFunc != NULL) {
        CRYPTOi_MyFreeFunc(ptr);
    } else {
        OS_FreeToHeap(OS_ARENA_MAIN, -1, ptr);
    }
}

void CRYPTO_SetAllocator(CryptoAlloc alloc, CryptoFree free) {
    CRYPTOi_MyAllocFunc = alloc;
    CRYPTOi_MyFreeFunc = free;
}
