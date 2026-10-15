#include "CTRDG_flash_internal.h"
#include "MI_memory.h"
#include "OS_system.h"
#include "OS_terminate_proc.h"
#include "code32.h"

// CTRDG task thread: runs one asynchronous backup request at a time (CTRDGi_SetTask) and calls its
// callback with the result.

#pragma force_active on

void CTRDGi_InitTaskThread(void *thread) {
    OSIntrMode enabled = OS_DisableInterrupts();

    if (!gCtrdgTaskWork.thread) {
        CTRDGiTaskThread *taskThread = thread;
        gCtrdgTaskWork.thread = taskThread;
        CTRDGi_InitTaskInfo(&taskThread->info);
        CTRDGi_InitTaskInfo(&gCtrdgNextTask);
        taskThread->task = NULL;
        OS_CreateThread(&taskThread->thread, CTRDGi_TaskThread, taskThread, gCtrdgTaskStack + sizeof(gCtrdgTaskWork.stack), sizeof(gCtrdgTaskWork.stack), 20);
        OS_WakeupThreadDirect(&taskThread->thread);
    }
    OS_RestoreInterrupts(enabled);
}

BOOL CTRDGi_IsTaskAvailable(void) {
    return gCtrdgTaskWork.thread != NULL;
}

void CTRDGi_InitTaskInfo(CTRDGTaskInfo *info) {
    MI_CpuFill8(info, 0, sizeof(CTRDGTaskInfo));
}

void CTRDGi_TaskThread(void *arg) {
    CTRDGiTaskThread *taskThread = arg;
    CTRDGTaskInfo task;
    OSIntrMode enabled;

    for (;;) {
        MI_CpuFill8(&task, 0, sizeof(CTRDGTaskInfo));
        enabled = OS_DisableInterrupts();
        while (!taskThread->task) {
            OS_SleepThread(NULL);
        }
        task = *taskThread->task;
        OS_RestoreInterrupts(enabled);
        if (task.task) {
            task.result = task.task(&task);
        }
        enabled = OS_DisableInterrupts();
        gCtrdgTaskWork.nextTask.busy = FALSE;
        if (task.callback) {
            task.callback(&task);
        }
        if (!gCtrdgTaskWork.thread) {
            break;
        }
        taskThread->task = NULL;
        OS_RestoreInterrupts(enabled);
    }
    OS_ExitThread();
}

// Starts a request on the task thread (it must be idle). Passing the thread's own info ends the thread
// after the request.
#pragma push
#pragma opt_lifetimes off

void CTRDGi_SetTask(CTRDGTaskInfo *info, CTRDG_TASK_FUNC task, CTRDG_TASK_FUNC callback) {
    CTRDGiTaskThread *taskThread = gCtrdgTaskWork.thread;
    OSIntrMode enabled;

    if (!CTRDGi_IsTaskAvailable()) {
        OS_Terminate();
    }
    if (gCtrdgTaskWork.nextTask.busy) {
        OS_Terminate();
    }
    enabled = OS_DisableInterrupts();
    info->busy = TRUE;
    info->task = task;
    info->callback = callback;
    if (info == &taskThread->info) {
        gCtrdgTaskWork.thread = NULL;
    }
    gCtrdgNextTask = *info;
    taskThread->task = &gCtrdgNextTask;
    OS_WakeupThreadDirect(&taskThread->thread);
    OS_RestoreInterrupts(enabled);
}

#pragma pop
