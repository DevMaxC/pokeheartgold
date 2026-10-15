#ifndef POKEHEARTGOLD_CTRDG_INIT_H
#define POKEHEARTGOLD_CTRDG_INIT_H

#include "CTRDG_common.h"
#include "CTRDG_flash_internal.h"
#include "PXI_fifo.h"

// CTRDG start-up: module information from the cartridge header, the subprocessor handshake and the
// pulled-out notification. lib/NitroSDK/src/ctrdg/ctrdg_init.c, ctrdg_module_info.c.

// State of the start-up code (label gCtrdgInitWork).
typedef struct CTRDGiInitWork {
    BOOL unk_00;                     // 0x00: CTRDGi_InitModuleInfo's own static flag is placed here
    BOOL settingPhi;                 // 0x04: cleared when the subprocessor acknowledges the PHI setting
    BOOL initialized;                // 0x08: CTRDG_Init has run
    BOOL pulledOut;                  // 0x0C: the pulled-out notification has been handled
    u32 unk_10;                      // 0x10
    u32 unk_14;                      // 0x14
    BOOL (*pulledOutCallback)(void); // 0x18: returns TRUE to terminate at once
} CTRDGiInitWork;

extern CTRDGWork CTRDGi_Work; // CTRDG_common.c
extern CTRDGiInitWork gCtrdgInitWork;
extern CTRDGHeader gCtrdgHeader; // copy of the cartridge header sent to the subprocessor
extern u8 gCtrdgHeaderLogo[];    // label of gCtrdgHeader.nintendoLogo
extern CTRDGiTaskThread gCtrdgTaskThread;

void CTRDG_Init(void);
void CTRDGi_InitModuleInfo(void);
void CTRDGi_CallbackForInitModuleInfo(PXIFifoTag tag, u32 data, BOOL err);
void CTRDGi_PulledOutCallback(PXIFifoTag tag, u32 data, BOOL err);
void CTRDG_TerminateForPulledOut(void);
void CTRDGi_CallbackForSetPhi(PXIFifoTag tag, u32 data, BOOL err);

#endif // POKEHEARTGOLD_CTRDG_INIT_H
