#include "cps/cps_internal.h"

#pragma force_active on

// Forgets the address and everything learned with it (ARP cache, fragments, SSL sessions); sockets
// lose their connections and sleeping owners are woken up.
#pragma push
#pragma opt_propagation off

void reset_network_vars(int value) {
    int hadAddress;
    OSThread *thread;
    int i;
    CpsFragment *fragment;
    {
        CpsState *state = &gCpsState;
        CpsState *state2;
        hadAddress = state->hostIp != 0;
        state2 = &gCpsState;
        state2->status = value;
        gCpsState.hostIp = 0;
        gCpsState.netmask = 0;
        gCpsState.gateway = 0;
        gCpsState.dns[0] = 0;
        gCpsState.dns[1] = 0;
        gCpsState.dhcpServer = 0;
    }
    if (!hadAddress) {
        return;
    }
    MI_CpuFill8(gCpsArpCache, 0, sizeof(gCpsArpCache));
    for (thread = OSi_ThreadInfo.list; thread; thread = thread->next) {
        CpsSocket *socket = CpsThread_GetSocket(thread);
        if (socket && socket->thread) {
            if (socket->state != CPS_STATE_DATAGRAM && socket->state != CPS_STATE_PING) {
                socket->state = CPS_STATE_CLOSED;
            }
            if (socket->waiting) {
                socket->waiting = 0;
                OS_WakeupThreadDirect(socket->thread);
            }
        }
    }
    i = 0;
    fragment = gCpsFragments;
    do {
        if (fragment->count) {
            gCpsState.free(fragment->buffer);
            fragment->count = 0;
        }
        i++;
        fragment++;
    } while (i < 8);
    CPSi_SslCleanup();
}

#pragma pop
