#define CPS_STATE_CONST_ARRAY
#include "cps/cps_internal.h"

// IP reassembly.

#pragma force_active on

static inline u16 Swap(u16 x) {
    return (u16)((x >> 8) | (x << 8));
}

static inline u32 SourceKey(const CpsIpHeader *ip) {
    u16 low = Swap(ip->source[1]);
    u16 high = Swap(ip->source[0]);
    return ((u32)high << 16) | low;
}

// Returns the datagram: ip itself if it is not a fragment, the reassembled datagram once the last
// missing fragment arrived (*allocated = TRUE, release with gCpsState.free(datagram - 14)), else NULL.
// Up to 8 datagrams of up to 4096 bytes, 8 fragments each.
CpsIpHeader *check_frag(CpsIpHeader *ip, int *allocated) {
    u16 id;
    u32 header;
    CpsFragment *unused = NULL, *fragment;
    u32 key;
    u32 flags, length, offset, size, last, i;
    u32 count;
    u32 end;
    u32 index;
    u32 covered;
    *allocated = FALSE;
    flags = Swap(ip->fragment);
    if (!(flags & 0x3FFF)) {
        return ip;
    }
    id = ip->versionAndLength;
    header = (id & 15) * 4;
    key = SourceKey(ip);
    id = ip->id;
    for (i = 0, fragment = gCpsFragments; i < 8; i++, fragment++) {
        if (fragment->count && fragment->source == key && fragment->id == id) {
            break;
        }
        if (!fragment->count && !unused) {
            unused = fragment;
        }
    }
    length = Swap(ip->totalLength) - header;
    offset = flags & 0x1FFF;
    size = length + (offset << 3);
    if (i == 8) {
        // first fragment of a new datagram
        if (!unused || size > 4096) {
            return NULL;
        }
        fragment = unused;
        fragment->buffer = gCpsState[0].alloc(header + 14 + 4096);
        if (!fragment->buffer) {
            return NULL;
        }
        fragment->source = key;
        fragment->id = id;
        fragment->end = 0;
        fragment->tick = (u32)(OS_GetTick() >> 16);
        fragment->data = fragment->buffer + 14 + header;
        MI_CpuCopy8(ip, fragment->buffer + 14, header);
    }
    if (fragment->count == 8 || size > 4096) {
        fragment->count = 0;
        gCpsState[0].free(fragment->buffer);
        return NULL;
    }
    last = offset + ((length + 7) >> 3);
    if (!(flags & 0x2000)) {
        // the last fragment: now the size is known
        fragment->total = size;
        fragment->end = last;
    }
    fragment->start[fragment->count] = offset;
    fragment->stop[fragment->count] = last;
    fragment->count++;
    MI_CpuCopy8((u8 *)ip + header, fragment->data + (offset << 3), length);
    end = fragment->end;
    if (!end) {
        return NULL;
    }
    // complete if the received ranges cover 0 .. end
    count = fragment->count;
    covered = 0;
    index = 0;
    while (index < count) {
        if (fragment->start[index] <= covered && covered < fragment->stop[index]) {
            covered = fragment->stop[index];
            index = 0;
        } else {
            index++;
        }
    }
    if (covered < end) {
        return NULL;
    }
    {
        u8 *out = fragment->buffer;
        u16 total = fragment->total + ((out[14] & 15) * 4);
        *(u16 *)(out + 16) = (total >> 8) | (total << 8);
        fragment->count = 0;
        *allocated = TRUE;
        return (CpsIpHeader *)(out + 14);
    }
}
