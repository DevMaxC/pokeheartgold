// pm.h declares PM_GetBackLight as void, but it returns the result of the register read. pm.h is pinned
// by tools/alarm-partition, so this file hides that declaration and declares the function as defined.
#define PM_GetBackLight PM_GetBackLight_HeaderDeclaration
#include <nitro.h>
#undef PM_GetBackLight

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

u32 PM_GetBackLight(PMBackLightSwitch *top, PMBackLightSwitch *bottom);

// Power management: commands to the ARM7 over the PXI FIFO (LEDs, backlights, amplifier, power-off,
// sleep), PM register access, LCD power, and the pre- / post-sleep callback lists.

typedef void (*PmCallback)(u32 result, void *arg);

// Entry of a sleep callback list.
typedef struct PmSleepCallbackInfo {
    void (*func)(void *arg);
    void *arg;
    struct PmSleepCallbackInfo *next;
} PmSleepCallbackInfo;

typedef struct PmWork {
    u16 init;
    u16 unk_02;
    volatile BOOL sleepReady;       // 0x04: the ARM7 acknowledged the sleep request (command 0x60)
    BOOL unk_08;                    // 0x08: set on command 0x62
    PmSleepCallbackInfo *preSleep;  // 0x0C
    u32 lcdOffVBlankCount;          // 0x10: VBlank count when the LCDs were switched off
    PMAmpSwitch amp;                // 0x14
    PmSleepCallbackInfo *postSleep; // 0x18
    volatile BOOL lock;             // 0x1C: a command is running
    PmCallback callback;            // 0x20: reply of the running command
    void *callbackArg;              // 0x24
    u32 *ledPattern;                // 0x28: PM_GetLEDPatternAsync result
} PmWork;

// Register read requests (PMi_ReadRegisterAsync), one per PM register.
typedef struct PmRegisterRead {
    u16 done;
    u16 unk_02;
    u16 *buffer;
} PmRegisterRead;

#define PM_REGISTER_COUNT 5
#define PM_VBLANK_COUNT   (*(u32 *)HW_VBLANK_COUNT_BUF)
#define PM_CONSOLE_TYPE   (*(vu16 *)0x027FFC40)

extern PmWork gPmWork;
extern PmSleepCallbackInfo *gPmPreSleepCallbacks;  // label of gPmWork.preSleep
extern PmSleepCallbackInfo *gPmPostSleepCallbacks; // label of gPmWork.postSleep
extern volatile u32 gPmLock;                       // label of gPmWork.lock
extern OSMutex gPmMutex;
extern PmRegisterRead gPmRegisterReads[PM_REGISTER_COUNT];
extern u16 *gPmRegisterBuffers[PM_REGISTER_COUNT][2]; // label of gPmRegisterReads[0].buffer

BOOL PMi_Lock(void);
void PMi_WaitBusy(void);
void PMi_DummyCallback(u32 result, void *arg);
void PMi_CallCallbackAndUnlock(u32 result);
void PMi_CommonCallback(PXIFifoTag tag, u32 data, BOOL err);
u32 PMi_SendSleepStart(u16 trigger, u16 logic);
u32 PM_SendUtilityCommandAsync(u32 command, PmCallback callback, void *arg);
u32 PMi_ReadRegisterAsync(u32 reg, u16 *buffer, PmCallback callback, void *arg);
u32 PMi_ReadRegister(u32 reg, u16 *buffer);
u32 PMi_WriteRegisterAsync(u32 reg, u32 value, PmCallback callback, void *arg);
u32 PMi_WriteRegister(u32 reg, u32 value);
u32 PMi_SetLEDAsync(int mode, PmCallback callback, void *arg);
u32 PMi_SetLED(int mode);
u32 PM_SetBackLightAsync(PMLCDTarget target, PMBackLightSwitch status, PmCallback callback, void *arg);
u32 PM_ForceToPowerOffAsync(PmCallback callback, void *arg);
u32 PMi_SetAmp(PMAmpSwitch status);
void PMi_SendPxiData(u32 data);
u32 PMi_SetLCDPower(int mode, int led, BOOL skipCheck, BOOL sync);
u32 PM_SetLCDPower(int mode);
int PM_GetLCDPower(void);
u32 PMi_SendLEDPatternCommandAsync(u32 pattern, PmCallback callback, void *arg);
u32 PMi_SendLEDPatternCommand(u32 pattern);
u32 PM_GetLEDPatternAsync(u32 *pattern, PmCallback callback, void *arg);
u32 PM_GetLEDPattern(u32 *pattern);
void PMi_PrependList(PmSleepCallbackInfo **list, PmSleepCallbackInfo *info);
void PMi_AppendList(PmSleepCallbackInfo **list, PmSleepCallbackInfo *info);
void PMi_DeleteList(PmSleepCallbackInfo **list, PmSleepCallbackInfo *info);
void PMi_ExecuteList(PmSleepCallbackInfo *list);
void PM_PrependPreSleepCallback(PmSleepCallbackInfo *info);
void PM_AppendPostSleepCallback(PmSleepCallbackInfo *info);
void PM_DeletePreSleepCallback(PmSleepCallbackInfo *info);
void PM_DeletePostSleepCallback(PmSleepCallbackInfo *info);

BOOL CTRDG_IsExisting(void);

#pragma force_active on

BOOL PMi_Lock(void) {
    OSIntrMode enabled = OS_DisableInterrupts();

    if (gPmWork.lock) {
        OS_RestoreInterrupts(enabled);
        return FALSE;
    }
    gPmWork.lock = TRUE;
    OS_RestoreInterrupts(enabled);
    return TRUE;
}

void PMi_WaitBusy(void) {
    volatile u32 *lock = &gPmLock;

    if (!*(u32 *)&gPmWork.lock) {
        return;
    }
    do {
        if (OS_GetCpsrIrq() == OS_INTRMODE_IRQ_DISABLE) {
            PXIi_HandlerRecvFifoNotEmpty();
        }
    } while (*lock);
}

void PMi_DummyCallback(u32 result, void *arg) {
    *(u32 *)arg = result;
}

void PMi_CallCallbackAndUnlock(u32 result) {
    PmCallback callback = gPmWork.callback;
    void *arg = gPmWork.callbackArg;

    if (gPmWork.lock) {
        gPmWork.lock = FALSE;
    }
    if (callback) {
        gPmWork.callback = NULL;
        callback(result, arg);
    }
}

#pragma push
#pragma opt_strength_reduction off

void PM_Init(void) {
    int i;

    if (gPmWork.init) {
        return;
    }
    gPmWork.init = 1;
    gPmWork.lock = FALSE;
    gPmWork.callback = NULL;
    PXI_Init();
    while (!PXI_IsCallbackReady(PXI_FIFO_TAG_PM, PXI_PROC_ARM7)) {}
    PXI_SetFifoRecvCallback(PXI_FIFO_TAG_PM, PMi_CommonCallback);
    for (i = 0; i < PM_REGISTER_COUNT; i++) {
        gPmRegisterReads[i].done = 0;
    }
    OS_InitMutex(&gPmMutex);
    gPmWork.lcdOffVBlankCount = PM_VBLANK_COUNT;
}

#pragma pop

void PMi_CommonCallback(PXIFifoTag tag, u32 data, BOOL err) {
    u16 command;
    u16 result;

    if (err) {
        PMi_CallCallbackAndUnlock(2);
        return;
    }
    command = (u16)((data & 0x7F00) >> 8);
    result = data & 0xFF;
    if (command >= 0x70 && command <= 0x74) { // register read replies
        u32 reg = command - 0x70;
        {
            u16 value = (u8)result;
            u16 *buffer = gPmRegisterBuffers[reg][0];
            if (buffer) {
                *buffer = value;
            }
        }
        gPmRegisterReads[reg].done = 1;
        result = 0;
    } else if (command == 0x60) {
        gPmWork.sleepReady = TRUE;
    } else if (command == 0x62) {
        gPmWork.unk_08 = TRUE;
    } else if (command == 0x67) {
        if (gPmWork.ledPattern) {
            *gPmWork.ledPattern = result;
        }
        result = 0;
    }
    PMi_CallCallbackAndUnlock(result);
}

u32 PMi_SendSleepStart(u16 trigger, u16 logic) {
    if (!PMi_Lock()) {
        return 1;
    }
    gPmWork.sleepReady = FALSE;
    PMi_SendPxiData(0x03006000);
    while (!gPmWork.sleepReady) {}
    gPmWork.sleepReady = FALSE;
    gPmWork.unk_08 = FALSE;
    PMi_SetLCDPower(0, 2, FALSE, TRUE);
    PMi_SendPxiData((trigger & 0xFF) | 0x02006100);
    PMi_SendPxiData(0x01010000 | (logic & 0xFFFF));
    return 0;
}

u32 PM_SendUtilityCommandAsync(u32 command, PmCallback callback, void *arg) {
    if (!PMi_Lock()) {
        return 1;
    }
    gPmWork.callback = callback;
    gPmWork.callbackArg = arg;
    PMi_SendPxiData(((command >> 16) & 0xFF) | 0x02006300);
    PMi_SendPxiData(0x01010000 | (command & 0xFFFF));
    return 0;
}

u32 PMi_ReadRegisterAsync(u32 reg, u16 *buffer, PmCallback callback, void *arg) {
    if (!PMi_Lock()) {
        return 1;
    }
    gPmWork.callback = callback;
    gPmWork.callbackArg = arg;
    gPmRegisterReads[reg].done = 0;
    gPmRegisterReads[reg].buffer = buffer;
    PMi_SendPxiData(0x03006500 | (reg & 0xFF));
    return 0;
}

u32 PMi_ReadRegister(u32 reg, u16 *buffer) {
    u32 result;
    u32 sent = PMi_ReadRegisterAsync(reg, buffer, PMi_DummyCallback, &result);

    if (sent) {
        return sent;
    }
    PMi_WaitBusy();
    return result;
}

u32 PMi_WriteRegisterAsync(u32 reg, u32 value, PmCallback callback, void *arg) {
    if (!PMi_Lock()) {
        return 1;
    }
    gPmWork.callback = callback;
    gPmWork.callbackArg = arg;
    PMi_SendPxiData((reg & 0xFF) | 0x6400 | 0x2000000);
    PMi_SendPxiData(0x01010000 | (value & 0xFFFF));
    return 0;
}

u32 PMi_WriteRegister(u32 reg, u32 value) {
    u32 result;
    u32 sent = PMi_WriteRegisterAsync(reg, value, PMi_DummyCallback, &result);

    if (sent) {
        return sent;
    }
    PMi_WaitBusy();
    return result;
}

u32 PMi_SetLEDAsync(int mode, PmCallback callback, void *arg) {
    int command;

    switch (mode) {
    case 1:
        command = 1;
        break;
    case 3:
        command = 2;
        break;
    case 2:
        command = 3;
        break;
    default:
        command = 0;
        break;
    }
    if (!command) {
        return 0xFFFF;
    }
    return PM_SendUtilityCommandAsync(command, callback, arg);
}

u32 PMi_SetLED(int mode) {
    u32 result;
    u32 sent = PMi_SetLEDAsync(mode, PMi_DummyCallback, &result);

    if (sent) {
        return sent;
    }
    PMi_WaitBusy();
    return result;
}

u32 PM_SetBackLightAsync(PMLCDTarget target, PMBackLightSwitch status, PmCallback callback, void *arg) {
    int command = 0;

    if (target == PM_LCD_TOP) {
        if (status == PM_BACKLIGHT_ON) {
            command = 6;
        }
        if (status == PM_BACKLIGHT_OFF) {
            command = 7;
        }
    } else if (target == PM_LCD_BOTTOM) {
        if (status == PM_BACKLIGHT_ON) {
            command = 4;
        }
        if (status == PM_BACKLIGHT_OFF) {
            command = 5;
        }
    } else if (target == PM_LCD_ALL) {
        if (status == PM_BACKLIGHT_ON) {
            command = 8;
        }
        if (status == PM_BACKLIGHT_OFF) {
            command = 9;
        }
    }
    if (!command) {
        return 0xFFFF;
    }
    return PM_SendUtilityCommandAsync(command, callback, arg);
}

u32 PM_SetBackLight(PMLCDTarget target, PMBackLightSwitch status) {
    u32 result;
    u32 sent = PM_SetBackLightAsync(target, status, PMi_DummyCallback, &result);

    if (sent) {
        return sent;
    }
    PMi_WaitBusy();
    return result;
}

// Switches the backlights and then the LCDs off before the power-off command.
u32 PM_ForceToPowerOffAsync(PmCallback callback, void *arg) {
    PMBackLightSwitch top, bottom;

    OS_SpinWait(0x996A00);
    if (PM_GetLCDPower() != 1) {
        PM_GetBackLight(&top, &bottom);
        if (top) {
            PM_SetBackLight(PM_LCD_TOP, PM_BACKLIGHT_OFF);
        }
        if (bottom) {
            PM_SetBackLight(PM_LCD_BOTTOM, PM_BACKLIGHT_OFF);
        }
        if (!PM_SetLCDPower(1)) {
            do {
                OS_SpinWait(0x996A00);
            } while (!PM_SetLCDPower(1));
        }
    }
    return PM_SendUtilityCommandAsync(14, callback, arg);
}

u32 PM_ForceToPowerOff(void) {
    u32 result;
    u32 sent = PM_ForceToPowerOffAsync(PMi_DummyCallback, &result);

    if (sent) {
        return sent;
    }
    PMi_WaitBusy();
    return result;
}

u32 PM_SetAmp(PMAmpSwitch status) {
    gPmWork.amp = status;
    return PMi_SetAmp(status);
}

u32 PMi_SetAmp(PMAmpSwitch status) {
    if (PM_GetLCDPower() == 0) {
        return 0;
    }
    return PMi_WriteRegister(2, (u16)status);
}

u32 PM_SetAmpGain(PMAmpGain gain) {
    return PMi_WriteRegister(3, (u16)gain);
}

u32 PM_GetBackLight(PMBackLightSwitch *top, PMBackLightSwitch *bottom) {
    u16 reg;
    u32 result = PMi_ReadRegister(0, &reg);

    if (result) {
        return result;
    }
    if (top) {
        *top = (reg & 8) ? PM_BACKLIGHT_ON : PM_BACKLIGHT_OFF;
    }
    if (bottom) {
        *bottom = (reg & 4) ? PM_BACKLIGHT_ON : PM_BACKLIGHT_OFF;
    }
    return result;
}

void PMi_SendPxiData(u32 data) {
    while (PXI_SendWordByFifo(PXI_FIFO_TAG_PM, data, FALSE) != 0) {}
}

static inline void PmWaitVBlank(volatile u32 *count) {
    while (*count == OS_GetVBlankCount()) {}
    *count = OS_GetVBlankCount();
}

void PM_GoSleepMode(PMWakeUpTrigger trigger, PMLogic logic, u16 keyPattern) {
    BOOL powerOff;
    u32 dispMain;
    u32 dispSub;
    u16 param1;
    u16 ime;
    OSIntrMode enabled;
    OSIrqMask mask;
    int lcd;
    PMBackLightSwitch top, bottom;
    volatile u32 count;

    powerOff = FALSE;
    PMi_ExecuteList(gPmWork.preSleep);
    ime = reg_OS_IME;
    reg_OS_IME = 0;
    enabled = OS_DisableInterrupts();
    mask = OS_DisableIrqMask(0x3FFFFF);
    OS_SetIrqMask((OS_IsTickAvailable() ? OS_IE_TIMER0 : 0) | OS_IE_SPFIFO_RECV);
    OS_RestoreInterrupts(enabled);
    (void)reg_OS_IME;
    reg_OS_IME = 1;
    if ((trigger & PM_TRIGGER_CARD) && PM_CONSOLE_TYPE == 2) {
        trigger &= ~PM_TRIGGER_CARD;
    }
    if ((trigger & PM_TRIGGER_CARTRIDGE) && !CTRDG_IsExisting()) {
        trigger &= ~PM_TRIGGER_CARTRIDGE;
    }
    dispMain = reg_GX_DISPCNT;
    dispSub = reg_GXS_DB_DISPCNT;
    lcd = PM_GetLCDPower();
    PM_GetBackLight(&top, &bottom);
    PM_SetBackLight(PM_LCD_ALL, PM_BACKLIGHT_OFF);
    count = OS_GetVBlankCount();
    PmWaitVBlank(&count);
    reg_GX_DISPCNT &= ~REG_GX_DISPCNT_MODE_MASK;
    reg_GXS_DB_DISPCNT &= ~REG_GXS_DB_DISPCNT_MODE_MASK;
    PmWaitVBlank(&count);
    while (count == OS_GetVBlankCount()) {}
    param1 = (u16)(trigger | (top << 5) | (bottom << 6));
    while (PMi_SendSleepStart(param1, (u16)(logic | keyPattern))) {}
    OS_Halt();
    if ((trigger & PM_TRIGGER_CARD) && (reg_OS_IF & REG_OS_IF_MI_MASK)) {
        powerOff = TRUE;
    }
    if (!powerOff) {
        if (lcd == 1) {
            PMi_SetLCDPower(1, 1, TRUE, TRUE);
        } else {
            PMi_SetLED(1);
        }
        reg_GX_DISPCNT = dispMain;
        reg_GXS_DB_DISPCNT = dispSub;
    }
    OS_SpinWait(0x708100);
    OS_DisableInterrupts();
    OS_SetIrqMask(mask);
    OS_RestoreInterrupts(enabled);
    (void)reg_OS_IME;
    reg_OS_IME = ime;
    if (powerOff) {
        PM_ForceToPowerOff();
    }
    PMi_ExecuteList(gPmWork.postSleep);
}

// mode 1: on, 0: off. Switching on is refused within 8 frames of switching off unless skipCheck.
u32 PMi_SetLCDPower(int mode, int led, BOOL skipCheck, BOOL sync) {
    if (mode != 0) {
        if (mode == 1) {
            if (!skipCheck) {
                if ((u32)(PM_VBLANK_COUNT - gPmWork.lcdOffVBlankCount) <= 7) {
                    return 0;
                }
            }
            if (led) {
                if (sync) {
                    PMi_SetLED(led);
                } else {
                    PMi_SetLEDAsync(led, NULL, NULL);
                }
            }
            reg_GX_POWCNT |= REG_GX_POWCNT_LCD_MASK;
            PMi_SetAmp(gPmWork.amp);
        }
    } else {
        PMi_SetAmp(PM_AMP_OFF);
        reg_GX_POWCNT &= ~REG_GX_POWCNT_LCD_MASK;
        gPmWork.lcdOffVBlankCount = PM_VBLANK_COUNT;
        if (led) {
            if (sync) {
                PMi_SetLED(led);
            } else {
                PMi_SetLEDAsync(led, NULL, NULL);
            }
        }
    }
    return 1;
}

u32 PM_SetLCDPower(int mode) {
    if (mode != 1) {
        mode = 0;
    }
    return PMi_SetLCDPower(mode, 0, FALSE, TRUE);
}

int PM_GetLCDPower(void) {
    return (reg_GX_POWCNT & REG_GX_POWCNT_LCD_MASK) ? 1 : 0;
}

u32 PMi_SendLEDPatternCommandAsync(u32 pattern, PmCallback callback, void *arg) {
    if (!PMi_Lock()) {
        return 1;
    }
    gPmWork.callback = callback;
    gPmWork.callbackArg = arg;
    PMi_SendPxiData((pattern & 0xFF) | 0x6600 | 0x3000000);
    return 0;
}

u32 PMi_SendLEDPatternCommand(u32 pattern) {
    u32 result;
    u32 sent = PMi_SendLEDPatternCommandAsync(pattern, PMi_DummyCallback, &result);

    if (sent) {
        return sent;
    }
    PMi_WaitBusy();
    return result;
}

u32 PM_GetLEDPatternAsync(u32 *pattern, PmCallback callback, void *arg) {
    if (!PMi_Lock()) {
        return 1;
    }
    gPmWork.callback = callback;
    gPmWork.callbackArg = arg;
    gPmWork.ledPattern = pattern;
    PMi_SendPxiData(0x03006700);
    return 0;
}

u32 PM_GetLEDPattern(u32 *pattern) {
    u32 result;
    u32 sent = PM_GetLEDPatternAsync(pattern, PMi_DummyCallback, &result);

    if (sent) {
        return sent;
    }
    PMi_WaitBusy();
    return result;
}

void PMi_PrependList(PmSleepCallbackInfo **list, PmSleepCallbackInfo *info) {
    if (list) {
        info->next = *list;
        *list = info;
    }
}

void PMi_AppendList(PmSleepCallbackInfo **list, PmSleepCallbackInfo *info) {
    PmSleepCallbackInfo *p, *next;

    if (!list) {
        return;
    }
    p = *list;
    if (!p) {
        info->next = NULL;
        *list = info;
        return;
    }
    while ((next = p->next) != NULL) {
        p = next;
    }
    info->next = next;
    p->next = info;
}

void PMi_DeleteList(PmSleepCallbackInfo **list, PmSleepCallbackInfo *info) {
    PmSleepCallbackInfo *p, *prev;

    if (!list) {
        return;
    }
    p = *list;
    prev = p;
    if (!p) {
        return;
    }
    do {
        if (p == info) {
            if (p == prev) {
                *list = p->next;
            } else {
                prev->next = p->next;
            }
            return;
        }
        prev = p;
        p = p->next;
    } while (p);
}

void PMi_ExecuteList(PmSleepCallbackInfo *list) {
    while (list) {
        list->func(list->arg);
        list = list->next;
    }
}

void PM_PrependPreSleepCallback(PmSleepCallbackInfo *info) {
    PMi_PrependList(&gPmPreSleepCallbacks, info);
}

void PM_AppendPostSleepCallback(PmSleepCallbackInfo *info) {
    PMi_AppendList(&gPmPostSleepCallbacks, info);
}

void PM_DeletePreSleepCallback(PmSleepCallbackInfo *info) {
    PMi_DeleteList(&gPmPreSleepCallbacks, info);
}

void PM_DeletePostSleepCallback(PmSleepCallbackInfo *info) {
    PMi_DeleteList(&gPmPostSleepCallbacks, info);
}
