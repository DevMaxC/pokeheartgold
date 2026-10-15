#include <nitro.h>
#include <nnsys/gfd_internal.h>

#pragma force_active on

NNSGfdTexKey AllocTexVram_(u32 szByte, BOOL is4x4comp, u32 opt) {
    return NNS_GFD_ALLOC_ERROR_TEXKEY;
}

int FreeTexVram_(NNSGfdTexKey key) {
    return -1;
}
