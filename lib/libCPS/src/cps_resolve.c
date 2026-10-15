#define CPS_STATE_BYTES
#include "cps/cps_sock_internal.h"

#pragma force_active on

// the generator step of get_seqno (gCpsState.random 0x68, randomMul 0x70, randomAdd 0x78)
#define STATE_U64(offset) (*(u64 *)(gCpsState + (offset)))

static inline u64 RandomValue(void) {
    STATE_U64(0x68) = STATE_U64(0x70) * STATE_U64(0x68) + STATE_U64(0x78);
    return STATE_U64(0x68) >> 32;
}

// 0: not found
u32 CPS_Resolve(char *name) {
    u32 result;
    u16 id[2];
    u8 live[2];
    int i, j;
    id[0] = (RandomValue() << 16) >> 32;
    id[1] = (RandomValue() << 16) >> 32;
    if (rawip((u8 *)name, &result)) {
        return result;
    }
    live[0] = TRUE;
    live[1] = TRUE;
    for (i = 0; i < 3; i++) {
        for (j = 0; j < 2; j++) {
            if (live[j]) {
                result = resolve_sub(name, gCpsDnsServers[j], id[j]);
                if (result && result != (u32)-1) {
                    goto done;
                }
                if (result == (u32)-1) {
                    live[j] = FALSE;
                }
            }
        }
    }
done:
    if (result == (u32)-1) {
        result = 0;
    }
    return result;
}
