#ifndef DWC_TREE_ITERATOR4_H
#define DWC_TREE_ITERATOR4_H
typedef struct Iterator {
    void *current;
#ifdef __cplusplus
    void Advance();
#endif
} Iterator;
typedef char DwcTreeIteratorSize4[sizeof(Iterator)==4?1:-1];
#ifndef __cplusplus
void ov45_02236E58(Iterator *);
#endif
#endif
