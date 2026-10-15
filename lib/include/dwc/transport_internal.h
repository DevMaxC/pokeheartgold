#ifndef POKEHEARTGOLD_LIB_INCLUDE_DWC_TRANSPORT_INTERNAL_H
#define POKEHEARTGOLD_LIB_INCLUDE_DWC_TRANSPORT_INTERNAL_H

// Data transport state of OVY_0 (lib/NitroDWC/src/transport.c), part of the main control block
// (dwc/dwc_main_internal.h).

// Per-aid channel, 0x30 bytes.
typedef struct TransportChannel {
    u8 *sendBuf;
    u8 *recvBuf;  // 0x04
    int size;     // 0x08, receive buffer size
    int sent;     // 0x0C
    int received; // 0x10
    int total;    // 0x14, bytes of the current reliable send
    int pending;  // 0x18
    u8 sending;   // 0x1C
    u8 receiving; // 0x1D, receive state
    u16 unk_1E;
    u16 unk_20;
    u16 unk_22;
    u64 tick;    // 0x24, last activity
    u32 timeout; // 0x2C, ms, 0 = none
} TransportChannel;

typedef struct Transport {
    TransportChannel channel[32];
    void (*sendCallback)(int size, int aid);                   // 0x600
    void (*recvCallback)(int aid, const void *data, int size); // 0x604
    void (*timeoutCallback)(int aid);                          // 0x608
    void (*pingCallback)(int size, int aid);                        // 0x60C
    u16 maxSize;                                               // 0x610, largest chunk
    u16 unk_612;
} Transport;

#endif // POKEHEARTGOLD_LIB_INCLUDE_DWC_TRANSPORT_INTERNAL_H
