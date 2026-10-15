#ifndef POKEHEARTGOLD_LIB_INCLUDE_DWC_NET_COMMON_INTERNAL_H
#define POKEHEARTGOLD_LIB_INCLUDE_DWC_NET_COMMON_INTERNAL_H

#include "dwc/auth_internal.h"

// Common part of the OVY_0 network library (lib/NitroDWC/src/net_common.c): field encoding, the last
// error, the tagged allocator, the Wi-Fi connection, access point info, the server-corrected clock,
// service locator and download start-up, string helpers and the random number generator.

// Every block from DWC_AllocEx starts 32 bytes after this header.
typedef struct NetAllocHeader {
    u32 magic; // "DWCM"
    u32 size;
    u8 unk_08[24];
} NetAllocHeader;

typedef struct NetAllocator {
    void (*free)(int heap, void *ptr, u32 size);
    void *(*alloc)(int heap, u32 size, int align);
} NetAllocator;

// Wi-Fi connection, 100 bytes, owned by the caller of DWC_InitInetEx.
typedef struct NetConnection {
    int handle;
    u16 state; // 1 = initialised, 2 = starting, 3 = cancelled, 4 = connected, 5 = closing, 6 = lost, 7/8 = error
    u16 flag;
    u16 priority;
    u16 one;
    u8 unk_0C;
    u8 unk_0D[3];
    u32 phase;
    u8 apSsid[32];
    u8 apKey[32];
    u32 apKeyType;
    u8 apSpotInfo[12];
} NetConnection;

typedef struct NetConnectionState {
    int error;
    NetConnection *connection;
} NetConnectionState;

typedef struct NetStartParams {
    void *(*alloc)(int heap, u32 size);
    void (*free)(int heap, void *ptr, u32 size);
    u8 priority;
    u8 one;
    u8 unk_0A[2];
} NetStartParams;

// Access point information, 60 bytes.
typedef struct NetApInfo {
    int apType; // 0-2: the user's connection settings
    int spotType;
    u8 spotInfo[9];
    u8 unk_11;
    u8 essid[33];
    u8 bssid[6];
    u8 unk_39[3];
} NetApInfo;

typedef struct NetErrorState {
    int type;
    int code;
} NetErrorState;

// DWC_NASLoginAsync: authentication with its own connection.
typedef struct NetAuthWork {
    NasHttp http;
    AuthParams params;
    AuthResult result;
} NetAuthWork;

typedef void (*NetDownloadCallback)(int, int, int);

// Download start-up (service locator, then the "download" server), 2688 bytes.
typedef struct NetDownloadWork {
    NetDownloadCallback callback;
    void (*end)(void);
    char user[32];
    char pass[32];
    int active;
    SvcLocResult svcloc;
    u8 threadStack[0x800];
    OSThread thread;
} NetDownloadWork;

typedef struct NetRandom {
    u64 x;
    u64 mul;
    u64 add;
} NetRandom;

int DWCi_Base64Encode(const u8 *src, u32 len, char *dest, u32 destSize);
u32 DWCi_Base64Decode(char *src, u32 len, char *dest, u32 destSize);
int DWC_GetLastError(int *code);
int DWC_GetLastErrorEx(int *code, int *category);
void DWC_ClearError(void);
int DWCi_IsError(void);
void DWCi_SetError(int type, int code);
NetAllocHeader *DWCi_GetAllocHeader(void *p);
void *DWCi_InitAllocHeader(NetAllocHeader *p, u32 size);
u32 DWCi_GetAllocSize(void *p);
void DWC_SetMemFunc(void *(*alloc)(int, u32, int), void (*free)(int, void *, u32));
void *DWC_Alloc(int heap, u32 size);
void *DWC_AllocEx(int heap, u32 size, int align);
void DWC_Free(int heap, void *p, u32 size);
void *DWC_Realloc(int heap, void *p, u32 oldSize, u32 size);
void *DWC_ReallocEx(int heap, void *src, u32 oldSize, u32 size, int align);
void *DWCi_GsMalloc(u32 size);
void *DWCi_GsRealloc(void *p, u32 size);
void DWCi_GsFree(void *p);
void DWC_InitInetEx(NetConnection *connection, u16 priority, int unused, u16 sslPriority);
void DWC_SetAuthServer(int server);
void DWC_ConnectInetAsync(void);
void DWCi_ConnectInetToAccessPointAsync(void *a, void *b, u32 c, void *d, int e);
int DWC_CheckInet(void);
void DWC_ProcessInet(void);
int DWC_GetInetStatus(void);
void DWC_CleanupInet(void);
int DWC_CleanupInetAsync(void);
int DWCi_IsInetDisconnected(void);
int DWC_GetLinkLevel(void);
int DWC_GetApInfo(NetApInfo *info);
int DWC_UpdateConnection(void);
int DWC_GetDateTime(RTCDate *date, RTCTime *time);
int DWC_SVLGetTokenAsync(const char *svc, SvcLocResult *output);
int DWC_SVLProcess(void);
int DWC_NASLoginAsync(void);
int DWC_NASLoginProcess(void);
void DWC_NASLoginAbort(void);
void *DWCi_NdAlloc(u32 size, int align);
void DWCi_NdFree(void *p);
void DWCi_NdCallback(int a, unsigned result, int c);
void DWCi_NdCleanupFinish(void);
void DWCi_NdInitThread(void *arg);
int DWC_NdInitAsync(NetDownloadCallback callback, char *user, char *pass);
int DWC_NdCleanupAsync(void (*end)(void));
int DWC_NdSetAttr(int a, int b, int c);
int DWC_NdGetFileListNumAsync(int a);
int DWC_NdGetFileListAsync(void *a, int b, int c);
int DWC_NdGetFileAsync(int a, int b, int c);
int DWC_NdCancelAsync(void);
int DWC_NdGetProgress(int a, int b);
u32 DWC_SetCommonKeyValueString(const char *a, const char *b, char *dest, int separator);
u32 DWC_AddCommonKeyValueString(const char *a, const char *b, char *dest, int separator);
int DWC_GetCommonValueString(char *key, char *out, char *input, int separator);
u32 DWCi_GetRandom(u32 max);

#endif // POKEHEARTGOLD_LIB_INCLUDE_DWC_NET_COMMON_INTERNAL_H
