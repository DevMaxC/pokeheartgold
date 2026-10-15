#include <nitro/types.h>
#include <nitro/code32.h>
extern u32 SDK_AUTOLOAD_DTCM_START[];
extern u32 SDK_IRQ_STACKSIZE[];
extern u32 SDK_AUTOLOAD_LIST[];
extern u32 SDK_AUTOLOAD_LIST_END[];
extern u32 SDK_AUTOLOAD_START[];
extern u32 SDK_STATIC_BSS_START[];
extern u32 SDK_STATIC_BSS_END[];
extern u32 OS_IRQTable[];
void OS_IrqHandler(void);
void NitroMain(void);
void _fp_init(void);
void __call_static_initializers(void);
void _start(void);
void INITi_CpuClear32(u32 data, void *dest, u32 size);
void MIi_UncompressBackward(void *bottom);
void do_autoload(void);
void _start_AutoloadDoneCallback(void *argv[]);
void init_cp15(void);
void NitroStartUp(void);
void OSi_ReferSymbol(void *symbol);
void *const _start_ModuleParams[] = {
    SDK_AUTOLOAD_LIST,
    SDK_AUTOLOAD_LIST_END,
    SDK_AUTOLOAD_START,
    SDK_STATIC_BSS_START,
    SDK_STATIC_BSS_END,
    (void *)0,
    (void *)0x04027533,
    (void *)0xDEC00621,
    (void *)0x2106C0DE,
};
asm void _start(void)
{
    mov r12, #0x4000000
    str r12, [r12, #0x208]
@wait_vcount:
    ldrh r0, [r12, #6]
    cmp r0, #0
    bne @wait_vcount
    bl init_cp15
    mov r0, #0x13
    msr cpsr_c, r0
    ldr r0, =SDK_AUTOLOAD_DTCM_START
    add r0, r0, #0x3fc0
    mov sp, r0
    mov r0, #0x12
    msr cpsr_c, r0
    ldr r0, =SDK_AUTOLOAD_DTCM_START
    add r0, r0, #0x3fc0
    sub r0, r0, #0x40
    sub sp, r0, #4
    tst sp, #4
    beq @irq_align
    b @irq_ok
@irq_align:
    sub sp, sp, #4
@irq_ok:
    ldr r1, =SDK_IRQ_STACKSIZE
    sub r1, r0, r1
    mov r0, #0x1f
    msr cpsr_fsxc, r0
    sub sp, r1, #4
    mov r0, #0
    ldr r1, =SDK_AUTOLOAD_DTCM_START
    mov r2, #0x4000
    bl INITi_CpuClear32
    mov r0, #0
    ldr r1, =0x05000000
    mov r2, #0x400
    bl INITi_CpuClear32
    mov r0, #0x200
    ldr r1, =0x07000000
    mov r2, #0x400
    bl INITi_CpuClear32
    ldr r1, =_start_ModuleParams
    ldr r0, [r1, #0x14]
    bl MIi_UncompressBackward
    bl do_autoload
    ldr r0, =_start_ModuleParams
    ldr r1, [r0, #0xc]
    ldr r2, [r0, #0x10]
    mov r3, r1
    mov r0, #0
@bss:
    cmp r1, r2
    blo @bss_store
    b @bss_next
@bss_store:
    str r0, [r1], #4
@bss_next:
    blo @bss
    bic r1, r3, #0x1f
@flush:
    mcr p15, 0, r0, c7, c10, 4
    mcr p15, 0, r1, c7, c5, 1
    mcr p15, 0, r1, c7, c14, 1
    add r1, r1, #0x20
    cmp r1, r2
    blt @flush
    ldr r1, =0x027FFF9C
    str r0, [r1]
    ldr r1, =SDK_AUTOLOAD_DTCM_START
    add r1, r1, #0x3fc0
    add r1, r1, #0x3c
    ldr r0, =OS_IrqHandler
    str r0, [r1]
    bl _fp_init
    bl NitroStartUp
    bl __call_static_initializers
    ldr r1, =NitroMain
    ldr lr, =0xFFFF0000
    tst sp, #4
    bne @sp_align
    b @jump
@sp_align:
    sub sp, sp, #4
@jump:
    bx r1
}
asm void INITi_CpuClear32(u32 data, void *dest, u32 size)
{
    add r12, r1, r2
@loop:
    cmp r1, r12
    blt @store
    b @next
@store:
    stmia r1!, {r0}
@next:
    blt @loop
    bx lr
}
asm void MIi_UncompressBackward(void *bottom)
{
    cmp r0, #0
    beq @exit
    stmfd sp!, {r4-r7}
    ldmdb r0, {r1, r2}
    add r2, r0, r2
    sub r3, r0, r1, lsr #24
    bic r1, r1, #0xff000000
    sub r1, r0, r1
    mov r4, r2
@loop:
    cmp r3, r1
    ble @end
    ldrb r5, [r3, #-1]!
    mov r6, #8
@flags:
    subs r6, r6, #1
    blt @loop
    tst r5, #0x80
    bne @ref
    ldrb r0, [r3, #-1]!
    strb r0, [r2, #-1]!
    b @next
@ref:
    ldrb r12, [r3, #-1]!
    ldrb r7, [r3, #-1]!
    orr r7, r7, r12, lsl #8
    bic r7, r7, #0xf000
    add r7, r7, #2
    add r12, r12, #0x20
@copy:
    ldrb r0, [r2, r7]
    strb r0, [r2, #-1]!
    subs r12, r12, #0x10
    bge @copy
@next:
    cmp r3, r1
    mov r5, r5, lsl #1
    bgt @flags
@end:
    mov r0, #0
    bic r3, r1, #0x1f
@flush:
    mcr p15, 0, r0, c7, c10, 4
    mcr p15, 0, r3, c7, c5, 1
    mcr p15, 0, r3, c7, c14, 1
    add r3, r3, #0x20
    cmp r3, r4
    blt @flush
    ldmfd sp!, {r4-r7}
@exit:
    bx lr
}
asm void do_autoload(void)
{
    ldr r0, =_start_ModuleParams
    ldr r1, [r0]
    ldr r2, [r0, #4]
    ldr r3, [r0, #8]
@segment:
    cmp r1, r2
    beq @done
    ldr r5, [r1], #4
    ldr r7, [r1], #4
    add r6, r5, r7
    mov r4, r5
@copy:
    cmp r4, r6
    bmi @copy_load
    b @copy_skip_load
@copy_load:
    ldr r7, [r3], #4
@copy_skip_load:
    bmi @copy_store
    b @copy_next
@copy_store:
    str r7, [r4], #4
@copy_next:
    bmi @copy
    ldr r7, [r1], #4
    add r6, r4, r7
    mov r7, #0
@clear:
    cmp r4, r6
    blo @clear_store
    b @clear_next
@clear_store:
    str r7, [r4], #4
@clear_next:
    blo @clear
    bic r4, r5, #0x1f
@flush:
    mcr p15, 0, r7, c7, c10, 4
    mcr p15, 0, r4, c7, c5, 1
    mcr p15, 0, r4, c7, c14, 1
    add r4, r4, #0x20
    cmp r4, r6
    blt @flush
    b @segment
@done:
    b _start_AutoloadDoneCallback
}
void _start_AutoloadDoneCallback(void *argv[])
{
}
asm void init_cp15(void)
{
    mrc p15, 0, r0, c1, c0, 0
    ldr r1, =0x000F9005
    bic r0, r0, r1
    mcr p15, 0, r0, c1, c0, 0
    mov r0, #0
    mcr p15, 0, r0, c7, c5, 0
    mcr p15, 0, r0, c7, c6, 0
    mcr p15, 0, r0, c7, c10, 4
    ldr r0, =0x04000033
    mcr p15, 0, r0, c6, c0, 0
    ldr r0, =0x0200002D
    mcr p15, 0, r0, c6, c1, 0
    ldr r0, =0x027E0021
    mcr p15, 0, r0, c6, c2, 0
    ldr r0, =0x08000035
    mcr p15, 0, r0, c6, c3, 0
    ldr r0, =OS_IRQTable
    orr r0, r0, #0x1a
    orr r0, r0, #1
    mcr p15, 0, r0, c6, c4, 0
    ldr r0, =0x0100002F
    mcr p15, 0, r0, c6, c5, 0
    ldr r0, =0xFFFF001D
    mcr p15, 0, r0, c6, c6, 0
    ldr r0, =0x027FF017
    mcr p15, 0, r0, c6, c7, 0
    mov r0, #0x20
    mcr p15, 0, r0, c9, c1, 1
    ldr r0, =OS_IRQTable
    orr r0, r0, #0xa
    mcr p15, 0, r0, c9, c1, 0
    mov r0, #0x42
    mcr p15, 0, r0, c2, c0, 1
    mov r0, #0x42
    mcr p15, 0, r0, c2, c0, 0
    mov r0, #2
    mcr p15, 0, r0, c3, c0, 0
    ldr r0, =0x05100011
    mcr p15, 0, r0, c5, c0, 3
    ldr r0, =0x15111011
    mcr p15, 0, r0, c5, c0, 2
    mrc p15, 0, r0, c1, c0, 0
    ldr r1, =0x0005707D
    orr r0, r0, r1
    mcr p15, 0, r0, c1, c0, 0
    bx lr
}
void NitroStartUp(void)
{
}
void OSi_ReferSymbol(void *symbol)
{
}
