#include <nitro.h>
#include <nnsys/gfd_internal.h>

extern FrmPlttVramManager gFrmPlttVramManager;

void NNS_GfdInitFrmPlttVramManager(u32 szByte, BOOL useAsDefault) {
    gFrmPlttVramManager.szByte = szByte;
    NNS_GfdResetFrmPlttVramState();
    if (useAsDefault) {
        NNS_GfdDefaultFuncAllocPlttVram = NNS_GfdAllocFrmPlttVram;
        NNS_GfdDefaultFuncFreePlttVram = NNS_GfdFreeFrmPlttVram;
    }
}

#pragma force_active on

static inline BOOL AllocFromLo_(u32 *pAddr, u32 szByte, BOOL b4Pltt) {
    u32 lo = gFrmPlttVramManager.lo;
    u32 pad = b4Pltt ? ((8 - (lo & 7)) & 7) : ((16 - (lo & 15)) & 15);
    u32 need = szByte + pad;
    if (gFrmPlttVramManager.hi - lo >= need) {
        u32 end = lo + need;
        if (b4Pltt && end > 0x10000) {
            return FALSE;
        }
        *pAddr = lo + pad;
        gFrmPlttVramManager.lo += need;
        return TRUE;
    }
    return FALSE;
}

static inline BOOL AllocFromHi_(u32 *pAddr, u32 szByte, BOOL b4Pltt) {
    u32 hi = gFrmPlttVramManager.hi;
    u32 pad;
    u32 need;
    if (hi >= szByte) {
        pad = b4Pltt ? ((hi - szByte) & 7) : ((hi - szByte) & 15);
        need = szByte + pad;
        if (hi - gFrmPlttVramManager.lo >= need) {
            if (b4Pltt && hi > 0x10000) {
                return FALSE;
            }
            gFrmPlttVramManager.hi -= need;
            *pAddr = gFrmPlttVramManager.hi;
            return TRUE;
        }
    }
    return FALSE;
}

NNSGfdPlttKey NNS_GfdAllocFrmPlttVram(u32 szByte, BOOL b4Pltt, u32 bAllocFromLo) {
    u32 addr = 0;
    BOOL result;
    szByte = (szByte == 0) ? 8 : ((szByte + 7) & ~7);
    if (szByte >= 0x7FFF8) {
        return NNS_GFD_ALLOC_ERROR_PLTTKEY;
    }
    if (bAllocFromLo == 1) {
        result = AllocFromLo_(&addr, szByte, b4Pltt);
    } else {
        result = AllocFromHi_(&addr, szByte, b4Pltt);
    }
    if (!result) {
        return NNS_GFD_ALLOC_ERROR_PLTTKEY;
    }
    return ((szByte >> 3) << 16) | ((addr >> 3) & 0xffff);
}

#pragma force_active reset

int NNS_GfdFreeFrmPlttVram(NNSGfdPlttKey key) {
    return 0;
}

void NNS_GfdGetFrmPlttVramState(u32 *state) {
    state[0] = gFrmPlttVramManager.lo;
    state[1] = gFrmPlttVramManager.hi;
}

void NNS_GfdSetFrmPlttVramState(const u32 *state) {
    gFrmPlttVramManager.lo = state[0];
    gFrmPlttVramManager.hi = state[1];
}

void NNS_GfdResetFrmPlttVramState(void) {
    gFrmPlttVramManager.lo = 0;
    gFrmPlttVramManager.hi = gFrmPlttVramManager.szByte;
}
