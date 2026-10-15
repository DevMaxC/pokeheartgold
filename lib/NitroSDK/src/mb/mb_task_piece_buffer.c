#pragma force_active on
#include "global.h"
// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>
#define U32(p, o) (*(u32 *)((u8 *)(p) + (o)))
#define U16(p, o) (*(u16 *)((u8 *)(p) + (o)))
#define U8(p, o)  (*(u8 *)((u8 *)(p) + (o)))
extern u8 *mbc;
extern u8 gMbBeaconState[];
extern u8 gMbGlobalState[];
extern int MBi_StartParentCore(int);
extern int MBi_CallReset(void);
extern void MBi_CommEnd(void);
extern int MBi_SendMP(void *, int, u16);
void MB_CommSetParentStateCallback(void *cb);
void MBi_CommChangeParentStateCallbackOnly(u32 a, u32 b, void *c);
u32 MBi_calc_nextsendblock(u32 a, u32 b);
int IsChildAidValid(u32 a);
int MBi_BlockHeaderEnd(int len, u16 aid, void *p);
u16 MBi_calc_cksum(const u16 *p, int size);
int mystrlen(const u16 *p);
void MBi_ClearSendStatus(void);
void MBi_InitSendVolatBeacon(void);
u32 MBi_GetBeaconPeriodDispersion(void);
void MBi_SetMaxScanTime(u16 x);
u32 MBi_GetGgid(void);
u16 MBi_GetTgid(void);
int MBi_IsStarted(void);
void MBi_InitCache(void *p);
void *MB_CommGetChildUser(u32 aid);
int MB_CommIsBootable(u32 aid);
void MBi_CommChangeParentState(u32 aid, u32 state, void *p);
void MBi_CommCallParentError(u32 aid, u32 err);
int MBi_CommParentSendMsg(u32 msg, u16 aid);
void MBi_InitSendFixedBeacon(void);
void MBi_EndCommon(void *arg);
void MBi_CheckWmErrcode(u16 api, u16 err);
void MB_InitSendGameInfoStatus(void);
int MB_StartParentFromIdle(int x);
int MBi_OnReset(void);
void MB_End(void);
u8 MBi_GetAttribute(void);
void MB_AddGameInfo(void *p);
int MBi_IsCommSizeValid(u32 p, u32 c, int n);
void MBi_AttachCacheBuffer(void *p, u32 a, u32 b, u32 c, u32 d);
u32 MB_GetSegmentLength(FSFile *file);
void MBi_ReadSegmentHeader(void *p, u32 start, u32 end, int clear);
int MBi_ReadIconInfo(const char *name, void *out, int icon);
int MBi_ReadFromCache(void *p, u32 off, void *out, u32 len);
void MB_UpdateGameInfoMember(void *p, void *src, u32 bits, u32 value);

typedef struct Task {
    struct Task *next;

    union {
        u32 flags;

        struct {
            u32 busy : 1, priority : 31;
        } bits;
    };

    void (*function)(void);
    void (*callback)(void);
} Task;

extern OSThread *volatile gMbTaskWork;

typedef struct {
    u8 type, pad;
    u16 a, b;
} Parent;

typedef struct {
    u8 type, pad;
    u16 value;
    u8 tail[1];
} Child;

typedef struct {
    u32 p;
    u8 *buffer;
    u32 piece;
    int count;
    u32 unk_10;
} Global;

extern Global ov13_0224CF84;

int MBi_IsTaskAvailable(void);
void MBi_InitTaskInfo(void *p);
int MBi_IsTaskBusy(Task *t);
void MBi_SetTask(Task *t, void (*fn)(void), void (*cb)(void), u32 priority);
void MBi_EndTaskThread(void *cb);
void MBi_SetChildMPMaxSize(int size);
void MBi_SetParentPieceBuffer(void *p);
void MBi_ClearParentPieceBuffer(u32 aid);
u8 *MBi_MakeParentSendBuffer(Parent *p, u8 *out);
u8 *MBi_SetRecvBufferFromChild(u8 *source, Child *dest, int child);
u8 *MBi_ReceiveRequestDataPiece(Child *p, int child);
int IsGetAllRequestData(int child);

int MBi_IsTaskAvailable(void) {
    return gMbTaskWork != NULL;
}

void MBi_InitTaskInfo(void *p) {
    MI_CpuFill8(p, 0, 0x20);
}

int MBi_IsTaskBusy(Task *t) {
    return t->bits.busy ? 1 : 0;
}

void MBi_SetTask(Task *t, void (*fn)(void), void (*cb)(void), u32 priority) {
    OSThread *thread = gMbTaskWork;
    Task *volatile *head = (Task *volatile *)((u8 *)thread + 0xc0);
    Task *cur;
    if (!MBi_IsTaskAvailable()) {
        return;
    }
    if (t->bits.busy) {
        return;
    }
    if (priority > 31) {
        u32 old = OS_GetThreadPriority(thread);
        if (priority == 32) {
            priority = old ? old - 1 : 0;
        } else if (priority == 33) {
            priority = old < 31 ? old + 1 : 31;
        } else if (priority == 34) {
            priority = old;
        } else {
            priority = 31;
        }
    }
    {
        OSIntrMode mode = OS_DisableInterrupts();
        t->flags = (t->flags & ~1) | 1;
        t->flags = (t->flags & 1) | (priority << 1);
        t->function = fn;
        t->callback = cb;
        if (!*head) {
            if (t == (Task *)((u8 *)thread + 0xc4)) {
                gMbTaskWork = 0;
            }
            *head = t;
            OS_WakeupThreadDirect(thread);
        } else {
            cur = *head;
            if (t == (Task *)((u8 *)thread + 0xc4)) {
                while (cur->next) {
                    cur = cur->next;
                }
                cur->next = t;
                gMbTaskWork = 0;
            } else {
                if (priority < (cur->flags >> 1)) {
                    *head = t;
                    t->next = cur;
                } else {
                    Task *next;
                    goto test;
advance:
                    cur = next;
test:
                    next = cur->next;
                    if (next && priority >= (next->flags >> 1)) {
                        goto advance;
                    }
                    t->next = next;
                    cur->next = t;
                }
            }
        }
        OS_RestoreInterrupts(mode);
    }
}

void MBi_EndTaskThread(void *cb) {
    OSIntrMode x = OS_DisableInterrupts();
    if (MBi_IsTaskAvailable()) {
        MBi_SetTask((Task *)((u8 *)gMbTaskWork + 0xc4), NULL, cb, 0);
    }
    OS_RestoreInterrupts(x);
}

void MBi_SetChildMPMaxSize(int size) {
    ov13_0224CF84.piece = size - 2;
    ov13_0224CF84.count = 30 / (size - 2);
    ov13_0224CF84.unk_10 = 30;
}

void MBi_SetParentPieceBuffer(void *p) {
    ov13_0224CF84.buffer = p;
    MI_CpuFill8(p, 0, 0x21c);
}

void MBi_ClearParentPieceBuffer(u32 aid) {
    u8 *p = ov13_0224CF84.buffer;
    u32 x;
    if (!p) {
        return;
    }
    x = aid - 1;
    MI_CpuFill8(p + (x << 5), 0, 0x1e);
    U32(ov13_0224CF84.buffer, 0x1e0 + (x << 2)) = 0;
}

u8 *MBi_MakeParentSendBuffer(Parent *p, u8 *out) {
    u8 *next = out;
    *next++ = p->type;
    switch (p->type) {
    case 1:
    case 2:
    case 3:
    case 5:
    case 6:
        break;
    case 4:
        next[0] = p->a;
        next[1] = (p->a & 0xff00) >> 8;
        next[2] = p->b;
        next[3] = (p->b & 0xff00) >> 8;
        next += 4;
        break;
    default:
        return 0;
    }
    return next;
}

u8 *MBi_SetRecvBufferFromChild(u8 *source, Child *dest, int child) {
    u8 *next;
    u8 type = source[0];
    dest->type = type;
    switch (type) {
    case 7:
        if (IsGetAllRequestData(child)) {
            return ov13_0224CF84.buffer + (child - 1) * 32;
        }
        {
            int piece = source[1];
            ((u8 *)dest)[2] = piece;
            if (piece > ov13_0224CF84.count) {
                return 0;
            }
            MI_CpuCopy8(source + 2, (u8 *)dest + 3, ov13_0224CF84.piece);
            next = MBi_ReceiveRequestDataPiece(dest, child);
            break;
        }
    case 8:
        dest->value = source[1];
        dest->value |= (source[2] << 8) & 0xff00;
        next = source + 3;
        break;
    case 9:
        dest->value = source[1];
        dest->value |= (source[2] << 8) & 0xff00;
        next = source + 3;
        MI_CpuCopy8(next, (u8 *)dest + 4, ov13_0224CF84.piece);
        next += ov13_0224CF84.piece;
        break;
    default:
        return 0;
    }
    return next;
}

u8 *MBi_ReceiveRequestDataPiece(Child *p, int child) {
    int slot, index;
    if (!ov13_0224CF84.buffer) {
        return 0;
    }
    index = ((u8 *)p)[2];
    if (index > ov13_0224CF84.count) {
        return 0;
    }
    slot = child - 1;
    MI_CpuCopy8((u8 *)p + 3, ov13_0224CF84.buffer + slot * 32 + index * ov13_0224CF84.piece, ov13_0224CF84.piece);
    {
        u32 *bits = (u32 *)(ov13_0224CF84.buffer + 0x1e0);
        bits[slot] |= 1u << index;
    }
    if (!IsGetAllRequestData(child)) {
        return 0;
    }
    return ov13_0224CF84.buffer + slot * 32;
}

int IsGetAllRequestData(int child) {
    u16 i = 0;
    if (ov13_0224CF84.count > 0) {
        u32 bits = *(u32 *)(ov13_0224CF84.buffer + 0x1e0 + (child - 1) * 4);
        do {
            if (!(bits & (1u << i))) {
                return 0;
            }
            i++;
        } while (i < ov13_0224CF84.count);
    }
    return 1;
}
