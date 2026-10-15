#pragma force_active on
#include "global.h"

#include "dwc/ap_connect_internal.h"
// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

typedef void (*RecvCb)(int, void *, int);

typedef struct RecvEntry {
    u32 unk0;
    u8 *buf;
    int size;
    u32 unkC;
    int pos;
    u32 unk14;
    int total;
    u8 unk1C;
    u8 state;
    u8 saved;
    u8 unk1F;
    u16 unk20;
    u16 type;
    u32 tickLo;
    u32 tickHi;
    int tickOn;
} RecvEntry;

typedef struct RecvWork {
    RecvEntry entries[32];
    u32 unk600;
    RecvCb cb;
    int tickOn;
} RecvWork;

extern RecvWork *gDwcTransport;
typedef void (*HttpDoneCb)(void *, int, int, int);
typedef void (*HttpProgCb)(int, void *, int, int, int, int);

typedef struct HttpInit {
    int param;
    HttpDoneCb cb;
    HttpProgCb prog;
    int flag;
} HttpInit;

typedef struct HttpReq {
    HttpInit init;
    void *buf;
    int handle;
    struct HttpReq *next;
} HttpReq;

typedef struct HttpList {
    HttpReq *head;
    int count;
} HttpList;

extern HttpList DWCi_GHTTPRequestList;

typedef struct Ctx {
    void *(*alloc)(int, int);
    void (*free)(int, void *, int);
    u8 flags;
    u8 state;
    u8 prevState;
    u8 apSeen;
    int errorReason;
    int status;
    u8 failedApStatus;
    u8 failedApType;
    u8 furthestState;
    u8 apType;
    char spotInfo[10];
    u8 presetApType;
    u8 pad23;
} Ctx;

typedef struct Globals {
    void *p0;
    void *p4;
    void *p8;
    Ctx *ctx;
    ApConnectWork *work;
} Globals;

extern Globals DWCi_AC_Globals;
#define RSSI_CALC(v) ((u8)(((v) & 2) ? (u8)((v) >> 2) : (u8)(((v) >> 2) + 25)))

typedef struct InitParam {
    void *(*alloc)(int, int);
    void (*free)(int, void *, int);
    u8 dmaNo;
    u8 powerMode;
    u8 profileSel;
    u8 skipNetCheck;
} InitParam;

typedef struct WcmEvent {
    s16 notify;
    s16 result;
    void *ptr;
    int reason;
} WcmEvent;

extern char DWCi_AC_FreeSpotSsid[];
extern char DWCi_AC_UsbApProbeSsid[];
extern char DWCi_AC_WayportSsid[];
extern char DWCi_AC_NintendoWfcSsid[];
extern int DWCi_GetConnectionAID(int);
extern u8 DWCi_GetTransportRecvState(int, void *, int);
extern int DWCi_GetTransportHeaderType(void *);
extern RecvEntry *DWCi_GetTransportChannel(int);
extern void DWCi_ProcessMatchSynPacket(int, int, int);
extern void DWCi_SetError(int, int);
extern int DWCi_GetGT2Connection(void);
extern int gt2GetOutgoingBufferFreeSpace(int);
extern void ghttpStartup(void);
extern void ghttpCleanup(void);
extern void ghttpThink(void);
extern int DWCi_IsError(void);
extern void DWC_Free(int, void *, int);
extern void *DWC_Alloc(int, int);
extern int ghttpGetA(const char *, int, void *, HttpReq *);
extern int ghttpGetExA(const char *, int, void *, int, int, int, int, void *, void *, void *);
extern void DWCi_BM_GetApInfo(void *);
extern int WCM_Init(void *, int);
extern u8 DWCi_AC_Startup(void);
extern u8 DWCi_AC_ProcessSearch(void);
extern u8 DWCi_AC_ProcessEndSearch(void);
extern u8 DWCi_AC_ProcessConnected(void);
extern void *WCM_GetApEssid(int);
extern void DC_InvalidateRange(void *, u32);
extern void DWCi_AC_GetShopSpotInfo(void *, char *);
extern int strncmp(const char *, const char *, u32);
extern void DWCi_AC_AddHiddenSsidChannel(u16);
extern int DWCi_AC_IsUsbApSsid(u8 *);
extern int DWCi_AC_IsShopSsid(u8 *);
extern int WCM_GetPhase(void);
extern void WCM_ConnectAsync(void *, void *, u32);
extern void DWCi_AC_GetUsbApWepKey(u8 *, u8 *);
extern void DWCi_AC_GetShopWepKey(u8 *, u8 *);
extern void DWCi_NetCheck_Abort(void);
extern void DWCi_NetCheck_Destroy(void);
extern void WCM_Finish(void);
extern void WCM_CleanupAsync(void);
extern void WCM_EndSearchAsync(void);
extern void WCM_DisconnectAsync(void);
extern void WCM_TerminateAsync(void);
extern int SOCL_CalmDown(void);
extern int SOC_Cleanup(void);
extern u8 DWCi_AC_AddUserSsids(ApConnectWork *);
extern u8 DWCi_AC_CountApsToRecheck(ApConnectWork *);
extern u8 DWCi_AC_GetFirstApToRecheck(ApConnectWork *);

void DWCi_TransportRecvUnreliable(int a, void *p, int len);
void DWCi_TransportRecvHeader(int idx, void *p, int len);
void DWCi_TransportRecvBody(int idx, void *p, int len);
void DWCi_TransportRecvSyn(int a, int b);
int DWCi_GetSendBufferFreeSpace(void);
int DWC_InitGHTTP(void);
int DWC_ShutdownGHTTP(void);
int DWC_ProcessGHTTP(void);
int DWCi_GHTTPCompletedCallback(void *r, int res, void *buf, int len, void *param);
void DWCi_GHTTPProgressCallback(void *r, int a, void *b, int c, int d, int e, HttpReq *req);
int DWC_GetGHTTPData(const char *url, HttpDoneCb cb, int param);
int DWC_GetGHTTPDataEx2(const char *url, int len, int flag, int *post, HttpProgCb prog, HttpDoneCb cb, int param);
int DWC_GetGHTTPDataEx(const char *url, int len, int flag, HttpProgCb prog, HttpDoneCb cb, int param);
int DWCi_HandleGHTTPError(int err);
HttpReq *DWCi_AppendGHTTPRequest(HttpInit *init);
void DWCi_RemoveGHTTPRequest(HttpReq *req);
void DWCi_ClearGHTTPRequests(void);
int DWC_AC_Create(InitParam *param);
int DWC_AC_Process(void);
int DWC_AC_GetStatus(void);
u8 DWC_AC_GetApType(void);
int DWC_AC_GetApSpotInfo(void *dst);
int DWC_AC_Destroy(void);
void DWCi_AC_SetSpecifiedApEx(const u8 *ssid, const void *key, int type, const void *name, int x);
void DWCi_AC_SetSpecifiedAp(const u8 *ssid, const void *key, int type);
void DWCi_AC_SetUserProfile(int idx, const void *src);
void *DWCi_AC_Alloc(int kind, int size);
void DWCi_AC_Free(int kind, void *p, int size);
void DWCi_AC_FreeAll(void);
void *DWCi_AC_GetWork(int kind);
void DWCi_AC_SetState(u8 st);
u8 DWCi_AC_GetState(void);
void DWCi_AC_SetError(int v);
int DWCi_AC_GetError(void);
void DWCi_AC_SetConnectedApInfo(u8 x);
u8 DWCi_AC_GetApTypeFromIndex(u8 x);
void DWCi_AC_FreeConnectWork(void);
int DWCi_AC_CompareApNamePrefix(void);
void DWCi_AC_FoundApCallback(ApBss *bss);
int DWCi_AC_MatchSpecialSsid(ApBss *ap);
int DWCi_AC_FindSsidEntry(ApBss *ap, int n, ApSsidEntry *s);
int DWCi_AC_FindKnownSsid(ApBss *ap, ApConnectWork *w);
int DWCi_AC_AddFoundAp(int x, ApBss *bss, u8 y, ApConnectWork *w);
void DWCi_AC_StoreFoundAp(u8 x, ApBss *bss, u8 y, ApConnectWork *w);
void DWCi_AC_UpdateFoundAp(int idx, ApBss *bss, u8 y, ApConnectWork *w);
void DWCi_AC_SortFoundAp(int i, ApConnectWork *w);
void DWCi_AC_WcmCallback(WcmEvent *ev);
u8 DWCi_AC_ProcessConnect(void);
u8 DWCi_AC_PrepareConnect(ApConnectWork *w);
u8 DWCi_AC_Connect(ApConnectWork *w);
u8 DWCi_AC_SelectSsidIndex(ApConnectWork *w);
u32 DWCi_AC_GetPowerOption(ApConnectWork *w);
u32 DWCi_AC_GetAuthOption(ApConnectWork *w);
BOOL DWCi_AC_MakeWepConfig(ApConnectWork *w, int kind, u8 *out);
int DWCi_AC_CleanupStep(u8 *st);
int DWCi_AC_CleanupWcm(void);
int DWCi_AC_CleanupSocket(void);
u8 DWCi_AC_ProcessError(void);
int DWCi_AC_GetErrorCode(void);
int DWCi_AC_GetSystemErrorCode(int v);
int DWCi_AC_GetTerminatedErrorCode(void);
int DWCi_AC_GetApNotFoundErrorCode(Ctx *c);
static inline int c800(void);
static inline int defaultError(int reason);
int DWCi_AC_GetConnectErrorCode(Ctx *p);
u8 DWCi_AC_MakeSsidList(int kind);
int DWCi_AC_MatchFreeSpotSsid(ApBss *ap);
u8 DWCi_AC_MakeScanSsidList(ApConnectWork *w);
u8 DWCi_AC_MakeProbeSsidList(ApConnectWork *w);

void DWCi_TransportRecvUnreliable(int a, void *p, int len) {
    int idx = DWCi_GetConnectionAID(a);
    RecvWork *g = gDwcTransport;
    RecvEntry *e = &g->entries[idx];
    if (e->buf == NULL) {
        return;
    }
    if (e->size < len) {
        return;
    }
    if (g->cb != NULL) {
        g->cb(idx, p, len);
    }
    if (gDwcTransport->tickOn && e->tickOn) {
        *(u64 *)&e->tickLo = OS_GetTick();
    }
}

void DWCi_TransportRecvHeader(int idx, void *p, int len) {
    u32 hdr[2];
    RecvEntry *e = &gDwcTransport->entries[idx];
    int type;
    e->saved = DWCi_GetTransportRecvState(idx, p, len);
    type = DWCi_GetTransportHeaderType(p);
    switch (type) {
    case 1:
        if (len != 8) {
            return;
        }
        MI_CpuCopy8(p, hdr, 8);
        e->total = hdr[0];
        e->pos = 0;
        if (e->buf != NULL && e->size >= e->total) {
            e->state = 2;
        } else {
            e->state = 4;
        }
        break;
    case 2:
    case 3:
    case 4:
        e->state = 3;
        break;
    }
    e->type = type;
}

void DWCi_TransportRecvBody(int idx, void *p, int len) {
    RecvEntry *e = &gDwcTransport->entries[idx];
    if (DWCi_GetTransportRecvState(idx, p, len) == 2) {
        int pos = e->pos;
        if (pos + len > e->size) {
            DWCi_SetError(6, -97620);
            return;
        }
        MI_CpuCopy8(p, e->buf + pos, len);
    }
    e->pos += len;
    if (e->pos == e->total) {
        int total = e->total;
        e->state = 1;
        e->pos = 0;
        e->total = 0;
        if (gDwcTransport->cb != NULL) {
            gDwcTransport->cb(idx, e->buf, total);
        }
    }
    if (gDwcTransport->tickOn && e->tickOn) {
        *(u64 *)&e->tickLo = OS_GetTick();
    }
}

void DWCi_TransportRecvSyn(int a, int b) {
    RecvEntry *e = DWCi_GetTransportChannel(a);
    e->state = e->saved;
    switch (e->type) {
    case 2:
    case 3:
    case 4:
        DWCi_ProcessMatchSynPacket(a, e->type, b);
    }
}

int DWCi_GetSendBufferFreeSpace(void) {
    int r = gt2GetOutgoingBufferFreeSpace(DWCi_GetGT2Connection()) - 519;
    if (r <= 0) {
        r = 0;
    }
    return r;
}

int DWC_InitGHTTP(void) {
    ghttpStartup();
    DWCi_GHTTPRequestList.count++;
    return 1;
}

int DWC_ShutdownGHTTP(void) {
    if (DWCi_GHTTPRequestList.count <= 0) {
        return 1;
    }
    ghttpCleanup();
    if (--DWCi_GHTTPRequestList.count == 0) {
        DWCi_ClearGHTTPRequests();
    }
    return 1;
}

int DWC_ProcessGHTTP(void) {
    if (DWCi_IsError()) {
        return 0;
    }
    ghttpThink();
    return 1;
}

int DWCi_GHTTPCompletedCallback(void *r, int res, void *buf, int len, void *param) {
    HttpReq *req = param;
    HttpDoneCb cb = req->init.cb;
    int flag = req->init.flag;
    if (cb != NULL) {
        if (res == 0) {
            cb(buf, len, res, req->init.param);
        } else {
            DWCi_HandleGHTTPError(res);
            cb(NULL, 0, res, req->init.param);
        }
    }
    if (res != 0 || flag == 1) {
        if (req->buf == NULL) {
            flag = 1;
        } else {
            DWC_Free(4, req->buf, 0);
        }
    }
    DWCi_RemoveGHTTPRequest(req);
    return flag ? 1 : 0;
}

void DWCi_GHTTPProgressCallback(void *r, int a, void *b, int c, int d, int e, HttpReq *req) {
    if (req->init.prog == NULL) {
        return;
    }
    req->init.prog(a, b, c, d, e, req->init.param);
}

int DWC_GetGHTTPData(const char *url, HttpDoneCb cb, int param) {
    HttpInit init;
    int r;
    HttpReq *req;
    if (DWCi_IsError()) {
        return -8;
    }
    init.param = param;
    init.cb = cb;
    init.prog = NULL;
    init.flag = 1;
    req = DWCi_AppendGHTTPRequest(&init);
    if (req == NULL) {
        DWCi_HandleGHTTPError(-5);
        cb(NULL, 0, -5, param);
        return -5;
    }
    r = ghttpGetA(url, 0, DWCi_GHTTPCompletedCallback, req);
    if (r < 0) {
        DWCi_HandleGHTTPError(r);
        cb(NULL, 0, r, param);
        DWCi_RemoveGHTTPRequest(req);
    }
    req->handle = r;
    return r;
}

int DWC_GetGHTTPDataEx2(const char *url, int len, int flag, int *post, HttpProgCb prog, HttpDoneCb cb, int param) {
    HttpInit init;
    void *buf = NULL;
    HttpReq *req;
    int r;
    if (DWCi_IsError()) {
        return -8;
    }
    init.param = param;
    init.cb = cb;
    init.prog = prog;
    init.flag = flag;
    req = DWCi_AppendGHTTPRequest(&init);
    if (req == NULL) {
        DWCi_HandleGHTTPError(-5);
        cb(buf, 0, -5, param);
        return -5;
    }
    if (len > 0) {
        buf = DWC_Alloc(4, len);
        if (buf == NULL) {
            DWCi_HandleGHTTPError(-5);
            cb(NULL, 0, -5, param);
            DWCi_RemoveGHTTPRequest(req);
            return -5;
        }
        req->buf = buf;
    }
    if (post != NULL) {
        r = ghttpGetExA(url, 0, buf, len, *post, 0, 0, DWCi_GHTTPProgressCallback, DWCi_GHTTPCompletedCallback, req);
    } else {
        r = ghttpGetExA(url, 0, buf, len, 0, 0, 0, DWCi_GHTTPProgressCallback, DWCi_GHTTPCompletedCallback, req);
    }
    if (r < 0) {
        DWCi_HandleGHTTPError(r);
        cb(NULL, 0, r, param);
        if (req->buf != NULL) {
            DWC_Free(4, req->buf, 0);
        }
        DWCi_RemoveGHTTPRequest(req);
    }
    req->handle = r;
    return r;
}

int DWC_GetGHTTPDataEx(const char *url, int len, int flag, HttpProgCb prog, HttpDoneCb cb, int param) {
    return DWC_GetGHTTPDataEx2(url, len, flag, NULL, prog, cb, param);
}

int DWCi_HandleGHTTPError(int err) {
    int type = 7;
    int code = -98000;
    if (err == 0) {
        return 0;
    }
    switch (err) {
    case -7:
        code += -800;
        break;
    case -6:
        code += -810;
        break;
    case -5:
        code += -840;
        break;
    case -4:
    case -3:
    case -2:
        code += -820;
        break;
    case -1:
        code += -830;
        break;
    case 1:
    case 19:
        code += -1;
        type = 9;
        break;
    case 2:
        code += -840;
        break;
    case 3:
        code += -850;
        break;
    case 4:
        code += -30;
        break;
    case 5:
        code += -50;
        break;
    case 6:
    case 11:
    case 12:
        code += -20;
        break;
    case 7:
        code += -860;
        break;
    case 8:
    case 9:
    case 10:
        code += -870;
        break;
    case 13:
    case 14:
        code += -880;
        break;
    case 15:
        code += -890;
        break;
    case 16:
        code += -900;
        break;
    case 17:
        code += -910;
        break;
    }
    DWCi_SetError(type, code);
    return err;
}

HttpReq *DWCi_AppendGHTTPRequest(HttpInit *init) {
    HttpReq *req = DWC_Alloc(4, sizeof(HttpReq));
    if (req == NULL) {
        return NULL;
    }
    req->init = *init;
    req->next = NULL;
    req->buf = NULL;
    if (DWCi_GHTTPRequestList.head == NULL) {
        DWCi_GHTTPRequestList.head = req;
        return req;
    } else {
        req->next = DWCi_GHTTPRequestList.head;
        DWCi_GHTTPRequestList.head = req;
        return req;
    }
}

void DWCi_RemoveGHTTPRequest(HttpReq *req) {
    HttpReq *p = DWCi_GHTTPRequestList.head;
    HttpReq *q;
    if (p == NULL) {
        return;
    }
    if (p == req) {
        HttpReq *next = p->next;
        DWC_Free(4, p, 0);
        DWCi_GHTTPRequestList.head = next;
        return;
    }
    for (q = p->next; q != NULL; q = q->next) {
        if (q != req) {
            p = q;
        } else {
            HttpReq *t = p->next;
            p->next = t->next;
            DWC_Free(4, t, 0);
            return;
        }
    }
}

void DWCi_ClearGHTTPRequests(void) {
    HttpReq *p = DWCi_GHTTPRequestList.head;
    while (p != NULL) {
        HttpReq *cur = p;
        p = p->next;
        if (cur->buf != NULL) {
            DWC_Free(4, cur->buf, 0);
        }
        DWC_Free(4, cur, 0);
    }
    DWCi_GHTTPRequestList.head = NULL;
}

int DWC_AC_Create(InitParam *param) {
    Ctx *ctx;
    ApConnectWork *w;
    u32 *p8;
    int r;
    DWCi_AC_Globals.ctx = param->alloc(1, sizeof(Ctx));
    MIi_CpuClear32(0, (u32 *)DWCi_AC_Globals.ctx, sizeof(Ctx));
    ctx = DWCi_AC_Globals.ctx;
    ctx->alloc = param->alloc;
    ctx->free = param->free;
    ctx->state = 1;
    ctx->furthestState = 1;
    ctx->flags = 1;
    DWCi_AC_Globals.work = DWCi_AC_Alloc(0x10, sizeof(ApConnectWork));
    DWCi_AC_Globals.p0 = DWCi_AC_Alloc(2, 0x2300);
    DWCi_AC_Globals.p4 = DWCi_AC_Alloc(4, 0x58);
    DWCi_AC_Globals.p8 = DWCi_AC_Alloc(8, 0xc);
    MIi_CpuClear32(0, (u32 *)DWCi_AC_Globals.work, sizeof(ApConnectWork));
    MIi_CpuClear32(0, (u32 *)DWCi_AC_Globals.p0, 0x2300);
    MIi_CpuClear32(0, (u32 *)DWCi_AC_Globals.p4, 0x58);
    MIi_CpuClear32(0, (u32 *)DWCi_AC_Globals.p8, 0xc);
    w = DWCi_AC_Globals.work;
    w->dmaNo = param->dmaNo;
    w->powerMode = param->powerMode;
    p8 = DWCi_AC_Globals.p8;
    p8[0] = (u32)param->alloc;
    p8[1] = (u32)param->free;
    p8[2] = 0;
    w->profileSel = param->profileSel;
    w->skipNetCheck = param->skipNetCheck;
    DWCi_BM_GetApInfo(w);
    r = WCM_Init(DWCi_AC_Globals.p0, 0x2300);
    if (r == 1 || r > 4) {
        DWCi_AC_FreeAll();
        return 0;
    }
    return 1;
}

int DWC_AC_Process(void) {
    u8 st = DWCi_AC_GetState();
    int r;
    if (st == 1) {
        st = DWCi_AC_Startup();
    } else if (st < 7) {
        OSIntrMode en = OS_DisableInterrupts();
        st = DWCi_AC_ProcessSearch();
        DWCi_AC_SetState(st);
        OS_RestoreInterrupts(en);
    } else if (st < 9) {
        st = DWCi_AC_ProcessConnect();
    } else if (st < 10) {
        st = DWCi_AC_ProcessEndSearch();
    } else if (st < 16) {
        st = DWCi_AC_ProcessConnected();
    } else if (st == 17) {
        st = DWCi_AC_ProcessError();
    }
    DWCi_AC_SetState(st);
    if (st == 16) {
        r = DWCi_AC_CompareApNamePrefix();
        DWCi_AC_FreeConnectWork();
        return r;
    }
    if (st != 18) {
        return 0;
    }
    DWCi_AC_FreeConnectWork();
    return -1;
}

int DWC_AC_GetStatus(void) {
    u8 st = DWCi_AC_GetState();
    if (st <= 1) {
        return 0;
    }
    if (st < 7) {
        return 1;
    }
    if (st == 9) {
        return 4;
    }
    if (st < 10) {
        return 2;
    }
    if (st == 11) {
        return 4;
    }
    if (st < 16) {
        return 3;
    }
    if (st == 16) {
        return 5;
    }
    if (st == 17) {
        return 4;
    }
    return DWCi_AC_GetErrorCode();
}

u8 DWC_AC_GetApType(void) {
    u8 r = 0xff;
    u8 st = DWCi_AC_GetState();
    if (st >= 10 && st <= 16) {
        r = DWCi_AC_Globals.ctx->apType;
    }
    return r;
}

int DWC_AC_GetApSpotInfo(void *dst) {
    int r = 0;
    u8 st = DWCi_AC_GetState();
    if (st >= 10 && st <= 16) {
        Ctx *ctx = DWCi_AC_Globals.ctx;
        if (ctx->apType == 4 || ctx->apType == 8) {
            MI_CpuCopy8(ctx->spotInfo, dst, 10);
            r = 1;
        }
    }
    return r;
}

int DWC_AC_Destroy(void) {
    u8 st = DWCi_AC_GetState();
    if (st == 0 || st == 18) {
        DWCi_AC_FreeAll();
        return 1;
    }
    DWCi_AC_CleanupStep(&st);
    DWCi_AC_SetState(st);
    return 0;
}

void DWCi_AC_SetSpecifiedApEx(const u8 *ssid, const void *key, int type, const void *name, int x) {
    Ctx *ctx = DWCi_AC_GetWork(1);
    if (name != NULL) {
        MI_CpuCopy8(name, ctx->spotInfo, 10);
    } else {
        MI_CpuFill8(ctx->spotInfo, 0, 10);
    }
    ctx->presetApType = x;
    DWCi_AC_SetSpecifiedAp(ssid, key, type);
}

void DWCi_AC_SetSpecifiedAp(const u8 *ssid, const void *key, int type) {
    ApConnectWork *w = DWCi_AC_GetWork(0x10);
    int i;
    int len;
    w->profileSel = 1;
    MI_CpuFill8(w, 0, 0xf0);
    for (i = 0; i < 0x20; i++) {
        u8 c = ssid[i];
        if (c == 0) {
            break;
        }
        w->profiles[0].ssid[i] = c;
    }
    if (key == NULL || type == 0) {
        w->profiles[0].wepKeyType = 0;
        return;
    }
    if (type == 1) {
        len = 5;
    } else if (type == 2) {
        len = 13;
    } else {
        len = 16;
    }
    MI_CpuCopy8(key, w->profiles[0].wepKey, len);
    w->profiles[0].wepKeyType = (u8)type;
}

void DWCi_AC_SetUserProfile(int idx, const void *src) {
    ApConnectWork *w = DWCi_AC_GetWork(0x10);
    MIi_CpuCopy32((const u32 *)src, (u32 *)&w->profiles[idx], 0xf0);
}

void *DWCi_AC_Alloc(int kind, int size) {
    Ctx *ctx = DWCi_AC_GetWork(1);
    if (ctx->flags & kind) {
        return NULL;
    }
    ctx->flags |= kind;
    return ctx->alloc(kind, size);
}

void DWCi_AC_Free(int kind, void *p, int size) {
    Ctx *ctx = DWCi_AC_GetWork(1);
    if (ctx == NULL) {
        return;
    }
    if (!(ctx->flags & kind)) {
        return;
    }
    ctx->flags &= ~kind;
    ctx->free(kind, p, size);
    if (kind == 1) {
        DWCi_AC_Globals.ctx = NULL;
    }
}

void DWCi_AC_FreeAll(void) {
    Ctx *ctx = DWCi_AC_GetWork(1);
    if (ctx == NULL) {
        return;
    }
    if (ctx->flags & 0x10) {
        void *p = DWCi_AC_GetWork(0x10);
        ctx->flags &= ~0x10;
        ctx->free(0x10, p, sizeof(ApConnectWork));
    }
    if (ctx->flags & 8) {
        void *p = DWCi_AC_GetWork(8);
        ctx->flags &= ~8;
        ctx->free(8, p, 0xc);
    }
    if (ctx->flags & 4) {
        void *p = DWCi_AC_GetWork(4);
        ctx->flags &= ~4;
        ctx->free(4, p, 0x58);
    }
    if (ctx->flags & 2) {
        void *p = DWCi_AC_GetWork(2);
        ctx->flags &= ~2;
        ctx->free(2, p, 0x2300);
    }
    if (ctx->flags & 1) {
        ctx->flags &= ~1;
        ctx->free(1, ctx, sizeof(Ctx));
        DWCi_AC_Globals.ctx = NULL;
    }
}

void *DWCi_AC_GetWork(int kind) {
    if (kind & 1) {
        return DWCi_AC_Globals.ctx;
    }
    if (kind & 2) {
        return DWCi_AC_Globals.p0;
    }
    if (kind & 4) {
        return DWCi_AC_Globals.p4;
    }
    if (kind & 8) {
        return DWCi_AC_Globals.p8;
    }
    if (kind & 0x10) {
        return DWCi_AC_Globals.work;
    }
    return NULL;
}

void DWCi_AC_SetState(u8 st) {
    Ctx *ctx = DWCi_AC_GetWork(1);
    ApConnectWork *w = DWCi_AC_GetWork(0x10);
    ctx->state = st;
    if (st >= 16) {
        return;
    }
    if (st > ctx->furthestState) {
        ctx->furthestState = st;
        if (st > 7) {
            ctx->failedApType = DWCi_AC_GetApTypeFromIndex(w->profileIdx);
            ctx->failedApStatus = w->ap[w->selAp].status;
        }
    }
}

u8 DWCi_AC_GetState(void) {
    Ctx *ctx = DWCi_AC_Globals.ctx;
    if (ctx != NULL) {
        return ctx->state;
    }
    return 0;
}

void DWCi_AC_SetError(int v) {
    Ctx *ctx = DWCi_AC_GetWork(1);
    ctx->errorReason = v;
    ctx->prevState = DWCi_AC_GetState();
}

int DWCi_AC_GetError(void) {
    return DWCi_AC_Globals.ctx->errorReason;
}

void DWCi_AC_SetConnectedApInfo(u8 x) {
    u8 v = DWCi_AC_Globals.ctx->presetApType;
    void *p;
    int i;
    if (v == 0) {
        v = DWCi_AC_GetApTypeFromIndex(x);
    }
    DWCi_AC_Globals.ctx->apType = v;
    p = WCM_GetApEssid(0);
    if (p != NULL) {
        DC_InvalidateRange(p, 0x20);
        DWCi_AC_GetShopSpotInfo(p, DWCi_AC_Globals.ctx->spotInfo);
    }
    for (i = 0; i < 10; i++) {
        if (DWCi_AC_Globals.ctx->spotInfo[i] < 0x20 || DWCi_AC_Globals.ctx->spotInfo[i] > 0x7e) {
            MI_CpuFill8(DWCi_AC_Globals.ctx->spotInfo, 0, 10);
            return;
        }
    }
}

u8 DWCi_AC_GetApTypeFromIndex(u8 x) {
    if (x > 2) {
        x -= 3;
    }
    return x;
}

void DWCi_AC_FreeConnectWork(void) {
    DWCi_AC_Free(8, DWCi_AC_Globals.p8, 0xc);
    DWCi_AC_Free(0x10, DWCi_AC_Globals.work, sizeof(ApConnectWork));
}

int DWCi_AC_CompareApNamePrefix(void) {
    u8 i;
    u8 cur;
    ApConnectWork *w;
    u8 n;
    w = DWCi_AC_Globals.work;
    cur = w->selAp;
    u8 st = w->profileIdx;
    char *cb = (char *)w->bss[cur].bssid;
    if (st >= 6) {
        return 1;
    }
    n = w->numAps;
    for (i = 0; i < n; i++) {
        if (i != cur && w->ap[i].index < 6) {
            if (strncmp(cb, (char *)w->bss[i].bssid, w->bss[i].ssidLength) == 0) {
                return 2;
            }
        }
    }
    return 1;
}

void DWCi_AC_FoundApCallback(ApBss *bss) {
    int idx = -1;
    u8 y;
    ApConnectWork *w = DWCi_AC_GetWork(0x10);
    ((Ctx *)DWCi_AC_GetWork(1))->apSeen = 1;
    switch (DWCi_AC_GetState()) {
    case 3:
        y = w->channel;
        if (bss->ssidLength == 0 || bss->ssid[0] == 0) {
            DWCi_AC_AddHiddenSsidChannel(bss->channel);
        } else if (bss->ssidLength == 1 && bss->ssid[0] == 0x20) {
            DWCi_AC_AddHiddenSsidChannel(bss->channel);
            idx = DWCi_AC_FindSsidEntry(bss, w->numEntries, w->entries);
        } else {
            idx = DWCi_AC_FindSsidEntry(bss, w->numEntries, w->entries);
        }
        break;
    case 4:
        y = w->bss[w->cur].channel - 1;
        idx = DWCi_AC_FindKnownSsid(bss, w);
        if (idx >= 0) {
            w->ap[w->cur].done = 1;
        }
        break;
    case 5:
        y = w->channel;
        idx = DWCi_AC_FindSsidEntry(bss, 1, &w->entries[w->cur]);
        if (idx >= 0) {
            w->entries[w->cur].flags = 1;
        }
        break;
    default:
        return;
    }
    if (idx < 0) {
        return;
    }
    DWCi_AC_SortFoundAp(DWCi_AC_AddFoundAp(idx, bss, y, w), w);
}

int DWCi_AC_MatchSpecialSsid(ApBss *ap) {
    ApConnectWork *w = DWCi_AC_GetWork(0x10);
    if ((w->profileSel == 0 || w->profileSel == 4) && ((ap->capability >> 4) & 1) == 1 && DWCi_AC_IsUsbApSsid(ap->ssid) == 1) {
        return 6;
    }
    if ((w->profileSel == 0 || w->profileSel == 5) && ((ap->capability >> 4) & 1) == 1 && DWCi_AC_IsShopSsid(ap->ssid) == 1) {
        return 7;
    }
    return -1;
}

int DWCi_AC_FindSsidEntry(ApBss *ap, int n, ApSsidEntry *s) {
    int i;
    u16 len;
    if (ap->ssidLength == 0x20) {
        int r = DWCi_AC_MatchSpecialSsid(ap);
        if (r > 0) {
            return r;
        }
    }
    i = 0;
    if (i < n) {
        len = ap->ssidLength;
        do {
            if ((u8)len == s->len && strncmp((char *)ap->ssid, s->ssid, len) == 0) {
                return s->index;
            }
            i++;
            s++;
        } while (i < n);
    }
    return -1;
}

int DWCi_AC_FindKnownSsid(ApBss *ap, ApConnectWork *w) {
    int i;
    u8 n;
    u16 len;
    if (ap->ssidLength == 0x20) {
        int r = DWCi_AC_MatchSpecialSsid(ap);
        if (r > 0) {
            return r;
        }
    }
    n = w->numAps;
    i = 0;
    if (i < n) {
        len = ap->ssidLength;
        do {
            if (len == w->bss[i].ssidLength && strncmp((char *)ap->ssid, (char *)w->bss[i].ssid, len) == 0) {
                return w->ap[i].index;
            }
            i++;
        } while (i < n);
    }
    return -1;
}

int DWCi_AC_AddFoundAp(int x, ApBss *bss, u8 y, ApConnectWork *w) {
    u8 n;
    int idx;
    int i;
    n = w->numAps;
    idx = -1;
    for (i = 0; i < n; i++) {
        u8 *b = w->bss[i].bssid;
        if (bss->bssid[0] == b[0] && bss->bssid[1] == b[1] && bss->bssid[2] == b[2] && bss->bssid[3] == b[3] && bss->bssid[4] == b[4] && bss->bssid[5] == b[5]) {
            idx = i;
            break;
        }
    }
    if (idx == -1) {
        DWCi_AC_StoreFoundAp((u8)x, bss, y, w);
        idx = 10;
        if (w->numAps < 10) {
            w->numAps++;
        }
    } else {
        DWCi_AC_UpdateFoundAp(idx, bss, y, w);
    }
    return idx;
}

void DWCi_AC_StoreFoundAp(u8 x, ApBss *bss, u8 y, ApConnectWork *w) {
    ApStatus *st = &w->ap[10];
    st->index = x;
    st->rssi = RSSI_CALC(bss->rssi);
    st->channel = y;
    MIi_CpuCopy32((const u32 *)bss, (u32 *)&w->bss[10], sizeof(ApBss));
}

void DWCi_AC_UpdateFoundAp(int idx, ApBss *bss, u8 y, ApConnectWork *w) {
    ApStatus *stats = w->ap;
    u8 *aps = (u8 *)w->bss;
    ApStatus *st = &stats[idx];
    int off = idx * sizeof(ApBss);
    int r = RSSI_CALC(bss->rssi);
    if ((u8)r > st->rssi) {
        st->rssi = r;
        st->channel = y;
    }
    MIi_CpuCopy32((const u32 *)bss, (u32 *)(aps + off), sizeof(ApBss));
}

void DWCi_AC_SortFoundAp(int i, ApConnectWork *w) {
    ApStatus tmp;
    ApBss tmpAp;
    int j;
    ApStatus *st = w->ap;
    ApBss *ap = w->bss;
    for (j = i - 1; j >= 0; j--) {
        if (st[i].rssi < st[j].rssi) {
            break;
        }
        MIi_CpuCopy32((const u32 *)&st[j], (u32 *)&tmp, 4);
        MIi_CpuCopy32((const u32 *)&st[i], (u32 *)&st[j], 4);
        MIi_CpuCopy32((const u32 *)&tmp, (u32 *)&st[i], 4);
        MIi_CpuCopy32((const u32 *)&ap[j], (u32 *)&tmpAp, sizeof(ApBss));
        MIi_CpuCopy32((const u32 *)&ap[i], (u32 *)&ap[j], sizeof(ApBss));
        MIi_CpuCopy32((const u32 *)&tmpAp, (u32 *)&ap[i], sizeof(ApBss));
        i = j;
    }
    MIi_CpuClear32(0, (u32 *)&st[10], 4);
    MIi_CpuClear32(0, (u32 *)&ap[10], sizeof(ApBss));
}

void DWCi_AC_WcmCallback(WcmEvent *ev) {
    ApConnectWork *w = DWCi_AC_GetWork(0x10);
    if (ev->notify == 5) {
        if (ev->result == 0) {
            return;
        }
        switch (ev->reason) {
        case 0xd:
            w->connectFailure = 1;
            return;
        case 0xf:
            w->connectFailure = 2;
            return;
        case 0x11:
            w->connectFailure = 3;
            return;
        default:
            w->connectFailure = 4;
            return;
        }
    } else if (ev->notify == 7) {
        DWCi_AC_FoundApCallback(ev->ptr);
    }
}

u8 DWCi_AC_ProcessConnect(void) {
    u8 st = DWCi_AC_GetState();
    ApConnectWork *w = DWCi_AC_GetWork(0x10);
    switch (st) {
    case 7:
        st = DWCi_AC_PrepareConnect(w);
        break;
    case 8:
        st = DWCi_AC_Connect(w);
        break;
    }
    return st;
}

u8 DWCi_AC_PrepareConnect(ApConnectWork *w) {
    ApBss *ap = &w->bss[w->selAp];
    w->profileIdx = DWCi_AC_SelectSsidIndex(w);
    MI_CpuFill8(w->connectConfig, 0, 0x52);
    if (DWCi_AC_MakeWepConfig(w, w->profileIdx, w->connectConfig)) {
        w->sharedKeyAuth = 1;
        if (!((ap->capability >> 4) & 1)) {
            w->ap[w->selAp].status = 3;
            return 9;
        }
        if (w->profileIdx == 6 && ((u8 *)ap)[0x15] == 0) {
            w->ap[w->selAp].status = 3;
            return 9;
        }
    } else {
        w->sharedKeyAuth = 0;
        if (((ap->capability >> 4) & 1) == 1) {
            w->ap[w->selAp].status = 3;
            return 9;
        }
    }
    w->chIter = 0;
    w->connectFailure = 0;
    return 8;
}

u8 DWCi_AC_Connect(ApConnectWork *w) {
    int ph = WCM_GetPhase();
    int off;
    u8 *aps;
    aps = (u8 *)w->bss;
    off = w->selAp * sizeof(ApBss);
    if (ph == 3) {
        u32 a = DWCi_AC_GetPowerOption(w);
        u8 c = ++w->chIter;
        if (c > 3) {
            w->chIter = 0;
            w->ap[w->selAp].status = 1;
            return 9;
        }
        if (c != 1) {
            if (w->connectFailure == 1) {
                w->sharedKeyAuth = 0;
            } else if (w->connectFailure == 2) {
                w->chIter = 0;
                w->ap[w->selAp].status = 3;
                return 9;
            } else if (w->connectFailure == 3) {
                w->chIter = 0;
                w->ap[w->selAp].status = 4;
                return 9;
            } else if (c == 3) {
                w->sharedKeyAuth = 0;
            }
        }
        WCM_ConnectAsync(aps + off, w->connectConfig, a | DWCi_AC_GetAuthOption(w));
    } else if (ph == 9) {
        w->chIter = 0;
        w->tick = OS_GetTick();
        return 10;
    }
    return 8;
}

u8 DWCi_AC_SelectSsidIndex(ApConnectWork *w) {
    ApBss *ap = &w->bss[w->selAp];
    int res = 0;
    int i;
    int cnt;
    if (w->mode == 0) {
        cnt = res;
        if (ap->ssidLength == 0x20) {
            res = DWCi_AC_MatchSpecialSsid(ap);
            if (res > 0) {
                cnt++;
            } else {
                res = 0;
            }
        } else if (ap->ssidLength == 8) {
            res = DWCi_AC_MatchFreeSpotSsid(ap);
            if (res != 0) {
                cnt++;
            } else {
                res = 0;
            }
        }
        for (i = 0; i < w->numEntries; i++) {
            if (ap->ssidLength == w->entries[i].len && strncmp((char *)ap->ssid, w->entries[i].ssid, ap->ssidLength) == 0) {
                if (cnt == 0) {
                    res = w->entries[i].index;
                } else {
                    w->entries[i].flagsHi = 1;
                    w->mode = 1;
                }
                cnt++;
            }
        }
    } else {
        i = res;
        cnt = res;
        for (; i < w->numEntries; i++) {
            if (w->entries[i].flagsHi == 1) {
                if (cnt == 0) {
                    w->entries[i].flagsHi = 0;
                    res = w->entries[i].index;
                }
                cnt++;
            }
        }
        if (cnt == 1) {
            w->mode = 0;
        }
    }
    return res;
}

u32 DWCi_AC_GetPowerOption(ApConnectWork *w) {
    return w->powerMode == 1 ? 0x30000 : 0x20000;
}

u32 DWCi_AC_GetAuthOption(ApConnectWork *w) {
    return w->sharedKeyAuth == 1 ? 0xc0000 : 0x80000;
}

BOOL DWCi_AC_MakeWepConfig(ApConnectWork *w, int kind, u8 *out) {
    u8 *p = (u8 *)w;
    switch (kind) {
    case 2:
        p += 0x100;
    case 1:
        p += 0x100;
    case 0:
        out[0] = ((ApProfile *)p)->wepKeyType;
        MI_CpuCopy8(((ApProfile *)p)->wepKey, out + 2, 16);
        break;
    case 5:
        p += 0x100;
    case 4:
        p += 0x100;
    case 3:
        out[0] = 1;
        MI_CpuCopy8(((ApProfile *)p)->wepKey + 0x51, out + 2, 5);
        break;
    case 6:
        out[0] = 2;
        DWCi_AC_GetUsbApWepKey(w->bss[w->selAp].ssid, out + 2);
        break;
    case 7:
        out[0] = 2;
        DWCi_AC_GetShopWepKey(w->bss[w->selAp].ssid, out + 2);
        break;
    case 8:
    case 9:
        break;
    }
    return out[0] != 0 ? TRUE : FALSE;
}

int DWCi_AC_CleanupStep(u8 *st) {
    if (*st <= 10) {
        int r = DWCi_AC_CleanupWcm();
        if (r == 1) {
            *st = 0;
            return 1;
        }
        if (r == -1) {
            *st = 18;
            return 1;
        }
    } else if (*st == 14) {
        DWCi_NetCheck_Abort();
        DWCi_NetCheck_Destroy();
        *st = 12;
    } else if (*st < 18) {
        if (DWCi_AC_CleanupSocket() == 1) {
            *st = 10;
        }
    }
    return 0;
}

int DWCi_AC_CleanupWcm(void) {
    switch (WCM_GetPhase()) {
    case 0:
        return 1;
    case 1:
        WCM_Finish();
        break;
    case 3:
        WCM_CleanupAsync();
        break;
    case 6:
        WCM_EndSearchAsync();
        break;
    case 9:
        WCM_DisconnectAsync();
        break;
    case 12:
        WCM_TerminateAsync();
        break;
    case 11:
        DWCi_AC_SetError(0);
        return -1;
    }
    return 0;
}

int DWCi_AC_CleanupSocket(void) {
    int r;
    if (SOCL_CalmDown()) {
        return 0;
    }
    r = SOC_Cleanup();
    return (r == 0 || r == -39) ? 1 : 0;
}

u8 DWCi_AC_ProcessError(void) {
    Ctx *ctx = DWCi_AC_GetWork(1);
    if (DWCi_AC_CleanupStep(&ctx->prevState) == 1) {
        return 18;
    }
    return 17;
}

int DWCi_AC_GetErrorCode(void) {
    Ctx *ctx = DWCi_AC_GetWork(1);
    int v = DWCi_AC_GetError();
    if (v < 4) {
        return DWCi_AC_GetSystemErrorCode(v);
    }
    if (v < 5) {
        return DWCi_AC_GetTerminatedErrorCode();
    }
    if (v == 5) {
        return DWCi_AC_GetApNotFoundErrorCode(ctx);
    }
    return DWCi_AC_GetConnectErrorCode(ctx);
}

int DWCi_AC_GetSystemErrorCode(int v) {
    switch (v) {
    case 1:
        return -9;
    case 0:
        return -10;
    case 2:
        return -8;
    case 3:
        return -7;
    }
    return 0;
}

int DWCi_AC_GetTerminatedErrorCode(void) {
    return -6;
}

int DWCi_AC_GetApNotFoundErrorCode(Ctx *c) {
    return c->apSeen == 0 ? -50099 : -51099;
}

static inline int c800(void) {
    return 51200;
}

static inline int defaultError(int reason) {
    return -c800() - reason;
}

#pragma opt_rebuildconditionals off

int DWCi_AC_GetConnectErrorCode(Ctx *p) {
    int reason = p->presetApType;
    unsigned int phase = p->furthestState;
    if (reason == 0) {
        reason = p->failedApType;
    }
    if (phase < 10) {
        if (p->failedApStatus == 3) {
            return -51100 - reason;
        }
        if (p->failedApStatus != 4) {
            return -51300 - reason;
        }
        return defaultError(reason);
    }
    if (phase < 13) {
        return -52000 - reason;
    }
    if (p->status == 0) {
        return -50000 - reason;
    }
    if (p->status == -1) {
        return -52100 - reason;
    }
    if (p->status == -2) {
        return -52200 - reason;
    }
    if (p->status == -3) {
        return -52300 - reason;
    }
    if (p->status == -4) {
        return -53000 - reason;
    }
    if (p->status == -5) {
        return -53100 - reason;
    }
    if (p->status == -6) {
        return -53200 - reason;
    }
    return p->status;
}

#pragma opt_rebuildconditionals reset

u8 DWCi_AC_MakeSsidList(int kind) {
    ApConnectWork *w = DWCi_AC_GetWork(0x10);
    switch (kind) {
    case 0:
        MIi_CpuClear32(0, (u32 *)w->entries, sizeof(w->entries));
        w->numEntries = DWCi_AC_MakeScanSsidList(w);
        break;
    case 1:
        w->numEntries = DWCi_AC_CountApsToRecheck(w);
        w->cur = DWCi_AC_GetFirstApToRecheck(w);
        break;
    case 2:
        MIi_CpuClear32(0, (u32 *)w->entries, sizeof(w->entries));
        w->cur = 0;
        w->numEntries = DWCi_AC_MakeProbeSsidList(w);
        break;
    }
    return w->numEntries;
}

int DWCi_AC_MatchFreeSpotSsid(ApBss *ap) {
    ApConnectWork *w = DWCi_AC_GetWork(0x10);
    if ((w->profileSel == 0 || w->profileSel == 6) && strncmp((char *)ap->ssid, DWCi_AC_FreeSpotSsid, 8) == 0) {
        return 8;
    }
    return 0;
}

u8 DWCi_AC_MakeScanSsidList(ApConnectWork *w) {
    ApSsidEntry *s = w->entries;
    u8 n = DWCi_AC_AddUserSsids(w);
    s += n;
    if (w->profileSel == 0 || w->profileSel == 6) {
        MI_CpuCopy8(DWCi_AC_FreeSpotSsid, s->ssid, 8);
        s->len = 8;
        s->index = 8;
        n++;
    }
    return n;
}

u8 DWCi_AC_MakeProbeSsidList(ApConnectWork *w) {
    u8 n;
    ApSsidEntry *s = w->entries;
    n = DWCi_AC_AddUserSsids(w);
    s += n;
    if (w->profileSel == 0 || w->profileSel == 4) {
        MI_CpuCopy8(DWCi_AC_UsbApProbeSsid, s->ssid, 8);
        s->len = 8;
        s->index = 6;
        n++;
        s++;
    }
    if (w->profileSel == 0 || w->profileSel == 7) {
        MI_CpuCopy8(DWCi_AC_WayportSsid, s->ssid, 8);
        s->len = 8;
        s->index = 9;
        n++;
        s++;
    }
    if (w->profileSel == 0 || w->profileSel == 8) {
        MI_CpuCopy8(DWCi_AC_NintendoWfcSsid, s->ssid, 11);
        s->len = 11;
        s->index = 10;
        n++;
    }
    return n;
}
