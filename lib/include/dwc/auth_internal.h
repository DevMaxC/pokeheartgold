#ifndef POKEHEARTGOLD_LIB_INCLUDE_DWC_AUTH_INTERNAL_H
#define POKEHEARTGOLD_LIB_INCLUDE_DWC_AUTH_INTERNAL_H

// Nintendo Wi-Fi authentication server client of OVY_0 (lib/NitroDWC/src/auth_client.c,
// auth_request.c, auth_http.c, auth_netcheck.c): the auth work block and its thread, the request
// fields sent to the server, and the small HTTP client underneath.

typedef void *(*NasAllocFunc)(char *name, int size);
typedef void (*NasFreeFunc)(char *name, void *ptr, int size);

// Connection settings, copied into the connection by DWCi_Http_Create.
typedef struct NasHttpParams {
    const char *url;
    int method;     // 0 = POST, 1 = GET
    int bufferSize; // receive buffer
    NasAllocFunc alloc;
    NasFreeFunc free;
    int testServer; // set when url is not the production server
    int timeout;    // ms, <= 0: 60000
} NasHttpParams;

// Growable text buffer ("buf->buffer").
typedef struct NasHttpBuffer {
    char *buffer;
    char *pos;
    char *end;
    int size;
} NasHttpBuffer;

// One header or body field of a parsed response ("result->entry[i].label").
typedef struct NasHttpEntry {
    char *label;
    char *value;
} NasHttpEntry;

typedef struct NasHttpEntryList {
    NasHttpEntry *entry;
    int max;
    int count;
} NasHttpEntryList;

// Socket descriptor registered with CPS_SocRegister.
typedef struct NasHttpSocket {
    u8 unk_00[0xC];
    void *ssl; // 0x0C
    u8 unk_10[0x2C];
    u32 recvBufSize; // 0x3C
    void *recvBuf;   // 0x40
    u32 unk_44;
    u32 sendBufSize; // 0x48
    void *sendBuf;   // 0x4C
    u8 unk_50[0x14];
} NasHttpSocket;

// SSL connection state (secure connections only).
typedef struct NasHttpSsl {
    u8 unk_000[0x800];
    char *serverName; // 0x800
    u8 unk_804[0xC];
    int (*authCallback)(int); // 0x810
    u8 unk_814[0x1C];
} NasHttpSsl;

// One HTTP connection, 0x1C14 bytes. The receive thread (DWCi_Http_Thread) runs on threadStack.
typedef struct NasHttp {
    u8 threadStack[0x1000];
    u8 status; // 0x1000, 255 once the request is built
    u8 unk_1001[3];
    NasHttpParams params; // 0x1004
    int result;           // 0x1020, 8 = response received
    char url[256];        // 0x1024, host and path are cut out of this copy
    char *host;           // 0x1124
    char *path;           // 0x1128
    u32 ip;               // 0x112C
    int secure;           // 0x1130
    u16 port;             // 0x1134
    u16 unk_1136;
    NasHttpSocket socket;   // 0x1138
    NasHttpSsl ssl;         // 0x119C
    void *lowRecvBuf;       // 0x19CC
    void *lowSendBuf;       // 0x19D0
    u8 seed[32];            // 0x19D4
    int postFieldCount;     // 0x19F4
    NasHttpBuffer request;  // 0x19F8
    NasHttpBuffer response; // 0x1A08
    OSMutex recvMutex;      // 0x1A18
    int contentLength;      // 0x1A30, -1 until the header is parsed
    int received;           // 0x1A34, body bytes
    NasHttpEntry entry[32]; // 0x1A38
    OSThread thread;        // 0x1B38
    OSMutex stopMutex;      // 0x1BF8
    int stop;               // 0x1C10
} NasHttp;

// Parameters passed to DWCi_Auth_Start.
typedef struct AuthParams {
    u16 ingamesn[26];
    char gsbrcd[12];
    NasAllocFunc alloc;
    NasFreeFunc free;
} AuthParams;

// Parsed server response, 0x1C4 bytes, copied out by DWCi_Auth_GetResult.
typedef struct AuthResult {
    int error;         // 0x00, 20000 + returncd
    char returncd[4];  // 0x04
    char datetime[15]; // 0x08
    char locator[51];  // 0x17
    char token[301];   // 0x4A
    char challenge[9]; // 0x177
    char cookie[0x44]; // 0x180
} AuthResult;

// 0x13F4 bytes, allocated by DWCi_Auth_Start with the caller's allocator ("ALLOC DWCauth").
typedef struct AuthWork {
    u8 threadStack[0x1000];
    u32 unk_1000;
    int result;          // 0x1004
    AuthResult response; // 0x1008
    AuthParams params;   // 0x11CC
    u8 unk_1214[0x100];
    NasHttp *request; // 0x1314
    OSThread thread;  // 0x1318
    OSMutex mutex;    // 0x13D8
    int cancelled;    // 0x13F0
} AuthWork;

typedef struct AuthState {
    int state;      // 1 = authenticated, 2 = returncd 40
    int mode;       // 1 = include "iswfc"
    AuthWork *work; // ov00_0221A69C
    u64 userId;     // ov00_0221A6A0, the WiFi info
} AuthState;

// Filled in by DWCi_BM_GetWiFiInfo (ov00_0221A6A0 holds the console's copy).
typedef struct AuthWiFiInfo {
    u64 userId;
    u8 unk_08[12];
} AuthWiFiInfo;

// Request fields formatted by DWCi_Auth_FormatFields, 0x94 bytes of strings.
typedef struct AuthFields {
    char userid[14];  // 0x00
    char passwd[7];   // 0x0E
    char gamecd[5];   // 0x15
    char makercd[3];  // 0x1A
    char unitcd[2];   // 0x1D
    char macadr[13];  // 0x1F
    char lang[3];     // 0x2C
    char birth[5];    // 0x2F
    char devtime[13]; // 0x34
    char bssid[13];   // 0x41
    char ssid[33];    // 0x4E
    char apinfo[15];  // 0x6F
    u16 devname[11];  // 0x7E
} AuthFields;

typedef struct NetCheckCallbacks {
    NasAllocFunc alloc;
    NasFreeFunc free;
    void *param;
} NetCheckCallbacks;

// Connection test work ("DWCnetcheck"), 0x11F4 bytes; its thread runs DWCi_NetCheck_Thread on threadStack.
typedef struct NetCheckWork {
    u8 threadStack[0x1000];
    int state; // 0x1000, set by DWCi_NetCheck_SetState
    int error; // 0x1004
    u8 unk_1008[0x100];
    NetCheckCallbacks callbacks; // 0x1108
    char *body302;               // 0x1114, page of the 302 redirect
    char *bodyWayport;           // 0x1118
    OSThread thread;             // 0x111C
    OSMutex mutex;               // 0x11DC
} NetCheckWork;

// gDwcNetCheckState (the fields from redirected on are also labelled ov00_0221A6BC, httpParams
// ov00_0221A6D0 and authParams ov00_0221A6EC).
typedef struct NetCheckState {
    NetCheckWork *work;
    int redirected; // the test page was redirected (302)
    u32 ip;
    int mode;
    int unk_10;
    NasHttp *http; // "DWChttp"
    NasHttpParams httpParams;
    AuthParams authParams;
} NetCheckState;

// Service locator result, 0x174 bytes.
typedef struct SvcLocResult {
    int statusdata; // "Y"
    char svchost[65];
    char servicetoken[303];
} SvcLocResult;

// Service locator work ("intwork"), 0x1C20 bytes.
typedef struct SvcLocWork {
    NasAllocFunc alloc;
    NasFreeFunc free;
    NasHttp http;
    SvcLocResult *output;
} SvcLocWork;

extern NasHttpParams ov00_02216420; // auth server connection
extern AuthState gDwcAuthState;
extern NetCheckState gDwcNetCheckState;
extern NasHttpParams ov00_0221A6D0;
extern AuthParams ov00_0221A6EC;
extern SvcLocWork *gDwcSvcLocWork;

void DWCi_Auth_SetServerUrl(const char *url);
int DWCi_Auth_Start(AuthParams *params, NasHttp *request);
void DWCi_Auth_StartThread(void);
void DWCi_Auth_Abort(void);
void DWCi_Auth_Destroy(void);
void DWCi_Auth_Join(void);
int DWCi_Auth_GetState(void);
void DWCi_Auth_GetResult(AuthResult *out);
int DWCi_Auth_SendRequest(int mode);

void DWCi_Auth_Thread(void *arg);
int DWCi_Auth_HandleResponse(void);
int DWCi_Auth_ReadResponse(void);
int DWCi_Auth_AddPostFields(NasHttp *http, const char *gsbrcd, const u16 *ingamesn);
void DWCi_Auth_SetState(int result);
int DWCi_Auth_FormatFieldsFromBM(AuthFields *fields);
int DWCi_Auth_FormatFields(AuthFields *fields, AuthWiFiInfo *info);
int DWCi_Auth_AddCommonPostFields(NasHttp *http, AuthFields *fields, int withSsid);
int DWCi_Http_Create(NasHttp *http, NasHttpParams *params);

int DWCi_Http_FinishHeader(NasHttp *http);
void DWCi_Http_StartThread(NasHttp *http, int priority);
void DWCi_Http_Abort(NasHttp *http);
int DWCi_Http_CheckAbort(NasHttp *http);
void DWCi_Http_RegisterSocket(NasHttp *http);
int DWCi_Http_Resolve(NasHttp *http);
int DWCi_Http_CheckContentLength(NasHttp *http);
void DWCi_Http_Thread(NasHttp *http);
void DWCi_Http_Destroy(NasHttp *http);
int DWCi_Http_AddRequestLine(NasHttp *http);
int DWCi_Http_AddHeaderItem(NasHttp *http, const char *label, const char *value);
int DWCi_Http_AddPostItem(NasHttp *http, const char *label, const void *value, int len);
int DWCi_Http_AddString(NasHttp *http, const char *str);
int DWCi_Http_SslCheckCallback(int code);
int DWCi_Http_AllocBuffer(NasHttp *http, NasHttpBuffer *buf, u32 size);
void DWCi_Http_FreeBuffer(NasHttp *http, NasHttpBuffer *buf);
int DWCi_Http_GrowBuffer(NasHttp *http, NasHttpBuffer *buf, int grow);
int DWCi_Http_ParseUrl(NasHttp *http, const char *url);
int DWCi_Http_AddEntry(NasHttp *http, NasHttpEntryList *list, char *label, char *value);
int DWCi_Http_ParseResponse(NasHttp *http, int headerOnly);

char *DWCi_Http_GetEntry(NasHttp *http, char *label);
u32 DWCi_Http_GetBase64Entry(NasHttp *http, char *label, char *out, u32 size);
int DWCi_Http_GetStringEntry(NasHttp *http, char *label, char *out, int size);
void DWCi_Http_FreeEntries(NasHttp *http, NasHttpEntry *entry, int count);
int DWCi_NetCheck_Start(NetCheckCallbacks *callbacks);
void DWCi_NetCheck_Destroy(void);
void DWCi_NetCheck_Abort(void);
int DWCi_NetCheck_GetState(void);
int DWCi_NetCheck_GetError(void);
void DWCi_NetCheck_StartThread(void);
void DWCi_NetCheck_Thread(void *arg);
void DWCi_NetCheck_SetState(int state);
int DWCi_ParseServerDate(char *date);
int DWCi_Svl_Init(NasAllocFunc alloc, NasFreeFunc free);
void DWCi_Svl_Cleanup(void);
int DWCi_Svl_GetTokenAsync(const char *svc, SvcLocResult *output);
int DWCi_Svl_Process(void);
int DWCi_Svl_ReadResponse(void);

#endif // POKEHEARTGOLD_LIB_INCLUDE_DWC_AUTH_INTERNAL_H
