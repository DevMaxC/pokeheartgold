"""Export the original32x32 Egg party-icon frame, with index0 transparency."""
from pathlib import Path
import hashlib,json,re
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
source=ROOT/'files/poketool/icongra/poke_icon/poke_icon_00000501.png'
out=ROOT/'browser/public/source/eggs';out.mkdir(parents=True,exist_ok=True)
image=Image.open(source);assert image.mode=='P' and image.size==(32,64)
palette_file=ROOT/'files/poketool/icongra/poke_icon/poke_icon_00000000.pal'
palette=[tuple(map(int,line.split()))for line in palette_file.read_text().splitlines()[3:]]
table=(ROOT/'src/pokemon_icon_idx.c').read_text();body=re.search(r'sPokemonPalNoBySpeciesAndForm\[\]\s*=\s*\{(.*?)\};',table,re.S).group(1);body=re.sub(r'//[^\n]*','',body)
bank=[int(value)for value in re.findall(r'\b\d+\b',body)][494];assert bank==1
embedded=image.getpalette();assert [tuple(embedded[i*3:i*3+3])for i in range(16)]==palette[bank*16:(bank+1)*16],'Native Egg PNG palette must match source slot1'
frame=image.crop((0,0,32,32));rgba=frame.convert('RGBA')
for y in range(32):
 for x in range(32):
  if frame.getpixel((x,y))==0:rgba.putpixel((x,y),(*rgba.getpixel((x,y))[:3],0))
rgba.save(out/'egg-icon.png')
refs=[source,palette_file,ROOT/'src/pokemon_icon_idx.c',ROOT/'src/get_egg.c',ROOT/'src/pokemon.c',ROOT/'src/math_util.c',ROOT/'src/trainer_memo.c',ROOT/'src/field/scrcmd_pokemon_misc.c',ROOT/'src/field_misc_events.c',ROOT/'include/constants/pokemon.h',ROOT/'include/config.h']
(out/'provenance.json').write_text(json.dumps({'sourceIconIndex':501,'paletteBank':bank,'frame':[0,0,32,32],'image':'egg-icon.png','sources':[{'path':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}for p in refs]},indent=2)+'\n')
