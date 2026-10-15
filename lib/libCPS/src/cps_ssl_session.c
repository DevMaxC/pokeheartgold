#include <string.h>

#include "cps/cps_ssl_internal.h"

// SSL session cache: 4 sessions, looked up by id (server) or by server address (client); the least
// recently used one is replaced.

#pragma force_active on

// server: resume the session the client hello named, if it is cached
void find_session_from_id(CpsSsl *ssl) {
    int i;
    OSIntrMode enabled;
    CpsSslSession *session;
    enabled = OS_DisableInterrupts();
    i = 0;
    session = gCpsSslSessionCache;
    ssl->hasSession = 0;
    for (; i < 4; i++, session++) {
        if (session->valid && session->address == 0 && session->port == 0 && memcmp(session->id, ssl->sessionId, 32) == 0) {
            MI_CpuCopy8(session->masterSecret, ssl, 48);
            ssl->hasSession = 1;
            break;
        }
    }
    OS_RestoreInterrupts(enabled);
}

// client: offer the session cached for this server, if any
void find_session_from_IP(CpsSsl *ssl, u32 address, int port) {
    OSIntrMode enabled = OS_DisableInterrupts();
    int i;
    CpsSslSession *session = gCpsSslSessionCache;
    ssl->hasSession = 0;
    for (i = 0; i < 4; i++, session++) {
        if (session->valid && session->address == address && session->port == port) {
            MI_CpuCopy8(session, ssl->sessionId, 32);
            MI_CpuCopy8(session->masterSecret, ssl, 48);
            session->tick = OS_GetTick() >> 16;
            ssl->hasSession = 1;
            break;
        }
    }
    OS_RestoreInterrupts(enabled);
}

void cache_session(CpsSsl *ssl, u32 address, u16 port) {
    CpsSslSession *chosen;
    int i;
    u32 age;
    CpsSslSession *session;
    OSIntrMode enabled;
    u32 tick;
    enabled = OS_DisableInterrupts();
    {
        u64 now = OS_GetTick();
        chosen = gCpsSslSessionCache;
        tick = (u32)(now >> 16);
        age = 0;
        i = age;
        session = chosen;
        for (; i < 4; i++, session++) {
            if (session->valid && address && address == session->address && port && port == session->port) {
                chosen = session;
                break;
            }
            // else the free slot, or the oldest one
            if (age != 0xFFFFFFFF) {
                if (!session->valid) {
                    age = 0xFFFFFFFF;
                    chosen = session;
                } else if (tick - session->tick > age) {
                    age = tick - session->tick;
                    chosen = session;
                }
            }
        }
        MI_CpuCopy8(ssl->sessionId, chosen, 32);
        MI_CpuCopy8(ssl, chosen->masterSecret, 48);
        chosen->tick = tick;
        chosen->valid = 1;
        chosen->address = address;
        chosen->port = port;
        OS_RestoreInterrupts(enabled);
    }
}

// drop the cached session the server did not resume
void purge_session(CpsSsl *ssl) {
    int i;
    OSIntrMode enabled;
    CpsSslSession *session;
    enabled = OS_DisableInterrupts();
    session = gCpsSslSessionCache;
    for (i = 0; i < 4; i++, session++) {
        if (session->valid && memcmp(session, ssl->sessionId, 32) == 0) {
            session->valid = 0;
            break;
        }
    }
    OS_RestoreInterrupts(enabled);
}
