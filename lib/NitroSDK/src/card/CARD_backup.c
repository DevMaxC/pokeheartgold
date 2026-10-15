#include "CARD_backup.h"
#include "nitro/types.h"
#include "CARD_common.h"
#include "CARD_request.h"
#include "CARD_spi.h"
#include "OS_cache.h"
#include "MI_memory.h"
#include "OS_terminate_proc.h"
#include "OS_system.h"
#include "code32.h"

extern void OSi_ReferSymbol(void *symbol);
extern char _version_NINTENDO_BACKUP[];

extern CARDiCommon cardi_common;

extern void CARDi_RequestStreamCommandCore(CARDiCommon *p);

/* unmatched CARDi_RequestStreamCommandCore remains in assembly */


BOOL CARDi_RequestStreamCommand(u32 src, u32 dst, u32 len, MIDmaCallback callback, void *arg, BOOL is_async,
                                         CARDRequest req_type, int req_retry, CARDRequestMode req_mode)
{
    CARDiCommon *const p = &cardi_common;

    OSi_ReferSymbol((void *)_version_NINTENDO_BACKUP);

    CARDi_WaitTask(p, callback, arg);
    p->src = src;
    p->dst = dst;
    p->len = len;
    p->req_type = req_type;
    p->req_retry = req_retry;
    p->req_mode = req_mode;
    if (is_async)
    {
        CARDi_SetTask(CARDi_RequestStreamCommandCore);
        return TRUE;
    }
    else
    {
        cardi_common.cur_th = OS_GetCurrentThread();
        CARDi_RequestStreamCommandCore(p);
        return (p->cmd->result == CARD_RESULT_SUCCESS);
    }
}

u32 CARD_GetBackupSectorSize(void)
{
    return cardi_common.cmd->spec.sect_size;
}

BOOL CARD_IdentifyBackup(CARDBackupType type)
{
    CARDiCommon *const p = &cardi_common;

    OSi_ReferSymbol((void *)_version_NINTENDO_BACKUP);
    if (type == CARD_BACKUP_TYPE_NOT_USE)
    {
        OS_Terminate();
    }

    CARD_CheckEnabled();

    CARDi_WaitTask(p, NULL, NULL);
    CARDi_IdentifyBackupCore(type);
    cardi_common.cur_th = OS_GetCurrentThread();
    (void)CARDi_Request(p, CARD_REQ_IDENTIFY, 1);

    p->cmd->src = 0;
    p->cmd->dest = (u32)p->backup_cache_page_buf;
    p->cmd->len = 1;
    (void)CARDi_Request(p, CARD_REQ_READ_BACKUP, 1);
    CARDi_EndTask(p, TRUE);
    return (p->cmd->result == CARD_RESULT_SUCCESS);
}

BOOL CARD_WaitBackupAsync(void)
{
    return CARDi_WaitAsync();
}

BOOL CARD_TryWaitBackupAsync(void)
{
    return CARDi_TryWaitAsync();
}

void CARD_CancelBackupAsync(void)
{
    OSIntrMode bak_cpsr = OS_DisableInterrupts();
    cardi_common.flag |= CARD_STAT_CANCEL;
    (void)OS_RestoreInterrupts(bak_cpsr);
}
