typedef unsigned int u32;
typedef unsigned char u8;
typedef struct {
    u32 unk0;
    u32 unk4_0 : 7;
    u32 mode : 3;
    u32 unk4_10 : 22;
    u32 state : 3;
    u32 unk8_3 : 29;
    u8 unkC;
    u8 error;
    u8 padE[10];
    u32 filePos;
    u32 readPos;
    u32 pad20;
    u32 writePos;
    u8 pad28[12];
    u32 basePos;
} MSLFile;
extern int errno;
long _ftell(MSLFile *);
long _ftell(MSLFile *f) {
    u8 mode = f->mode;
    u32 state;
    if ((u8)(mode + 255) > 1 || f->error) {
        errno = 40;
        return -1;
    }
    state = f->state;
    if (state == 0) {
        return f->filePos;
    }
    long pos = f->basePos + (f->writePos - f->readPos);
    if (state >= 3) {
        pos -= state - 2;
    }
    return pos;
}
