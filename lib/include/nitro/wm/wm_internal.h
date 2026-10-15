#ifndef NITRO_WM_WM_INTERNAL_H
#define NITRO_WM_WM_INTERNAL_H

#include "WM.h"

// ARM9 side of the wireless manager (WM): requests to the ARM7 over the PXI FIFO and the state the
// two processors share. lib/NitroSDK/src/wm_*.c.

typedef void (*WmCallback)(void *arg);

// API ids of the ARM7 requests (index of WmSystemWork.callbacks).
#define WM_API_INITIALIZE       0
#define WM_API_RESET            1
#define WM_API_END              2
#define WM_API_ENABLE           3
#define WM_API_DISABLE          4
#define WM_API_POWER_ON         5
#define WM_API_POWER_OFF        6
#define WM_API_SET_PARENT_PARAM 7
#define WM_API_START_PARENT     8
#define WM_API_END_PARENT       9
#define WM_API_START_SCAN       10
#define WM_API_END_SCAN         11
#define WM_API_START_CONNECT    12
#define WM_API_DISCONNECT       13
#define WM_API_START_MP         14
#define WM_API_SET_MP_DATA      15
#define WM_API_END_MP           16
#define WM_API_START_DCF        17
#define WM_API_SET_DCF_DATA     18
#define WM_API_END_DCF          19
#define WM_API_SET_WEP_KEY      20
#define WM_API_SET_GAME_INFO    24
#define WM_API_SET_BEACON_IND   25
#define WM_API_SET_LIFE_TIME    29
#define WM_API_MEASURE_CHANNEL  30
#define WM_API_SET_ENTRY        33
#define WM_API_START_SCAN_EX    38
#define WM_API_SET_WEP_KEY_EX   39
#define WM_API_REQUEST_COUNT    44 // replies with a smaller id answer a request; callbacks[44] is the
                                   // indication callback (WM_SetIndCallback)
#define WM_API_INDICATION    128   // other replies: indication,
#define WM_API_CALL_CALLBACK 129   //   call the callback stored in the reply,
#define WM_API_PORT_RECEIVE  130   //   data for a port callback

// WMi_CheckStateEx states (WmStatus.state), named after the requests that need / reach them.
#define WM_STATE_INIT      0 // after WM_Init; WM_Enable
#define WM_STATE_ENABLED   1 // WM_PowerOn, WM_Disable
#define WM_STATE_POWER_ON  2 // WM_StartParent, WM_StartConnectEx, WM_StartScan, WM_PowerOff, WM_End
#define WM_STATE_SCANNING  5 // WM_EndScan
#define WM_STATE_PARENT    7 // WM_StartMP, WM_EndParent
#define WM_STATE_CHILD     8 // WM_StartMP, WM_StartDCF
#define WM_STATE_MP_PARENT 9 // WM_SetMPDataToPortEx, WM_EndMP
#define WM_STATE_MP_CHILD  10
#define WM_STATE_DCF_CHILD 11 // WM_SetDCFData, WM_EndDCF

// WmPortEvent.state.
#define WM_EVENT_CONNECTED    7  // a child connected (sets its WmSystemWork.connectedAids bit)
#define WM_EVENT_DISCONNECTED 9  // clears the bit
#define WM_EVENT_PORT_RECEIVE 21 // data received on the port
#define WM_EVENT_PORT_INIT    25 // WM_SetPortCallback set a new callback
#define WM_EVENT_26           26 // clears the bit too

#define WM_PORT_COUNT           16
#define WM_COMMAND_BUFFER_COUNT 10
#define WM_SIZE_STATUS          0x800

// Status block the ARM7 keeps up to date (WmSystemWork.status, WM_ReadStatus copies it).
typedef struct WmStatus {
    u16 state; // 0x000: WM_STATE_*
    u8 unk_002[0xA];
    u32 mpStarted;  // 0x00C: 1 while MP communication runs
    u32 dcfStarted; // 0x010: 1 while DCF communication runs
    u8 unk_014[0x28];
    u16 mpSendSize;    // 0x03C: WM_GetMPSendBufferSize
    u16 mpReceiveSize; // 0x03E: WM_GetMPReceiveBufferSize
    u8 unk_040[0x32];
    u16 mpReceiveDataSize; // 0x072: size of the received data a port reply points at
    u8 unk_074[0x8];
    const void *mpSendData; // 0x07C: data of the running WM_SetMPDataToPortEx request
    u8 unk_080[0x6];
    u16 readyBitmap;
    u8 unk_088[0x14];
    u16 ignoreSizePrecheckMode; // 0: WMi_StartMP checks the buffer sizes
    u8 unk_09E[0x1E];
    u16 linkLevel; // 0x0BC
    u8 unk_0BE[0x8];
    u16 pwrMgtMode;
    u8 unk_0C8[0x30];
    u16 mpChildCount; // 0x0F8: children the parent's receive buffer is sized for
    u8 unk_0FA[0x88];
    u16 childBitmap; // 0x182: connected children (bit = AID)
    u8 unk_184[0x4];
    u16 isChild; // 0x188: 0 for the parent
} WmStatus;

// System work at the start of the WM_Init buffer (0x200 bytes; then the 0x300-byte ARM7 work, the status
// block, and two 0x100-byte FIFO buffers).
typedef struct WmSystemWork {
    void *arm7Work;   // 0x000
    WmStatus *status; // 0x004
    void *unk_008;
    void *arm7Buffer;                               // 0x00C
    void *fifoBuffer;                               // 0x010: replies of the ARM7
    u16 dma;                                        // 0x014: DMA channel
    u16 statusNoInvalidate;                         // 0x016: 0: invalidate the status block on each reply
    WmCallback callbacks[WM_API_REQUEST_COUNT + 1]; // 0x018: per API id
    WmCallback portCallbacks[WM_PORT_COUNT];        // 0x0CC
    void *portCallbackArgs[WM_PORT_COUNT];          // 0x10C
    u32 connectedAids;                              // 0x14C: WM_GetConnectedAIDs
    u16 aid;                                        // 0x150: WM_GetAID
} WmSystemWork;

// Connect / disconnect notice WmReceiveFifo passes to every port callback.
typedef struct WmPortEvent {
    u16 apiid;         // 0x00: WM_API_PORT_RECEIVE
    u16 errcode;       // 0x02
    u16 state;         // 0x04
    u16 port;          // 0x06
    void *recvBuf;     // 0x08: received MP data (WmStatus.mpReceiveDataSize bytes)
    void *data;        // 0x0C: this port's data in it
    u16 length;        // 0x10
    u16 aid;           // 0x12: sender / AID that connected or disconnected
    u8 macAddress[6];  // 0x14
    u16 seqNo;         // 0x1A: 0xFFFF in notices
    void *arg;         // 0x1C: port callback argument
    u16 myAid;         // 0x20
    u16 connectedAids; // 0x22
    u16 ssid[12];
    u16 reason;
    u16 unk_3E;
    u16 maxSendDataSize;
    u16 maxRecvDataSize;
} WmPortEvent;

typedef struct WmWork {
    u16 initialized;
    u16 unk_02;
    WmSystemWork *sys;                                  // 0x04
    OSMessageQueue commandQueue;                        // 0x08: free command buffers
    OSMessage commandMessages[WM_COMMAND_BUFFER_COUNT]; // 0x28
    WmPortEvent portEvent;                              // 0x50
    u8 unk_94[0xC];
} WmWork;

// Request buffer sent to the ARM7 (bit 15 of the first halfword: free).
typedef struct WmCommandBuffer {
    u16 apiid;
    u8 data[254];
} WmCommandBuffer;

int MATH_CountPopulation(u32 value);
RTCResult RTC_GetTime(RTCTime *time);

extern WmWork gWmWork;
extern OSMessageQueue gWmCommandQueue; // label of gWmWork.commandQueue
extern OSMessage gWmCommandMessages[]; // label of gWmWork.commandMessages
extern WmPortEvent gWmPortEvent;       // label of gWmWork.portEvent
extern u8 gWmPortEventMacAddress[];    // label of gWmWork.portEvent.macAddress
extern u16 gWmPortEventData[];         // label of gWmWork.portEvent.ssid
extern WmCommandBuffer gWmCommandBuffers[WM_COMMAND_BUFFER_COUNT];
extern u8 gWmGameInfo[]; // WM_SetGameInfo copy (0x80 bytes)
extern u32 gWmNextTgid;  // 0x10000 until seeded from the RTC

// WM_GetOtherElements: the elements that follow a BSS description's game info.
typedef struct WMOtherElement {
    u8 id;
    u8 length;
    u8 pad[2];
    u8 *body;
} WMOtherElement;

typedef struct WMOtherElementResults {
    u8 count;
    u8 pad[3];
    WMOtherElement element[16];
} WMOtherElementResults;

typedef struct WMBssDescView {
    u16 length; // in halfwords
    u8 pad[0x3A];
    u16 gameInfoLength;
    u16 otherElementCount;
    u8 elements[1];
} WMBssDescView;

// WM_ReadMPData: MP receive buffer, a list of per-child entries `stride` bytes apart.
typedef struct WmMPReceiveBuffer {
    u16 unk_00[2];
    volatile u16 count;
    u16 stride;
    u16 unk_08;
    u8 data[1];
} WmMPReceiveBuffer;

// WM_SetParentParameter (0x40 bytes).
typedef struct WmParentParam {
    void *gameInfo;     // 0x00
    u16 gameInfoLength; // 0x04: at most 112 (WmCheckParentParameter)
    u8 unk_06[0xE];
    u16 KS_Flag; // nonzero: 42 / 6 more bytes per parent / child packet
    u8 unk_16[2];
    u16 beaconPeriod; // 10..1000 (WmCheckParentParameter)
    u8 unk_1A[0x18];
    u16 channel;       // 0x32: 1..14
    u16 parentMaxSize; // 0x34
    u16 childMaxSize;  // 0x36
    u8 unk_38[8];
} WmParentParam;

// WM_StartScan.
typedef struct WmScanParam {
    void *buffer;
    u16 channel;
    u16 time;
    u8 address[6];
} WmScanParam;

// WM_StartScanEx.
typedef struct WmScanExParam {
    void *buffer;
    u16 bufferSize; // at most 1024
    u16 channel;
    u16 dwell;
    u8 address[6];
    u16 type;   // 0..3; 2 and 3 compare matchLength bytes
    u16 length; // of ssid, at most 32
    u8 ssid[32];
    u16 matchLength;
} WmScanExParam;

// WMi_StartMP parameters (16 bytes).
typedef struct WmMPParam {
    u32 flags;
    u16 minFrequency;
    u16 frequency;
    u16 maxFrequency; // flags bit 2
    u16 defaultRetryCount;
    u8 minPollBmpMode;
    u8 singlePacketMode;
    u8 ignoreFatalErrorMode;
    u8 pad;
} WmMPParam;

WMErrCode WM_Init(void *buffer, u32 dma);
WMErrCode WmInitCore(WmSystemWork *buffer, u32 dma, u32 size);
WMErrCode WM_Finish(void);
void WMi_SetCallbackTable(int apiid, WmCallback callback);
void *WmGetCommandBuffer4Arm7(void);
WMErrCode WMi_SendCommand(u16 apiid, u16 paramNum, ...);
WMErrCode WMi_SendCommandDirect(const void *data, u32 size);
WmSystemWork *WMi_GetSystemWork(void);
WMErrCode WMi_CheckInitialized(void);
WMErrCode WMi_CheckIdle(void);
WMErrCode WMi_CheckStateEx(int count, ...);
void WmReceiveFifo(PXIFifoTag tag, u32 data, BOOL err);
void WmClearFifoRecvFlag(void);
WmStatus *WMi_GetStatusAddress(void);
u16 WM_GetAID(void);
u16 WM_GetConnectedAIDs(void);
WMErrCode WM_SetIndCallback(WmCallback callback);
WMErrCode WM_SetPortCallback(u16 port, WmCallback callback, void *arg);
WMErrCode WM_ReadStatus(WmStatus *status);
int WM_GetMPSendBufferSize(void);
int WM_GetMPReceiveBufferSize(void);
void *WM_ReadMPData(WmMPReceiveBuffer *buffer, u16 aid);
u16 WM_GetAllowedChannel(void);
u16 WM_GetLinkLevel(void);
u16 WM_GetDispersionBeaconPeriod(void);
u16 WM_GetDispersionScanPeriod(void);
WMOtherElementResults WM_GetOtherElements(WMBssDescView *bss);

u16 WM_GetNextTgid(void);
WMErrCode WM_Enable(WmCallback callback);
WMErrCode WMi_EnableEx(WmCallback callback, u32 flags);
WMErrCode WM_Disable(WmCallback callback);
WMErrCode WM_PowerOn(WmCallback callback);
WMErrCode WM_PowerOff(WmCallback callback);
WMErrCode WM_Initialize(void *buffer, WmCallback callback, u32 dma);
WMErrCode WM_InitializeForListening(void *buffer, WmCallback callback, u32 dma, BOOL unk);
WMErrCode WMi_InitializeEx(void *buffer, WmCallback callback, u32 dma, u32 flags);
WMErrCode WM_Reset(WmCallback callback);
WMErrCode WM_End(WmCallback callback);
WMErrCode WM_SetParentParameter(WmCallback callback, WmParentParam *param);
BOOL WmCheckParentParameter(WmParentParam *param);
WMErrCode WMi_StartParentEx(WmCallback callback, u32 unk);
WMErrCode WM_StartParent(WmCallback callback);
WMErrCode WM_EndParent(WmCallback callback);
WMErrCode WM_StartScan(WmCallback callback, WmScanParam *param);
WMErrCode WM_StartScanEx(WmCallback callback, WmScanExParam *param);
WMErrCode WM_EndScan(WmCallback callback);
WMErrCode WM_StartConnectEx(WmCallback callback, const u16 *bssDesc, const void *data, u32 unk, u16 unk2);
WMErrCode WM_Disconnect(WmCallback callback, u16 aid);
WMErrCode WMi_StartMP(WmCallback callback, void *recvBuf, u16 recvBufSize, void *sendBuf, u16 sendBufSize, const WmMPParam *param);
WMErrCode WM_StartMPEx(WmCallback callback, void *recvBuf, u16 recvBufSize, void *sendBuf, u16 sendBufSize, u16 frequency, u16 defaultRetryCount, u32 minPollBmpMode, u32 singlePacketMode, BOOL fixFrequency, u32 ignoreFatalErrorMode);
WMErrCode WM_StartMP(WmCallback callback, void *recvBuf, u16 recvBufSize, void *sendBuf, u16 sendBufSize, u16 frequency);
WMErrCode WM_SetMPDataToPortEx(WmCallback callback, void *arg, const void *data, u16 length, u16 aidBitmap, u16 port, u16 priority);
WMErrCode WM_EndMP(WmCallback callback);
WMErrCode WM_StartDCF(WmCallback callback, void *recvBuf, u32 recvBufSize);
WMErrCode WM_SetDCFData(WmCallback callback, const u8 *destAdr, const u16 *sendData, u16 sendDataSize);
WMErrCode WM_EndDCF(WmCallback callback);
WMErrCode WM_StartDataSharing(WMDataSharingInfo *info, u16 port, u16 aidBitmap, u16 dataLength, BOOL doubleMode);
WMErrCode WM_EndDataSharing(WMDataSharingInfo *info);
WMErrCode WM_StepDataSharing(WMDataSharingInfo *info, const void *sendData, void *receiveData);
void WmDataSharingSetDataCallback(void *arg);
void WmDataSharingReceiveCallback_Parent(void *arg);
void WmDataSharingReceiveCallback_Child(void *arg);
void WmDataSharingReceiveData(WMDataSharingInfo *info, u32 aid, const void *data);
void WmDataSharingSendDataSet(WMDataSharingInfo *info, BOOL excludeParent);
void *WM_GetSharedDataAddress(WMDataSharingInfo *info, WMDataSet *dataSet, int aid);
void *WmGetSharedDataAddress(WMDataSharingInfo *info, u32 aidBitmap, void *data, int aid);
WMErrCode WM_StartKeySharing(WMKeySetBuf *buf, u16 port);
WMErrCode WM_EndKeySharing(WMKeySetBuf *buf);
WMErrCode WM_SetWEPKey(WmCallback callback, u32 mode, const void *key);
WMErrCode WM_SetWEPKeyEx(WmCallback callback, u32 mode, u32 keyId, const void *key);
WMErrCode WM_SetGameInfo(WmCallback callback, const void *gameInfo, u16 size, u32 unk, u16 unk2, u8 unk3);
WMErrCode WM_SetBeaconIndication(WmCallback callback, u32 flag);
WMErrCode WM_SetLifeTime(WmCallback callback, u16 unk, u16 unk2, u16 unk3, u16 unk4);
WMErrCode WM_MeasureChannel(WmCallback callback, u16 unk, u16 unk2, u16 unk3, u16 unk4);
WMErrCode WM_SetEntry(WmCallback callback, u32 flag);

#endif // NITRO_WM_WM_INTERNAL_H
