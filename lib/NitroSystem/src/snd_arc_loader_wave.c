#include <nitro.h>
#include <nnsys/snd_arc_strm_internal.h>

// forgets the file address kept by `arc` if it is still `mem`
void DisposeCallback(void *mem, NNSSndArc *arc, u32 fileId) {
    NNSSndArc *prevArc;
    OSIntrMode intrMode;
    if (arc == NULL) {
        return;
    }
    intrMode = OS_DisableInterrupts();
    prevArc = NNS_SndArcSetCurrent(arc);
    if (mem == NNS_SndArcGetFileAddress(fileId)) {
        NNS_SndArcSetFileAddress(fileId, NULL);
    }
    NNS_SndArcSetCurrent(prevArc);
    OS_RestoreInterrupts(intrMode);
}

void SeqDisposeCallback(void *mem, u32 size, u32 data1, u32 data2) {
    DisposeCallback(mem, (NNSSndArc *)data1, data2);
    SND_InvalidateSeqData(mem, (u8 *)mem + size);
}

void BankDisposeCallback(void *mem, u32 size, u32 data1, u32 data2) {
    DisposeCallback(mem, (NNSSndArc *)data1, data2);
    SND_InvalidateBankData(mem, (u8 *)mem + size);
    SND_DestroyBank(mem);
}

void WaveArcDisposeCallback(void *mem, u32 size, u32 data1, u32 data2) {
    DisposeCallback(mem, (NNSSndArc *)data1, data2);
    SND_InvalidateWaveData(mem, (u8 *)mem + size);
    SND_DestroyWaveArc(mem);
}

void WaveArcTableDisposeCallback(void *mem, u32 size, u32 data1, u32 data2) {
    DisposeCallback(mem, (NNSSndArc *)data1, data2);
    SND_DestroyWaveArc(mem);
}

// data1: wave archive table, data2: wave index
void SingleWaveDisposeCallback(void *mem, u32 size, u32 data1, u32 data2) {
    if (mem == SND_GetWaveDataAddress((void *)data1, data2)) {
        SND_SetWaveDataAddress((void *)data1, data2, NULL);
    }
    SND_InvalidateWaveData(mem, (u8 *)mem + size);
}

#pragma force_active on

// loads wave `index` of the wave archive file unless it is loaded already
BOOL LoadSingleWave(SndWaveArcTable *table, int index, u32 fileId, NNSSndHeapHandle heap) {
    u32 start, end, size, waveCount;
    void *data;
    start = (u32)SND_GetWaveDataAddress(table, index);
    if (start) {
        return TRUE;
    }
    waveCount = SND_GetWaveDataCount(table);
    start = table->offsets[table->waveCount + index];
    end = index < waveCount - 1 ? table->offsets[table->waveCount + index + 1] : ((SNDBinaryFileHeader *)table)->fileSize;
    size = end - start;
    if (!heap) {
        return FALSE;
    }
    data = NNS_SndHeapAlloc(heap, size + 32, SingleWaveDisposeCallback, (u32)table, index);
    if (!data) {
        return FALSE;
    }
    if (NNS_SndArcReadFile(fileId, data, size, start) != size) {
        return FALSE;
    }
    DC_StoreRange(data, size);
    SND_SetWaveDataAddress(table, index, data);
    return TRUE;
}

// loads the waves of the bank's instruments that use wave archive slot `waveArcIdx`
BOOL LoadSingleWaves(SndWaveArcTable *table, void *bank, int waveArcIdx, u32 fileId, NNSSndHeapHandle heap) {
    SndInstPos pos;
    SndInstPos first;
    SndInstData instData;
    first = SND_GetFirstInstDataPos(bank);
    pos = first;
    if (!bank) {
        return FALSE;
    }
    while (SND_GetNextInstData(bank, &instData, &pos)) {
        if (instData.type == SND_INST_PCM && waveArcIdx == instData.waveArcIdx) {
            if (!LoadSingleWave(table, instData.waveNo, fileId, heap)) {
                return FALSE;
            }
        }
    }
    return TRUE;
}
