#ifndef POKEHEARTGOLD_VCT_VCT_INTERNAL_H
#define POKEHEARTGOLD_VCT_VCT_INTERNAL_H

// libVCT internals: packet header, the receive event, and the functions the library modules share.

#include <nitro.h>

#include "vct/vct_session.h"

#define LIBVCT_PACKET_MAGIC 0x5F564354 // "TCV_"

// Header of every libVCT packet (audio and session protocol).
typedef struct Header {
    u32 magic; // LIBVCT_PACKET_MAGIC
    u8 kind;   // 0x4X: audio; 0x00 / 0xFF: session protocol
    u8 size;
    u8 type;
    u8 pad;
    u8 id;
    u8 target;
    u8 notify;
    u8 peer;
    u32 mask;
} Header;

// Session event to report to the VCT callback.
typedef struct Event {
    s32 event;
    Session *session;
} Event;

// audio (vct_audio, vct_mix)
s32 vct_init_audio(void);
void vct_finish_audio(void);
int vct_handle_audio(u32 sender, Header *data, u32 size, u64 tick);
int vct_decode_audio_buffer(void);
int vct_flush_send_buffer(void);
void vct_mix_audio(s16 *a, s16 *b, s16 *out, u32 bytes);

// session protocol
void vct_finish_ssp(void);
void vct_check_timeout(void);
int vct_handle_ssp(u32 sender, Header *data, u32 size, Event *event);

// packet buffers
s32 vct_init_packet_buffer(void *buffer, u32 size);
void vct_cleanup_packet_buffer(void);

// vct_main
void VCT_Cleanup(void);
void VCT_Main(void);
s32 VCT_HandleData(u32 sender, Header *data, u32 size);
int VCTi_HandleData(u32 sender, Header *data, u32 size, Event *event);

// NitroSDK / NitroDWC functions the headers do not declare
void OSi_ReferSymbol(const void *symbol);

extern char _version_Abiosso_libVCT[];

#endif // POKEHEARTGOLD_VCT_VCT_INTERNAL_H
