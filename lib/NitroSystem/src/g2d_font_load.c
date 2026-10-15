#include <nitro.h>
#include <nnsys/g2d_canvas_internal.h>

#define NFTR_SIGNATURE (u32)'NFTR'
#define FINF_SIGNATURE (u32)'FINF' // font information
#define CGLP_SIGNATURE (u32)'CGLP' // glyphs
#define CWDH_SIGNATURE (u32)'CWDH' // character widths
#define CMAP_SIGNATURE (u32)'CMAP' // character code map

#pragma force_active on

static inline BOOL IsValidSignature(const G2dBinaryFileHeader *pHeader) {
    if (pHeader && pHeader->signature == NFTR_SIGNATURE) {
        return TRUE;
    }
    return FALSE;
}

static inline BOOL IsVersionAtLeast(const G2dBinaryFileHeader *pHeader, u16 version) {
    if (pHeader && pHeader->version >= version) {
        return TRUE;
    }
    return FALSE;
}

static inline BOOL IsValidFont(const G2dBinaryFileHeader *pHeader, u16 version) {
    if (pHeader) {
        BOOL valid = (BOOL)(IsValidSignature(pHeader) != FALSE);
        if (valid) {
            valid = (BOOL)(IsVersionAtLeast(pHeader, version) != FALSE);
        }
        return valid;
    }
    return FALSE;
}

// fonts older than version 1.1 have no glyph rotation
BOOL NNSi_G2dGetUnpackedFont(void *pFontFile, G2dFontInfo **ppFontInfo) {
    BOOL isOldVersion = FALSE;
    G2dBinaryBlockHeader *pBlock;
    if (!IsValidFont(pFontFile, 0x101)) {
        if (!IsValidFont(pFontFile, 0x100)) {
            OS_Terminate();
        }
        isOldVersion = TRUE;
    }
    NNSi_G2dUnpackNFT(pFontFile);
    pBlock = NNS_G2dFindBinaryBlock(pFontFile, FINF_SIGNATURE);
    if (!pBlock) {
        *ppFontInfo = NULL;
        return FALSE;
    }
    *ppFontInfo = (G2dFontInfo *)(pBlock + 1);
    if (isOldVersion) {
        ((G2dFontGlyph *)(*ppFontInfo)->pGlyph)->rotation = 0;
    }
    return TRUE;
}

// converts the offsets in the blocks of a font file to pointers
void NNSi_G2dUnpackNFT(G2dBinaryFileHeader *pHeader) {
    u8 *pBlock = (u8 *)pHeader + pHeader->headerSize;
    for (int i = 0; i < pHeader->numBlocks; i++) {
        switch (((G2dBinaryBlockHeader *)pBlock)->signature) {
        case FINF_SIGNATURE: {
            G2dFontInfo *pInfo = (G2dFontInfo *)(pBlock + sizeof(G2dBinaryBlockHeader));
            *(u32 *)&pInfo->pGlyph += (u32)pHeader;
            if (pInfo->pWidth) {
                *(u32 *)&pInfo->pWidth += (u32)pHeader;
            }
            if (pInfo->pMap) {
                *(u32 *)&pInfo->pMap += (u32)pHeader;
            }
            break;
        }
        case CWDH_SIGNATURE: {
            G2dFontWidthBlock *pWidth = (G2dFontWidthBlock *)(pBlock + sizeof(G2dBinaryBlockHeader));
            if (pWidth->pNext) {
                *(u32 *)&pWidth->pNext += (u32)pHeader;
            }
            break;
        }
        case CMAP_SIGNATURE: {
            G2dFontCodeMap *pMap = (G2dFontCodeMap *)(pBlock + sizeof(G2dBinaryBlockHeader));
            if (pMap->pNext) {
                *(u32 *)&pMap->pNext += (u32)pHeader;
            }
            break;
        }
        case CGLP_SIGNATURE:
            break;
        }
        pBlock += ((G2dBinaryBlockHeader *)pBlock)->size;
    }
}
