#pragma force_active on
#include "global.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

// Multiboot WM callbacks: scan channel rotation, the send-enabled check, the parent's WM callback
// (MBi_ParentCallback), the child's port and WM callbacks (MBi_ChildPortCallback /
// MBi_ChildCallback), MBi_EndCommon and the beacon period dispersion derived from the MAC address.

// gMbGlobalState: the MB global state. The common work at 0x08 is the parent's communication control
// (MbParentControl) on a parent and the child work (MbChild) on a child.
typedef struct MbParentControl {
    u8 unk_000[0x504];
    void *receive; // 0x504
    u8 unk_508[4];
    u8 sending; // 0x50C
    u8 unk_50D[11];
    u16 sendSize;                  // 0x518
    u16 receiveSize;               // 0x51A
    void (*callback)(int, void *); // 0x51C
    u8 unk_520[6];
    u16 ending;          // 0x526
    u16 active;          // 0x528
    u16 children;        // 0x52A
    volatile u16 option; // 0x52C
} MbParentControl;

typedef struct MbParentWork {
    u8 unk_0000[0x131C];
    u32 starting;  // 0x131C
    u32 alternate; // 0x1320
    u8 unk_1324[0x14E8 - 0x1324];
    u32 children[15]; // 0x14E8
    u8 unk_1524[0x74C8 - 0x1524];
    u32 delay; // 0x74C8
} MbParentWork;

typedef struct MbUserInfo {
    u32 words[32];
} MbUserInfo;

typedef struct MbEventHeader {
    u16 event, err, reason;
} MbEventHeader;

typedef struct MbScanEvent {
    u16 event, err, reason;
    u8 unk_06[2];
    u16 state; // 0x08
    u8 mac[6]; // 0x0A
    u8 unk_10[0x26];
    u16 extra;       // 0x36
    MbUserInfo user; // 0x38
} MbScanEvent;

typedef struct MbConnectEvent {
    u16 event, err, reason;
    u8 unk_06[2];
    u16 state; // 0x08
    u16 aid;   // 0x0A
} MbConnectEvent;

typedef struct MbScanRecord {
    u8 scanImage[0xC0];
    MbScanEvent scan; // 0xC0
    u8 unk_178[8];
} MbScanRecord;

typedef struct MbChild {
    u8 unk_000[0x40];
    u8 sendBuffer[0x400]; // 0x040
    u8 scanImage[0xC0];   // 0x440
    u32 unk_500;
    void *mpbuf; // 0x504
    u32 unk_508;
    u8 sending; // 0x50C
    u8 unk_50D[0xB];
    u16 sendSize;                // 0x518
    u16 recvSize;                // 0x51A
    void (*notify)(int, void *); // 0x51C
    void *connect;               // 0x520
    u16 unk_524;
    u16 ending;     // 0x526
    u16 active;     // 0x528
    u16 port;       // 0x52A
    u16 continuous; // 0x52C
    u8 unk_52E[0xB2];
    u16 count;    // 0x5E0
    u16 aid;      // 0x5E2
    int scanning; // 0x5E4
    int changing; // 0x5E8
    int index;    // 0x5EC
    u8 unk_5F0[0x10];
    MbScanRecord records[16]; // 0x600
} MbChild;

typedef char MbScanEventSize[(sizeof(MbScanEvent) == 0xB8) ? 1 : -1];
typedef char MbScanRecordSize[(sizeof(MbScanRecord) == 0x180) ? 1 : -1];
typedef char MbChildSize[(sizeof(MbChild) == 0x1E00) ? 1 : -1];

typedef struct MbGlobal {
    u16 dma; // 0x00
    u16 unk_02;
    u32 unk_04;
    union {
        u8 *bytes;
        MbParentControl *parentControl;
        MbChild *child;
    } work; // 0x08
    union {
        MbParentWork *parentWork;
    } parent; // 0x0C
    u8 unk_10[0x10];
    void *scanBuffer;    // 0x20
    u16 scanChannel;     // 0x24
    u16 scanTime;        // 0x26
    u8 scanMacFilter[6]; // 0x28
} MbGlobal;

typedef struct MbScanParam {
    u8 unk_00[4];
    u16 channel; // 0x04
} MbScanParam;

typedef struct MbConfig {
    u16 lifeTime[4]; // 0x00
    u16 *name;       // 0x08
    u32 option;      // 0x0C
} MbConfig;

typedef union MbEvent {
    struct {
        u16 api, error, state, unk_06, substate, unk_0A, unused[2], aid;
    } fields;

    struct {
        u8 unk_00[8];
        void *data;
    } data;
} MbEvent;

extern MbGlobal gMbGlobalState;
extern u8 gMbChildScanParam[]; // MbScanParam of the child's scan
extern MbConfig ov13_0224598C;

extern u16 WM_GetAllowedChannel(void);
extern int WM_SetIndCallback(void *);
extern int WM_SetLifeTime(void *, int, int, int, int);
extern int WM_SetParentParameter(void (*)(MbEvent *), void *);
extern int WM_SetBeaconIndication(void (*)(MbEvent *), int);
extern int WMi_StartParentEx(void (*)(MbEvent *), u32);
extern int WM_StartMPEx(void *, void *, u16, void *, u16, u16, int, int, int, int, int);
extern int WM_End(void *);
extern int WM_SetPortCallback(int, void *, void *);
extern int WM_StartScan(void *, void *);
extern int WM_StartConnectEx(void *, void *, void *, u16, u16);
extern void MBi_CheckWmErrcode(int, int);
extern void MBi_CommEnd(void);

int changeScanChannel(MbScanParam *scan);
int MBi_IsSendEnabled(void);
void MBi_OnInitializeDone(void);
void MBi_EndCommon(void *arg);
void MBi_ParentCallback(MbEvent *event);
void MBi_ChildPortCallback(u16 *p);
void MBi_ChildCallback(void *argument);
u32 MBi_GetBeaconPeriodDispersion(void);

static inline int isParentReady(void) {
    u8 *p = gMbGlobalState.work.bytes;
    return *(u16 *)(p + 0x528) == 1 && p[0x50c] == 0;
}

static inline int isParentFree(void) {
    u8 *p = gMbGlobalState.work.bytes;
    return isParentReady() && *(u16 *)(p + 0x526) == 0;
}

int changeScanChannel(MbScanParam *scan) {
    int allowed = WM_GetAllowedChannel();
    u16 channel, i;
    if (allowed == 0) {
        return 0;
    }
    channel = scan->channel;
    i = 0;
    do {
        if ((allowed & (1 << (channel - 1))) && scan->channel != channel) {
            scan->channel = channel;
            break;
        }
        i++;
        channel = channel == 16 ? 1 : channel + 1;
    } while (i < 16);
    return 1;
}

#pragma push
#pragma opt_rebuildlogicals off

int MBi_IsSendEnabled(void) {
    int result = 0;
    if (isParentFree() && *(u16 *)(gMbGlobalState.work.bytes + 0x52a) != 0) {
        result = 1;
    }
    return result;
}

#pragma pop

void MBi_OnInitializeDone(void) {
    MBi_CheckWmErrcode(0x80, WM_SetIndCallback(MBi_ParentCallback));
    MBi_CheckWmErrcode(0x1d, WM_SetLifeTime(MBi_ParentCallback, ov13_0224598C.lifeTime[3], ov13_0224598C.lifeTime[1], ov13_0224598C.lifeTime[0], ov13_0224598C.lifeTime[2]));
}

void MBi_EndCommon(void *arg) {
    void (*cb)(u32, void *);
    *(u8 *)(gMbGlobalState.work.bytes + 0x50d) = 0;
    *(u16 *)((u8 *)gMbGlobalState.parent.parentWork + 0x1316) = 0;
    cb = *(void **)(gMbGlobalState.work.bytes + 0x51c);
    if (cb) {
        cb(17, arg);
    }
}

static inline void StartMP(int option) {
    MbParentControl *c = *(MbParentControl *volatile *)&gMbGlobalState.work.parentControl;
    MBi_CheckWmErrcode(14, WM_StartMPEx(MBi_ParentCallback, c->receive, c->receiveSize, (u8 *)c + 64, c->sendSize, (u16)option, 0, 0, 0, 1, 1));
}

void MBi_ParentCallback(MbEvent *event) {
    switch (event->fields.api) {
    case 0:
        if (event->fields.error) {
            gMbGlobalState.work.parentControl->callback(256, event);
            return;
        }
        MBi_OnInitializeDone();
        return;
    case 29:
        if (event->fields.error) {
            gMbGlobalState.work.parentControl->callback(256, event);
            return;
        }
        MBi_CheckWmErrcode(7, WM_SetParentParameter(MBi_ParentCallback, gMbGlobalState.work.parentControl));
        return;
    case 7:
        gMbGlobalState.work.parentControl->callback(21, event);
        MBi_CheckWmErrcode(25, WM_SetBeaconIndication(MBi_ParentCallback, 1));
        return;
    case 25:
        if (gMbGlobalState.work.parentControl->ending == 0) {
            if (event->fields.error) {
                gMbGlobalState.work.parentControl->callback(256, event);
                return;
            }
            MBi_CheckWmErrcode(8, WMi_StartParentEx(MBi_ParentCallback, ov13_0224598C.option));
            return;
        }
        if (event->fields.error) {
            gMbGlobalState.work.parentControl->ending = 0;
            gMbGlobalState.work.parentControl->callback(256, event);
            return;
        }
        MBi_EndCommon(event);
        return;
    case 8:
        if (event->fields.error) {
            gMbGlobalState.work.parentControl->callback(256, event);
            return;
        }
        switch (event->fields.substate) {
        case 0:
            gMbGlobalState.work.parentControl->children = 0;
            gMbGlobalState.work.parentControl->active = 0;
            return;
        case 7:
            if (gMbGlobalState.work.parentControl->ending == 1) {
                return;
            }
            gMbGlobalState.work.parentControl->children |= 1 << event->fields.aid;
            gMbGlobalState.work.parentControl->callback(0, event);
            if (gMbGlobalState.work.parentControl->active == 0 && gMbGlobalState.parent.parentWork->starting == 0) {
                int option;
                gMbGlobalState.parent.parentWork->starting = 1;
                option = gMbGlobalState.work.parentControl->option == 0;
                StartMP(option);
                return;
            }
            if (MBi_IsSendEnabled()) {
                gMbGlobalState.work.parentControl->callback(25, 0);
            }
            return;
        case 9:
            gMbGlobalState.work.parentControl->children &= ~(1 << event->fields.aid);
            gMbGlobalState.work.parentControl->callback(1, event);
            return;
        case 2:
            if (gMbGlobalState.work.parentControl->ending == 1) {
                return;
            }
            gMbGlobalState.work.parentControl->callback(28, event);
            return;
        case 26:
            return;
        default:
            gMbGlobalState.work.parentControl->callback(256, event);
            return;
        }
    case 14:
        gMbGlobalState.parent.parentWork->starting = 0;
        switch (event->fields.state) {
        case 10:
            gMbGlobalState.work.parentControl->active = 1;
            if (gMbGlobalState.work.parentControl->ending == 0) {
                gMbGlobalState.work.parentControl->callback(25, 0);
            }
            return;
        case 11:
            gMbGlobalState.work.parentControl->callback(3, event->data.data);
            return;
        default:
            gMbGlobalState.work.parentControl->callback(256, event);
            return;
        }
    case 15:
        if (gMbGlobalState.parent.parentWork->delay) {
            u32 i, count = 0;
            for (i = 0; i < 15; i++) {
                if (gMbGlobalState.parent.parentWork->children[i]) {
                    count++;
                    if (count >= 2) {
                        break;
                    }
                }
            }
            if (count == 1) {
                OS_SpinWait(13000);
            }
        }
        gMbGlobalState.work.parentControl->sending = 0;
        if (event->fields.error == 0) {
            gMbGlobalState.work.parentControl->callback(2, event);
            if (gMbGlobalState.work.parentControl->ending == 0) {
                gMbGlobalState.work.parentControl->callback(25, 0);
            }
            return;
        }
        if (event->fields.error == 10) {
            gMbGlobalState.work.parentControl->callback(42, event);
            return;
        }
        gMbGlobalState.work.parentControl->callback(19, event);
        if (gMbGlobalState.work.parentControl->ending == 0) {
            gMbGlobalState.work.parentControl->callback(25, 0);
        }
        return;
    case 1:
        if (gMbGlobalState.parent.parentWork->alternate == 0) {
            if (event->fields.error) {
                gMbGlobalState.work.parentControl->ending = 0;
                gMbGlobalState.work.parentControl->callback(256, event);
                return;
            }
            gMbGlobalState.work.parentControl->children = 0;
            gMbGlobalState.work.parentControl->active = 0;
            MBi_CheckWmErrcode(2, WM_End(MBi_ParentCallback));
            return;
        }
        WM_SetPortCallback(1, 0, 0);
        WM_SetIndCallback(0);
        if (event->fields.error) {
            gMbGlobalState.work.parentControl->ending = 0;
            gMbGlobalState.work.parentControl->callback(256, event);
            return;
        }
        MBi_CheckWmErrcode(25, WM_SetBeaconIndication(MBi_ParentCallback, 0));
        return;
    case 2:
        if (event->fields.error) {
            gMbGlobalState.work.parentControl->ending = 0;
            gMbGlobalState.work.parentControl->callback(256, event);
            return;
        }
        MBi_EndCommon(event);
        return;
    case 13:
        if (event->fields.error) {
            return;
        }
        gMbGlobalState.work.parentControl->children &= ~event->fields.unk_0A;
        return;
    case 128:
        switch (event->fields.state) {
        case 16:
            gMbGlobalState.work.parentControl->callback(29, event);
            return;
        case 17:
            gMbGlobalState.work.parentControl->callback(31, event);
            return;
        case 18:
            gMbGlobalState.work.parentControl->callback(32, event);
            return;
        case 19:
            gMbGlobalState.work.parentControl->callback(33, event);
            return;
        case 22:
            OS_Terminate();
            return;
        case 23:
            break;
        default:
            break;
        }
        break;
    default:
        gMbGlobalState.work.parentControl->callback(256, event);
        return;
    }
}

void MBi_ChildPortCallback(u16 *p) {
    if (p[1]) {
        return;
    }
    switch (p[2]) {
    case 7:
    case 9:
    case 25:
    case 26:
        return;
    case 21:
        ((void (*)(int, void *))(*(u32 *)(gMbGlobalState.work.bytes + 0x51c)))(9, p);
        break;
    default:
        return;
    }
}

#define NOTIFY(code, arg)  c->notify((code), (arg))
#define CHECK(event, call) MBi_CheckWmErrcode(event, call)
#define RESTART()                                                            \
    if (c->scanning) {                                                       \
        if (c->changing && !changeScanChannel((MbScanParam *)gMbChildScanParam)) \
            MBi_CommEnd();                                                   \
        CHECK(10, WM_StartScan(MBi_ChildCallback, gMbChildScanParam));           \
    }
#define ERR()             \
    if (e->err) {         \
        NOTIFY(0x100, e); \
        return;           \
    }

enum {
    MB_F0,
    MB_F1
};

static inline int StartChildMultiplayer(MbChild *c) {
    u16 frequency = c->continuous ? MB_F0 : MB_F1;
    return WM_StartMPEx(MBi_ChildCallback, c->mpbuf, c->recvSize, c->sendBuffer, c->sendSize, frequency, 0, 0, 0, 1, 1);
}

#pragma push
#pragma optimization_level 2
#pragma opt_propagation off
#pragma opt_common_subs off

static inline void PublishScan(MbChild *c, MbScanEvent *scan) {
    int i;
    int p01, p2, p3, p4, p5;
    MbScanRecord *records;
    records = c->records;
    for (i = 0; i < c->count; i++) {
        p5 = 0;
        p01 = 0;
        p4 = 0;
        p3 = 0;
        p2 = 0;
        if (scan->mac[0] == records[i].scan.mac[0] && scan->mac[1] == records[i].scan.mac[1]) {
            p01 = 1;
        }
        if (p01 && scan->mac[2] == records[i].scan.mac[2]) {
            p2 = 1;
        }
        if (p2 && scan->mac[3] == records[i].scan.mac[3]) {
            p3 = 1;
        }
        if (p3 && scan->mac[4] == records[i].scan.mac[4]) {
            p4 = 1;
        }
        if (p4 && scan->mac[5] == records[i].scan.mac[5]) {
            p5 = 1;
        }
        if (p5) {
            records[i].scan.extra = scan->extra;
            records[i].scan.user = scan->user;
            DC_InvalidateRange(c->records[i].scanImage, 0xc0);
            MI_DmaCopy16(gMbGlobalState.dma, c->scanImage, c->records[i].scanImage, 0xc0);
            c->index = i;
            return;
        }
    }
    if (i < 16) {
        c->count = i + 1;
        MIi_CpuCopy16((u16 *)scan, (u16 *)&records[i].scan, sizeof(MbScanEvent));
        DC_InvalidateRange(c->records[i].scanImage, 0xc0);
        MI_DmaCopy16(gMbGlobalState.dma, c->scanImage, c->records[i].scanImage, 0xc0);
        c->index = i;
    }
}

void MBi_ChildCallback(void *argument) {
    MbEventHeader *e = argument;
    MbScanEvent *scan = argument;
    MbConnectEvent *connect = argument;
    MbChild *c = gMbGlobalState.work.child;
    switch (e->event) {
    case 0:
        if (e->err) {
            NOTIFY(0x100, e);
            return;
        }
        NOTIFY(21, e);
        CHECK(29, WM_SetLifeTime(MBi_ChildCallback, ov13_0224598C.lifeTime[3], ov13_0224598C.lifeTime[1], ov13_0224598C.lifeTime[0], ov13_0224598C.lifeTime[2]));
        return;
    case 29:
        ERR();
        gMbGlobalState.scanBuffer = c->scanImage;
        if (!gMbGlobalState.scanChannel) {
            gMbGlobalState.scanChannel = 1;
        }
        if (!gMbGlobalState.scanTime) {
            gMbGlobalState.scanTime = 200;
        }
        gMbGlobalState.scanMacFilter[0] = 255;
        gMbGlobalState.scanMacFilter[1] = 255;
        gMbGlobalState.scanMacFilter[2] = 255;
        gMbGlobalState.scanMacFilter[3] = 255;
        gMbGlobalState.scanMacFilter[4] = 255;
        gMbGlobalState.scanMacFilter[5] = 255;
        c->scanning = 1;
        c->changing = 1;
        CHECK(10, WM_StartScan(MBi_ChildCallback, gMbChildScanParam));
        return;
    case 10:
        ERR();
        switch (scan->state) {
        case 3:
            return;
        case 5:
            PublishScan(c, scan);
            NOTIFY(4, e);
            RESTART();
            return;
        case 4:
            NOTIFY(5, e);
            RESTART();
            return;
        default:
            NOTIFY(0x100, e);
            return;
        }
    case 11:
        ERR();
        {
            void *cn = c->connect;
            CHECK(12, WM_StartConnectEx(MBi_ChildCallback, cn, 0, 1, 0));
        }
        return;
    case 12:
        if (e->err) {
            c->count = 0;
            NOTIFY(11, e);
            return;
        }
        switch (connect->state) {
        case 6:
            c->port = 0;
            c->active = 1;
            return;
        case 7:
            c->aid = connect->aid;
            NOTIFY(6, e);
            c->port = 1;
            if (WM_SetPortCallback(1, MBi_ChildPortCallback, 0)) {
                return;
            }
            CHECK(14, StartChildMultiplayer(c));
            return;
        case 9:
            NOTIFY(10, e);
            c->port = 0;
            c->active = 0;
            return;
        case 26:
            return;
        default:
            NOTIFY(0x100, e);
            return;
        }
    case 14:
        switch (e->reason) {
        case 10:
            c->active = 1;
            if (MBi_IsSendEnabled()) {
                NOTIFY(25, 0);
            }
            return;
        case 12:
            return;
        case 13:
            return;
        default:
            NOTIFY(0x100, e);
            return;
        }
    case 15:
        c->sending = 0;
        if (e->err == 0) {
            NOTIFY(8, e);
        } else if (e->err == 9) {
            NOTIFY(41, e);
        } else {
            NOTIFY(18, e);
        }
        if (!gMbGlobalState.work.child->ending) {
            NOTIFY(25, 0);
        }
        return;
    case 1:
        if (e->err) {
            c->ending = 0;
            NOTIFY(0x100, e);
            return;
        }
        c->port = 0;
        gMbGlobalState.work.child->active = 0;
        CHECK(2, WM_End(MBi_ChildCallback));
        return;
    case 2:
        if (e->err) {
            c->ending = 0;
            NOTIFY(0x100, e);
            return;
        }
        MBi_EndCommon(argument);
        return;
    case 21:
        if (MBi_IsSendEnabled()) {
            NOTIFY(25, 0);
        }
        return;
    case 128:
        switch (e->reason) {
        case 22:
            OS_Terminate();
            return;
        case 23:
            return;
        default:
            return;
        }
    default:
        NOTIFY(0x100, e);
        return;
    }
}

#pragma pop

u32 MBi_GetBeaconPeriodDispersion(void) {
    u8 mac[6];
    u8 *ptr;
    int i;
    u32 sum;
    OS_GetMacAddress(mac);
    i = 0;
    ptr = mac;
    sum = 0;
    do {
        sum += *ptr++;
        i++;
    } while (i < 6);
    return ((sum + *(volatile u32 *)HW_VBLANK_COUNT_BUF) * 7) % 20;
}
