#include "global.h"

#include "dwc/http_socket_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

#pragma force_active on

extern OSThread gNhttpCleanupThread;
extern OSMessage gNhttpMessages[];
extern OSMutex gNhttpMutex;
extern OSMessageQueue gNhttpMessageQueue;
extern OSThread gNhttpThread;
extern s8 ov38_02224F87[]; // last character of the default boundary gNhttpDefaultBoundary

int NHTTP_Startup(void *(*allocFunc)(int size, int align), void (*freeFunc)(void *ptr), int priority) {
    gNhttpWork.allocFunc = allocFunc;
    gNhttpWork.freeFunc = freeFunc;
    gNhttpWork.error = 0;
    gNhttpWork.nextJobId = 0;
    gNhttpWork.jobs = NULL;
    gNhttpWork.currentJob = NULL;
    gNhttpWork.quit = 0;
    if (!NHTTPi_InitLock()) {
        gNhttpWork.error = 9;
        return 0;
    }
    gNhttpWork.threadStack = gNhttpWork.allocFunc(8192, 8);
    if (!gNhttpWork.threadStack) {
        gNhttpWork.error = 1;
        NHTTPi_DestroyLock();
        return 0;
    }
    if (NHTTPi_StartThread(priority, gNhttpWork.threadStack) == 0) {
        gNhttpWork.error = 9;
        gNhttpWork.freeFunc(gNhttpWork.threadStack);
        NHTTPi_DestroyLock();
        return 0;
    }
    gNhttpWork.running = 1;
    return 1;
}

void NHTTP_CleanupAsync(void (*callback)(void)) {
    OS_CreateThread(&gNhttpCleanupThread, NHTTPi_CleanupThread, callback, gNhttpMessages, 2048, 16);
    OS_WakeupThreadDirect(&gNhttpCleanupThread);
}

void NHTTPi_CleanupThread(void *callback) {
    NHTTPi_CancelAllRequests();
    NHTTPi_StopThread();
    gNhttpWork.freeFunc(gNhttpWork.threadStack);
    NHTTPi_DestroyLock();
    gNhttpWork.running = 0;
    ((void (*)(void))callback)();
}

static inline void HttpField_Append(HttpField **list, HttpField *field) {
    if (*list) {
        field->prev = (*list)->prev;
        field->next = *list;
        (*list)->prev->next = field;
        (*list)->prev = field;
    } else {
        field->next = field;
        field->prev = field;
        *list = field;
    }
}

int NHTTPi_SetField(HttpField **list, const char *name, const char *value, int nodeSize) {
    HttpField *first = *list;
    int found = 0;
    HttpField *field;
    if (first) {
        field = first;
        if (NHTTPi_CompareFieldName(name, first->name) != 0) {
            for (field = first->next; field != *list; field = field->next) {
                if (NHTTPi_CompareFieldName(name, field->name) == 0) {
                    found = 1;
                    break;
                }
            }
        } else {
            found = 1;
        }
    }
    if (found) {
        field->value = value;
    } else {
        HttpField *newField = ov38_02226218(nodeSize, 4);
        if (!newField) {
            ov38_02226214 = 1;
            return 0;
        }
        newField->name = name;
        newField->value = value;
        newField->length = 0;
        newField->isFile = 0;
        HttpField_Append(list, newField);
    }
    return 1;
}

HttpField *NHTTPi_PopListHead(HttpField **list) {
    HttpField *field = *list;
    if (field) {
        if (field == field->prev) {
            *list = NULL;
        } else {
            field->prev->next = field->next;
            field->next->prev = field->prev;
            *list = field->next;
        }
    }
    return field;
}

// Next boundary character: 0-9, then A-Z, then a-z, then 0 again.
int NHTTPi_NextBoundaryChar(u8 ch) {
    ch++;
    if (ch == 123) {
        ch = 48;
    } else if (ch == 91) {
        ch = 97;
    } else if (ch == 58) {
        ch = 65;
    }
    return (s8)ch;
}

// Changes the request's multipart boundary (HttpRequest.boundary, at +0x44) until the POST value
// does not contain it. Takes the request as bytes: a typed pointer changes the code.
int NHTTPi_UpdateBoundary(char *request, const char *value, int length) {
    int ch;
    s8 *key;
    char *position;
    int index;
    if (NHTTPi_FindBytes(value, length, request + 0x46, 18) < 0) {
        return 1;
    }
    key = ov38_02224F87;
    for (index = 19; index >= 2; index--, key--) {
        position = request + index;
        ch = (signed char)position[0x44];
        for (;;) {
            ch = NHTTPi_NextBoundaryChar((u8)ch);
            position[0x44] = ch;
            if (ch == *key) {
                break;
            }
            if (NHTTPi_FindBytes(value, length, request + 0x46, 18) < 0) {
                return 1;
            }
        }
    }
    return 0;
}

int NHTTP_AddHeaderField(HttpRequest *request, const char *name, const char *value) {
    if (request->queued) {
        return 0;
    }
    return NHTTPi_SetField(&request->headers, name, value, sizeof(HttpField));
}

int NHTTP_AddPostDataAscii(HttpRequest *request, const char *name, const char *value) {
    int ok = 0;
    int length;
    if (request->queued) {
        return 0;
    }
    length = NHTTPi_StrLen(value);
    if (NHTTPi_UpdateBoundary((char *)request, value, length)) {
        ok = NHTTPi_SetField(&request->posts, name, value, sizeof(HttpField));
        if (ok) {
            request->posts->prev->length = length;
        }
    }
    return ok;
}

int NHTTPi_SetSslCaInfo(HttpRequest *request, int unk_1C, int unk_18) {
    if (request->queued) {
        return 0;
    }
    request->rootCas = unk_1C;
    request->rootCaCount = unk_18;
    return 1;
}

int NHTTPi_AddJob(HttpRequest *request) {
    int result = -1;
    HttpJob *job = ov38_02226218(sizeof(HttpJob), 4);
    if (job) {
        if (ov38_02226230) {
            job->prev = ov38_02226230->prev;
            job->next = ov38_02226230;
            ov38_02226230->prev->next = job;
            *(HttpJob *volatile *)&ov38_02226230->prev = job;
        } else {
            job->prev = job;
            job->next = job;
            ov38_02226230 = job;
        }
        {
            int id = ov38_0222622C;
            ov38_0222622C = (int)((u32)ov38_0222622C + 1);
            job->id = id;
        }
        job->request = request;
        job->socket = -1;
        result = job->id;
        if (ov38_0222622C < 0) {
            ov38_0222622C = 0;
        }
    }
    return result;
}

HttpJob *NHTTPi_FindJob(int id) {
    HttpJob *result = NULL;
    HttpJob *const head = ov38_02226230;
    if (head) {
        if (head->id == id) {
            result = head;
        } else {
            HttpJob *job = head->next;
            while (job != head) {
                if (job->id == id) {
                    result = job;
                    break;
                }
                job = job->next;
            }
        }
    }
    return result;
}

int NHTTPi_CancelQueuedJob(int id) {
    int result = 0;
    HttpJob *job = NHTTPi_FindJob(id);
    if (job) {
        if (ov38_02226230 != ov38_02226230->prev) {
            job->prev->next = job->next;
            job->next->prev = job->prev;
            if (ov38_02226230 == job) {
                ov38_02226230 = job->next;
            }
        } else {
            ov38_02226230 = NULL;
        }
        {
            HttpRequest *request = job->request;
            HttpSocketCallback callback = request->callback;
            HttpResponse *response = request->response;
            void *param = request->param;
            NHTTPi_DestroyRequest(request);
            ov38_0222621C(job);
            callback(8, response, param);
        }
        result = 1;
    }
    return result;
}

void NHTTPi_CancelAllQueuedJobs(void) {
    while (ov38_02226230) {
        NHTTPi_CancelQueuedJob(ov38_02226230->id);
    }
}

HttpJob *NHTTPi_PopJob(void) {
    return (HttpJob *)NHTTPi_PopListHead((HttpField **)&ov38_02226230);
}

int NHTTPi_InitLock(void) {
    OS_InitMutex(&gNhttpMutex);
    return 1;
}

void NHTTPi_DestroyLock(void) {
}

void NHTTPi_Lock(void) {
    OS_LockMutex(&gNhttpMutex);
}

void NHTTPi_Unlock(void) {
    OS_UnlockMutex(&gNhttpMutex);
}

int NHTTPi_StartThread(int priority, u8 *stack) {
    if (!OS_IsThreadAvailable()) {
        return 0;
    }
    OS_InitMessageQueue(&gNhttpMessageQueue, gNhttpMessages, 1);
    OS_CreateThread(&gNhttpThread, NHTTPi_ThreadMain, NULL, stack + 8192, 8192, priority);
    OS_WakeupThreadDirect(&gNhttpThread);
    return 1;
}

void NHTTPi_StopThread(void) {
    ov38_02226224 = 1;
    NHTTPi_WakeThread();
    OS_JoinThread(&gNhttpThread);
}

void NHTTPi_WaitForJob(void) {
    OSMessage message;
    OS_ReceiveMessage(&gNhttpMessageQueue, &message, 1);
}

int NHTTPi_WakeThread(void) {
    return OS_SendMessage(&gNhttpMessageQueue, 0, 0);
}

// Header byte pos lives in bytes[] for the first 1024 bytes, then in 512-byte chunks.
void NHTTPi_SeekResponse(HttpResponse *response, int pos, HttpResponseChunk **chunk, int *offset) {
    int count;
    HttpResponseChunk *cur;
    if (pos < 1024) {
        *chunk = NULL;
        *offset = pos;
        return;
    }
    count = (pos - 1024) >> 9;
    cur = response->chunks;
    while (count--) {
        cur = cur->next;
    }
    *chunk = cur;
    *offset = (pos - 1024) & 511;
}

int NHTTPi_ReadResponseByte(HttpResponse *response, HttpResponseChunk **chunk, int *offset) {
    int i;
    if (!*chunk) {
        if (*offset < 1024) {
            i = (*offset)++;
            return response->bytes[i];
        }
        *offset = 0;
        *chunk = response->chunks;
    } else if (*offset == 512) {
        *offset = 0;
        *chunk = (*chunk)->next;
    }
    i = (*offset)++;
    return (*chunk)->bytes[i];
}

// Returns the start of the header line after begin (0 at the end of the header, -1 if none) and
// the position of the line's first ':' in *colon.
int NHTTPi_FindNextLine(HttpResponse *response, int begin, int end, int *colon) {
    HttpResponseChunk *chunk;
    int offset, cr = 0;
    if (colon) {
        *colon = -1;
    }
    if (begin < end) {
        NHTTPi_SeekResponse(response, begin, &chunk, &offset);
        for (; begin < end; begin++) {
            int c = NHTTPi_ReadResponseByte(response, &chunk, &offset);
            if (c == ':' && colon && *colon < 0) {
                *colon = begin;
            }
            if (!cr) {
                if (c == '\r') {
                    cr = 1;
                }
            } else {
                if (c == '\n') {
                    if (begin == end - 1) {
                        return 0;
                    }
                    return begin + 1;
                }
                cr = 0;
            }
        }
    }
    return -1;
}

int NHTTPi_SkipSpaces(HttpResponse *response, int begin, int end) {
    HttpResponseChunk *chunk;
    int offset;
    if (begin < end) {
        NHTTPi_SeekResponse(response, begin, &chunk, &offset);
        for (; begin < end; begin++) {
            if (NHTTPi_ReadResponseByte(response, &chunk, &offset) != ' ') {
                return begin;
            }
        }
    }
    return -1;
}

static inline BOOL HttpChar_EqualsFolded(int c, int ch) {
    int upper = 0;
    int rhs;
    if (ch >= 'A' && ch <= 'Z') {
        upper = 1;
    }
    rhs = upper ? ch + 32 : ch;
    if (c >= 'A' && c <= 'Z') {
        c += 32;
    }
    return c == rhs;
}

// Case-insensitive match of str (up to its end, a space or stop) at the header position start.
int NHTTPi_CompareHeader(HttpResponse *response, int begin, int end, const char *str, int stop) {
    HttpResponseChunk *chunk;
    int offset, c;
    s8 ch;
    if (begin < end) {
        NHTTPi_SeekResponse(response, begin, &chunk, &offset);
        c = NHTTPi_ReadResponseByte(response, &chunk, &offset);
        end--;
        while (HttpChar_EqualsFolded(c, ch = *str)) {
            if (ch == 0 || ch == ' ' || ch == stop || begin == end) {
                return 0;
            }
            c = NHTTPi_ReadResponseByte(response, &chunk, &offset);
            begin++;
            str++;
        }
    }
    return -1;
}

// Copies size bytes of the header from offset.
int NHTTPi_CopyHeader(HttpResponse *response, void *out, int offset, int size) {
    int n, index;
    HttpResponseChunk *chunk;
    u8 *dst = out;
    if (offset + size <= response->headerLength) {
        if (size) {
            if (offset < 1024) {
                n = 1024 - offset;
                if (size <= n) {
                    n = size;
                }
                NHTTPi_MemCopy(dst, response->bytes + offset, n);
                offset += n;
                size -= n;
                dst += n;
            }
            if (size) {
                offset -= 1024;
                index = offset >> 9;
                offset &= 511;
                int blocks = index;
                index--;
                chunk = response->chunks;
                if (blocks) {
                    do {
                        chunk = chunk->next;
                    } while (index-- != 0);
                }
                while (size) {
                    n = 512 - offset;
                    if (size <= n) {
                        n = size;
                    }
                    NHTTPi_MemCopy(dst, chunk->bytes + offset, n);
                    offset = (offset + n) & 511;
                    size -= n;
                    dst += n;
                    chunk = chunk->next;
                }
            }
        }
        return 1;
    }
    return 0;
}

int NHTTPi_IsBodyFull(HttpResponse *response, u32 length) {
    return (u32)response->bodyCapacity <= length;
}

int NHTTPi_RecvBody(HttpRequest *request, int socket, int offset, int flags) {
    HttpResponse *response = request->response;
    return NHTTPi_Recv(request, socket, response->body + offset, response->bodyCapacity - offset, flags);
}

int NHTTPi_RecvBodySize(HttpRequest *request, int socket, int offset, int size, int flags) {
    HttpResponse *response = request->response;
    int left;
    if (NHTTPi_IsBodyFull(response, offset)) {
        return -1003;
    }
    left = response->bodyCapacity - offset;
    if (size <= left) {
        left = size;
    }
    return NHTTPi_Recv(request, socket, response->body + offset, left, flags);
}
