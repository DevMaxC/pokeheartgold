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
void MBi_CheckWmErrcode(u16 api, u16 err);
void MB_InitSendGameInfoStatus(void);
int MB_StartParentFromIdle(int x);
int MBi_OnReset(void);
void MB_End(void);
u8 MBi_GetAttribute(void);
void MB_AddGameInfo(void *p);
int MBi_IsCommSizeValid(u32 p, u32 c, int n);
void MBi_EndTaskThread(void *cb);
u32 MB_GetSegmentLength(FSFile *file);
void MBi_ReadSegmentHeader(void *p, u32 start, u32 end, int clear);
int MBi_ReadIconInfo(const char *name, void *out, int icon);
int MBi_ReadFromCache(void *p, u32 off, void *out, u32 len);
void MB_UpdateGameInfoMember(void *p, void *src, u32 bits, u32 value);

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

void MBi_InitCache(void *p);
void MBi_AttachCacheBuffer(Cache *c, u32 offset, u32 size, void *data, u32 state);

void MBi_InitCache(void *p) {
    MI_CpuFill8(p, 0, 0x70);
}

void MBi_AttachCacheBuffer(Cache *c, u32 offset, u32 size, void *data, u32 state) {
    Entry *end;
    OSIntrMode interrupts;
    Entry *e;
    interrupts = OS_DisableInterrupts();
    e = c->entries;
    end = c->entries + 4;
    for (;;) {
        if (e >= end) {
            OS_Terminate();
        }
        if (e->state == 0) {
            e->offset = offset;
            e->size = size;
            e->data = data;
            e->state = state;
            break;
        }
        e++;
    }
    OS_RestoreInterrupts(interrupts);
}
