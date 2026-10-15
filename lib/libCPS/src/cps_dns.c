#include "cps/cps_sock_internal.h"

// DNS resolver: dotted addresses are parsed, names are asked (type A) of the two DNS servers, three
// rounds each.

#pragma force_active on

// skips a (possibly compressed) name
u8 *dns_skipname(u8 *p) {
    int n = *p++;
    while (n) {
        if ((n & 0xC0) == 0xC0) {
            return p + 1;
        }
        p += n;
        n = *p++;
    }
    return p;
}

#define SWAP(x) ((u16)(((s32)(x) >> 8) | ((u32)(x) << 8)))
#define PAIR(p) ((u16)(((p)[0] << 8) | (p)[1]))

// Sends a query for name (type 1: A, 12: PTR -> out) and waits 1 s for the answer. Returns the
// address (A), 1 (PTR copied) / 2 (does not fit), -1 (no such name or name too long), 0 (no answer).
int resolve_common(u8 *name, u32 type, int id, void *out, u32 outSize) {
    u32 length;
    u16 packet[30];
    u32 result;
    u32 start;
    {
        u8 *next;
        u32 count;
        int offset;
        int c;
        u8 *label;
        packet[0] = SWAP(id);
        if (type != 32) {
            packet[1] = 1; // recursion desired
        } else {
            packet[1] = 0x1001;
        }
        packet[2] = 256; // one question
        packet[3] = 0;
        count = 0;
        label = (u8 *)&packet[6];
        packet[4] = 0;
        packet[5] = 0;
        length = 0;
        next = label + 1;
        c = *name++;
        if (c) {
            do {
                if (c != '.') {
                    offset = next - (u8 *)packet;
                    if (offset >= 60) {
                        return -1;
                    }
                    length++;
                    count = length;
                    *next++ = c;
                } else {
                    *label = count;
                    length = 0;
                    label = next;
                    next++;
                    count = 0;
                }
                c = *name++;
            } while (c);
        }
        *label = length;
        next[0] = 0;
        next[1] = type >> 8;
        next[2] = type;
        next[3] = 0;
        next[4] = 1; // class IN
        CPS_SocWrite(packet, next + 5 - (u8 *)packet);
    }
    result = 0;
    start = OS_GetTick() >> 16;
    while (gCpsState.linkIsOn() && !result && (int)((u32)(OS_GetTick() >> 16) - start) < 15) {
        u8 *p, *end;
        u32 n;
        if (!CPS_SocGetLength()) {
            OS_YieldThread__();
            continue;
        }
        p = CPS_SocRead(&length);
        if (length <= 12) {
            goto consume;
        }
        if (id != SWAP(*(u16 *)p)) {
            goto consume;
        }
        n = p[3] & 15; // response code
        if (n == 3) {
            result = -1;
            goto consume;
        }
        if (n) {
            goto consume;
        }
        end = p + length;
        n = PAIR(p + 4);
        p += 12;
        while (n--) {
            p = dns_skipname(p) + 4;
        }
        while (p < end) {
            u32 size;
            p = dns_skipname(p);
            size = PAIR(p + 8);
            if (type == PAIR(p)) {
                if (type != 12) {
                    u8 *low = p + 8;
                    u8 *high = p + 6;
                    result = ((u32)PAIR(high + size) << 16) | PAIR(low + size);
                } else if (size > outSize) {
                    result = 2;
                } else {
                    MI_CpuCopy8(p + 10, out, size);
                    result = 1;
                }
                break;
            }
            p += size + 10;
        }
consume:
        CPS_SocConsume(length);
    }
    return result;
}

u32 strtol10(u8 *p, u8 **end) {
    u32 n = 0;
    u8 digit;
    *end = p;
    for (;;) {
        digit = *p - '0';
        if (digit > 9) {
            break;
        }
        n = 10 * n + digit;
        *end = ++p;
    }
    return n;
}

// "a.b.c.d"
int rawip(u8 *string, u32 *ip) {
    u32 n = 0;
    int i;
    u8 *end;
    for (i = 0; i < 4; i++) {
        u32 part = strtol10(string, &end);
        if (string == end) {
            return FALSE;
        }
        string = end;
        if (part > 255 || (i != 3 && *string++ != '.') || (i == 3 && *string)) {
            return FALSE;
        }
        n = (n << 8) | part;
    }
    *ip = n;
    return TRUE;
}

int resolve_sub(char *name, u32 server, int id) {
    int result;
    if (!server) {
        return -1;
    }
    CPS_SocUse();
    CPS_SocDatagramMode();
    CPS_SocBind(0, 53, server);
    result = resolve_common((u8 *)name, 1, id, NULL, 0);
    CPS_SocRelease();
    return result;
}
