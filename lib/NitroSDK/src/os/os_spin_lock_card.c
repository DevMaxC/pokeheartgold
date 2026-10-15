#pragma force_active on
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

void OSi_AllocateCardBus(void) {
#ifdef SDK_ARM9
    MIi_SetCardProcessor(MI_PROCESSOR_ARM9);
#endif
}

void OSi_FreeCardBus(void) {
#ifdef SDK_ARM9
    MIi_SetCardProcessor(MI_PROCESSOR_ARM7);
#endif
}

u16 OS_ReadOwnerOfLockWord(OSLockWord *lockp) {
    return lockp->ownerID;
}
