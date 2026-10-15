#include <nitro.h>
#include <nnsys/g3d_render_internal.h>

#pragma force_active on

static inline u32 GetCallbackTiming(const G3dRS *pRS, int cmd) {
    return pRS->cbFunc[cmd] ? pRS->cbTiming[cmd] : G3D_SBC_CALLBACK_TIMING_NONE;
}

static inline void CallCallback(G3dRS *pRS, int cmd) {
    pRS->flag &= ~G3D_RS_FLAG_SKIP_CMD;
    pRS->cbFunc[cmd](pRS);
}

void NNSi_G3dFuncSbc_NOP(G3dRS *pRS, u32 opt) {
    if (pRS->cbFunc[NNS_G3D_SBC_NOP]) {
        pRS->cbFunc[NNS_G3D_SBC_NOP](pRS);
    }
    pRS->c++;
}

void NNSi_G3dFuncSbc_RET(G3dRS *pRS, u32 opt) {
    if (pRS->cbFunc[NNS_G3D_SBC_RET]) {
        pRS->cbFunc[NNS_G3D_SBC_RET](pRS);
    }
    pRS->flag |= G3D_RS_FLAG_END;
}

// NODE nodeID visible: sets the visibility of the following shapes from the visibility animations or
// the default in the command
void NNSi_G3dFuncSbc_NODE(G3dRS *pRS, u32 opt) {
    u32 nodeID;
    u32 timing;
    u32 skip;
    if (!(pRS->flag & G3D_RS_FLAG_SKIP_SBC_DRAW)) {
        nodeID = pRS->c[1];
        pRS->currentNode = nodeID;
        pRS->flag |= G3D_RS_FLAG_CURRENT_NODE;
        pRS->pVisAnmResult = &pRS->tmpVisAnmResult;
        timing = GetCallbackTiming(pRS, NNS_G3D_SBC_NODE);
        if (timing == G3D_SBC_CALLBACK_TIMING_A) {
            CallCallback(pRS, NNS_G3D_SBC_NODE);
            timing = GetCallbackTiming(pRS, NNS_G3D_SBC_NODE);
            skip = pRS->flag & G3D_RS_FLAG_SKIP_CMD;
        } else {
            skip = 0;
        }
        if (!skip) {
            NNSG3dRenderObj *pRenderObj = pRS->pRenderObj;
            if (!pRenderObj->anmVis || !(pRenderObj->hintVisAnmExist[nodeID >> 5] & (1 << (nodeID & 31))) || !pRenderObj->funcBlendVis((struct NNSG3dVisAnmResult_ *)pRS->pVisAnmResult, pRenderObj->anmVis, nodeID)) {
                *pRS->pVisAnmResult = pRS->c[2] & 1;
            }
        }
        if (timing == G3D_SBC_CALLBACK_TIMING_B) {
            CallCallback(pRS, NNS_G3D_SBC_NODE);
            timing = GetCallbackTiming(pRS, NNS_G3D_SBC_NODE);
            skip = pRS->flag & G3D_RS_FLAG_SKIP_CMD;
        } else {
            skip = 0;
        }
        if (!skip) {
            if (*pRS->pVisAnmResult) {
                pRS->flag |= G3D_RS_FLAG_NODE_VISIBLE;
            } else {
                pRS->flag &= ~G3D_RS_FLAG_NODE_VISIBLE;
            }
        }
        if (timing == G3D_SBC_CALLBACK_TIMING_C) {
            CallCallback(pRS, NNS_G3D_SBC_NODE);
        }
    }
    pRS->c += 3;
}

// MTX idx: restores a matrix from the matrix stack for the following shapes of a visible node
void NNSi_G3dFuncSbc_MTX(G3dRS *pRS, u32 opt) {
    if (!(pRS->flag & G3D_RS_FLAG_SKIP_SBC_DRAW) && (pRS->flag & G3D_RS_FLAG_NODE_VISIBLE)) {
        u32 timing = GetCallbackTiming(pRS, NNS_G3D_SBC_MTX);
        u32 skip;
        if (timing == G3D_SBC_CALLBACK_TIMING_A) {
            CallCallback(pRS, NNS_G3D_SBC_MTX);
            timing = GetCallbackTiming(pRS, NNS_G3D_SBC_MTX);
            skip = pRS->flag & G3D_RS_FLAG_SKIP_CMD;
        } else {
            skip = 0;
        }
        if (!skip) {
            u32 idx = pRS->c[1];
            if (!(pRS->flag & G3D_RS_FLAG_NO_GE_OUTPUT)) {
                NNS_G3dGeBufferOP_N(G3OP_MTX_RESTORE, &idx, G3OP_MTX_RESTORE_NPARAMS);
            }
        }
        if (timing == G3D_SBC_CALLBACK_TIMING_C) {
            CallCallback(pRS, NNS_G3D_SBC_MTX);
        }
    }
    pRS->c += 2;
}

// the material's own values, merged with the global state as its flags say, then the animations
static inline void CalcMatAnmResult(G3dRS *pRS, G3dMatAnmResult *pResult, const G3dResMatData *pMatData, u32 matID) {
    const u8 *pTexMtxData;
    pResult->flag = 0;
    if (G3dGetResMatDataByIdx(pRS->pResMat, matID)->flag & NNS_G3D_MATFLAG_WIREFRAME) {
        pResult->flag |= G3D_MATANM_FLAG_WIREFRAME;
    }
    {
        u32 mask = gMatColorMasks[(pMatData->flag >> 6) & 7];
        pResult->prmMatColor0 = (NNS_G3dGlb.prmMatColor0 & ~mask) | (pMatData->prmMatColor0 & mask);
        mask = gMatColorMasks[(pMatData->flag >> 9) & 7];
        pResult->prmMatColor1 = (NNS_G3dGlb.prmMatColor1 & ~mask) | (pMatData->prmMatColor1 & mask);
        pResult->prmPolygonAttr = (NNS_G3dGlb.prmPolygonAttr & ~pMatData->polygonAttrMask) | (pMatData->prmPolygonAttr & pMatData->polygonAttrMask);
    }
    pResult->prmTexImage = pMatData->texImageParam;
    pResult->prmTexPltt = pMatData->texPlttBase;
    if (pMatData->flag & NNS_G3D_MATFLAG_TEXMTX_USE) {
        pTexMtxData = pMatData->texMtxData;
        if (!(pMatData->flag & NNS_G3D_MATFLAG_TEXMTX_SCALEONE)) {
            pResult->scaleS = ((const fx32 *)pTexMtxData)[0];
            pResult->scaleT = ((const fx32 *)pTexMtxData)[1];
            pTexMtxData += 2 * sizeof(fx32);
        } else {
            pResult->flag |= G3D_MATANM_FLAG_TEXMTX_SCALEONE;
        }
        if (!(pMatData->flag & NNS_G3D_MATFLAG_TEXMTX_ROTZERO)) {
            pResult->sinR = ((const fx16 *)pTexMtxData)[0];
            pResult->cosR = ((const fx16 *)pTexMtxData)[1];
            pTexMtxData += 2 * sizeof(fx16);
        } else {
            pResult->flag |= G3D_MATANM_FLAG_TEXMTX_ROTZERO;
        }
        if (!(pMatData->flag & NNS_G3D_MATFLAG_TEXMTX_TRANSZERO)) {
            pResult->transS = ((const fx32 *)pTexMtxData)[0];
            pResult->transT = ((const fx32 *)pTexMtxData)[1];
        } else {
            pResult->flag |= G3D_MATANM_FLAG_TEXMTX_TRANSZERO;
        }
        pResult->flag |= G3D_MATANM_FLAG_TEXMTX_SET;
    }
    {
        NNSG3dRenderObj *pRenderObj = pRS->pRenderObj;
        if (pRenderObj->anmMat && (pRenderObj->hintMatAnmExist[matID >> 5] & (1u << (matID & 31)))) {
            pRenderObj->funcBlendMat(pResult, pRenderObj->anmMat, matID);
        }
    }
    if (pResult->flag & G3D_MATANM_FLAG_TEXMTX_MASK) {
        pResult->origWidth = pMatData->origWidth;
        pResult->origHeight = pMatData->origHeight;
        pResult->magW = pMatData->scaleS;
        pResult->magH = pMatData->scaleT;
    }
}

// MAT matID with the default material: the result comes from the render object's record, the material
// cache (opt 0x20 reads it, 0x40 fills it) or is calculated; then it is sent unless polygon alpha is 0
void NNSi_G3dFuncSbc_MAT_InternalDefault(G3dRS *pRS, u32 opt, const G3dResMatData *pMatData, u32 matID) {
    u32 cmd[7];
    G3dMatAnmResult *pRecord;
    G3dMatAnmResult *pResult;
    G3dMatAnmResult *pCurrent;
    u32 skip;
    pRS->currentMat = (u8)matID;
    pRS->flag |= G3D_RS_FLAG_CURRENT_MAT;
    pRS->pMatAnmResult = &pRS->tmpMatAnmResult;
    u32 timing;
    timing = GetCallbackTiming(pRS, NNS_G3D_SBC_MAT);
    if (timing == G3D_SBC_CALLBACK_TIMING_A) {
        CallCallback(pRS, NNS_G3D_SBC_MAT);
        timing = GetCallbackTiming(pRS, NNS_G3D_SBC_MAT);
        skip = pRS->flag & G3D_RS_FLAG_SKIP_CMD;
    } else {
        skip = 0;
    }
    if (skip == 0) {
        pRecord = pRS->pRenderObj->recMatAnm;
        if (pRecord && !(pRS->flag & G3D_RS_FLAG_NO_RECORD)) {
            pResult = &pRecord[matID];
        } else {
            if ((opt == 0x20 || opt == 0x40) && (pRS->matCached[matID >> 5] & (1u << (matID & 31)))) {
                if (pRecord) {
                    pResult = &pRecord[matID];
                } else {
                    pResult = &gMatAnmResultBuffer[matID];
                }
            } else {
                if (pRecord) {
                    u32 *pCached = pRS->matCached;
                    pCached[matID >> 5] |= 1u << (matID & 31);
                    pResult = &pRS->pRenderObj->recMatAnm[matID];
                } else {
                    if (opt == 0x40) {
                        pRS->matCached[matID >> 5] |= 1u << (matID & 31);
                        pResult = &gMatAnmResultBuffer[matID];
                    } else {
                        pResult = &pRS->tmpMatAnmResult;
                    }
                }
                CalcMatAnmResult(pRS, pResult, pMatData, matID);
            }
        }
        pRS->pMatAnmResult = pResult;
    }
    if (timing == G3D_SBC_CALLBACK_TIMING_B) {
        CallCallback(pRS, NNS_G3D_SBC_MAT);
        timing = GetCallbackTiming(pRS, NNS_G3D_SBC_MAT);
        skip = pRS->flag & G3D_RS_FLAG_SKIP_CMD;
    } else {
        skip = 0;
    }
    if (!skip) {
        pCurrent = pRS->pMatAnmResult;
        if (pCurrent->prmPolygonAttr & REG_G3_POLYGON_ATTR_ALPHA_MASK) {
            if (pCurrent->flag & G3D_MATANM_FLAG_WIREFRAME) {
                pCurrent->prmPolygonAttr &= ~REG_G3_POLYGON_ATTR_ALPHA_MASK;
            }
            pRS->flag &= ~G3D_RS_FLAG_MAT_HIDDEN;
            if (!(pRS->flag & G3D_RS_FLAG_NO_GE_OUTPUT)) {
                cmd[0] = 0x293130; // DIF_AMB, SPE_EMI, POLYGON_ATTR
                cmd[1] = pCurrent->prmMatColor0;
                cmd[2] = pCurrent->prmMatColor1;
                cmd[3] = pCurrent->prmPolygonAttr;
                cmd[4] = 0x2B2A; // TEXIMAGE_PARAM, PLTT_BASE
                cmd[5] = pCurrent->prmTexImage;
                cmd[6] = pCurrent->prmTexPltt;
                NNS_G3dGeBufferOP_N(cmd[0], cmd + 1, 6);
                if (pCurrent->flag & G3D_MATANM_FLAG_TEXMTX_MASK) {
                    pRS->funcTexMtx(pCurrent);
                }
            }
        } else {
            pRS->flag |= G3D_RS_FLAG_MAT_HIDDEN;
        }
    }
    if (timing == G3D_SBC_CALLBACK_TIMING_C) {
        CallCallback(pRS, NNS_G3D_SBC_MAT);
    }
}

#pragma force_active off

// MAT matID: (re)selects the material unless it is current already
void NNSi_G3dFuncSbc_MAT(G3dRS *pRS, u32 opt) {
    u32 flag = pRS->flag;
    if (!(flag & G3D_RS_FLAG_SKIP_SBC_DRAW)) {
        const u8 *pCmd = pRS->c;
        u8 matID = pCmd[1];
        if ((flag & G3D_RS_FLAG_NODE_VISIBLE) || !(flag & G3D_RS_FLAG_CURRENT_MAT) || matID != pRS->currentMat) {
            G3dResMatData *pMatData = G3dGetResMatDataByIdx(pRS->pResMat, matID);
            gSbcMatFuncs[pMatData->itemTag](pRS, opt, pMatData, matID);
        }
    }
    pRS->c += 2;
}

// the callback is called with itself as a second argument (needed for the match)
static inline void CallShpCallback(G3dRS *pRS) {
    NNSG3dSbcCallBackFunc cb;
    pRS->flag &= ~G3D_RS_FLAG_SKIP_CMD;
    cb = pRS->cbFunc[NNS_G3D_SBC_SHP];
    ((void (*)(G3dRS *, NNSG3dSbcCallBackFunc))cb)(pRS, cb);
}

void NNSi_G3dFuncSbc_SHP_InternalDefault(G3dRS *pRS, u32 opt, const G3dResShpData *pShpData) {
    u32 timing;
    u32 skip;
    timing = GetCallbackTiming(pRS, NNS_G3D_SBC_SHP);
    if (timing == G3D_SBC_CALLBACK_TIMING_A) {
        CallShpCallback(pRS);
        timing = GetCallbackTiming(pRS, NNS_G3D_SBC_SHP);
        skip = pRS->flag & G3D_RS_FLAG_SKIP_CMD;
    } else {
        skip = 0;
    }
    if (!skip && !(pRS->flag & G3D_RS_FLAG_NO_GE_OUTPUT)) {
        NNS_G3dGeSendDL((u8 *)pShpData + pShpData->ofsDL, pShpData->sizeDL);
    }
    if (timing == G3D_SBC_CALLBACK_TIMING_B) {
        CallShpCallback(pRS);
        timing = GetCallbackTiming(pRS, NNS_G3D_SBC_SHP);
    }
    if (timing == G3D_SBC_CALLBACK_TIMING_C) {
        CallShpCallback(pRS);
    }
}

// SHP shpID: draws a shape of a visible node with a visible material
void NNSi_G3dFuncSbc_SHP(G3dRS *pRS, u32 opt) {
    u32 flag = pRS->flag;
    if (!(flag & G3D_RS_FLAG_SKIP_SBC_DRAW) && (flag & G3D_RS_FLAG_NODE_VISIBLE) && !(flag & G3D_RS_FLAG_MAT_HIDDEN)) {
        void *pResShp;
        const u8 *pCmd = pRS->c;
        u8 shpID = pCmd[1];
        pResShp = pRS->pResShp;
        G3dResShpData *pShpData = G3dGetResShpDataByIdx(pResShp, shpID);
        gSbcShpFuncs[pShpData->itemTag](pRS, opt, pShpData, shpID);
    }
    pRS->c += 2;
}

#pragma force_active on

static inline G3dResNodeData *GetResNodeDataByIdx(NNSG3dResNodeInfo *pResNodeInfo, u8 idx) {
    if (pResNodeInfo) {
        const NNSG3dResDictMdlSetData *pData = NNS_G3dGetResDataByIdx(&pResNodeInfo->dict, idx);
        if (pData) {
            return (G3dResNodeData *)((u8 *)pResNodeInfo + pData->offset);
        }
    }
    return NULL;
}

// NODEDESC nodeID parentID flags [dst] [src]: calculates the joint matrix of a node (record, joint
// animation or the node's own SRT data) and multiplies it to the current matrix; opt 0x40 restores
// the parent's matrix from the stack first, opt 0x20 stores the result
void NNSi_G3dFuncSbc_NODEDESC(G3dRS *pRS, u32 opt) {
    struct {
        u32 store;
        u32 restore;
        u32 skipRestore;
    } param;

    int pivotB;
    int pivotA;
    u8 nodeID = pRS->c[1];
    u32 cmdLen = 4;
    int timing;
    int skip;
    G3dJntAnmResult *pResult;
    G3dResNodeData *pNodeData;
    u8 *pData;
    int pivot;
    pRS->currentNodeDesc = nodeID;
    {
        u32 flag = pRS->flag | G3D_RS_FLAG_CURRENT_NODEDESC;
        pRS->flag = flag;
        if (flag & G3D_RS_FLAG_SKIP_SBC_MTXCALC) {
            if (opt == 0x40 || opt == 0x60) {
                cmdLen++;
            }
            if (opt == 0x20 || opt == 0x60) {
                cmdLen++;
                if (!(flag & G3D_RS_FLAG_NO_GE_OUTPUT)) {
                    // without the calculation the stored matrix is restored instead
                    param.skipRestore = pRS->c[4];
                    NNS_G3dGeBufferOP_N(G3OP_MTX_RESTORE, &param.skipRestore, G3OP_MTX_RESTORE_NPARAMS);
                }
            }
            pRS->c += cmdLen;
            return;
        }
    }
    if (opt == 0x40 || opt == 0x60) {
        if (opt == 0x40) {
            param.restore = pRS->c[4];
        } else {
            param.restore = pRS->c[5];
        }
        cmdLen++;
        if (!(pRS->flag & G3D_RS_FLAG_NO_GE_OUTPUT)) {
            NNS_G3dGeBufferOP_N(G3OP_MTX_RESTORE, &param.restore, G3OP_MTX_RESTORE_NPARAMS);
        }
    }
    pRS->pJntAnmResult = &pRS->tmpJntAnmResult;
    timing = GetCallbackTiming(pRS, NNS_G3D_SBC_NODEDESC);
    if (timing == G3D_SBC_CALLBACK_TIMING_A) {
        CallCallback(pRS, NNS_G3D_SBC_NODEDESC);
        timing = GetCallbackTiming(pRS, NNS_G3D_SBC_NODEDESC);
        skip = pRS->flag & G3D_RS_FLAG_SKIP_CMD;
    } else {
        skip = 0;
    }
    if (!skip) {
        if (pRS->pRenderObj->recJntAnm) {
            pResult = &pRS->pRenderObj->recJntAnm[nodeID];
            skip = (pRS->flag & G3D_RS_FLAG_NO_RECORD) ? 0 : 1;
        } else {
            pResult = &pRS->tmpJntAnmResult;
            skip = 0;
        }
        if (!skip) {
            pResult->flag = 0;
            if (pRS->pRenderObj->anmJnt) {
                skip = pRS->pRenderObj->funcBlendJnt(pResult, pRS->pRenderObj->anmJnt, nodeID);
                if (skip) {
                    goto done;
                }
            }
            pNodeData = GetResNodeDataByIdx(pRS->pResNodeInfo, nodeID);
            pData = pNodeData->data;
            if (pNodeData->flag & G3D_RESNODE_FLAG_TRANS_ZERO) {
                pResult->flag |= G3D_JNTANM_FLAG_TRANS_ZERO;
            } else {
                pResult->trans.x = ((s32 *)pData)[0];
                pResult->trans.y = ((s32 *)pData)[1];
                pResult->trans.z = ((s32 *)pData)[2];
                pData += 3 * sizeof(s32);
            }
            if (pNodeData->flag & G3D_RESNODE_FLAG_ROT_ZERO) {
                pResult->flag |= G3D_JNTANM_FLAG_ROT_ZERO;
            } else if (pNodeData->flag & G3D_RESNODE_FLAG_PIVOT_EXIST) {
                // compressed rotation: +-1 at the pivot, A and B (signs from the flags) at the
                // four elements outside the pivot's row and column, 0 elsewhere
                pivot = (pNodeData->flag & G3D_RESNODE_FLAG_PIVOT_MASK) >> G3D_RESNODE_FLAG_PIVOT_SHIFT;
                pivotA = ((s16 *)pData)[0];
                pivotB = ((s16 *)pData)[1];
                MI_Zero36B(&pResult->rot);
                pResult->rot.a[pivot] = (pNodeData->flag & G3D_RESNODE_FLAG_PIVOT_MINUS) ? -FX32_ONE : FX32_ONE;
                pResult->rot.a[gPivotMtxIndices[pivot][0]] = pivotA;
                pResult->rot.a[gPivotMtxIndices[pivot][1]] = pivotB;
                pivotB = (pNodeData->flag & G3D_RESNODE_FLAG_SIGN_REVC) ? -pivotB : pivotB;
                pResult->rot.a[gPivotMtxIndices[pivot][2]] = pivotB;
                pivotA = (pNodeData->flag & G3D_RESNODE_FLAG_SIGN_REVD) ? -pivotA : pivotA;
                pResult->rot.a[gPivotMtxIndices[pivot][3]] = pivotA;
                pData += 2 * sizeof(s16);
            } else {
                pResult->rot.a[0] = pNodeData->rot00;
                pResult->rot.a[1] = ((s16 *)pData)[0];
                pResult->rot.a[2] = ((s16 *)pData)[1];
                pResult->rot.a[3] = ((s16 *)pData)[2];
                pResult->rot.a[4] = ((s16 *)pData)[3];
                pResult->rot.a[5] = ((s16 *)pData)[4];
                pResult->rot.a[6] = ((s16 *)pData)[5];
                pResult->rot.a[7] = ((s16 *)pData)[6];
                pResult->rot.a[8] = ((s16 *)pData)[7];
                pData += 8 * sizeof(s16);
            }
            pRS->funcJntScale(pResult, (const fx32 *)pData, pRS->c, pNodeData->flag);
        }
done:
        pRS->pJntAnmResult = pResult;
    }
    if (timing == G3D_SBC_CALLBACK_TIMING_B) {
        CallCallback(pRS, NNS_G3D_SBC_NODEDESC);
        timing = GetCallbackTiming(pRS, NNS_G3D_SBC_NODEDESC);
        skip = pRS->flag & G3D_RS_FLAG_SKIP_CMD;
    } else {
        skip = 0;
    }
    if (!skip && !(pRS->flag & G3D_RS_FLAG_NO_GE_OUTPUT)) {
        pRS->funcJntMtx(pRS->pJntAnmResult);
    }
    pRS->pJntAnmResult = NULL;
    if (timing == G3D_SBC_CALLBACK_TIMING_C) {
        CallCallback(pRS, NNS_G3D_SBC_NODEDESC);
        skip = pRS->flag & G3D_RS_FLAG_SKIP_CMD;
    } else {
        skip = 0;
    }
    if (opt == 0x20 || opt == 0x60) {
        cmdLen++;
        if (!skip && !(pRS->flag & G3D_RS_FLAG_NO_GE_OUTPUT)) {
            param.store = pRS->c[4];
            NNS_G3dGeBufferOP_N(G3OP_MTX_STORE, &param.store, G3OP_MTX_STORE_NPARAMS);
        }
    }
    pRS->c += cmdLen;
}

// reads the current position matrix through the clip matrix with an identity projection
static inline void GetCurrentPosMtx(MtxFx44 *pClip) {
    NNS_G3dGeFlushBuffer();
    reg_G3X_GXFIFO = (G3OP_MTX_IDENTITY << 16) | (G3OP_MTX_PUSH << 8) | G3OP_MTX_MODE;
    reg_G3X_GXFIFO = GX_MTXMODE_PROJECTION;
    reg_G3X_GXFIFO = 0;
    while (G3X_GetClipMtx(pClip) != 0) {
    }
}

// BB nodeID [dst] [src]: replaces the current matrix by a billboard matrix (the camera-facing
// rotation with the current matrix's translation and scale)
void NNSi_G3dFuncSbc_BB(G3dRS *pRS, u32 opt) {
    struct {
        u32 store;
        u32 restore;
        MtxFx44 camera;
        MtxFx44 wv;
        MtxFx44 clip;
    } l;

    u32 cmdLen = 2;
    int timing;
    int skip;
    VecFx32 *pTrans = &gBillboardTrans;
    VecFx32 *pScale = &gBillboardScale;
    if (pRS->flag & G3D_RS_FLAG_SKIP_SBC_DRAW) {
        if (opt == 0x40 || opt == 0x60) {
            cmdLen++;
        }
        if (opt == 0x20 || opt == 0x60) {
            cmdLen++;
        }
        pRS->c += cmdLen;
        return;
    }
    if (opt == 0x40 || opt == 0x60) {
        cmdLen++;
        if (!(pRS->flag & G3D_RS_FLAG_NO_GE_OUTPUT)) {
            if (opt == 0x40) {
                l.restore = pRS->c[2];
            } else {
                l.restore = pRS->c[3];
            }
            NNS_G3dGeBufferOP_N(G3OP_MTX_RESTORE, &l.restore, G3OP_MTX_RESTORE_NPARAMS);
        }
    }
    timing = GetCallbackTiming(pRS, NNS_G3D_SBC_BB);
    if (timing == G3D_SBC_CALLBACK_TIMING_A) {
        CallCallback(pRS, NNS_G3D_SBC_BB);
        timing = GetCallbackTiming(pRS, NNS_G3D_SBC_BB);
        skip = pRS->flag & G3D_RS_FLAG_SKIP_CMD;
    } else {
        skip = 0;
    }
    if (!(pRS->flag & G3D_RS_FLAG_NO_GE_OUTPUT) && !skip) {
        GetCurrentPosMtx(&l.clip);
        if (NNS_G3dGlb.flag & NNS_G3D_GLB_FLAG_FLUSH_WVP) {
            MTX_Copy43To44_(NNS_G3dGlbGetWV(), &l.wv);
            MTX_Concat44(&l.clip, &l.wv, &l.clip);
        } else if (NNS_G3dGlb.flag & NNS_G3D_GLB_FLAG_FLUSH_VP) {
            MTX_Copy43To44_(&NNS_G3dGlb.cameraMtx, &l.camera);
            MTX_Concat44(&l.clip, &l.camera, &l.clip);
        }
        pTrans->x = l.clip._30;
        pTrans->y = l.clip._31;
        pTrans->z = l.clip._32;
        pScale->x = VEC_Mag((VecFx32 *)&l.clip._00);
        pScale->y = VEC_Mag((VecFx32 *)&l.clip._10);
        pScale->z = VEC_Mag((VecFx32 *)&l.clip._20);
        if (NNS_G3dGlb.flag & NNS_G3D_GLB_FLAG_FLUSH_WVP) {
            reg_G3X_GXFIFO = (G3OP_MTX_LOAD_4x3 << 16) | (G3OP_MTX_MODE << 8) | G3OP_MTX_POP;
            MIi_CpuSend32(gBillboardCmdParams, &reg_G3X_GXFIFO, 2 * sizeof(u32));
            MIi_CpuSend32(NNS_G3dGlbGetInvWV(), &reg_G3X_GXFIFO, sizeof(MtxFx43));
            reg_G3X_GXFIFO = (G3OP_MTX_SCALE << 8) | G3OP_MTX_MULT_4x3;
            MIi_CpuSend32(&gBillboardMtx, &reg_G3X_GXFIFO, sizeof(MtxFx43) + sizeof(VecFx32));
        } else if (NNS_G3dGlb.flag & NNS_G3D_GLB_FLAG_FLUSH_VP) {
            reg_G3X_GXFIFO = (G3OP_MTX_LOAD_4x3 << 16) | (G3OP_MTX_MODE << 8) | G3OP_MTX_POP;
            MIi_CpuSend32(gBillboardCmdParams, &reg_G3X_GXFIFO, 2 * sizeof(u32));
            MIi_CpuSend32(NNS_G3dGlbGetInvV(), &reg_G3X_GXFIFO, sizeof(MtxFx43));
            reg_G3X_GXFIFO = (G3OP_MTX_SCALE << 8) | G3OP_MTX_MULT_4x3;
            MIi_CpuSend32(&gBillboardMtx, &reg_G3X_GXFIFO, sizeof(MtxFx43) + sizeof(VecFx32));
        } else {
            MIi_CpuSend32(gBillboardCmd, &reg_G3X_GXFIFO, sizeof(gBillboardCmd));
        }
    }
    if (timing == G3D_SBC_CALLBACK_TIMING_C) {
        CallCallback(pRS, NNS_G3D_SBC_BB);
        skip = pRS->flag & G3D_RS_FLAG_SKIP_CMD;
    } else {
        skip = 0;
    }
    if (opt == 0x20 || opt == 0x60) {
        cmdLen++;
        if (!skip && !(pRS->flag & G3D_RS_FLAG_NO_GE_OUTPUT)) {
            l.store = pRS->c[2];
            NNS_G3dGeBufferOP_N(G3OP_MTX_STORE, &l.store, G3OP_MTX_STORE_NPARAMS);
        }
    }
    pRS->c += cmdLen;
}

// BBY nodeID [dst] [src]: like BB, but the billboard only turns around the Y axis
void NNSi_G3dFuncSbc_BBY(G3dRS *pRS, u32 opt) {
    struct {
        u32 store;
        u32 restore;
        MtxFx44 camera;
        MtxFx44 wv;
        MtxFx44 clip;
    } l;

    u32 cmdLen = 2;
    int timing;
    int skip;
    VecFx32 *pTrans = &gBillboardYTrans;
    VecFx32 *pScale = &gBillboardYScale;
    VecFx32 *pRows = (VecFx32 *)&gBillboardYMtx;
    if (pRS->flag & G3D_RS_FLAG_SKIP_SBC_DRAW) {
        if (opt == 0x40 || opt == 0x60) {
            cmdLen++;
        }
        if (opt == 0x20 || opt == 0x60) {
            cmdLen++;
        }
        pRS->c += cmdLen;
        return;
    }
    if (opt == 0x40 || opt == 0x60) {
        cmdLen++;
        if (!(pRS->flag & G3D_RS_FLAG_NO_GE_OUTPUT)) {
            if (opt == 0x40) {
                l.restore = pRS->c[2];
            } else {
                l.restore = pRS->c[3];
            }
            NNS_G3dGeBufferOP_N(G3OP_MTX_RESTORE, &l.restore, G3OP_MTX_RESTORE_NPARAMS);
        }
    }
    timing = GetCallbackTiming(pRS, NNS_G3D_SBC_BBY);
    if (timing == G3D_SBC_CALLBACK_TIMING_A) {
        CallCallback(pRS, NNS_G3D_SBC_BBY);
        timing = GetCallbackTiming(pRS, NNS_G3D_SBC_BBY);
        skip = pRS->flag & G3D_RS_FLAG_SKIP_CMD;
    } else {
        skip = 0;
    }
    if (!(pRS->flag & G3D_RS_FLAG_NO_GE_OUTPUT) && !skip) {
        GetCurrentPosMtx(&l.clip);
        if (NNS_G3dGlb.flag & NNS_G3D_GLB_FLAG_FLUSH_WVP) {
            MTX_Copy43To44_(NNS_G3dGlbGetWV(), &l.wv);
            MTX_Concat44(&l.clip, &l.wv, &l.clip);
        } else if (NNS_G3dGlb.flag & NNS_G3D_GLB_FLAG_FLUSH_VP) {
            MTX_Copy43To44_(&NNS_G3dGlb.cameraMtx, &l.camera);
            MTX_Concat44(&l.clip, &l.camera, &l.clip);
        }
        pTrans->x = l.clip._30;
        pTrans->y = l.clip._31;
        pTrans->z = l.clip._32;
        pScale->x = VEC_Mag((VecFx32 *)&l.clip._00);
        pScale->y = VEC_Mag((VecFx32 *)&l.clip._10);
        pScale->z = VEC_Mag((VecFx32 *)&l.clip._20);
        // rows 1 and 2 of the rotation: the normalised Y axis and its perpendicular in the YZ plane
        if (l.clip._11 || l.clip._12) {
            VEC_Normalize((VecFx32 *)&l.clip._10, &pRows[1]);
            pRows[2].y = -pRows[1].z;
            pRows[2].z = pRows[1].y;
        } else {
            VEC_Normalize((VecFx32 *)&l.clip._20, &pRows[2]);
            pRows[1].z = -pRows[2].y;
            pRows[1].y = pRows[2].z;
        }
        if (NNS_G3dGlb.flag & NNS_G3D_GLB_FLAG_FLUSH_WVP) {
            reg_G3X_GXFIFO = (G3OP_MTX_LOAD_4x3 << 16) | (G3OP_MTX_MODE << 8) | G3OP_MTX_POP;
            MIi_CpuSend32(gBillboardYCmdParams, &reg_G3X_GXFIFO, 2 * sizeof(u32));
            MIi_CpuSend32(NNS_G3dGlbGetInvWV(), &reg_G3X_GXFIFO, sizeof(MtxFx43));
            reg_G3X_GXFIFO = (G3OP_MTX_SCALE << 8) | G3OP_MTX_MULT_4x3;
            MIi_CpuSend32(&gBillboardYMtx, &reg_G3X_GXFIFO, sizeof(MtxFx43) + sizeof(VecFx32));
        } else if (NNS_G3dGlb.flag & NNS_G3D_GLB_FLAG_FLUSH_VP) {
            reg_G3X_GXFIFO = (G3OP_MTX_LOAD_4x3 << 16) | (G3OP_MTX_MODE << 8) | G3OP_MTX_POP;
            MIi_CpuSend32(gBillboardYCmdParams, &reg_G3X_GXFIFO, 2 * sizeof(u32));
            MIi_CpuSend32(NNS_G3dGlbGetInvV(), &reg_G3X_GXFIFO, sizeof(MtxFx43));
            reg_G3X_GXFIFO = (G3OP_MTX_SCALE << 8) | G3OP_MTX_MULT_4x3;
            MIi_CpuSend32(&gBillboardYMtx, &reg_G3X_GXFIFO, sizeof(MtxFx43) + sizeof(VecFx32));
        } else {
            MIi_CpuSend32(gBillboardYCmd, &reg_G3X_GXFIFO, sizeof(gBillboardYCmd));
        }
    }
    if (timing == G3D_SBC_CALLBACK_TIMING_C) {
        CallCallback(pRS, NNS_G3D_SBC_BBY);
        skip = pRS->flag & G3D_RS_FLAG_SKIP_CMD;
    } else {
        skip = 0;
    }
    if (opt == 0x20 || opt == 0x60) {
        cmdLen++;
        if (!skip && !(pRS->flag & G3D_RS_FLAG_NO_GE_OUTPUT)) {
            l.store = pRS->c[2];
            NNS_G3dGeBufferOP_N(G3OP_MTX_STORE, &l.store, G3OP_MTX_STORE_NPARAMS);
        }
    }
    pRS->c += cmdLen;
}

static inline u32 BitVecCheck(const u32 *pVec, u32 idx) {
    return pVec[idx >> 5] & (1 << (idx & 31));
}

static inline void BitVecSet(u32 *pVec, u32 idx) {
    pVec[idx >> 5] |= 1 << (idx & 31);
}

static inline G3dResEvpMtx *GetResEvpMtx(const NNSG3dResMdl *pResMdl) {
    return (G3dResEvpMtx *)((u8 *)pResMdl + pResMdl->ofsEvpMtx);
}

// NODEMIX dst numMtx {src nodeID ratio}...: stores the weighted sum of envelope matrices (matrix
// stack entry src times the node's inverse bind pose) in matrix stack entry dst
void NNSi_G3dFuncSbc_NODEMIX(G3dRS *pRS, u32 opt) {
    G3dResEvpMtx *pEvpMtx;
    s64 prevRatio;
    u32 numMtx;
    const u8 *pEntry;
    G3dEvpMtxCache *pCache;

    struct {
        MtxFx43 pos;
        MtxFx33 dir;
    } sum;

    MtxFx33 *pPrevDir;
    u32 i;
    {
        const NNSG3dResMdl *pResMdl = pRS->pRenderObj->resMdl;
        pEntry = pRS->c;
        numMtx = pEntry[2];
        pEvpMtx = GetResEvpMtx(pResMdl);
    }
    prevRatio = 0;
    pEntry += 3;
    MIi_CpuClearFast(0, (u32 *)&sum, sizeof(sum));
    NNS_G3dGeFlushBuffer();
    // keep the projection matrix in its stack and calculate with an identity projection
    reg_G3_MTX_MODE = GX_MTXMODE_PROJECTION;
    reg_G3_MTX_STORE = 1;
    reg_G3_MTX_IDENTITY = 0;
    reg_G3_MTX_MODE = GX_MTXMODE_POSITION_VECTOR;
    for (i = 0; i < numMtx; i++) {
        u32 nodeID;
        u32 cached;
        u32 offset;
        nodeID = pEntry[1];
        cached = BitVecCheck(pRS->evpCached, nodeID);
        pCache = (G3dEvpMtxCache *)((u8 *)gEvpMtxCache + nodeID * sizeof(G3dEvpMtxCache));
        offset = nodeID * sizeof(G3dEvpMtxCache);
        if (!cached) {
            BitVecSet(pRS->evpCached, nodeID);
            reg_G3_MTX_RESTORE = pEntry[0];
            reg_G3_MTX_MODE = GX_MTXMODE_POSITION;
            G3_MultMtx43(&pEvpMtx[nodeID].invM);
        }
        // the previous direction matrix is added here, while the geometry engine calculates
        if (i) {
            sum.dir._00 += (prevRatio * pPrevDir->_00) >> FX32_SHIFT;
            sum.dir._01 += (prevRatio * pPrevDir->_01) >> FX32_SHIFT;
            sum.dir._02 += (prevRatio * pPrevDir->_02) >> FX32_SHIFT;
            sum.dir._10 += (prevRatio * pPrevDir->_10) >> FX32_SHIFT;
            sum.dir._11 += (prevRatio * pPrevDir->_11) >> FX32_SHIFT;
            sum.dir._12 += (prevRatio * pPrevDir->_12) >> FX32_SHIFT;
            sum.dir._20 += (prevRatio * pPrevDir->_20) >> FX32_SHIFT;
            sum.dir._21 += (prevRatio * pPrevDir->_21) >> FX32_SHIFT;
            sum.dir._22 += (prevRatio * pPrevDir->_22) >> FX32_SHIFT;
        }
        if (!cached) {
            while (G3X_GetClipMtx(&pCache->posMtx)) {
            }
            reg_G3_MTX_MODE = GX_MTXMODE_POSITION_VECTOR;
            G3_MultMtx33(&pEvpMtx[nodeID].invN);
        }
        {
            fx32 ratio = pEntry[2] << 4;
            prevRatio = ratio;
            sum.pos._00 += ((s64)ratio * pCache->posMtx._00) >> FX32_SHIFT;
            sum.pos._01 += ((s64)ratio * pCache->posMtx._01) >> FX32_SHIFT;
            sum.pos._02 += ((s64)ratio * pCache->posMtx._02) >> FX32_SHIFT;
            sum.pos._10 += ((s64)ratio * pCache->posMtx._10) >> FX32_SHIFT;
            sum.pos._11 += ((s64)ratio * pCache->posMtx._11) >> FX32_SHIFT;
            sum.pos._12 += ((s64)ratio * pCache->posMtx._12) >> FX32_SHIFT;
            sum.pos._20 += ((s64)ratio * pCache->posMtx._20) >> FX32_SHIFT;
            sum.pos._21 += ((s64)ratio * pCache->posMtx._21) >> FX32_SHIFT;
            sum.pos._22 += ((s64)ratio * pCache->posMtx._22) >> FX32_SHIFT;
            sum.pos._30 += ((s64)ratio * pCache->posMtx._30) >> FX32_SHIFT;
            sum.pos._31 += ((s64)ratio * pCache->posMtx._31) >> FX32_SHIFT;
            sum.pos._32 += ((s64)ratio * pCache->posMtx._32) >> FX32_SHIFT;
        }
        pEntry += 3;
        pPrevDir = (MtxFx33 *)((u8 *)&gEvpMtxCacheFirstDirMtx + offset);
        if (!cached) {
            while (G3X_GetVectorMtx(pPrevDir)) {
            }
        }
    }
    sum.dir._00 += (prevRatio * pPrevDir->_00) >> FX32_SHIFT;
    sum.dir._01 += (prevRatio * pPrevDir->_01) >> FX32_SHIFT;
    sum.dir._02 += (prevRatio * pPrevDir->_02) >> FX32_SHIFT;
    sum.dir._10 += (prevRatio * pPrevDir->_10) >> FX32_SHIFT;
    sum.dir._11 += (prevRatio * pPrevDir->_11) >> FX32_SHIFT;
    sum.dir._12 += (prevRatio * pPrevDir->_12) >> FX32_SHIFT;
    sum.dir._20 += (prevRatio * pPrevDir->_20) >> FX32_SHIFT;
    sum.dir._21 += (prevRatio * pPrevDir->_21) >> FX32_SHIFT;
    sum.dir._22 += (prevRatio * pPrevDir->_22) >> FX32_SHIFT;
    // the direction matrix goes in as a 4x3 matrix (its translation row does not matter)
    G3_LoadMtx43((MtxFx43 *)&sum.dir);
    reg_G3_MTX_MODE = GX_MTXMODE_POSITION;
    G3_LoadMtx43(&sum.pos);
    reg_G3_MTX_MODE = GX_MTXMODE_PROJECTION;
    reg_G3_MTX_RESTORE = 1;
    reg_G3_MTX_MODE = GX_MTXMODE_POSITION_VECTOR;
    reg_G3_MTX_STORE = pRS->c[1];
    pRS->c += 3 * (pRS->c[2] + 1);
}

// CALLDL offset size: sends a display list in the SBC (u32 values, unaligned)
void NNSi_G3dFuncSbc_CALLDL(G3dRS *pRS, u32 opt) {
    int timing = GetCallbackTiming(pRS, NNS_G3D_SBC_CALLDL);
    u32 skip;
    if (timing == G3D_SBC_CALLBACK_TIMING_A) {
        CallCallback(pRS, NNS_G3D_SBC_CALLDL);
        timing = GetCallbackTiming(pRS, NNS_G3D_SBC_CALLDL);
        skip = pRS->flag & G3D_RS_FLAG_SKIP_CMD;
    } else {
        skip = 0;
    }
    if (!(pRS->flag & G3D_RS_FLAG_NO_GE_OUTPUT) && !skip) {
        const u8 *pCmd = pRS->c;
        u32 offset = pCmd[1] | pCmd[2] << 8 | pCmd[3] << 16 | pCmd[4] << 24;
        u32 size = pCmd[5] | pCmd[6] << 8 | pCmd[7] << 16 | pCmd[8] << 24;
        NNS_G3dGeSendDL(pCmd + offset, size);
    }
    if (timing == G3D_SBC_CALLBACK_TIMING_C) {
        CallCallback(pRS, NNS_G3D_SBC_CALLDL);
    }
    pRS->c += 9;
}

// POSSCALE: scales by the model's position scale (opt 0) or its inverse
void NNSi_G3dFuncSbc_POSSCALE(G3dRS *pRS, u32 opt) {
    if (!(pRS->flag & G3D_RS_FLAG_NO_GE_OUTPUT) && !(pRS->flag & G3D_RS_FLAG_SKIP_SBC_DRAW)) {
        u32 scale[3];
        if (opt == 0) {
            scale[0] = scale[1] = scale[2] = pRS->posScale;
        } else {
            scale[0] = scale[1] = scale[2] = pRS->invPosScale;
        }
        NNS_G3dGeBufferOP_N(G3OP_MTX_SCALE, scale, G3OP_MTX_SCALE_NPARAMS);
    }
    pRS->c++;
}

// the effect matrix of a material follows its texture matrix parts
static inline const u32 *GetResMatEffectMtx(G3dResMatData *pMatData) {
    u8 *p = pMatData->texMtxData;
    u16 flag = pMatData->flag;
    if (!(flag & NNS_G3D_MATFLAG_TEXMTX_SCALEONE)) {
        p += 2 * sizeof(fx32);
    }
    if (!(flag & NNS_G3D_MATFLAG_TEXMTX_ROTZERO)) {
        p += 2 * sizeof(fx16);
    }
    if (!(flag & NNS_G3D_MATFLAG_TEXMTX_TRANSZERO)) {
        p += 2 * sizeof(fx32);
    }
    return (const u32 *)p;
}

#define TEXIMAGE_TGEN(texGen) ((u32)(texGen) << REG_G3_TEXIMAGE_PARAM_TGEN_SHIFT)

// ENVMAP matID flags: sets up environment mapping for the current material (texture coordinates
// from the normals; texture matrix from the camera and the current direction matrix)
void NNSi_G3dFuncSbc_ENVMAP(G3dRS *pRS, u32 opt) {
    MtxFx33 dir;
    u32 scale[3];
    u32 modeTexture;
    u32 texCoord;
    u32 modeDir;
    u32 modeTexture2;
    u32 modeEnd;
    u32 flag;
    u32 timing;
    u32 skip;
    G3dResMatData *pMatData;
    u16 width;
    u16 height;
    flag = pRS->flag;
    if (flag & G3D_RS_FLAG_SKIP_SBC_DRAW) {
        goto end;
    }
    if (!(flag & G3D_RS_FLAG_NODE_VISIBLE)) {
        goto end;
    }
    if ((pRS->pMatAnmResult->prmTexImage & REG_G3_TEXIMAGE_PARAM_TGEN_MASK) != TEXIMAGE_TGEN(GX_TEXGEN_NORMAL)) {
        pRS->pMatAnmResult->prmTexImage &= ~REG_G3_TEXIMAGE_PARAM_TGEN_MASK;
        pRS->pMatAnmResult->prmTexImage |= TEXIMAGE_TGEN(GX_TEXGEN_NORMAL);
        gTexGenTexImageCmds[3] = pRS->pMatAnmResult->prmTexImage;
        NNS_G3dGeBufferOP_N(gTexGenTexImageCmds[2], &gEnvMapTexImageParam, G3OP_TEXIMAGE_PARAM_NPARAMS);
    }
    modeTexture = GX_MTXMODE_TEXTURE;
    NNS_G3dGeBufferOP_N(G3OP_MTX_MODE, &modeTexture, G3OP_MTX_MODE_NPARAMS);
    timing = GetCallbackTiming(pRS, NNS_G3D_SBC_ENVMAP);
    if (timing == G3D_SBC_CALLBACK_TIMING_A) {
        CallCallback(pRS, NNS_G3D_SBC_ENVMAP);
        timing = GetCallbackTiming(pRS, NNS_G3D_SBC_ENVMAP);
        skip = pRS->flag & G3D_RS_FLAG_SKIP_CMD;
    } else {
        skip = 0;
    }
    if (!skip) {
        height = pRS->pMatAnmResult->origHeight;
        width = pRS->pMatAnmResult->origWidth;
        scale[0] = (u32)width << 15;
        scale[1] = (u32)(-height) << 15;
        scale[2] = FX32_ONE << 4;
        NNS_G3dGeBufferOP_N(G3OP_MTX_SCALE, scale, G3OP_MTX_SCALE_NPARAMS);
        texCoord = (u16)(s16)(width << 3) | ((u16)(s16)(height << 3) << 16);
        NNS_G3dGeBufferOP_N(G3OP_TEXCOORD, &texCoord, G3OP_TEXCOORD_NPARAMS);
    }
    if (timing == G3D_SBC_CALLBACK_TIMING_B) {
        CallCallback(pRS, NNS_G3D_SBC_ENVMAP);
        timing = GetCallbackTiming(pRS, NNS_G3D_SBC_ENVMAP);
        skip = pRS->flag & G3D_RS_FLAG_SKIP_CMD;
    } else {
        skip = 0;
    }
    if (!skip) {
        pMatData = G3dGetResMatDataByIdx(pRS->pResMat, pRS->c[1]);
        if (pMatData->flag & NNS_G3D_MATFLAG_EFFECTMTX) {
            NNS_G3dGeBufferOP_N(G3OP_MTX_MULT_4x4, GetResMatEffectMtx(pMatData), G3OP_MTX_MULT_4x4_NPARAMS);
        }
    }
    if (timing == G3D_SBC_CALLBACK_TIMING_C) {
        CallCallback(pRS, NNS_G3D_SBC_ENVMAP);
        skip = pRS->flag & G3D_RS_FLAG_SKIP_CMD;
    } else {
        skip = 0;
    }
    if (!skip) {
        modeDir = GX_MTXMODE_POSITION_VECTOR;
        NNS_G3dGeBufferOP_N(G3OP_MTX_MODE, &modeDir, G3OP_MTX_MODE_NPARAMS);
        NNS_G3dGetCurrentMtx(NULL, &dir);
        modeTexture2 = GX_MTXMODE_TEXTURE;
        NNS_G3dGeBufferOP_N(G3OP_MTX_MODE, &modeTexture2, G3OP_MTX_MODE_NPARAMS);
        flag = NNS_G3dGlb.flag;
        if (flag & NNS_G3D_GLB_FLAG_FLUSH_WVP) {
            NNS_G3dGeBufferOP_N(G3OP_MTX_MULT_3x3, (const u32 *)&NNS_G3dGlb.cameraMtx, G3OP_MTX_MULT_3x3_NPARAMS);
            NNS_G3dGeBufferOP_N(G3OP_MTX_MULT_3x3, (const u32 *)&NNS_G3dGlb.prmBaseRot, G3OP_MTX_MULT_3x3_NPARAMS);
            NNS_G3dGeBufferOP_N(G3OP_MTX_MULT_3x3, (const u32 *)&dir, G3OP_MTX_MULT_3x3_NPARAMS);
        } else if (flag & NNS_G3D_GLB_FLAG_FLUSH_VP) {
            NNS_G3dGeBufferOP_N(G3OP_MTX_MULT_3x3, (const u32 *)&NNS_G3dGlb.cameraMtx, G3OP_MTX_MULT_3x3_NPARAMS);
            NNS_G3dGeBufferOP_N(G3OP_MTX_MULT_3x3, (const u32 *)&dir, G3OP_MTX_MULT_3x3_NPARAMS);
        } else {
            NNS_G3dGeBufferOP_N(G3OP_MTX_MULT_3x3, (const u32 *)&dir, G3OP_MTX_MULT_3x3_NPARAMS);
        }
    }
    modeEnd = GX_MTXMODE_POSITION_VECTOR;
    NNS_G3dGeBufferOP_N(G3OP_MTX_MODE, &modeEnd, G3OP_MTX_MODE_NPARAMS);
end:
    pRS->c += 3;
}

static inline void SendMtxStore(u32 idx) {
    u32 data = idx;
    NNS_G3dGeBufferOP_N(G3OP_MTX_STORE, &data, G3OP_MTX_STORE_NPARAMS);
}

static inline void SendMtxMode(u32 mode) {
    u32 data = mode;
    NNS_G3dGeBufferOP_N(G3OP_MTX_MODE, &data, G3OP_MTX_MODE_NPARAMS);
}

static inline void SendMtxRestore(u32 idx) {
    u32 data = idx;
    NNS_G3dGeBufferOP_N(G3OP_MTX_RESTORE, &data, G3OP_MTX_RESTORE_NPARAMS);
}

static inline void SendTexCoord(fx32 s, fx32 t) {
    u32 data = (u16)(s16)(s >> 8) | ((u16)(s16)(t >> 8) << 16);
    NNS_G3dGeBufferOP_N(G3OP_TEXCOORD, &data, G3OP_TEXCOORD_NPARAMS);
}

#pragma opt_propagation off

// PRJMAP matID flags: sets up projection mapping for the current material (texture coordinates from
// the vertex positions; texture matrix from the camera and the current position matrix)
void NNSi_G3dFuncSbc_PRJMAP(G3dRS *pRS, u32 opt) {
    MtxFx43 current;
    MtxFx44 clip;
    u32 flag;
    u32 timing;
    u32 skip;
    G3dResMatData *pMatData;
    u32 width;
    u32 height;
    volatile u32 *pReg;
    flag = pRS->flag;
    if (flag & G3D_RS_FLAG_SKIP_SBC_DRAW) {
        goto end;
    }
    if (!(flag & G3D_RS_FLAG_NODE_VISIBLE)) {
        goto end;
    }
    NNS_G3dGetCurrentMtx(&current, NULL);
    SendMtxStore(30);
    if ((pRS->pMatAnmResult->prmTexImage & REG_G3_TEXIMAGE_PARAM_TGEN_MASK) != TEXIMAGE_TGEN(GX_TEXGEN_VERTEX)) {
        pRS->pMatAnmResult->prmTexImage &= ~REG_G3_TEXIMAGE_PARAM_TGEN_MASK;
        pRS->pMatAnmResult->prmTexImage |= TEXIMAGE_TGEN(GX_TEXGEN_VERTEX);
        gTexGenTexImageCmds[1] = pRS->pMatAnmResult->prmTexImage;
        NNS_G3dGeBufferOP_N(gTexGenTexImageCmds[0], &gPrjMapTexImageParam, G3OP_TEXIMAGE_PARAM_NPARAMS);
    }
    timing = GetCallbackTiming(pRS, NNS_G3D_SBC_PRJMAP);
    if (timing == G3D_SBC_CALLBACK_TIMING_A) {
        CallCallback(pRS, NNS_G3D_SBC_PRJMAP);
        timing = GetCallbackTiming(pRS, NNS_G3D_SBC_PRJMAP);
        skip = pRS->flag & G3D_RS_FLAG_SKIP_CMD;
    } else {
        skip = 0;
    }
    if (!skip) {
        height = pRS->pMatAnmResult->origHeight;
        width = pRS->pMatAnmResult->origWidth;
        // gPrjMapTexMtx._00, _11, _30 and _31, addressed from gTexGenTexImageCmds (needed for the match)
        gTexGenTexImageCmds[12] = width << 15;
        gTexGenTexImageCmds[17] = (u32)(-height) << 15;
        gTexGenTexImageCmds[24] = width << 15;
        gTexGenTexImageCmds[25] = height << 15;
        NNS_G3dGeBufferOP_N(G3OP_MTX_LOAD_4x4, (const u32 *)&gPrjMapTexMtx, G3OP_MTX_LOAD_4x4_NPARAMS);
    }
    if (timing == G3D_SBC_CALLBACK_TIMING_B) {
        CallCallback(pRS, NNS_G3D_SBC_PRJMAP);
        timing = GetCallbackTiming(pRS, NNS_G3D_SBC_PRJMAP);
        skip = pRS->flag & G3D_RS_FLAG_SKIP_CMD;
    } else {
        skip = 0;
    }
    if (!skip) {
        pMatData = G3dGetResMatDataByIdx(pRS->pResMat, pRS->c[1]);
        if (pMatData->flag & NNS_G3D_MATFLAG_EFFECTMTX) {
            NNS_G3dGeBufferOP_N(G3OP_MTX_MULT_4x4, GetResMatEffectMtx(pMatData), G3OP_MTX_MULT_4x4_NPARAMS);
        }
    }
    if (timing == G3D_SBC_CALLBACK_TIMING_C) {
        CallCallback(pRS, NNS_G3D_SBC_PRJMAP);
        skip = pRS->flag & G3D_RS_FLAG_SKIP_CMD;
    } else {
        skip = 0;
    }
    if (!skip) {
        flag = NNS_G3dGlb.flag;
        if (flag & NNS_G3D_GLB_FLAG_FLUSH_WVP) {
            NNS_G3dGeBufferOP_N(G3OP_MTX_TRANS, (const u32 *)&NNS_G3dGlb.prmBaseTrans, G3OP_MTX_TRANS_NPARAMS);
            NNS_G3dGeBufferOP_N(G3OP_MTX_MULT_3x3, (const u32 *)&NNS_G3dGlb.prmBaseRot, G3OP_MTX_MULT_3x3_NPARAMS);
            NNS_G3dGeBufferOP_N(G3OP_MTX_MULT_4x3, (const u32 *)&current, G3OP_MTX_MULT_4x3_NPARAMS);
        } else if (flag & NNS_G3D_GLB_FLAG_FLUSH_VP) {
            NNS_G3dGeBufferOP_N(G3OP_MTX_MULT_4x3, (const u32 *)&current, G3OP_MTX_MULT_4x3_NPARAMS);
        } else {
            NNS_G3dGeBufferOP_N(G3OP_MTX_MULT_4x3, (const u32 *)NNS_G3dGlbGetInvV(), G3OP_MTX_MULT_4x3_NPARAMS);
            NNS_G3dGeBufferOP_N(G3OP_MTX_MULT_4x3, (const u32 *)&current, G3OP_MTX_MULT_4x3_NPARAMS);
        }
        // read the result through the clip matrix with an identity projection, then load it as the
        // texture matrix; its translation becomes the texture coordinate
        NNS_G3dGeFlushBuffer();
        reg_G3_MTX_MODE = GX_MTXMODE_PROJECTION;
        reg_G3_MTX_PUSH = 0;
        reg_G3_MTX_IDENTITY = 0;
        do {
        } while (G3X_GetClipMtx(&clip));
        pReg = &reg_G3_MTX_POP;
        pReg[0] = 1;
        pReg[-2] = GX_MTXMODE_TEXTURE; // reg_G3_MTX_MODE
        NNS_G3dGeBufferOP_N(G3OP_MTX_LOAD_4x4, (const u32 *)&clip, G3OP_MTX_LOAD_4x4_NPARAMS);
        SendTexCoord(clip._30 >> 4, clip._31 >> 4);
    }
    SendMtxMode(GX_MTXMODE_POSITION_VECTOR);
    SendMtxRestore(30);
end:
    pRS->c += 3;
}

#pragma opt_propagation reset
