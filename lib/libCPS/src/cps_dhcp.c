#include "cps/cps_sock_internal.h"

// DHCP client, run by the scavenger on its own socket (gCpsDhcpSocket): DISCOVER / OFFER, REQUEST /
// ACK, renewal and RELEASE. The messages are built in gCpsDhcpPacket (the DHCP socket's send buffer
// after the link, IP and UDP headers).

#pragma force_active on

#define SWAP(x) ((u16)(((x) >> 8) | ((x) << 8)))

// BOOTP header + magic cookie + options 53 (message type), 61 (client id), 12 (host name),
// 55 (parameter request list: netmask, router, DNS); returns the end. *xid: the transaction id.
u8 *dhcp_setcommon(u8 *packet, int type, u32 *xid) {
    u32 id;
    MI_CpuFill8(packet, 0, 236);
    *(u16 *)(packet + 0) = 0x101; // BOOTREQUEST, Ethernet
    packet[2] = 6;
    gCpsState.random = gCpsState.randomMul * gCpsState.random + gCpsState.randomAdd;
    id = gCpsState.random >> 32;
    if (xid) {
        *xid = id;
    }
    *(u16 *)(packet + 4) = SWAP((u16)(id >> 16));
    *(u16 *)(packet + 6) = SWAP((u16)id);
    *(u16 *)(packet + 12) = SWAP((u16)(gCpsState.hostIp >> 16)); // ciaddr
    *(u16 *)(packet + 14) = SWAP((u16)gCpsState.hostIp);
    MI_CpuCopy8(gCpsMacAddress, packet + 28, 6);
    *(u16 *)(packet + 236) = 0x8263; // 99 130 83 99
    *(u16 *)(packet + 238) = 0x6353;
    *(u16 *)(packet + 240) = 0x135;
    packet[242] = type;
    packet[243] = 61;
    packet[244] = 7;
    packet[245] = 1;
    MI_CpuCopy8(gCpsMacAddress, packet + 246, 6);
    packet[252] = 12;
    packet[253] = 10;
    MI_CpuCopy8(gCpsDhcpHostName, packet + 254, 10);
    packet[264] = 55;
    packet[265] = 3;
    packet[266] = 1;
    packet[267] = 3;
    packet[268] = 6;
    return packet + 269;
}

// fills with value up to size bytes (length: bytes so far)
u8 *pad_mem(u8 value, u32 size, u8 *p, u32 length) {
    if (length < size) {
        int count = size - length;
        MI_CpuFill8(p, value, count);
        p += count;
    }
    return p;
}

// returns the transaction id
int dhcp_send_discover(void) {
    int xid;
    u8 *packet = gCpsDhcpPacket;
    u8 *p = dhcp_setcommon(packet, 1, (u32 *)&xid);
    if (gCpsState.requestedIp) {
        // option 50: the address we would like (CpsConfig.dhcpRequestIp)
        p[0] = 50;
        p[1] = 4;
        p[2] = (int)(u16)(gCpsState.requestedIp >> 16) >> 8;
        p[3] = gCpsState.requestedIp >> 16;
        p[4] = (int)(u16)gCpsState.requestedIp >> 8;
        p[5] = gCpsState.requestedIp;
        p += 6;
    }
    *p++ = 255;
    p = pad_mem(0, 300, p, p - packet);
    CPS_SocWrite(packet, p - packet);
    return xid;
}

// renew: without the address / server options (sent to the server itself)
int dhcp_send_request(int renew) {
    int xid;
    u8 *packet = gCpsDhcpPacket;
    u8 *p = dhcp_setcommon(packet, 3, (u32 *)&xid);
    if (!renew) {
        p[0] = 50; // requested address
        p[1] = 4;
        p[2] = (int)(u16)(gCpsState.requestedIp >> 16) >> 8;
        p[3] = gCpsState.requestedIp >> 16;
        p[4] = (int)(u16)gCpsState.requestedIp >> 8;
        p[5] = gCpsState.requestedIp;
        p[6] = 54; // server identifier
        p[7] = 4;
        p[8] = (int)(u16)(gCpsState.dhcpServer >> 16) >> 8;
        p[9] = gCpsState.dhcpServer >> 16;
        p[10] = (int)(u16)gCpsState.dhcpServer >> 8;
        p[11] = gCpsState.dhcpServer;
        p += 12;
    }
    *p++ = 255;
    p = pad_mem(0, 300, p, p - packet);
    CPS_SocWrite(packet, p - packet);
    return xid;
}

#define READ(p) (((u32)(u16)(((p)[0] << 8) | (p)[1]) << 16) | (u16)(((p)[2] << 8) | (p)[3]))

// Waits (1 s per attempt) for the reply to transaction xid and takes its options. Returns 1 OFFER,
// 2 ACK, 3 other reply, 0 none.
int dhcp_analyze_response(u32 xid, int attempt) {
    u32 length;
    int timeout = (attempt + 1) * 15;
    u32 start = OS_GetTick() >> 16;
    {
        int result = 0;
        while (gCpsState.linkIsOn() && !result && (int)((u32)(OS_GetTick() >> 16) - start) < timeout) {
            u8 *p, *end, *option;
            u32 address;
            if (!CPS_SocGetLength()) {
                OS_YieldThread__();
                continue;
            }
            p = CPS_SocRead(&length);
            if (length <= 240 || p[0] != 2) { // BOOTREPLY
                goto consume;
            }
            if ((((u32)SWAP(*(u16 *)(p + 4)) << 16) | SWAP(*(u16 *)(p + 6))) != xid) {
                goto consume;
            }
            if (maccmp((u16 *)(p + 28), (u16 *)gCpsMacAddress)) {
                goto consume;
            }
            address = READ(p + 16); // yiaddr
            result = 3;
            end = p + length;
            if (p[236] != 99 || p[237] != 130 || p[238] != 83 || (option = p + 240, p[239] != 99)) {
                goto consume;
            }
            {
                int code;
                int ack = 2, offer = 1;
                goto next_option;
option_body:
                if (code == 0) { // pad
                    goto next_option;
                }
                switch (code) {
                case 1:
                    gCpsState.netmask = READ(option + 1);
                    break;
                case 3:
                    gCpsState.gateway = READ(option + 1);
                    break;
                case 6:
                    if (option[0] < 8) {
                        gCpsState.dns[1] = 0;
                    } else {
                        gCpsState.dns[1] = READ(option + 5);
                    }
                    gCpsState.dns[0] = READ(option + 1);
                    break;
                case 51:
                    gCpsState.leaseTime = READ(option + 1);
                    break;
                case 53:
                    switch (option[1]) {
                    case 2:
                        result = offer;
                        gCpsState.requestedIp = address;
                        break;
                    case 5:
                        result = ack;
                        gCpsState.hostIp = address;
                        break;
                    }
                    break;
                case 54:
                    gCpsState.dhcpServer = READ(option + 1);
                    break;
                }
                option += option[0] + 1;
next_option:
                if (option < end) {
                    code = *option++;
                    if (code != 255) {
                        goto option_body;
                    }
                }
            }
consume:
            CPS_SocConsume(length);
        }
        return result;
    }
}

// broadcasts DISCOVER up to 4 times; TRUE: got an OFFER
int dhcp_discover_server(void) {
    int result, i;
    CPS_SocUse();
    CPS_SocDatagramMode();
    CPS_SocBind(68, 67, -1);
    i = 0;
    do {
        result = dhcp_analyze_response(dhcp_send_discover(), i);
        if (result == 1) {
            break;
        }
        i++;
    } while (i < 4);
    CPS_SocRelease();
    return result == 1;
}

// mode 0: request the offered address, 1: renew with the server, 2: rebind (broadcast). *timer: seconds
// until the next renewal (half the lease) or retry. TRUE: ACK.
int dhcp_request_server(int *timer, int mode) {
    int result, i;
    u32 retry;
    CPS_SocUse();
    CPS_SocDatagramMode();
    if (mode == 1) {
        CPS_SocBind(68, 67, gCpsState.dhcpServer);
    } else {
        CPS_SocBind(68, 67, -1);
    }
    for (i = 0; i < 4; i++) {
        result = dhcp_analyze_response(dhcp_send_request(mode), i);
        if (result) {
            break;
        }
    }
    CPS_SocRelease();
    if (result == 2) {
        *timer = gCpsState.leaseTime >> 1;
        gCpsState.dhcpRetry = (gCpsState.leaseTime * 3) >> 3;
        return TRUE;
    }
    retry = gCpsState.dhcpRetry >> 1;
    gCpsState.dhcpRetry = retry;
    *timer = retry;
    switch (mode) {
    case 1:
        if (retry < 60) {
            *timer = 1;
            gCpsState.dhcpRetry = gCpsState.leaseTime >> 3;
        }
        break;
    case 2:
        if (retry < 60) {
            *timer = 1;
        }
        break;
    }
    return FALSE;
}

void dhcp_release_server(void) {
    u32 packet;
    u8 *p;
    CPS_SocUse();
    CPS_SocDatagramMode();
    CPS_SocBind(68, 67, gCpsState.dhcpServer);
    packet = (u32)gCpsDhcpPacket;
    p = dhcp_setcommon((u8 *)packet, 7, NULL);
    *p++ = 0xFF;
    p = pad_mem(0, 300, p, (u32)p - packet);
    CPS_SocWrite((u8 *)packet, (u32)p - packet);
    CPS_SocRelease();
}
