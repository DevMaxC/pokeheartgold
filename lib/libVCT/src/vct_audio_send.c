#include "vct/vct_decoder_internal.h"

// Sending of the prepared audio packet: one reliable-less DWC send per listener; in transceiver mode
// only as many sends per frame as sTransceiverBalance allows.

// View of the audio TU's pooled .bss (vct_audio.c) from 0x021D6040: its statics are not visible here.
typedef struct AudioPool {
    u16 sequence;
    u16 unk_02;
    u32 unk_04;
    u32 unk_08;
    u32 packetSize; // 0x0C
    AdpcmState adpcmState;
    u32 unk_14;
    u32 unk_18; // 0x18: set: send the new packet from the next frame on
    u32 unk_1C;
    u32 unk_20; // 0x20: zero: not streaming
    u8 unk_24[0xF00 - 0x24];
    // sSendInfo (0x640) after its buffer; non-volatile view (needed for the match)
    u32 sendRead;     // 0xF00
    u32 sendWrite;    // 0xF04
    void *sendPacket; // 0xF08
    u32 sendMask;     // 0xF0C
    u32 sendSlot;     // 0xF10
    u32 sendBalance;  // 0xF14
} AudioPool;

// vct_audio.c defines _021D6040 as the first variable of the pool (u16 sequence)
extern AudioPool _021D6040;

#pragma force_active on

// clang-format off
static inline u32 Clz(u32 x) {
    asm { clz x, x }
    return x;
}
// clang-format on

int vct_flush_send_buffer(void) {
    int i, limit;

    if (!_021D6040.unk_20) {
        return 1;
    }
    if (!_021D6040.sendPacket) {
        void *packet = vct_prepare_send_buffer();

        _021D6040.sendPacket = packet;
        if (packet && _021D6040.unk_18) {
            return 0;
        }
        return 1;
    }
    limit = 1;
    if (__vct.mode == 2) {
        u32 slot = _021D6040.sendSlot;

        _021D6040.sendSlot = slot + 1;
        limit = sTransceiverBalance[_021D6040.sendBalance][slot];
    }
    for (i = 0; i < limit; i++) {
        u32 mask = _021D6040.sendMask;
        u32 leading = Clz(mask);

        if (leading == 32) {
            break;
        }
        _021D6040.sendMask = mask & ~(0x80000000u >> leading);
        DWC_SendUnreliable((u8)(31 - leading), _021D6040.sendPacket, _021D6040.packetSize);
        if (!_021D6040.sendMask) {
            _021D6040.sendRead++;
            _021D6040.sendPacket = NULL;
            _021D6040.sendMask = 0;
            break;
        }
    }
    return 1;
}
