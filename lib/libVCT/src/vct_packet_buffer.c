#include "vct/vct_ssp_internal.h"

// Packet buffers: the game's buffer is cut into PacketBuffer entries kept on a free list.

#pragma force_active on

#pragma push
#pragma opt_strength_reduction off

static inline void ConstructLinks(u32 count) {
    u32 offset, index, remaining;
    remaining = count - 1;
    index = 0;
    if (remaining) {
        offset = 0;
        do {
            PacketBuffer *base = gVctPacketBuffers[1];
            u8(*arena)[count * sizeof(PacketBuffer)] = (void *)base;
            PacketBuffer *current = (PacketBuffer *)&(*arena)[offset];
            index++;
            current->next = base + index;
            offset += sizeof(PacketBuffer);
        } while (index < remaining);
    }
    gVctPacketBuffers[1][count - 1].next = NULL;
    gVctPacketBuffers[0] = gVctPacketBuffers[1];
}

s32 vct_init_packet_buffer(void *buffer, u32 bytes) {
    u32 count = bytes / sizeof(PacketBuffer);
    gVctPacketBuffers[1] = buffer;
    if (count < 4 || count > 72) {
        return 0;
    }
    if (!buffer) {
        return 0;
    }
    if ((u32)buffer & 31) {
        gVctPacketBuffers[1] = NULL;
        return 0;
    }
    MIi_CpuClearFast(0, buffer, bytes);
    ConstructLinks(count);
    return 1;
}

#pragma pop

void vct_cleanup_packet_buffer(void) {
    gVctPacketBuffers[0] = 0;
    gVctPacketBuffers[1] = 0;
}

void *vct_alloc_packet_buffer(void) {
    PacketBuffer *packet = 0;
    OSIntrMode irq = OS_DisableInterrupts();
    if (gVctPacketBuffers[0]) {
        packet = gVctPacketBuffers[0];
        gVctPacketBuffers[0] = packet->next;
    }
    OS_RestoreInterrupts(irq);
    return packet;
}

void vct_free_packet_buffer(void *buffer) {
    PacketBuffer *packet = buffer;
    OSIntrMode irq = OS_DisableInterrupts();
    packet->next = gVctPacketBuffers[0];
    gVctPacketBuffers[0] = packet;
    packet->flags = 0;
    packet->other = 0;
    OS_RestoreInterrupts(irq);
}
