#include <nitro.h>

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

/* Native assembly-owned 44-byte static work group; no C storage. */
typedef struct {
    void *debugger;
    void *userArg;
    OSExceptionHandler userHandler;
    u32 hookStack[8];
} ExceptionWork;

typedef char ExceptionWorkSize[(sizeof(ExceptionWork) == 44) ? 1 : -1];
extern ExceptionWork to91_OSi_ExceptionWork;
void OSi_ExceptionHandler(void);

void OS_InitException(void) {
    if (0x02600000 <= *(u32 *)HW_EXCP_VECTOR_MAIN && *(u32 *)HW_EXCP_VECTOR_MAIN < 0x02800000) {
        to91_OSi_ExceptionWork.debugger = *(void **)HW_EXCP_VECTOR_MAIN;
    } else {
        to91_OSi_ExceptionWork.debugger = NULL;
    }
    if (!to91_OSi_ExceptionWork.debugger) {
        *(u32 *)HW_EXCP_VECTOR_MAIN = (u32)OSi_ExceptionHandler;
        *(u32 *)HW_EXCP_VECTOR_BUF = (u32)OSi_ExceptionHandler;
    }
    to91_OSi_ExceptionWork.userHandler = NULL;
}
