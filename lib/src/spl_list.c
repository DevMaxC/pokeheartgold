#include "spl_internal.h"

// doubly linked emitter / particle lists

// MWCC 1.2 applies force_active as set at the end of the file and emits a file's functions in
// reverse order: the functions are defined last-to-first here (link order is bottom-up).
#pragma force_active on

void spl_push_front(SplList *list, SplNode *node) {
    if (list->p_begin == NULL) {
        list->p_begin = node;
        list->p_end = node;
        node->p_next = NULL;
        node->p_prev = node->p_next;
    } else {
        node->p_next = list->p_begin;
        node->p_prev = NULL;
        list->p_begin->p_prev = node;
        list->p_begin = node;
    }
    list->node_num++;
}

SplNode *spl_pop_front(SplList *list) {
    SplNode *ret = NULL;
    SplNode *node = list->p_begin;

    if (node != NULL) {
        ret = node;
        list->p_begin = node->p_next;
        if (list->p_begin != NULL) {
            node->p_next->p_prev = NULL;
        } else {
            list->p_begin = NULL;
            list->p_end = NULL;
        }
        list->node_num--;
    }
    return ret;
}

SplNode *spl_del(SplList *list, SplNode *node) {
    if (node->p_next == NULL) {
        if (list->p_begin == node) {
            list->p_begin = NULL;
            list->p_end = NULL;
        } else {
            node->p_prev->p_next = NULL;
            list->p_end = list->p_end->p_prev;
        }
    } else if (list->p_begin == node) {
        list->p_begin = node->p_next;
        list->p_begin->p_prev = NULL;
    } else {
        node->p_next->p_prev = node->p_prev;
        node->p_prev->p_next = node->p_next;
    }
    list->node_num--;
    return node;
}
