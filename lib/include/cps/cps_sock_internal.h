#ifndef POKEHEARTGOLD_CPS_SOCK_INTERNAL_H
#define POKEHEARTGOLD_CPS_SOCK_INTERNAL_H

#include "cps/cps_internal.h"

// libCPS socket API internals, DHCP client and DNS resolver.

extern CpsSocket gCpsDhcpSocket;   // the scavenger's socket (DHCP)
extern u8 gCpsDhcpRecvBuffer[384]; // its receive buffer
extern u8 gCpsDhcpSendBuffer[384]; // its send buffer
extern u8 gCpsDhcpPacket[];        // = gCpsDhcpSendBuffer + 42: the DHCP message
extern char gCpsDhcpHostName[];    // "NintendoDS" (option 12)
extern u32 gCpsDnsServers[2];      // = gCpsState.dns

// cps_scavenger.c / cps_dhcp.c
void set_fixed_ip(void);
u8 *dhcp_setcommon(u8 *packet, int type, u32 *xid);
u8 *pad_mem(u8 value, u32 size, u8 *p, u32 length);
int dhcp_send_discover(void);
int dhcp_send_request(int renew);
int dhcp_analyze_response(u32 xid, int attempt);
int dhcp_discover_server(void);
int dhcp_request_server(int *timer, int mode);
void dhcp_release_server(void);

// cps_dns.c
u8 *dns_skipname(u8 *p);
int resolve_common(u8 *name, u32 type, int id, void *out, u32 outSize);
u32 strtol10(u8 *p, u8 **end);
int rawip(u8 *string, u32 *ip);
int resolve_sub(char *name, u32 server, int id);

#endif // POKEHEARTGOLD_CPS_SOCK_INTERNAL_H
