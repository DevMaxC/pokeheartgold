#include <nitro.h>
#include <nnsys/g2d_internal.h>

BOOL GetUnpackedAnimBankImpl_(void *pNanrFile, NNSG2dAnimBankData **ppAnimBank) {
    u8 *block = NNS_G2dFindBinaryBlock(pNanrFile, NNS_G2D_BLKSIG_ANIMBANK);
    if (block == NULL) {
        *ppAnimBank = NULL;
        return FALSE;
    }
    NNS_G2dUnpackNAN((NNSG2dAnimBankData *)(block + 8));
    *ppAnimBank = (NNSG2dAnimBankData *)(block + 8);
    return TRUE;
}

BOOL NNS_G2dGetUnpackedAnimBank(void *pNanrFile, NNSG2dAnimBankData **ppAnimBank) {
    return GetUnpackedAnimBankImpl_(pNanrFile, ppAnimBank);
}

BOOL NNS_G2dGetUnpackedMCAnimBank(void *pNanrFile, NNSG2dAnimBankData **ppAnimBank) {
    return GetUnpackedAnimBankImpl_(pNanrFile, ppAnimBank);
}

#pragma force_active on

void NNS_G2dUnpackNAN(NNSG2dAnimBankData *pAnimBank) {
    pAnimBank->pSequenceArrayHead = (NNSG2dAnimSequenceData *)((u32)pAnimBank->pSequenceArrayHead + (u32)pAnimBank);
    pAnimBank->pFrameArrayHead = (NNSG2dAnimFrameData *)((u32)pAnimBank->pFrameArrayHead + (u32)pAnimBank);
    pAnimBank->pAnimContents = (void *)((u32)pAnimBank->pAnimContents + (u32)pAnimBank);
    {
        void *contents;
        u16 i;
        u16 j;
        NNSG2dAnimFrameData *frames;
        NNSG2dAnimSequenceData *sequences;
        contents = pAnimBank->pAnimContents;
        sequences = pAnimBank->pSequenceArrayHead;
        frames = pAnimBank->pFrameArrayHead;
        for (i = 0; i < pAnimBank->numSequences; i++) {
            sequences[i].pAnmFrameArray = (NNSG2dAnimFrameData *)((u32)sequences[i].pAnmFrameArray + (u32)frames);
            for (j = 0; j < sequences[i].numFrames; j++) {
                sequences[i].pAnmFrameArray[j].pContent = (void *)((u32)contents + (u32)sequences[i].pAnmFrameArray[j].pContent);
            }
        }
    }
    if (pAnimBank->pExtendedData) {
        NNSG2dUserExAnimAttrBank *attrBank;
        u32 k;
        pAnimBank->pExtendedData = (void *)((u32)pAnimBank->pExtendedData + (u32)pAnimBank);
        attrBank = &((AnimUserExBlock *)pAnimBank->pExtendedData)->attrBank;
        attrBank->pAnmSeqAttrArray = (NNSG2dUserExAnimSequenceAttr *)((u32)attrBank->pAnmSeqAttrArray + (u32)attrBank);
        for (k = 0; k < attrBank->numSequences; k++) {
            u32 m;
            NNSG2dUserExAnimSequenceAttr *seqAttr = &attrBank->pAnmSeqAttrArray[k];
            seqAttr->pAttr = (u32 *)((u32)seqAttr->pAttr + (u32)attrBank);
            seqAttr->pAnmFrmAttrArray = (NNSG2dUserExAnimFrameAttr *)((u32)seqAttr->pAnmFrmAttrArray + (u32)attrBank);
            for (m = 0; m < seqAttr->numFrames; m++) {
                *(u32 *)((u8 *)seqAttr->pAnmFrmAttrArray + m * sizeof(NNSG2dUserExAnimFrameAttr)) += (u32)attrBank;
            }
        }
    }
}

#pragma force_active off

const NNSG2dAnimSequenceData *NNS_G2dGetAnimSequenceByIdx(const NNSG2dAnimBankData *pAnimBank, u16 idx) {
    if (pAnimBank->numSequences > idx) {
        return (const NNSG2dAnimSequenceData *)((u8 *)pAnimBank->pSequenceArrayHead + idx * sizeof(NNSG2dAnimSequenceData));
    }
    return NULL;
}

// cells carry an 8-byte bounding rectangle after their header when bit 0 of cellBankAttr is set
NNSG2dCellOAMAttrData *GetPtrOamArrayHead_(const NNSG2dCellDataBank *pCellBank) {
    if (pCellBank->cellBankAttr & 1) {
        return (NNSG2dCellOAMAttrData *)((u8 *)pCellBank->pCellDataArrayHead + pCellBank->numCells * 16);
    }
    return (NNSG2dCellOAMAttrData *)((u8 *)pCellBank->pCellDataArrayHead + pCellBank->numCells * 8);
}

void UnPackExtendedData_(void *pExtendedData) {
    NNSi_G2dUnpackUserExCellAttrBank((UserExCellAttrBank *)((u8 *)pExtendedData + 8));
}

BOOL NNS_G2dGetUnpackedCellBank(void *pNcerFile, NNSG2dCellDataBank **ppCellBank) {
    u8 *block = NNS_G2dFindBinaryBlock(pNcerFile, (u32)'CEBK');
    if (block == NULL) {
        *ppCellBank = NULL;
        return FALSE;
    }
    NNS_G2dUnpackNCE((NNSG2dCellDataBank *)(block + 8));
    *ppCellBank = (NNSG2dCellDataBank *)(block + 8);
    return TRUE;
}

const NNSG2dCellData *NNS_G2dGetCellDataByIdx(const NNSG2dCellDataBank *pCellBank, u16 idx) {
    if (idx >= pCellBank->numCells) {
        return NULL;
    }
    if (pCellBank->cellBankAttr & 1) {
        return (const NNSG2dCellData *)((u8 *)pCellBank->pCellDataArrayHead + idx * 16);
    }
    return (const NNSG2dCellData *)((u8 *)pCellBank->pCellDataArrayHead + idx * 8);
}

void NNS_G2dUnpackNCE(NNSG2dCellDataBank *pCellBank) {
    NNSG2dCellOAMAttrData *oamArray;
    u16 i;
    pCellBank->pCellDataArrayHead = (NNSG2dCellData *)((u32)pCellBank->pCellDataArrayHead + (u32)pCellBank);
    oamArray = GetPtrOamArrayHead_(pCellBank);
    i = 0;
    if (pCellBank->numCells > i) {
        do {
            NNSG2dCellData *cell = (NNSG2dCellData *)NNS_G2dGetCellDataByIdx(pCellBank, i);
            cell->pOamAttrArray = (NNSG2dCellOAMAttrData *)((u32)cell->pOamAttrArray + (u32)oamArray);
            i++;
        } while (i < pCellBank->numCells);
    }
    if (pCellBank->pVramTransferData != NULL) {
        pCellBank->pVramTransferData = (NNSG2dVramTransferData *)((u32)pCellBank->pVramTransferData + (u32)pCellBank);
        NNSG2dVramTransferData *transferData = pCellBank->pVramTransferData;
        transferData->pCellTransferDataArray = (NNSG2dCellVramTransferData *)((u32)transferData->pCellTransferDataArray + (u32)transferData);
        pCellBank->pVramTransferData = transferData;
    }
    if (pCellBank->pExtendedData == NULL) {
        return;
    }
    pCellBank->pExtendedData = (void *)((u32)pCellBank->pExtendedData + (u32)pCellBank);
    UnPackExtendedData_(pCellBank->pExtendedData);
}

BOOL NNS_G2dGetUnpackedMultiCellBank(void *pNmcrFile, NNSG2dMultiCellDataBank **ppMCBank) {
    u8 *block = NNS_G2dFindBinaryBlock(pNmcrFile, (u32)'MCBK');
    if (block == NULL) {
        *ppMCBank = NULL;
        return FALSE;
    }
    NNS_G2dUnpackNMC((NNSG2dMultiCellDataBank *)(block + 8));
    *ppMCBank = (NNSG2dMultiCellDataBank *)(block + 8);
    return TRUE;
}

void UnpackExtendedData_(void *pExtendedData) {
    NNSi_G2dUnpackUserExCellAttrBank((UserExCellAttrBank *)((u8 *)pExtendedData + 8));
}

#pragma force_active on

void NNS_G2dUnpackNMC(NNSG2dMultiCellDataBank *pMCBank) {
    u16 i = 0;
    pMCBank->pMultiCellDataArray = (NNSG2dMultiCellData *)((u32)pMCBank->pMultiCellDataArray + (u32)pMCBank);
    pMCBank->pHierarchyDataArray = (NNSG2dMultiCellHierarchyData *)((u32)pMCBank->pHierarchyDataArray + (u32)pMCBank);
    NNSG2dMultiCellData *multiCells = pMCBank->pMultiCellDataArray;
    for (; i < pMCBank->numMultiCellData; i++) {
        multiCells[i].pHierDataArray = (NNSG2dMultiCellHierarchyData *)((u8 *)pMCBank->pHierarchyDataArray + (u32)multiCells[i].pHierDataArray);
    }
    if (pMCBank->pExtendedData) {
        pMCBank->pExtendedData = (void *)((u32)pMCBank->pExtendedData + (u32)pMCBank);
        UnpackExtendedData_(pMCBank->pExtendedData);
    }
}

#pragma force_active off

const NNSG2dMultiCellData *NNS_G2dGetMultiCellDataByIdx(const NNSG2dMultiCellDataBank *pMCBank, u16 idx) {
    if (idx < pMCBank->numMultiCellData) {
        return (const NNSG2dMultiCellData *)((u8 *)pMCBank->pMultiCellDataArray + idx * sizeof(NNSG2dMultiCellData));
    }
    return NULL;
}

BOOL NNS_G2dGetUnpackedCharacterData(void *pNcgrFile, NNSG2dCharacterData **ppCharData) {
    u8 *block = NNS_G2dFindBinaryBlock(pNcgrFile, (u32)'CHAR');
    if (block == NULL) {
        *ppCharData = NULL;
        return FALSE;
    }
    NNS_G2dUnpackNCG((NNSG2dCharacterData *)(block + 8));
    *ppCharData = (NNSG2dCharacterData *)(block + 8);
    return TRUE;
}

void NNS_G2dUnpackNCG(NNSG2dCharacterData *pCharData) {
    pCharData->pRawData = (void *)((u32)pCharData->pRawData + (u32)pCharData);
}

BOOL NNS_G2dGetUnpackedBGCharacterData(void *pNcgrFile, NNSG2dCharacterData **ppCharData) {
    u8 *block = NNS_G2dFindBinaryBlock(pNcgrFile, (u32)'CHAR');
    if (block == NULL) {
        *ppCharData = NULL;
        return FALSE;
    }
    NNS_G2dUnpackBGNCG((NNSG2dCharacterData *)(block + 8));
    *ppCharData = (NNSG2dCharacterData *)(block + 8);
    return TRUE;
}

void NNS_G2dUnpackBGNCG(NNSG2dCharacterData *pCharData) {
    pCharData->pRawData = (void *)((u32)pCharData->pRawData + (u32)pCharData);
}

BOOL NNS_G2dGetUnpackedPaletteData(void *pNclrFile, NNSG2dPaletteData **ppPlttData) {
    u8 *block = NNS_G2dFindBinaryBlock(pNclrFile, (u32)'PLTT');
    if (block == NULL) {
        *ppPlttData = NULL;
        return FALSE;
    }
    NNS_G2dUnpackNCL((NNSG2dPaletteData *)(block + 8));
    *ppPlttData = (NNSG2dPaletteData *)(block + 8);
    return TRUE;
}

BOOL NNS_G2dGetUnpackedPaletteCompressInfo(void *pNclrFile, NNSG2dPaletteCompressInfo **ppPltCmpInfo) {
    u8 *block = NNS_G2dFindBinaryBlock(pNclrFile, (u32)'PCMP');
    if (block == NULL) {
        *ppPltCmpInfo = NULL;
        return FALSE;
    }
    NNSi_G2dUnpackNCLCmpInfo((NNSG2dPaletteCompressInfo *)(block + 8));
    *ppPltCmpInfo = (NNSG2dPaletteCompressInfo *)(block + 8);
    return TRUE;
}

void NNSi_G2dUnpackNCLCmpInfo(NNSG2dPaletteCompressInfo *pPltCmpInfo) {
    pPltCmpInfo->pPlttIdxTbl = (void *)((u32)pPltCmpInfo->pPlttIdxTbl + (u32)pPltCmpInfo);
}

void NNS_G2dUnpackNCL(NNSG2dPaletteData *pPlttData) {
    pPlttData->pRawData = (void *)((u32)pPlttData->pRawData + (u32)pPlttData);
}

BOOL NNS_G2dGetUnpackedScreenData(void *pNscrFile, NNSG2dScreenData **ppScrData) {
    u8 *block = NNS_G2dFindBinaryBlock(pNscrFile, (u32)'SCRN');
    if (block != NULL) {
        *ppScrData = (NNSG2dScreenData *)(block + 8);
        return TRUE;
    }
    *ppScrData = NULL;
    return FALSE;
}

// walks the data blocks that follow the binary file header
void *NNS_G2dFindBinaryBlock(void *pFile, u32 signature) {
    u8 *block = (u8 *)pFile + ((G2dBinaryFileHeader *)pFile)->headerSize;
    u16 numBlocks = ((G2dBinaryFileHeader *)pFile)->numBlocks;
    u16 i = 0;
    for (; i < numBlocks; i++) {
        if (((G2dBinaryBlockHeader *)block)->signature == signature) {
            return block;
        }
        block += ((G2dBinaryBlockHeader *)block)->size;
    }
    return NULL;
}

void NNSi_G2dUnpackUserExCellAttrBank(UserExCellAttrBank *pAttrBank) {
    u16 i;
    pAttrBank->pCellAttrArray = (u32 *)((u32)pAttrBank->pCellAttrArray + (u32)pAttrBank);
    for (i = 0; i < pAttrBank->numCells; i++) {
        pAttrBank->pCellAttrArray[i] = (u32)((u8 *)pAttrBank + pAttrBank->pCellAttrArray[i]);
    }
}
