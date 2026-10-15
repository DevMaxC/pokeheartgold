#include "cps/cps_ssl_internal.h"

// SSL random bytes: a 20-byte pool, stirred with SHA-1 (seeded with CPS_SslAddRandomSeed, else once
// from the stack's linear congruential generator).

#pragma force_active on

// count random nonzero bytes (as PKCS #1 padding needs)
void set_random(u8 *out, int count) {
    CpsSha1Context sha1;
    u8 digest[20];
    u32 seed;
    int written, index;
    if (!gCpsSslRandomState.seeded) {
        gCpsRandom.state = gCpsRandom.mul * gCpsRandom.state + gCpsRandom.add;
        seed = gCpsRandom.state >> 32;
        CPS_SslAddRandomSeed(&seed, 4);
    }
    for (written = 0, index = 20; written < count; index++) {
        if (index == 20) {
            // next digest; the pool (big endian) += digest + 1
            OSIntrMode enabled;
            int i;
            u32 carry;
            CPSi_sha1_init(&sha1);
            enabled = OS_DisableInterrupts();
            CPSi_sha1_calc(&sha1, gCpsSslRandomPool, 20);
            CPSi_sha1_result_prng(&sha1, digest);
            carry = 1;
            {
                u8 *pool = gCpsSslRandomPoolLast, *d;
                u32 sum = 0;
                i = 19;
                d = digest + 19;
                do {
                    sum = *pool + *d-- + carry;
                    *pool-- = sum;
                    carry = sum >> 8;
                } while (--i >= 0);
                seed = sum;
            }
            OS_RestoreInterrupts(enabled);
            index = 0;
        }
        if (digest[index]) {
            out[written++] = digest[index];
        }
    }
}

void CPS_SslAddRandomSeed(const void *seed, int length) {
    CpsSha1Context sha1;
    OSIntrMode enabled;
    CPSi_sha1_init(&sha1);
    enabled = OS_DisableInterrupts();
    CPSi_sha1_calc(&sha1, gCpsSslRandomPool, 20);
    CPSi_sha1_calc(&sha1, seed, length);
    CPSi_sha1_result(&sha1, gCpsSslRandomPool);
    OS_RestoreInterrupts(enabled);
    gCpsSslRandomState.seeded = 1;
}
