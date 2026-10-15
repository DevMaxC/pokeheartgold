#include <nitro.h>
#include <nnsys/snd_internal.h>

// linear fade from `origin` to `target` over `frames` updates

void NNSi_SndFaderInit(SndFader *fader) {
    fader->target = 0;
    fader->origin = 0;
    fader->frames = 0;
    fader->counter = 0;
}

void NNSi_SndFaderSet(SndFader *fader, s32 target, s32 frames) {
    fader->origin = NNSi_SndFaderGet(fader);
    fader->target = target;
    fader->frames = frames;
    fader->counter = 0;
}

s32 NNSi_SndFaderGet(SndFader *fader) {
    if (fader->counter >= fader->frames) {
        return fader->target;
    }
    return fader->origin + (fader->target - fader->origin) * fader->counter / fader->frames;
}

void NNSi_SndFaderUpdate(SndFader *fader) {
    if (fader->counter < fader->frames) {
        fader->counter++;
    }
}

BOOL NNSi_SndFaderIsFinished(SndFader *fader) {
    return fader->counter >= fader->frames;
}
