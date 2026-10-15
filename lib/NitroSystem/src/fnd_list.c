#include <nitro.h>
#include <nnsys/fnd_internal.h>

#define GetLink(list, object) ((NNSFndLink *)((u8 *)(object) + (list)->offset))

void NNS_FndInitList(NNSFndList *list, u16 offset) {
    list->headObject = NULL;
    list->tailObject = NULL;
    list->numObjects = 0;
    list->offset = offset;
}

void SetFirstObject(NNSFndList *list, void *object) {
    NNSFndLink *link = GetLink(list, object);
    link->nextObject = NULL;
    link->prevObject = NULL;
    list->headObject = object;
    list->tailObject = object;
    list->numObjects++;
}

void NNS_FndAppendListObject(NNSFndList *list, void *object) {
    NNSFndLink *link;
    if (!list->headObject) {
        SetFirstObject(list, object);
        return;
    }
    link = GetLink(list, object);
    link->prevObject = list->tailObject;
    link->nextObject = NULL;
    GetLink(list, list->tailObject)->nextObject = object;
    list->tailObject = object;
    list->numObjects++;
}

void NNS_FndPrependListObject(NNSFndList *list, void *object) {
    NNSFndLink *link;
    if (!list->headObject) {
        SetFirstObject(list, object);
        return;
    }
    link = GetLink(list, object);
    link->prevObject = NULL;
    link->nextObject = list->headObject;
    GetLink(list, list->headObject)->prevObject = object;
    list->headObject = object;
    list->numObjects++;
}

#pragma force_active on

void NNS_FndInsertListObject(NNSFndList *list, void *target, void *object) {
    if (target == NULL) {
        NNS_FndAppendListObject(list, object);
    } else if (target == list->headObject) {
        NNS_FndPrependListObject(list, object);
    } else {
        u32 offset = list->offset;
        NNSFndLink *targetLink = (NNSFndLink *)((u8 *)target + offset);
        NNSFndLink *objectLink = (NNSFndLink *)((u8 *)object + offset);
        void *prev = targetLink->prevObject;
        objectLink->prevObject = prev;
        objectLink->nextObject = target;
        ((NNSFndLink *)((u8 *)prev + offset))->nextObject = object;
        ((NNSFndLink *)((u8 *)target + list->offset))->prevObject = object;
        list->numObjects++;
    }
}

#pragma force_active reset

void NNS_FndRemoveListObject(NNSFndList *list, void *object) {
    NNSFndLink *link = GetLink(list, object);
    if (!link->prevObject) {
        list->headObject = link->nextObject;
    } else {
        GetLink(list, link->prevObject)->nextObject = link->nextObject;
    }
    if (!link->nextObject) {
        list->tailObject = link->prevObject;
    } else {
        GetLink(list, link->nextObject)->prevObject = link->prevObject;
    }
    link->prevObject = NULL;
    link->nextObject = NULL;
    list->numObjects--;
}

void *NNS_FndGetNextListObject(NNSFndList *list, void *object) {
    void *result;
    if (object == NULL) {
        result = list->headObject;
    } else {
        result = GetLink(list, object)->nextObject;
    }
    return result;
}

void *NNS_FndGetPrevListObject(NNSFndList *list, void *object) {
    void *result;
    if (object == NULL) {
        result = list->tailObject;
    } else {
        result = GetLink(list, object)->prevObject;
    }
    return result;
}
