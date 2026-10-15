#pragma force_active on
#include "global.h"

#include "dwc/ap_connect_internal.h"

#include "dgt.h"
// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

typedef struct KeyTable {
    s8 *keys[4];
} KeyTable;

#define TICKS_TO_MS(t)  (((t) * 64) / 33514)
#define TICKS_TO_SEC(t) (((t) * 64) / 33514000)
extern void *DWCi_AC_GetWork(int id);
extern int DWCi_AC_GetState(void);
extern void DWCi_AC_SetError(int err);
extern int DWCi_AC_GetApTypeFromIndex(int idx);
extern void DWCi_AC_SetConnectedApInfo(int idx);
extern int DWCi_AC_MakeSsidList(int a);
extern u8 WCM_Bssid_Any[];
extern u8 WCM_Essid_Any[];
extern u32 DWCi_AC_ChannelOptionTable[];
extern void DWCi_AC_WcmCallback(void *arg);
extern int WCM_GetPhase(void);
extern int WCM_EndSearchAsync(void);
extern int WCM_DisconnectAsync(void);
extern int WCM_TerminateAsync(void);
extern int WCM_SearchAsync(void *bssid, void *ssid, u32 option);
extern int WCM_StartupAsync(void *config, void *cb);
extern int DWCi_NetCheck_Start(void *p);
extern void DWCi_NetCheck_Destroy(void);
extern void DWCi_NetCheck_Abort(void);
extern int DWCi_NetCheck_GetState(void);
extern u32 DWCi_NetCheck_GetError(void);
extern void *DWC_Alloc(int kind, u32 size);
extern void DWC_Free(int kind, void *p, int x);
extern u32 current_time(void);
extern void SocketStartUp(void);
extern int CanReceiveOnSocket(int sock);
extern int gsSocketCreate(int a, int b, int c);
extern void gsSocketClose(int sock);
extern int gsSocketRecvFrom(int sock, void *buf, int len, int flags, void *addr, int *addrlen);
extern int gsSocketSendTo(int sock, void *buf, int len, int flags, void *addr, int addrlen);
extern u32 gsSocketInetAddr(const char *s);
extern int gSoclState;
extern u8 DWCi_AC_SocketConfigTemplate[];
extern u8 DWCi_AC_ShopSsidPermutation[];
extern u8 DWCi_AC_ShopSsidPrefix[];
extern u8 DWCi_AC_UsbApSsidPrefix[];
extern KeyTable DWCi_AC_SsidKeyTable;
extern u8 DWCi_AC_UsbApKeyPermutation[];
extern u8 DWCi_AC_UsbApKeyNibbleTable[];
extern u8 DWCi_Beacon_Rc4KeyPrefix[];
extern char gsiAvailableCheckHostFormat[];
extern char gsiAvailableCheckResponseMagic[];
extern int SOC_Startup(void *cfg);
extern int SOC_Cleanup(void);
extern int SOCL_CalmDown(void);
extern u32 SOC_GetHostID(void);
extern void SOC_SetResolver(u32 *dns1, u32 *dns2);
extern void *SOC_GetHostByName(const char *name);
extern int sprintf(char *, const char *, ...);

typedef struct SocCfg {
    u32 u0;
    u32 u4;
    u32 u8;
    u32 useDhcp; // 0xc
    u32 ip;      // 0x10
    u32 mask;    // 0x14
    u32 gw;      // 0x18
    u32 dns1;    // 0x1c
    u32 dns2;    // 0x20
} SocCfg;

typedef struct WUnk1 {
    u8 unk0[0x10];
    u32 u10;
    u8 u14;
    u8 u15;
} WUnk1;

typedef struct Bytes24 {
    u8 b[24];
} Bytes24;

typedef struct WMEntry {
    u8 data[0x6e];
    u16 crc;
} WMEntry;

typedef struct WMScanParam {
    void *buf;          // 0x1300
    u16 bufSize;        // 0x1304
    u16 channelList;    // 0x1306
    u16 maxChannelTime; // 0x1308
    u8 bssid[6];        // 0x130a
    u16 scanType;       // 0x1310
    u8 unk12[0x32];
} WMScanParam;

typedef struct WGlobal {
    u8 wm[0xf00];
    u8 scanBuf[0x400];   // 0xf00
    WMScanParam param;   // 0x1300
    void (*cb)(void *);  // 0x1344
    WMEntry entries[16]; // 0x1348
    u16 u1a48[16];       // 0x1a48
    u16 u1a68[16];       // 0x1a68
    int count;           // 0x1a88
    int writeIdx;        // 0x1a8c
    u32 state;           // 0x1a90
    u16 crc;             // 0x1a94
    u16 crcTable[256];   // 0x1a96
} WGlobal;

extern WGlobal *DWCi_Beacon_Work;

typedef struct WScanBss {
    u16 length;
    u16 rssi; // 0x2
    u8 unk4[2];
    u8 b6[4]; // 0x6
    u8 unkA[0x36];
    u16 u40; // 0x40
    u16 unk42;
    u32 u44; // 0x44
    u16 u48; // 0x48
    u8 unk4A[6];
    u8 data[0x70]; // 0x50
} WScanBss;

typedef struct WScanCb {
    u16 apiid;
    u16 errcode; // 0x2
    u16 unk4;
    u16 unk6;
    u16 state; // 0x8
    u16 unkA;
    u16 unkC;
    u16 bssCount;      // 0xe
    WScanBss *bss[16]; // 0x10
} WScanCb;

extern u16 MATH_CalcCRC16(const MATHCRC16Table *table, const void *data, u32 len);
extern void DC_InvalidateRange(void *p, u32 size);
extern void CRYPTO_RC4FastInit(void *ctx, const void *key, u32 len);
extern void CRYPTO_RC4FastEncrypt(void *ctx, const void *src, u32 len, void *dst);

typedef struct WOut {
    u32 valid;
    u16 u4;
    u8 data[0x70];
    u8 pad[2];
} WOut;

typedef struct HEntry {
    u32 valid;     // 0x00
    u16 rssi;      // 0x04
    u8 name[0x20]; // 0x06
    u8 key[10];    // 0x26
    u8 unk30[0x1a];
    u8 pass[0x20]; // 0x4a
    u8 unk6a;
    u8 mode;  // 0x6b
    u8 flags; // 0x6c
    u8 unk6d[0xb];
} HEntry;

typedef struct HDest {
    u8 name[0x20];
    u8 pass[0x20];
    u32 mode;
    u8 key[10];
} HDest;

typedef struct HA {
    HDest *dest;
    u32 tick[2];
    HEntry entries[16];
    int best;
} HA;

typedef struct HState {
    HA *a;
    void *b;
    int state;
} HState;

extern HState DWCi_Beacon_ApSearch;

typedef struct NSockAddr {
    u8 len;
    u8 family;
    u16 port;
    u32 addr;
} NSockAddr;

typedef struct IState {
    int state;      // 0x00
    int sock;       // 0x04
    NSockAddr addr; // 0x08
    u8 buf[0x40];   // 0x10
    int len;        // 0x50
    u32 time;       // 0x54
    int retries;    // 0x58
} IState;

extern IState ov00_0221B0D0;
extern NSockAddr ov00_0221B0D8;
extern u8 ov00_0221B0DC[];
extern u8 ov00_0221B0E0[];
extern u8 ov00_0221B0E5[];
extern s8 GSIACHostname[];
extern char __GSIACGamename[];
extern int WM_Initialize(void *wm, void *cb, int dma);
extern int WM_End(void *cb);
extern u16 WM_GetAllowedChannel(void);
extern u16 WM_GetDispersionScanPeriod(void);
extern int WM_StartScanEx(void *cb, void *param);
extern int WM_EndScan(void *cb);
#pragma warn_unusedvar off

static inline BOOL CopySsid(ApSsidEntry *e, u8 *ssid, s32 idx);
int DWCi_AC_AddUserSsids(ApConnectWork *ctx);
int DWCi_AC_CountApsToRecheck(ApConnectWork *ctx);
int DWCi_AC_GetFirstApToRecheck(ApConnectWork *ctx);
int DWCi_AC_ProcessEndSearch(void);
int DWCi_AC_ProcessSearch(void);
void DWCi_AC_AddHiddenSsidChannel(u32 ch);
s8 DWCi_AC_GetHiddenSsidChannel(int n);
void DWCi_AC_StartSearchState(int state);
int DWCi_AC_StartScan(ApConnectWork *ctx);
int DWCi_AC_ScanChannels(ApConnectWork *ctx);
int DWCi_AC_RetrySearch(ApConnectWork *ctx);
int DWCi_AC_RecheckAps(ApConnectWork *ctx);
int DWCi_AC_ProbeHiddenChannels(ApConnectWork *ctx);
int DWCi_AC_NextSearchState(ApConnectWork *ctx, int state);
int DWCi_AC_SelectAp(ApConnectWork *ctx, int state);
int DWCi_AC_StartProbeOrRetry(ApConnectWork *ctx);
int DWCi_AC_SearchAsync(void *bssid, void *ssid, int ch, u32 option);
int DWCi_AC_Startup(void);
int DWCi_AC_ProcessConnected(void);
int DWCi_AC_StartSocket(ApConnectWork *ctx);
int DWCi_AC_WaitHostId(ApConnectWork *ctx);
int DWCi_AC_StartNetCheck(void);
int DWCi_AC_WaitNetCheck(ApConnectWork *ctx);
int DWCi_AC_FinishConnect(ApConnectWork *ctx);
int DWCi_AC_CleanupFailedAp(void);
void DWCi_AC_MakeSocketConfig(u32 *src, ApConnectWork *ctx, SocCfg *cfg);
u32 DWCi_AC_BytesToIpAddr(u8 *b);
u32 DWCi_AC_PrefixToNetmask(int prefix);
void DWCi_AC_SetDnsServers(ApConnectWork *ctx);
int DWCi_AC_IsShopSsid(u8 *src);
void DWCi_AC_GetShopWepKey(u8 *src, u8 *out);
void DWCi_AC_GetShopSpotInfo(u8 *src, u8 *out);
int DWCi_AC_IsUsbApSsid(u8 *src);
void DWCi_AC_GetUsbApWepKey(u8 *src, u8 *dst);
void DWCi_AC_DecodeShopSsid(u8 *src, u8 *dst);
void DWCi_AC_MakeShopWepKey(u8 *src, u8 *out);
void DWCi_AC_DecodeUsbApWepKey(u8 *src, u8 *dst);
int DWCi_AC_Base64CharValue(u8 c);
int DWCi_AC_Base64Decode(u8 *input, u8 *output, u32 count, u32 capacity);
u8 DWCi_Beacon_RssiToLinkLevel(int x);
void DWCi_Beacon_ScanCallback(void *argp);
u32 DWCi_Beacon_GetWorkSize(void);
int DWCi_Beacon_Init(void *buf, void *cb, int dma);
int DWCi_Beacon_End(void *cb);
int DWCi_Beacon_StartScan(void (*cb)(void *));
int DWCi_Beacon_EndScan(void *cb);
int DWCi_Beacon_GetEntry(int idx, WOut *out);
int DWCi_Beacon_GetEntries(void *outp);
int DWCi_Beacon_StartApSearch(HDest *x);
int DWCi_Beacon_ProcessApSearch(void);
void DWCi_Beacon_FreeApSearch(void);
int DWCi_IsPrintableSpotInfo(u8 *s);
void DWCi_Beacon_InitCallback(void *arg);
void DWCi_Beacon_ScanDoneCallback(void *arg);
void DWCi_Beacon_EndScanCallback(void *arg);
void DWCi_Beacon_EndCallback(void *arg);
void DWCi_Beacon_EndErrorCallback(void *arg);
int gsiAvailableCheckGetAddress(const char *host, int port, NSockAddr *addr);
void gsiAvailableCheckSendPacket(void);
void GSIStartAvailableCheck(char *name);
int gsiAvailableCheckParseResponse(s8 *buf, int len, NSockAddr *from, u32 *out);

static inline BOOL CopySsid(ApSsidEntry *e, u8 *ssid, s32 idx) {
    u8 j;
    for (j = 0; j < 32; j++) {
        if (ssid[j] == 0) {
            break;
        }
        e->ssid[j] = ssid[j];
    }
    if (j != 0) {
        e->len = j;
        e->index = idx;
        return TRUE;
    }
    return FALSE;
}

int DWCi_AC_AddUserSsids(ApConnectWork *ctx) {
    int i;
    u8 count = 0;
    ApProfile *p = ctx->profiles;
    ApSsidEntry *e = ctx->entries;

    for (i = 0; i < 3; i++, p++) {
        if (ctx->profileSel != 0 && ctx->profileSel != i + 1) {
            continue;
        }
        if (p->wepMode == 0xFF) {
            continue;
        }
        if (CopySsid(e, p->ssid, i)) {
            count++;
            e++;
        }
        if (p->wepMode == 1) {
            if (CopySsid(e, p->ssid2, i + 3)) {
                count++;
                e++;
            }
        }
    }
    return count;
}

int DWCi_AC_CountApsToRecheck(ApConnectWork *ctx) {
    int i;
    u8 count = 0;
    for (i = 0; i < ctx->numAps; i++) {
        if (ctx->ap[i].status == 0 && ctx->bss[i].channel - 1 != ctx->ap[i].channel) {
            ctx->ap[i].done = 0;
            count++;
        } else {
            ctx->ap[i].done = 1;
        }
    }
    return count;
}

int DWCi_AC_GetFirstApToRecheck(ApConnectWork *ctx) {
    u8 i;
    u8 result = 0;
    u8 n = ctx->numAps;
    for (i = 0; i < n; i++) {
        if (ctx->ap[i].done == 0) {
            result = i;
            break;
        }
    }
    return result;
}

int DWCi_AC_ProcessEndSearch(void) {
    ApConnectWork *ctx = DWCi_AC_GetWork(0x10);
    u32 state = 9;
    switch (WCM_GetPhase()) {
    case 3:
        state = ctx->nextState;
        if (ctx->mode == 1) {
            state = 7;
            ctx->ap[ctx->selAp].status = 0;
        } else if (state >= 3 && state <= 5) {
            DWCi_AC_StartSearchState(state);
        }
        break;
    case 6:
        WCM_EndSearchAsync();
        break;
    case 9:
        WCM_DisconnectAsync();
        break;
    case 12:
        WCM_TerminateAsync();
        DWCi_AC_SetError(4);
        state = 0x11;
        break;
    case 11:
        DWCi_AC_SetError(0);
        state = 0x11;
        break;
    }
    return state;
}

int DWCi_AC_ProcessSearch(void) {
    ApConnectWork *ctx = DWCi_AC_GetWork(0x10);
    int state = DWCi_AC_GetState();
    int phase = WCM_GetPhase();
    if (state == 2 && phase == 3) {
        state = DWCi_AC_StartScan(ctx);
    } else if (state == 6) {
        state = DWCi_AC_SelectAp(ctx, state);
    } else if (phase == 3 || phase == 6) {
        state = DWCi_AC_SelectAp(ctx, state);
        if (state != 7) {
            if (state == 3) {
                state = DWCi_AC_ScanChannels(ctx);
            } else if (state == 4) {
                state = DWCi_AC_RecheckAps(ctx);
            } else if (state == 5) {
                state = DWCi_AC_ProbeHiddenChannels(ctx);
            }
        }
    }
    return state;
}

void DWCi_AC_AddHiddenSsidChannel(u32 ch) {
    ApConnectWork *ctx = DWCi_AC_GetWork(0x10);
    if (ch > 13) {
        ch = 13;
    }
    ctx->chMask |= 1 << (ch - 1);
}

s8 DWCi_AC_GetHiddenSsidChannel(int n) {
    ApConnectWork *ctx = DWCi_AC_GetWork(0x10);
    u16 mask = ctx->chMask;
    u8 i;
    u8 k;
    if (mask == 0) {
        return -1;
    }
    for (i = 0, k = 0; i < 13; i++) {
        if (mask & (1 << i)) {
            if (k == n) {
                return (s8)i;
            }
            k++;
        }
    }
    return -1;
}

void DWCi_AC_StartSearchState(int state) {
    ApConnectWork *ctx = DWCi_AC_GetWork(0x10);
    switch (state) {
    case 3:
        ctx->tick = OS_GetTick();
        DWCi_AC_SearchAsync(WCM_Bssid_Any, WCM_Essid_Any, ctx->channel, 0x200000);
        break;
    case 4:
        ctx->tick = OS_GetTick();
        DWCi_AC_SearchAsync(ctx->bss[ctx->cur].bssid, ctx->bss[ctx->cur].ssid, ctx->bss[ctx->cur].channel - 1, 0x300000);
        break;
    case 5:
        ctx->tick = OS_GetTick();
        DWCi_AC_SearchAsync(WCM_Bssid_Any, ctx->entries[ctx->cur].ssid, ctx->channel, 0x300000);
        break;
    }
}

int DWCi_AC_StartScan(ApConnectWork *ctx) {
    ctx->tick = OS_GetTick();
    ctx->channel = 0;
    ctx->tick = OS_GetTick();
    DWCi_AC_SearchAsync(WCM_Bssid_Any, WCM_Essid_Any, ctx->channel, 0x200000);
    return 3;
}

int DWCi_AC_ScanChannels(ApConnectWork *ctx) {
    if (TICKS_TO_MS(OS_GetTick() - ctx->tick) >= 300) {
        ctx->channel += 2;
        if (ctx->channel >= 13) {
            return DWCi_AC_NextSearchState(ctx, 3);
        }
        ctx->tick = OS_GetTick();
        DWCi_AC_SearchAsync(WCM_Bssid_Any, WCM_Essid_Any, ctx->channel, 0x200000);
    }
    return 3;
}

int DWCi_AC_RetrySearch(ApConnectWork *ctx) {
    ctx->chIter = 0;
    ctx->retry++;
    DWCi_AC_MakeSsidList(0);
    ctx->channel = 1;
    return 3;
}

int DWCi_AC_RecheckAps(ApConnectWork *ctx) {
    if (TICKS_TO_MS(OS_GetTick() - ctx->tick) >= 150 || ctx->ap[ctx->cur].done == 1) {
        ctx->ap[ctx->cur].done = 1;
        for (; ctx->cur < ctx->numAps; ctx->cur++) {
            if (!ctx->ap[ctx->cur].done) {
                break;
            }
        }
        if (ctx->numAps <= ctx->cur) {
            ctx->cur = 0;
            return DWCi_AC_NextSearchState(ctx, 4);
        }
        ctx->tick = OS_GetTick();
        DWCi_AC_SearchAsync(ctx->bss[ctx->cur].bssid, ctx->bss[ctx->cur].ssid, ctx->bss[ctx->cur].channel - 1, 0x300000);
    }
    return 4;
}

int DWCi_AC_ProbeHiddenChannels(ApConnectWork *ctx) {
    if (TICKS_TO_MS(OS_GetTick() - ctx->tick) >= 150 || ctx->entries[ctx->cur].flags == 1) {
        ctx->entries[ctx->cur].flags = 0;
        ctx->cur++;
        if (ctx->numEntries <= ctx->cur) {
            ctx->chIter++;
            ctx->cur = 0;
            ctx->channel = DWCi_AC_GetHiddenSsidChannel(ctx->chIter);
        }
        if (ctx->channel < 0) {
            ctx->chIter = 0;
            return DWCi_AC_NextSearchState(ctx, 5);
        }
        ctx->tick = OS_GetTick();
        DWCi_AC_SearchAsync(WCM_Bssid_Any, ctx->entries[ctx->cur].ssid, ctx->channel, 0x300000);
    }
    return 5;
}

int DWCi_AC_NextSearchState(ApConnectWork *ctx, int state) {
    switch (state) {
    case 3:
        if (ctx->numAps != 0 || ctx->chMask != 0) {
            if (DWCi_AC_MakeSsidList(1)) {
                state = 4;
            } else {
                state = DWCi_AC_StartProbeOrRetry(ctx);
            }
        } else if (ctx->retry >= 1) {
            state = 6;
        } else {
            state = DWCi_AC_RetrySearch(ctx);
        }
        break;
    case 4:
        state = DWCi_AC_StartProbeOrRetry(ctx);
        break;
    case 5:
        if (ctx->retry >= 1) {
            state = 6;
        } else {
            state = DWCi_AC_RetrySearch(ctx);
        }
        break;
    }
    DWCi_AC_StartSearchState(state);
    return state;
}

int DWCi_AC_SelectAp(ApConnectWork *ctx, int state) {
    u8 i;
    u8 n;
    if (state == 0x11) {
        return state;
    }
    n = ctx->numAps;
    for (i = 0; i < n; i++) {
        if (ctx->ap[i].status == 0) {
            break;
        }
    }
    if (state == 6) {
        if (n == i) {
            if (i == 0) {
                DWCi_AC_SetError(5);
            } else {
                DWCi_AC_SetError(6);
            }
            return 0x11;
        }
    } else {
        if (n == 0) {
            return state;
        }
        if (n == i) {
            return state;
        }
        if (ctx->ap[i].rssi < 20) {
            return state;
        }
    }
    ctx->selAp = i;
    if (WCM_EndSearchAsync() != 1) {
        ctx->nextState = state;
        state = 7;
    }
    return state;
}

int DWCi_AC_StartProbeOrRetry(ApConnectWork *ctx) {
    if (ctx->chMask != 0 && DWCi_AC_MakeSsidList(2)) {
        ctx->channel = DWCi_AC_GetHiddenSsidChannel(0);
        return 5;
    }
    if (ctx->retry >= 1) {
        return 6;
    }
    return DWCi_AC_RetrySearch(ctx);
}

int DWCi_AC_SearchAsync(void *bssid, void *ssid, int ch, u32 option) {
    if (ch > 12) {
        ch = 12;
    }
    return WCM_SearchAsync(bssid, ssid, option | DWCi_AC_ChannelOptionTable[ch]);
}

int DWCi_AC_Startup(void) {
    int phase = WCM_GetPhase();
    ApConnectWork *ctx = DWCi_AC_GetWork(0x10);
    u32 cfg[4];
    int rc;
    if (phase == 1) {
        cfg[0] = ctx->dmaNo;
        cfg[1] = 0;
        cfg[2] = 0;
        cfg[3] = 0;
        DWCi_AC_MakeSsidList(0);
        rc = WCM_StartupAsync(cfg, DWCi_AC_WcmCallback);
        if (rc == 1 || rc >= 4) {
            DWCi_AC_SetError(1);
            return 0x11;
        }
    } else {
        return 1;
    }
    return 2;
}

int DWCi_AC_ProcessConnected(void) {
    int state = DWCi_AC_GetState();
    ApConnectWork *ctx = DWCi_AC_GetWork(0x10);
    if (WCM_GetPhase() == 9) {
        switch (state) {
        case 10:
            state = DWCi_AC_StartSocket(ctx);
            break;
        case 12:
            state = DWCi_AC_WaitHostId(ctx);
            break;
        case 13:
            state = DWCi_AC_StartNetCheck();
            break;
        case 14:
            state = DWCi_AC_WaitNetCheck(ctx);
            break;
        case 15:
            state = DWCi_AC_FinishConnect(ctx);
            break;
        case 11:
            state = DWCi_AC_CleanupFailedAp();
            break;
        }
    } else {
        switch (state) {
        case 15:
            state = DWCi_AC_FinishConnect(ctx);
            break;
        case 11:
            state = DWCi_AC_CleanupFailedAp();
            break;
        case 14:
            DWCi_NetCheck_Abort();
            DWCi_NetCheck_Destroy();
        default:
            ctx->ap[ctx->selAp].status = 2;
            state = 11;
            break;
        }
    }
    return state;
}

int DWCi_AC_StartSocket(ApConnectWork *ctx) {
    u32 *a = DWCi_AC_GetWork(1);
    SocCfg *b = DWCi_AC_GetWork(4);
    DWCi_AC_MakeSocketConfig(a, ctx, b);
    gSoclState = 4;
    if (SOC_Startup(b) == 0) {
        return 12;
    }
    DWCi_AC_SetError(2);
    return 0x11;
}

int DWCi_AC_WaitHostId(ApConnectWork *ctx) {
    if (SOC_GetHostID()) {
        DWCi_AC_SetDnsServers(ctx);
        return ctx->skipNetCheck == 1 ? 15 : 13;
    }
    if (TICKS_TO_SEC(OS_GetTick() - ctx->tick) < 10) {
        return 12;
    }
    ctx->ap[ctx->selAp].status = 1;
    return 11;
}

int DWCi_AC_StartNetCheck(void) {
    if (!DWCi_NetCheck_Start(DWCi_AC_GetWork(8))) {
        return 14;
    }
    DWCi_AC_SetError(3);
    return 0x11;
}

int DWCi_AC_WaitNetCheck(ApConnectWork *ctx) {
    WUnk1 *p = DWCi_AC_GetWork(1);
    int rc = DWCi_NetCheck_GetState();
    if (rc) {
        if (p->u15 == DWCi_AC_GetApTypeFromIndex(ctx->profileIdx)) {
            p->u10 = DWCi_NetCheck_GetError();
        }
        DWCi_NetCheck_Destroy();
        if (rc == 11) {
            return 15;
        }
        ctx->ap[ctx->selAp].status = 1;
        return 11;
    }
    return 14;
}

int DWCi_AC_FinishConnect(ApConnectWork *ctx) {
    DWCi_AC_SetConnectedApInfo(ctx->profileIdx);
    return 16;
}

int DWCi_AC_CleanupFailedAp(void) {
    int rc;
    if (SOCL_CalmDown()) {
        return 11;
    }
    rc = SOC_Cleanup();
    return (rc == 0 || rc == -39) ? 9 : 11;
}

void DWCi_AC_MakeSocketConfig(u32 *src, ApConnectWork *ctx, SocCfg *cfg) {
    ApProfile *p;
    MI_CpuCopy8(DWCi_AC_SocketConfigTemplate, cfg, 0x58);
    cfg->u4 = src[0];
    cfg->u8 = src[1];
    if (ctx->profileIdx >= 6) {
        return;
    }
    p = &ctx->profiles[DWCi_AC_GetApTypeFromIndex(ctx->profileIdx)];
    if (p->ip[0]) {
        cfg->useDhcp = 0;
        cfg->ip = DWCi_AC_BytesToIpAddr(p->ip);
        cfg->mask = DWCi_AC_PrefixToNetmask(p->prefix);
        cfg->gw = DWCi_AC_BytesToIpAddr(p->gateway);
        cfg->dns1 = DWCi_AC_BytesToIpAddr(p->dns1);
        cfg->dns2 = DWCi_AC_BytesToIpAddr(p->dns2);
    } else {
        cfg->useDhcp = 1;
        cfg->ip = 0;
        cfg->mask = 0;
        cfg->gw = 0;
        cfg->dns1 = 0;
        cfg->dns2 = 0;
    }
}

#define SWAP32(v) ((((v) >> 24) & 0xFF) | (((v) >> 8) & 0xFF00) | (((v) << 8) & 0xFF0000) | (((v) << 24) & 0xFF000000))

u32 DWCi_AC_BytesToIpAddr(u8 *b) {
    u32 v = 0;
    v |= b[0] << 24;
    v |= b[1] << 16;
    v |= b[2] << 8;
    v |= b[3];
    return SWAP32(v);
}

u32 DWCi_AC_PrefixToNetmask(int prefix) {
    int i;
    int n = 32 - prefix;
    u32 mask = 0xFFFFFFFF;
    for (i = 0; i < n; i++) {
        mask <<= 1;
    }
    return SWAP32(mask);
}

void DWCi_AC_SetDnsServers(ApConnectWork *ctx) {
    u32 dns1;
    u32 dns2;
    ApProfile *p;
    int sum;
    u16 first;
    if (ctx->profileIdx >= 6) {
        return;
    }
    p = &ctx->profiles[DWCi_AC_GetApTypeFromIndex(ctx->profileIdx)];
    first = (u32)p->dns1[0];
    sum = (u8)first + p->dns1[1] + p->dns1[2] + p->dns1[3];
    if (p->ip[0] != 0) {
        return;
    }
    if (sum == 0) {
        return;
    }
    dns1 = DWCi_AC_BytesToIpAddr(p->dns1);
    dns2 = DWCi_AC_BytesToIpAddr(p->dns2);
    SOC_SetResolver(&dns1, &dns2);
}

int DWCi_AC_IsShopSsid(u8 *src) {
    u8 buf[0x18];
    DWCi_AC_DecodeShopSsid(src, buf);
    return memcmp(buf, DWCi_AC_ShopSsidPrefix, 8) == 0;
}

void DWCi_AC_GetShopWepKey(u8 *src, u8 *out) {
    u8 buf[0x18];
    DWCi_AC_DecodeShopSsid(src, buf);
    DWCi_AC_MakeShopWepKey(buf, out);
}

void DWCi_AC_GetShopSpotInfo(u8 *src, u8 *out) {
    u8 buf[0x18];
    DWCi_AC_DecodeShopSsid(src, buf);
    if (memcmp(buf, DWCi_AC_ShopSsidPrefix, 8)) {
        return;
    }
    MI_CpuCopy8(buf + 8, out, 10);
}

int DWCi_AC_IsUsbApSsid(u8 *src) {
    return memcmp(src, DWCi_AC_UsbApSsidPrefix, 8) == 0;
}

void DWCi_AC_GetUsbApWepKey(u8 *src, u8 *dst) {
    DWCi_AC_DecodeUsbApWepKey(src + 0xc, dst);
}

void DWCi_AC_DecodeShopSsid(u8 *src, u8 *dst) {
    Bytes24 tbl = *(Bytes24 *)DWCi_AC_ShopSsidPermutation;
    int i;
    u8 j;
    u8 k;
    u8 t;
    u8 next;
    u8 *old;
    DWCi_AC_Base64Decode(src, dst, 0x20, 0x18);
    for (i = 0; i < 0x18; i++) {
        dst[i] ^= DWCi_AC_SsidKeyTable.keys[2][i];
    }
    for (i = 0; i < 0x18; i++) {
        j = i;
        k = j;
        t = dst[i];
        while (tbl.b[j] != 0xFF) {
            old = &tbl.b[k];
            k = *old;
            next = dst[k];
            dst[tbl.b[j]] = t;
            *old = 0xFF;
            j = k;
            t = next;
        }
    }
    for (i = 0; i < 0x18; i++) {
        dst[i] ^= DWCi_AC_SsidKeyTable.keys[0][i];
    }
}

void DWCi_AC_MakeShopWepKey(u8 *src, u8 *out) {
    struct DGTHash1Context ctx;
    u8 digest[20];
    DGT_Hash1Reset(&ctx);
    DGT_Hash1SetSource(&ctx, src, 0x18);
    DGT_Hash1GetDigest_R(digest, &ctx);
    MI_CpuCopy8(digest + 3, out, 13);
}

void DWCi_AC_DecodeUsbApWepKey(u8 *src, u8 *dst) {
    int i;
    u8 tmp[13];
    u8 *p;
    u8 *q;
    int v;
    for (i = 0; i < 13; i++) {
        dst[i] = src[i] ^ src[0xd + i % 7];
    }
    for (i = 0; i < 7; i++) {
        dst[3 + i] ^= src[0xd + i];
    }
    for (i = 0; i < 13; i++) {
        dst[i] ^= DWCi_AC_SsidKeyTable.keys[1][i];
    }
    MI_CpuCopy8(dst, tmp, 13);
    for (i = 0; i < 13; i++) {
        dst[DWCi_AC_UsbApKeyPermutation[i]] = tmp[i];
    }
    for (i = 0; i < 13; i++) {
        dst[i] ^= DWCi_AC_SsidKeyTable.keys[3][i];
    }
    for (i = 0; i < 13; i++) {
        v = dst[i];
        dst[i] = (DWCi_AC_UsbApKeyNibbleTable[(v >> 4) & 0xF] << 4) | DWCi_AC_UsbApKeyNibbleTable[v & 0xF];
    }
    for (i = 0; i < 3; i++) {
        dst[i] ^= dst[i + 6];
        dst[i + 3] ^= dst[i + 9];
        dst[i + 6] ^= dst[i + 3];
        dst[i + 9] ^= dst[i];
        dst[12] ^= dst[i];
    }
}

int DWCi_AC_Base64CharValue(u8 c) {
    if (c >= 'A' && c <= 'Z') {
        return c - 'A';
    }
    if (c >= 'a' && c <= 'z') {
        return c - 'a' + 26u;
    }
    if (c >= '0' && c <= '9') {
        return c - '0' + 52u;
    }
    if (c == '+') {
        return 62;
    }
    if (c == '/') {
        return 63;
    }
    return -(c != '=');
}

int DWCi_AC_Base64Decode(u8 *input, u8 *output, u32 count, u32 capacity) {
    u32 tmp;
    u32 tail;
    int k;
    u32 acc;
    int i;
    int remain;
    int whole;
    int size = (count * 3) >> 2;
    int j;
    if (capacity >= (count * 3) >> 2) {
        remain = count & 3;
        whole = count - remain;
    } else {
        return -1;
    }
    for (i = 0; i < whole; i += 4) {
        acc = 0;
        for (j = 0; j < 4; j++) {
            acc |= DWCi_AC_Base64CharValue(input[i + j]) << ((3 - j) * 6);
        }
        tmp = acc;
        for (k = 0; k < 3; k++) {
            output[(i / 4) * 3 + k] = ((u8 *)&tmp)[2 - k];
        }
    }
    if (remain) {
        tail = 0;
        acc = 0;
        for (j = 0; j < remain; j++) {
            acc |= DWCi_AC_Base64CharValue(input[whole + j]) << ((3 - j) * 6);
            tail |= acc;
        }
        for (k = 0; k < remain; k++) {
            output[(whole * 3) / 4 + k] = ((u8 *)&tail)[2 - k];
        }
    }
    return size;
}

u8 DWCi_Beacon_RssiToLinkLevel(int x) {
    int r = x >> 2;
    if (!(x & 2)) {
        r += 25;
    }
    return r;
}

void DWCi_Beacon_ScanCallback(void *argp) {
    WScanCb *arg = argp;
    u8 key[8];
    u8 rc4[0x408];
    u32 j;
    int found;
    u32 i;
    u16 crc;
    WMEntry *entry;
    DC_InvalidateRange(DWCi_Beacon_Work->scanBuf, 0x400);
    if (arg->errcode == 0 && arg->state == 5) {
        for (i = 0; i < arg->bssCount; i++) {
            if (arg->bss[i]->u40 == 1 && arg->bss[i]->u44 == 0x857) {
                found = 0;
                for (j = 0; j < DWCi_Beacon_Work->count; j++) {
                    if (DWCi_Beacon_Work->u1a68[j] == arg->bss[i]->u48) {
                        found = 1;
                        break;
                    }
                }
                if (found == 1) {
                    continue;
                }
                MI_CpuCopy8(arg->bss[i]->data, &DWCi_Beacon_Work->entries[DWCi_Beacon_Work->writeIdx], 0x70);
                MI_CpuCopy8(DWCi_Beacon_Rc4KeyPrefix, key, 4);
                MI_CpuCopy8(arg->bss[i]->b6, key + 4, 4);
                CRYPTO_RC4FastInit(rc4, key, 8);
                CRYPTO_RC4FastEncrypt(rc4, &DWCi_Beacon_Work->entries[DWCi_Beacon_Work->writeIdx], 0x70, &DWCi_Beacon_Work->entries[DWCi_Beacon_Work->writeIdx]);
                entry = &DWCi_Beacon_Work->entries[DWCi_Beacon_Work->writeIdx];
                MATHi_CRC16UpdateRev((MATHCRC16Table *)DWCi_Beacon_Work->crcTable, (MATHCRC16Context *)&DWCi_Beacon_Work->crc, entry, 0x6e);
                crc = MATH_CalcCRC16((MATHCRC16Table *)DWCi_Beacon_Work->crcTable, entry, 0x6e);
                if (crc != DWCi_Beacon_Work->entries[DWCi_Beacon_Work->writeIdx].crc && DWCi_Beacon_Work->entries[DWCi_Beacon_Work->writeIdx].crc != 0) {
                    MI_CpuFill8(&DWCi_Beacon_Work->entries[DWCi_Beacon_Work->writeIdx], 0, 0x70);
                    continue;
                }
                DWCi_Beacon_Work->u1a48[DWCi_Beacon_Work->writeIdx] = DWCi_Beacon_RssiToLinkLevel((u8)arg->bss[i]->rssi);
                DWCi_Beacon_Work->u1a68[DWCi_Beacon_Work->writeIdx] = arg->bss[i]->u48;
                DWCi_Beacon_Work->writeIdx = (DWCi_Beacon_Work->writeIdx + 1) % 16;
                DWCi_Beacon_Work->count++;
                if (DWCi_Beacon_Work->count > 16) {
                    DWCi_Beacon_Work->count = 16;
                }
            }
        }
    }
    DWCi_Beacon_Work->state = 2;
    if (DWCi_Beacon_Work->cb) {
        DWCi_Beacon_Work->cb(arg);
    }
}

u32 DWCi_Beacon_GetWorkSize(void) {
    return 0x1CA0;
}

int DWCi_Beacon_Init(void *buf, void *cb, int dma) {
    int rc;
    if (!cb) {
        return -1;
    }
    DWCi_Beacon_Work = buf;
    MI_CpuFill8(DWCi_Beacon_Work, 0, DWCi_Beacon_GetWorkSize());
    DWCi_Beacon_Work->state = 0;
    DWCi_Beacon_Work->crc = 0;
    MATHi_CRC16InitTableRev((MATHCRC16Table *)DWCi_Beacon_Work->crcTable, 0xA001);
    rc = WM_Initialize(DWCi_Beacon_Work, cb, dma);
    if (rc == 2) {
        rc = 0;
    }
    return rc;
}

int DWCi_Beacon_End(void *cb) {
    int rc;
    if (!cb) {
        return -1;
    }
    DWCi_Beacon_Work->state = 3;
    DWCi_Beacon_Work = NULL;
    rc = WM_End(cb);
    if (rc == 2) {
        rc = 0;
    }
    return rc;
}

int DWCi_Beacon_StartScan(void (*cb)(void *)) {
    int rc;
    if (!cb) {
        return -1;
    }
    DWCi_Beacon_Work->param.buf = DWCi_Beacon_Work->scanBuf;
    DWCi_Beacon_Work->param.bufSize = 0x400;
    DWCi_Beacon_Work->param.channelList = WM_GetAllowedChannel();
    DWCi_Beacon_Work->param.maxChannelTime = WM_GetDispersionScanPeriod();
    DWCi_Beacon_Work->param.scanType = 1;
    MI_CpuFill8(DWCi_Beacon_Work->param.bssid, 0xFF, 6);
    DWCi_Beacon_Work->cb = cb;
    DWCi_Beacon_Work->state = 1;
    rc = WM_StartScanEx(DWCi_Beacon_ScanCallback, &DWCi_Beacon_Work->param);
    if (rc == 2) {
        rc = 0;
    }
    return rc;
}

int DWCi_Beacon_EndScan(void *cb) {
    int rc;
    if (!cb) {
        return -1;
    }
    DWCi_Beacon_Work->state = 2;
    rc = WM_EndScan(cb);
    if (rc == 2) {
        rc = 0;
    }
    return rc;
}

int DWCi_Beacon_GetEntry(int idx, WOut *out) {
    if (DWCi_Beacon_Work->state != 2) {
        return -1;
    }
    if (idx < 0 || idx >= DWCi_Beacon_Work->count) {
        return -1;
    }
    MI_CpuFill8(out, 0, 0x78);
    out->valid = 1;
    out->u4 = DWCi_Beacon_Work->u1a48[idx];
    MI_CpuCopy8(&DWCi_Beacon_Work->entries[idx], out->data, 0x70);
    return 0;
}

int DWCi_Beacon_GetEntries(void *outp) {
    WOut *out = outp;
    int i;
    WOut *p;
    if (DWCi_Beacon_Work->state != 2) {
        return -1;
    }
    MI_CpuFill8(out, 0, 0x780);
    for (i = 0, p = out; i < 16; i++, p++) {
        p->valid = 0;
    }
    for (i = 0; i < DWCi_Beacon_Work->count; i++, out++) {
        if (DWCi_Beacon_GetEntry(i, out) == -1) {
            break;
        }
    }
    return 0;
}

int DWCi_Beacon_StartApSearch(HDest *x) {
    DWCi_Beacon_ApSearch.b = DWC_Alloc(1, DWCi_Beacon_GetWorkSize());
    DWCi_Beacon_ApSearch.a = DWC_Alloc(1, 0x790);
    MI_CpuFill8(DWCi_Beacon_ApSearch.a, 0, 0x790);
    DWCi_Beacon_ApSearch.a->dest = x;
    DWCi_Beacon_ApSearch.state = 0;
    return 1;
}

int DWCi_Beacon_ProcessApSearch(void) {
    int i;
    u32 best;
    int ret;
    if (DWCi_Beacon_ApSearch.b == NULL || DWCi_Beacon_ApSearch.a == NULL) {
        return 3;
    }
    ret = 1;
    switch (DWCi_Beacon_ApSearch.state) {
    case 0:
        DWCi_Beacon_ApSearch.state = 1;
        if (DWCi_Beacon_Init(DWCi_Beacon_ApSearch.b, DWCi_Beacon_InitCallback, 0)) {
            DWCi_Beacon_ApSearch.state = 11;
        }
        break;
    case 2:
        DWCi_Beacon_ApSearch.state = 3;
        if (DWCi_Beacon_StartScan(DWCi_Beacon_ScanDoneCallback) == 0) {
            if (*(OSTick *)DWCi_Beacon_ApSearch.a->tick == 0) {
                *(OSTick *)DWCi_Beacon_ApSearch.a->tick = OS_GetTick();
            }
        } else {
            DWCi_Beacon_ApSearch.state = 10;
        }
        break;
    case 4:
        if (TICKS_TO_MS(OS_GetTick() - *(OSTick *)DWCi_Beacon_ApSearch.a->tick) < 3000) {
            DWCi_Beacon_ApSearch.state = 2;
        } else {
            DWCi_Beacon_ApSearch.state = 5;
        }
        break;
    case 5:
        DWCi_Beacon_ApSearch.state = 6;
        if (DWCi_Beacon_EndScan(DWCi_Beacon_EndScanCallback)) {
            DWCi_Beacon_ApSearch.state = 10;
        }
        break;
    case 7:
        if (DWCi_Beacon_GetEntries(DWCi_Beacon_ApSearch.a->entries)) {
            DWCi_Beacon_ApSearch.state = 10;
        }
        i = 0;
        DWCi_Beacon_ApSearch.a->best = -1;
        best = 0;
        for (; i < 16; i++) {
            if (DWCi_Beacon_ApSearch.a->entries[i].valid && (DWCi_Beacon_ApSearch.a->entries[i].flags & 2) && DWCi_Beacon_ApSearch.a->entries[i].mode <= 3
                && DWCi_IsPrintableSpotInfo(DWCi_Beacon_ApSearch.a->entries[i].key) && DWCi_Beacon_ApSearch.a->entries[i].rssi >= best) {
                DWCi_Beacon_ApSearch.a->best = i;
                best = DWCi_Beacon_ApSearch.a->entries[i].rssi;
            }
        }
        DWCi_Beacon_ApSearch.state = 8;
        if (DWCi_Beacon_End(DWCi_Beacon_EndCallback)) {
            DWCi_Beacon_ApSearch.state = 11;
        }
        break;
    case 9:
        if (DWCi_Beacon_ApSearch.a->best < 0) {
            DWCi_Beacon_ApSearch.state = 11;
            break;
        }
        MI_CpuCopy8(DWCi_Beacon_ApSearch.a->entries[DWCi_Beacon_ApSearch.a->best].name, DWCi_Beacon_ApSearch.a->dest->name, 0x20);
        MI_CpuCopy8(DWCi_Beacon_ApSearch.a->entries[DWCi_Beacon_ApSearch.a->best].pass, DWCi_Beacon_ApSearch.a->dest->pass, 0x20);
        DWCi_Beacon_ApSearch.a->dest->mode = DWCi_Beacon_ApSearch.a->entries[DWCi_Beacon_ApSearch.a->best].mode;
        MI_CpuCopy8(DWCi_Beacon_ApSearch.a->entries[DWCi_Beacon_ApSearch.a->best].key, DWCi_Beacon_ApSearch.a->dest->key, 10);
        ret = 2;
        break;
    case 10:
        DWCi_Beacon_ApSearch.state = 8;
        if (DWCi_Beacon_End(DWCi_Beacon_EndErrorCallback)) {
            DWCi_Beacon_ApSearch.state = 11;
        }
        break;
    case 11:
        ret = 3;
        break;
    }
    return ret;
}

void DWCi_Beacon_FreeApSearch(void) {
    if (DWCi_Beacon_ApSearch.b) {
        DWC_Free(1, DWCi_Beacon_ApSearch.b, 0);
        DWCi_Beacon_ApSearch.b = NULL;
    }
    if (!DWCi_Beacon_ApSearch.a) {
        return;
    }
    DWC_Free(1, DWCi_Beacon_ApSearch.a, 0);
    DWCi_Beacon_ApSearch.a = NULL;
}

int DWCi_IsPrintableSpotInfo(u8 *s) {
    int i;
    for (i = 0; i < 10; i++) {
        if (s[i] < 0x20 || s[i] > 0x7E) {
            return 0;
        }
    }
    return 1;
}

void DWCi_Beacon_InitCallback(void *arg) {
    DWCi_Beacon_ApSearch.state = 2;
}

void DWCi_Beacon_ScanDoneCallback(void *arg) {
    DWCi_Beacon_ApSearch.state = 4;
}

void DWCi_Beacon_EndScanCallback(void *arg) {
    DWCi_Beacon_ApSearch.state = 7;
}

void DWCi_Beacon_EndCallback(void *arg) {
    DWCi_Beacon_ApSearch.state = 9;
}

void DWCi_Beacon_EndErrorCallback(void *arg) {
    DWCi_Beacon_ApSearch.state = 11;
}

int gsiAvailableCheckGetAddress(const char *host, int port, NSockAddr *addr) {
    void *he;
    port = (u16)port;
    addr->family = 2;
    addr->port = (u16)(((port >> 8) & 0xFF) | ((port << 8) & 0xFF00));
    addr->addr = gsSocketInetAddr(host);
    if (addr->addr == 0xFFFFFFFF) {
        he = SOC_GetHostByName(host);
        if (!he) {
            return 0;
        }
        addr->addr = **(u32 **)*(void **)((u8 *)he + 0xc);
    }
    return 1;
}

void gsiAvailableCheckSendPacket(void) {
    gsSocketSendTo(ov00_0221B0D0.sock, ov00_0221B0E0, ov00_0221B0D0.len, 0, &ov00_0221B0D8, 8);
    ov00_0221B0D0.time = current_time();
}

void GSIStartAvailableCheck(char *name) {
    char buf[0x40];
    s8 c;
    int len;
    strcpy(__GSIACGamename, name);
    ov00_0221B0D0.sock = -1;
    SocketStartUp();
    c = GSIACHostname[0];
    if (c == 0) {
        sprintf(buf, gsiAvailableCheckHostFormat, name);
    }
    if (!gsiAvailableCheckGetAddress(c ? (char *)GSIACHostname : buf, 0x6CFC, &ov00_0221B0D8)) {
        return;
    }
    ov00_0221B0D0.sock = gsSocketCreate(2, 2, 0);
    if (ov00_0221B0D0.sock == -1) {
        return;
    }
    ov00_0221B0D0.buf[0] = 9;
    len = strlen(name);
    memcpy(ov00_0221B0E5, name, len + 1);
    ov00_0221B0D0.len = len + 6;
    gsiAvailableCheckSendPacket();
    ov00_0221B0D0.retries = 0;
}

int gsiAvailableCheckParseResponse(s8 *buf, int len, NSockAddr *from, u32 *out) {
    u32 v;
    if (len < 7) {
        return 1;
    }
    if (memcmp(&from->addr, ov00_0221B0DC, 4)) {
        return 1;
    }
    if (from->port != ov00_0221B0D0.addr.port) {
        return 1;
    }
    if (memcmp(buf, gsiAvailableCheckResponseMagic, 3)) {
        return 1;
    }
    v = (buf[3] << 24) & 0xFF000000;
    v |= (buf[4] << 16) & 0xFF0000;
    v |= (buf[5] << 8) & 0xFF00;
    v |= (u8)buf[6];
    *out = v;
    return 0;
}
