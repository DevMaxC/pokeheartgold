#include <nitro.h>
#include <nnsys/snd_arc_strm_internal.h>

#pragma force_active on

// applies the archive's player settings and creates the player heaps in `heap`
BOOL NNS_SndArcPlayerSetup(NNSSndHeapHandle heap) {
    int playerNo;
    NNS_SndArcGetCurrent();
    for (playerNo = 0; playerNo < SND_PLAYER_NUM; playerNo++) {
        const SndArcPlayerInfo *playerInfo = NNS_SndArcGetStrmInfo(playerNo);
        if (playerInfo) {
            int i;
            NNS_SndPlayerSetPlayableSeqCount(playerNo, playerInfo->seqMax);
            NNS_SndPlayerSetAllocatableChannel(playerNo, playerInfo->allocChBitFlag);
            if (playerInfo->heapSize && heap) {
                for (i = 0; i < playerInfo->seqMax; i++) {
                    if (!NNS_SndPlayerCreateHeap(playerNo, heap, playerInfo->heapSize)) {
                        return FALSE;
                    }
                }
            }
        }
    }
    return TRUE;
}

// negative playerNo / bankNo / playerPrio: the sequence's own settings
BOOL NNS_SndArcPlayerStartSeqEx(NNSSndHandle *handle, int playerNo, int bankNo, int playerPrio, int seqNo) {
    const SndArcSeqInfo *seqInfo = NNS_SndArcGetSeqInfo(seqNo);
    if (!seqInfo) {
        return FALSE;
    }
    if (playerPrio < 0) {
        playerPrio = seqInfo->param.playerPrio;
    }
    if (bankNo < 0) {
        bankNo = seqInfo->param.bankNo;
    }
    if (playerNo < 0) {
        playerNo = seqInfo->param.playerNo;
    }
    return StartSeq(handle, playerNo, bankNo, playerPrio, seqInfo, seqNo);
}

BOOL NNS_SndArcPlayerStartSeqArc(NNSSndHandle *handle, int seqArcNo, int index) {
    const SndArcSeqArcInfo *seqArcInfo = NNS_SndArcGetSeqArcInfo(seqArcNo);
    SndSeqArc *seqArc;
    const SndSeqArcSeqInfo *seqInfo;
    if (!seqArcInfo) {
        return FALSE;
    }
    seqArc = NNS_SndArcGetFileAddress(seqArcInfo->fileId);
    if (!seqArc) {
        return FALSE;
    }
    seqInfo = NNSi_SndSeqArcGetSeqInfo(seqArc, index);
    if (!seqInfo) {
        return FALSE;
    }
    return StartSeqArc(handle, seqInfo->param.playerNo, seqInfo->param.bankNo, seqInfo->param.playerPrio, seqInfo, seqArc, seqArcNo, index);
}

// loads the bank and the sequence into the player heap and starts the sequence
BOOL StartSeq(NNSSndHandle *handle, int playerNo, int bankNo, int playerPrio, const SndArcSeqInfo *seqInfo, int seqNo) {
    NNSSndSeqPlayer *player = NNSi_SndPlayerAllocSeqPlayer(handle, playerNo, playerPrio);
    NNSSndHeapHandle heap;
    SndSeqData *seqData;
    void *bank;
    if (!player) {
        return FALSE;
    }
    heap = NNSi_SndPlayerAllocHeap(playerNo, player);
    if (NNSi_SndArcLoadBank(bankNo, SND_ARC_LOAD_BANK | SND_ARC_LOAD_WAVE, heap, FALSE, &bank)) {
        NNSi_SndPlayerFreeSeqPlayer(player);
        return FALSE;
    }
    if (NNSi_SndArcLoadSeq(seqNo, SND_ARC_LOAD_SEQ, heap, FALSE, (void **)&seqData)) {
        NNSi_SndPlayerFreeSeqPlayer(player);
        return FALSE;
    }
    NNSi_SndPlayerStartSeq(player, (u8 *)seqData + seqData->baseOffset, 0, bank);
    NNS_SndPlayerSetInitialVolume(handle, seqInfo->param.volume);
    NNS_SndPlayerSetChannelPriority(handle, seqInfo->param.channelPrio);
    NNS_SndPlayerSetSeqNo(handle, seqNo);
    return TRUE;
}

BOOL StartSeqArc(NNSSndHandle *handle, int playerNo, int bankNo, int playerPrio, const SndSeqArcSeqInfo *seqInfo, SndSeqArc *seqArc, int seqArcNo, int index) {
    NNSSndSeqPlayer *player = NNSi_SndPlayerAllocSeqPlayer(handle, playerNo, playerPrio);
    NNSSndHeapHandle heap;
    void *bank;
    if (!player) {
        return FALSE;
    }
    heap = NNSi_SndPlayerAllocHeap(playerNo, player);
    if (NNSi_SndArcLoadBank(bankNo, SND_ARC_LOAD_BANK | SND_ARC_LOAD_WAVE, heap, FALSE, &bank)) {
        NNSi_SndPlayerFreeSeqPlayer(player);
        return FALSE;
    }
    NNSi_SndPlayerStartSeq(player, (u8 *)seqArc + seqArc->baseOffset, seqInfo->offset, bank);
    NNS_SndPlayerSetInitialVolume(handle, seqInfo->param.volume);
    NNS_SndPlayerSetChannelPriority(handle, seqInfo->param.channelPrio);
    NNS_SndPlayerSetSeqArcNo(handle, seqArcNo, index);
    return TRUE;
}
