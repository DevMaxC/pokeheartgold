#include <nitro/code32.h>
#include <nitro/gx/g3.h>
#include <nitro/types.h>

void G3_BeginMakeDL(GXDLInfo *displaylist, void *buffer, u32 length) {
    displaylist->length = length;
    displaylist->bottom = buffer;
    displaylist->curr_cmd = buffer;
    displaylist->curr_param = (u32 *)buffer + 1;
    displaylist->param0_cmd_flg = FALSE;
}

u32 G3_EndMakeDL(GXDLInfo *displaylist) {
    if (displaylist->bottom == (u32 *)displaylist->curr_cmd) {
        return 0;
    }
    switch ((u32)displaylist->curr_cmd & 3) {
    case 0:
        return displaylist->curr_cmd - (u8 *)displaylist->bottom;
    case 1:
        *displaylist->curr_cmd++ = 0;
    case 2:
        *displaylist->curr_cmd++ = 0;
    case 3:
        *displaylist->curr_cmd++ = 0;
    }
    if (displaylist->param0_cmd_flg) {
        *displaylist->curr_param++ = 0;
        displaylist->param0_cmd_flg = FALSE;
    }
    displaylist->curr_cmd = (u8 *)displaylist->curr_param;
    return displaylist->curr_cmd - (u8 *)displaylist->bottom;
}
