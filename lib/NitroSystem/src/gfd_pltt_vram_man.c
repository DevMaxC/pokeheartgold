#include <nitro.h>
#include <nnsys/gfd_internal.h>

#pragma force_active on

NNSGfdPlttKey AllocPlttVram_(u32 szByte, BOOL is4pltt, u32 opt) {
    return NNS_GFD_ALLOC_ERROR_PLTTKEY;
}

int FreePlttVram_(NNSGfdPlttKey key) {
    return -1;
}
