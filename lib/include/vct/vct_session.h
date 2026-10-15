#ifndef POKEHEARTGOLD_VCT_VCT_SESSION_H
#define POKEHEARTGOLD_VCT_VCT_SESSION_H

// libVCT sessions and library state (also used by the game's voice chat).

#include <nitro.h>

typedef struct Session {
    u32 state;
    u8 aid;
    u8 other;
    u8 pad[2];
    u32 mask;
    u32 mode;
    u32 pad2;
    struct Session *next;
} Session;

typedef void (*VctCallback)(u32 aid, u32 event, Session *session, void *context);

typedef struct Vct {
    u8 aid;
    u8 peer;
    u8 pad[2];
    VctCallback callback;
    void *context;
    s32 state;
    s32 mode;
    s32 flag;
} Vct;

// session protocol state
typedef struct Ssp {
    u32 count;
    u32 mask;
    u64 tick;
    Session *free;
    Session *used;
    u64 (*clock)(void);
    u32 seed;
    u32 add;
} Ssp;

// gVctControl (0xC bytes) and __vct, which directly follows it in .bss
typedef struct Control {
    u32 frame;
    u32 received; // audio packets received
    u32 active;
    Vct vct;
} Control;

typedef struct InitArgs {
    Session *data;
    u32 count;
    s32 mode;
    u8 id;
    u8 pad[3];
    void *buffer; // 32-byte aligned
    u32 size;
    VctCallback callback;
    void *arg;
} InitArgs;

typedef struct SspBank {
    Ssp core;
    Session reject;
    Session server;
} SspBank;

// session protocol state; gVctRejectSession / gVctServerSession are separate labels of its sessions
extern SspBank gVctSsp;
extern Session gVctRejectSession; // = gVctSsp.reject: answers requests that get no session
extern Session gVctServerSession; // = gVctSsp.server: the session in transceiver mode
extern Vct __vct;
extern Control gVctControl;

s32 vct_init_ssp(InitArgs *args);
s32 VCT_Init(InitArgs *args);

#endif // POKEHEARTGOLD_VCT_VCT_SESSION_H
