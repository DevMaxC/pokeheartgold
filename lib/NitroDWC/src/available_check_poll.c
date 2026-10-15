#include "global.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

// Polling of the game server availability query ("<game>.available.gs.nintendowifi.net"). The request
// is sent by GSIStartAvailableCheck / gsiAvailableCheckSendPacket and the reply parsed by gsiAvailableCheckParseResponse; this object owns
// the query's .bss (tools/object_aliases.py splits ov00_0221B0D8 with the sidecar alias map).

typedef struct SockAddr {
    u32 addr;
    u32 port;
} SockAddr;

typedef struct AvailableCheckWork {
    SockAddr server;
    u8 packet[0x40];
    int packetLen;
    u32 sendTime;
    int retries;
} AvailableCheckWork;

int ov00_0221B0D0;
AvailableCheckWork ov00_0221B0D8;
static int sNatSock;

int CanReceiveOnSocket(int sock);
int gsSocketRecvFrom(int sock, u8 *buf, int size, int flags, SockAddr *from, int *fromLen);
int gsiAvailableCheckParseResponse(u8 *buf, int len, SockAddr *from, u32 *result);
void gsSocketClose(int sock);
u32 current_time(void);
void gsiAvailableCheckSendPacket(void);
int GSIAvailableCheckThink(void);

// Returns 0 while waiting for the reply, else the result also stored in ov00_0221B0D0:
// 1 available (or no socket / no reply after one resend), 2 and 3 for the two "not available" bits of the reply.
int GSIAvailableCheckThink(void) {
    SockAddr from;
    u8 buf[0x40];
    int fromLen = 8;
    u32 result;
    int len;

    if (sNatSock == -1) {
        ov00_0221B0D0 = 1;
        return 1;
    }
    if (CanReceiveOnSocket(sNatSock)) {
        len = gsSocketRecvFrom(sNatSock, buf, sizeof(buf), 0, &from, &fromLen);
        if (gsiAvailableCheckParseResponse(buf, len, &from, &result) == 0) {
            gsSocketClose(sNatSock);
            if (result & 1) {
                ov00_0221B0D0 = 2;
            } else if (result & 2) {
                ov00_0221B0D0 = 3;
            } else {
                ov00_0221B0D0 = 1;
            }
            return ov00_0221B0D0;
        }
    }
    if (current_time() > ov00_0221B0D8.sendTime + 2000) {
        if (ov00_0221B0D8.retries == 1) {
            gsSocketClose(sNatSock);
            ov00_0221B0D0 = 1;
            return 1;
        }
        gsiAvailableCheckSendPacket();
        ov00_0221B0D8.retries++;
    }
    return 0;
}
