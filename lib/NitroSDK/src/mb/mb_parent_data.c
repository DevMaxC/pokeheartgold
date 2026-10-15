#pragma force_active on
#include "global.h"
// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>
extern u8 *mbc;
extern u32 gMbParentChildRecvMask;
extern u16 *WM_ReadMPData(void *, u16);
extern void MBi_CommParentRecvDataPerChild(void *, u16);
extern void *MBi_MakeParentSendBuffer(void *, void *);
extern int MBi_BlockHeaderEnd(int, u16, void *);
void MBi_calc_sendblock(int);

typedef struct Cache {
    u32 position, size;
    void *destination;
    int state;
} Cache;

typedef struct Owner {
    char pad[16];
    char name[4];
    u32 length;
    FSArchive *archive;
} Owner;

typedef struct Request {
    char pad[16];
    Cache *cache;
    Owner *owner;
} Request;

extern int MBi_CommParentSendBlock(void);
int MBi_CommParentSendData(void);

typedef struct {
    u8 pad[0x14e4];
    int state[16];
    u8 active;
    s8 index[16];
} Mbc;

extern u8 _02245980;

typedef struct {
    u8 kind, pad;
    u16 file, block;
} Header;

void MBi_CommParentRecvData(void *data);
int MBi_CommParentSendMsg(u8 message, u16 mask);
int MBi_CommParentSendDLFileInfo(void);
void MBi_ReloadCache(Request *request);

void MBi_CommParentRecvData(void *data) {
    u16 i;
    for (i = 0; i < 16; i++) {
        u8 *entry = mbc + i * 0x5d4;
        if (entry[0x1d52]) {
            *(u16 *)(entry + 0x1d4a) = 0;
        }
    }
    gMbParentChildRecvMask = 0;
    for (i = 1; i <= 15; i++) {
        u16 *p = WM_ReadMPData(data, i);
        if (p && *p != 65535 && *p != 0) {
            MBi_CommParentRecvDataPerChild(p, i);
        }
    }
}

int MBi_CommParentSendMsg(u8 message, u16 mask) {
    u8 buffer[8];
    buffer[0] = message;
    MBi_MakeParentSendBuffer(buffer, mbc);
    return MBi_BlockHeaderEnd(6, mask, mbc);
}

int MBi_CommParentSendDLFileInfo(void) {
    Header header;
    u8 counts[16];
    int selected = -1;
    u16 mask = 0;
    u16 child;
    u8 attempt, index;
    void *dest;
    MI_CpuFill8(counts, 0, 16);
    for (child = 1; child <= 15; child++) {
        if (((Mbc *)mbc)->state[child] == 5) {
            counts[((Mbc *)mbc)->index[child]]++;
        }
    }
    index = _02245980;
    for (attempt = 0; attempt < 16; attempt++) {
        index = (int)(index + 1) % 16;
        if (((u8 *)mbc)[index * 0x5d4 + 0x1d52] && counts[index]) {
            selected = (s8)index;
            break;
        }
    }
    if (selected == -1) {
        return 21;
    }
    _02245980 = selected;
    for (child = 1; child <= 15; child++) {
        if (((Mbc *)mbc)->state[child] == 5 && selected == ((Mbc *)mbc)->index[child]) {
            mask |= 1 << child;
        }
    }
    header.kind = 3;
    header.file = selected;
    dest = MBi_MakeParentSendBuffer(&header, mbc);
    if (dest) {
        MI_CpuCopy8((u8 *)mbc + 0x1788 + selected * 0x5d4, dest, 0xe4);
    }
    return MBi_BlockHeaderEnd(0xea, mask, mbc);
}

void MBi_ReloadCache(Request *request) {
    Owner *owner = request->owner;
    Cache *c = request->cache;
    FSArchive *archive = FS_FindArchive(owner->name, owner->length);
    FSFile file;
    if (!archive) {
        archive = owner->archive;
    }
    FS_InitFile(&file);
    if (FS_OpenFileDirect(&file, archive, c->position, c->position + c->size, (u32)-1)) {
        if (FS_ReadFile(&file, c->destination, c->size) == c->size) {
            c->state = 2;
        }
        FS_CloseFile(&file);
    }
    if (c->state == 2) {
        return;
    }
    c->position = 0;
    c->state = 2;
}
