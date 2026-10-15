#ifndef POKEHEARTGOLD_VCT_VCT_AUDIO_INTERNAL_H
#define POKEHEARTGOLD_VCT_VCT_AUDIO_INTERNAL_H

// libVCT audio: packet buffers as used by the audio path, receive streams, the send buffer, and the
// audio functions the modules share. The packet buffer, VAD and filter functions are declared in
// vct_ssp_internal.h.

#include <nitro.h>

#include "vct/vct_adpcm.h"
#include "vct/vct_internal.h"
#include "vct/vct_ssp_internal.h"

#define AUDIO_STREAM_COUNT 3
#define AUDIO_SAMPLES_SIZE 0x440 // bytes of 16-bit samples per packet
#define AUDIO_HEADER_SIZE  12

// Header of an audio packet (Header.kind 0x40 / 0x41).
typedef struct AudioHeader {
    u32 magic;
    u8 kind;  // 0x40: audio, 0x41: silence
    u8 codec; // bit 7: the coder state was reset
    u16 sequence;
    u32 timestamp; // tick / 64
} AudioHeader;

// Packet buffer holding one received audio packet (in the decoder list, then in a stream's queue).
typedef struct AudioPacket {
    u32 unk_00;
    struct AudioPacket *prev; // 0x04
    struct AudioPacket *next; // 0x08
    int codec;                // 0x0C
    u8 owner;                 // 0x10: sender aid
    u8 channel;               // 0x11: receive stream
    u16 unk_12;
    u32 size;                       // 0x14
    u32 sequence;                   // 0x18
    u8 samples[AUDIO_SAMPLES_SIZE]; // 0x1C: decoded samples (the coded data is received at the end)
    BOOL flagged;                   // 0x45C
    u32 timestamp;                  // 0x460
    u64 receive;                    // 0x464: tick of reception
    u64 ready;                      // 0x46C: tick from which it may be played
    void *data;                     // 0x474: coded data, then samples
} AudioPacket;

// Receive stream of one session (0x94 bytes): queue state, sequence tracking, playout timing.
typedef struct Stream {
    u32 jitter;            // 0x00: smoothed delay (as reported)
    u32 playoutDelay;      // 0x04: ticks added to a packet's timestamp before it is played
    u32 left;              // 0x08: packets left when the queue ran dry
    s32 drift;             // 0x0C: start skew - average skew
    u32 seq;               // 0x10: extended sequence number of the last packet
    u32 lost;              // 0x14
    s32 jitterEstimate;    // 0x18
    u32 reordered;         // 0x1C
    u32 retrans;           // 0x20: previous packet played again
    u32 codec;             // 0x24
    u32 oldDelay;          // 0x28
    u32 delay;             // 0x2C
    u32 silenceSeq;        // 0x30: sequence number of the last silence packet
    u32 owner;             // 0x34: stream index
    u32 session;           // 0x38: aid of the session, -1 when stopped
    AudioPacket *previous; // 0x3C: last played packet
    u32 unk_40;
    u64 baseTick;  // 0x44: reception tick of the timing reference packet
    u32 baseStamp; // 0x4C: its timestamp; 0 = take the next packet as reference
    u32 unk_50;
    u32 lastSeq;      // 0x54: last received sequence number
    u32 lastPlayed;   // 0x58: sequence number of the last played packet
    BOOL needSeqInit; // 0x5C
    u32 seqCycles;    // 0x60: 0x10000 per wrap of the 16-bit sequence number
    u32 badSeq;       // 0x64
    u16 maxSeq;       // 0x68
    u16 unk_6A;
    u32 skewSamples;   // 0x6C
    u32 skip;          // 0x70: packets to drop (the sender is ahead)
    s32 averageSkew;   // 0x74
    s32 startSkew;     // 0x78
    s32 jitterAverage; // 0x7C
    s32 skew;          // 0x80
    s32 hold;          // 0x84
    s32 lowerBound;    // 0x88
    u32 upperBound;    // 0x8C
    u32 boundCount;    // 0x90
} Stream;

// Double send buffer.
typedef struct SendInfo {
    u8 buffer[0x8C0];
    u32 read;
    u32 write;
    void *packet; // packet being sent (vct_flush_send_buffer)
    volatile u32 mask;
    int balanceIndex;
    int balance;
} SendInfo;

// sCodecInfo entries: 0x44-byte blocks per packet and coder header size of each codec.
typedef struct Codec {
    u8 blocks;
    u8 header;
} Codec;

// asm data
extern Codec sCodecInfo[];
extern u8 sTransceiverBalance[][3]; // transceiver mode: packets sent per frame, by listener count and frame
extern s32 sEnableVAD;

// audio TU (vct_audio.c)
extern AdpcmState sAdpcmState;
extern Session *sAudioSession[AUDIO_STREAM_COUNT];
extern Stream sStream[AUDIO_STREAM_COUNT];
extern u32 _021D6234[0x44C / 4];
extern SendInfo sSendInfo;
int VCT_StartStreaming(Session *session);
void VCT_StopStreaming(Session *session);
int VCT_SendAudio(void *data, u32 size);
int VCTi_ReceiveAudioData(void *dst, u32 size, u32 ch, u32 *mask);
int VCT_ReceiveAudio(void *data, u32 size, u32 *mask);
s32 VCT_SetCodec(s32 codec);
void VCT_EnableVAD(s32 enable);
void VCT_EnableEchoCancel(s32 enable);
void *vct_prepare_send_buffer(void);

// decoder list, audio queues, streams (vct_decoder.c, vct_audio_queue.c)
void vct_init_decoder(void);
void vct_flush_decoder(u32 ch);
void vct_flush_all_decoder(void);
u32 vct_insert_decoder(AudioPacket *packet);
AudioPacket *vct_top_decoder(void);
int vct_count_decoder_queue(int ch);
AudioPacket *vct_get_packet_from_decoder(int ch);
u32 vct_remove_packet_from_decoder(AudioPacket *packet);
void vct_init_audio_queue(u32 ch);
void vct_flush_audio_queue(u32 ch);
void vct_flush_all_audio_queue(void);
int vct_insert_audio_queue(AudioPacket *packet, u32 ch);
AudioPacket *vct_top_audio_queue(u32 ch);
u32 vct_pop_audio_queue(u32 ch);
u32 vct_count_audio_queue(u32 ch);
void vct_init_stream(Stream *stream, u32 ch, u32 session);
void vct_reset_stream(Stream *stream);
u32 vct_save_previous_buffer(Stream *stream, AudioPacket *packet);
void vct_init_sequence(Stream *stream, u32 seq);
int vct_update_sequence(Stream *stream, AudioPacket *packet, u32 seq);
int vct_calc_jitter_and_skew(Stream *stream, AudioPacket *packet);

// codecs (vct_codec.c)
void vct_encode_g711_ulaw(u8 *out, const s16 *in, u32 count);
void vct_decode_g711_ulaw(u8 *in, s16 *out, u32 count);
void vct_encode_8bit_raw(u8 *out, s16 *in, u32 count);
void vct_decode_8bit_raw(s8 *in, s16 *out, u32 count);

// other libraries
int MATH_CountPopulation(u32 value);
u64 _ll_udiv(u64 a, u64 b);

#endif // POKEHEARTGOLD_VCT_VCT_AUDIO_INTERNAL_H
