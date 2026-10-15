#include <nitro.h>
#include <nnsys/g3d_anm_internal.h>

#pragma force_active on

void NNSi_G3dAnmObjInitNsBca(NNSG3dAnmObj *pAnmObj, void *pResAnm, const NNSG3dResMdl *pResMdl) {
    u32 i;
    G3dResJntAnm *pJntAnm = pResAnm;
    u16 *ofsTag;
    pAnmObj->resAnm = pResAnm;
    pAnmObj->funcAnm = (void *)gAnmCalcFuncNsBca;
    pAnmObj->numMapData = pResMdl->info.numNode;
    MIi_CpuClear16(0, pAnmObj->mapData, pAnmObj->numMapData * sizeof(u16));
    ofsTag = pJntAnm->ofsTagData;
    for (i = 0; i < pJntAnm->numNode; i++) {
        pAnmObj->mapData[i] = (*(u32 *)((u8 *)pJntAnm + ofsTag[i]) >> G3D_JNTANM_TAG_NODE_SHIFT) | G3D_ANMOBJ_MAPDATA_EXISTS;
    }
}

void NNSi_G3dAnmCalcNsBca(G3dJntAnmResult *pResult, const NNSG3dAnmObj *pAnmObj, u32 dataIdx) {
    G3dResJntAnm *pJntAnm = pAnmObj->resAnm;
    fx32 frame = pAnmObj->frame;
    fx32 lastFrame = pJntAnm->numFrame << FX32_SHIFT;
    if (frame >= lastFrame) {
        frame = lastFrame - 1;
    } else if (frame < 0) {
        frame = 0;
    }
    getJntSRTAnmResult_(pJntAnm, dataIdx, frame, pResult);
}

static inline void *GetDictData(NNSG3dResDict *pDict, u32 idx) {
    if (pDict && idx < pDict->numEntry) {
        NNSG3dResDictEntryHeader *pHeader = (NNSG3dResDictEntryHeader *)((u8 *)pDict + pDict->ofsEntry);
        return (u8 *)pHeader + 4 + pHeader->sizeUnit * idx;
    }
    return NULL;
}

static inline G3dResNodeData *GetNodeData(NNSG3dResNodeInfo *pResNodeInfo, u8 idx) {
    if (pResNodeInfo) {
        u32 *pOffset = GetDictData(&pResNodeInfo->dict, idx);
        if (pOffset) {
            return (G3dResNodeData *)((u8 *)pResNodeInfo + *pOffset);
        }
    }
    return NULL;
}

// the model's own translation of the node in the current NODEDESC command
void getMdlTrans_(G3dJntAnmResult *pResult) {
    G3dRS *pRS = gCurrentRenderState;
    G3dResNodeData *pNodeData = GetNodeData(pRS->pResNodeInfo, pRS->c[1]);
    if (pNodeData->flag & G3D_RESNODE_FLAG_TRANS_ZERO) {
        pResult->flag |= G3D_JNTANM_FLAG_TRANS_ZERO;
        return;
    }
    pResult->trans.x = ((s32 *)pNodeData->data)[0];
    pResult->trans.y = ((s32 *)pNodeData->data)[1];
    pResult->trans.z = ((s32 *)pNodeData->data)[2];
}

static inline G3dResNodeData *GetNodeData2(NNSG3dResNodeInfo *pResNodeInfo, u32 idx) {
    if (pResNodeInfo) {
        u32 *pOffset = GetDictData(&pResNodeInfo->dict, idx);
        if (pOffset) {
            return (G3dResNodeData *)((u8 *)pResNodeInfo + *pOffset);
        }
    }
    return NULL;
}

// the model's own scale of the node in the current NODEDESC command
void getMdlScale_(G3dJntAnmResult *pResult) {
    G3dRS *pRS = gCurrentRenderState;
    const u8 *pCmd = pRS->c;
    G3dResNodeData *pNodeData = GetNodeData2(pRS->pResNodeInfo, pCmd[1]);
    u16 flag = pNodeData->flag;
    u8 *pData = pNodeData->data;
    if (!(flag & G3D_RESNODE_FLAG_TRANS_ZERO)) {
        pData += 3 * sizeof(fx32);
    }
    if (!(flag & G3D_RESNODE_FLAG_ROT_ZERO)) {
        if (flag & G3D_RESNODE_FLAG_PIVOT_EXIST) {
            pData += 2 * sizeof(fx16);
        } else {
            pData += 8 * sizeof(fx16);
        }
    }
    pRS->funcJntScale(pResult, (const fx32 *)pData, pCmd, flag);
}

static inline u32 GetPivotMtxIndex(const u8 *pTable, int pivot) {
    return pTable[pivot * 4];
}

// compressed rotation: see NNSi_G3dFuncSbc_NODEDESC
static inline void DecodePivotRot(fx32 *pRot, int pivot, const s16 *pData, const G3dResNodeData *pNodeData) {
    s32 a = pData[0];
    s32 b = pData[1];
    MI_Zero36B(pRot);
    pRot[pivot] = (pNodeData->flag & G3D_RESNODE_FLAG_PIVOT_MINUS) ? -FX32_ONE : FX32_ONE;
    pRot[GetPivotMtxIndex(&gJntAnmPivotMtxIndices[0][0], pivot)] = a;
    pRot[GetPivotMtxIndex(&gJntAnmPivotMtxIndices[0][1], pivot)] = b;
    if (pNodeData->flag & G3D_RESNODE_FLAG_SIGN_REVC) {
        b = -b;
    }
    pRot[GetPivotMtxIndex(&gJntAnmPivotMtxIndices[0][2], pivot)] = b;
    if (pNodeData->flag & G3D_RESNODE_FLAG_SIGN_REVD) {
        a = -a;
    }
    pRot[GetPivotMtxIndex(&gJntAnmPivotMtxIndices[0][3], pivot)] = a;
}

#pragma push
#pragma opt_common_subs off

// the model's own rotation of the node in the current NODEDESC command
void getMdlRot_(G3dJntAnmResult *pResult) {
    G3dRS *pRS = gCurrentRenderState;
    u32 nodeID = pRS->c[1];
    NNSG3dResNodeInfo *pResNodeInfo = pRS->pResNodeInfo;
    const NNSG3dResDict *pDict = &pResNodeInfo->dict;
    int pivot;
    const u8 *pNode;
    const NNSG3dResDictMdlSetData *pEntry;
    if (pDict && (pEntry = NNS_G3dGetResDataByIdx(pDict, nodeID))) {
        pNode = (const u8 *)pDict + pEntry->offset;
    } else {
        pNode = NULL;
    }
    {
        const G3dResNodeData *pNodeData = (const G3dResNodeData *)pNode;
        int flag = pNodeData->flag;
        const s16 *pData = (const s16 *)pNodeData->data;
        if (!(flag & G3D_RESNODE_FLAG_TRANS_ZERO)) {
            pData += 3 * sizeof(fx32) / sizeof(s16);
        }
        if (!(flag & G3D_RESNODE_FLAG_ROT_ZERO)) {
            if (flag & G3D_RESNODE_FLAG_PIVOT_EXIST) {
                pivot = (flag & G3D_RESNODE_FLAG_PIVOT_MASK) >> G3D_RESNODE_FLAG_PIVOT_SHIFT;
                DecodePivotRot(pResult->rot.a, pivot, pData, pNodeData);
                return;
            }
            pResult->rot.a[0] = pNodeData->rot00;
            pResult->rot.a[1] = pData[0];
            pResult->rot.a[2] = pData[1];
            pResult->rot.a[3] = pData[2];
            pResult->rot.a[4] = pData[3];
            pResult->rot.a[5] = pData[4];
            pResult->rot.a[6] = pData[5];
            pResult->rot.a[7] = pData[6];
            pResult->rot.a[8] = pData[7];
            return;
        }
        pResult->flag |= G3D_JNTANM_FLAG_ROT_ZERO;
    }
}

#pragma pop

// evaluates the joint animation of one node at a frame: each of translation, rotation and scale is
// animated (per axis: key frames or a constant), the model's own value, or identity
void getJntSRTAnmResult_(const G3dResJntAnm *pJntAnm, u32 dataIdx, fx32 frame, G3dJntAnmResult *pResult) {
    fx32 scale[6]; // x, y, z, then the inverses
    fx32 valX[2];
    fx32 valY[2];
    fx32 valZ[2];
    u32 tag;
    const u32 *pData = (const u32 *)((u8 *)pJntAnm + pJntAnm->ofsTagData[dataIdx]);
    tag = *pData;
    BOOL interpolate;
    if (tag & G3D_JNTANM_TAG_SRT_NONE) {
        pResult->flag = G3D_JNTANM_FLAG_SCALE_ONE | G3D_JNTANM_FLAG_ROT_ZERO | G3D_JNTANM_FLAG_TRANS_ZERO;
        goto done;
    }
    pData++;
    if ((frame & (FX32_ONE - 1)) && (pJntAnm->flag & G3D_RESJNTANM_FLAG_INTERPOLATION)) {
        interpolate = TRUE;
    } else {
        interpolate = FALSE;
    }
    pResult->flag = 0;
    if (!(tag & (G3D_JNTANM_TAG_TRANS_ZERO | G3D_JNTANM_TAG_TRANS_MODEL))) {
        if (!(tag & G3D_JNTANM_TAG_TRANS_X_CONST)) {
            if (interpolate) {
                getTransDataEx_(&pResult->trans.x, frame, pData, pJntAnm);
            } else {
                getTransData_(&pResult->trans.x, frame, pData, pJntAnm);
            }
            pData += 2;
        } else {
            pResult->trans.x = *(fx32 *)pData;
            pData += 1;
        }
        if (!(tag & G3D_JNTANM_TAG_TRANS_Y_CONST)) {
            if (interpolate) {
                getTransDataEx_(&pResult->trans.y, frame, pData, pJntAnm);
            } else {
                getTransData_(&pResult->trans.y, frame, pData, pJntAnm);
            }
            pData += 2;
        } else {
            pResult->trans.y = *(fx32 *)pData;
            pData += 1;
        }
        if (!(tag & G3D_JNTANM_TAG_TRANS_Z_CONST)) {
            if (interpolate) {
                getTransDataEx_(&pResult->trans.z, frame, pData, pJntAnm);
            } else {
                getTransData_(&pResult->trans.z, frame, pData, pJntAnm);
            }
            pData += 2;
        } else {
            pResult->trans.z = *(fx32 *)pData;
            pData += 1;
        }
    } else if (tag & G3D_JNTANM_TAG_TRANS_ZERO) {
        pResult->flag |= G3D_JNTANM_FLAG_TRANS_ZERO;
    } else {
        getMdlTrans_(pResult);
    }
    if (!(tag & (G3D_JNTANM_TAG_ROT_ZERO | G3D_JNTANM_TAG_ROT_MODEL))) {
        if (!(tag & G3D_JNTANM_TAG_ROT_CONST)) {
            if (interpolate) {
                getRotDataEx_(pResult->rot.a, frame, pData, pJntAnm);
            } else {
                getRotData_(pResult->rot.a, frame, pData, pJntAnm);
            }
            pData += 2;
        } else {
            if (getRotDataByIdx_(pResult->rot.a, (u8 *)pJntAnm + pJntAnm->ofsRot3, (u8 *)pJntAnm + pJntAnm->ofsRot5, *pData)) {
                // two rows given: the third is their cross product
                s32 m5 = pResult->rot.a[5];
                s32 m0 = pResult->rot.a[0];
                s32 m3 = pResult->rot.a[3];
                s32 m2 = pResult->rot.a[2];
                s32 m1 = pResult->rot.a[1];
                s32 m4 = pResult->rot.a[4];
                pResult->rot.a[6] = (m1 * m5 - m2 * m4) >> FX32_SHIFT;
                pResult->rot.a[7] = (m2 * m3 - m0 * m5) >> FX32_SHIFT;
                pResult->rot.a[8] = (m0 * m4 - m1 * m3) >> FX32_SHIFT;
            }
            pData += 1;
        }
    } else if (tag & G3D_JNTANM_TAG_ROT_ZERO) {
        pResult->flag |= G3D_JNTANM_FLAG_ROT_ZERO;
    } else {
        getMdlRot_(pResult);
    }
    if (!(tag & (G3D_JNTANM_TAG_SCALE_ONE | G3D_JNTANM_TAG_SCALE_MODEL))) {
        if (!(tag & G3D_JNTANM_TAG_SCALE_X_CONST)) {
            if (interpolate) {
                getScaleDataEx_(valX, frame, pData, pJntAnm);
            } else {
                getScaleData_(valX, frame, pData, pJntAnm);
            }
            scale[0] = valX[0];
            scale[3] = valX[1];
        } else {
            scale[0] = ((fx32 *)pData)[0];
            scale[3] = ((fx32 *)pData)[1];
        }
        if (!(tag & G3D_JNTANM_TAG_SCALE_Y_CONST)) {
            if (interpolate) {
                getScaleDataEx_(valY, frame, pData + 2, pJntAnm);
            } else {
                getScaleData_(valY, frame, pData + 2, pJntAnm);
            }
            scale[1] = valY[0];
            scale[4] = valY[1];
        } else {
            scale[1] = ((fx32 *)pData)[2];
            scale[4] = ((fx32 *)pData)[3];
        }
        if (!(tag & G3D_JNTANM_TAG_SCALE_Z_CONST)) {
            if (interpolate) {
                getScaleDataEx_(valZ, frame, pData + 4, pJntAnm);
            } else {
                getScaleData_(valZ, frame, pData + 4, pJntAnm);
            }
            scale[2] = valZ[0];
            scale[5] = valZ[1];
        } else {
            scale[2] = ((fx32 *)pData)[4];
            scale[5] = ((fx32 *)pData)[5];
        }
    } else if (tag & G3D_JNTANM_TAG_SCALE_ONE) {
        pResult->flag |= G3D_JNTANM_FLAG_SCALE_ONE;
    } else {
        getMdlScale_(pResult);
        return;
    }
done: {
    // the scale goes through the model's scaling rule like a node's own scale
    int nodeFlag = (pResult->flag & G3D_JNTANM_FLAG_SCALE_ONE) ? G3D_RESNODE_FLAG_SCALE_ONE : 0;
    G3dRS *pRS = gCurrentRenderState;
    pRS->funcJntScale(pResult, scale, pRS->c, nodeFlag);
}
}
