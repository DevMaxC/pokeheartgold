#include <nitro.h>

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

// Touch panel: requests to the ARM7 over the PXI FIFO (single samples and auto sampling into a ring
// buffer), calibration from the user settings, conversion of raw points to screen coordinates.

typedef void (*TpCallback)(u32 command, u8 result, u8 index);

// Calibration derived from TPCalibrateParam: raw = offset + screen * dotSize; scale = 2^28 / dotSize.
typedef struct TpCalibration {
    s32 x0;
    s32 xDotSize;
    s32 xScale;
    s32 y0;
    s32 yDotSize;
    s32 yScale;
} TpCalibration;

typedef struct TpWork {
    u16 init;
    u16 unk_02;
    TpCallback callback; // 0x04
    TPData last;         // 0x08: result of a single sampling request
    volatile u16 index;  // 0x10: auto sampling: ring buffer entry written last
    u16 frequency;       // 0x12: auto sampling: samples per frame
    TPData *buffer;      // 0x14: auto sampling ring buffer
    u16 count;           // 0x18: its entries
    u16 unk_1A;
    TpCalibration calibration; // 0x1C
    u16 calibrated;            // 0x34
    u16 state;                 // 0x36
    volatile u16 error;        // 0x38: bit n: command n failed
    volatile u16 busy;         // 0x3A: bit n: command n is running
} TpWork;

#define TP_COMMAND_SAMPLING      0
#define TP_COMMAND_AUTO_START    1
#define TP_COMMAND_AUTO_STOP     2
#define TP_COMMAND_AUTO_SAMPLING 16
#define TP_RESULT_SUCCESS        0
#define TP_RESULT_INVALID        1
#define TP_RESULT_ILLEGAL_STATUS 2
#define TP_RESULT_PXI_BUSY       3
#define TP_RESULT_SEND_ERROR     4
#define TP_RAW_POINT             (*(volatile u16 *)0x027FFFAA) // raw point from the ARM7 (2 halfwords)
#define TP_USER_SETTINGS         ((const NVRAMConfig *)0x027FFC80)

// Raw point as written by the ARM7.
typedef struct TpRawPoint {
    u32 x : 12;
    u32 y : 12;
    u32 touch : 1;
    u32 validity : 2;
    u32 unk_27 : 5;
} TpRawPoint;

extern TpWork gTpWork;
extern TpCalibration gTpCalibration; // label of gTpWork.calibration

void TPi_TpCallback(PXIFifoTag tag, u32 data, BOOL err);
void TP_RequestAutoSamplingStartAsync(u16 vcount, u16 frequency, TPData *buffer, u16 count);
void TP_RequestAutoSamplingStopAsync(void);
u32 TP_GetLatestIndexInAuto(void);
int TP_CalcCalibrateParam(TPCalibrateParam *calibrate, u16 raw_x1, u16 raw_y1, u16 dx1, u16 dy1, u16 raw_x2, u16 raw_y2, u16 dx2, u16 dy2);
void TP_WaitBusy(u32 commandFlags);
u32 TP_CheckBusy(u32 commandFlags);

#pragma force_active on

void TPi_TpCallback(PXIFifoTag tag, u32 data, BOOL err) {
    u32 result;
    u16 response = (u16)data;
    u16 command = (response & 0x7F00) >> 8;

    if (err) {
        gTpWork.error |= 1 << command;
        if (gTpWork.callback) {
            gTpWork.callback(command, TP_RESULT_SEND_ERROR, 0);
        }
        return;
    }
    if (command == TP_COMMAND_AUTO_SAMPLING) {
        TpRawPoint raw;
        TPData *point;

        gTpWork.index++;
        if (gTpWork.index >= gTpWork.count) {
            gTpWork.index = 0;
        }
        ((u16 *)&raw)[0] = (&TP_RAW_POINT)[0];
        ((u16 *)&raw)[1] = (&TP_RAW_POINT)[1];
        point = &gTpWork.buffer[gTpWork.index];
        point->x = raw.x;
        point->y = raw.y;
        point->touch = (u8)raw.touch;
        point->validity = (u8)raw.validity;
        if (gTpWork.callback) {
            gTpWork.callback(command, TP_RESULT_SUCCESS, (u8)gTpWork.index);
        }
        return;
    }
    if (!(data & 0x1000000)) {
        return;
    }
    switch (response & 0xFF) {
    case 0:
        switch (command) {
        case TP_COMMAND_SAMPLING: {
            TpRawPoint raw;

            ((u16 *)&raw)[0] = (&TP_RAW_POINT)[0];
            ((u16 *)&raw)[1] = (&TP_RAW_POINT)[1];
            gTpWork.last.x = raw.x;
            gTpWork.last.y = raw.y;
            gTpWork.last.touch = (u8)raw.touch;
            gTpWork.last.validity = (u8)raw.validity;
            gTpWork.state = 0;
        } break;
        case TP_COMMAND_AUTO_START:
            gTpWork.state = 2;
            break;
        case TP_COMMAND_AUTO_STOP:
            gTpWork.state = 0;
            break;
        }
        gTpWork.busy &= ~(1 << command);
        if (gTpWork.callback) {
            gTpWork.callback(command, TP_RESULT_SUCCESS, 0);
        }
        return;
    case 4:
        result = TP_RESULT_PXI_BUSY;
        goto failed;
    case 2:
        result = TP_RESULT_INVALID;
        goto failed;
    case 3:
        result = TP_RESULT_ILLEGAL_STATUS;
failed: {
    gTpWork.error |= 1 << command;
    gTpWork.busy &= ~(1 << command);
    if (gTpWork.callback) {
        gTpWork.callback(command, (u8)result, 0);
    }
    return;
}
    default:
        OS_Terminate();
    }
}

void TP_Init(void) {
    if (gTpWork.init) {
        return;
    }
    gTpWork.init = 1;
    PXI_Init();
    gTpWork.index = 0;
    gTpWork.callback = NULL;
    gTpWork.buffer = NULL;
    gTpWork.state = 0;
    gTpWork.calibrated = 0;
    gTpWork.busy = 0;
    gTpWork.error = 0;
    while (!PXI_IsCallbackReady(PXI_FIFO_TAG_TOUCHPANEL, PXI_PROC_ARM7)) {}
    PXI_SetFifoRecvCallback(PXI_FIFO_TAG_TOUCHPANEL, TPi_TpCallback);
}

BOOL TP_GetUserInfo(TPCalibrateParam *param) {
    const NVRAMConfig *config = TP_USER_SETTINGS;
    u16 raw_x1 = config->ncd.tp.raw_x1, raw_y1 = config->ncd.tp.raw_y1, raw_x2 = config->ncd.tp.raw_x2, raw_y2 = config->ncd.tp.raw_y2;
    u8 dx1 = config->ncd.tp.dx1, dy1 = config->ncd.tp.dy1, dx2 = config->ncd.tp.dx2, dy2 = config->ncd.tp.dy2;

    if ((raw_x1 == 0 && raw_x2 == 0 && raw_y1 == 0 && raw_y2 == 0) || TP_CalcCalibrateParam(param, raw_x1, raw_y1, dx1, dy1, raw_x2, raw_y2, dx2, dy2)) {
        param->x0 = 0;
        param->y0 = 0;
        param->xDotSize = 0;
        param->yDotSize = 0;
        return TRUE;
    }
    return TRUE;
}

#pragma push
#pragma opt_common_subs off
#pragma opt_lifetimes off
#pragma opt_propagation off
#pragma opt_dead_assignments off

void TP_SetCalibrateParam(const TPCalibrateParam *param) {
    OSIntrMode enabled;
    s32 dotSize;

    if (!param) {
        gTpWork.calibrated = 0;
        return;
    }
    enabled = OS_DisableInterrupts();
    if ((dotSize = param->xDotSize)) {
        reg_CP_DIVCNT = 0;
        reg_CP_DIV_NUMER_L = 0x10000000;
        reg_CP_DIV_DENOM = (u32)dotSize;
        gTpWork.calibration.x0 = param->x0;
        gTpWork.calibration.xDotSize = param->xDotSize;
        while (reg_CP_DIVCNT & REG_CP_DIVCNT_BUSY_MASK) {}
        gTpWork.calibration.xScale = reg_CP_DIV_RESULT_L;
    } else {
        gTpWork.calibration.x0 = 0;
        gTpWork.calibration.xDotSize = 0;
        gTpWork.calibration.xScale = 0;
    }
    if ((dotSize = param->yDotSize)) {
        reg_CP_DIVCNT = 0;
        reg_CP_DIV_NUMER_L = 0x10000000;
        reg_CP_DIV_DENOM = (u32)dotSize;
        gTpWork.calibration.y0 = param->y0;
        gTpWork.calibration.yDotSize = param->yDotSize;
        while (reg_CP_DIVCNT & REG_CP_DIVCNT_BUSY_MASK) {}
        gTpWork.calibration.yScale = reg_CP_DIV_RESULT_L;
    } else {
        gTpWork.calibration.y0 = 0;
        gTpWork.calibration.yDotSize = 0;
        gTpWork.calibration.yScale = 0;
    }
    OS_RestoreInterrupts(enabled);
    gTpWork.calibrated = 1;
}

#pragma pop

void TP_RequestSamplingAsync(void) {
    OSIntrMode enabled = OS_DisableInterrupts();
    int sent = PXI_SendWordByFifo(PXI_FIFO_TAG_TOUCHPANEL, 0x3000000, FALSE) >= 0;

    if (!sent) {
        OS_RestoreInterrupts(enabled);
        gTpWork.error |= 1 << TP_COMMAND_SAMPLING;
        if (gTpWork.callback) {
            gTpWork.callback(TP_COMMAND_SAMPLING, TP_RESULT_SEND_ERROR, 0);
        }
        return;
    }
    gTpWork.busy |= 1 << TP_COMMAND_SAMPLING;
    gTpWork.error &= ~(1 << TP_COMMAND_SAMPLING);
    OS_RestoreInterrupts(enabled);
}

u32 TP_WaitRawResult(TPData *result) {
    TP_WaitBusy(1 << TP_COMMAND_SAMPLING);
    if (gTpWork.error & (1 << TP_COMMAND_SAMPLING)) {
        return 1;
    }
    *result = gTpWork.last;
    return 0;
}

static inline int TpSendAutoSamplingStart(u16 vcount, u16 frequency) {
    if (PXI_SendWordByFifo(PXI_FIFO_TAG_TOUCHPANEL, (frequency & 0xFF) | 0x02000100, FALSE) < 0) {
        return 0;
    }
    if (PXI_SendWordByFifo(PXI_FIFO_TAG_TOUCHPANEL, vcount | 0x01010000, FALSE) < 0) {
        return 0;
    }
    return 1;
}

void TP_RequestAutoSamplingStartAsync(u16 vcount, u16 frequency, TPData *buffer, u16 count) {
    u32 i;
    OSIntrMode enabled;

    gTpWork.buffer = buffer;
    gTpWork.index = 0;
    gTpWork.frequency = frequency;
    gTpWork.count = count;
    for (i = 0; i < count; i++) {
        gTpWork.buffer[i].touch = 0;
    }
    enabled = OS_DisableInterrupts();
    if (!(TpSendAutoSamplingStart(vcount, frequency) & 0xFF)) {
        OS_RestoreInterrupts(enabled);
        gTpWork.error |= 1 << TP_COMMAND_AUTO_START;
        if (gTpWork.callback) {
            gTpWork.callback(TP_COMMAND_AUTO_START, TP_RESULT_SEND_ERROR, 0);
        }
        return;
    }
    gTpWork.busy |= 1 << TP_COMMAND_AUTO_START;
    gTpWork.error &= ~(1 << TP_COMMAND_AUTO_START);
    OS_RestoreInterrupts(enabled);
}

void TP_RequestAutoSamplingStopAsync(void) {
    OSIntrMode enabled = OS_DisableInterrupts();
    int sent = PXI_SendWordByFifo(PXI_FIFO_TAG_TOUCHPANEL, 0x03000200, FALSE) >= 0;

    if (!sent) {
        OS_RestoreInterrupts(enabled);
        gTpWork.error |= 1 << TP_COMMAND_AUTO_STOP;
        if (gTpWork.callback) {
            gTpWork.callback(TP_COMMAND_AUTO_STOP, TP_RESULT_SEND_ERROR, 0);
        }
        return;
    }
    gTpWork.busy |= 1 << TP_COMMAND_AUTO_STOP;
    gTpWork.error &= ~(1 << TP_COMMAND_AUTO_STOP);
    OS_RestoreInterrupts(enabled);
}

// Latest point of the auto sampling buffer; an invalid coordinate is taken from the previous samples
// of the frame where possible.
void TP_GetLatestRawPointInAuto(TPData *result) {
    int i, index, latest;
    TPData *point;

    result->validity = TP_VALIDITY_INVALID_XY;
    latest = gTpWork.index;
    if (gTpWork.frequency == 1 || gTpWork.count == 1) {
        *result = gTpWork.buffer[latest];
        return;
    }
    for (i = 0; i < gTpWork.frequency && i < gTpWork.count - 1; i++) {
        index = latest - i;
        if (index < 0) {
            index += gTpWork.count;
        }
        point = &gTpWork.buffer[index];
        if (!point->touch) {
            *result = *point;
            return;
        }
        if ((result->validity & TP_VALIDITY_INVALID_X) && !(point->validity & TP_VALIDITY_INVALID_X)) {
            result->x = point->x;
            if (i) {
                result->validity &= ~TP_VALIDITY_INVALID_X;
            }
        }
        if ((result->validity & TP_VALIDITY_INVALID_Y) && !(point->validity & TP_VALIDITY_INVALID_Y)) {
            result->y = point->y;
            if (i) {
                result->validity &= ~TP_VALIDITY_INVALID_Y;
            }
        }
        if (!result->validity) {
            result->touch = TP_TOUCH_ON;
            return;
        }
    }
    result->touch = TP_TOUCH_ON;
}

u32 TP_GetLatestIndexInAuto(void) {
    return gTpWork.index;
}

// The denominator is written without volatile (one 64-bit store).
static inline void TpStartDiv(s32 numer, s32 denom) {
    reg_CP_DIVCNT = 0;
    reg_CP_DIV_NUMER_L = numer;
    *(REGType64 *)REG_DIV_DENOM_ADDR = (u32)denom;
}

static inline void TpWaitDiv(void) {
    while (reg_CP_DIVCNT & REG_CP_DIVCNT_BUSY_MASK) {}
}

// Calibration from two touched points: returns 1 if the points do not give a usable calibration.
int TP_CalcCalibrateParam(TPCalibrateParam *calibrate, u16 raw_x1, u16 raw_y1, u16 dx1, u16 dy1, u16 raw_x2, u16 raw_y2, u16 dx2, u16 dy2) {
    s32 rx_width, dx_width, ry_width, dy_width;
    s32 tmp32;
    s32 y0;
    OSIntrMode enabled;

    if (raw_x1 >= 4096 || raw_y1 >= 4096 || raw_x2 >= 4096 || raw_y2 >= 4096) {
        return 1;
    }
    if (dx1 >= 256 || dx2 >= 256 || dy1 >= 192 || dy2 >= 192) {
        return 1;
    }
    if (dx1 == dx2 || dy1 == dy2 || raw_x1 == raw_x2 || raw_y1 == raw_y2) {
        return 1;
    }
    enabled = OS_DisableInterrupts();
    rx_width = raw_x1 - raw_x2;
    dx_width = dx1 - dx2;
    ry_width = raw_y1 - raw_y2;
    dy_width = dy1 - dy2;
    TpStartDiv(rx_width << 8, dx_width);
    TpWaitDiv();
    tmp32 = (s32)reg_CP_DIV_RESULT_L;
    TpStartDiv(ry_width << 8, dy_width);
    if (tmp32 >= 0x8000 || tmp32 < -0x8000) {
        OS_RestoreInterrupts(enabled);
        return 1;
    }
    calibrate->xDotSize = (s16)tmp32;
    tmp32 = (s16)((((raw_x1 + raw_x2) << 8) - (dx1 + dx2) * calibrate->xDotSize) >> 7);
    if (tmp32 >= 0x8000 || tmp32 < -0x8000) {
        OS_RestoreInterrupts(enabled);
        return 1;
    }
    calibrate->x0 = (s16)tmp32;
    TpWaitDiv();
    tmp32 = (s32)reg_CP_DIV_RESULT_L;
    OS_RestoreInterrupts(enabled);
    if (tmp32 >= 0x8000 || tmp32 < -0x8000) {
        return 1;
    }
    calibrate->yDotSize = (s16)tmp32;
    y0 = (s16)((((raw_y1 + raw_y2) << 8) - (dy1 + dy2) * calibrate->yDotSize) >> 7);
    if (y0 >= 0x8000 || y0 < -0x8000) {
        return 1;
    }
    calibrate->y0 = (s16)y0;
    return 0;
}

void TP_GetCalibratedPoint(TPData *calib, const TPData *raw) {
    TpCalibration *calibration;

    if (!gTpWork.calibrated) {
        *calib = *raw;
        return;
    }
    calib->touch = raw->touch;
    calibration = &gTpCalibration;
    calib->validity = raw->validity;
    if (!raw->touch) {
        calib->x = 0;
        calib->y = 0;
        return;
    }
    calib->x = (u16)((((s64)((s32)raw->x << 2) - calibration->x0) * calibration->xScale) >> 22);
    if ((s16)calib->x < 0) {
        calib->x = 0;
    } else if ((s16)calib->x > 255) {
        calib->x = 255;
    }
    calib->y = (u16)((((s64)((s32)raw->y << 2) - calibration->y0) * calibration->yScale) >> 22);
    if ((s16)calib->y < 0) {
        calib->y = 0;
    } else if ((s16)calib->y > 191) {
        calib->y = 191;
    }
}

void TP_WaitBusy(u32 commandFlags) {
    while (gTpWork.busy & commandFlags) {}
}

u32 TP_CheckBusy(u32 commandFlags) {
    return gTpWork.error & commandFlags;
}
