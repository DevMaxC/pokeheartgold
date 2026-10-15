#ifndef POKEHEARTGOLD_MATH_DGT_INTERNAL_H
#define POKEHEARTGOLD_MATH_DGT_INTERNAL_H
#include <nitro/types.h>
#include "dgt.h"
typedef struct DGTHash1Context MATHMD5Context; typedef struct DGTHash2Context MATHSHA1Context;
void DGT_Hash1Reset(struct DGTHash1Context *); void DGT_Hash1SetSource(struct DGTHash1Context *, u8 *, u32); void DGT_Hash1GetDigest_R(u8 *, struct DGTHash1Context *);
void DGT_Hash2Reset(struct DGTHash2Context *); void DGT_Hash2SetSource(struct DGTHash2Context *, u8 *, u32); void DGT_Hash2GetDigest(struct DGTHash2Context *, u8 *);
static inline void MATH_MD5Init(MATHMD5Context *c){DGT_Hash1Reset(c);} static inline void MATH_MD5Update(MATHMD5Context *c,const void *p,u32 n){DGT_Hash1SetSource(c,(u8 *)p,n);} static inline void MATH_MD5GetHash(MATHMD5Context *c,void *d){DGT_Hash1GetDigest_R((u8 *)d,c);}
static inline void MATH_SHA1Init(MATHSHA1Context *c){DGT_Hash2Reset(c);} static inline void MATH_SHA1Update(MATHSHA1Context *c,const void *p,u32 n){DGT_Hash2SetSource(c,(u8 *)p,n);} static inline void MATH_SHA1GetHash(MATHSHA1Context *c,void *d){DGT_Hash2GetDigest(c,(u8 *)d);}
void MATH_CalcMD5(void *,const void *,u32); void MATH_CalcSHA1(void *,const void *,u32);
#endif
