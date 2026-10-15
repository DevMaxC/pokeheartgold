// GX_load3d.h declares the 3D load functions without parameter lists, which -W error rejects at a
// call; skip it and declare them here.
#define GUARD_GX_LOAD3D_H

#include <nitro.h>
#include <nnsys/gfd_internal.h>

void GX_BeginLoadTex(void);
void GX_LoadTex(void *src, u32 offset, u32 size);
void GX_EndLoadTex(void);
void GX_BeginLoadTexPltt(void);
void GX_LoadTexPltt(void *src, u32 offset, u32 size);
void GX_EndLoadTexPltt(void);
void GX_BeginLoadClearImage(void);
void GX_LoadClearImageColor(void *src, u32 size);
void GX_LoadClearImageDepth(void *src, u32 size);
void GX_EndLoadClearImage(void);

extern void (*const gVramTransferFuncTable[NNS_GFD_DST_MAX])(void *src, u32 dstAddr, u32 szByte); // DoTransfer* by NNS_GFD_DST_TYPE

u16 GetNextIndex_(VramTransferTaskQueue *queue, u32 index) {
    return (index + 1) % queue->lengthOfArray;
}

BOOL IsVramTransferTaskQueueFull_(VramTransferTaskQueue *queue) {
    return queue->numTasks == queue->lengthOfArray;
}

BOOL IsVramTransferTaskQueueEmpty_(VramTransferTaskQueue *queue) {
    return queue->numTasks == 0;
}

void DoTransfer3dTex(void *src, u32 dstAddr, u32 szByte) {
    GX_BeginLoadTex();
    GX_LoadTex(src, dstAddr, szByte);
    GX_EndLoadTex();
}

void DoTransfer3dTexPltt(void *src, u32 dstAddr, u32 szByte) {
    GX_BeginLoadTexPltt();
    GX_LoadTexPltt(src, dstAddr, szByte);
    GX_EndLoadTexPltt();
}

void DoTransfer3dClearImageColor(void *src, u32 dstAddr, u32 szByte) {
    GX_BeginLoadClearImage();
    GX_LoadClearImageColor(src, szByte);
    GX_EndLoadClearImage();
}

void DoTransfer3dClearImageDepth(void *src, u32 dstAddr, u32 szByte) {
    GX_BeginLoadClearImage();
    GX_LoadClearImageDepth(src, szByte);
    GX_EndLoadClearImage();
}

void DoTransfer2dBG0CharMain(void *src, u32 dstAddr, u32 szByte) {
    GX_LoadBG0Char(src, dstAddr, szByte);
}

void DoTransfer2dBG1CharMain(void *src, u32 dstAddr, u32 szByte) {
    GX_LoadBG1Char(src, dstAddr, szByte);
}

void DoTransfer2dBG2CharMain(void *src, u32 dstAddr, u32 szByte) {
    GX_LoadBG2Char(src, dstAddr, szByte);
}

void DoTransfer2dBG3CharMain(void *src, u32 dstAddr, u32 szByte) {
    GX_LoadBG3Char(src, dstAddr, szByte);
}

void DoTransfer2dBG0ScrMain(void *src, u32 dstAddr, u32 szByte) {
    GX_LoadBG0Scr(src, dstAddr, szByte);
}

void DoTransfer2dBG1ScrMain(void *src, u32 dstAddr, u32 szByte) {
    GX_LoadBG1Scr(src, dstAddr, szByte);
}

void DoTransfer2dBG2ScrMain(void *src, u32 dstAddr, u32 szByte) {
    GX_LoadBG2Scr(src, dstAddr, szByte);
}

void DoTransfer2dBG3ScrMain(void *src, u32 dstAddr, u32 szByte) {
    GX_LoadBG3Scr(src, dstAddr, szByte);
}

void DoTransfer2dBG2BmpMain(void *src, u32 dstAddr, u32 szByte) {
    GX_LoadBG2Scr(src, dstAddr, szByte);
}

void DoTransfer2dBG3BmpMain(void *src, u32 dstAddr, u32 szByte) {
    GX_LoadBG3Scr(src, dstAddr, szByte);
}

void DoTransfer2dObjPlttMain(void *src, u32 dstAddr, u32 szByte) {
    GX_LoadOBJPltt(src, dstAddr, szByte);
}

void DoTransfer2dBGPlttMain(void *src, u32 dstAddr, u32 szByte) {
    GX_LoadBGPltt(src, dstAddr, szByte);
}

void DoTransfer2dObjExtPlttMain(void *src, u32 dstAddr, u32 szByte) {
    GX_BeginLoadOBJExtPltt();
    GX_LoadOBJExtPltt(src, dstAddr, szByte);
    GX_EndLoadOBJExtPltt();
}

void DoTransfer2dBGExtPlttMain(void *src, u32 dstAddr, u32 szByte) {
    GX_BeginLoadBGExtPltt();
    GX_LoadBGExtPltt(src, dstAddr, szByte);
    GX_EndLoadBGExtPltt();
}

void DoTransfer2dObjOamMain(void *src, u32 dstAddr, u32 szByte) {
    GX_LoadOAM(src, dstAddr, szByte);
}

void DoTransfer2dObjCharMain(void *src, u32 dstAddr, u32 szByte) {
    GX_LoadOBJ(src, dstAddr, szByte);
}

void DoTransfer2dBG0CharSub(void *src, u32 dstAddr, u32 szByte) {
    GXS_LoadBG0Char(src, dstAddr, szByte);
}

void DoTransfer2dBG1CharSub(void *src, u32 dstAddr, u32 szByte) {
    GXS_LoadBG1Char(src, dstAddr, szByte);
}

void DoTransfer2dBG2CharSub(void *src, u32 dstAddr, u32 szByte) {
    GXS_LoadBG2Char(src, dstAddr, szByte);
}

void DoTransfer2dBG3CharSub(void *src, u32 dstAddr, u32 szByte) {
    GXS_LoadBG3Char(src, dstAddr, szByte);
}

void DoTransfer2dBG0ScrSub(void *src, u32 dstAddr, u32 szByte) {
    GXS_LoadBG0Scr(src, dstAddr, szByte);
}

void DoTransfer2dBG1ScrSub(void *src, u32 dstAddr, u32 szByte) {
    GXS_LoadBG1Scr(src, dstAddr, szByte);
}

void DoTransfer2dBG2ScrSub(void *src, u32 dstAddr, u32 szByte) {
    GXS_LoadBG2Scr(src, dstAddr, szByte);
}

void DoTransfer2dBG3ScrSub(void *src, u32 dstAddr, u32 szByte) {
    GXS_LoadBG3Scr(src, dstAddr, szByte);
}

void DoTransfer2dBG2BmpSub(void *src, u32 dstAddr, u32 szByte) {
    GXS_LoadBG2Scr(src, dstAddr, szByte);
}

void DoTransfer2dBG3BmpSub(void *src, u32 dstAddr, u32 szByte) {
    GXS_LoadBG3Scr(src, dstAddr, szByte);
}

void DoTransfer2dObjPlttSub(void *src, u32 dstAddr, u32 szByte) {
    GXS_LoadOBJPltt(src, dstAddr, szByte);
}

void DoTransfer2dBGPlttSub(void *src, u32 dstAddr, u32 szByte) {
    GXS_LoadBGPltt(src, dstAddr, szByte);
}

void DoTransfer2dObjExtPlttSub(void *src, u32 dstAddr, u32 szByte) {
    GXS_BeginLoadOBJExtPltt();
    GXS_LoadOBJExtPltt(src, dstAddr, szByte);
    GXS_EndLoadOBJExtPltt();
}

void DoTransfer2dBGExtPlttSub(void *src, u32 dstAddr, u32 szByte) {
    GXS_BeginLoadBGExtPltt();
    GXS_LoadBGExtPltt(src, dstAddr, szByte);
    GXS_EndLoadBGExtPltt();
}

void DoTransfer2dObjOamSub(void *src, u32 dstAddr, u32 szByte) {
    GXS_LoadOAM(src, dstAddr, szByte);
}

void DoTransfer2dObjCharSub(void *src, u32 dstAddr, u32 szByte) {
    GXS_LoadOBJ(src, dstAddr, szByte);
}

void DoTransfer_(NNSGfdVramTransferTask *task) {
    void (*transfer)(void *, u32, u32) = gVramTransferFuncTable[task->type];
    DC_FlushRange(task->pSrc, task->szByte);
    transfer(task->pSrc, task->dstAddr, task->szByte);
}

void ResetTaskQueue_(VramTransferTaskQueue *queue) {
    queue->idxEnd = 0;
    queue->idxFront = 0;
    queue->numTasks = 0;
    queue->totalSize = 0;
}

BOOL NNSi_GfdPushVramTransferTaskQueue(VramTransferTaskQueue *queue) {
    if (IsVramTransferTaskQueueFull_(queue)) {
        return FALSE;
    }
    queue->idxEnd = GetNextIndex_(queue, queue->idxEnd);
    queue->numTasks++;
    return TRUE;
}

NNSGfdVramTransferTask *NNSi_GfdGetFrontVramTransferTaskQueue(VramTransferTaskQueue *queue) {
    return &queue->pTaskArray[queue->idxFront];
}

NNSGfdVramTransferTask *NNSi_GfdGetEndVramTransferTaskQueue(VramTransferTaskQueue *queue) {
    return &queue->pTaskArray[queue->idxEnd];
}

BOOL NNSi_GfdPopVramTransferTaskQueue(VramTransferTaskQueue *queue) {
    if (IsVramTransferTaskQueueEmpty_(queue)) {
        return FALSE;
    }
    queue->idxFront = GetNextIndex_(queue, queue->idxFront);
    queue->numTasks--;
    return TRUE;
}

#pragma force_active on

VramTransferTaskQueue gVramTransferTaskQueue;

void NNS_GfdInitVramTransferManager(NNSGfdVramTransferTask *pTaskArray, u32 lengthOfArray) {
    gVramTransferTaskQueue.pTaskArray = pTaskArray;
    gVramTransferTaskQueue.lengthOfArray = lengthOfArray;
    ResetTaskQueue_(&gVramTransferTaskQueue);
}

#pragma force_active reset

void NNS_GfdDoVramTransfer(void) {
    VramTransferTaskQueue *queue = &gVramTransferTaskQueue;
    NNSGfdVramTransferTask *task = NNSi_GfdGetFrontVramTransferTaskQueue(queue);
    if (!NNSi_GfdPopVramTransferTaskQueue(queue)) {
        return;
    }
    do {
        DoTransfer_(task);
        queue->totalSize -= task->szByte;
        task = NNSi_GfdGetFrontVramTransferTaskQueue(queue);
    } while (NNSi_GfdPopVramTransferTaskQueue(queue));
}

BOOL NNS_GfdRegisterNewVramTransferTask(NNS_GFD_DST_TYPE type, u32 dstAddr, void *pSrc, u32 szByte) {
    VramTransferTaskQueue *queue = &gVramTransferTaskQueue;
    NNSGfdVramTransferTask *task;
    if (IsVramTransferTaskQueueFull_(queue)) {
        return FALSE;
    }
    task = NNSi_GfdGetEndVramTransferTaskQueue(queue);
    task->type = type;
    task->dstAddr = dstAddr;
    task->pSrc = pSrc;
    task->szByte = szByte;
    NNSi_GfdPushVramTransferTaskQueue(queue);
    queue->totalSize += task->szByte;
    return TRUE;
}
