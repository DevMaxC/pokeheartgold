#include <nitro/types.h>

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

#include "msl_exception_internal.h"

#pragma force_active on

// Exception handling runtime: catch type matching on the mangled type strings, popping a stack frame,
// frame information, the exception table bounds and skipping unwind information.

extern ExceptionTableIndex __exception_table_start__[];
extern ExceptionTableIndex __exception_table_end__[];

int __throw_catch_compare(const unsigned char *thrown, const unsigned char *caught, int *adjust) {
    const unsigned char *cursor = caught;
    int n;
    *adjust = 0;
    if (caught == 0) {
        return 1;
    }
    if (*caught == 'P') {
        cursor++;
        if (*cursor == 'V') {
            cursor++;
        }
        if (*cursor == 'K') {
            cursor++;
        }
        if (*cursor == 'v' && (*thrown == 'P' || *thrown == '*')) {
            return 1;
        }
        cursor = caught;
    }
    if (*thrown == '!' || *thrown == '*') {
        if (*thrown++ != *cursor++) {
            return 0;
        }
        for (;;) {
            if (*thrown == *cursor++) {
                if (*thrown++ == '!') {
                    n = 0;
                    while (*thrown != '!') {
                        n = n * 10 + *thrown++ - '0';
                    }
                    *adjust = n;
                    return 1;
                }
            } else {
                while (*thrown++ != '!') {}
                while (*thrown++ != '!') {}
                if (*thrown == 0) {
                    return 0;
                }
                cursor = caught + 1;
            }
        }
    }
    while ((*thrown == 'P' || *thrown == 'R') && *thrown == *cursor) {
        thrown++;
        cursor++;
        if (*cursor == 'K') {
            if (*thrown == 'K') {
                thrown++;
            }
            cursor++;
        }
        if (*thrown == 'K') {
            return 0;
        }
        if (*cursor == 'V') {
            if (*thrown == 'V') {
                thrown++;
            }
            cursor++;
        }
        if (*(const volatile unsigned char *)thrown == 'V') {
            return 0;
        }
    }
    while (*thrown == *cursor) {
        if (!*thrown) {
            return 1;
        }
        thrown++;
        cursor++;
    }
    return 0;
}

char *_Z15__PopStackFrameP12ThrowContextP13ExceptionInfo(ThrowContext *context, ExceptionInfo *info) {
    u32 size = context->state.frameSize;
    u32 *cursor = (u32 *)(context->frame + size - (context->state.flag20 ? 16 : 0));
    int i;
    for (i = 15; i >= 0; i--) {
        if (context->state.savedRegisters & (1u << i)) {
            context->state.registers[i] = *--cursor;
        }
    }
    context->stackPointer = context->frame + size;
    return (char *)context->state.registers[14];
}

void _Z16__SetupFrameInfoP12ThrowContextP13ExceptionInfo(ThrowContext *context, ExceptionInfo *info) {
    u8 *src = (u8 *)info->unwindInfo;
    u32 flags = src[0], forty = flags & 0x40, eighty;
    context->state.usesFramePointer = forty != 0;
    context->state.flag20 = (flags & 0x20) != 0;
    eighty = flags & 0x80;
    context->state.thumbFramePointer = eighty != 0;
    context->state.savedRegisters = src[1] << 4;
    context->state.savedRegisters |= 0x4000;
    src = (u8 *)_Z22__DecodeUnsignedNumberPcPm((char *)(src + 2), &context->state.frameSize);
    if (forty) {
        src = (u8 *)_Z22__DecodeUnsignedNumberPcPm((char *)src, &context->state.extraSize);
    }
    if (forty) {
        if (eighty) {
            context->frame = (char *)context->state.registers[7];
        } else {
            context->frame = (char *)context->state.registers[11];
        }
    } else {
        context->frame = context->stackPointer;
    }
}

BOOL _Z20__FindExceptionTableP13ExceptionInfoPc(ExceptionInfo *info, char *position) {
    info->tableStart = __exception_table_start__;
    info->tableEnd = __exception_table_end__;
    return TRUE;
}

char *_Z16__SkipUnwindInfoPc(char *p) {
    u32 value;
    u8 flag = *p;
    p = _Z22__DecodeUnsignedNumberPcPm(p + 2, &value);
    if (flag & 0x40) {
        p = _Z22__DecodeUnsignedNumberPcPm(p, &value);
    }
    return p;
}
