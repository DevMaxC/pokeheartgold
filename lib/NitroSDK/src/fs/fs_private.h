#ifndef FS_PRIVATE_H
#define FS_PRIVATE_H
#include <nitro.h>
#undef OS_Warning
#undef OS_TWarning
#undef OS_TPanic
#define OS_Warning(...) ((void)0)
#define OS_TWarning(...) ((void)0)
#define OS_TPanic(...) OS_Terminate()
#define ALIGN_BYTE(n,a) (((u32)(n)+((a)-1)) & ~((a)-1))
#define BIT_MASK(a) ((u32)((1 << (a)) - 1))
static inline u8 MI_ReadByte(const void *p) { return *(u8 *)p; }
static inline void MI_WriteByte(void *p, u8 v) { *(u8 *)p=v; }
typedef void (*MWI_DESTRUCTOR_FUNC)(void *); typedef struct MWiDestructorChain { struct MWiDestructorChain *next; MWI_DESTRUCTOR_FUNC dtor; void *obj; } MWiDestructorChain; extern MWiDestructorChain *__global_destructor_chain;
void DGT_Hash2CalcHmac(void *, const void *, u32, const void *, u32); void MIi_UncompressBackward(void *);
extern FSResult (*const fsi_default_command[])(FSFile *);
extern FSArchive fsi_arc_rom; extern s32 fsi_card_lock_id; extern CARDRomRegion fsi_ovt7, fsi_ovt9;
void FSi_InitRom(u32); FSResult FSi_EmptyArchiveProc(FSFile *, FSCommandType); FSResult FSi_ReadDummyCallback(FSArchive *, void *, u32, u32); FSResult FSi_WriteDummyCallback(FSArchive *, const void *, u32, u32); FSResult FSi_RomArchiveProc(FSFile *, FSCommandType); void FSi_OnRomReadDone(void *); FSResult FSi_ReadRomCallback(FSArchive *, void *, u32, u32);
BOOL FSi_FindPath(FSFile *, const char *, FSFileID *, FSDirPos *);
void FSi_ReleaseCommand(FSFile *, FSResult);
FSResult FSi_TranslateCommand(FSFile *, FSCommandType);
typedef struct { FSArchive *arc; u32 pos; } FSiSyncReadParam;
u32 FSi_StrNICmp(const char *, const char *, u32);
FSResult FSi_ReadTable(FSiSyncReadParam *, void *, u32);
FSResult FSi_SeekDirDirect(FSFile *, u32);
FSResult FSi_ReadFileCommand(FSFile *); FSResult FSi_WriteFileCommand(FSFile *);
FSResult FSi_SeekDirCommand(FSFile *); FSResult FSi_ReadDirCommand(FSFile *);
FSResult FSi_FindPathCommand(FSFile *); FSResult FSi_GetPathCommand(FSFile *);
FSResult FSi_OpenFileFastCommand(FSFile *); FSResult FSi_OpenFileDirectCommand(FSFile *);
FSResult FSi_CloseFileCommand(FSFile *);
static inline BOOL FSi_IsSlash(u32 c) { return c == '/' || c == '\\'; }
static inline void FSi_CutFromListCore(FSFileLink *trg) { FSFile *pr=trg->prev,*nx=trg->next; if(pr)pr->link.next=nx;if(nx)nx->link.prev=pr; }
static inline void FSi_CutFromList(FSFile *e) { FSi_CutFromListCore(&e->link);e->link.next=e->link.prev=NULL; }
static inline void FSi_AppendToList(FSFile *e, FSFile *l) { FSi_CutFromListCore(&e->link);while(l->link.next)l=l->link.next;l->link.next=e;e->link.prev=l;e->link.next=NULL; }
#endif
