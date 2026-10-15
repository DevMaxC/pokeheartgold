#pragma force_active on
#include <nitro/types.h>
struct ThrowContext;
struct ExceptionInfo;
void __TransferControl(ThrowContext *context, ExceptionInfo *info, char *address);

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

// clang-format off
asm void __TransferControl(ThrowContext *context, ExceptionInfo *info, char *address)
{
    ldr r4, [r0, #0x2c]
    ldr r5, [r0, #0x30]
    ldr r6, [r0, #0x34]
    ldr r7, [r0, #0x38]
    ldr r8, [r0, #0x3c]
    ldr r9, [r0, #0x40]
    ldr r10, [r0, #0x44]
    ldr r11, [r0, #0x48]
    ldr sp, [r0, #0x5c]
    ldr r12, [r0, #0x64]
    sub sp, sp, r12
    bx r2
}
// clang-format on

#include <nitro/codereset.h>
