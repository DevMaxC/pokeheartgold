#include <nitro/types.h>

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

#pragma force_active on

// Console I/O over the debugger's character channel (sys_readc / sys_writec).

int sys_readc(void);
void sys_writec(const char *);

int __read_console(int handle, u8 *buf, u32 *length, void *data);
int __write_console(int handle, const char *buffer, u32 *count, void *ref);
int __close_console(u32 handle);

int __read_console(int handle, u8 *buf, u32 *length, void *data) {
    u32 i, size = *length;
    for (i = 0; i < size; i++) {
        if ((buf[i] = sys_readc()) == 13 || buf[i] == 10) {
            *length = i + 1;
            break;
        }
    }
    return 0;
}

int __write_console(int handle, const char *buffer, u32 *count, void *ref) {
    u32 i;
    u32 size = *count;
    for (i = 0; i < size; i++) {
        sys_writec(buffer + i);
    }
    return 0;
}

int __close_console(u32 handle) {
    return 0;
}
