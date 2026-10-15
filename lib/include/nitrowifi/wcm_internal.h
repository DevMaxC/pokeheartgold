#ifndef POKEHEARTGOLD_NITROWIFI_WCM_INTERNAL_H
#define POKEHEARTGOLD_NITROWIFI_WCM_INTERNAL_H

#include <nitro.h>
#include "WM.h"

// NitroWiFi wireless connection manager (WCM): drives the WM library (start-up, scan, connect,
// DCF data, disconnect, clean-up) as a state machine on the caller's work area, keeps the list of
// access points found by scanning and passes data frames to and from libCPS (the "cpsif" part).
// The WCM_*Async functions return 0 (already there), 2 (in progress), 3 (accepted) or an error;
// the result is reported through the callback given to WCM_StartupAsync.
//
// Phases: 1 initialised, 2 starting up, 3 idle, 4 cleaning up, 5 search starting, 6 searching,
// 7 search ending, 8 connecting, 9 connected, 10 disconnecting, 11 fatal error, 12 error (reset
// needed), 13 terminating.

// WcmWork.phase
#define WCM_PHASE_NULL           0
#define WCM_PHASE_WAIT           1
#define WCM_PHASE_WAIT_TO_IDLE   2
#define WCM_PHASE_IDLE           3
#define WCM_PHASE_IDLE_TO_WAIT   4
#define WCM_PHASE_IDLE_TO_SEARCH 5
#define WCM_PHASE_SEARCH         6
#define WCM_PHASE_SEARCH_TO_IDLE 7
#define WCM_PHASE_IDLE_TO_DCF    8
#define WCM_PHASE_DCF            9
#define WCM_PHASE_DCF_TO_IDLE    10
#define WCM_PHASE_FATAL_ERROR    11
#define WCM_PHASE_IRREGULAR      12
#define WCM_PHASE_TERMINATING    13

// Results of the WCM_* requests and WcmNotice.result
#define WCM_RESULT_SUCCESS        0
#define WCM_RESULT_FAILURE        1
#define WCM_RESULT_PROGRESS       2
#define WCM_RESULT_ACCEPT         3
#define WCM_RESULT_REJECT         4
#define WCM_RESULT_WMDISABLE      5
#define WCM_RESULT_NOT_ENOUGH_MEM 6
#define WCM_RESULT_FATAL_ERROR    7

// WcmWork.notify, WcmNotice.notify
#define WCM_NOTIFY_COMMON        0
#define WCM_NOTIFY_STARTUP       1
#define WCM_NOTIFY_CLEANUP       2
#define WCM_NOTIFY_BEGIN_SEARCH  3
#define WCM_NOTIFY_END_SEARCH    4
#define WCM_NOTIFY_CONNECT       5
#define WCM_NOTIFY_DISCONNECT    6
#define WCM_NOTIFY_FOUND_AP      7
#define WCM_NOTIFY_SEARCH_AROUND 8
#define WCM_NOTIFY_TERMINATE     9

// Access point description (WM scan result), 0xC0 bytes.
typedef struct WcmBssDesc {
    u16 length;     // 0x00
    u16 rssi;       // 0x02
    u8 bssid[6];    // 0x04
    u16 ssidLength; // 0x0A
    u8 ssid[32];    // 0x0C
    u16 unk_2C;
    u16 unk_2E;
    u16 capability; // 0x30
    u8 unk_32[10];
    u16 gameInfoLength; // 0x3C, nonzero: not an access point (not listed, refused by WCM_ConnectAsync)
    u8 unk_3E[0x82];
} WcmBssDesc;

// WEP key (WCM_ConnectAsync)
typedef struct WcmWepKey {
    u8 mode; // 0: none
    u8 keyId;
    u8 key[80];
} WcmWepKey;

typedef struct WcmApListEntry {
    u8 used;
    u8 unk_01;
    u16 linkLevel;               // 0x02
    u32 index;                   // 0x04, order of discovery
    struct WcmApListEntry *prev; // 0x08
    struct WcmApListEntry *next; // 0x0C
    WcmBssDesc bssDesc;          // 0x10
} WcmApListEntry;

// Header of the caller's access point list buffer; the entries follow it.
typedef struct WcmApList {
    u32 count;
    WcmApListEntry *first; // oldest
    WcmApListEntry *last;
} WcmApList;

// WCM_StartupAsync parameters
typedef struct WcmConfig {
    u32 dmaNo;
    void *apListBuffer;
    u32 apListBufferSize;
    u32 apListMode; // 1: replace the oldest entry when the list is full
} WcmConfig;

// Passed to the WCM callback
typedef struct WcmNotice {
    u16 notify;   // the request it answers
    u16 result;   // 0 success, 1 failure, 7 fatal error, 8 scan round done
    void *param0; // e.g. the access point
    void *param1;
    int line; // source line of the notification
} WcmNotice;

typedef void (*WcmCallback)(WcmNotice *notice);

// WM scan parameters (WM_StartScanEx), 0x34 bytes
typedef struct WcmScanParam {
    void *buffer;   // 0x00
    u16 bufferSize; // 0x04
    u16 channels;   // 0x06, bit n: channel n
    u16 duration;   // 0x08
    u8 bssid[6];    // 0x0A
    u16 scanType;   // 0x10
    u16 ssidLength; // 0x12
    u8 ssid[32];    // 0x14
} WcmScanParam;

// The caller's work area (WCM_Init), 32-byte aligned, at least 0x2300 bytes.
typedef struct WcmWork {
    u8 wmWork[0xF00];     // 0x0000, WM_Init
    u8 sendBuffer[0x600]; // 0x0F00, DCF data sent
    u8 recvBuffer[0xB00]; // 0x1500, scan results / DCF data received
    u8 unk_2000[0x140];
    WcmBssDesc ap; // 0x2140, the access point to connect to
    u8 wepKey[80]; // 0x2200
    u8 wepMode;    // 0x2250
    u8 wepKeyId;   // 0x2251
    u8 unk_2252[14];
    int phase;              // 0x2260
    u32 option;             // 0x2264, WCM_UpdateOption
    u16 scanPeriod;         // 0x2268, 0: WM's dispersion scan period
    u8 apListLocked;        // 0x226A
    u8 resetting;           // 0x226B
    u32 dmaNo;              // 0x226C
    WcmApList *apList;      // 0x2270
    u32 apListSize;         // 0x2274
    u32 apListMode;         // 0x2278
    WcmCallback callback;   // 0x227C
    s16 notify;             // 0x2280, request being processed
    u16 aid;                // 0x2282
    u32 scanCount;          // 0x2284
    WcmScanParam scanParam; // 0x2288
    u8 unk_22BC[0x10];
    OSAlarm keepAliveAlarm; // 0x22CC
    u16 reason;             // 0x22F8, of the last failed connection
    u8 unk_22FA[6];
} WcmWork;

// WM callback arguments (only the fields WCM reads)
typedef struct WcmWmCallbackArg {
    u16 apiId;   // 0x00
    u16 errCode; // 0x02
    u16 state;   // 0x04
    u16 reason;  // 0x06
    u8 *data;    // 0x08, received DCF frame (WcmWmcbStartDCF)
} WcmWmCallbackArg;

typedef struct WcmWmStateArg {
    u16 apiId;   // 0x00
    u16 errCode; // 0x02
    u16 unk_04[2];
    u16 state; // 0x08
    u16 aid;   // 0x0A, scan: channel bits
    u16 unk_0C;
    u16 count;               // 0x0E, scan: access points found; connect: reason
    WcmBssDesc *bssDesc[16]; // 0x10
    u16 linkLevel[16];       // 0x50
} WcmWmStateArg;

typedef void (*WcmRecvCallback)(void *data, void *source, void *destination, u32 length);

// libCPS interface state (asm .bss); its sub-labels are used directly as well.
typedef struct WcmCpsif {
    u8 initialized;
    u8 unk_01[3];
    OSThreadQueue sendQueue;      // 0x04
    OSMutex mutex;                // 0x0C
    u32 sendResult;               // 0x24
    WcmRecvCallback recvCallback; // 0x28
} WcmCpsif;

extern WcmWork *gWcmWork;
extern WcmCpsif gWcmCpsif;
extern OSThreadQueue gWcmCpsifSendQueue; // gWcmCpsif.sendQueue
extern OSMutex gWcmCpsifMutex;           // gWcmCpsif.mutex
extern u8 gWcmRssiCount;                 // samples, 16 + index once the ring is full
extern u8 gWcmRssi[16];
extern const u8 WCM_Bssid_Any[6];  // ff:ff:ff:ff:ff:ff, any BSSID
extern const u8 WCM_Essid_Any[32]; // empty SSID, any network

// wcm.c
int WCM_Init(WcmWork *work, u32 size);
int WCM_Finish(void);
int WCM_StartupAsync(WcmConfig *config, WcmCallback callback);
int WCM_CleanupAsync(void);
int WCM_SearchAsync(const u8 *bssid, const u8 *ssid, u32 option);
int WCM_BeginSearchAsync(const u8 *bssid, const u8 *ssid, u32 option);
int WCM_EndSearchAsync(void);
int WCM_ConnectAsync(WcmBssDesc *ap, WcmWepKey *key, u32 option);
int WCM_DisconnectAsync(void);
int WCM_TerminateAsync(void);
int WCM_GetPhase(void);
u32 WCM_UpdateOption(u32 option);
WcmWork *WCMi_GetSystemWork(void);

// wcm_control.c
void WcmConfigure(WcmConfig *config, WcmCallback callback);
void WcmEditScanExParam(const u8 *bssid, const u8 *ssid, u32 option);
void WcmInitOption(void);
u16 WcmGetNextScanChannel(int channel);
void WcmNotify(int result, void *param0, void *param1, int line);
void WcmNotifyEx(int notify, int result, void *param0, void *param1, int line);
void WcmSetPhase(int phase);
void WCMi_ResetKeepAliveAlarm(void);
void WcmKeepAliveAlarm(void *arg);
u32 WcmCountBits(u32 value);
u32 WcmCountLeadingZero(u32 value);

// wcm_callback.c
void WcmWmReset(void);
void WcmWmcbIndication(WcmWmCallbackArg *arg);
void WcmWmcbCommon(WcmWmStateArg *arg);
void WcmWmcbScanEx(WcmWmStateArg *arg);
void WcmWmcbEndScan(WcmWmCallbackArg *arg);
void WcmWmcbConnect(WcmWmStateArg *arg);
void WcmWmcbDisconnect(WcmWmCallbackArg *arg);
void WcmWmcbStartDCF(WcmWmCallbackArg *arg);
void WcmWmcbEndDCF(WcmWmCallbackArg *arg);
void WcmWmcbReset(WcmWmStateArg *arg);

// wcm_aplist.c
void WCM_ClearApList(void);
int WCM_CountApList(void);
int WCM_LockApList(int lock);
WcmBssDesc *WCM_PointApList(int index);
void WCMi_EntryApList(WcmBssDesc *bssDesc, u16 linkLevel);
WcmApListEntry *WcmAllocApList(void);
WcmApListEntry *WcmGetOldestApList(void);
WcmApListEntry *WcmSearchApList(const u8 *bssid);
WcmApListEntry *WcmSearchIndexedApList(u32 index);
void WcmAppendApList(WcmApListEntry *entry);

// wcm_cpsif.c
void WCMi_InitCpsif(void);
void WCMi_CpsifRecvCallback(u8 *frame);
void WCMi_CpsifSendNullPacket(void);
u8 *WCM_GetApMacAddress(void);
u8 *WCM_GetApEssid(u16 *length);
void WCM_SetRecvDCFCallback(WcmRecvCallback callback);
int WCM_SendDCFDataEx(const u8 *destination, const void *header, int headerSize, const void *data, int dataSize);
void WcmCpsifWmCallback(WcmWmCallbackArg *arg);
void WcmCpsifKACallback(void *arg);
BOOL WcmCpsifTryLockMutexInIRQ(OSMutex *mutex);
void WcmCpsifUnlockMutexInIRQ(OSMutex *mutex);
BOOL WCM_CompareBssID(const u8 *a, const u8 *b);
int WCM_GetLinkLevel(void);
u8 WCMi_GetRssiAverage(void);
int WcmGetLinkLevel(void);
void WCMi_ShelterRssi(int sample);

// WM library
int WM_Init(void *work, u16 dmaNo);
int WM_Finish(void);
int WM_Enable(void (*callback)(void *));
int WM_Disable(void (*callback)(void *));
int WM_PowerOn(void (*callback)(void *));
int WM_PowerOff(void (*callback)(void *));
int WM_Reset(void (*callback)(void *));
int WM_SetIndCallback(void (*callback)(void *));
int WM_GetAllowedChannel(void);
u16 WM_GetDispersionScanPeriod(void);
int WM_StartScanEx(void (*callback)(void *), WcmScanParam *param);
int WM_EndScan(void (*callback)(void *));
int WM_SetLifeTime(void (*callback)(void *), u16 frameLifeTime, u16 camLifeTime, u16 multicastLifeTime, u16 keepAliveTime);
int WM_SetBeaconIndication(void (*callback)(void *), int enable);
int WM_SetWEPKeyEx(void (*callback)(void *), int mode, int keyId, u8 *key);
int WM_StartConnectEx(void (*callback)(void *), WcmBssDesc *ap, u8 *ssidMask, int authMode, u16 powerSave);
int WM_StartDCF(void (*callback)(void *), void *recvBuffer, int recvBufferSize);
int WM_SetDCFData(void (*callback)(void *), const u8 *destination, const void *data, u16 length);
int WM_EndDCF(void (*callback)(void *));
int WM_Disconnect(void (*callback)(void *), int aid);
u16 *WMi_GetStatusAddress(void);

#endif // POKEHEARTGOLD_NITROWIFI_WCM_INTERNAL_H
