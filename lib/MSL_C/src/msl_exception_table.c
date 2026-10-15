#include <nitro/types.h>

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

#include "msl_exception_internal.h"

#pragma force_active on

// Exception table lookup: variable-length number decoding, the binary search of the table index, the
// exception record of a return address and the iteration over a function's action records.

// Operands of the action records skipped by NextAction (decoded only to find the next record).
typedef struct ActionOperands {
    s32 branch;
    s32 action19;

    struct {
        s32 a, b;
        u32 c;
    } action18;

    struct {
        s32 first, third, second, last;
    } action17;

    struct {
        s32 a, b, c;
        u32 raw;
    } action16;

    struct {
        u32 typeCount, handlerOffset;
        s32 catchInfoOffset;
    } specification;

    s32 activeCatchBlock;

    struct {
        u32 handlerOffset;
        s32 catchInfoOffset;
    } catchBlock;

    struct {
        s32 a, b;
    } action11;

    s32 action10;

    struct {
        s32 a, b;
        u32 c, d;
    } action9;

    struct {
        s32 a, b, c;
    } action8;

    struct {
        s32 a, b;
    } action7, action6;

    struct {
        s32 a;
        u32 b, c;
    } action5;

    s32 action4;

    struct {
        s32 a, b;
    } action3;

    s32 action2;
} ActionOperands;

// Numbers are stored in 1 to 4 bytes, big-endian; the low bits of the first byte give the length.
char *_Z20__DecodeSignedNumberPcPl(char *p, s32 *value) {
    s32 a = *(const s8 *)p;
    u32 b, c, d;
    if (!(a & 1)) {
        *value = a >> 1;
        return p + 1;
    }
    b = (u8)p[1];
    if (!(a & 2)) {
        *value = ((a >> 2) << 8) | b;
        return p + 2;
    }
    c = (u8)p[2];
    if (!(a & 4)) {
        *value = ((a >> 3) << 16) | (b << 8) | c;
        return p + 3;
    }
    d = (u8)p[3];
    *value = ((a >> 3) << 24) | (b << 16) | (c << 8) | d;
    return p + 4;
}

char *_Z22__DecodeUnsignedNumberPcPm(char *p, u32 *value) {
    u32 a = *(const u8 *)p;
    u32 b, c, d;
    if (!(a & 1)) {
        *value = a >> 1;
        return p + 1;
    }
    b = (u8)p[1];
    if (!(a & 2)) {
        *value = ((a >> 2) << 8) | b;
        return p + 2;
    }
    c = (u8)p[2];
    if (!(a & 4)) {
        *value = ((a >> 3) << 16) | (b << 8) | c;
        return p + 3;
    }
    d = (u8)p[3];
    *value = ((a >> 3) << 24) | (b << 16) | (c << 8) | d;
    return p + 4;
}

ExceptionTableIndex *_Z12BinarySearchP19ExceptionTableIndexmPc(ExceptionTableIndex *table, u32 count, char *position) {
    s32 low = 0, high = count - 1;
    while (low <= high) {
        s32 mid = (low + high) >> 1;
        ExceptionTableIndex *entry = &table[mid];
        if (position < entry->functionStart) {
            high = mid - 1;
        } else if (position > entry->functionStart + (entry->functionSize & ~1)) {
            low = mid + 1;
        } else {
            return entry;
        }
    }
    return NULL;
}

void _Z19FindExceptionRecordPcP13ExceptionInfo(char *position, ExceptionInfo *info) {
    ExceptionTableIndex *index;
    char *p;
    u32 delta, length, offset, relative, base;
    info->unwindInfo = NULL;
    info->action = NULL;
    if (!_Z20__FindExceptionTableP13ExceptionInfoPc(info, position)) {
        return;
    }
    index = _Z12BinarySearchP19ExceptionTableIndexmPc(info->tableStart, info->tableEnd - info->tableStart, position);
    if (!index) {
        return;
    }
    if (index->functionSize & 1) {
        info->unwindInfo = (char *)&index->unwindInfo;
    } else {
        info->unwindInfo = index->unwindInfo;
    }
    info->functionStart = index->functionStart;
    relative = position - index->functionStart;
    p = _Z16__SkipUnwindInfoPc(info->unwindInfo);
    base = 0;
    // (start delta, length, action offset) ranges of the function's code
    for (;;) {
        p = _Z22__DecodeUnsignedNumberPcPm(p, &delta);
        if (delta == 0) {
            return;
        }
        p = _Z22__DecodeUnsignedNumberPcPm(p, &length);
        p = _Z22__DecodeUnsignedNumberPcPm(p, &offset);
        {
            u32 start = base + delta;
            if (relative < start) {
                return;
            }
            base = start + length;
        }
        if (relative > base) {
            continue;
        }
        info->action = info->unwindInfo + offset;
        return;
    }
}

u32 _Z13CurrentActionPK14ActionIterator(const ActionIterator *iterator) {
    return (u8)(iterator->info.action ? (*(u8 *)iterator->info.action & 0x1F) : EXCEPTION_ACTION_END_OF_LIST);
}

// Byte-pointer forms of the number decoders for NextAction.
static inline u8 *DecodeSigned(u8 *p, s32 *value) {
    return (u8 *)_Z20__DecodeSignedNumberPcPl((char *)p, value);
}

static inline u8 *DecodeUnsigned(u8 *p, u32 *value) {
    return (u8 *)_Z22__DecodeUnsignedNumberPcPm((char *)p, value);
}

u32 _Z10NextActionP14ActionIterator(ActionIterator *iterator) {
    ActionOperands f;
    u8 *p;
    u32 action;
again:
    p = (u8 *)iterator->info.action;
    if (!p || (*p & 0x80)) {
        // last action of this function: continue in the caller
        _Z19FindExceptionRecordPcP13ExceptionInfo(_Z15__PopStackFrameP12ThrowContextP13ExceptionInfo(&iterator->context, &iterator->info), &iterator->info);
        if (!iterator->info.unwindInfo) {
            return EXCEPTION_ACTION_NONE;
        }
        _Z16__SetupFrameInfoP12ThrowContextP13ExceptionInfo(&iterator->context, &iterator->info);
        if (!iterator->info.action) {
            goto again;
        }
        goto next;
    }
    switch (*p & 0x1F) {
    case 2:
        p = DecodeSigned(p + 1, &f.action2);
        iterator->info.action = (char *)p + 4;
        break;
    case 3:
        p = DecodeSigned(p + 1, &f.action3.a);
        p = DecodeSigned(p, &f.action3.b);
        iterator->info.action = (char *)p + 4;
        break;
    case 4:
        p = DecodeSigned(p + 1, &f.action4);
        iterator->info.action = (char *)p + 4;
        break;
    case 5:
        p = DecodeSigned(p + 1, &f.action5.a);
        p = DecodeUnsigned(p, &f.action5.b);
        p = DecodeUnsigned(p, &f.action5.c);
        iterator->info.action = (char *)p + 4;
        break;
    case 6:
        p = DecodeSigned(p + 1, &f.action6.a);
        p = DecodeSigned(p, &f.action6.b);
        iterator->info.action = (char *)p + 4;
        break;
    case 7:
        p = DecodeSigned(p + 1, &f.action7.a);
        p = DecodeSigned(p, &f.action7.b);
        iterator->info.action = (char *)p + 4;
        break;
    case 8:
        p = DecodeSigned(p + 1, &f.action8.a);
        p = DecodeSigned(p, &f.action8.b);
        p = DecodeSigned(p, &f.action8.c);
        iterator->info.action = (char *)p + 4;
        break;
    case 9:
        p = DecodeSigned(p + 1, &f.action9.a);
        p = DecodeSigned(p, &f.action9.b);
        p = DecodeUnsigned(p, &f.action9.c);
        p = DecodeUnsigned(p, &f.action9.d);
        iterator->info.action = (char *)p + 4;
        break;
    case 10:
        p = DecodeSigned(p + 1, &f.action10);
        iterator->info.action = (char *)p + 4;
        break;
    case 11:
        p = DecodeSigned(p + 1, &f.action11.a);
        p = DecodeSigned(p, &f.action11.b);
        iterator->info.action = (char *)p + 4;
        break;
    case EXCEPTION_ACTION_CATCH_BLOCK:
        // the catch type pointer (4 bytes) follows the code byte
        p = DecodeUnsigned(p + 5, &f.catchBlock.handlerOffset);
        p = DecodeSigned(p, &f.catchBlock.catchInfoOffset);
        iterator->info.action = (char *)p;
        break;
    case EXCEPTION_ACTION_ACTIVE_CATCH_BLOCK:
        iterator->info.action = (char *)DecodeSigned(p + 1, &f.activeCatchBlock);
        break;
    case EXCEPTION_ACTION_SPECIFICATION:
        p = DecodeUnsigned(p + 1, &f.specification.typeCount);
        p = DecodeUnsigned(p, &f.specification.handlerOffset);
        p = DecodeSigned(p, &f.specification.catchInfoOffset);
        iterator->info.action = (char *)p + f.specification.typeCount * 4;
        break;
    case 16:
        p = DecodeSigned(p + 1, &f.action16.a);
        p = DecodeSigned(p, &f.action16.b);
        f.action16.raw = (u32)p[0] | ((u32)p[1] << 8) | ((u32)p[2] << 16) | ((u32)p[3] << 24);
        p = DecodeSigned(p + 4, &f.action16.c);
        iterator->info.action = (char *)p + 4;
        break;
    case 17:
        p = DecodeSigned(p + 1, &f.action17.first);
        p = DecodeSigned(p, &f.action17.second);
        p = DecodeSigned(p + 1, &f.action17.third);
        p = DecodeSigned(p, &f.action17.last);
        iterator->info.action = (char *)p + 4;
        break;
    case 18:
        p = DecodeSigned(p + 1, &f.action18.a);
        p = DecodeSigned(p + 1, &f.action18.b);
        p = DecodeUnsigned(p, &f.action18.c);
        iterator->info.action = (char *)p + 4;
        break;
    case 19:
        iterator->info.action = (char *)DecodeSigned(p + 1, &f.action19);
        break;
    default:
        return EXCEPTION_ACTION_NONE;
    }
next:
    p = (u8 *)iterator->info.action;
    action = *p & 0x1F;
    if (action != EXCEPTION_ACTION_BRANCH) {
        return action;
    }
    do {
        DecodeSigned(p + 1, &f.branch);
        iterator->info.action += f.branch;
        p = (u8 *)iterator->info.action;
        action = *p & 0x1F;
    } while (action == EXCEPTION_ACTION_BRANCH);
    return action;
}
