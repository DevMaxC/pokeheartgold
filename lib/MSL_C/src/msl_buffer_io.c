typedef unsigned int u32;
#pragma thumb off

typedef struct MslFlags {
    u32 lower : 12;
    u32 binary : 1;
    u32 upper : 19;
} MslFlags;

typedef struct MslBuffer {
    u32 fd;
    MslFlags flags;
    u32 pad08[4];
    u32 pos18;
    u32 ptr1c;
    u32 size20;
    u32 copy24;
    volatile u32 avail28;
    u32 mask2c;
    u32 pad30;
    u32 pos34;
    u32 pad38;
    int (*read3c)(u32, u32, volatile u32 *, u32);
    int (*write40)(u32, u32, volatile u32 *, u32);
    u32 pad44;
    u32 extra48;
} MslBuffer;

void __convert_from_newlines(u32, volatile u32 *);
void __convert_to_newlines(u32, volatile u32 *);
void __prep_buffer(MslBuffer *);
int __load_buffer(MslBuffer *, u32 *, int);
int __flush_buffer(MslBuffer *, u32 *);

void __convert_from_newlines(u32 x, volatile u32 *n) {
}

void __convert_to_newlines(u32 x, volatile u32 *n) {
}

void __prep_buffer(MslBuffer *f) {
    f->copy24 = f->ptr1c;
    u32 size = f->size20;
    f->avail28 = size;
    u32 pos = f->pos18;
    f->avail28 = size - (pos & f->mask2c);
    f->pos34 = f->pos18;
}

int __load_buffer(MslBuffer *f, u32 *out, int mode) {
    __prep_buffer(f);
    if (mode == 1) {
        f->avail28 = f->size20;
    }
    int status = f->read3c(f->fd, f->ptr1c, &f->avail28, f->extra48);
    if (status == 2) {
        f->avail28 = 0;
    }
    if (out != 0) {
        *out = f->avail28;
    }
    if (status != 0) {
        return status;
    }
    f->pos18 += f->avail28;
    if (!f->flags.binary) {
        __convert_to_newlines(f->ptr1c, &f->avail28);
    }
    return 0;
}

int __flush_buffer(MslBuffer *f, u32 *out) {
    u32 n = f->copy24 - f->ptr1c;
    if (n != 0) {
        f->avail28 = n;
        if (!f->flags.binary) {
            __convert_from_newlines(f->ptr1c, &f->avail28);
        }
        int status = f->write40(f->fd, f->ptr1c, &f->avail28, f->extra48);
        if (out != 0) {
            *out = f->avail28;
        }
        if (status != 0) {
            return status;
        }
        f->pos18 += f->avail28;
    }
    __prep_buffer(f);
    return 0;
}
