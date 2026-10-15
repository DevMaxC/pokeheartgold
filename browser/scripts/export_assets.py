"""Export repository-owned sprite/data inputs. Run with Pillow and ndspy installed."""
from pathlib import Path
import json
from PIL import Image
from ndspy.texture import NSBTX, renderTextureDataAsImage
from ndspy.color import prepareLUTs, pack

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'browser/public/assets'
OUT.mkdir(parents=True, exist_ok=True)
manifest = {}
for species in [16, 19, 25, 152, 155, 158, 161, 163]:
    source = ROOT / f'files/poketool/pokegra/pokegra/{species:04}/male/front.png'
    image = Image.open(source).convert('RGBA').crop((0, 0, 80, 80))
    image = image.crop(image.getbbox())
    image.save(OUT / f'{species}.png')
    manifest[str(species)] = {'width': image.width, 'height': image.height, 'source': str(source.relative_to(ROOT))}
prepareLUTs()
source = ROOT / 'files/data/mmodel/mmodel/mmodel_00000069.NSBTX'
archive = NSBTX(source.read_bytes())
sheet = Image.new('RGBA', (32 * 4, 32 * 8))
palette = [pack(*color) for color in archive.palettes[0][1].colors]
for index, (_, texture) in enumerate(sorted(archive.textures, key=lambda item: int(item[0].split('.')[-1]))):
    image = renderTextureDataAsImage(texture.data1, texture.data2, texture.format, texture.width, texture.height, palette, texture.isColor0Transparent)
    sheet.paste(image, (index % 4 * 32, index // 4 * 32))
sheet.save(OUT / 'ethan.png')
manifest['ethan'] = {'source': str(source.relative_to(ROOT)), 'frames': 32, 'frameWidth': 32, 'frameHeight': 32}
encounters = json.loads((ROOT / 'files/fielddata/encountdata/gs_enc_data.json').read_text())
route = next(row for row in encounters['encounters'] if row['map'] == 'R29')
(OUT / 'route29.json').write_text(json.dumps(route, indent=2) + '\n')
(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print('Exported original Pokémon sprites, Ethan animation frames, and Route 29 encounter data.')
