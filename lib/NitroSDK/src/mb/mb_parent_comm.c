#pragma force_active on
#include "global.h"
// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>
#include <nitro/mb/mb_comm.h>
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
int MBi_IsTaskAvailable(void);
void MBi_InitTaskInfo(void *p);
int MBi_IsTaskBusy(void *p);
void MBi_SetParentPieceBuffer(void *p);
void MBi_ClearParentPieceBuffer(u32 aid);
void MBi_SetChildMPMaxSize(int size);
int IsGetAllRequestData(u32 aid);
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
void MBi_AttachCacheBuffer(void *p, u32 a, u32 b, u32 c, u32 d);
u32 MB_GetSegmentLength(FSFile *file);
void MBi_ReadSegmentHeader(void *p, u32 start, u32 end, int clear);
int MBi_ReadIconInfo(const char *name, void *out, int icon);
int MBi_ReadFromCache(void *p, u32 off, void *out, u32 len);
void MB_UpdateGameInfoMember(void *p, void *src, u32 bits, u32 value);
#define W(p, o) (*(u32 *)((u8 *)(p) + (o)))
#define H(p, o) (*(u16 *)((u8 *)(p) + (o)))
#define B(p, o) (*((u8 *)(p) + (o)))
#define P(p, o) (*(u8 **)((u8 *)(p) + (o)))

typedef struct {
    u8 pad[0x1340];
    u8 childData[15][22];
    u16 memberSlots[15];
    u8 pieceData[15][4];
    u32 callback;
    u32 states[15];
    u8 reserved[2];
    s8 entry[15];
    u8 count;
    u16 mask;
    u8 padding[0x1754 - 0x1538];
    u16 pieces[15];
} Parent;

typedef struct {
    u8 pad[0x1d4c];
    u16 status, member, pending;
    u8 active;
} Group;

extern void MBi_CommParentRecvData(void *);
extern void MBi_CommParentSendData(void);
extern void MB_SendGameInfoBeacon(int, int, int);

void MB_CommSetParentStateCallback(void *cb);
void *MB_CommGetChildUser(u32 aid);
int MB_CommIsBootable(u32 aid);
int MB_CommResponseRequest(u16 aid, u32 request);
void MBi_CommChangeParentState(u32 aid, u32 state, void *p);
void MBi_CommChangeParentStateCallbackOnly(u32 a, u32 b, void *c);
static inline int groupOffset(u8 entry, int stride);
void MBi_CommParentCallback(int reason, void *data);

void MB_CommSetParentStateCallback(void *cb) {
    OSIntrMode x = OS_DisableInterrupts();
    U32(mbc, 0x14e4) = (u32)cb;
    OS_RestoreInterrupts(x);
}

void *MB_CommGetChildUser(u32 aid) {
    OSIntrMode x = OS_DisableInterrupts();
    if (mbc && IsChildAidValid(aid)) {
        MI_CpuCopy8(mbc + 0x1340 + (aid - 1) * 22, mbc + 0x1772, 22);
        OS_RestoreInterrupts(x);
        return mbc + 0x1772;
    }
    OS_RestoreInterrupts(x);
    return 0;
}

int MB_CommIsBootable(u32 aid) {
    if (mbc && IsChildAidValid(aid)) {
        if (U32(mbc, 0x14e8 + ((aid - 1) << 2)) == MB_COMM_PSTATE_SEND_COMPLETE) {
            return 1;
        }
    }
    return 0;
}

int MB_CommResponseRequest(u16 aid, u32 request) {
    int response, state;
    OSIntrMode mode = OS_DisableInterrupts();
    switch (request) {
    case MB_COMM_RESPONSE_REQUEST_KICK:
        state = MB_COMM_PSTATE_REQUESTED;
        response = 4;
        break;
    case MB_COMM_RESPONSE_REQUEST_ACCEPT:
        state = MB_COMM_PSTATE_REQUESTED;
        response = 3;
        break;
    case MB_COMM_RESPONSE_REQUEST_DOWNLOAD:
        state = MB_COMM_PSTATE_WAIT_TO_SEND;
        response = 2;
        break;
    case MB_COMM_RESPONSE_REQUEST_BOOT:
        state = MB_COMM_PSTATE_SEND_COMPLETE;
        response = 5;
        break;
    default:
        OS_RestoreInterrupts(mode);
        return 0;
    }
    if (mbc && IsChildAidValid(aid)) {
        u32 index = aid - 1;
        u8 *base = mbc;
        if (state == *(u32 *)(base + index * 4 + 0x14e8)) {
            *(u16 *)(base + index * 2 + 0x1754) = response;
            OS_RestoreInterrupts(mode);
            return 1;
        }
    }
    OS_RestoreInterrupts(mode);
    return 0;
}

void MBi_CommChangeParentState(u32 aid, u32 state, void *p) {
    if (IsChildAidValid(aid)) {
        U32(mbc, 0x14e8 + ((aid - 1) << 2)) = state;
    }
    MBi_CommChangeParentStateCallbackOnly(aid, state, p);
}

void MBi_CommChangeParentStateCallbackOnly(u32 a, u32 b, void *c) {
    void (*cb)(u32, u32, void *) = (void *)U32(mbc, 0x14e4);
    if (cb) {
        cb(a, b, c);
    }
}

static inline int groupOffset(u8 entry, int stride) {
    return stride * entry;
}

void MBi_CommParentCallback(int reason, void *data) {
    u16 child;
    switch (reason) {
    case 17:
        break;
    case 21:
        MBi_CommChangeParentState(0, MB_COMM_PSTATE_INIT_COMPLETE, data);
        break;
    case 0:
        child = H(data, 16);
        if (child && child < 16) {
            MBi_CommChangeParentState(child, MB_COMM_PSTATE_CONNECTED, data);
        }
        break;
    case 1:
        child = H(data, 16);
        if (child && child < 16) {
            u16 id;
            int entry;
            ((Parent *)mbc)->memberSlots[child - 1] = 0;
            MI_CpuFill8(((Parent *)mbc)->pieceData[H(data, 16) - 1], 0, 4);
            MI_CpuFill8(((Parent *)mbc)->childData[H(data, 16) - 1], 0, 22);
            MBi_ClearParentPieceBuffer(H(data, 16));
            ((Parent *)mbc)->pieces[H(data, 16) - 1] = 0;
            child = H(data, 16);
            entry = ((Parent *)mbc)->entry[child - 1];
            if (entry != -1) {
                entry = groupOffset((u8)entry, 0x5d4);
                ((Group *)(mbc + entry))->member &= ~(1 << child);
                ((Group *)(mbc + entry))->pending |= 1 << child;
                ((Parent *)mbc)->entry[child - 1] = -1;
                ((Group *)(mbc + entry))->status &= ~(1 << child);
            }
            id = H(data, 16);
            if (((Parent *)mbc)->mask & (1 << id)) {
                ((Parent *)mbc)->count--;
                ((Parent *)mbc)->mask &= ~(1 << H(data, 16));
            }
            child = H(data, 16);
            if (((Parent *)mbc)->states[child - 1] == MB_COMM_PSTATE_BOOT_REQUEST) {
                MBi_CommChangeParentState(child, MB_COMM_PSTATE_BOOT_STARTABLE, 0);
            }
            MBi_CommChangeParentState(H(data, 16), MB_COMM_PSTATE_DISCONNECTED, data);
            ((Parent *)mbc)->states[H(data, 16) - 1] = MB_COMM_PSTATE_NONE;
        }
        break;
    case 3:
        MBi_CommParentRecvData(data);
        break;
    case 25:
        MBi_CommParentSendData();
        break;
    case 28: {
        u8 i;
        int g, t, a;
        for (i = 0; i < 16; i++) {
            int offset = i * 0x5d4;
            if (((Group *)(mbc + offset))->active && ((Group *)(mbc + offset))->pending) {
                MB_UpdateGameInfoMember(mbc + 0x186c + offset, mbc + 0x1340, ((Group *)(mbc + offset))->member, ((Group *)(mbc + offset))->pending);
                ((Group *)(mbc + offset))->pending = 0;
            }
        }
        g = MBi_GetGgid();
        t = MBi_GetTgid();
        a = MBi_GetAttribute();
        MB_SendGameInfoBeacon(g, t, a);
        break;
    }
    case 255:
        switch (H(data, 2)) {
        case 1:
        case 4:
        case 5:
        case 6:
        case 8:
        case 9:
            MBi_CommCallParentError(0, 9);
            break;
        case 15:
        default:
            MBi_CommCallParentError(0, 8);
            break;
        }
        break;
    case 256:
        switch (H(data, 0)) {
        case 0:
        case 7:
        case 8:
        case 13:
        case 14:
        case 15:
        case 17:
        case 18:
        case 21:
        case 25:
        case 29:
            MBi_CommCallParentError(0, 9);
            break;
        case 28:
        default:
            MBi_CommCallParentError(0, 8);
            break;
        }
        break;
    }
    if (reason == 17) {
        void (*callback)(int, int, void *) = (void *)((Parent *)mbc)->callback;
        MIi_CpuClearFast(0, (u32 *)mbc, 0x7d00);
        mbc = 0;
        if (callback) {
            callback(0, MB_COMM_PSTATE_END, 0);
        }
    }
}
