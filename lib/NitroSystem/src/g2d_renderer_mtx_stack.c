#include <nitro.h>

// this module addresses the renderer work area as its state only (needed for the match)
#define G2D_RENDERER_WORK_AS_STATE
#include <nnsys/g2d_renderer_internal.h>

// a view that makes the matrix stack push reread the state at every access (needed for the match)
#define VOLATILE_STATE (*(volatile G2dRendererState *)&gRendererWork)

#pragma force_active on

static inline BOOL IsMtxStackPushable(s32 level) {
    return level < RENDERER_MTX_STACK_SIZE ? TRUE : FALSE;
}

static inline void PushMtxStack(s32 next) {
    if (VOLATILE_STATE.translateOnly) {
        s32 current = VOLATILE_STATE.stackLevel;
        gRendererMtxStack[next]._20 = gRendererMtxStack[current]._20;
        gRendererMtxStack[next]._21 = gRendererMtxStack[current]._21;
        gRendererZStack[next] = gRendererZStack[current];
    } else {
        s32 current = VOLATILE_STATE.stackLevel;
        gRendererMtxStack[next] = gRendererMtxStack[current];
        gRendererAffineMtxStack[next] = gRendererAffineMtxStack[current];
        gRendererZStack[next] = gRendererZStack[current];
    }
    VOLATILE_STATE.stackLevel = next;
}

#pragma push
#pragma opt_propagation off

void NNS_G2dPushMtx(void) {
    if (!(VOLATILE_STATE.pRenderer->opzHint & RENDERER_OPZ_TRANSLATE_ONLY)) {
        s32 level = VOLATILE_STATE.stackLevel;
        u16 prev = (u16)level;
        s32 next = level + 1;
        u16 now;
        if (IsMtxStackPushable(next)) {
            PushMtxStack(next);
        }
        now = (u16)VOLATILE_STATE.stackLevel;
        gRendererMtxCacheRecords[now] = gRendererMtxCacheRecords[prev];
        if (gRendererMtxCacheRecords[prev].state == 1) {
            gRendererMtxCacheRecords[now].state = 2;
        } else {
            gRendererMtxCacheRecords[now].state = gRendererMtxCacheRecords[prev].state;
        }
    } else {
        s32 next = VOLATILE_STATE.stackLevel + 1;
        if (IsMtxStackPushable(next)) {
            PushMtxStack(next);
        }
    }
}

#pragma pop

static inline BOOL IsMtxStackEmpty(const G2dRendererState *pState) {
    return pState->stackLevel <= 0;
}

#pragma push
#pragma opt_propagation off

void NNS_G2dPopMtx(void) {
    if (!IsMtxStackEmpty(&gRendererWork)) {
        s32 level = gRendererWork.stackLevel - 1;
        u16 affineLevel = gRendererContext.affineLevel;
        gRendererWork.stackLevel = level;
        if (affineLevel > level) {
            gRendererContext.affineLevel = RENDERER_NO_AFFINE_LEVEL;
        }
    }
}

#pragma pop

void NNS_G2dTranslate(fx32 x, fx32 y, fx32 z) {
    if (gRendererWork.translateOnly) {
        gRendererMtxStack[gRendererWork.stackLevel]._20 += x;
        gRendererMtxStack[gRendererWork.stackLevel]._21 += y;
        gRendererZStack[gRendererWork.stackLevel] += z;
    } else {
        MtxFx32 mtx;
        mtx._00 = FX32_ONE;
        mtx._01 = 0;
        mtx._10 = 0;
        mtx._11 = FX32_ONE;
        mtx._20 = x;
        mtx._21 = y;
        NNSi_G2dMtxConcat32(&mtx, &gRendererMtxStack[gRendererWork.stackLevel], &gRendererMtxStack[gRendererWork.stackLevel]);
        NNSi_G2dMtxConcat32(&mtx, &gRendererAffineMtxStack[gRendererWork.stackLevel], &gRendererAffineMtxStack[gRendererWork.stackLevel]);
        gRendererZStack[gRendererWork.stackLevel] += z;
    }
}
