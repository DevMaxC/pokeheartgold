import json
import unittest
from pathlib import Path
from script_variable_aliases import variable_aliases, canonicalize_variable_aliases


ROOT = Path(__file__).resolve().parents[2]
EXPECTED = {
    'FARFETCHD_X_COORD': 'VAR_TEMP_x4000',
    'FARFETCHD_Z_COORD': 'VAR_TEMP_x4001',
    'FARFETCHD1_BLIND_SPOT': 'VAR_TEMP_x4002',
    'FARFETCHD2_BLIND_SPOT': 'VAR_TEMP_x4003',
    'FARFETCHD1_BOTTOM_RIGHT_FACING_UP': 'VAR_TEMP_x4004',
}


class SourceVariableAliases(unittest.TestCase):
    def test_only_direct_variable_aliases_are_canonicalized(self):
        source = ('#define BIRD_X VAR_TEMP_x4000\n'
                  '#define ORDINARY 16384\n'
                  '#define ARITHMETIC VAR_TEMP_x4000 + 1\n'
                  '#define FUNC(x) VAR_TEMP_x4000\n'
                  '#define OTHER ITEM_POTION\n')
        aliases = variable_aliases(source)
        self.assertEqual(aliases, {'BIRD_X': 'VAR_TEMP_x4000'})
        instructions = [['BIRD_X', ['BIRD_X', 'BIRD_X_SUFFIX', 'ORDINARY', '_BIRD_X', 'BIRD_X + 1']]]
        self.assertEqual(canonicalize_variable_aliases(instructions, aliases),
                         [['BIRD_X', ['VAR_TEMP_x4000', 'BIRD_X_SUFFIX', 'ORDINARY', '_BIRD_X', 'VAR_TEMP_x4000 + 1']]])
        self.assertEqual(instructions[0][1][0], 'BIRD_X', 'input is not mutated')

    def test_all_native_script_inventory_is_exactly_five_ilex_aliases(self):
        found = {path.name: aliases for path in (ROOT / 'files/fielddata/script/scr_seq').glob('*.s')
                 if (aliases := variable_aliases(path.read_text()))}
        self.assertEqual(found, {'scr_seq_0092_D36R0101.s': EXPECTED})

    def test_actual_export_is_canonical_and_keeps_native_instruction_order_and_labels(self):
        source = (ROOT / 'files/fielddata/script/scr_seq/scr_seq_0092_D36R0101.s').read_text()
        labels, entries, instructions = {}, [], []
        for raw in source.splitlines():
            line = raw.split('//')[0].strip()
            if not line or line.startswith(('#', '.', ';', '@')):
                continue
            if line.startswith('ScrDef '):
                entries.append(line.split()[1])
            elif line == 'ScrDefEnd':
                continue
            elif line.endswith(':'):
                labels[line[:-1]] = len(instructions)
            else:
                tokens = line.split(None, 1)
                instructions.append([tokens[0], [x.strip() for x in tokens[1].split(',')] if len(tokens) > 1 else []])
        exported = json.loads((ROOT / 'browser/public/source/maps/117.json').read_text())['scripts']
        self.assertEqual(exported['labels'], labels)
        self.assertEqual(exported['entries'], entries)
        self.assertEqual(exported['instructions'], canonicalize_variable_aliases(instructions, EXPECTED))
        self.assertEqual(len(exported['instructions']), len(instructions))
        self.assertEqual([x[0] for x in exported['instructions']], [x[0] for x in instructions])


if __name__ == '__main__':
    unittest.main()
