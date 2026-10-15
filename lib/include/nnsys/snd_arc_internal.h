#ifndef POKEHEARTGOLD_NNSYS_SND_ARC_INTERNAL_H
#define POKEHEARTGOLD_NNSYS_SND_ARC_INTERNAL_H

// NitroSystem sound library: sound archive, sound heap and archive loader declarations the public
// nnsys/snd headers lack, shared by lib/NitroSystem/src/snd_arc*.c and snd_heap.c.

#include <nitro.h>
#include <nnsys/snd_internal.h>

// ---- sound archive (snd_arc.c)

typedef struct SndArcOffsetTable {
    u32 count;
    u32 offsets[0]; // from the start of the info block, 0: none
} SndArcOffsetTable;

typedef struct SndArcSeqInfo {
    u32 fileId;
    NNSSndSeqParam param;
} SndArcSeqInfo;

typedef struct SndArcSeqArcInfo {
    u32 fileId;
} SndArcSeqArcInfo;

#define SND_ARC_BANK_WAVEARC_NUM 4
#define SND_ARC_NO_WAVEARC       0xFFFF

struct NNSSndArcBankInfo {
    u32 fileId;
    u16 waveArcNo[SND_ARC_BANK_WAVEARC_NUM];
};

#define SND_ARC_WAVEARC_SINGLE_LOAD 1 // waves are loaded one by one on demand

typedef struct SndArcWaveArcInfo {
    u32 fileId : 24;
    u32 flags : 8;
} SndArcWaveArcInfo;

// sequence player settings (table at NNSSndArcInfo.playerInfoOffset)
typedef struct SndArcPlayerInfo {
    u8 seqMax;
    u8 padding;
    u16 allocChBitFlag;
    u32 heapSize;
} SndArcPlayerInfo;

enum {
    SND_ARC_GROUP_ITEM_SEQ,
    SND_ARC_GROUP_ITEM_BANK,
    SND_ARC_GROUP_ITEM_WAVEARC,
    SND_ARC_GROUP_ITEM_SEQARC,
};

typedef struct SndArcGroupItem {
    u8 type; // SND_ARC_GROUP_ITEM_*
    u8 loadFlag;
    u16 padding;
    u32 index;
} SndArcGroupItem;

typedef struct SndArcGroupInfo {
    u32 count;
    SndArcGroupItem items[0];
} SndArcGroupInfo;

extern NNSSndArc *gSndCurrentArc;

BOOL NNS_SndArcSetup(NNSSndArc *arc, NNSSndHeapHandle heap, BOOL symbolLoadFlag);
void NNS_SndArcInitOnMemory(NNSSndArc *arc, void *data);
NNSSndArc *NNS_SndArcSetCurrent(NNSSndArc *arc);
NNSSndArc *NNS_SndArcGetCurrent(void);
const SndArcSeqInfo *NNS_SndArcGetSeqInfo(int seqNo);
const SndArcSeqArcInfo *NNS_SndArcGetSeqArcInfo(int seqArcNo);
const struct NNSSndArcBankInfo *NNS_SndArcGetBankInfo(int bankNo);
const SndArcWaveArcInfo *NNS_SndArcGetWaveArcInfo(int waveArcNo);
const SndArcPlayerInfo *NNS_SndArcGetStrmInfo(int playerNo); // the player info table
const SndArcGroupInfo *NNS_SndArcGetGroupInfo(int groupNo);
u32 NNS_SndArcGetFileSize(u32 fileId);
int NNS_SndArcReadFile(u32 fileId, void *buffer, int size, u32 offset);
void *NNS_SndArcGetFileAddress(u32 fileId);
void NNS_SndArcSetFileAddress(u32 fileId, const void *address);
void InfoDisposeCallback(void *mem, u32 size, u32 data1, u32 data2);
void FatDisposeCallback(void *mem, u32 size, u32 data1, u32 data2);
void SymbolDisposeCallback(void *mem, u32 size, u32 data1, u32 data2);

// ---- sound heap (snd_heap.c): a frame heap whose allocations are grouped in sections, one per saved
// state; every block carries the callback that releases what was loaded into it

struct NNSSndHeap {
    NNSFndHeapHandle frmHeap;
    NNSFndList sectionList;
};

typedef struct SndHeapSection {
    NNSFndList blockList;
    NNSFndLink link;
} SndHeapSection;

typedef struct SndHeapBlock {
    NNSFndLink link;
    u32 size;
    SndHeapDisposeCallback callback;
    u32 data1;
    u32 data2;
    u8 padding[8]; // the data is 32-byte aligned
} SndHeapBlock;

#define SND_FRMHEAP_FREE_ALL 3 // head and tail

BOOL InitHeap(NNSSndHeapHandle heap, NNSFndHeapHandle frmHeap);
void InitHeapSection(SndHeapSection *section);
BOOL NewSection(NNSSndHeapHandle heap);
void EraseSync(void);

// ---- archive loader (snd_arc_loader.c)

#define SND_ARC_LOAD_SEQ    (1 << 0)
#define SND_ARC_LOAD_BANK   (1 << 1)
#define SND_ARC_LOAD_WAVE   (1 << 2)
#define SND_ARC_LOAD_SEQARC (1 << 3)
#define SND_ARC_LOAD_ALL    0xFF

enum {
    SND_ARC_LOAD_OK,
    SND_ARC_LOAD_ERR_NO_GROUP,
    SND_ARC_LOAD_ERR_NO_SEQ,
    SND_ARC_LOAD_ERR_NO_SEQARC,
    SND_ARC_LOAD_ERR_NO_BANK,
    SND_ARC_LOAD_ERR_NO_WAVEARC,
    SND_ARC_LOAD_ERR_SEQ,
    SND_ARC_LOAD_ERR_SEQARC,
    SND_ARC_LOAD_ERR_BANK,
    SND_ARC_LOAD_ERR_WAVE,
};

// the first 0x3C bytes of a wave archive (file header, block header, wave count)
typedef struct SndWaveArcHeader {
    u8 header[0x38];
    u32 waveCount;
} SndWaveArcHeader;

// a wave archive loaded for single wave loading: its offsets followed by the loaded wave addresses
typedef struct SndWaveArcTable {
    u8 header[0x38];
    u32 waveCount;
    u32 offsets[0];
} SndWaveArcTable;

extern SndWaveArcHeader gSndWaveArcHeader;

int NNSi_SndArcLoadGroup(int groupNo, NNSSndHeapHandle heap);
int NNSi_SndArcLoadSeq(int seqNo, u32 loadFlag, NNSSndHeapHandle heap, BOOL setAddress, void **pData);
int NNSi_SndArcLoadSeqArc(int seqArcNo, u32 loadFlag, NNSSndHeapHandle heap, BOOL setAddress, void **pData);
int NNSi_SndArcLoadBank(int bankNo, u32 loadFlag, NNSSndHeapHandle heap, BOOL setAddress, void **pData);
int NNSi_SndArcLoadWaveArc(int waveArcNo, u32 loadFlag, NNSSndHeapHandle heap, BOOL setAddress, void **pData);
void *NNSi_SndArcLoadFile(u32 fileId, SndHeapDisposeCallback callback, u32 data1, u32 data2, NNSSndHeapHandle heap);
void *LoadSeq(u32 fileId, NNSSndHeapHandle heap, BOOL setAddress);
void *LoadSeqArc(u32 fileId, NNSSndHeapHandle heap, BOOL setAddress);
void *LoadBank(u32 fileId, NNSSndHeapHandle heap, BOOL setAddress);
void *LoadWaveArc(u32 fileId, NNSSndHeapHandle heap, BOOL setAddress);
SndWaveArcTable *LoadWaveArcTable(u32 fileId, NNSSndHeapHandle heap, BOOL setAddress);
BOOL LoadSingleWaves(SndWaveArcTable *table, void *bank, int index, u32 fileId, NNSSndHeapHandle heap);
void SeqDisposeCallback(void *mem, u32 size, u32 data1, u32 data2);
void BankDisposeCallback(void *mem, u32 size, u32 data1, u32 data2);
void WaveArcDisposeCallback(void *mem, u32 size, u32 data1, u32 data2);
void WaveArcTableDisposeCallback(void *mem, u32 size, u32 data1, u32 data2);
void SND_AssignWaveArc(void *bank, int index, void *waveArc);

#endif // POKEHEARTGOLD_NNSYS_SND_ARC_INTERNAL_H
