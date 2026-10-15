#include <nitro/types.h>

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

#include "msl_exception_internal.h"

#pragma force_active on

// Throwing: finding the catch handler for the thrown type, filling in the handler's catch info, the
// throw handler itself and the end of a catch block.

static inline u32 ReadWord(const u8 *p) {
    return p[0] | ((u32)p[1] << 8) | ((u32)p[2] << 16) | ((u32)p[3] << 24);
}

char *_Z20FindExceptionHandlerP12ThrowContextP13ExceptionInfoPl(ThrowContext *context, ExceptionInfo *info, s32 *adjust) {
    struct {
        ex_specification specification;
        CatchHandler handler;
        ActionIterator iterator;
    } f;

    u8 *p;
    u32 action;
    f.iterator.info.functionStart = info->functionStart;
    f.iterator.info.unwindInfo = info->unwindInfo;
    f.iterator.info.action = info->action;
    f.iterator.info.tableStart = info->tableStart;
    f.iterator.info.tableEnd = info->tableEnd;
    f.iterator.info.unk_14 = info->unk_14;
    f.iterator.context.throwType = context->throwType;
    f.iterator.context.object = context->object;
    f.iterator.context.destructor = context->destructor;
    f.iterator.context.catchInfo = context->catchInfo;
    f.iterator.context.returnAddress = context->returnAddress;
    f.iterator.context.stackPointer = context->stackPointer;
    f.iterator.context.frame = context->frame;
    f.iterator.context.state = context->state;
    action = _Z13CurrentActionPK14ActionIterator(&f.iterator);
    for (;;) {
        switch (action) {
        case EXCEPTION_ACTION_CATCH_BLOCK:
            p = (u8 *)f.iterator.info.action;
            f.handler.catchType = (const unsigned char *)ReadWord(p + 1);
            p = (u8 *)_Z22__DecodeUnsignedNumberPcPm((char *)p + 5, &f.handler.handlerOffset);
            _Z20__DecodeSignedNumberPcPl((char *)p, &f.handler.catchInfoOffset);
            if (!__throw_catch_compare(context->throwType, f.handler.catchType, (int *)adjust)) {
                goto next;
            }
            goto found;
        case EXCEPTION_ACTION_SPECIFICATION:
            p = (u8 *)_Z22__DecodeUnsignedNumberPcPm(f.iterator.info.action + 1, &f.specification.typeCount);
            p = (u8 *)_Z22__DecodeUnsignedNumberPcPm((char *)p, &f.specification.handlerOffset);
            f.specification.types = _Z20__DecodeSignedNumberPcPl((char *)p, &f.specification.catchInfoOffset);
            if (!_Z17IsInSpecificationPcP16ex_specification(context->throwType, &f.specification)) {
                _Z16HandleUnexpectedP12ThrowContextP13ExceptionInfoP16ex_specificationPc(context, info, &f.specification, f.iterator.info.action);
            }
            break;
        case EXCEPTION_ACTION_END_OF_LIST:
        case 2:
        case 3:
        case 4:
        case 5:
        case 6:
        case 7:
        case 8:
        case 9:
        case 10:
        case 11:
        case EXCEPTION_ACTION_ACTIVE_CATCH_BLOCK:
        case 16:
        case 17:
        case 18:
        case 19:
            break;
        default:
            _ZSt9terminatev();
            goto found;
        }
next:
        action = _Z10NextActionP14ActionIterator(&f.iterator);
    }
found:
    return f.iterator.info.action;
}

void _Z14SetupCatchInfoP12ThrowContextll(ThrowContext *context, s32 catchInfoOffset, s32 adjust) {
    CatchInfo *catchInfo = (CatchInfo *)(context->frame + catchInfoOffset);
    catchInfo->location = context->object;
    catchInfo->typeinfo = context->throwType;
    catchInfo->dtor = context->destructor;
    if (context->throwType[0] == '*') {
        // a pointer was thrown: catch a copy of the adjusted pointer
        catchInfo->sublocation = &catchInfo->pointercopy;
        catchInfo->pointercopy = (long)((u8 *)*(void **)context->object + adjust);
    } else {
        catchInfo->sublocation = (u8 *)context->object + adjust;
    }
}

void _Z14__ThrowHandlerP12ThrowContext(ThrowContext *context) {
    ExceptionInfo info;

    struct {
        s32 adjust;
        CatchHandler handler;
    } f;

    u8 *action;
    char *p;
    _Z19FindExceptionRecordPcP13ExceptionInfo(context->returnAddress, &info);
    if (info.unwindInfo == NULL) {
        _ZSt9terminatev();
    }
    _Z16__SetupFrameInfoP12ThrowContextP13ExceptionInfo(context, &info);
    if (context->throwType != NULL) {
        context->catchInfo = NULL;
    } else {
        // rethrow
        context->catchInfo = _Z23FindMostRecentExceptionP12ThrowContextP13ExceptionInfo(context, &info);
        if (context->catchInfo == NULL) {
            _ZSt9terminatev();
        }
    }
    action = (u8 *)_Z20FindExceptionHandlerP12ThrowContextP13ExceptionInfoPl(context, &info, &f.adjust);
    f.handler.catchType = (const unsigned char *)ReadWord(action + 1);
    p = _Z22__DecodeUnsignedNumberPcPm((char *)action + 5, &f.handler.handlerOffset);
    _Z20__DecodeSignedNumberPcPl(p, &f.handler.catchInfoOffset);
    _Z11UnwindStackP12ThrowContextP13ExceptionInfoPc(context, &info, (char *)action);
    _Z14SetupCatchInfoP12ThrowContextll(context, f.handler.catchInfoOffset, f.adjust);
    _Z17__TransferControlP12ThrowContextP13ExceptionInfoPc(context, &info, info.functionStart + f.handler.handlerOffset);
}

void __end__catch(CatchInfo *catchInfo) {
    if (catchInfo->location && catchInfo->dtor) {
        catchInfo->dtor(catchInfo->location, -1);
    }
}
