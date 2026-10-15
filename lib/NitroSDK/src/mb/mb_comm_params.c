#pragma force_active on
#include "global.h"
// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>
#define U32(p, o) (*(u32 *)((u8 *)(p) + (o)))
#define U16(p, o) (*(u16 *)((u8 *)(p) + (o)))
#define U8(p, o)  (*(u8 *)((u8 *)(p) + (o)))
extern u8 *mbc;
extern u8 gMbBeaconState[];
extern u8 ov13_0224CF84[];
extern int MBi_StartParentCore(int);
extern int MBi_CallReset(void);
extern void MBi_CommEnd(void);
extern void MBi_SetTask(void *, void *, void *, int);
extern void MBi_MakeParentSendBuffer(void *, void *);
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
int MBi_IsTaskAvailable(void);
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
void MBi_InitSendFixedBeacon(void);
void MBi_EndCommon(void *arg);
void MB_InitSendGameInfoStatus(void);
int MB_StartParentFromIdle(int x);
int MBi_OnReset(void);
void MB_End(void);
void MB_AddGameInfo(void *p);
int MBi_IsCommSizeValid(u32 p, u32 c, int n);
void MBi_EndTaskThread(void *cb);
u32 MB_GetSegmentLength(FSFile *file);
void MBi_ReadSegmentHeader(void *p, u32 start, u32 end, int clear);
int MBi_ReadIconInfo(const char *name, void *out, int icon);
int MBi_ReadFromCache(void *p, u32 off, void *out, u32 len);
void MB_UpdateGameInfoMember(void *p, void *src, u32 bits, u32 value);

typedef struct Parent {
    char pad[0x508];
    void *callback;
    u8 flag;
    char gap[0x17];
    u16 mode, error, ready, pad52a, delay;
} Parent;

extern struct {
    char pad[8];
    Parent *parent;
} gMbGlobalState;

extern void MBi_ChildCallback(void);
extern int WM_SetMPDataToPortEx(void *, int, void *, u16, u16, int, int);

typedef struct {
    u32 offset, size;
    void *data;
    u32 state;
} Entry;

typedef struct {
    u32 busy;
    u8 p[0x30 - 4];
    Entry entries[4];
} Cache;

typedef struct Task {
    struct Task *next;
    u32 flags;
    void (*run)(struct Task *), (*done)(struct Task *);
    u8 p[16];
} Task;

typedef struct {
    OSThread thread;
    Task *volatile queue;
    Task stop;
} Work;

void MBi_TaskThread(void *);
void MBi_InitTaskThread(Work *, u32);

void MBi_SetMaxScanTime(u16 x);
int MBi_SetMPData(void *callback, void *data, u16 size, u16 unused, u16 mask);
int MBi_SendMP(void *data, u32 size, u32 mask);
u32 MBi_GetGgid(void);
u16 MBi_GetTgid(void);
u8 MBi_GetAttribute(void);
int MBi_IsStarted(void);
void MBi_CheckWmErrcode(u16 api, u16 err);
void MBi_InitCache(void *p);
void MBi_AttachCacheBuffer(Cache *c, u32 offset, u32 size, void *data, u32 state);

void MBi_SetMaxScanTime(u16 x) {
    U16(&gMbGlobalState, 0x26) = x;
}

int MBi_SetMPData(void *callback, void *data, u16 size, u16 unused, u16 mask) {
    int result = WM_SetMPDataToPortEx(callback, 0, data, size, mask, 1, 3);
    ((void (*)(int, int))MBi_CheckWmErrcode)(15, result);
    return result;
}

int MBi_SendMP(void *data, u32 size, u32 mask) {
    Parent *p = gMbGlobalState.parent;
    u16 length = size, bitmap = mask;
    int result;
    if (!p->ready || p->error == 1) {
        return 1;
    }
    switch (p->mode) {
    case 1:
        result = MBi_SetMPData(p->callback, data, length, (u16)(p->delay == 0 ? 1000 : 0), bitmap);
        if (result == 2) {
            gMbGlobalState.parent->flag = 1;
        }
        if (result == 2) {
            result = 0;
        }
        return result;
    case 2:
        result = MBi_SetMPData(MBi_ChildCallback, data, length, 0, bitmap);
        if (result == 2) {
            gMbGlobalState.parent->flag = 1;
        }
        if (result == 2) {
            result = 0;
        }
        return result;
    default:
        return 1;
    }
}

u32 MBi_GetGgid(void) {
    return U32((void *)gMbGlobalState.parent, 8);
}

u16 MBi_GetTgid(void) {
    return U16((void *)gMbGlobalState.parent, 12);
}

u8 MBi_GetAttribute(void) {
    u8 *p = (void *)gMbGlobalState.parent;
    int a = U16(p, 0x12) ? 2 : 0;
    int b = U16(p, 0xe) ? 1 : 0;
    int c = U16(p, 0x14) ? 4 : 0;
    int d = U16(p, 0x16) ? 8 : 0;
    return d | (c | (b | a));
}

int MBi_IsStarted(void) {
    return U8((void *)gMbGlobalState.parent, 0x50d) == 1;
}
