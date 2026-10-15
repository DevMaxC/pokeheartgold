#pragma force_active on
#include "global.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

typedef void *(*Ov38AllocFunc)(u32 size, int align);
typedef void (*Ov38FreeFunc)(void *ptr);

typedef struct Ov38Work {
    void (*shutdownCallback)(void); // 0x00
    int hasApInfo;                  // 0x04
    char *token;                    // 0x08
    Ov38AllocFunc allocFunc;        // 0x0C
    char *url;                      // 0x10
    int active;                     // 0x14
    int callback;                   // 0x18
    int error;                      // 0x1C
    Ov38FreeFunc freeFunc;          // 0x20
    int requestId;                  // 0x24
    char *strings[3];               // 0x28, base64-encoded copies, see NdEngine_SetAttr
} Ov38Work;

extern Ov38Work gNdWork;
// fields of gNdWork that the code addresses through their own labels
extern Ov38AllocFunc ov38_0222605C; // .allocFunc
extern int ov38_0222606C;           // .error
extern Ov38FreeFunc ov38_02226070;  // .freeFunc
extern int ov38_02226074;           // .unk_24
extern char *ov38_02226078[3];      // .strings

// "00:0000000-00"
typedef struct Ov38Text13 {
    char chars[13];
} Ov38Text13;

typedef struct Ov38Info {
    int apType;
    int spotType;
} Ov38Info;

Ov38Info ov38_022260FC;

extern const char gNdBase64Alphabet[]; // base64 alphabet ending in ".-", padding '*'
extern Ov38Text13 gNdApInfoTemplate;
extern char ov38_02226104[];
extern char gNdGameCode[];
extern char gNdMacAddress[];
extern char gNdApInfo[];
extern char gNdPassword[];
extern char gNdUserAgent[];

void NdEngine_FormatSdkVersion(void *);
int NdEngine_InitLock(void);
void NdEngine_DestroyLock(void);
void NdEngine_Lock(void);
void NdEngine_Unlock(void);
int NdEngine_InitBusyFlag(void);
void NdEngine_DestroyBusyFlag(void);
int NdEngine_TrySetBusy(void);
void NdEngine_ClearBusy(void);
void NdEngine_FormatMacAddress(void *);
int NdEngine_StrLen(const char *str);
void NdEngine_MemCopy(char *dst, const char *src, int n);
int NHTTP_Startup(Ov38AllocFunc allocFunc, Ov38FreeFunc freeFunc, int count);
void NHTTP_CleanupAsync(void (*func)(void));
int NHTTP_CancelRequestAsync(int);
int DWC_GetApInfo(Ov38Info *info);
void NdEngine_FormatDecimal(char *buf, int value);

void NdEngine_FreeAttrs(void);
int NdEngine_SetAttr(int i, const char *str);
int NdEngine_SetAttrs(const char *a, const char *b, const char *c);
int NdEngine_CopyPadded(char *out, const char *in, int size);
int NdEngine_Base64CharValue(unsigned ch);
int NdEngine_Base64DecodedSize(int encodedLen);
int NdEngine_Base64EncodedSize(int len);
int NdEngine_Base64Encode(char *out, const char *in, int len);
int NdEngine_Base64Decode(char *out, const char *in, int len);
char *NdEngine_StrDup(const char *str);
int NdEngine_Init(Ov38AllocFunc allocFunc, Ov38FreeFunc freeFunc, const char *a, const char *b, const char *small, const char *big, int value);
void NdEngine_CleanupFinish(void);
void NdEngine_CleanupAsync(void (*callback)(void));
int NdEngine_CancelAsync(void);
int NdEngine_FormatApInfo(char *out);

void NdEngine_FreeAttrs(void) {
    int i;
    for (i = 0; i < 3; i++) {
        if (ov38_02226078[i]) {
            ov38_02226070(ov38_02226078[i]);
            ov38_02226078[i] = NULL;
        }
    }
}

int NdEngine_SetAttr(int i, const char *str) {
    int len;
    int encodedLen;
    if (*str) {
        if (NdEngine_StrLen(str) > 10) {
            ov38_0222606C = 7;
            return 0;
        }
        len = NdEngine_StrLen(str);
        if (len > 10) {
            ov38_0222606C = 7;
            return 0;
        }
        ov38_02226078[i] = ov38_0222605C(NdEngine_Base64EncodedSize(len) + 1, 4);
        if (!ov38_02226078[i]) {
            ov38_0222606C = 1;
            return 0;
        }
        encodedLen = NdEngine_Base64Encode(ov38_02226078[i], str, len);
        ov38_02226078[i][encodedLen] = '\0';
    }
    return 1;
}

int NdEngine_SetAttrs(const char *a, const char *b, const char *c) {
    NdEngine_Lock();
    NdEngine_FreeAttrs();
    if (NdEngine_SetAttr(0, a) && NdEngine_SetAttr(1, b) && NdEngine_SetAttr(2, c)) {
        NdEngine_Unlock();
        return 1;
    }
    NdEngine_FreeAttrs();
    NdEngine_Unlock();
    return 0;
}

// Copies `size` bytes, padding with zeros after the end of `in`; returns the characters copied.
int NdEngine_CopyPadded(char *out, const char *in, int size) {
    u32 i;
    int count = 0;
    i = count;
    for (; (s32)i < size; i++) {
        if (*in != 0) {
            char c = *in;
            count++;
            in++;
            *out++ = c;
        } else {
            *out++ = 0;
        }
    }
    return count;
}

// Value of one character of the gNdBase64Alphabet alphabet, -1 if it is not part of it.
int NdEngine_Base64CharValue(unsigned ch) {
    if (ch >= 'A' && ch <= 'Z') {
        return ch - 'A';
    }
    if (ch >= 'a' && ch <= 'z') {
        return ch - 71;
    }
    if (ch >= '0' && ch <= '9') {
        return ch + 4;
    }
    if (ch == '.') {
        return 62;
    }
    if (ch == '-') {
        return 63;
    }
    return -1;
}

int NdEngine_Base64DecodedSize(int encodedLen) {
    return (encodedLen >> 2) * 3;
}

int NdEngine_Base64EncodedSize(int len) {
    return ((len + 2) / 3) << 2;
}

// Base64 with the gNdBase64Alphabet alphabet.
int NdEngine_Base64Encode(char *out, const char *in, int len) {
    u8 buf[3];
    int n;
    u8 i0;
    u8 i1;
    u8 i2;
    u8 i3;
    int total = 0;
    n = NdEngine_CopyPadded((char *)buf, in, len > 3 ? 3 : len);
    while (n > 0) {
        if (len < 3) {
            buf[2] = 0;
        }
        if (len < 2) {
            buf[1] = 0;
        }
        i0 = buf[0] >> 2;
        i1 = ((buf[0] << 4) | (buf[1] >> 4)) & 0x3F;
        i2 = ((buf[1] << 2) | (buf[2] >> 6)) & 0x3F;
        i3 = buf[2] & 0x3F;
        out[0] = gNdBase64Alphabet[i0];
        out[1] = gNdBase64Alphabet[i1];
        out[2] = n > 1 ? gNdBase64Alphabet[i2] : '*';
        out[3] = n > 2 ? gNdBase64Alphabet[i3] : '*';
        in += n;
        out += 4;
        total += 4;
        len -= n;
        if (len == 0) {
            break;
        }
        n = NdEngine_CopyPadded((char *)buf, in, len > 3 ? 3 : len);
    }
    *out = '\0';
    return total;
}

int NdEngine_Base64Decode(char *out, const char *in, int len) {
    struct {
        s8 decoded[3];
        char encoded[4];
    } buf;

    int value;
    int n;
    int count;
    count = 0;
    n = NdEngine_CopyPadded(buf.encoded, in, 4);
    value = count;
    while (n > 0 && value >= 0) {
        buf.decoded[0] = 0;
        buf.decoded[1] = 0;
        buf.decoded[2] = 0;
        value = NdEngine_Base64CharValue((u8)buf.encoded[0]);
        if (value >= 0) {
            buf.decoded[0] = value << 2;
            value = NdEngine_Base64CharValue((u8)buf.encoded[1]);
            if (value >= 0) {
                buf.decoded[0] |= value >> 4;
                buf.decoded[1] = value << 4;
                value = NdEngine_Base64CharValue((u8)buf.encoded[2]);
                if (value >= 0) {
                    buf.decoded[1] |= value >> 2;
                    buf.decoded[2] = value << 6;
                    value = NdEngine_Base64CharValue((u8)buf.encoded[3]);
                    if (value >= 0) {
                        buf.decoded[2] |= value;
                    }
                }
            }
        }
        {
            int limit = n - 1;
            int i = 0;
            if (limit > 0) {
                s8 *p = buf.decoded;
                do {
                    *out++ = *p++;
                    i++;
                } while (i < limit);
            }
        }
        in += n;
        count += n - 1;
        len -= 4;
        if (len <= 0) {
            break;
        }
        n = NdEngine_CopyPadded(buf.encoded, in, 4);
    }
    return count;
}

char *NdEngine_StrDup(const char *str) {
    int len = NdEngine_StrLen(str);
    char *copy = gNdWork.allocFunc(len + 1, 4);
    if (copy) {
        NdEngine_MemCopy(copy, str, len);
        copy[len] = '\0';
    }
    return copy;
}

int NdEngine_Init(Ov38AllocFunc allocFunc, Ov38FreeFunc freeFunc, const char *a, const char *b, const char *small, const char *big, int value) {
    gNdWork.allocFunc = allocFunc;
    gNdWork.freeFunc = freeFunc;
    gNdWork.callback = value;
    gNdWork.error = 0;
    gNdWork.strings[0] = NULL;
    gNdWork.strings[1] = NULL;
    gNdWork.strings[2] = NULL;
    gNdWork.hasApInfo = 0;
    gNdWork.requestId = -1;
    gNdWork.token = NULL;
    gNdWork.url = NULL;
    NdEngine_FormatMacAddress(gNdMacAddress);
    NdEngine_FormatSdkVersion(gNdUserAgent);
    if (!(gNdWork.url = NdEngine_StrDup(a))) {
        goto failed;
    }
    if (!(gNdWork.token = NdEngine_StrDup(b))) {
        goto failed;
    }
    gNdGameCode[NdEngine_Base64Encode(gNdGameCode, small, 4)] = '\0';
    gNdPassword[NdEngine_Base64Encode(gNdPassword, big, 16)] = '\0';
    if (NdEngine_InitBusyFlag() && NdEngine_InitLock()) {
        if (NHTTP_Startup(allocFunc, freeFunc, 10)) {
            gNdWork.hasApInfo = NdEngine_FormatApInfo(gNdApInfo);
            gNdWork.active = 1;
            return 1;
        }
        NdEngine_DestroyLock();
    }
    gNdWork.freeFunc(gNdWork.token);
    gNdWork.freeFunc(gNdWork.url);
    gNdWork.error = 8;
    return 0;
failed:
    if (gNdWork.token) {
        gNdWork.freeFunc(gNdWork.token);
    }
    if (gNdWork.url) {
        gNdWork.freeFunc(gNdWork.url);
    }
    gNdWork.error = 1;
    return 0;
}

void NdEngine_CleanupFinish(void) {
    NdEngine_FreeAttrs();
    NdEngine_DestroyLock();
    NdEngine_DestroyBusyFlag();
    gNdWork.freeFunc(gNdWork.token);
    gNdWork.freeFunc(gNdWork.url);
    gNdWork.shutdownCallback();
}

void NdEngine_CleanupAsync(void (*callback)(void)) {
    gNdWork.active = 0;
    gNdWork.shutdownCallback = callback;
    NHTTP_CleanupAsync(NdEngine_CleanupFinish);
}

int NdEngine_CancelAsync(void) {
    int x;
    if (!NdEngine_TrySetBusy()) {
        NdEngine_Lock();
        x = ov38_02226074;
        NdEngine_Unlock();
        return NHTTP_CancelRequestAsync(x);
    }
    NdEngine_ClearBusy();
    return 0;
}

int NdEngine_FormatApInfo(char *out) {
    Ov38Text13 text = gNdApInfoTemplate;
    if (DWC_GetApInfo(&ov38_022260FC)) {
        if (ov38_022260FC.apType >= 0 && ov38_022260FC.apType < 10) {
            text.chars[1] = ov38_022260FC.apType + '0';
        } else if (ov38_022260FC.apType >= 10 && ov38_022260FC.apType < 100) {
            NdEngine_FormatDecimal(text.chars, ov38_022260FC.apType);
        }
        if (ov38_022260FC.apType == 4 || ov38_022260FC.apType == 8) {
            if (ov38_022260FC.spotType >= 0 && ov38_022260FC.spotType < 10) {
                text.chars[3] = ov38_022260FC.spotType + '0';
            }
            NdEngine_MemCopy(text.chars + 4, ov38_02226104, 9);
        }
        NdEngine_Base64Encode(out, text.chars, 13);
        return 1;
    }
    return 0;
}
