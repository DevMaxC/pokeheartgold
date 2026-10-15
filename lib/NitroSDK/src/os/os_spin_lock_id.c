#include <nitro.h>

#define OSi_LOCKID_INITIAL_FLAG_0 0xffffffff
#define OSi_LOCKID_INITIAL_FLAG_1 0xffff0000

#ifdef SDK_ARM9
#define OSi_ANYP_LOCK_ID_FLAG  HW_LOCK_ID_FLAG_MAIN
#define OSi_ANYP_LOCK_ID_START OS_MAINP_LOCK_ID_START
#else
#define OSi_ANYP_LOCK_ID_FLAG  HW_LOCK_ID_FLAG_SUB
#define OSi_ANYP_LOCK_ID_START OS_SUBP_LOCK_ID_START
#endif

void OSi_AllocateCartridgeBus(void);
void OSi_FreeCartridgeBus(void);
void OSi_AllocateCardBus(void);
void OSi_FreeCardBus(void);

// FIXME: This looks like it's meant to be a linker-inserted veneer, but I can't get it to insert properly yet
#ifdef SDK_ARM9
static inline void OSi_WaitByLoop(void) {
    SVC_WaitByLoop(0x1000 / 4);
}
#else
void VENEER_SVC_WaitByLoop(s32 count);

static inline void OSi_WaitByLoop(void) {
    VENEER_SVC_WaitByLoop(0x1000 / 4);
}
#endif

#ifdef SDK_ARM7
// clang-format off
asm void VENEER_SVC_WaitByLoop(register s32 count) {
    ldr ip, =SVC_WaitByLoop
    bx ip
}
// clang-format on

#endif

#ifdef SDK_ARM7
static inline
#endif // SDK_ARM7

    // For backwards compatibility.
    // Nintendo decided they didn't want to use a define here,
    // so they made an asm func instead
    // clang-format off
asm s32 OS_UnLockCartridge(u16 lockID) {
    ldr r1, =OS_UnlockCartridge
    bx r1
}
// clang-format on

// For backwards compatibility.
// Nintendo decided they didn't want to use a define here,
// so they made an asm func instead
// clang-format off
asm s32 OS_UnLockCard(u16 lockID) {
    ldr r1, =OS_UnlockCard
    bx r1
}
// clang-format on

BOOL OS_TryLockCard(u16 lockID) {
    return OSi_DoTryLockByWord(lockID, (OSLockWord *)HW_CARD_LOCK_BUF, OSi_AllocateCardBus, FALSE);
}

// clang-format off
asm s32 OS_GetLockID(void) {
    ldr r3, =OSi_ANYP_LOCK_ID_FLAG;
    ldr r1, [r3]
#ifdef SDK_ARM9
    clz r2, r1
#else //SDK_ARM7
    mov r2, #0
    mov r0, #0x80000000
_lp1:
    tst r1, r0
    bne _ex1
    add r2, r2, #1
    cmp r2, #32
    beq _ex1
    mov r0, r0, lsr #1
    b _lp1
_ex1:
#endif //SDK_ARM9
    cmp r2, #32
    movne r0, #OSi_ANYP_LOCK_ID_START
    bne @movne
    add r3, r3, #4
    ldr r1, [r3]
#ifdef SDK_ARM9
    clz r2, r1
#else //SDK_ARM7
    mov r2, #0
    mov r0, #0x80000000
_lp2:
    tst r1, r0
    bne _ex2
    add r2, r2, #1
    cmp r2, #32
    beq _ex2
    mov r0, r0, lsr #1
    b _lp2
_ex2:
#endif //SDK_ARM9
    cmp r2, #32
    ldr r0, =-3
    bxeq lr
    mov r0, #OSi_ANYP_LOCK_ID_START + 32
    @movne:
    add r0, r0, r2
    mov r1, #0x80000000
    mov r1, r1, lsr r2
    ldr r2, [r3]
    bic r2, r2, r1
    str r2, [r3]
    bx lr
}
// clang-format on

// clang-format off
asm void OS_ReleaseLockID(register u16 lockID) {
    ldr r3, =OSi_ANYP_LOCK_ID_FLAG
    cmp r0, #OSi_ANYP_LOCK_ID_START + 32
    addpl r3, r3, #4
    subpl r0, r0, #OSi_ANYP_LOCK_ID_START + 32
    submi r0, r0, #OSi_ANYP_LOCK_ID_START
    mov r1, #0x80000000
    mov r1, r1, lsr r0
    ldr r2, [r3]
    orr r2, r2, r1
    str r2, [r3]
    bx lr
}
// clang-format on
