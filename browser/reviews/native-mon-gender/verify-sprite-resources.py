"""Verify existing exports against their original indexed PNGs; never write art."""
from pathlib import Path
from PIL import Image
import hashlib, json
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).with_name('sprite-resources.json')
PERSONAL = ROOT / 'files/poketool/personal/personal.json'
SOURCE = ROOT / 'files/poketool/pokegra/pokegra'
EXPORT = ROOT / 'browser/public/source/pokemon'

def pin(path):
    return {'path': str(path.relative_to(ROOT)), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}

rows = []
for species, base in enumerate(json.loads(PERSONAL.read_text())['baseStats']):
    if not 1 <= species <= 493 or base['genderRatio'] <= 1:
        continue
    folder = SOURCE / f'{species:04}'
    palette_file = next(folder / gender / 'front.png' for gender in ['male', 'female'] if (folder / gender / 'front.png').exists() and (folder / gender / 'front.png').stat().st_size)
    with Image.open(palette_file) as palette_image:
        palette = palette_image.getpalette()
    for facing in ['front', 'back']:
        source = next(folder / gender / (facing + '.png') for gender in ['male', 'female'] if (folder / gender / (facing + '.png')).exists() and (folder / gender / (facing + '.png')).stat().st_size)
        exported = EXPORT / f'{species}-male-{facing}.png'
        assert not (EXPORT / f'{species}-genderless-{facing}.png').exists()
        with Image.open(source) as image:
            assert image.mode == 'P' and palette is not None
            native = image.copy()
            native.putpalette(palette)
            expected = native.convert('RGBA').crop((0, 0, 80, 80))
        with Image.open(exported) as image:
            actual = image.convert('RGBA')
            assert actual.size == (80, 80)
            assert actual.tobytes() == expected.tobytes(), str(exported)
            visible = sum(alpha > 30 for alpha in actual.getchannel('A').getdata())
            assert visible > 0
        rows.append({'species': species, 'name': base['species'], 'facing': facing, 'source': pin(source), 'normalPalette': pin(palette_file), 'export': pin(exported), 'width': 80, 'height': 80, 'visiblePixels': visible})

def symbol(bank, row):
    tree = ET.parse(ROOT / f'files/msgdata/msg/msg_{bank:04}.gmm')
    return tree.find(f".//row[@index='{row}']/language[@name='English']").text

proof = {
    'scope': '54 genderless base species1..493; normal base sprites only, not alternate-form/shiny/full sprite engine parity.',
    'pins': [pin(PERSONAL), pin(ROOT / 'src/pokemon.c'), pin(ROOT / 'src/party_context_menu.c'), pin(ROOT / 'src/battle/battle_party_menu.c'), pin(ROOT / 'files/msgdata/msg/msg_0300.gmm'), pin(ROOT / 'files/msgdata/msg/msg_0006.gmm'), pin(ROOT / 'browser/scripts/export_battle_sprites.py')],
    'nativeSpriteRule': 'pokemon.c2269/2358: female slot only if gender == MON_FEMALE; nonfemale uses male slot.',
    'nativeSymbolRule': 'party_context_menu.c535..544 and battle_party_menu.c1762 onward print only MON_MALE/MON_FEMALE; genderless prints no symbol.',
    'symbols': {'party': {'male': symbol(300, 27), 'female': symbol(300, 28), 'genderless': ''}, 'battle': {'male': symbol(6, 16), 'female': symbol(6, 17), 'genderless': ''}},
    'rows': rows,
}
assert len(rows) == 108
OUT.write_text(json.dumps(proof, indent=2) + '\n')
print(f'Verified {len(rows)} existing original-art facings, including81/100, without changing resources.')
