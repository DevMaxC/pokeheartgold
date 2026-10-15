#include <nitro.h>

asm void OSi_WaitVCount0(void) {
    mov r12, #HW_REG_BASE
    ldr r1, [r12, #REG_IME_OFFSET]
    str r12, [r12, #REG_IME_OFFSET]
@spinWait:
    ldrh r0, [r12, #REG_VCOUNT_OFFSET]
    cmp r0, #0
    bne @spinWait
    str r1, [r12, #REG_IME_OFFSET]
    bx lr
}
