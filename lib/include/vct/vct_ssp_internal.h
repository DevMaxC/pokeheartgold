#ifndef POKEHEARTGOLD_VCT_VCT_SSP_INTERNAL_H
#define POKEHEARTGOLD_VCT_VCT_SSP_INTERNAL_H

// libVCT session protocol (SSP), packet buffers, voice activity detection and the echo cancelling FIR
// filter.

#include <nitro.h>
#include <string.h>

#include "vct/vct_internal.h"

// Header.kind of session protocol packets
#define SSP_KIND_REQUEST  0xFF
#define SSP_KIND_RESPONSE 0x00
#define SSP_PACKET_SIZE   16

// Header.type of SSP_KIND_REQUEST packets
#define SSP_REQUEST_NOTIFY 4

// Packet buffer as kept on the free list (the audio path uses the same buffers as AudioPacket).
typedef struct PacketBuffer {
    struct PacketBuffer *next;
    u32 flags;
    u32 other;
    u8 data[0x46C];
} PacketBuffer;

// sVADInfo
typedef struct VadInfo {
    int state; // 1 while voice is detected
    u32 energy;
    int limit; // quiet frames before the voice ends
    s32 unk_0C;
} VadInfo;

// asm data (lib/asm/vct_data.s, vct_bss.s)
extern const s8 sRecvState[][11];
extern const s8 sTransRecvState[][11];
extern const s8 sSendState[][11];
extern const s8 sTransSendState[][11];
extern const u8 sRequestEvent[];
extern const u8 sResponseEvent[];
extern u64 sTransceiverLimit;
extern VadInfo sVADInfo;
extern s16 sImpulseResponse[];
extern PacketBuffer *gVctPacketBuffers[2]; // free list head, buffer area

// vct_ssp.c
Session *VCT_CreateSession(u32 aid);
int VCT_DeleteSession(Session *session);
int vct_build_request_data(Session *session, int type, Header *header, u32 size);
int VCT_Request(Session *session, int type);
int vct_build_response_data(Session *session, int type, Header *header, u32 size);
int VCT_Response(Session *session, int type);
int VCT_AddConferenceClient(u8 aid);
Session *vct_create_session_impl(u32 aid);
int vct_request_impl(Session *session, int type);
int vct_response_impl(Session *session, int type);
void vct_add_notify_aid_list(Session *session, Header *header);
int vct_send_notify_impl(Session *session, Header *header);
void vct_send_notify(u32 notify);
void vct_init_session(Session *session, u32 aid);
s32 vct_send_ssp(Session *session, Header *header);
s32 vct_dispatch_session(Header *header, Session *session);
int vct_build_ssp_header(Session *session, Header *header, u32 type);
int vct_check_recv_state(Session *session, Header *header);
s32 vct_check_multisession(Session *session);
int vct_check_send_state(Session *session, Header *header);
Session *vct_find_session(u8 aid);
s32 vct_handle_ssp_client(Header *header, Event *event);
s32 vct_handle_ssp_server(Header *header, Event *event);
s32 vct_response_reject(Header *header, Event *event);
s32 vct_handle_notify(Header *header, Event *event);

// vct_packet_buffer.c
void *vct_alloc_packet_buffer(void); // a PacketBuffer; the audio path uses it as an AudioPacket
void vct_free_packet_buffer(void *packet);

// vct_vad.c
extern u32 E2scales[4];
extern u32 gVctVadThreshold;
void VCT_ResetVAD(void);
void VCT_GetVADInfo(void *out);
int VCTi_GetVADStatus(u32 scale, u32 energy, u8 *out);
void vct_init_vad(void);

// vct_fir.c
u32 HPFFilter(s16 *buffer, u32 bytes);
void InitFIRFilter(void);
void vct_set_speaker_samples(void *samples, u32 size);
void DoFIRFilter(s16 *src, s16 *dst, u32 length, u32 threshold);
void vct_process_fir(void *samples, u32 size, u32 energy);

// NitroDWC
BOOL DWC_SendReliable(u8 aid, const void *buffer, u32 size);

#endif // POKEHEARTGOLD_VCT_VCT_SSP_INTERNAL_H
