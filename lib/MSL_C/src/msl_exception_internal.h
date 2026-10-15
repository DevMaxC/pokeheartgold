#ifndef MSL_EXCEPTION_INTERNAL_H
#define MSL_EXCEPTION_INTERNAL_H

#include <nitro/types.h>

// Exception handling runtime internals shared by the MSL C++ support modules. The runtime functions are
// written as C under their mangled C++ names (as compiled), so the prototypes below use those names.

// One entry of the exception table index, sorted by function start address.
typedef struct ExceptionTableIndex {
    char *functionStart;
    u32 functionSize; // bit 0 set: the unwind information is stored in place of unwindInfo
    char *unwindInfo;
} ExceptionTableIndex;

// The function a return address belongs to, with its unwind information and current action record.
typedef struct ExceptionInfo {
    char *functionStart;             // 0x00
    char *unwindInfo;                // 0x04: NULL when the function has no exception table entry
    char *action;                    // 0x08: current action record
    ExceptionTableIndex *tableStart; // 0x0C
    ExceptionTableIndex *tableEnd;   // 0x10
    u32 unk_14;
} ExceptionInfo;

// Register state of the frame being unwound.
typedef struct ThrowFrameState {
    u32 registers[16]; // 0x1C in ThrowContext
    u32 unk_5C;
    u32 frameSize;        // 0x60
    u32 extraSize;        // 0x64
    u16 savedRegisters;   // 0x68: mask of the registers saved by the frame
    u8 flag20;            // 0x6A: unwind flag 0x20 (16 bytes above the saved registers)
    u8 usesFramePointer;  // 0x6B: unwind flag 0x40
    u8 thumbFramePointer; // 0x6C: unwind flag 0x80 (frame pointer r7, else r11)
} ThrowFrameState;

// State of a throw while the stack is searched and unwound.
typedef struct ThrowContext {
    const unsigned char *throwType;  // 0x00: mangled type of the thrown object (NULL: rethrow)
    void *object;                    // 0x04
    void (*destructor)(void *, int); // 0x08
    void *catchInfo;                 // 0x0C: catch info of a rethrown exception
    char *returnAddress;             // 0x10
    char *stackPointer;              // 0x14
    char *frame;                     // 0x18
    ThrowFrameState state;           // 0x1C
} ThrowContext;

// Walks the action records of a function and, past its last one, of its callers.
typedef struct ActionIterator {
    ExceptionInfo info;
    ThrowContext context;
} ActionIterator;

// Exception specification of a function (action 15).
typedef struct ex_specification {
    u32 typeCount;
    u32 handlerOffset;
    s32 catchInfoOffset;
    char *types; // typeCount little-endian type string pointers
} ex_specification;

// Catch handler of a try block (action 12).
typedef struct CatchHandler {
    const unsigned char *catchType;
    u32 handlerOffset;
    s32 catchInfoOffset;
} CatchHandler;

// Information about the caught exception, stored in the handler's frame.
typedef struct CatchInfo {
    void *location;
    const unsigned char *typeinfo;
    void (*dtor)(void *, int);
    void *sublocation; // the object, adjusted to the caught type
    long pointercopy;  // adjusted pointer when a pointer was thrown
    char *stacktop;
} CatchInfo;

// Action codes (low five bits of an action record).
#define EXCEPTION_ACTION_END_OF_LIST        0
#define EXCEPTION_ACTION_BRANCH             1
#define EXCEPTION_ACTION_CATCH_BLOCK        12
#define EXCEPTION_ACTION_ACTIVE_CATCH_BLOCK 13
#define EXCEPTION_ACTION_TERMINATE          14
#define EXCEPTION_ACTION_SPECIFICATION      15
#define EXCEPTION_ACTION_NONE               255

// msl_exception_frames.c
int __throw_catch_compare(const unsigned char *thrown, const unsigned char *caught, int *adjust);
char *_Z15__PopStackFrameP12ThrowContextP13ExceptionInfo(ThrowContext *context, ExceptionInfo *info);
void _Z16__SetupFrameInfoP12ThrowContextP13ExceptionInfo(ThrowContext *context, ExceptionInfo *info);
BOOL _Z20__FindExceptionTableP13ExceptionInfoPc(ExceptionInfo *info, char *position);
char *_Z16__SkipUnwindInfoPc(char *p);

// msl_exception_table.c
char *_Z20__DecodeSignedNumberPcPl(char *p, s32 *value);
char *_Z22__DecodeUnsignedNumberPcPm(char *p, u32 *value);
ExceptionTableIndex *_Z12BinarySearchP19ExceptionTableIndexmPc(ExceptionTableIndex *table, u32 count, char *position);
void _Z19FindExceptionRecordPcP13ExceptionInfo(char *position, ExceptionInfo *info);
u32 _Z13CurrentActionPK14ActionIterator(const ActionIterator *iterator);
u32 _Z10NextActionP14ActionIterator(ActionIterator *iterator);

// msl_exception_lookup.c
CatchInfo *_Z23FindMostRecentExceptionP12ThrowContextP13ExceptionInfo(ThrowContext *context, ExceptionInfo *info);
BOOL _Z17IsInSpecificationPcP16ex_specification(const unsigned char *type, ex_specification *specification);

// msl_exception_throw.c
char *_Z20FindExceptionHandlerP12ThrowContextP13ExceptionInfoPl(ThrowContext *context, ExceptionInfo *info, s32 *adjust);
void _Z14SetupCatchInfoP12ThrowContextll(ThrowContext *context, s32 catchInfoOffset, s32 adjust);
void _Z14__ThrowHandlerP12ThrowContext(ThrowContext *context);
void __end__catch(CatchInfo *catchInfo);

// C++ runtime modules
void _Z16HandleUnexpectedP12ThrowContextP13ExceptionInfoP16ex_specificationPc(ThrowContext *context, ExceptionInfo *info, ex_specification *specification, char *action);
void _Z11UnwindStackP12ThrowContextP13ExceptionInfoPc(ThrowContext *context, ExceptionInfo *info, char *action);
void _Z17__TransferControlP12ThrowContextP13ExceptionInfoPc(ThrowContext *context, ExceptionInfo *info, char *address);
void _ZSt9terminatev(void);

#endif // MSL_EXCEPTION_INTERNAL_H
