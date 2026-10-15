#include <nitro.h>
#include <nnsys/snd_arc_internal.h>

// The info table getters read gSndCurrentArc->info a second time through a volatile view; needed for
// the match.
#define ARC_INFO_VOLATILE(arc) (*(u8 *volatile *)&(arc)->info)

void NNS_SndArcInit(NNSSndArc *arc, const char *filePath, NNSSndHeapHandle heap, BOOL symbolLoadFlag) {
    arc->info = NULL;
    arc->fat = NULL;
    arc->symbol = NULL;
    arc->loadBlockSize = 0;
    if (!FS_ConvertPathToFileID(&arc->fileId, filePath)) {
        return;
    }
    FS_InitFile(&arc->file);
    if (!FS_OpenFileFast(&arc->file, arc->fileId)) {
        return;
    }
    arc->file_open = TRUE;
    if (NNS_SndArcSetup(arc, heap, symbolLoadFlag)) {
        gSndCurrentArc = arc;
    }
}

#pragma force_active on

// reads the header, then the info, FAT and (optionally) symbol blocks into `heap`
BOOL NNS_SndArcSetup(NNSSndArc *arc, NNSSndHeapHandle heap, BOOL symbolLoadFlag) {
    s32 readSize;
    if (!FS_SeekFile(&arc->file, 0, FS_SEEK_SET)) {
        return FALSE;
    }
    if (FS_ReadFile(&arc->file, arc, sizeof(NNSSndArcHeader)) != sizeof(NNSSndArcHeader)) {
        return FALSE;
    }
    if (heap) {
        arc->info = NNS_SndHeapAlloc(heap, arc->header.infoSize, InfoDisposeCallback, (u32)arc, 0);
        if (!arc->info) {
            return FALSE;
        }
        if (!FS_SeekFile(&arc->file, arc->header.infoOffset, FS_SEEK_SET)) {
            return FALSE;
        }
        readSize = FS_ReadFile(&arc->file, arc->info, arc->header.infoSize);
        if (readSize != (s32)arc->header.infoSize) {
            return FALSE;
        }
        arc->fat = NNS_SndHeapAlloc(heap, arc->header.fatSize, FatDisposeCallback, (u32)arc, 0);
        if (!arc->fat) {
            return FALSE;
        }
        if (!FS_SeekFile(&arc->file, arc->header.fatOffset, FS_SEEK_SET)) {
            return FALSE;
        }
        readSize = FS_ReadFile(&arc->file, arc->fat, arc->header.fatSize);
        if (readSize != (s32)arc->header.fatSize) {
            return FALSE;
        }
        if (symbolLoadFlag && arc->header.symbolDataSize) {
            arc->symbol = NNS_SndHeapAlloc(heap, arc->header.symbolDataSize, SymbolDisposeCallback, (u32)arc, 0);
            if (!arc->symbol) {
                return FALSE;
            }
            if (!FS_SeekFile(&arc->file, arc->header.symbolDataOffset, FS_SEEK_SET)) {
                return FALSE;
            }
            readSize = FS_ReadFile(&arc->file, arc->symbol, arc->header.symbolDataSize);
            if (readSize != (s32)arc->header.symbolDataSize) {
                return FALSE;
            }
        }
    }
    return TRUE;
}

#pragma force_active off

// uses an archive already in memory: every file is at its offset in `data`
void NNS_SndArcInitOnMemory(NNSSndArc *arc, void *data) {
    MIi_CpuCopy32(data, (u32 *)arc, sizeof(NNSSndArcHeader));
    u32 offset = arc->header.infoOffset;
    arc->info = offset == 0 ? NULL : (NNSSndArcInfo *)((u8 *)data + offset);
    offset = arc->header.fatOffset;
    arc->fat = offset == 0 ? NULL : (NNSSndArcFat *)((u8 *)data + offset);
    offset = arc->header.symbolDataOffset;
    arc->symbol = offset == 0 ? NULL : (NNSSndArcSymbol *)((u8 *)data + offset);
    arc->loadBlockSize = 0;
    for (u32 i = 0; i < arc->fat->count; ++i) {
        NNSSndArcFileInfo *file = &arc->fat->files[i];
        u32 fileOffset = file->offset;
        file->mem = fileOffset == 0 ? NULL : (u8 *)data + fileOffset;
    }
    arc->file_open = FALSE;
    gSndCurrentArc = arc;
}

NNSSndArc *NNS_SndArcSetCurrent(NNSSndArc *arc) {
    NNSSndArc *prev = gSndCurrentArc;
    gSndCurrentArc = arc;
    return prev;
}

NNSSndArc *NNS_SndArcGetCurrent(void) {
    return gSndCurrentArc;
}

const NNSSndSeqParam *NNS_SndArcGetSeqParam(int seqNo) {
    const SndArcSeqInfo *seqInfo = NNS_SndArcGetSeqInfo(seqNo);
    return seqInfo == NULL ? NULL : &seqInfo->param;
}

// entry `index` of the info offset table at `tableOffset` (an NNSSndArcInfo member), NULL if none
#define DEFINE_ARC_INFO_GETTER(type, name, tableOffset)                                           \
    const type *name(int index) {                                                                 \
        NNSSndArc *arc = gSndCurrentArc;                                                          \
        u8 *info = (u8 *)arc->info;                                                               \
        u32 tableOfs = ((NNSSndArcInfo *)info)->tableOffset;                                      \
        SndArcOffsetTable *table = tableOfs == 0 ? NULL : (SndArcOffsetTable *)(info + tableOfs); \
        if (table == NULL) {                                                                      \
            return NULL;                                                                          \
        }                                                                                         \
        if (index < 0) {                                                                          \
            return NULL;                                                                          \
        }                                                                                         \
        if ((u32)index >= table->count) {                                                         \
            return NULL;                                                                          \
        }                                                                                         \
        u32 offset = table->offsets[index];                                                       \
        u8 *base = ARC_INFO_VOLATILE(arc);                                                        \
        return offset == 0 ? NULL : (const type *)(base + offset);                                \
    }

DEFINE_ARC_INFO_GETTER(SndArcSeqInfo, NNS_SndArcGetSeqInfo, seqOffset)
DEFINE_ARC_INFO_GETTER(SndArcSeqArcInfo, NNS_SndArcGetSeqArcInfo, seqArcOffset)
DEFINE_ARC_INFO_GETTER(struct NNSSndArcBankInfo, NNS_SndArcGetBankInfo, bankOffset)
DEFINE_ARC_INFO_GETTER(SndArcWaveArcInfo, NNS_SndArcGetWaveArcInfo, waveArcOffset)
DEFINE_ARC_INFO_GETTER(SndArcPlayerInfo, NNS_SndArcGetStrmInfo, playerInfoOffset)
DEFINE_ARC_INFO_GETTER(SndArcGroupInfo, NNS_SndArcGetGroupInfo, groupInfoOffset)

u32 NNS_SndArcGetFileSize(u32 fileId) {
    NNSSndArcFat *fat = gSndCurrentArc->fat;
    if (fileId >= fat->count) {
        return 0;
    }
    return fat->files[fileId].size;
}

#pragma force_active on

// reads in blocks of loadBlockSize bytes (0: at once); returns the size read or a negative error
int NNS_SndArcReadFile(u32 fileId, void *buffer, int size, u32 offset) {
    NNSSndArc *arc = gSndCurrentArc;
    NNSSndArcFileInfo *file;
    int readSize, blockSize, result;
    if (fileId >= arc->fat->count) {
        return -1;
    }
    blockSize = arc->loadBlockSize;
    file = &arc->fat->files[fileId];
    if (blockSize == 0) {
        blockSize = size;
    }
    readSize = 0;
    while (readSize < size) {
        int len = size - readSize;
        if (len > blockSize) {
            len = blockSize;
        }
        if ((u32)len > file->size - offset) {
            len = file->size - offset;
        }
        if (!len) {
            break;
        }
        if (!FS_SeekFile(&arc->file, file->offset + offset, FS_SEEK_SET)) {
            return -1;
        }
        result = FS_ReadFile(&arc->file, buffer, len);
        if (result < 0) {
            return result;
        }
        readSize += result;
        offset += result;
        buffer = (u8 *)buffer + result;
    }
    return readSize;
}

#pragma force_active off

void *NNS_SndArcGetFileAddress(u32 fileId) {
    NNSSndArcFat *fat = gSndCurrentArc->fat;
    if (fileId >= fat->count) {
        return NULL;
    }
    return fat->files[fileId].mem;
}

void NNS_SndArcSetFileAddress(u32 fileId, const void *address) {
    gSndCurrentArc->fat->files[fileId].mem = (void *)address;
}

void InfoDisposeCallback(void *mem, u32 size, u32 data1, u32 data2) {
    NNSSndArc *arc = (NNSSndArc *)data1;
    arc->info = NULL;
}

void FatDisposeCallback(void *mem, u32 size, u32 data1, u32 data2) {
    NNSSndArc *arc = (NNSSndArc *)data1;
    arc->fat = NULL;
}

void SymbolDisposeCallback(void *mem, u32 size, u32 data1, u32 data2) {
    NNSSndArc *arc = (NNSSndArc *)data1;
    arc->symbol = NULL;
}
