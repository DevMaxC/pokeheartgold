#ifndef POKEHEARTGOLD_VCT_ADPCM_H
#define POKEHEARTGOLD_VCT_ADPCM_H

#include <nitro/types.h>

// IMA-style ADPCM coder state carried between packets: the last reconstructed sample and the
// current index into cAdpcmStepSizeTable (0..88). Sent as the 4-byte header of every ADPCM packet.
typedef struct AdpcmState {
    s16 sample;
    u8 index;
    u8 padding;
} AdpcmState;

// Step sizes and per-code index adjustments for 2-, 3- and 4-bit codes (data in lib/asm).
extern s16 cAdpcmStepSizeTable[];
extern s8 cAdpcmIndexTable2[];
extern s8 cAdpcmIndexTable3[];
extern s8 cAdpcmIndexTable4[];

// 4-bit (32 kbit/s), 3-bit (24 kbit/s) and 2-bit (16 kbit/s) coders. Decoders take the input size
// in bytes, encoders the number of input samples.
void vct_decode_adpcm_32(u8 *in, s16 *out, u32 count, AdpcmState *state);
void vct_encode_adpcm_32(u8 *out, const s16 *in, u32 count, AdpcmState *state);
void vct_decode_adpcm_24(u8 *in, s16 *out, u32 size, AdpcmState *state);
void vct_encode_adpcm_24(u8 *out, const s16 *in, u32 size, AdpcmState *state);
void vct_decode_adpcm_16(u8 *in, s16 *out, u32 count, AdpcmState *state);
void vct_encode_adpcm_16(u8 *out, const s16 *in, u32 count, AdpcmState *state);

// Packet-level entry points: `codec` 2/3/4 selects the 16/24/32 kbit/s coder; the packet starts
// with the AdpcmState header (sample, index, 0).
void vct_decode_adpcm(u8 *in, s16 *out, u32 size, s32 codec);
void vct_encode_adpcm(u8 *out, s16 *in, u32 size, AdpcmState *state, s32 codec);

#endif // POKEHEARTGOLD_VCT_ADPCM_H
