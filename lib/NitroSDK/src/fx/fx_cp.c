#include <nitro.h>
#include <nitro/code32.h>

fx64c FX_InvFx64c(fx32 x);
fx32 FX_Sqrt(fx32 x);
fx32 FX_DivS32(fx32 numerator, fx32 denominator);
fx64c FX_GetDivResultFx64c(void);
fx32 FX_GetDivResult(void);
fx32 FX_GetSqrtResult(void);
void FX_InvAsync(fx32 x);
void FX_DivAsync(fx32 numerator, fx32 denominator);

fx32 FX_Div(fx32 numerator, fx32 denominator) {
    FX_DivAsync(numerator, denominator);
    return FX_GetDivResult();
}

fx32 FX_Inv(fx32 x) {
    FX_InvAsync(x);
    return FX_GetDivResult();
}

fx64c FX_InvFx64c(fx32 x) {
    FX_InvAsync(x);
    while (reg_CP_DIVCNT & REG_CP_DIVCNT_BUSY_MASK) {}
    return *(fx64c *)REG_DIV_RESULT_ADDR;
}

fx32 FX_Sqrt(fx32 x) {
    if (x > 0) {
        reg_CP_SQRTCNT = 0x1;
        reg_CP_SQRT_PARAM = (u64)((fx64)x << 32);
        return FX_GetSqrtResult();
    } else {
        return 0;
    }
}

fx64c FX_GetDivResultFx64c() {
    while (reg_CP_DIVCNT & REG_CP_DIVCNT_BUSY_MASK) {}
    return *(fx64c *)REG_DIV_RESULT_ADDR;
}

fx32 FX_GetDivResult() {
    while (reg_CP_DIVCNT & REG_CP_DIVCNT_BUSY_MASK) {}
    return (fx32)((reg_CP_DIV_RESULT + (1 << (0x14 - 1))) >> 0x14);
}

void FX_InvAsync(fx32 x) {
    reg_CP_DIVCNT = 0x1;
    reg_CP_DIV_NUMER = (fx64)0x00001000 << 32;
    reg_CP_DIV_DENOM = (u32)x;
}

fx32 FX_GetSqrtResult() {
    while (reg_CP_SQRTCNT & REG_CP_SQRTCNT_BUSY_MASK) {}
    return (fx32)((reg_CP_SQRT_RESULT + (1 << (0xA - 1))) >> 0xA);
}

void FX_DivAsync(fx32 numerator, fx32 denominator) {
    reg_CP_DIVCNT = 0x1;
    reg_CP_DIV_NUMER = (u64)((fx64)numerator << 32);
    reg_CP_DIV_DENOM = (u32)denominator;
}

fx32 FX_DivS32(fx32 numerator, fx32 denominator) {
    reg_CP_DIVCNT = 0x0;
    *(REGType32v *)&reg_CP_DIV_NUMER = (u32)numerator; // 32bit write for some reason
    reg_CP_DIV_DENOM = (u32)denominator;
    while (reg_CP_DIVCNT & REG_CP_DIVCNT_BUSY_MASK) {}
    return (fx32)(*(REGType32v *)&reg_CP_DIV_RESULT);
}

fx32 FX_ModS32(fx32 num, fx32 mod) {
    reg_CP_DIVCNT = 0x0;
    *(REGType32v *)&reg_CP_DIV_NUMER = (u32)num; // 32bit write for some reason
    reg_CP_DIV_DENOM = (u32)mod;
    while (reg_CP_DIVCNT & REG_CP_DIVCNT_BUSY_MASK) {}
    return (fx32)(*(REGType32v *)&reg_CP_DIVREM_RESULT);
}
