#pragma force_active on
#include "global.h"

#include "dwc/match_internal.h"
#include "dwc/transport_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

#pragma warn_unusedvar off
#pragma warn_uninitializedvar off

// Data transport between the matched peers: reliable sends split into chunks behind an 8-byte "DT"
// header, unreliable sends, per-aid receive buffers and timeouts. The file starts with the end of the
// matchmaking code (retry check and the matchmaking work accessors).

// Header in front of every reliable send, 8 bytes.
typedef struct TransportHeader {
    u32 size;
    u16 type;      // 0x04
    char magic[2]; // 0x06, "DT"
} TransportHeader;

extern Transport *gDwcTransport;
extern char sStr_DT[]; // "DT"

extern int memcmp(const void *, const void *, u32);
extern char *strncpy(char *, const char *, u32);
extern int DWCi_IsError(void);
extern void DWCi_SetError(int, int);
extern int DWC_GetMyAID(void);
extern int DWC_GetAIDList(u8 **);
extern int DWC_IsValidAID(int);
extern int DWCi_GetGT2Connection(int);
extern int DWCi_GetConnectionAID(int);
extern int DWCi_IsConnectedAID(int);
extern void DWCi_StopMatching(int, int);
extern void DWCi_TransportRecvUnreliable(int, const void *, int, int);
extern void DWCi_TransportRecvHeader(int, const void *, int);
extern void DWCi_TransportRecvBody(int, const void *, int);
extern void DWCi_TransportRecvSyn(int, const void *, int);
extern int DWCi_GetSendBufferFreeSpace(int);
extern void gt2Send(int, const void *, int, int);

int DWC_IsSendableReliable(int aid);
int DWCi_IsSendable(int aid, int flag);
int DWC_SendReliable(int aid, const void *p, int n);
int DWCi_SendReliable(int flag, int aid, const void *p, int n);
u32 DWC_SendReliableBitmap(u32 bits, const void *p, int n);
int DWC_SendUnreliable(int aid, const void *p, int n);
int DWC_SetRecvBuffer(int aid, u8 *p, int n);
int DWC_SetUserSendCallback(void (*cb)(int, int));
int DWC_SetUserRecvCallback(void (*cb)(int, const void *, int));
int DWC_SetUserRecvTimeoutCallback(void (*cb)(int));
void DWCi_WriteTransportHeader(void *p, int flag, u32 n);
unsigned DWCi_GetTransportHeaderType(const void *p);
int DWCi_GetMinSendSpace(int n);
int DWC_SetRecvTimeoutTime(int aid, u32 timeout);
void DWCi_InitTransport(Transport *p);
void DWCi_TransportRecv(int aid, const void *p, int n, int flag);
void DWCi_TransportPingCallback(int id, int n);
void DWCi_TransportProcess(void);
void DWCi_ResetTransportChannel(int aid);
void DWCi_ShutdownTransport(void);
TransportChannel *DWCi_GetTransportChannel(int aid);
int DWCi_IsTransportSending(int aid);
unsigned DWCi_GetTransportRecvState(int aid);
void DWCi_TransportSend(int aid, const void *p, int n, int flag);
void DWCi_TransportRecvReliable(int id, const void *p, int n);

int DWCi_CheckMatchRetryLimit(int flag) {
    if (flag) {
        return 1;
    }
    if (DWCi_GetMatchWork()->mode != DWC_MATCH_TYPE_SC_CL) {
        DWCi_GetMatchWork()->matchRetryCount++;
    }
    if (DWCi_GetMatchWork()->mode == DWC_MATCH_TYPE_SC_CL || DWCi_GetMatchWork()->matchRetryCount >= 5) {
        DWCi_StopMatching(6, -86420);
        return 0;
    }
    return 1;
}

void DWCi_SetMatchWork(MatchWork *work) {
    gDwcMatch.work = work;
}

MatchWork *DWCi_GetMatchWork(void) {
    return gDwcMatch.work;
}

void DWCi_SetMatchState(int state) {
    gDwcMatch.work->state = state;
}

int DWC_IsSendableReliable(int aid) {
    return DWCi_IsSendable(aid, 1);
}

int DWCi_IsSendable(int aid, int flag) {
    int n;
    if (DWCi_IsError() || (flag == 1 && !DWC_IsValidAID(aid)) || !DWCi_IsConnectedAID(aid)) {
        return 0;
    }
    if (DWCi_IsTransportSending(aid) == 1) {
        return 0;
    }
    n = DWCi_GetSendBufferFreeSpace(aid);
    return n >= DWCi_GetMinSendSpace(flag);
}

int DWC_SendReliable(int aid, const void *p, int n) {
    return DWCi_SendReliable(1, aid, p, n);
}

int DWCi_SendReliable(int flag, int aid, const void *p, int n) {
    TransportChannel *c = DWCi_GetTransportChannel(aid);
    u8 header[8];
    int amount;
    if (!DWCi_IsSendable(aid, flag)) {
        return 0;
    }
    c->sending = 1;
    c->sendBuf = (u8 *)p;
    c->sent = 0;
    c->total = n;
    DWCi_WriteTransportHeader(header, flag, n);
    DWCi_TransportSend(aid, header, 8, 1);
    amount = gDwcTransport->maxSize;
    if (n <= amount) {
        amount = n;
    }
    if (amount > DWCi_GetSendBufferFreeSpace(aid)) {
        return 1;
    }
    DWCi_TransportSend(aid, p, amount, 1);
    c->sent += amount;
    {
        int total = c->total;
        if (c->sent == total) {
            c->sending = 0;
            c->sendBuf = 0;
            c->sent = 0;
            c->total = 0;
            if (gDwcTransport->sendCallback && flag == 1) {
                gDwcTransport->sendCallback(total, aid);
            }
        }
    }
    return 1;
}

u32 DWC_SendReliableBitmap(u32 bits, const void *p, int n) {
    u8 i;
    for (i = 0; i < 32; i++) {
        u32 bit = i ? 1 << i : 1;
        if (bits & bit) {
            if (i == DWC_GetMyAID()) {
                continue;
            }
            if (!DWC_SendReliable(i, p, n)) {
                bits &= ~bit;
            }
        }
    }
    return bits;
}

int DWC_SendUnreliable(int aid, const void *p, int n) {
    if (DWCi_IsError()) {
        return 0;
    }
    if (!DWC_IsValidAID(aid)) {
        return 0;
    }
    if (n > gDwcTransport->maxSize) {
        return 0;
    }
    DWCi_TransportSend(aid, p, n, 0);
    if (gDwcTransport->sendCallback) {
        gDwcTransport->sendCallback(n, aid);
    }
    return 1;
}

int DWC_SetRecvBuffer(int aid, u8 *p, int n) {
    TransportChannel *c = DWCi_GetTransportChannel(aid);
    if (DWCi_GetTransportRecvState(aid) == 2) {
        return 0;
    }
    c->recvBuf = p;
    c->size = n;
    c->receiving = 1;
    c->received = 0;
    c->pending = 0;
    return 1;
}

int DWC_SetUserSendCallback(void (*cb)(int, int)) {
    if (!gDwcTransport) {
        return 0;
    }
    gDwcTransport->sendCallback = cb;
    return 1;
}

int DWC_SetUserRecvCallback(void (*cb)(int, const void *, int)) {
    if (!gDwcTransport) {
        return 0;
    }
    gDwcTransport->recvCallback = cb;
    return 1;
}

int DWC_SetUserRecvTimeoutCallback(void (*cb)(int)) {
    if (!gDwcTransport) {
        return 0;
    }
    gDwcTransport->timeoutCallback = cb;
    return 1;
}

void DWCi_WriteTransportHeader(void *p, int flag, u32 n) {
    strncpy(((TransportHeader *)p)->magic, sStr_DT, 2);
    ((TransportHeader *)p)->type = flag;
    ((TransportHeader *)p)->size = n;
}

unsigned DWCi_GetTransportHeaderType(const void *p) {
    u8 buf[8];
    MI_CpuCopy8(p, buf, 8);
    return memcmp(buf + 6, sStr_DT, 2) == 0 ? ((TransportHeader *)buf)->type : 0;
}

int DWCi_GetMinSendSpace(int n) {
    switch (n) {
    case 2:
    case 3:
    case 4:
        return 12;
    default:
        return 8;
    }
}

int DWC_SetRecvTimeoutTime(int aid, u32 timeout) {
    if (!gDwcTransport) {
        return 0;
    }
    gDwcTransport->channel[aid].timeout = timeout;
    gDwcTransport->channel[aid].tick = OS_GetTick();
    return 1;
}

void DWCi_InitTransport(Transport *p) {
    gDwcTransport = p;
    MI_CpuFill8(p, 0, 1556);
    gDwcTransport->maxSize = 1465;
}

void DWCi_TransportRecv(int aid, const void *p, int n, int flag) {
    if (!gDwcTransport) {
        return;
    }
    if (!p || !n) {
        return;
    }
    if (flag) {
        DWCi_TransportRecvReliable(aid, p, n);
    } else {
        DWCi_TransportRecvUnreliable(aid, p, n, flag);
    }
}

void DWCi_TransportPingCallback(int id, int n) {
    if (!gDwcTransport->pingCallback) {
        return;
    }
    id = DWCi_GetConnectionAID(id);
    gDwcTransport->pingCallback(n, id);
}

void DWCi_TransportProcess(void) {
    u8 *clients;
    int count, i;
    if (!gDwcTransport) {
        return;
    }
    count = DWC_GetAIDList(&clients);
    for (i = 0; i < count; i++) {
        int id = clients[i];
        if (DWC_IsValidAID(id)) {
            TransportChannel *channel = DWCi_GetTransportChannel(id);
            if (gDwcTransport->timeoutCallback && channel->timeout) {
                u64 now = OS_GetTick();
                if ((u32)(((now - channel->tick) << 6) / 0x82ea) > channel->timeout) {
                    gDwcTransport->timeoutCallback(id);
                    channel->tick = now;
                }
            }
        }
        if (id != DWC_GetMyAID() && DWCi_IsTransportSending(id) == 1) {
            TransportChannel *channel = DWCi_GetTransportChannel(id);
            int size = gDwcTransport->maxSize;
            if (channel->total - channel->sent <= size) {
                size = channel->total - channel->sent;
            }
            if (DWCi_GetSendBufferFreeSpace(id) >= size) {
                int total;
                DWCi_TransportSend(id, channel->sendBuf + channel->sent, size, 1);
                channel->sent += size;
                total = channel->total;
                if (channel->sent == total) {
                    channel->sending = 0;
                    channel->sendBuf = 0;
                    channel->sent = 0;
                    channel->total = 0;
                    if (gDwcTransport->sendCallback) {
                        gDwcTransport->sendCallback(total, id);
                    }
                }
            }
        }
    }
}

void DWCi_ResetTransportChannel(int aid) {
    if (!gDwcTransport) {
        return;
    }
    gDwcTransport->channel[aid].sent = 0;
    gDwcTransport->channel[aid].received = 0;
    gDwcTransport->channel[aid].total = 0;
    gDwcTransport->channel[aid].pending = 0;
    gDwcTransport->channel[aid].sending = 0;
    if (gDwcTransport->channel[aid].receiving) {
        gDwcTransport->channel[aid].receiving = 1;
    }
    gDwcTransport->channel[aid].unk_22 = 0;
}

void DWCi_ShutdownTransport(void) {
    gDwcTransport = 0;
}

TransportChannel *DWCi_GetTransportChannel(int aid) {
    return &gDwcTransport->channel[aid];
}

int DWCi_IsTransportSending(int aid) {
    return gDwcTransport->channel[aid].sending;
}

unsigned DWCi_GetTransportRecvState(int aid) {
    return gDwcTransport->channel[aid].receiving;
}

void DWCi_TransportSend(int aid, const void *p, int n, int flag) {
    int id = DWCi_GetGT2Connection(aid);
    gt2Send(id, p, n, flag);
}

void DWCi_TransportRecvReliable(int id, const void *p, int n) {
    int aid = DWCi_GetConnectionAID(id);
    switch (DWCi_GetTransportRecvState(aid)) {
    case 0: {
        unsigned flag = DWCi_GetTransportHeaderType(p);
        if (flag < 2 || flag > 4) {
            return;
        }
        DWCi_TransportRecvHeader(aid, p, n);
        return;
    }
    case 1:
        DWCi_TransportRecvHeader(aid, p, n);
        return;
    case 2:
        DWCi_TransportRecvBody(aid, p, n);
        return;
    case 3:
        DWCi_TransportRecvSyn(aid, p, n);
        return;
    case 4:
        gDwcTransport->channel[aid].receiving = 1;
        gDwcTransport->channel[aid].received = 0;
        gDwcTransport->channel[aid].pending = 0;
        return;
    default:
        DWCi_SetError(6, -97610);
        return;
    }
}
