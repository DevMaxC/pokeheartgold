"""Export immutable building entrance directions from native warp tile behaviours."""
from pathlib import Path
import json

SOURCE=Path(__file__).resolve().parents[1]/'public/source'
# Directions describe the outward façade normal, opposite the entry movement.
FACES={0x69:(2,1),0x62:(0,-1),0x63:(0,1),0x64:(2,1),0x65:(2,-1),
       0x6c:(0,-1),0x6d:(0,1),0x6e:(2,1),0x6f:(2,-1)}
result={};lands={};seen=set();report={'directional':0,'passageOnly':0,'missingCell':[],'nonDirectional':[]}
for path in sorted((SOURCE/'maps').glob('*.json'),key=lambda p:int(p.stem)):
 map=json.loads(path.read_text());entries=result.setdefault(str(map['matrix']),[])
 for warp in map['events']['warps']:
  cell=next((c for c in map['cells'] if c['x']==warp['x']//32 and c['z']==warp['z']//32),None)
  if cell is None:report['missingCell'].append({'map':map['id'],'x':warp['x'],'z':warp['z']});continue
  land=cell['land']
  if land not in lands:lands[land]=json.loads((SOURCE/f'lands/{land}.json').read_text())
  permission=lands[land]['permissions'][warp['z']%32*32+warp['x']%32];behavior=permission&255
  face=FACES.get(behavior);key=(map['matrix'],warp['x'],warp['z'],face)
  if key in seen:continue
  seen.add(key);entry={'x':warp['x']+.5,'z':warp['z']+.5,'behavior':behavior,'map':map['id']}
  if face:entry.update(axis=face[0],sign=face[1]);report['directional']+=1
  else:
   # Unknown-facing exits cannot choose a building's front, but must still
   # prevent a new rear wall sealing a real source passage (e.g. Frontier).
   entry['passageOnly']=True;report['passageOnly']+=1;report['nonDirectional'].append({'map':map['id'],'mapType':map['mapType'],'x':warp['x'],'z':warp['z'],'behavior':behavior})
  entries.append(entry)
(SOURCE/'entrances.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
(SOURCE/'entrance-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(f'Exported {report["directional"]} directional source entrances and {report["passageOnly"]} passage safeguards across {len(result)} matrices; {len(report["missingCell"])} warps have no cell in their header (see entrance-report.json).')
