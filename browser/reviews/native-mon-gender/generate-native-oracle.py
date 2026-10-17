"""Compile the literal native gender function/header into an offline fixture.

Node tests consume the committed fixture and verify its native source hashes;
they do not require a compiler. Run this script to regenerate the oracle.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
source = (ROOT / 'src/pokemon.c').read_text()
signature = 'u8 GetGenderBySpeciesAndPersonality_PreloadedPersonal(const BASE_STATS *personal, u16 species, u32 pid) {'
start = source.index(signature)
brace = source.index('{', start)
depth, end = 1, brace + 1
while depth:
    depth += (source[end] == '{') - (source[end] == '}')
    end += 1
function = source[start:end]
trainer_source = (ROOT / 'src/trainer_data.c').read_text()
trainer_start = trainer_source.index('void TrMon_OverridePidGender(int species, int form, int overrideParam, u32 *pid) {')
trainer_brace = trainer_source.index('{', trainer_start)
depth, trainer_end = 1, trainer_brace + 1
while depth:
    depth += (trainer_source[trainer_end] == '{') - (trainer_source[trainer_end] == '}')
    trainer_end += 1
trainer_function = trainer_source[trainer_start:trainer_end]
personal = json.loads((ROOT / 'files/poketool/personal/personal.json').read_text())['baseStats']
ratios = sorted({row['genderRatio'] for row in personal})
harness = r'''#include <stdint.h>
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
__FUNCTION__
static u8 currentRatio;
static int GetMonBaseStat_HandleAlternateForm(int species, int form, int attribute) {
    (void)species; (void)form; (void)attribute;
    return currentRatio;
}
__TRAINER_FUNCTION__
int main(void) {
    const double ratios[] = {__RATIOS__};
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
'''.replace('__FUNCTION__', function).replace('__TRAINER_FUNCTION__', trainer_function).replace('__RATIOS__', ','.join(map(str, ratios)))
(HERE / 'native-oracle.c').write_text(harness)
with tempfile.TemporaryDirectory(prefix='hg-native-gender-oracle-') as directory:
    binary = Path(directory) / 'native-gender'
    command = ['cc', '-std=c99', '-Wall', '-Wextra', '-Werror', '-Wno-unused-parameter', '-I', str(ROOT / 'include'), str(HERE / 'native-oracle.c'), '-o', str(binary)]
    subprocess.run(command, check=True)
    rows = json.loads(subprocess.check_output([str(binary)], text=True))
paths = ['src/pokemon.c', 'src/trainer_data.c', 'include/constants/pokemon.h', 'files/poketool/personal/personal.json', 'files/poketool/personal/personal.json.txt']
result = {'sourceFunction':'GetGenderBySpeciesAndPersonality_PreloadedPersonal', 'compiler':subprocess.check_output(['cc', '--version'], text=True).splitlines()[0], 'sources':[{'path':path, 'sha256':hashlib.sha256((ROOT/path).read_bytes()).hexdigest()} for path in paths], 'genderCodes':{'male':0,'female':1,'genderless':2}, 'rows':rows}
(HERE / 'native-oracle.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'ratios':ratios, 'nativePidCases':len(rows)*256, 'fixture':'native-oracle.json'}))
