#pragma force_active on
#include "global.h"
// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

typedef struct Segment {
    u32 start;
    char *source, *destination;
    u32 size;
} Segment;

typedef struct Info {
    u32 a, b, pad;
    char segments[48], tail[136];
} Info;

extern u32 MBi_defaultLoadSegList[];

typedef struct SegmentInfo {
    u32 destination, load, size, extra;
} SegmentInfo;

typedef struct Download {
    u32 fields[3];
    SegmentInfo segments[3];
} Download;

typedef struct BlockTable {
    u32 offsets[3];
    u16 boundaries[3], count;
} BlockTable;

typedef struct Block {
    u32 address, size, position;
    u8 segment;
} Block;

extern char *mbc;

typedef struct W36016Cache {
    u8 bytes[0x6c];
    u32 available;
} W36016Cache;

typedef struct W36016Data {
    u8 prefix[0x1e8];
    W36016Cache part1;
    u8 part2[];
} W36016Data;

extern u8 ov13_02247484;

typedef struct W36016Registration {
    u8 prefix[0x1f];
    u8 number;
    u8 gap20[0x24];
    W36016Data *data;
    u8 gap48[6];
    u16 active;
    u8 gap50[2];
    u8 used;
    u8 gap53;
    W36016Cache *cache;
    u8 *payload;
} W36016Registration;

typedef struct GameInfo {
    u8 prefix[0x4b3];
    u8 number, padding, index;
    u8 gap4b6[6];
    struct GameInfo *next;
} GameInfo;

typedef struct {
    u8 download[0xe4];
    GameInfo game;
    u8 blocks[20];
    void *file;
    W36016Data *data;
    u8 gap5c0[6];
    u16 active;
    u8 gap5c8[2], used, gap5cb;
    W36016Cache *cache;
    u8 *payload;
} Slot;

typedef struct {
    u8 prefix[0x1300];
    u8 gameUser[0x224];
    u8 count;
    u8 gap1525[0x263];
    Slot slots[16];
    u8 gap74c8[24];
    u8 taskThread[0x800];
    u8 taskInfo[0x20];
} Context;

typedef struct {
    u8 pad[0x28];
    u32 a9, n9;
    u8 gap[8];
    u8 *a7;
    u32 n7;
} Header;

typedef struct {
    u32 src, dst, size;
    u32 flags : 1;
    u32 rest : 31;
} LoadSegment;

#define U32(p, o) (*(u32 *)((u8 *)(p) + (o)))
#define U16(p, o) (*(u16 *)((u8 *)(p) + (o)))
#define U8(p, o)  (*(u8 *)((u8 *)(p) + (o)))
extern u8 gMbGlobalState[];
extern u8 ov13_0224CF84[];
extern u8 gMbTaskWork[];
extern int MBi_StartParentCore(int);
extern int MBi_CallReset(void);
extern void MBi_CommEnd(void);
extern void MBi_SetTask(void *, void *, void *, int);
extern void MBi_MakeParentSendBuffer(void *, void *);
extern int MBi_SendMP(void *, int, u16);
void MB_CommSetParentStateCallback(void *cb);
void MBi_CommChangeParentStateCallbackOnly(u32 a, u32 b, void *c);
u32 MBi_calc_nextsendblock(u32 a, u32 b);
int IsChildAidValid(u32 a);
void MBi_InitSendVolatBeacon(void);
u32 MBi_GetBeaconPeriodDispersion(void);
void MBi_SetMaxScanTime(u16 x);
u32 MBi_GetGgid(void);
u16 MBi_GetTgid(void);
void MBi_InitCache(void *p);
void MBi_InitTaskInfo(void *p);
int MBi_IsTaskBusy(void *p);
void MBi_SetParentPieceBuffer(void *p);
void MBi_ClearParentPieceBuffer(u32 aid);
void MBi_SetChildMPMaxSize(int size);
int IsGetAllRequestData(u32 aid);
void *MB_CommGetChildUser(u32 aid);
int MB_CommIsBootable(u32 aid);
void MBi_CommChangeParentState(u32 aid, u32 state, void *p);
void MBi_CommCallParentError(u32 aid, u32 err);
int MBi_CommParentSendMsg(u32 msg, u16 aid);
void MBi_EndCommon(void *arg);
void MBi_CheckWmErrcode(u16 api, u16 err);
int MB_StartParentFromIdle(int x);
int MBi_OnReset(void);
void MB_End(void);
u8 MBi_GetAttribute(void);
int MBi_IsCommSizeValid(u32 p, u32 c, int n);
void MBi_EndTaskThread(void *cb);
void MBi_AttachCacheBuffer(void *p, u32 a, u32 b, u32 c, u32 d);
u32 MB_GetSegmentLength(FSFile *file);
int MBi_ReadFromCache(void *p, u32 off, void *out, u32 len);

typedef struct {
    u32 x;
    const u16 *name, *description;
    void *icon1, *icon2;
    u32 game;
    u8 flag;
} Entry;

typedef struct Node {
    char pad[0x4b2];
    u8 flags, attribute, mode, param;
    u16 gap;
    u32 game;
    struct Node *next;
} Node;

typedef struct Beacon {
    char pad[0x14];
    u32 unk_14;
    Node *first, *node;
    char *cursor;
    u8 state, unk_25, parameter, chunk, count, serial;
    char pad2a[0x16];
    u32 game;
    u8 flags, attribute, paramcopy, serialcopy;
    u16 checksum;
    u8 chunkcopy, countcopy, length;
} Beacon;

extern Beacon gMbBeaconState;
extern u8 bsendBuff[];
extern int WM_SetGameInfo(void *, void *, u16, u32, u16, u8);
extern void MBi_SendFixedBeacon(u32, u16, u8);
extern void MBi_SendVolatBeacon(u32, u16, u8);

void MBi_ReadSegmentHeader(Segment *s, u32 first, u32 last, int clear);
static inline Slot *GetSlot(u32 n);
int MB_RegisterFile(register void *file, W36016Data *data);
void MBi_MakeDownloadFileInfo(Info *out, char *header);
void MBi_SetSegmentInfo(Header *h, u32 *type, LoadSegment *s, u32 *target);
int MBi_MakeBlockInfoTable(BlockTable *out, Download *info);
int MBi_get_blockinfo(Block *out, BlockTable *table, u16 block, Download *info);
int MBi_IsAbleToRecv(u32 segment, u32 address, u32 size);
int IsAbleToLoad(u32 segment, u32 address, u32 size);
int MBi_BlockHeaderEnd(int len, u16 aid, void *p);
u16 MBi_calc_cksum(const u16 *p, int size);
void MBi_MakeGameInfo(void *info, Entry *e, const void *extra);
int MBi_ReadIconInfo(const char *name, void *out, int icon);
void MB_UpdateGameInfoMember(void *p, void *src, u32 bits, u32 value);
int mystrlen(const u16 *p);
void MB_AddGameInfo(void *p);
void MB_InitSendGameInfoStatus(void);
void MBi_ClearSendStatus(void);
void MB_SendGameInfoBeacon(u32 ggid, u16 tgid, u8 attribute);
int MBi_ReadyBeaconSendStatus(void);
void MBi_InitSendFixedBeacon(void);

void MBi_ReadSegmentHeader(Segment *s, u32 first, u32 last, int clear) {
    u32 start = s->start, end;
    if (first < 0x4000) {
        first = 0x4000;
    }
    if (last > 0x8000) {
        last = 0x8000;
    }
    end = start + s->size;
    if (first < start) {
        first = start;
    }
    if (last > end) {
        last = end;
    }
    if (first >= last) {
        return;
    }
    if (clear) {
        MI_CpuFill8(s->destination + first, 0, last - first);
    } else {
        MI_CpuCopy8(s->source + first, s->destination + first, last - first);
    }
}

static inline Slot *GetSlot(u32 n) {
    return (Slot *)(mbc + 0x1788 + n * 0x5d4);
}

#define W(p, o) (*(u32 *)((u8 *)(p) + (o)))
#define H(p, o) (*(u16 *)((u8 *)(p) + (o)))
#define B(p, o) (*((u8 *)(p) + (o)))
int MBi_IsStarted(void);
int MBi_IsTaskAvailable(void);
void MBi_InitTaskThread(void *, u32);

int MB_RegisterFile(register void *file, W36016Data *data) {
    u8 free = 255;
    OSIntrMode flags;
    u8 i;
    u32 offset;
    W36016Cache *cache;
    void *info;
    flags = OS_DisableInterrupts();
    if (!MBi_IsStarted()) {
        OS_RestoreInterrupts(flags);
        return 0;
    }
    if (B(mbc, 0x1524) + 1 > 16) {
        OS_RestoreInterrupts(flags);
        return 0;
    }
    for (i = 0; i < 16; i++) {
        u8 *cursor = (u8 *)(Context *)mbc + i * 0x5d4;
        if (*(void **)(cursor + 0x1d40) == file) {
            OS_RestoreInterrupts(flags);
            return 0;
        }
        if (!cursor[0x1d52]) {
            free = i;
            break;
        }
    }
    if (i == 16) {
        OS_RestoreInterrupts(flags);
        return 0;
    }
    offset = free * 0x5d4;
    GetSlot(free)->file = file;
    info = GetSlot(free)->download;
    MBi_MakeDownloadFileInfo(info, (char *)data);
    MI_CpuCopy8((u8 *)file + 0x1c, (u8 *)info + 0xc4, 32);
    if (!MBi_MakeBlockInfoTable((BlockTable *)(mbc + 0x1d2c + offset), info)) {
        OS_RestoreInterrupts(flags);
        return 0;
    }
    MBi_MakeGameInfo((GameInfo *)(mbc + 0x186c + offset), file, mbc + 0x1300);
    GetSlot(free)->game.index = free;
    MB_AddGameInfo((GameInfo *)(mbc + 0x186c + offset));
    {
        s16 number;
        number = ov13_02247484;
        GetSlot(free)->game.number = number;
        GetSlot(free)->active = 1;
        {
            cache = &data->part1;
            GetSlot(free)->data = data;
            u8 *payload = data->part2;
            GetSlot(free)->cache = cache;
            number = number + 1;
            GetSlot(free)->payload = payload;
            ov13_02247484 = number;
        }
    }
    if (GetSlot(free)->cache->available && !MBi_IsTaskAvailable()) {
        MBi_InitTaskInfo(mbc + 0x7ce0);
        MBi_InitTaskThread(mbc + 0x74e0, 0x800);
    }
    GetSlot(free)->used = 1;
    B(mbc, 0x1524)
    ++;
    OS_RestoreInterrupts(flags);
    return 1;
}

void MBi_MakeDownloadFileInfo(Info *out, char *header) {
    u32 address = 0x22c0000;
    u32 *list = MBi_defaultLoadSegList;
    char *segment = out->segments;
    int i;
    out->a = *(u32 *)(header + 0x24);
    out->b = *(u32 *)(header + 0x34);
    for (i = 0; i < 3; i++) {
        MBi_SetSegmentInfo((Header *)header, list, (LoadSegment *)segment, &address);
        segment += 16;
        list++;
    }
    MI_CpuCopy8(header + 0x160, out->tail, 0x88);
}

void MBi_SetSegmentInfo(Header *h, u32 *type, LoadSegment *s, u32 *target) {
    switch (*type) {
    case 0:
        if (h->a9 >= 0x2000000 && h->a9 < 0x22c0000 && h->a9 + h->n9 <= 0x22c0000) {
            s->size = h->n9;
            s->dst = h->a9;
            s->src = s->dst;
            s->flags = 0;
        } else {
            OS_Terminate();
        }
        return;
    case 1: {
        int bad = 0, copy = 0;
        u32 size = h->n7;
        u8 *addr = h->a7;
        u32 end = (u32)(addr + size);
        if ((u32)addr >= 0x2000000 && (u32)addr < 0x23fe800) {
            if (end <= 0x2300000) {
            } else if (end < 0x23fe800 && size <= 0x40000) {
                copy = 1;
            } else {
                bad = 1;
            }
        } else if ((u32)addr >= 0x37f8000 && (u32)addr < 0x380f000) {
            if (end <= 0x380f000) {
                copy = 1;
            } else {
                bad = 1;
            }
        } else {
            bad = 1;
        }
        if (bad == 1) {
            OS_Terminate();
        }
        s->size = h->n7;
        s->dst = (u32)h->a7;
        if (copy == 0) {
            s->src = s->dst;
        } else {
            s->src = *target;
            *target += s->size;
        }
        s->flags = 1;
        return;
    }
    case 2: {
        s->size = 0x160;
        s->dst = HW_ROM_HEADER_BUF;
        s->src = HW_ROM_HEADER_BUF;
        s->flags = 0;
        return;
    }
    }
}

int MBi_MakeBlockInfoTable(BlockTable *out, Download *info) {
    u32 offset = 0;
    u8 i;
    u16 end;
    u16 *boundaries = out->boundaries;
    if (!info) {
        return 0;
    }
    for (i = 0; i < 3; i++) {
        out->offsets[i] = offset;
        offset += info->segments[i].size;
    }
    boundaries[0] = 0;
    for (i = 0; i < 3; i++) {
        SegmentInfo *s = &info->segments[i];
        u32 block = *(u32 *)(mbc + 0x1318);
        u32 size = s->size;
        u16 count = (u16)((size + block - 1) / block);
        end = boundaries[i] + count;
        if (!IsAbleToLoad(i, s->load, size)) {
            return 0;
        }
        if (i < 2) {
            boundaries[i + 1] = end;
        } else {
            out->count = end;
        }
    }
    return 1;
}

int MBi_get_blockinfo(Block *out, BlockTable *table, u16 block, Download *info) {
    s8 i;
    u32 offset;
    SegmentInfo *s;
    if (block >= table->count) {
        return 0;
    }
    i = 2;
    for (; i >= 0; i--) {
        if (block >= table->boundaries[i]) {
            break;
        }
    }
    if (i < 0) {
        return 0;
    }
    u32 first = table->boundaries[i];
    u32 unit = *(u32 *)(mbc + 0x1318);
    first = block - first;
    offset = first * unit;
    s = &info->segments[i];
    out->size = s->size - offset;
    if (out->size > *(u32 *)(mbc + 0x1318)) {
        out->size = *(u32 *)(mbc + 0x1318);
    }
    out->position = offset + table->offsets[i];
    out->address = offset + s->destination;
    out->segment = i;
    return 1;
}

int MBi_IsAbleToRecv(u32 segment, u32 address, u32 size) {
    switch (MBi_defaultLoadSegList[segment]) {
    case 2:
        if (address < HW_ROM_HEADER_BUF || address + size > 0x27fff60) {
            goto invalid;
        }
        return 1;
    case 0:
        if (address < 0x2000000 || address + size > 0x22c0000) {
            goto invalid;
        }
        return 1;
    case 1:
        if (address >= 0x22c0000 && address + size <= 0x2300000) {
            return 1;
        }
        if (address < 0x2000000 || address + size > 0x2300000) {
            goto invalid;
        }
        return 1;
    default:
        return 0;
    }
invalid:
    return 0;
}

int IsAbleToLoad(u32 segment, u32 address, u32 size) {
    u32 type = MBi_defaultLoadSegList[segment];
    if (type == 0) {
        goto receive;
    }
    if (type == 1) {
        goto load;
    }
    if (type != 2) {
        goto invalid;
    }
receive:
    return MBi_IsAbleToRecv(segment, address, size);
load:
    if (address >= 0x2000000 && address < 0x23fe800) {
        u32 end = address + size;
        if (address < 0x2300000 && end > 0x2300000) {
            return 0;
        }
        if (end <= 0x2300000) {
            return 1;
        }
        if (end < 0x23fe800 && size <= 0x40000) {
            return 1;
        }
        return 0;
    }
    if (address >= 0x37f8000 && address < 0x380f000) {
        return address + size <= 0x380f000;
    }
    goto badAddress;
invalid:
    return 0;
badAddress:
    return 0;
}

int MBi_BlockHeaderEnd(int len, u16 aid, void *p) {
    DC_FlushRange(p, (len + 31) & ~31);
    DC_WaitWriteBufferEmpty();
    return MBi_SendMP(p, len, aid);
}

u16 MBi_calc_cksum(const u16 *p, int size) {
    u32 sum = 0;
    int n = size >> 1;
    while (n > 0) {
        sum += *p++;
        --n;
    }
    {
        u32 lo = (u16)sum;
        sum = (sum >> 16) + lo;
    }
    sum += sum >> 16;
    return sum ^ 0xffff;
}

void MBi_MakeGameInfo(void *info, Entry *e, const void *extra) {
    int fail;
    u8 *p = info;
    MIi_CpuClear16(0, info, 0x4c0);
    p[0x4b2] = 0;
    fail = MBi_ReadIconInfo(e->icon1, info, 1) == 0;
    fail |= MBi_ReadIconInfo(e->icon2, info, 0) == 0;
    if (fail) {
        p[0x4b2] = 1;
        MIi_CpuClearFast(0, info, 0x220);
    }
    *(u32 *)(p + 0x4b8) = e->game;
    if (extra) {
        MIi_CpuCopy16(extra, (u16 *)(p + 0x220), 22);
    }
    p[0x236] = e->flag;
    MIi_CpuCopy16(e->name, (u16 *)(p + 0x238), (u16)(mystrlen(e->name) * 2));
    MIi_CpuCopy16(e->description, (u16 *)(p + 0x298), 192);
    p[0x358] = 1;
    *(u16 *)(p + 0x35a) = 1;
    *(u16 *)(p + 0x4b0) = 1;
}

int MBi_ReadIconInfo(const char *name, void *out, int icon) {
    FSFile file;
    u32 size = icon ? 0x200 : 0x20;
    if (icon) {
        out = (u8 *)out + 0x20;
    }
    if (!name) {
        return 0;
    }
    FS_InitFile(&file);
    if (!FS_OpenFile(&file, name)) {
        return 0;
    }
    if (size != U32(&file, 0x28) - U32(&file, 0x24)) {
        FS_CloseFile(&file);
        return 0;
    }
    FS_ReadFile(&file, out, size);
    FS_CloseFile(&file);
    return 1;
}

void MB_UpdateGameInfoMember(void *p, void *src, u32 bits, u32 value) {
    u8 count = 1;
    int i;
    MIi_CpuCopy16(src, (void *)((u8 *)p + 0x35e), 0x14a);
    for (i = 0; i < 15; i++) {
        if (bits & (2 << i)) {
            ++count;
        }
    }
    U8(p, 0x358) = count;
    U16(p, 0x35a) = bits | 1;
    U16(p, 0x35c) = value;
    ++U8(p, 0x4b4);
}

int mystrlen(const u16 *p) {
    int n = 0;
    while (*p++) {
        ++n;
    }
    return n;
}

void MB_AddGameInfo(void *p) {
    Node *q = gMbBeaconState.first;
    if (!q) {
        gMbBeaconState.first = p;
    } else {
        while (q->next) {
            q = q->next;
        }
        q->next = p;
    }
    ((Node *)p)->next = NULL;
}

void MB_InitSendGameInfoStatus(void) {
    gMbBeaconState.first = NULL;
    gMbBeaconState.node = NULL;
    gMbBeaconState.state = 1;
    gMbBeaconState.unk_14 = 0;
    MBi_ClearSendStatus();
}

void MBi_ClearSendStatus(void) {
    gMbBeaconState.unk_25 = 0;
    gMbBeaconState.parameter = 0;
    gMbBeaconState.chunk = 0;
    gMbBeaconState.count = 0;
    gMbBeaconState.serial = 0;
}

void MB_SendGameInfoBeacon(u32 ggid, u16 tgid, u8 attribute) {
    for (;;) {
        switch (gMbBeaconState.state) {
        case 0:
        case 1:
            if (!MBi_ReadyBeaconSendStatus()) {
                return;
            }
            break;
        case 2:
            MBi_InitSendFixedBeacon();
            break;
        case 3:
            MBi_SendFixedBeacon(ggid, tgid, attribute);
            return;
        case 4:
            MBi_InitSendVolatBeacon();
            break;
        case 5:
            MBi_SendVolatBeacon(ggid, tgid, attribute);
            return;
        case 6:
            break;
        }
    }
}

int MBi_ReadyBeaconSendStatus(void) {
    if (!gMbBeaconState.first) {
        u32 ggid = MBi_GetGgid();
        u16 tgid = MBi_GetTgid();
        WM_SetGameInfo(0, bsendBuff, 112, ggid, tgid, 8);
        return 0;
    }
    {
        Node *next;
        if (gMbBeaconState.node && gMbBeaconState.node->next) {
            next = gMbBeaconState.node->next;
        } else {
            next = *(Node *volatile *)&gMbBeaconState.first;
        }
        gMbBeaconState.node = next;
    }
    MBi_ClearSendStatus();
    gMbBeaconState.parameter = gMbBeaconState.node->mode;
    gMbBeaconState.state = 2;
    return 1;
}

void MBi_InitSendFixedBeacon(void) {
    Node *p;
    if (gMbBeaconState.state != 2) {
        return;
    }
    p = gMbBeaconState.node;
    if (!p->flags) {
        gMbBeaconState.count = 9;
        gMbBeaconState.cursor = (char *)p;
    } else {
        gMbBeaconState.count = 4;
        gMbBeaconState.cursor = (char *)p + 0x220;
    }
    gMbBeaconState.state = 3;
}
