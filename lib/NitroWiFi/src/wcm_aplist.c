#include "nitrowifi/wcm_internal.h"

// List of the access points found by scanning, in the caller's buffer (WcmConfig): a header and
// fixed entries, linked from the oldest to the newest.

#pragma force_active on

void WCM_ClearApList(void) {
    OSIntrMode enabled = OS_DisableInterrupts();
    WcmWork *work = WCMi_GetSystemWork();
    if (!work) {
        OS_RestoreInterrupts(enabled);
        return;
    }
    if (work->apList && (int)work->apListSize > 0) {
        MI_CpuFill8(work->apList, 0, work->apListSize);
    }
    OS_RestoreInterrupts(enabled);
}

int WCM_CountApList(void) {
    OSIntrMode enabled = OS_DisableInterrupts();
    WcmWork *work = WCMi_GetSystemWork();
    int count = 0;
    if (!work) {
        OS_RestoreInterrupts(enabled);
        return count;
    }
    if (work->apList && work->apListSize > sizeof(WcmApList)) {
        count = work->apList->count;
    }
    OS_RestoreInterrupts(enabled);
    return count;
}

// A locked list is not updated by scanning; returns the previous lock state.
int WCM_LockApList(int lock) {
    OSIntrMode enabled = OS_DisableInterrupts();
    WcmWork *work = WCMi_GetSystemWork();
    if (!work) {
        OS_RestoreInterrupts(enabled);
        return 0;
    }
    if (lock) {
        lock = work->apListLocked != 0;
        work->apListLocked = 1;
    } else {
        lock = work->apListLocked != 0;
        work->apListLocked = 0;
    }
    OS_RestoreInterrupts(enabled);
    return lock;
}

WcmBssDesc *WCM_PointApList(int index) {
    OSIntrMode enabled = OS_DisableInterrupts();
    WcmWork *work = WCMi_GetSystemWork();
    WcmApListEntry *entry;
    if (!work) {
        OS_RestoreInterrupts(enabled);
        return NULL;
    }
    entry = WcmSearchIndexedApList(index);
    if (!entry) {
        OS_RestoreInterrupts(enabled);
        return NULL;
    }
    OS_RestoreInterrupts(enabled);
    return &entry->bssDesc;
}

// Adds or refreshes a scanned access point (moved to the newest end).
void WCMi_EntryApList(WcmBssDesc *bssDesc, u16 linkLevel) {
    WcmWork *work = WCMi_GetSystemWork();
    WcmApListEntry *entry;
    if (!work) {
        return;
    }
    if (work->apListLocked || bssDesc->gameInfoLength) {
        return;
    }
    entry = WcmSearchApList(bssDesc->bssid);
    if (!entry) {
        entry = WcmAllocApList();
    }
    if (!entry && work->apListMode == 1) {
        entry = WcmGetOldestApList();
    }
    if (!entry) {
        return;
    }
    entry->linkLevel = linkLevel;
    MIi_CpuCopyFast((u32 *)bssDesc, (u32 *)&entry->bssDesc, sizeof(WcmBssDesc));
    WcmAppendApList(entry);
}

#pragma push
#pragma opt_strength_reduction off

// Takes a free entry (NULL if the list is full) and links it at the newest end.
WcmApListEntry *WcmAllocApList(void) {
    WcmWork *work = WCMi_GetSystemWork();
    WcmApList *list = work->apList;
    WcmApListEntry *entry = NULL;

    struct {
        WcmApListEntry *base;
        u32 count;
    } entries;

    u32 capacity;
    u32 index;
    if (!list) {
        return NULL;
    }
    if (work->apListSize <= sizeof(WcmApList)) {
        return NULL;
    }
    capacity = (work->apListSize - sizeof(WcmApList)) / sizeof(WcmApListEntry);
    if (!capacity) {
        return NULL;
    }
    if (capacity <= list->count) {
        return NULL;
    }
    entries.count = capacity;
    index = 0;
    if (index < entries.count) {
        entries.base = (WcmApListEntry *)((u8 *)list + sizeof(WcmApList));
        do {
            entry = entries.base + index;
            if (!entry->used) {
                break;
            }
        } while (++index < entries.count);
    }
    if (index >= entries.count) {
        return entry;
    }
    entry->used = 1;
    entry->index = list->count;
    entry->next = NULL;
    entry->prev = list->last;
    list->last = entry;
    if (entry->prev) {
        entry->prev->next = entry;
    } else {
        list->first = entry;
    }
    list->count++;
    return entry;
}

#pragma pop

WcmApListEntry *WcmGetOldestApList(void) {
    WcmWork *work = WCMi_GetSystemWork();
    WcmApList *list = work->apList;
    if (list && work->apListSize > sizeof(WcmApList)) {
        return list->first;
    }
    return NULL;
}

WcmApListEntry *WcmSearchApList(const u8 *bssid) {
    WcmWork *work = WCMi_GetSystemWork();
    WcmApListEntry *entry = NULL;
    WcmApList *list = work->apList;
    if (!bssid) {
        return entry;
    }
    if (list && work->apListSize > sizeof(WcmApList)) {
        entry = list->first;
        while (entry) {
            if (WCM_CompareBssID(entry->bssDesc.bssid, bssid)) {
                break;
            }
            entry = entry->next;
        }
    }
    return entry;
}

WcmApListEntry *WcmSearchIndexedApList(u32 index) {
    WcmWork *work = WCMi_GetSystemWork();
    WcmApListEntry *entry = NULL;
    WcmApList *list = work->apList;
    if (list && work->apListSize > sizeof(WcmApList)) {
        entry = list->first;
        if (!entry) {
            return entry;
        }
        do {
            if (entry->index == index) {
                break;
            }
            entry = entry->next;
        } while (entry);
    }
    return entry;
}

// Moves entry to the newest end of the list (appends it if it is not linked yet).
void WcmAppendApList(WcmApListEntry *entry) {
    WcmWork *work = WCMi_GetSystemWork();
    WcmApList *list = work->apList;
    WcmApListEntry *p;
    if (!entry || !list || work->apListSize <= sizeof(WcmApList)) {
        return;
    }
    p = list->first;
    while (p) {
        if (p == entry) {
            if (p->prev) {
                p->prev->next = p->next;
            } else {
                list->first = p->next;
            }
            if (p->next) {
                p->next->prev = p->prev;
            } else {
                list->last = p->prev;
            }
            break;
        }
        p = p->next;
    }
    entry->next = NULL;
    entry->prev = list->last;
    list->last = entry;
    if (entry->prev) {
        entry->prev->next = entry;
    } else {
        list->first = entry;
    }
    if (p) {
        return;
    }
    entry->index = list->count;
    list->count++;
}
