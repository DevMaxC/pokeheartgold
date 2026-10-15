#include <nitro/types.h>

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

#include "msl_exception_internal.h"

#pragma force_active on

// Finding the exception being rethrown (the innermost active catch block) and checking a thrown type
// against an exception specification.

CatchInfo *_Z23FindMostRecentExceptionP12ThrowContextP13ExceptionInfo(ThrowContext *context, ExceptionInfo *info) {
    ActionIterator iterator;
    s32 offset;
    u32 action;
    CatchInfo *catchInfo;
    iterator.info.functionStart = info->functionStart;
    iterator.info.unwindInfo = info->unwindInfo;
    iterator.info.action = info->action;
    iterator.info.tableStart = info->tableStart;
    iterator.info.tableEnd = info->tableEnd;
    iterator.info.unk_14 = info->unk_14;
    iterator.context.throwType = context->throwType;
    iterator.context.object = context->object;
    iterator.context.destructor = context->destructor;
    iterator.context.catchInfo = context->catchInfo;
    iterator.context.returnAddress = context->returnAddress;
    iterator.context.stackPointer = context->stackPointer;
    iterator.context.frame = context->frame;
    iterator.context.state = context->state;
    action = _Z13CurrentActionPK14ActionIterator(&iterator);
    for (;;) {
        switch (action) {
        default:
        case EXCEPTION_ACTION_BRANCH:
        case EXCEPTION_ACTION_TERMINATE:
            return NULL;
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
        case EXCEPTION_ACTION_CATCH_BLOCK:
        case EXCEPTION_ACTION_SPECIFICATION:
        case 16:
        case 17:
        case 18:
            action = _Z10NextActionP14ActionIterator(&iterator);
            break;
        case EXCEPTION_ACTION_ACTIVE_CATCH_BLOCK:
            _Z20__DecodeSignedNumberPcPl(iterator.info.action + 1, &offset);
            catchInfo = (CatchInfo *)(iterator.context.frame + offset);
            context->throwType = catchInfo->typeinfo;
            context->object = catchInfo->location;
            context->destructor = NULL;
            context->catchInfo = catchInfo;
            return catchInfo;
        }
    }
}

BOOL _Z17IsInSpecificationPcP16ex_specification(const unsigned char *type, ex_specification *specification) {
    struct {
        int adjust;
        const unsigned char *type;
    } match;

    u8 *p = (u8 *)specification->types;
    u32 i;
    for (i = 0; i < specification->typeCount; i++, p += 4) {
        match.type = (const unsigned char *)(p[0] | p[1] << 8 | p[2] << 16 | p[3] << 24);
        if (__throw_catch_compare(type, match.type, &match.adjust)) {
            return TRUE;
        }
    }
    return FALSE;
}
