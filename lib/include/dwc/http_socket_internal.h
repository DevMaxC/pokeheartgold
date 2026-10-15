#ifndef POKEHEARTGOLD_LIB_INCLUDE_DWC_HTTP_SOCKET_INTERNAL_H
#define POKEHEARTGOLD_LIB_INCLUDE_DWC_HTTP_SOCKET_INTERNAL_H

// Socket HTTP client of OVY_38 (lib/NitroDWC/src/http_socket_queue.c, http_socket_request.c,
// http_socket_worker.c): requests are queued as jobs and processed one at a time by a worker
// thread that resolves the host, connects (optionally over SSL), sends the request line, headers
// and POST body, then receives the response headers and body.

enum {
    HTTP_SOCKET_METHOD_GET = 0,
    HTTP_SOCKET_METHOD_POST = 1,
    HTTP_SOCKET_METHOD_HEAD = 2,
};

// Node of a circular doubly linked header or POST field list; the list pointer is its first node.
typedef struct HttpField {
    struct HttpField *prev; // 0x00, the last node for the first one
    struct HttpField *next; // 0x04
    const char *name;       // 0x08
    const char *value;      // 0x0C
    int length;             // 0x10, POST fields: length of value
    int isFile;             // 0x14, POST fields: sent as a multipart file part
} HttpField;

// One block of the response header storage after the first 1024 bytes.
typedef struct HttpResponseChunk {
    struct HttpResponseChunk *next; // 0x00
    char bytes[512];                // 0x04
} HttpResponseChunk;

typedef struct HttpResponse {
    volatile int headerLength; // 0x00, bytes of response header stored in bytes/chunks
    volatile int bodyLength;   // 0x04, bytes of body stored in body
    int success;               // 0x08
    int bodyCapacity;          // 0x0C
    void *unk_10;              // 0x10
    char *headerValue;         // 0x14, copy returned by NHTTP_GetHeaderField
    char *body;                // 0x18, caller-supplied storage
    HttpResponseChunk *chunks; // 0x1C
    char bytes[1024];          // 0x20
} HttpResponse;

typedef struct HttpSslConnection {
    u8 unk_000[0x800];
    char *host; // 0x800
    u8 unk_804[0xC];
    int (*authCallback)(int); // 0x810
    int rootCas;              // 0x814
    int rootCaCount;          // 0x818
    u8 unk_81C[0x14];
} HttpSslConnection;

typedef void (*HttpSocketCallback)(int error, HttpResponse *response, void *param);

typedef struct HttpRequest {
    int queued;                  // 0x00, set once the request is queued; fields are fixed then
    int cancel;                  // 0x04
    int secure;                  // 0x08, https://
    int hostEnd;                 // 0x0C, offset of the end of the host name in url
    int pathStart;               // 0x10, offset of the path in url
    int contentLength;           // 0x14, -1 when the response has no Content-Length
    int rootCaCount;             // 0x18
    int rootCas;                 // 0x1C
    HttpSslConnection *ssl;      // 0x20
    char *url;                   // 0x24, without %-escapes in the host part
    int port;                    // 0x28
    void *param;                 // 0x2C
    HttpResponse *response;      // 0x30
    HttpField *headers;          // 0x34
    HttpField *posts;            // 0x38
    HttpSocketCallback callback; // 0x3C
    int method;                  // 0x40, HTTP_SOCKET_METHOD_*
    char boundary[20];           // 0x44, "--" + multipart boundary, changed until no POST value contains it
} HttpRequest;

// Node of the circular job queue (ov38_02226230) and the job being processed (ov38_02226220).
typedef struct HttpJob {
    struct HttpJob *prev;          // 0x00
    struct HttpJob *next;          // 0x04
    int id;                        // 0x08
    HttpRequest *volatile request; // 0x0C
    int socket;                    // 0x10
} HttpJob;

// Client state at gNhttpWork; the code also addresses most fields through their own labels.
typedef struct HttpSocketWork {
    int running;                             // 0x00
    int error;                               // 0x04, ov38_02226214
    void *(*allocFunc)(int size, int align); // 0x08, ov38_02226218
    void (*freeFunc)(void *ptr);             // 0x0C, ov38_0222621C
    HttpJob *currentJob;                     // 0x10, ov38_02226220
    int quit;                                // 0x14, ov38_02226224
    u8 *threadStack;                         // 0x18
    int nextJobId;                           // 0x1C, ov38_0222622C
    HttpJob *jobs;                           // 0x20, ov38_02226230
} HttpSocketWork;

extern HttpSocketWork gNhttpWork;
extern int ov38_02226214;
extern void *(*ov38_02226218)(int size, int align);
extern void (*ov38_0222621C)(void *ptr);
extern HttpJob *ov38_02226220;
extern int ov38_02226224;
extern volatile int ov38_0222622C;
extern HttpJob *ov38_02226230;

// http_engine_init.c
int NdEngine_Base64DecodedSize(int encodedLen);
int NdEngine_Base64EncodedSize(int len);
int NdEngine_Base64Encode(char *out, const char *in, int len);
int NdEngine_Base64Decode(char *out, const char *in, int len);

// http_socket_queue.c
int NHTTP_Startup(void *(*allocFunc)(int size, int align), void (*freeFunc)(void *ptr), int priority);
void NHTTP_CleanupAsync(void (*callback)(void));
void NHTTPi_CleanupThread(void *callback);
int NHTTPi_SetField(HttpField **list, const char *name, const char *value, int nodeSize);
HttpField *NHTTPi_PopListHead(HttpField **list);
int NHTTPi_NextBoundaryChar(u8 ch);
int NHTTPi_UpdateBoundary(char *request, const char *value, int length);
int NHTTP_AddHeaderField(HttpRequest *request, const char *name, const char *value);
int NHTTP_AddPostDataAscii(HttpRequest *request, const char *name, const char *value);
int NHTTPi_SetSslCaInfo(HttpRequest *request, int unk_1C, int unk_18);
int NHTTPi_AddJob(HttpRequest *request);
HttpJob *NHTTPi_FindJob(int id);
int NHTTPi_CancelQueuedJob(int id);
void NHTTPi_CancelAllQueuedJobs(void);
HttpJob *NHTTPi_PopJob(void);
int NHTTPi_InitLock(void);
void NHTTPi_DestroyLock(void);
void NHTTPi_Lock(void);
void NHTTPi_Unlock(void);
int NHTTPi_StartThread(int priority, u8 *stack);
void NHTTPi_StopThread(void);
void NHTTPi_WaitForJob(void);
int NHTTPi_WakeThread(void);
void NHTTPi_SeekResponse(HttpResponse *response, int pos, HttpResponseChunk **chunk, int *offset);
int NHTTPi_ReadResponseByte(HttpResponse *response, HttpResponseChunk **chunk, int *offset);
int NHTTPi_FindNextLine(HttpResponse *response, int begin, int end, int *colon);
int NHTTPi_SkipSpaces(HttpResponse *response, int begin, int end);
int NHTTPi_CompareHeader(HttpResponse *response, int begin, int end, const char *str, int stop);
int NHTTPi_CopyHeader(HttpResponse *response, void *out, int offset, int size);
int NHTTPi_IsBodyFull(HttpResponse *response, u32 length);
int NHTTPi_RecvBody(HttpRequest *request, int socket, int offset, int flags);
int NHTTPi_RecvBodySize(HttpRequest *request, int socket, int offset, int size, int flags);

// http_socket_request.c
HttpRequest *NHTTP_CreateRequest(const char *url, int method, void *body, int bodyCapacity, HttpSocketCallback callback, void *param);
void NHTTPi_DestroyRequestAndResponse(HttpRequest *request);
void NHTTPi_FreeFieldList(HttpField *list);
int NHTTPi_DestroyRequest(HttpRequest *request);
int NHTTP_SendRequestAsync(HttpRequest *request);
int NHTTP_CancelRequestAsync(int id);
void NHTTPi_CancelAllRequests(void);
u32 NHTTPi_ResolveHost(HttpRequest *request);
void NHTTP_DestroyResponse(HttpResponse *response);
int NHTTPi_FindHeaderField(HttpResponse *response, const char *name, int *valueStart);
int NHTTP_GetHeaderField(HttpResponse *response, const char *name, char **value);
int NHTTP_GetBodyAll(HttpResponse *response, char **body);
int NHTTPi_SslCheckCallback(int result);
void NHTTPi_AddSslRandomSeed(void);
int NHTTPi_CreateSocket(HttpRequest *request);
int NHTTPi_CloseSocket(HttpRequest *request, int socket);
int NHTTPi_CloseSocketWait(HttpRequest *request, int socket);
int NHTTPi_Connect(HttpRequest *request, int socket, int ip, int port);
int NHTTPi_Recv(HttpRequest *request, int socket, void *buf, int size, int flags);
int NHTTPi_Send(HttpRequest *request, int socket, const void *buf, int size, int flags);
void NHTTPi_ShutdownSocket(HttpRequest *request, int socket);
int NHTTPi_CompareString(const char *a, const char *b);
int NHTTPi_CompareStringNoCase(const char *a, const char *b, int n);
u32 NHTTPi_StrLen(const char *str);
void NHTTPi_MemClear(void *dst, int size);
void NHTTPi_MemCopy(void *dst, const void *src, int size);
int NHTTP_GetProgress(int *received, int *total);
int NHTTPi_BufferedSend(HttpRequest *request, int socket, int *used, const char *src, int size);
int NHTTPi_SkipLine(HttpRequest *request, int socket);
void NHTTPi_FreeSslConnection(HttpSslConnection *ssl);
void NHTTPi_DeferSocketClose(int socket, HttpSslConnection **ssl);
void NHTTPi_CloseDeferredSockets(void);

// http_socket_worker.c
void NHTTPi_ThreadMain(void *arg);
int NHTTPi_UrlEncodedLength(const char *str);
int NHTTPi_UrlEncodeChar(char *out, int ch);
int NHTTPi_ParseHex(const char *str, int length);
int NHTTPi_ParseDecimal(const char *str, int length);
int NHTTPi_FormatDecimal(char *out, u32 value);
int NHTTPi_CompareFieldName(const char *a, const char *b);
int NHTTPi_ParsePort(const char *str, int length);
int NHTTPi_FindBytes(const char *data, int dataLength, const char *pattern, int patternLength);

#endif // POKEHEARTGOLD_LIB_INCLUDE_DWC_HTTP_SOCKET_INTERNAL_H
