"""Export immutable building entrance directions from native warp tile behaviours."""
from pathlib import Path
import json

SOURCE=Path(__file__).resolve().parents[1]/'public/source'
# Directions describe the outward façade normal, opposite the entry movement.
FACES={0x69:(2,1),0x62:(0,-1),0x63:(0,1),0x64:(2,1),0x65:(2,-1),
       0x6c:(0,-1),0x6d:(0,1),0x6e:(2,1),0x6f:(2,-1)}
result={};lands={};seen=set()
for path in sorted((SOURCE/'maps').glob('*.json'),key=lambda p:int(p.stem)):
 map=json.loads(path.read_text());entries=result.setdefault(str(map['matrix']),[])
 for warp in map['events']['warps']:
  cell=next((c for c in map['cells'] if c['x']==warp['x']//32 and c['z']==warp['z']//32),None)
  if cell is None:continue
  land=cell['land']
  if land not in lands:lands[land]=json.loads((SOURCE/f'lands/{land}.json').read_text())
  permission=lands[land]['permissions'][warp['z']%32*32+warp['x']%32];behavior=permission&255
  if behavior not in FACES:continue
  axis,sign=FACES[behavior];key=(map['matrix'],warp['x'],warp['z'],axis,sign)
  if key in seen:continue
  seen.add(key);entries.append({'x':warp['x']+.5,'z':warp['z']+.5,'axis':axis,'sign':sign,'behavior':behavior,'map':map['id']})
(SOURCE/'entrances.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
print(f'Exported {len(seen)} directional source entrances across {len(result)} matrices.')
