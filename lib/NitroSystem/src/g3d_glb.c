#include <nitro.h>
#include <nnsys/g3d/gecom.h>
#include <nnsys/g3d_internal.h>

#pragma force_active on

NNSG3dGlb NNS_G3dGlb;

// the packed geometry commands and their parameters, sent in one block by NNS_G3dGlbFlushP
void NNS_G3dGlbInit(void) {
    // derived from each other rather than loaded as separate literals (needed for the match)
    u32 lightVec1;
    u32 viewPortBase;
    NNS_G3dGlb.cmd0 = 0x17101610; // MTX_MODE, MTX_LOAD_4x4, MTX_MODE, MTX_LOAD_4x3
    NNS_G3dGlb.mtxmode_proj = GX_MTXMODE_PROJECTION;
    NNS_G3dGlb.mtxmode_posvec = GX_MTXMODE_POSITION_VECTOR;
    NNS_G3dGlb.cmd1 = 0x32323232; // LIGHT_VECTOR x4
    NNS_G3dGlb.cmd2 = 0x60293130; // DIF_AMB, SPE_EMI, POLYGON_ATTR, VIEWPORT
    NNS_G3dGlb.cmd3 = 0x33333333; // LIGHT_COLOR x4
    NNS_G3dGlb.cmd4 = 0x002A1B19; // MTX_MULT_3x3, MTX_SCALE, TEXIMAGE_PARAM
    MTX_Identity43_(&NNS_G3dGlb.cameraMtx);
    MTX_Identity44_(&NNS_G3dGlb.projMtx);
    lightVec1 = 0x40000200;
    viewPortBase = 0xC0080000;
    NNS_G3dGlb.lightVec[0] = 0x2D8B62D8;
    NNS_G3dGlb.lightVec[1] = lightVec1;
    NNS_G3dGlb.lightVec[2] = lightVec1 - 0xC0000001;
    NNS_G3dGlb.lightVec[3] = viewPortBase;
    NNS_G3dGlb.prmMatColor0 = 0x4210C210;
    NNS_G3dGlb.prmMatColor1 = 0x4210C210;
    NNS_G3dGlb.prmPolygonAttr = 0x001F008F;
    NNS_G3dGlb.prmViewPort = viewPortBase - 0x90000;
    NNS_G3dGlb.lightColor[0] = 0x7FFF;
    NNS_G3dGlb.lightColor[1] = 0x4000001F;
    NNS_G3dGlb.lightColor[2] = 0x800003E0;
    NNS_G3dGlb.lightColor[3] = 0x7E00 - lightVec1;
    NNS_G3dGlb.prmBaseTrans.x = 0;
    NNS_G3dGlb.prmBaseTrans.y = 0;
    NNS_G3dGlb.prmBaseTrans.z = 0;
    MTX_Identity33_(&NNS_G3dGlb.prmBaseRot);
    NNS_G3dGlb.prmBaseScale.x = FX32_ONE;
    NNS_G3dGlb.prmBaseScale.y = FX32_ONE;
    NNS_G3dGlb.prmBaseScale.z = FX32_ONE;
    NNS_G3dGlb.prmTexImageParam = 0;
    NNS_G3dGlb.flag = 0;
    NNS_G3dGlb.camPos.z = 0;
    NNS_G3dGlb.camPos.y = 0;
    NNS_G3dGlb.camPos.x = 0;
    NNS_G3dGlb.camUp.z = 0;
    NNS_G3dGlb.camUp.x = 0;
    NNS_G3dGlb.camUp.y = FX32_ONE;
    NNS_G3dGlb.camTarget.y = 0;
    NNS_G3dGlb.camTarget.x = 0;
    NNS_G3dGlb.camTarget.z = -FX32_ONE;
}

void NNS_G3dGlbFlushP(void) {
    NNS_G3dGeBufferOP_N(NNS_G3dGlb.cmd0, (u32 *)&NNS_G3dGlb + 1, 62);
    NNS_G3dGlb.flag &= ~NNS_G3D_GLB_FLAG_FLUSH_WVP;
    NNS_G3dGlb.flag &= ~NNS_G3D_GLB_FLAG_FLUSH_VP;
}

#pragma force_active off
