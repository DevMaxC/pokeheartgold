#include <nitro.h>

// WVR: asks the ARM7 to start up or terminate the wireless driver over PXI. Start-up lends it VRAM
// bank C and/or D (locked for the ARM7 until it terminates or start-up fails); the result arrives
// asynchronously in WvrReceiveCallback.

#define RESULT_SUCCESS        1
#define RESULT_ARM7_NOT_READY 2
#define RESULT_INVALID_BANK   3
#define RESULT_FIFO_ERROR     4
#define RESULT_BUSY           5
#define RESULT_VRAM_LOCKED    6
#define RESULT_NO_LOCK_ID     7

#define COMMAND_STARTUP   0x10000
#define COMMAND_TERMINATE 0x20000
#define COMMAND_MASK      0xFFFF0000

typedef void (*WvrAsyncCallback)(void *arg, int result);

// lib/NitroSDK/asm/wvr_data.s: wvrLockId, wvrVRam, wvrArg, wvrCallback
typedef struct WvrState {
    volatile u16 lockId;
    volatile u16 vramBank;
    void *arg;
    WvrAsyncCallback callback;
} WvrState;

extern WvrState wvrLockId;

int WVR_StartUpAsync(int bank, WvrAsyncCallback callback, void *arg);
int WVR_TerminateAsync(WvrAsyncCallback callback, void *arg);
void WvrReceiveCallback(PXIFifoTag tag, u32 data, BOOL err);
void WvrDummyAsyncCallback(void *arg, int result);

#pragma force_active on

int WVR_StartUpAsync(int bank, WvrAsyncCallback callback, void *arg) {
    OSIntrMode intr;

    PXI_Init();
    if (!PXI_IsCallbackReady(PXI_FIFO_TAG_WVR, PXI_PROC_ARM7)) {
        return RESULT_ARM7_NOT_READY;
    }
    if (wvrLockId.lockId == 0) {
        do {
            int id = OS_GetLockID();

            if (id == OS_LOCK_ID_ERROR) {
                return RESULT_NO_LOCK_ID;
            }
            wvrLockId.lockId = id;
        } while (wvrLockId.lockId == 0);
    }
    intr = OS_DisableInterrupts();
    if (wvrLockId.callback) {
        OS_RestoreInterrupts(intr);
        return RESULT_BUSY;
    }
    if (wvrLockId.vramBank) {
        OS_RestoreInterrupts(intr);
        return RESULT_BUSY;
    }
    switch (bank) {
    case GX_VRAM_C:
        if (!OSi_TryLockVram(GX_VRAM_C, wvrLockId.lockId)) {
            OS_RestoreInterrupts(intr);
            return RESULT_VRAM_LOCKED;
        }
        wvrLockId.vramBank = GX_VRAM_C;
        reg_GX_VRAMCNT_C = 0x82; // enabled, ARM7 work RAM at 0x06000000
        break;
    case GX_VRAM_D:
        if (!OSi_TryLockVram(GX_VRAM_D, wvrLockId.lockId)) {
            OS_RestoreInterrupts(intr);
            return RESULT_VRAM_LOCKED;
        }
        wvrLockId.vramBank = GX_VRAM_D;
        reg_GX_VRAMCNT_D = 0x82; // enabled, ARM7 work RAM at 0x06000000
        break;
    case GX_VRAM_C | GX_VRAM_D:
        if (!OSi_TryLockVram(GX_VRAM_C | GX_VRAM_D, wvrLockId.lockId)) {
            OS_RestoreInterrupts(intr);
            return RESULT_VRAM_LOCKED;
        }
        wvrLockId.vramBank = GX_VRAM_C | GX_VRAM_D;
        reg_GX_VRAMCNT_C = 0x82; // enabled, ARM7 work RAM at 0x06000000
        reg_GX_VRAMCNT_D = 0x8A; // enabled, ARM7 work RAM at 0x06020000
        break;
    default:
        OS_RestoreInterrupts(intr);
        return RESULT_INVALID_BANK;
    }
    if (!PXI_IsCallbackReady(PXI_FIFO_TAG_WVR, PXI_PROC_ARM9)) {
        PXI_SetFifoRecvCallback(PXI_FIFO_TAG_WVR, WvrReceiveCallback);
    }
    if (!callback) {
        wvrLockId.callback = WvrDummyAsyncCallback;
    } else {
        wvrLockId.callback = callback;
    }
    wvrLockId.arg = arg;
    if (PXI_SendWordByFifo(PXI_FIFO_TAG_WVR, COMMAND_STARTUP, FALSE) < 0) {
        OSi_UnlockVram(wvrLockId.vramBank, wvrLockId.lockId);
        wvrLockId.vramBank = 0;
        wvrLockId.callback = NULL;
        OS_RestoreInterrupts(intr);
        return RESULT_FIFO_ERROR;
    }
    OS_RestoreInterrupts(intr);
    return RESULT_SUCCESS;
}

int WVR_TerminateAsync(WvrAsyncCallback callback, void *arg) {
    OSIntrMode intr;

    PXI_Init();
    if (!PXI_IsCallbackReady(PXI_FIFO_TAG_WVR, PXI_PROC_ARM7)) {
        return RESULT_ARM7_NOT_READY;
    }
    intr = OS_DisableInterrupts();
    if (wvrLockId.callback) {
        OS_RestoreInterrupts(intr);
        return RESULT_BUSY;
    }
    if (!PXI_IsCallbackReady(PXI_FIFO_TAG_WVR, PXI_PROC_ARM9)) {
        PXI_SetFifoRecvCallback(PXI_FIFO_TAG_WVR, WvrReceiveCallback);
    }
    if (!callback) {
        wvrLockId.callback = WvrDummyAsyncCallback;
    } else {
        wvrLockId.callback = callback;
    }
    wvrLockId.arg = arg;
    if (PXI_SendWordByFifo(PXI_FIFO_TAG_WVR, COMMAND_TERMINATE, FALSE) < 0) {
        wvrLockId.callback = NULL;
        OS_RestoreInterrupts(intr);
        return RESULT_FIFO_ERROR;
    }
    OS_RestoreInterrupts(intr);
    return RESULT_SUCCESS;
}

void WvrReceiveCallback(PXIFifoTag tag, u32 data, BOOL err) {
    WvrAsyncCallback callback = wvrLockId.callback;
    void *arg = wvrLockId.arg;
    int result = data & 0xFF;

    switch (data & COMMAND_MASK) {
    case COMMAND_STARTUP:
        // the ARM7 could not start: give the VRAM back
        if (result == 7 && wvrLockId.vramBank && wvrLockId.lockId) {
            OSi_UnlockVram(wvrLockId.vramBank, wvrLockId.lockId);
            wvrLockId.vramBank = 0;
        }
        break;
    case COMMAND_TERMINATE:
        if (result == 0 && wvrLockId.vramBank && wvrLockId.lockId) {
            OSi_UnlockVram(wvrLockId.vramBank, wvrLockId.lockId);
            wvrLockId.vramBank = 0;
        }
        PXI_SetFifoRecvCallback(PXI_FIFO_TAG_WVR, NULL);
        break;
    }
    if (callback) {
        wvrLockId.callback = NULL;
        wvrLockId.arg = NULL;
        callback(arg, result);
    }
}

void WvrDummyAsyncCallback(void *arg, int result) {
}
