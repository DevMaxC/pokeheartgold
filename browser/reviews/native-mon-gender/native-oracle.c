#include <stdint.h>
#include <stdio.h>
typedef uint8_t u8;
typedef uint16_t u16;
typedef uint32_t u32;
#include "constants/pokemon.h"
typedef struct { u8 ratio; } BASE_STATS;
static int GetPersonalAttr(const BASE_STATS *personal, int attribute) {
    (void)attribute;
    return personal->ratio;
}
u8 GetGenderBySpeciesAndPersonality_PreloadedPersonal(const BASE_STATS *personal, u16 species, u32 pid) {
    int gender;
    u8 ratio = GetPersonalAttr(personal, BASE_GENDER_RATIO);
    switch (ratio) {
    case MON_RATIO_MALE:
        return MON_MALE;
    case MON_RATIO_FEMALE:
        return MON_FEMALE;
    case MON_RATIO_UNKNOWN:
        return MON_GENDERLESS;
    default:
        if (ratio > (u8)pid) {
            gender = MON_FEMALE;
        } else {
            gender = MON_MALE;
        }
        return gender;
    }
}
static u8 currentRatio;
static int GetMonBaseStat_HandleAlternateForm(int species, int form, int attribute) {
    (void)species; (void)form; (void)attribute;
    return currentRatio;
}
void TrMon_OverridePidGender(int species, int form, int overrideParam, u32 *pid) {
    int genderOverride = overrideParam & 0xF;
    int abilityOverride = (overrideParam & 0xF0) >> 4;
    if (overrideParam != 0) {
        if (genderOverride != 0) {
            *pid = GetMonBaseStat_HandleAlternateForm(species, form, BASE_GENDER_RATIO);
            if (genderOverride == 1) {
                *pid += 2;
            } else {
                *pid -= 2;
            }
        }
        if (abilityOverride == 1) {
            *pid &= ~1;
        } else if (abilityOverride == 2) {
            *pid |= 1;
        }
    }
}
int main(void) {
    const double ratios[] = {0.0,0.125,0.25,0.5,0.75,1.0,2.0};
    printf("[");
    for (unsigned i = 0; i < sizeof(ratios) / sizeof(ratios[0]); i++) {
        BASE_STATS personal = {GENDER_RATIO(ratios[i])};
        printf("%s{\"ratio\":%.8g,\"rawRatio\":%u,\"genders\":[", i ? "," : "", ratios[i], personal.ratio);
        for (unsigned low = 0; low < 256; low++) {
            printf("%s%u", low ? "," : "", GetGenderBySpeciesAndPersonality_PreloadedPersonal(&personal, 0, 0xa5c30000u | low));
        }
        printf("],\"overrides\":[");
        const u32 initials[] = {0x78, 0x79, 0x88, 0x89, 29, 28, 129};
        int first = 1;
        currentRatio = personal.ratio;
        for (unsigned j = 0; j < sizeof(initials) / sizeof(initials[0]); j++) {
            for (int ability = 0; ability < 3; ability++) {
                for (int gender = 0; gender < 3; gender++) {
                    u32 selector = initials[j];
                    int packed = gender | (ability << 4);
                    TrMon_OverridePidGender(0, 0, packed, &selector);
                    printf("%s{\"initial\":%u,\"packed\":%d,\"selector\":%u}", first ? "" : ",", initials[j], packed, selector);
                    first = 0;
                }
            }
        }
        printf("]}");
    }
    printf("]\n");
    return 0;
}
