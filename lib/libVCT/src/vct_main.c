#include "vct/vct_internal.h"

// libVCT start-up / shutdown, the per-frame main function and the entry point for received packets.

#define MODE_PHONE       1
#define MODE_TRANSCEIVER 2
#define MODE_CONFERENCE  3

#pragma force_active on

s32 VCT_Init(InitArgs *args) {
    OSi_ReferSymbol(_version_Abiosso_libVCT);
    if (!args) {
        return 0;
    }
    if (gVctControl.active) {
        return 1;
    }
    switch (args->mode) {
    case MODE_PHONE:
    case MODE_TRANSCEIVER:
    case MODE_CONFERENCE:
        break;
    default:
        return 0;
    }
    if (!args->callback) {
        return 0;
    }
    if (!args->buffer || !args->size) {
        return 0;
    }
    if ((s32)(u32)args->buffer % 32) {
        return 0;
    }
    MI_CpuFill8(&__vct, 0, sizeof(Vct));
    gVctControl.vct.callback = args->callback;
    gVctControl.vct.context = args->arg;
    gVctControl.vct.mode = args->mode;
    gVctControl.vct.state = 0;
    if (args->id >= 32) {
        return 0;
    }
    gVctControl.vct.aid = args->id;
    if (!vct_init_packet_buffer(args->buffer, args->size)) {
        vct_cleanup_packet_buffer();
        return 0;
    }
    if (!vct_init_ssp(args)) {
        vct_cleanup_packet_buffer();
        return 0;
    }
    if (!vct_init_audio()) {
        vct_finish_ssp();
        vct_cleanup_packet_buffer();
        return 0;
    }
    gVctControl.active = 1;
    return 1;
}

void VCT_Cleanup(void) {
    vct_finish_audio();
    vct_finish_ssp();
    vct_cleanup_packet_buffer();
    gVctControl.vct.mode = 0;
    gVctControl.active = 0;
}

void VCT_Main(void) {
    if (!gVctControl.active) {
        return;
    }
    if ((++gVctControl.frame & 15) == 0) {
        vct_check_timeout();
    }
    if (!vct_flush_send_buffer()) {
        return;
    }
    vct_decode_audio_buffer();
}

s32 VCT_HandleData(u32 sender, Header *data, u32 size) {
    Event event;

    switch (VCTi_HandleData(sender, data, size, &event)) {
    case 0:
        break;
    case 1:
        gVctControl.vct.callback(sender, event.event, event.session, gVctControl.vct.context);
        return 1;
    case 2:
        return 0;
    }
    return 1;
}

static inline int IsAudioPacket(u8 kind) {
    return (kind & 0xF0) == 0x40;
}

static inline int IsSspPacket(u8 kind) {
    return kind == 0 || kind == 0xFF;
}

#pragma push
#pragma opt_common_subs off

// 0: nothing to report, 1: an event for the callback, 2: not a libVCT packet.
int VCTi_HandleData(u32 sender, Header *data, u32 size, Event *event) {
    u64 tick;

    if (!data) {
        return 0;
    }
    if (data->magic != LIBVCT_PACKET_MAGIC) {
        return 2;
    }
    if (!gVctControl.vct.mode || !gVctControl.active) {
        return 0;
    }
    event->event = 0;
    event->session = NULL;
    tick = OS_GetTick();
    if (IsAudioPacket(data->kind)) {
        gVctControl.received++;
        vct_handle_audio(sender, data, size, tick);
        return 0;
    }
    if (IsSspPacket(data->kind)) {
        return vct_handle_ssp(sender, data, size, event) != 0;
    }
    return 0;
}

#pragma pop
