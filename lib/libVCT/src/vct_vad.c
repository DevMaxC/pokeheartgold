#include "vct/vct_ssp_internal.h"

// Voice activity detection: voice starts when the frame energy exceeds twice the average of the last
// four scale values and ends after sVADInfo.limit quiet frames.

u32 E2scales[4];
u32 gVctVadThreshold;
static u32 sVadIndex;
static int sVadQuiet;

#pragma force_active on

void VCT_ResetVAD(void) {
    s32 i;

    for (i = 0; i < 4; i++) {
        E2scales[i] = 0x1000000;
    }
    *(volatile u32 *)&sVadIndex = 0;
    *(volatile u32 *)&gVctVadThreshold = 0;
    ((volatile VadInfo *)&sVADInfo)->state = 0;
    ((volatile VadInfo *)&sVADInfo)->energy = 0;
    *(volatile int *)&sVadQuiet = 0;
}

void VCT_GetVADInfo(void *out) {
    if (out) {
        MI_CpuCopy8(&sVADInfo, out, sizeof(VadInfo));
    }
}

static inline u32 RootAvg(void) {
    int i;
    u32 sum = 0;
    for (i = 0; i < 4; i++) {
        sum += E2scales[i];
    }
    reg_CP_SQRTCNT = 0;
    reg_CP_SQRT_PARAM_L = sum >> 2;
    while (reg_CP_SQRTCNT & 0x8000) {}
    return reg_CP_SQRT_RESULT;
}

static inline void PushScale(u32 scale) {
    E2scales[sVadIndex] = scale;
    sVadIndex = (sVadIndex + 1) & 3;
}

int VCTi_GetVADStatus(u32 scale, u32 energy, u8 *out) {
    int status;
    sVADInfo.energy = energy >> 8;
    if (out) {
        *out = energy >> 8;
    }
    if (!sVADInfo.state) {
        u32 avg = RootAvg();
        if (energy && energy >= avg * 2) {
            u32 sum = 0;
            u32 i;
            u32 r;
            for (i = 0; i < 4; i++) {
                sum += E2scales[i];
            }
            reg_CP_SQRTCNT = 0;
            reg_CP_SQRT_PARAM_L = sum >> 2;
            while (reg_CP_SQRTCNT & 0x8000) {}
            r = reg_CP_SQRT_RESULT;
            status = 1;
            gVctVadThreshold = (r * 3) >> 1;
            sVadIndex = 0;
            sVADInfo.state = 1;
        } else {
            status = 0;
        }
        PushScale(scale);
    } else {
        u32 avg;
        PushScale(scale);
        avg = RootAvg();
        if (avg <= gVctVadThreshold) {
            if (++sVadQuiet > sVADInfo.limit) {
                sVADInfo.state = 0;
                sVadQuiet = 0;
                sVadIndex = 0;
                return 3;
            }
        } else {
            sVadQuiet = 0;
        }
        status = 2;
    }
    return status;
}

void vct_init_vad(void) {
    sVADInfo.limit = 15;
    sVADInfo.unk_0C = (s16)sVADInfo.limit * (s16)0x44;
    VCT_ResetVAD();
}
