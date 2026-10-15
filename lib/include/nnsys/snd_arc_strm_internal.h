#ifndef POKEHEARTGOLD_NNSYS_SND_ARC_STRM_INTERNAL_H
#define POKEHEARTGOLD_NNSYS_SND_ARC_STRM_INTERNAL_H

// NitroSystem sound library: single wave loading, sound archive players and archive stream players,
// shared by lib/NitroSystem/src/snd_arc_*.c, snd_seqarc.c and snd_fader.c.

#include <nitro.h>
#include <nnsys/snd_arc_internal.h>

// ---- NitroSDK functions the nitro headers do not declare

typedef struct SndInstPos {
    u32 prgNo;
    u32 index;
} SndInstPos;

#define SND_INST_PCM 1

typedef struct SndInstData {
    u8 type; // SND_INST_*
    u8 padding;
    u16 waveNo;
    u16 waveArcIdx; // wave archive slot of the bank
    u8 unk_06[4];
} SndInstData;

void SND_InvalidateSeqData(const void *start, const void *end);
void SND_InvalidateBankData(const void *start, const void *end);
void SND_InvalidateWaveData(const void *start, const void *end);
void SND_DestroyBank(void *bank);
void SND_DestroyWaveArc(void *waveArc);
u32 SND_GetWaveDataCount(const void *waveArc);
const void *SND_GetWaveDataAddress(const void *waveArc, int index);
void SND_SetWaveDataAddress(void *waveArc, int index, const void *waveData);
SndInstPos SND_GetFirstInstDataPos(const void *bank);
BOOL SND_GetNextInstData(const void *bank, SndInstData *instData, SndInstPos *instPos);

// ---- archive loader dispose callbacks, single wave loading (snd_arc_loader_wave.c)

void DisposeCallback(void *mem, NNSSndArc *arc, u32 fileId);
void SingleWaveDisposeCallback(void *mem, u32 size, u32 data1, u32 data2);
BOOL LoadSingleWave(SndWaveArcTable *table, int index, u32 fileId, NNSSndHeapHandle heap);

// ---- sound archive player (snd_arc_player.c)

typedef struct SndSeqArcSeqInfo {
    u32 offset; // in the sequence data, -1: none
    NNSSndSeqParam param;
} SndSeqArcSeqInfo;

typedef struct SndSeqArc {
    u8 unk_00[0x18];
    u32 baseOffset; // sequence data, from the start of the file
    u32 count;
    SndSeqArcSeqInfo seqInfo[0];
} SndSeqArc;

typedef struct SndSeqData {
    u8 unk_00[0x18];
    u32 baseOffset; // sequence data, from the start of the file
} SndSeqData;

BOOL NNS_SndArcPlayerStartSeqArc(NNSSndHandle *handle, int seqArcNo, int index);
BOOL StartSeq(NNSSndHandle *handle, int playerNo, int bankNo, int playerPrio, const SndArcSeqInfo *seqInfo, int seqNo);
BOOL StartSeqArc(NNSSndHandle *handle, int playerNo, int bankNo, int playerPrio, const SndSeqArcSeqInfo *seqInfo, SndSeqArc *seqArc, int seqArcNo, int index);
const SndSeqArcSeqInfo *NNSi_SndSeqArcGetSeqInfo(const SndSeqArc *seqArc, int index);

// ---- sound archive stream players (snd_arc_strm.c); only the members the C code uses

#define SND_ARC_STRM_PLAYER_NUM 4

typedef struct SndArcStrmHandle {
    struct SndArcStrmPlayer *player;
} SndArcStrmHandle;

typedef struct SndArcStrmPlayer {
    SndStrm strm;
    u8 unk_5C[0xE8 - 0x5C];
    SndFader fader;
    u8 unk_F8[0x110 - 0xF8];
    s32 isActive : 1;
    s32 isStarted : 1;
    s32 isPrepared : 1; // start pending until isReady
    s32 isFadeOut : 1;  // stops when the fader has finished
    s32 unused : 28;
    BOOL isValid;
    BOOL isReady;
    u8 unk_11C[4];
    u32 chRefCount;
    u8 unk_124[0x14C - 0x124];
    SndArcStrmHandle *handle;
    u32 unk_150;
    int initVolume;
    int extVolume;
    int volume; // decibel last set
    u32 unk_160[2];
    void (*disposeFunc)(struct SndArcStrmPlayer *player);
    u32 unk_16C;
    void (*stopFunc)(struct SndArcStrmPlayer *player);
} SndArcStrmPlayer;

typedef struct SndArcStrmCommand {
    NNSFndLink link;
    SndArcStrmPlayer *player;
} SndArcStrmCommand;

typedef struct SndArcStrmThreadWork {
    u8 unk_000[0x4C8];
    OSMutex mutex;
    NNSFndList commandList;
} SndArcStrmThreadWork;

typedef struct SndArcStrmUnkWork {
    u32 unk_0;
    SndArcStrmThreadWork *threadWork;
    u32 unk_8;
} SndArcStrmUnkWork;

extern SndArcStrmUnkWork _021E0950;
extern NNSFndList gSndArcStrmFreeCommandList;
extern OSMutex gSndArcStrmMutex;
extern NNSFndList gSndArcStrmCommandList;
extern SndArcStrmPlayer gSndArcStrmPlayers[SND_ARC_STRM_PLAYER_NUM];

void FreePlayer(SndArcStrmPlayer *player);
void ForceStopStrm__SndArc(SndArcStrmPlayer *player);
void ShutdownPlayer__SndArc(SndArcStrmPlayer *player);
void FreeChannel(SndArcStrmPlayer *player);
void RemoveCommandByPlayer(NNSFndList *commandList, SndArcStrmPlayer *player);
void FreeCommandBuffer(SndArcStrmCommand *command);

#endif // POKEHEARTGOLD_NNSYS_SND_ARC_STRM_INTERNAL_H
