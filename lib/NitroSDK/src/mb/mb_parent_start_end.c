#pragma force_active on
#include "global.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>
#include <nitro/mb/mb_comm.h>

// Multiboot parent start-up and shut-down: communication size checks, MB_SetParentCommParam,
// starting the parent (MBi_StartCommon / MBi_StartParentCore / MB_StartParentFromIdle), the WM reset
// path (MBi_CallReset / MBi_OnReset) and MBi_CommEnd / MB_End.
//
// gMbGlobalState is the MB global state: 0x00 u16 DMA channel, 0x04 WM work buffer, 0x08 common work
// (parent/child communication state), 0x0C parent work (send buffers, per-child state).

#define U32(p, o) (*(u32 *)((u8 *)(p) + (o)))
#define U16(p, o) (*(u16 *)((u8 *)(p) + (o)))
#define U8(p, o)  (*(u8 *)((u8 *)(p) + (o)))

extern u8 gMbGlobalState[];

// MB_SetParentCommParam .. MBi_StartParentCore read the global state as words.
#define sMbGlobalWords ((volatile u32 *)gMbGlobalState)

typedef struct MbResetWork {
    u8 unk_000[0x508];
    void (*callback)(void *); // 0x508
} MbResetWork;

typedef struct MbResetGlobal {
    u8 unk_00[8];
    MbResetWork *work; // 0x08
} MbResetGlobal;

typedef struct MbEndWork {
    u8 unk_000[0x50D];
    u8 active; // 0x50D
    u8 unk_50E[0x18];
    u16 ending; // 0x526
    u8 unk_528[0xBC];
    u32 unk_5E4; // 0x5E4
} MbEndWork;

typedef struct MbEndGlobal {
    u32 unk_00[2];
    MbEndWork *work; // 0x08
} MbEndGlobal;

extern int WM_Initialize(void *, u32, u16);
extern void WM_SetIndCallback(u32);
extern int WM_Reset(void (*)(void *));
extern void MBi_SetMaxScanTime(u16 x);
extern void MBi_OnInitializeDone(void);
extern void MB_CommSetParentStateCallback(void *cb);
extern void MBi_SetChildMPMaxSize(int size);
extern void MBi_SetParentPieceBuffer(void *p);
extern void MBi_CommParentCallback(void);
extern void MBi_ParentCallback(void);
extern void MB_InitSendGameInfoStatus(void);
extern void MBi_EndCommon(void *arg);
extern int MBi_IsTaskAvailable(void);
extern void MBi_EndTaskThread(void *cb);
extern void MBi_CheckWmErrcode(int api, int err);

int MBi_IsCommSizeValid(u32 p, u32 c, int n);
BOOL MB_SetParentCommParam(u16 parent, u16 child);
int MBi_StartCommon(void);
int MBi_StartParentCore(int channel);
int MB_StartParentFromIdle(int x);
int MBi_CallReset(void);
int MBi_OnReset(void);
int MBi_CommEnd(void);
void MB_End(void);

int MBi_IsCommSizeValid(u32 p, u32 c, int n) {
    int x, y;
    if (p > 510 || p < 228) {
        return 0;
    }
    if (c > 16 || c < 8) {
        return 0;
    }
    x = ((p + 38) << 2) + 0x4a + 0x100;
    y = ((c + 32) << 2) + 0x70;
    return n * y + x < 0x15e0;
}

#pragma push
#pragma opt_strength_reduction off

BOOL MB_SetParentCommParam(u16 parent, u16 child) {
    OSIntrMode mode = OS_DisableInterrupts();
    if (U8((void *)sMbGlobalWords[2], 0x50d)) {
        OS_RestoreInterrupts(mode);
        return 0;
    }
    if (!MBi_IsCommSizeValid(parent, 8, child)) {
        OS_RestoreInterrupts(mode);
        return 0;
    }
    U16((void *)sMbGlobalWords[2], 16) = child;
    U16((void *)sMbGlobalWords[2], 0x500) = parent;
    U16((void *)sMbGlobalWords[2], 0x502) = 8;
    OS_RestoreInterrupts(mode);
    return 1;
}

int MBi_StartCommon(void) {
    int status;
    U16((void *)sMbGlobalWords[2], 0x528) = 0;
    U16((void *)sMbGlobalWords[2], 0x52a) = 0;
    U16((void *)sMbGlobalWords[2], 0x526) = 0;
    U16((void *)sMbGlobalWords[2], 0x548) = 0;
    MBi_SetMaxScanTime(10);
    if (!U32((void *)sMbGlobalWords[3], 0x1320)) {
        do {
            {
                u16 dma = U16(sMbGlobalWords, 0);
                u32 *args = (u32 *)sMbGlobalWords;
                u32 buffer = args[1];
                u32 context = args[2];
                status = WM_Initialize((void *)buffer, U32((void *)context, 0x508), dma);
            }
        } while (status == 4);
        if (status != 2) {
            return 8;
        }
        WM_SetIndCallback(U32((void *)sMbGlobalWords[2], 0x508));
        U8((void *)sMbGlobalWords[2], 0x50d) = 1;
        return 0;
    }
    WM_SetIndCallback(U32((void *)sMbGlobalWords[2], 0x508));
    U8((void *)sMbGlobalWords[2], 0x50d) = 1;
    MBi_OnInitializeDone();
    return 0;
}

int MBi_StartParentCore(int channel) {
    OSIntrMode mode = OS_DisableInterrupts();
    u8 *parent;
    u32 callback;
    int i, result;
    U16((void *)sMbGlobalWords[2], 50) = channel;
    parent = (u8 *)sMbGlobalWords[3];
    sMbGlobalWords[1] = ((u32)parent + 0x7d1f) & ~31;
    callback = U32(parent, 0x14e4);
    MIi_CpuClear16(0, (u16 *)(parent + 0x1340), 0x69c0);
    MB_CommSetParentStateCallback((void *)callback);
    U32((void *)sMbGlobalWords[3], 0x1318) = U16((void *)sMbGlobalWords[2], 0x500) - 6;
    MBi_SetChildMPMaxSize(U16((void *)sMbGlobalWords[2], 0x502));
    MBi_SetParentPieceBuffer((u8 *)sMbGlobalWords[3] + 0x1538);
    for (i = 0; i < 15; i++) {
        U32((u8 *)sMbGlobalWords[3] + i * 4, 0x14e8) = MB_COMM_PSTATE_NONE;
        *(s8 *)((u8 *)sMbGlobalWords[3] + i + 0x1526) = -1;
    }
    U8((void *)sMbGlobalWords[3], 0x1524) = 0;
    MIi_CpuClear16(0, (u16 *)((u8 *)sMbGlobalWords[3] + 0x1788), 0x5d40);
    MI_CpuFill8((u8 *)sMbGlobalWords[3] + 0x1754, 0, 30);
    U16((void *)sMbGlobalWords[2], 0x524) = 1;
    U32((void *)sMbGlobalWords[2], 0x51c) = (u32)MBi_CommParentCallback;
    U32((void *)sMbGlobalWords[2], 0x508) = (u32)MBi_ParentCallback;
    {
        u8 *c = (u8 *)sMbGlobalWords[2];
        U16(c, 0x34) = U16(c, 0x500);
    }
    {
        u8 *c = (u8 *)sMbGlobalWords[2];
        U16(c, 0x518) = (U16(c, 0x34) + 35) & ~31;
    }
    {
        u8 *c = (u8 *)sMbGlobalWords[2];
        U16(c, 0x36) = U16(c, 0x502);
    }
    {
        u8 *c = (u8 *)sMbGlobalWords[2];
        U16(c, 0x51a) = ((15 * (U16(c, 0x36) + 14) + 41) & ~31) * 2;
    }
    MB_InitSendGameInfoStatus();
    result = MBi_StartCommon();
    OS_RestoreInterrupts(mode);
    U32((void *)sMbGlobalWords[3], 0x74c8) = PXI_IsCallbackReady(PXI_FIFO_TAG_WVR, PXI_PROC_ARM7);
    return result;
}

#pragma pop

int MB_StartParentFromIdle(int x) {
    U32((void *)U32(gMbGlobalState, 12), 0x1320) = 1;
    return MBi_StartParentCore(x);
}

int MBi_CallReset(void) {
    int result = WM_Reset(((MbResetGlobal *)gMbGlobalState)->work->callback);
    MBi_CheckWmErrcode(1, result);
    if (result == 2) {
        result = 0;
    }
    return result;
}

int MBi_OnReset(void) {
    return MBi_CallReset();
}

int MBi_CommEnd(void) {
    int result = 1;
    OSIntrMode mask = OS_DisableInterrupts();
    if (!((MbEndGlobal *)gMbGlobalState)->work->active) {
        MBi_EndCommon(0);
        goto done;
    }
    if (((MbEndGlobal *)gMbGlobalState)->work->ending) {
        goto done;
    }
    ((MbEndGlobal *)gMbGlobalState)->work->unk_5E4 = 0;
    ((MbEndGlobal *)gMbGlobalState)->work->ending = 1;
    if (MBi_IsTaskAvailable()) {
        MBi_EndTaskThread(MBi_OnReset);
        result = 0;
    } else {
        result = MBi_CallReset();
    }
done:
    OS_RestoreInterrupts(mask);
    return result;
}

void MB_End(void) {
    OSIntrMode x = OS_DisableInterrupts();
    if (!U32((void *)U32(gMbGlobalState, 12), 0x1320)) {
        OS_Terminate();
    }
    MBi_CommEnd();
    OS_RestoreInterrupts(x);
}
