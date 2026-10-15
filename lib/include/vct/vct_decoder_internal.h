#ifndef POKEHEARTGOLD_VCT_VCT_DECODER_INTERNAL_H
#define POKEHEARTGOLD_VCT_VCT_DECODER_INTERNAL_H

// libVCT receive side: decoder list and per-stream audio queues (data in lib/asm/vct_bss.s),
// G.711 table, and the DWC send function of the send side.

#include "vct/vct_audio_internal.h"

extern AudioPacket *gVctDecoderList[2]; // head, tail
extern u32 gVctDecoderCount[AUDIO_STREAM_COUNT];
extern AudioPacket *gVctAudioQueueHead[AUDIO_STREAM_COUNT];
extern u32 gVctAudioQueueCount[AUDIO_STREAM_COUNT];
extern AudioPacket *gVctAudioQueueTail[AUDIO_STREAM_COUNT];

extern const int ulaw_segment[8]; // upper limits of the G.711 u-law segments

int DWC_SendUnreliable(u8 aid, const void *buffer, u32 size);

#endif // POKEHEARTGOLD_VCT_VCT_DECODER_INTERNAL_H
