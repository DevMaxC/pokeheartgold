"""Match pokegra.mk: the front PNG supplies the normal palette for both facings."""
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'files/poketool/pokegra/pokegra'
OUT=ROOT/'browser/public/source/pokemon'
OUT.mkdir(parents=True,exist_ok=True)
count=0
for species in range(1,494):
 base=SOURCE/f'{species:04}'
 palette_source=next((base/g/'front.png' for g in ['male','female'] if (base/g/'front.png').exists() and (base/g/'front.png').stat().st_size),None)
 if palette_source is None:continue
 with Image.open(palette_source) as normal:palette=normal.getpalette()
 for gender in ['male','female']:
  for facing in ['front','back']:
   source=next((base/g/(facing+'.png') for g in [gender,'female' if gender=='male' else 'male'] if (base/g/(facing+'.png')).exists() and (base/g/(facing+'.png')).stat().st_size),None)
   if source is None:continue
   with Image.open(source) as original:
    sprite=original.copy()
    if sprite.mode!='P' or palette is None:raise ValueError(f'Expected indexed original sprite {source}')
    sprite.putpalette(palette)
    sprite.convert('RGBA').crop((0,0,80,80)).save(OUT/f'{species}-{gender}-{facing}.png')
    count+=1
print(f'Exported {count} battle facings with their original normal palettes.')
