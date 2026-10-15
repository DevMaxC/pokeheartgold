#include <nitro.h>

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

// RTC: date / time requests to the ARM7 over the PXI FIFO, conversion of the BCD replies, synchronous
// wrappers that wait for the reply.

typedef enum RtcOperation {
    RTC_OPERATION_GET_DATE = 0,
    RTC_OPERATION_GET_TIME,
    RTC_OPERATION_GET_DATETIME,
} RtcOperation;

typedef struct RtcWork {
    u16 init;
    u16 unk_02;
    u32 unk_04;
    u32 unk_08;
    volatile BOOL lock;      // 0x0C: a request is running
    RTCCallback callback;    // 0x10: reply of the running request
    void *buffer0;           // 0x14: RTCDate / RTCTime / u32 result of the request
    void *buffer1;           // 0x18: RTCTime of RTC_GetDateTimeAsync
    void *callbackArg;       // 0x1C
    u32 operation;           // 0x20: RtcOperation and the alarm operations (3-15)
    u32 phase;               // 0x24: step of a two-step operation
    void (*interrupt)(void); // 0x28: alarm interrupt (command 0x30)
    RTCResult result;        // 0x2C: result of the synchronous functions
} RtcWork;

// RTC registers as received from the ARM7 (BCD).
#define RTC_RAW_DATE    (*(volatile u32 *)0x027FFDE8)
#define RTC_RAW_TIME    (*(volatile u32 *)0x027FFDEC)
#define RTC_RAW_STATUS2 (*(RtcStatus2 *)0x027FFDEA)

#define BITS(value, left, right) (((u32)(value) << (left)) >> (right))

typedef struct RtcStatus2 {
    u16 intr1 : 4;
    u16 unk_4 : 2;
    u16 intr2 : 1;
    u16 unk_7 : 9;
} RtcStatus2;

extern RtcWork gRtcWork;
extern u32 gRtcLock; // label of gRtcWork.lock (RtcWaitBusy)

BOOL RTCi_ReadRawDateAsync(void);
BOOL RTCi_ReadRawTimeAsync(void);
BOOL RTCi_ReadRawDateTimeAsync(void);
BOOL RTCi_WriteRawStatus2Async(void);
RTCWeek RTC_GetDayOfWeek(const RTCDate *date);

RTCResult RTC_GetDateAsync(RTCDate *date, RTCCallback callback, void *arg);
RTCResult RTC_GetDate(RTCDate *date);
RTCResult RTC_GetTimeAsync(RTCTime *time, RTCCallback callback, void *arg);
RTCResult RTC_GetTime(RTCTime *time);
RTCResult RTC_GetDateTime(RTCDate *date, RTCTime *time);
void RtcCommonCallback(PXIFifoTag tag, u32 data, BOOL err);
u32 RtcBCD2HEX(u32 bcd);
void RtcGetResultCallback(RTCResult result, void *arg);
void RtcWaitBusy(void);

#pragma force_active on

void RTC_Init(void) {
    if (gRtcWork.init) {
        return;
    }
    gRtcWork.init = 1;
    gRtcWork.lock = FALSE;
    gRtcWork.callback = NULL;
    gRtcWork.interrupt = NULL;
    gRtcWork.buffer0 = NULL;
    gRtcWork.buffer1 = NULL;
    PXI_Init();
    while (!PXI_IsCallbackReady(PXI_FIFO_TAG_RTC, PXI_PROC_ARM7)) {}
    PXI_SetFifoRecvCallback(PXI_FIFO_TAG_RTC, RtcCommonCallback);
}

RTCResult RTC_GetDateAsync(RTCDate *date, RTCCallback callback, void *arg) {
    OSIntrMode enabled = OS_DisableInterrupts();

    if (gRtcWork.lock) {
        OS_RestoreInterrupts(enabled);
        return RTC_RESULT_BUSY;
    }
    gRtcWork.lock = TRUE;
    OS_RestoreInterrupts(enabled);
    gRtcWork.operation = RTC_OPERATION_GET_DATE;
    gRtcWork.phase = 0;
    gRtcWork.buffer0 = date;
    gRtcWork.callback = callback;
    gRtcWork.callbackArg = arg;
    return RTCi_ReadRawDateAsync() ? RTC_RESULT_SUCCESS : RTC_RESULT_SEND_ERROR;
}

RTCResult RTC_GetDate(RTCDate *date) {
    RTCResult result = RTC_GetDateAsync(date, RtcGetResultCallback, NULL);

    gRtcWork.result = result;
    if (!result) {
        RtcWaitBusy();
    }
    return gRtcWork.result;
}

RTCResult RTC_GetTimeAsync(RTCTime *time, RTCCallback callback, void *arg) {
    OSIntrMode enabled = OS_DisableInterrupts();

    if (gRtcWork.lock) {
        OS_RestoreInterrupts(enabled);
        return RTC_RESULT_BUSY;
    }
    gRtcWork.lock = TRUE;
    OS_RestoreInterrupts(enabled);
    gRtcWork.operation = RTC_OPERATION_GET_TIME;
    gRtcWork.phase = 0;
    gRtcWork.buffer0 = time;
    gRtcWork.callback = callback;
    gRtcWork.callbackArg = arg;
    return RTCi_ReadRawTimeAsync() ? RTC_RESULT_SUCCESS : RTC_RESULT_SEND_ERROR;
}

RTCResult RTC_GetTime(RTCTime *time) {
    RTCResult result = RTC_GetTimeAsync(time, RtcGetResultCallback, NULL);

    gRtcWork.result = result;
    if (!result) {
        RtcWaitBusy();
    }
    return gRtcWork.result;
}

RTCResult RTC_GetDateTimeAsync(RTCDate *date, RTCTime *time, RTCCallback callback, void *arg) {
    OSIntrMode enabled = OS_DisableInterrupts();

    if (gRtcWork.lock) {
        OS_RestoreInterrupts(enabled);
        return RTC_RESULT_BUSY;
    }
    gRtcWork.lock = TRUE;
    OS_RestoreInterrupts(enabled);
    gRtcWork.operation = RTC_OPERATION_GET_DATETIME;
    gRtcWork.phase = 0;
    gRtcWork.buffer0 = date;
    gRtcWork.buffer1 = time;
    gRtcWork.callback = callback;
    gRtcWork.callbackArg = arg;
    return RTCi_ReadRawDateTimeAsync() ? RTC_RESULT_SUCCESS : RTC_RESULT_SEND_ERROR;
}

RTCResult RTC_GetDateTime(RTCDate *date, RTCTime *time) {
    RTCResult result = RTC_GetDateTimeAsync(date, time, RtcGetResultCallback, NULL);

    gRtcWork.result = result;
    if (!result) {
        RtcWaitBusy();
    }
    return gRtcWork.result;
}

void RtcCommonCallback(PXIFifoTag tag, u32 data, BOOL err) {
    int result;
    u8 status;
    u32 *p;
    RTCCallback callback;

    if (err) {
        if (gRtcWork.phase) {
            gRtcWork.phase = 0;
        }
        if (gRtcWork.lock) {
            gRtcWork.lock = FALSE;
        }
        callback = gRtcWork.callback;
        if (callback) {
            gRtcWork.callback = NULL;
            callback(RTC_RESULT_FATAL_ERROR, gRtcWork.callbackArg);
        }
        return;
    }
    status = (u8)data;
    if ((u8)((data & 0x7F00) >> 8) == 0x30) {
        if (gRtcWork.interrupt) {
            gRtcWork.interrupt();
        }
        return;
    }
    if (status == 0) {
        result = RTC_RESULT_SUCCESS;
        switch (gRtcWork.operation) {
        case RTC_OPERATION_GET_DATE:
            p = gRtcWork.buffer0;
            p[0] = RtcBCD2HEX(BITS(RTC_RAW_DATE, 24, 24));
            p[1] = RtcBCD2HEX(BITS(RTC_RAW_DATE, 19, 27));
            p[2] = RtcBCD2HEX(BITS(RTC_RAW_DATE, 10, 26));
            p[3] = RTC_GetDayOfWeek((RTCDate *)p);
            break;
        case RTC_OPERATION_GET_TIME:
            p = gRtcWork.buffer0;
            p[0] = RtcBCD2HEX(BITS(RTC_RAW_TIME, 26, 26));
            p[1] = RtcBCD2HEX(BITS(RTC_RAW_TIME, 17, 25));
            p[2] = RtcBCD2HEX(BITS(RTC_RAW_TIME, 9, 25));
            break;
        case RTC_OPERATION_GET_DATETIME:
            p = gRtcWork.buffer0;
            p[0] = RtcBCD2HEX(RTC_RAW_DATE & 0xFF);
            p[1] = RtcBCD2HEX(BITS(RTC_RAW_DATE, 19, 27));
            p[2] = RtcBCD2HEX(BITS(RTC_RAW_DATE, 10, 26));
            p[3] = RTC_GetDayOfWeek((RTCDate *)p);
            {
                u32 hour = BITS(RTC_RAW_TIME, 26, 26);
                p = gRtcWork.buffer1;
                p[0] = RtcBCD2HEX(hour);
            }
            p[1] = RtcBCD2HEX(BITS(RTC_RAW_TIME, 17, 25));
            p[2] = RtcBCD2HEX(BITS(RTC_RAW_TIME, 9, 25));
            break;
        case 3:
        case 4:
        case 5:
        case 11:
        case 12:
        case 13:
        case 14:
        case 15:
            break;
        case 6:
            p = gRtcWork.buffer0;
            switch (RTC_RAW_STATUS2.intr1) {
            case 4:
                p[0] = 1;
                break;
            default:
                p[0] = 0;
                break;
            }
            break;
        case 7:
            p = gRtcWork.buffer0;
            if (RTC_RAW_STATUS2.intr2) {
                p[0] = 1;
            } else {
                p[0] = 0;
            }
            break;
        case 8:
            p = gRtcWork.buffer0;
            p[0] = BITS(RTC_RAW_TIME, 29, 29);
            p[1] = RtcBCD2HEX(BITS(RTC_RAW_TIME, 18, 26));
            p[2] = RtcBCD2HEX(BITS(RTC_RAW_TIME, 9, 25));
            p[3] = 0;
            if (BITS(RTC_RAW_TIME, 24, 31)) {
                p[3] += 1;
            }
            if (BITS(RTC_RAW_TIME, 16, 31)) {
                p[3] += 2;
            }
            if (BITS(RTC_RAW_TIME, 8, 31)) {
                p[3] += 4;
            }
            break;
        case 9:
            if (gRtcWork.phase == 0) {
                if (*(u32 *)gRtcWork.buffer0 == 1) {
                    if (RTC_RAW_STATUS2.intr1 != 4) {
                        gRtcWork.phase++;
                        RTC_RAW_STATUS2.intr1 = 4;
                        if (!RTCi_WriteRawStatus2Async()) {
                            gRtcWork.phase = 0;
                            result = RTC_RESULT_SEND_ERROR;
                        }
                    }
                } else if (RTC_RAW_STATUS2.intr1) {
                    gRtcWork.phase++;
                    RTC_RAW_STATUS2.intr1 = 0;
                    if (!RTCi_WriteRawStatus2Async()) {
                        gRtcWork.phase = 0;
                        result = RTC_RESULT_SEND_ERROR;
                    }
                }
            } else {
                gRtcWork.phase = 0;
            }
            break;
        case 10:
            if (gRtcWork.phase == 0) {
                if (*(u32 *)gRtcWork.buffer0 == 1) {
                    if (!RTC_RAW_STATUS2.intr2) {
                        gRtcWork.phase++;
                        RTC_RAW_STATUS2.intr2 = 1;
                        if (!RTCi_WriteRawStatus2Async()) {
                            gRtcWork.phase = 0;
                            result = RTC_RESULT_SEND_ERROR;
                        }
                    }
                } else if (RTC_RAW_STATUS2.intr2) {
                    gRtcWork.phase++;
                    RTC_RAW_STATUS2.intr2 = 0;
                    if (!RTCi_WriteRawStatus2Async()) {
                        gRtcWork.phase = 0;
                        result = RTC_RESULT_SEND_ERROR;
                    }
                }
            } else {
                gRtcWork.phase = 0;
            }
            break;
        default:
            gRtcWork.phase = 0;
            result = RTC_RESULT_INVALID_COMMAND;
            break;
        }
    } else {
        gRtcWork.phase = 0;
        switch (status) {
        case 1:
            result = RTC_RESULT_INVALID_COMMAND;
            break;
        case 2:
            result = RTC_RESULT_ILLEGAL_STATUS;
            break;
        case 3:
            result = RTC_RESULT_BUSY;
            break;
        case 0:
        case 4:
        default:
            result = RTC_RESULT_FATAL_ERROR;
            break;
        }
    }
    if (gRtcWork.phase) {
        return;
    }
    if (gRtcWork.lock) {
        gRtcWork.lock = FALSE;
    }
    callback = gRtcWork.callback;
    if (callback) {
        gRtcWork.callback = NULL;
        callback((RTCResult)result, gRtcWork.callbackArg);
    }
}

// BCD to binary; 0 if a digit is not a decimal digit.
u32 RtcBCD2HEX(u32 bcd) {
    int i, shift;
    u32 result = 0;

    for (i = 0, shift = 0; i < 8; i++, shift += 4) {
        u32 digit = (bcd >> shift) & 15;
        if (digit >= 10) {
            return 0;
        }
    }
    {
        u32 weight = 1;
        int offset, count;

        count = 0;
        offset = count;
        do {
            result += weight * ((bcd >> offset) & 15);
            weight *= 10;
            count++;
            offset += 4;
        } while (count < 8);
    }
    return result;
}

void RtcGetResultCallback(RTCResult result, void *arg) {
    gRtcWork.result = result;
}

// clang-format off
asm void RtcWaitBusy(void) {
    ldr r12, =gRtcLock
@wait:
    ldr r0, [r12]
    cmp r0, #1
    beq @wait
    bx lr
}
// clang-format on
