#include <nitro.h>
#include <nnsys/snd_arc_strm_internal.h>

const SndSeqArcSeqInfo *NNSi_SndSeqArcGetSeqInfo(const SndSeqArc *seqArc, int index) {
    const SndSeqArcSeqInfo *seqInfo;
    if (index < 0) {
        return NULL;
    }
    if ((u32)index >= seqArc->count) {
        return NULL;
    }
    seqInfo = &seqArc->seqInfo[index];
    if (seqInfo->offset == (u32)-1) {
        return NULL;
    }
    return seqInfo;
}
