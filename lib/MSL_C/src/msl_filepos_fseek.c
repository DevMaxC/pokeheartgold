typedef unsigned int u32;
typedef unsigned char u8;
extern u8 __files[];
extern u8 __cs[];
extern u32 __cs_id[];
extern u32 __cs_ref[];
extern u8 OSi_ThreadInfo[];
extern int OS_TryLockMutex(void *);
extern void OS_LockMutex(void *);
extern void OS_UnlockMutex(void *);
extern long _fseek(void *, long, int);
long fseek(void *, long, int);
long fseek(void *stream, long position, int whence) {
    int index;
    int offset;
    u8 *mutex;
    long result;
    if (stream == __files) {
        index = 2;
    } else if (stream == __files + 0x4C) {
        index = 3;
    } else if (stream == __files + 0x98) {
        index = 4;
    } else {
        index = 5;
    }
    offset = index * 0x18;
    mutex = __cs + offset;
    if (!OS_TryLockMutex(mutex)) {
        __cs_id[index] = *(u32 *)(*(u8 **)(OSi_ThreadInfo + 4) + 0x6C);
        __cs_ref[index] = 1;
    } else {
        u32 owner = __cs_id[index];
        u32 active = *(u32 *)(*(u8 **)(OSi_ThreadInfo + 4) + 0x6C);
        if (owner == active) {
            __cs_ref[index]++;
        } else {
            OS_LockMutex(mutex);
            __cs_id[index] = *(u32 *)(*(u8 **)(OSi_ThreadInfo + 4) + 0x6C);
            __cs_ref[index] = 1;
        }
    }
    result = _fseek(stream, position, whence);
    if (--__cs_ref[index] == 0) {
        OS_UnlockMutex(mutex);
    }
    return result;
}
