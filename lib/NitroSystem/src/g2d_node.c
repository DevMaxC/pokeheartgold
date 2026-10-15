#include <nitro.h>
#include <nnsys/g2d_internal.h>

void NNSi_G2dInitializeNode(NNSG2dNode *pNode, NNSG2dNodeType type) {
    pNode->pContent = NULL;
    pNode->type = type;
    pNode->bVisible = TRUE;
    NNSi_G2dSrtcInitControl(&pNode->srtCtrl, NNS_G2D_SRTCONTROLTYPE_SRT);
}
