#include <stdint.h>
#include <stdio.h>
typedef uint8_t u8;typedef uint32_t u32;
#define SHINY_CHECK(otid, pid) ((                                                                                                              \
                                    (((otid) & 0xFFFF0000u) >> 16u) ^ ((otid) & 0xFFFFu) ^ (((pid) & 0xFFFF0000u) >> 16u) ^ ((pid) & 0xFFFFu)) \
    < 8u)
u8 CalcShininessByOtIdAndPersonality(u32 otid, u32 pid) {
    return (u8)SHINY_CHECK(otid, pid);
}
int main(){u32 ot,pid;while(scanf("%u%u",&ot,&pid)==2)printf("%u\n",CalcShininessByOtIdAndPersonality(ot,pid));}
