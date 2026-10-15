#include "cps/cps_sock_internal.h"

// The scavenger thread: once a second it gets / renews the address (DHCP or the fixed one), expires
// ARP entries and IP fragments, times out connection set-ups, and runs the SSL session expiry.

#pragma force_active on

// The fixed address is announced (ARP for ourselves) and checked for conflicts for 1.5 s.
void set_fixed_ip(void) {
    int tick;
    gCpsState.addressCallback();
    if (!gCpsState.hostIp) {
        return;
    }
    send_arprequest(gCpsState.hostIp);
    OS_Sleep(100);
    send_arprequest(gCpsState.hostIp);
    tick = OS_GetTick() >> 16;
    while (gCpsState.linkIsOn() && ((int)(OS_GetTick() >> 16) - tick) < 23) {
        if (gCpsState.addressConflict) {
            reset_network_vars(CPS_STATUS_CONFLICT);
            return;
        }
        OS_Sleep(100);
    }
}

// DHCP progress of the scavenger
enum {
    DHCP_START,
    DHCP_BOUND,
    DHCP_REBINDING,
    DHCP_NONE, // fixed address after DHCP failed
};

// The DHCP socket is set up through gCpsState: ((u32 *)&gCpsState)[71..75] are its buffer fields.
void scavenger(void *arg) {
    int timer, arp, first, dhcp;
    int now;
    int i;
    gCpsState.calmDown = 0;
    MI_CpuFill8(&gCpsDhcpSocket, 0, sizeof(CpsSocket));
    ((u32 *)&gCpsState)[71] = 384;                     // gCpsDhcpSocket.recvBuf.size
    ((u32 *)&gCpsState)[72] = (u32)gCpsDhcpRecvBuffer; // gCpsDhcpSocket.recvBuf.data
    ((u32 *)&gCpsState)[74] = 384;                     // gCpsDhcpSocket.sendBuf.size
    ((u32 *)&gCpsState)[75] = (u32)gCpsDhcpSendBuffer; // gCpsDhcpSocket.sendBuf.data
    CPS_SocRegister(&gCpsDhcpSocket);
    arp = 1;
    first = TRUE;
    timer = 1;
    gCpsState.status = CPS_STATUS_NO_LINK;
    dhcp = DHCP_START;
    for (;;) {
        OS_Sleep(1000);
        if (gCpsState.calmDown) {
            break;
        }
        now = OS_GetTick() >> 16;
        if (gCpsState.linkIsOn()) {
            if (--timer == 0) {
                if (gCpsState.staticIp & 1) {
                    if (!dhcp) {
                        set_fixed_ip();
                        dhcp = DHCP_BOUND;
                    }
                } else {
                    switch (dhcp) {
                    case DHCP_START:
                        if (first) {
                            gCpsState.status = CPS_STATUS_DHCP;
                            first = FALSE;
                        }
                        if (!dhcp_discover_server() || !dhcp_request_server(&timer, 0)) {
                            set_fixed_ip();
                            dhcp = DHCP_NONE;
                        } else {
                            dhcp = DHCP_BOUND;
                        }
                        break;
                    case DHCP_BOUND: // renew with the server
                        if (!dhcp_request_server(&timer, 1)) {
                            if ((u32)timer < 60) {
                                dhcp = DHCP_REBINDING;
                            }
                        }
                        break;
                    case DHCP_REBINDING: // any server
                        if (dhcp_request_server(&timer, 2)) {
                            dhcp = DHCP_BOUND;
                        } else if ((u32)timer < 60) {
                            reset_network_vars(CPS_STATUS_LEASE_LOST);
                            arp = 1;
                            timer = 1;
                            dhcp = DHCP_START;
                        }
                        break;
                    case DHCP_NONE:
                        break;
                    }
                }
            }
        } else {
            reset_network_vars(CPS_STATUS_NO_LINK);
            arp = 1;
            timer = 1;
            dhcp = DHCP_START;
        }
        // ARP entries live 4 minutes
        for (i = 0; i < 8; i++) {
            if (gCpsArpCache[i].ip && ((s16)(now - gCpsArpCache[i].tick) > 957)) {
                gCpsArpCache[i].ip = 0;
            }
        }
        // keep the gateway's ARP entry (called without the address: send_arprequest gets whatever r0 holds)
        if (gCpsState.gateway && !--arp) {
            ((void (*)(void))send_arprequest)();
            arp = 105;
        }
        {
            OSThread *thread = OSi_ThreadInfo.list;
            for (; thread; thread = thread->next) {
                CpsSocket *socket = thread->specific[0];
                if (socket && socket->thread) {
                    if (socket->state == CPS_STATE_SYN_RCVD && now - socket->tick > 39) {
                        // half-open connection: listen again
                        socket->state = CPS_STATE_LISTEN;
                        socket->remotePort = socket->boundRemotePort;
                        socket->remoteIp = socket->boundRemoteIp;
                    } else if (socket->state == CPS_STATE_SYN_SENT && now - socket->tick > 39) {
                        if (socket->waiting == CPS_WAIT_CONNECT) {
                            socket->state = CPS_STATE_CLOSED;
                            socket->waiting = 0;
                            OS_WakeupThreadDirect(socket->thread);
                        }
                    } else if (socket->state != CPS_STATE_ESTABLISHED && socket->waiting == CPS_WAIT_DATA) {
                        socket->waiting = 0;
                        OS_WakeupThreadDirect(socket->thread);
                    }
                }
            }
        }
        // incomplete datagrams live 15 s
        for (i = 0; i < 8; i++) {
            if (gCpsFragments[i].count && now - gCpsFragments[i].tick > 239) {
                gCpsState.free(gCpsFragments[i].buffer);
                gCpsFragments[i].count = 0;
            }
        }
        CPSi_SslPeriodical(now);
        if (gCpsState.scavengerCallback) {
            gCpsState.scavengerCallback();
        }
    }
    if (!(gCpsState.staticIp & 1) && dhcp != DHCP_NONE) {
        dhcp_release_server();
    }
    CPS_SocUnRegister();
    (void)arg;
}
