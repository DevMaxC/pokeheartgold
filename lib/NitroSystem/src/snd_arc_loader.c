#include <nitro.h>
#include <nnsys/snd_arc_internal.h>

BOOL NNS_SndArcLoadGroup(int groupNo, NNSSndHeapHandle heap) {
    return NNSi_SndArcLoadGroup(groupNo, heap) == SND_ARC_LOAD_OK;
}

BOOL NNS_SndArcLoadSeq(int seqNo, NNSSndHeapHandle heap) {
    return NNSi_SndArcLoadSeq(seqNo, SND_ARC_LOAD_ALL, heap, TRUE, NULL) == SND_ARC_LOAD_OK;
}

BOOL NNS_SndArcLoadBank(int bankNo, NNSSndHeapHandle heap) {
    return NNSi_SndArcLoadBank(bankNo, SND_ARC_LOAD_ALL, heap, TRUE, NULL) == SND_ARC_LOAD_OK;
}

BOOL NNS_SndArcLoadWaveArc(int waveArcNo, NNSSndHeapHandle heap) {
    return NNSi_SndArcLoadWaveArc(waveArcNo, SND_ARC_LOAD_ALL, heap, TRUE, NULL) == SND_ARC_LOAD_OK;
}

BOOL NNS_SndArcLoadSeqEx(int seqNo, u32 loadFlag, NNSSndHeapHandle heap) {
    return NNSi_SndArcLoadSeq(seqNo, loadFlag, heap, TRUE, NULL) == SND_ARC_LOAD_OK;
}

#pragma force_active on

int NNSi_SndArcLoadGroup(int groupNo, NNSSndHeapHandle heap) {
    const SndArcGroupInfo *groupInfo = NNS_SndArcGetGroupInfo(groupNo);
    u32 i;
    const SndArcGroupItem *item;
    int result;
    if (!groupInfo) {
        return SND_ARC_LOAD_ERR_NO_GROUP;
    }
    for (i = 0; i < groupInfo->count; i++) {
        item = &groupInfo->items[i];
        switch (item->type) {
        case SND_ARC_GROUP_ITEM_SEQ:
            result = NNSi_SndArcLoadSeq(item->index, item->loadFlag, heap, TRUE, NULL);
            if (result) {
                return result;
            }
            break;
        case SND_ARC_GROUP_ITEM_SEQARC:
            result = NNSi_SndArcLoadSeqArc(item->index, item->loadFlag, heap, TRUE, NULL);
            if (result) {
                return result;
            }
            break;
        case SND_ARC_GROUP_ITEM_BANK:
            result = NNSi_SndArcLoadBank(item->index, item->loadFlag, heap, TRUE, NULL);
            if (result) {
                return result;
            }
            break;
        case SND_ARC_GROUP_ITEM_WAVEARC:
            result = NNSi_SndArcLoadWaveArc(item->index, item->loadFlag, heap, TRUE, NULL);
            if (result) {
                return result;
            }
            break;
        }
    }
    return SND_ARC_LOAD_OK;
}

#pragma force_active off

// loads the sequence's bank (and its wave archives) too
int NNSi_SndArcLoadSeq(int seqNo, u32 loadFlag, NNSSndHeapHandle heap, BOOL setAddress, void **pData) {
    const SndArcSeqInfo *seqInfo = NNS_SndArcGetSeqInfo(seqNo);
    if (!seqInfo) {
        return SND_ARC_LOAD_ERR_NO_SEQ;
    }
    int result = NNSi_SndArcLoadBank(seqInfo->param.bankNo, loadFlag, heap, setAddress, NULL);
    if (result) {
        return result;
    }
    u32 fileId = seqInfo->fileId;
    void *data;
    if (loadFlag & SND_ARC_LOAD_SEQ) {
        data = LoadSeq(fileId, heap, setAddress);
        if (!data) {
            return SND_ARC_LOAD_ERR_SEQ;
        }
    } else {
        data = NNS_SndArcGetFileAddress(fileId);
    }
    if (pData) {
        *pData = data;
    }
    return SND_ARC_LOAD_OK;
}

int NNSi_SndArcLoadSeqArc(int seqArcNo, u32 loadFlag, NNSSndHeapHandle heap, BOOL setAddress, void **pData) {
    const SndArcSeqArcInfo *seqArcInfo = NNS_SndArcGetSeqArcInfo(seqArcNo);
    if (!seqArcInfo) {
        return SND_ARC_LOAD_ERR_NO_SEQARC;
    }
    u32 fileId = seqArcInfo->fileId;
    void *data;
    if (loadFlag & SND_ARC_LOAD_SEQARC) {
        data = LoadSeqArc(fileId, heap, setAddress);
        if (!data) {
            return SND_ARC_LOAD_ERR_SEQARC;
        }
    } else {
        data = NNS_SndArcGetFileAddress(fileId);
    }
    if (pData) {
        *pData = data;
    }
    return SND_ARC_LOAD_OK;
}

#pragma force_active on

// loads the bank and its wave archives and assigns them to the bank
int NNSi_SndArcLoadBank(int bankNo, u32 loadFlag, NNSSndHeapHandle heap, BOOL setAddress, void **pData) {
    const struct NNSSndArcBankInfo *bankInfo = NNS_SndArcGetBankInfo(bankNo);
    void *bank;
    if (bankInfo == NULL) {
        return SND_ARC_LOAD_ERR_NO_BANK;
    }
    if (loadFlag & SND_ARC_LOAD_BANK) {
        bank = LoadBank(bankInfo->fileId, heap, setAddress);
        if (bank == NULL) {
            return SND_ARC_LOAD_ERR_BANK;
        }
    } else {
        bank = NNS_SndArcGetFileAddress(bankInfo->fileId);
    }
    for (int i = 0; i < SND_ARC_BANK_WAVEARC_NUM; i++) {
        if (bankInfo->waveArcNo[i] != SND_ARC_NO_WAVEARC) {
            const SndArcWaveArcInfo *waveArcInfo = NNS_SndArcGetWaveArcInfo(bankInfo->waveArcNo[i]);
            void *waveArc;
            int result;
            if (waveArcInfo == NULL) {
                return SND_ARC_LOAD_ERR_NO_WAVEARC;
            }
            result = NNSi_SndArcLoadWaveArc(bankInfo->waveArcNo[i], loadFlag, heap, setAddress, &waveArc);
            if (result != SND_ARC_LOAD_OK) {
                return result;
            }
            if ((waveArcInfo->flags & SND_ARC_WAVEARC_SINGLE_LOAD) && (loadFlag & SND_ARC_LOAD_WAVE)) {
                if (!LoadSingleWaves(waveArc, bank, i, waveArcInfo->fileId, heap)) {
                    return SND_ARC_LOAD_ERR_WAVE;
                }
            }
            if (bank && waveArc) {
                SND_AssignWaveArc(bank, i, waveArc);
            }
        }
    }
    if (pData) {
        *pData = bank;
    }
    return SND_ARC_LOAD_OK;
}

#pragma force_active off

int NNSi_SndArcLoadWaveArc(int waveArcNo, u32 loadFlag, NNSSndHeapHandle heap, BOOL setAddress, void **pData) {
    const SndArcWaveArcInfo *waveArcInfo = NNS_SndArcGetWaveArcInfo(waveArcNo);
    if (!waveArcInfo) {
        return SND_ARC_LOAD_ERR_NO_WAVEARC;
    }
    void *data;
    if (loadFlag & SND_ARC_LOAD_WAVE) {
        if (waveArcInfo->flags & SND_ARC_WAVEARC_SINGLE_LOAD) {
            data = LoadWaveArcTable(waveArcInfo->fileId, heap, setAddress);
        } else {
            data = LoadWaveArc(waveArcInfo->fileId, heap, setAddress);
        }
        if (!data) {
            return SND_ARC_LOAD_ERR_WAVE;
        }
    } else {
        data = NNS_SndArcGetFileAddress(waveArcInfo->fileId);
    }
    if (pData) {
        *pData = data;
    }
    return SND_ARC_LOAD_OK;
}

// reads a whole archive file into `heap`
void *NNSi_SndArcLoadFile(u32 fileId, SndHeapDisposeCallback callback, u32 data1, u32 data2, NNSSndHeapHandle heap) {
    u32 size = NNS_SndArcGetFileSize(fileId);
    if (!size) {
        return NULL;
    }
    if (!heap) {
        return NULL;
    }
    void *data = NNS_SndHeapAlloc(heap, size + 32, callback, data1, data2);
    if (!data) {
        return NULL;
    }
    if (NNS_SndArcReadFile(fileId, data, size, 0) != size) {
        return NULL;
    }
    DC_StoreRange(data, size);
    return data;
}

// loads the file unless it is in memory already; with `setAddress`, the archive keeps its address
#define DEFINE_FILE_LOADER(name, disposeCallback)                                        \
    void *name(u32 fileId, NNSSndHeapHandle heap, BOOL setAddress) {                     \
        void *data = NNS_SndArcGetFileAddress(fileId);                                   \
        if (data == NULL) {                                                              \
            NNSSndArc *arc = setAddress ? NNS_SndArcGetCurrent() : NULL;                 \
            data = NNSi_SndArcLoadFile(fileId, disposeCallback, (u32)arc, fileId, heap); \
            if (setAddress && data != NULL) {                                            \
                NNS_SndArcSetFileAddress(fileId, data);                                  \
            }                                                                            \
        }                                                                                \
        return data;                                                                     \
    }

DEFINE_FILE_LOADER(LoadSeq, SeqDisposeCallback)
DEFINE_FILE_LOADER(LoadSeqArc, SeqDisposeCallback)
DEFINE_FILE_LOADER(LoadBank, BankDisposeCallback)
DEFINE_FILE_LOADER(LoadWaveArc, WaveArcDisposeCallback)

#pragma force_active on

SndWaveArcHeader gSndWaveArcHeader;

// loads only the header and offset table of a wave archive, followed by room for the wave addresses
SndWaveArcTable *LoadWaveArcTable(u32 fileId, NNSSndHeapHandle heap, BOOL setAddress) {
    u32 tableSize;
    SndWaveArcTable *table;
    u32 offsetsSize;
    NNSSndArc *arc;
    table = NNS_SndArcGetFileAddress(fileId);
    if (table == NULL) {
        if (NNS_SndArcReadFile(fileId, gSndWaveArcHeader.header, sizeof(SndWaveArcHeader), 0) != sizeof(SndWaveArcHeader)) {
            return NULL;
        }
        offsetsSize = gSndWaveArcHeader.waveCount * sizeof(u32);
        tableSize = offsetsSize * 2;
        if (heap == NULL) {
            return NULL;
        }
        arc = setAddress ? NNS_SndArcGetCurrent() : NULL;
        table = NNS_SndHeapAlloc(heap, tableSize + sizeof(SndWaveArcHeader) + 32, WaveArcTableDisposeCallback, (u32)arc, fileId);
        if (table == NULL) {
            return NULL;
        }
        {
            s32 readSize = NNS_SndArcReadFile(fileId, table, sizeof(SndWaveArcHeader) + offsetsSize, 0);
            if (readSize != sizeof(SndWaveArcHeader) + offsetsSize) {
                return NULL;
            }
        }
        // offsets go to the second half, the first half holds the loaded wave addresses
        MI_CpuCopy8(&table->offsets[0], &table->offsets[table->waveCount], offsetsSize);
        MI_CpuFill8(&table->offsets[0], 0, offsetsSize);
        DC_StoreRange(table, tableSize + sizeof(SndWaveArcHeader));
        if (setAddress) {
            NNS_SndArcSetFileAddress(fileId, table);
        }
    }
    return table;
}
