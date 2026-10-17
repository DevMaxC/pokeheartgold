"""Export both original HGSS Pokédex weight banks and the battle weight table.

No public source JSON is rewritten. Run from any directory; --output supports
reproducibility checks without replacing the checked-in module.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[2]
PATHS = [
    'files/application/zukanlist/zkn_data/zukan_data.json',
    'files/application/zukanlist/zkn_data/zukan_data.json.txt',
    'files/application/zukanlist/zkn_data/zukan_data.mk',
    'files/poketool/personal/personal.json',
    'include/constants/species.h',
    'include/constants/pokemon.h',
    'src/dex_mon_measures.c',
    'src/battle/battle_util.c',
    'src/battle/battle_command.c',
    'include/battle/battle.h',
    'asm/overlay_12_battle_command.s',
    'include/filesystem_files_def.h',
    'filesystem.mk',
]

def require(condition, message):
    if not condition:
        raise ValueError(message)

def export():
    texts = {path: (ROOT / path).read_text(encoding='utf-8') for path in PATHS}
    stats = json.loads(texts[PATHS[0]])['mon_stats']
    personal = json.loads(texts[PATHS[3]])['baseStats']
    ids = {name: int(value) for name, value in re.findall(
        r'^#define\s+(SPECIES_\w+)\s+(\d+)\s*$', texts[PATHS[4]], re.M)}
    count = ids['SPECIES_ARCEUS']
    require(count == 493 and len(stats) == count + 1, 'Unexpected native species count')
    require('MAX_SPECIES        SPECIES_ARCEUS' in texts[PATHS[4]], 'Changed species limit')
    regular, gira, species = [], [], []
    for index, row in enumerate(stats):
        key, weight = row['species'], row['weight']
        require(ids[key] == index and key == 'SPECIES_' + personal[index]['species'],
                f'Native species/personal index mismatch at {index}')
        species.append(key)
        if type(weight) is int:
            values = [weight, weight]
        else:
            require(key == 'SPECIES_GIRATINA' and isinstance(weight, dict)
                    and set(weight) == {'altered', 'origin'}, 'Unknown form-dependent weight')
            values = [weight['altered'], weight['origin']]
        require(all(type(value) is int and 0 < value <= 0x7fffffff for value in values),
                f'Invalid native s32 weight at {index}')
        regular.append(values[0])
        gira.append(values[1])
    template = texts[PATHS[1]].split('mon_stats_weight:', 1)[1].split('.size mon_stats_weight', 1)[0]
    require(re.search(r'#ifdef GIRA\s+\.word {{ mon.weight.origin }}.*?#else\s+\.word {{ mon.weight.altered }}', template, re.S),
            'Changed original weight-bank template')
    make = texts[PATHS[2]]
    require('-DGIRA -DPM_ASM' in make and '$(O2NARC) $*_gira.o $*_gira.narc' in make,
            'Changed GIRA build selection')
    source = texts['src/dex_mon_measures.c']
    setter = source.split('void SetDexBanksByGiratinaForm(int form)', 1)[1].split('NarcId GetPokedexDataNarcID', 1)[0]
    require(re.search(r'if \(form == GIRATINA_ALTERED\).*?sDataNarcId = NARC_application_zukanlist_zkn_data_zukan_data_gira;.*?else.*?sDataNarcId = NARC_application_zukanlist_zkn_data_zukan_data;', setter, re.S),
            'Changed native battle weight-bank selection')
    form = int(re.search(r'GIRATINA_ALTERED\s*=\s*(\d+)', texts[PATHS[5]])[1])
    util = texts['src/battle/battle_util.c']
    require('SetDexBanksByGiratinaForm(ctx->battleMons[battlerId].form);' in util
            and 'ctx->battleMons[battlerId].weight = PokedexData_GetWeight(dexData, ctx->battleMons[battlerId].species);' in util,
            'Changed live BattleMon weight initialization')
    asm = texts['asm/overlay_12_battle_command.s'].split('sLowKickDamageTable:', 1)[1].split('.public', 1)[0]
    table = [[int(a, 0), int(b, 0)] for a, b in re.findall(r'\.short\s+(\w+),\s*(\w+)', asm)]
    require(table == [[100, 20], [250, 40], [500, 60], [1000, 80], [2000, 100], [65535, 65535]],
            'Changed native Low Kick table; review its command before exporting')
    command = texts['src/battle/battle_command.c'].split('BOOL BtlCmd_CalcWeightBasedPower(', 1)[1].split('BOOL BtlCmd_CalcWeatherBallParams(', 1)[0]
    require('sLowKickDamageTable[cnt][0] >= weight' in command, 'Changed inclusive threshold comparison')
    fallback = int(re.search(r'else\s*{\s*ctx->movePower = (\d+);', command)[1])
    require(fallback == 120, 'Changed native fallback power')
    filesystem = texts['include/filesystem_files_def.h']
    narc_ids = {key: int(value) for key, value in re.findall(r'^\s*(NARC_\w+)\s*=\s*(\d+),', filesystem, re.M)}
    file_list = re.findall(r'"([^"]+)"', filesystem.split('char *sNarcFileList[] = {', 1)[1].split('};', 1)[0])
    objects = re.findall(r'\.type\s+(\w+),\s*@object', texts[PATHS[1]])
    member = objects.index('mon_stats_weight')
    require(member == 1, 'Changed original weight object/member ordering')
    archives = {'member': member}
    for key, suffix in [('regular', ''), ('gira', '_gira')]:
        narc_id = narc_ids['NARC_application_zukanlist_zkn_data_zukan_data' + suffix]
        path = file_list[narc_id]
        rule = '$(eval $(call arc_strip_name,files/application/zukanlist/zkn_data/zukan_data' + suffix + '.narc,files/' + path + '))'
        require(rule in texts['filesystem.mk'], 'Changed original NARC-to-filesystem mapping')
        archives[key] = {'id': narc_id, 'path': path}
    return {
        'version': 1, 'unit': 'hectogram', 'maxSpecies': count, 'species': species,
        'regular': regular, 'gira': gira, 'giraSelectedForm': form, 'archives': archives,
        'lowKickTable': table, 'lowKickFallback': fallback,
        'sources': [{'path': path, 'sha256': hashlib.sha256((ROOT / path).read_bytes()).hexdigest()} for path in PATHS],
    }

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'browser/src/source/species-weights-data.ts')
    args = parser.parse_args()
    data = export()
    with args.output.open('w', encoding='utf-8', newline='\n') as output:
        output.write('// Generated by browser/scripts/export_species_weights.py. Do not edit.\n'
                     '// Original source includes SPECIES_NONE at index 0; it is not a usable species.\n'
                     'export const NATIVE_SPECIES_WEIGHTS = ' + json.dumps(data, separators=(',', ':')) + ' as const;\n')
    print(f'Exported both native weight banks for {data["maxSpecies"]} species plus NONE.')
