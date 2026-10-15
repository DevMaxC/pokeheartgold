#ifndef NITRO_MB_MB_COMM_H_
#define NITRO_MB_MB_COMM_H_

// Multiboot parent: the per-child communication state (MB_CommGetParentState, the state callback set by
// MB_CommSetParentStateCallback) and the answers to a child's request (MB_CommResponseRequest).
// lib/NitroSDK/src/mb/mb_parent_*.c.

typedef enum {
    MB_COMM_PSTATE_NONE = 0,
    MB_COMM_PSTATE_INIT_COMPLETE = 1,
    MB_COMM_PSTATE_CONNECTED = 2,
    MB_COMM_PSTATE_DISCONNECTED = 3,
    MB_COMM_PSTATE_KICKED = 4,
    MB_COMM_PSTATE_REQ_ACCEPTED = 5,
    MB_COMM_PSTATE_SEND_PROCEED = 6,
    MB_COMM_PSTATE_SEND_COMPLETE = 7,
    MB_COMM_PSTATE_BOOT_REQUEST = 8,
    MB_COMM_PSTATE_BOOT_STARTABLE = 9,
    MB_COMM_PSTATE_REQUESTED = 10,
    MB_COMM_PSTATE_MEMBER_FULL = 11,
    MB_COMM_PSTATE_END = 12,
    MB_COMM_PSTATE_ERROR = 13,
    MB_COMM_PSTATE_WAIT_TO_SEND = 14
} MBCommPState;

typedef enum {
    MB_COMM_RESPONSE_REQUEST_KICK = 0,
    MB_COMM_RESPONSE_REQUEST_ACCEPT = 1,
    MB_COMM_RESPONSE_REQUEST_DOWNLOAD = 2,
    MB_COMM_RESPONSE_REQUEST_BOOT = 3
} MBCommResponseRequestType;

#endif // NITRO_MB_MB_COMM_H_
