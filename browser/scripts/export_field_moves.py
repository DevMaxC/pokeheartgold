"""Export native TM/HM IDs and personal-form resolution without rebuilding assets."""
from pathlib import Path
import argparse
import ast
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[2]
INPUTS = [
    'src/item.c', 'src/pokemon.c', 'src/scrcmd_party.c', 'src/field_move.c',
    'src/party_menu_items.c', 'src/party_menu.c', 'src/pokemon_summary_states.c',
    'src/pokemon_mood.c', 'src/scrcmd_c.c', 'src/script_pokemon_util.c', 'src/script_manager.c',
    'src/field/field_move_effects.c', 'asm/macros/script.inc',
    'include/constants/items.h', 'include/constants/moves.h',
    'include/constants/species.h', 'include/constants/pokemon.h', 'include/constants/badge.h',
    'include/constants/std_script.h', 'include/constants/maps.h',
    'include/constants/map_sections.h', 'src/data/map_headers.h',
    'include/constants/field/map_load.h', 'include/constants/field_move_response.h',
    'include/party_menu_items.h', 'files/poketool/personal/personal.json',
    'files/poketool/personal/personal.json.txt',
    'files/fielddata/script/scr_seq/scr_seq_0146.s',
]


def expression(value, constants):
    def visit(node):
        if isinstance(node, ast.Constant) and isinstance(node.value, int):
            return node.value
        if isinstance(node, ast.Name):
            return constants[node.id]
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
            return -visit(node.operand)
        if isinstance(node, ast.BinOp):
            a, b = visit(node.left), visit(node.right)
            for kind, operation in [(ast.Add, lambda: a + b), (ast.Sub, lambda: a - b),
                                    (ast.LShift, lambda: a << b), (ast.BitOr, lambda: a | b)]:
                if isinstance(node.op, kind):
                    return operation()
        raise ValueError(value)
    return visit(ast.parse(value.strip(), mode='eval').body)


def native_constants():
    constants = {}
    texts = [(ROOT / p).read_text() for p in INPUTS if p.endswith('.h')]
    for _ in range(4):
        for text in texts:
            clean = re.sub(r'/\*.*?\*/|//[^\n]*', '', text, flags=re.S)
            for key, value in re.findall(r'^#define[ \t]+(\w+)[ \t]+([^\n]+)', clean, re.M):
                try:
                    constants[key] = expression(value, constants)
                except (KeyError, ValueError, SyntaxError):
                    pass
            for body in re.findall(r'\benum\b[^{};]*\{([^{}]*)\}', clean):
                previous = -1
                for entry in body.split(','):
                    parts = [part.strip() for part in entry.strip().split('=', 1)]
                    if not re.fullmatch(r'\w+', parts[0]):
                        continue
                    try:
                        if len(parts) == 1 and previous is None:
                            continue
                        previous = expression(parts[1], constants) if len(parts) == 2 else previous + 1
                        constants[parts[0]] = previous
                    except (KeyError, ValueError, SyntaxError):
                        previous = None
    return constants


def export():
    constants = native_constants()
    item_source = (ROOT / 'src/item.c').read_text()
    table = re.search(r'static const u16 sTMHMMoves\[\] = \{(.*?)\};', item_source, re.S).group(1)
    moves = re.findall(r'\b(MOVE_\w+)\s*,', table)
    tm_count = constants['ITEM_HM01'] - constants['ITEM_TM01']
    hm_count = constants['ITEM_HM08'] - constants['ITEM_HM01'] + 1
    assert len(moves) == tm_count + hm_count
    items = []
    for index, move in enumerate(moves):
        is_hm = index >= tm_count
        number = index - tm_count + 1 if is_hm else index + 1
        key = f'ITEM_{"HM" if is_hm else "TM"}{number:02}'
        items.append({'item': key, 'itemId': constants[key], 'index': index,
                      'move': move, 'moveId': constants[move], 'kind': 'hm' if is_hm else 'tm',
                      'number': number})
        assert constants[key] == constants['ITEM_TM01'] + index

    pokemon = (ROOT / 'src/pokemon.c').read_text()
    resolution = re.search(r'int ResolveMonForm\(int species, int form\) \{(.*?)\n\}', pokemon, re.S).group(1)
    forms = {}
    pattern = r'case (SPECIES_\w+):\s*if \(form != (\w+) && form <= (\w+) - 1\) \{\s*return (SPECIES_\w+) \+ form - (\w+);'
    for species, normal, limit, alternate, first in re.findall(pattern, resolution):
        rows = [constants[species]] * constants[limit]
        for form in range(constants[limit]):
            if form != constants[normal]:
                rows[form] = constants[alternate] + form - constants[first]
        forms[str(constants[species])] = rows
    assert len(forms) == 5
    personal = json.loads((ROOT / 'files/poketool/personal/personal.json').read_text())['baseStats']
    for rows in forms.values():
        assert all(0 <= row < len(personal) for row in rows)

    standard = constants['std_field_cut']
    manager = (ROOT / 'src/script_manager.c').read_text()
    mapping = [(expression(threshold, constants), bank) for threshold, bank in
               re.findall(r'\{\s*(\w+),\s*NARC_scr_seq_scr_seq_(\d+)_bin,\s*NARC_msg_msg_\d+_bin\s*\}', manager)]
    threshold, bank = next((minimum, bank) for minimum, bank in mapping if standard >= minimum)
    script_path = f'files/fielddata/script/scr_seq/scr_seq_{bank}.s'
    interaction_entry = standard - threshold
    menu_entry = constants['std_menu_cut'] - threshold
    labels, entries, instructions = {}, [], []
    for raw in (ROOT / script_path).read_text().splitlines():
        line = raw.split('//')[0].strip()
        if not line or line.startswith(('#', '.', ';', '@')):
            continue
        if line.startswith('ScrDef '):
            entries.append(line.split()[1])
            continue
        if line == 'ScrDefEnd':
            continue
        if line.endswith(':'):
            labels[line[:-1]] = len(instructions)
            continue
        parts = line.split(None, 1)
        instructions.append((parts[0], [v.strip() for v in parts[1].split(',')] if len(parts) > 1 else []))

    def closure(entry):
        visited, pending = set(), [labels[entries[entry]]]
        while pending:
            index = pending.pop()
            if index in visited or index >= len(instructions):
                continue
            visited.add(index)
            command, args = instructions[index]
            if command in ['End', 'Return']:
                continue
            if command == 'GoTo' or command.startswith(('GoToIf', 'Call')):
                assert args[-1] in labels
                pending.append(labels[args[-1]])
            if command != 'GoTo':
                pending.append(index + 1)
        return {'entry': entry, 'instructions': sorted(visited),
                'commands': sorted({instructions[i][0] for i in visited})}

    map_sections = {}
    for map_name, body in re.findall(r'\[(MAP_\w+)\]\s*=\s*\{(.*?)\}', (ROOT / 'src/data/map_headers.h').read_text(), re.S):
        section = re.search(r'\.mapsec\s*=\s*(MAPSEC_\w+)', body)
        if section:
            map_sections[str(constants[map_name])] = constants[section.group(1)]
    assert len(map_sections) >= 500

    return {
        'version': 1,
        'sourceSHA256': {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in dict.fromkeys([*INPUTS, script_path])},
        'items': items,
        'alternateForms': forms,
        'mapSections': map_sections,
        'mapLoadTypes': {name.removeprefix('MAP_LOAD_TYPE_'): constants[name] for name in
                         ['MAP_LOAD_TYPE_OVERWORLD', 'MAP_LOAD_TYPE_SAFARI', 'MAP_LOAD_TYPE_UNION',
                          'MAP_LOAD_TYPE_COLOSSEUM', 'MAP_LOAD_TYPE_BATTLE_TOWER', 'MAP_LOAD_TYPE_5']},
        'responses': {name.removeprefix('FIELD_MOVE_RESPONSE_'): constants[name] for name in
                      ['FIELD_MOVE_RESPONSE_OK', 'FIELD_MOVE_RESPONSE_NOT_HERE', 'FIELD_MOVE_RESPONSE_NEED_BADGE']},
        'learningResponses': {name.removeprefix('LEARN_MOVE_CHECK_'): constants[name] for name in
                              ['LEARN_MOVE_CHECK_KNOWN', 'LEARN_MOVE_CHECK_FULL', 'LEARN_MOVE_CHECK_INCOMPAT']},
        'cut': {'moveId': constants['MOVE_CUT'], 'badge': constants['BADGE_HIVE'],
                'standard': standard, 'bank': bank, 'interactionEntry': interaction_entry, 'menuEntry': menu_entry},
        'cutCommandClosure': {'interaction': closure(interaction_entry), 'menu': closure(menu_entry)},
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'browser/public/source/field-moves.json')
    output = parser.parse_args().output
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.name + '.tmp')
    temporary.write_text(json.dumps(export(), separators=(',', ':')) + '\n')
    temporary.replace(output)
