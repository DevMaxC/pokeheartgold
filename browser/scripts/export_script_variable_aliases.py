"""Refresh only a selected existing map's direct native VAR aliases.

Usage: python3 browser/scripts/export_script_variable_aliases.py --map 117
The full importer uses the same pure canonicalizer before writing map data.
"""
import argparse
import json
from pathlib import Path
from script_variable_aliases import variable_aliases, canonicalize_variable_aliases


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--map', type=int, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    output = root / f'browser/public/source/maps/{args.map}.json'
    data = json.loads(output.read_text())
    sources = list((root / 'files/fielddata/script/scr_seq').glob(f'scr_seq_*_{data["code"]}.s'))
    if len(sources) != 1:
        raise ValueError(f'Expected one native script for map {args.map}, found {len(sources)}')
    aliases = variable_aliases(sources[0].read_text())
    instructions = canonicalize_variable_aliases(data['scripts']['instructions'], aliases)
    changed = sum(before != after for before, after in zip(data['scripts']['instructions'], instructions))
    data['scripts']['instructions'] = instructions
    output.write_text(json.dumps(data, separators=(',', ':'), ensure_ascii=False) + '\n')
    print(json.dumps({'map': args.map, 'source': str(sources[0].relative_to(root)),
                      'aliases': aliases, 'changedInstructions': changed}))


if __name__ == '__main__':
    main()
