#include <nitro.h>
#include <nnsys/g3d_render_internal.h>

#pragma force_active on

// runs SBC commands until RET
void G3dDrawInternal_Loop_(G3dRS *pRS) {
    do {
        u8 cmd;
        pRS->flag &= ~G3D_RS_FLAG_SKIP_CMD;
        cmd = *pRS->c;
        gSbcFuncs[cmd & 0x1F](pRS, cmd & 0xE0);
    } while (!(pRS->flag & G3D_RS_FLAG_END));
}

void G3dDrawInternal_(G3dRS *pRS, NNSG3dRenderObj *pRenderObj) {
    const u8 *pSbc;
    MIi_CpuClearFast(0, (u32 *)pRS, sizeof(G3dRS));
    pRS->scaleCached[0] = 1;
    pRS->flag = G3D_RS_FLAG_NODE_VISIBLE;
    pSbc = pRenderObj->ptrUserSbc;
    if (pSbc == NULL) {
        pSbc = (u8 *)pRenderObj->resMdl + pRenderObj->resMdl->ofsSbc;
    }
    // two volatile stores rather than one stm (needed for the match)
    *(const u8 *volatile *)&pRS->c = pSbc;
    *(NNSG3dRenderObj *volatile *)&pRS->pRenderObj = pRenderObj;
    pRS->pResNodeInfo = pRenderObj->resMdl ? &pRenderObj->resMdl->nodeInfo : NULL;
    pRS->pResMat = G3dGetResMat(pRenderObj->resMdl);
    pRS->pResShp = G3dGetResShp(pRenderObj->resMdl);
    pRS->funcJntScale = gGetJointScaleFuncs[pRenderObj->resMdl->info.scalingRule];
    pRS->funcJntMtx = gSendJointSRTFuncs[pRenderObj->resMdl->info.scalingRule];
    pRS->funcTexMtx = gSendTexSRTFuncs[pRenderObj->resMdl->info.texMtxMode];
    pRS->posScale = pRenderObj->resMdl->info.posScale;
    pRS->invPosScale = pRenderObj->resMdl->info.invPosScale;
    if (pRenderObj->cbFunc && pRenderObj->cbCmd < 32) {
        pRS->cbFunc[pRenderObj->cbCmd] = pRenderObj->cbFunc;
        pRS->cbTiming[pRenderObj->cbCmd] = pRenderObj->cbTiming;
    }
    if (pRenderObj->flag & 1) {
        pRS->flag |= G3D_RS_FLAG_NO_RECORD;
    }
    if (pRenderObj->flag & 2) {
        pRS->flag |= G3D_RS_FLAG_NO_GE_OUTPUT;
    }
    if (pRenderObj->flag & 4) {
        pRS->flag |= G3D_RS_FLAG_SKIP_SBC_DRAW;
    }
    if (pRenderObj->flag & 8) {
        pRS->flag |= G3D_RS_FLAG_SKIP_SBC_MTXCALC;
    }
    if (pRenderObj->cbInitFunc) {
        pRenderObj->cbInitFunc(pRS);
    }
    G3dDrawInternal_Loop_(pRS);
    pRenderObj->flag &= ~1;
}

void updateHintVec___g3d(u32 *pHintVec, const NNSG3dAnmObj *pAnmObj) {
    int i;
    if (!pAnmObj) {
        return;
    }
    do {
        for (i = 0; i < pAnmObj->numMapData; i++) {
            if (pAnmObj->mapData[i] & G3D_ANMOBJ_MAPDATA_EXISTS) {
                pHintVec[i >> 5] |= 1 << (i & 31);
            }
        }
        pAnmObj = pAnmObj->next;
    } while (pAnmObj);
}

// draws a model; nested calls (from SBC callbacks) reuse the render state of the outer call
void NNS_G3dDraw(NNSG3dRenderObj *pRenderObj) {
    G3dRS rs;
    if ((pRenderObj->flag & G3D_RENDEROBJ_FLAG_ANMOBJ_REMOVED) == G3D_RENDEROBJ_FLAG_ANMOBJ_REMOVED) {
        MIi_CpuClear32(0, pRenderObj->hintMatAnmExist, sizeof(pRenderObj->hintMatAnmExist));
        MIi_CpuClear32(0, pRenderObj->hintJntAnmExist, sizeof(pRenderObj->hintJntAnmExist));
        MIi_CpuClear32(0, pRenderObj->hintVisAnmExist, sizeof(pRenderObj->hintVisAnmExist));
        if (pRenderObj->anmMat) {
            updateHintVec___g3d(pRenderObj->hintMatAnmExist, pRenderObj->anmMat);
        }
        if (pRenderObj->anmJnt) {
            updateHintVec___g3d(pRenderObj->hintJntAnmExist, pRenderObj->anmJnt);
        }
        if (pRenderObj->anmVis) {
            updateHintVec___g3d(pRenderObj->hintVisAnmExist, pRenderObj->anmVis);
        }
        pRenderObj->flag &= ~G3D_RENDEROBJ_FLAG_ANMOBJ_REMOVED;
    }
    if (gCurrentRenderState) {
        G3dDrawInternal_(gCurrentRenderState, pRenderObj);
        return;
    }
    gCurrentRenderState = &rs;
    G3dDrawInternal_(&rs, pRenderObj);
    gCurrentRenderState = NULL;
}

#pragma force_active off
