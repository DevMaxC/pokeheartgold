#include <nitro.h>
#include <nnsys/g3d/1mat1shp.h>
#include <nnsys/g3d_render_internal.h>

#pragma force_active on

// draws one shape of a model, optionally with one of its materials, without the SBC
void NNS_G3dDraw1Mat1Shp(const NNSG3dResMdl *pResMdl, u32 matID, u32 shpID, BOOL sendMat) {
    u32 cmd[7];
    G3dMatAnmResult texResult;
    u32 scale[3];
    u32 invScale[3];
    G3dResMatData *pMatData;
    G3dResShpData *pShpData;
    u8 *pTexMtxData;
    u32 posScale;
    u16 flag;
    G3dFuncSendTexSRT funcTexMtx;
    posScale = pResMdl->info.posScale;
    if (posScale != FX32_ONE) {
        scale[0] = posScale;
        scale[1] = posScale;
        scale[2] = posScale;
        NNS_G3dGeBufferOP_N(G3OP_MTX_SCALE, scale, G3OP_MTX_SCALE_NPARAMS);
    }
    if (sendMat && matID < pResMdl->info.numMat) {
        pMatData = G3dGetResMatDataByIdx(G3dGetResMat(pResMdl), matID);
        if (!(pMatData->prmPolygonAttr & REG_G3_POLYGON_ATTR_ALPHA_MASK)) {
            return;
        }
        cmd[0] = 0x293130; // DIF_AMB, SPE_EMI, POLYGON_ATTR
        cmd[1] = pMatData->prmMatColor0;
        cmd[2] = pMatData->prmMatColor1;
        cmd[3] = pMatData->prmPolygonAttr;
        if (pMatData->flag & NNS_G3D_MATFLAG_WIREFRAME) {
            cmd[3] &= ~REG_G3_POLYGON_ATTR_ALPHA_MASK;
        }
        cmd[4] = 0x2B2A; // TEXIMAGE_PARAM, PLTT_BASE
        cmd[5] = pMatData->texImageParam;
        cmd[6] = pMatData->texPlttBase;
        NNS_G3dGeBufferOP_N(cmd[0], cmd + 1, 6);
        if (pMatData->flag & NNS_G3D_MATFLAG_TEXMTX_USE) {
            texResult.flag = G3D_MATANM_FLAG_TEXMTX_SET;
            texResult.origWidth = pMatData->origWidth;
            texResult.origHeight = pMatData->origHeight;
            texResult.magW = pMatData->scaleS;
            texResult.magH = pMatData->scaleT;
            pTexMtxData = pMatData->texMtxData;
            flag = pMatData->flag;
            if (flag & NNS_G3D_MATFLAG_TEXMTX_SCALEONE) {
                texResult.flag |= G3D_MATANM_FLAG_TEXMTX_SCALEONE;
            } else {
                texResult.scaleS = ((fx32 *)pTexMtxData)[0];
                texResult.scaleT = ((fx32 *)pTexMtxData)[1];
                pTexMtxData += 2 * sizeof(fx32);
            }
            flag = pMatData->flag;
            if (!(flag & NNS_G3D_MATFLAG_TEXMTX_ROTZERO)) {
                texResult.sinR = ((fx16 *)pTexMtxData)[0];
                texResult.cosR = ((fx16 *)pTexMtxData)[1];
                pTexMtxData += 2 * sizeof(fx16);
            } else {
                texResult.flag |= G3D_MATANM_FLAG_TEXMTX_ROTZERO;
            }
            flag = pMatData->flag;
            if (!(flag & NNS_G3D_MATFLAG_TEXMTX_TRANSZERO)) {
                texResult.transS = ((fx32 *)pTexMtxData)[0];
                texResult.transT = ((fx32 *)pTexMtxData)[1];
            } else {
                texResult.flag |= G3D_MATANM_FLAG_TEXMTX_TRANSZERO;
            }
            funcTexMtx = gSendTexSRTFuncs[pResMdl->info.texMtxMode];
            if (funcTexMtx) {
                funcTexMtx(&texResult);
            }
        }
    }
    if (shpID < pResMdl->info.numShp) {
        pShpData = G3dGetResShpDataByIdx(G3dGetResShp(pResMdl), shpID);
        NNS_G3dGeSendDL((u8 *)pShpData + pShpData->ofsDL, pShpData->sizeDL);
    }
    posScale = pResMdl->info.invPosScale;
    if (posScale != FX32_ONE) {
        invScale[0] = posScale;
        invScale[1] = posScale;
        invScale[2] = posScale;
        NNS_G3dGeBufferOP_N(G3OP_MTX_SCALE, invScale, G3OP_MTX_SCALE_NPARAMS);
    }
}
