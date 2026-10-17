"""Reproducibly import the original HeartGold data and Nitro 3D assets.

Needs requirements.txt plus apicula built at .local-tools/apicula/target/release/apicula.
No ROM or private Nintendo toolchain is required: only files in this checkout.
"""
from pathlib import Path
import base64,csv,json,re,struct,subprocess,tempfile,shutil,sys,hashlib
from xml.etree import ElementTree as ET
from ndspy.narc import NARC
from ndspy.texture import NSBTX,renderTextureDataAsImage
from ndspy.color import prepareLUTs,pack
from PIL import Image
from native_shoreline_srt import tag_glb
from script_variable_aliases import variable_aliases,canonicalize_variable_aliases
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'browser/public/source';OUT.mkdir(parents=True,exist_ok=True)
APICULA=ROOT/'.local-tools/apicula/target/release/apicula'
CACHE=ROOT/'.local-tools/source-import';CACHE.mkdir(exist_ok=True)
REPORT={'sourceCommit':'d7886a5','errors':[],'counts':{}}
def write(path,value):
 path=OUT/path;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(value,separators=(',',':'),ensure_ascii=False)+'\n')
def constants(path):
 result={}
 for name,value in re.findall(r'^#define[ \t]+(\w+)[ \t]+([^\n/]+)',(ROOT/path).read_text(),re.M):
  value=value.strip()
  try:result[name]=int(value,0)
  except ValueError:
   if value in result:result[name]=result[value]
 return result
def narc(path):return NARC((ROOT/path).read_bytes()).files
CONSTS={}
for p in (ROOT/'include/constants').glob('*.h'):
 try:CONSTS.update(constants(p.relative_to(ROOT)))
 except (UnicodeError,ValueError):pass
write(Path('constants.json'),CONSTS)
initial=(ROOT/'files/fielddata/script/scr_seq/scr_seq_0149.s').read_text()
write(Path('initial-state.json'),{'flags':{flag:True for flag in re.findall(r'^\s*SetFlag\s+(\w+)',initial,re.M)},'vars':{var:int(value,0) for var,value in re.findall(r'^\s*SetVar\s+(\w+),\s*(0x[0-9A-Fa-f]+|\d+)\s*$',initial,re.M)}})
types=re.search(r'static const u8 sTypeEffectiveness\[\]\[3\] = \{(.*?)\n\};',(ROOT/'src/battle/battle_util.c').read_text(),re.S).group(1)
write(Path('type-chart.json'),[[CONSTS[a],CONSTS[b],CONSTS[c]/10] for a,b,c in re.findall(r'\{\s*(TYPE_\w+),\s*(TYPE_\w+),\s*(TYPE_MUL_\w+)',types) if a in CONSTS and b in CONSTS and c in CONSTS])
intro={}
for p in (ROOT/'files/msgdata/msg').glob('*.gmm'):
 if any(word in p.read_text() for word in ['Welcome to the world of Pokémon','My name is Oak','Are you a boy?']):
  intro[p.stem]={r.attrib['id']:r.find("language[@name='English']").text for r in ET.parse(p).getroot().findall('row') if r.find("language[@name='English']") is not None}
write(Path('intro-messages.json'),intro)
MAPIDS=constants('include/constants/maps.h');SPECIES=constants('include/constants/species.h');MOVES=constants('include/constants/moves.h')
matrices={}
for p in sorted((ROOT/'files/fielddata/mapmatrix/map_matrix').glob('*.bin')):
 b=p.read_bytes();w,h,headers,altitudes,n=b[:5];offset=5+n;size=w*h
 ids=list(struct.unpack_from('<'+'H'*size,b,offset)) if headers else None;offset+=size*2 if headers else 0
 alt=list(b[offset:offset+size]) if altitudes else [0]*size;offset+=size if altitudes else 0
 models=list(struct.unpack_from('<'+'H'*size,b,offset))
 idx=int(re.search(r'map_matrix_(\d+)',p.name).group(1));matrices[idx]={'width':w,'height':h,'headers':ids,'altitudes':alt,'models':models}
 write(Path(f'matrices/{idx}.json'),matrices[idx])
areas=narc('files/a/0/4/2');land=narc('files/a/0/6/5');maptex=narc('files/a/0/4/4');proptex=narc('files/a/0/7/0');fieldprops=narc('files/a/0/4/0');roomprops=narc('files/a/1/4/8')
mapheaders=(ROOT/'src/data/map_headers.h').read_text();maps={};land_jobs={};prop_jobs={}
for m in re.finditer(r'\[(MAP_\w+)\]\s*=\s*\{(.*?)\}',mapheaders,re.S):
 key=m.group(1);fields=dict(re.findall(r'\.(\w+)\s*=\s*(\w+)',m.group(2)))
 if key not in MAPIDS:continue
 id=MAPIDS[key];area=int(fields['areaDataBank']);proptexid,texid,_,kind,_=struct.unpack('<HHHBB',areas[area]);matrix_id=int(re.search(r'_(\d{4})(?:_|_bin)',fields['matrixId']).group(1))
 events_path=next((ROOT/'files/fielddata/eventdata/zone_event').glob(fields['eventsBank'].replace('NARC_zone_event_','').replace('_bin','')+'.json'),None)
 event=json.loads(events_path.read_text()) if events_path else {'objects':[],'bgs':[],'warps':[],'coords':[]}
 for kind0 in ['objects','bgs','warps','coords']:event.setdefault(kind0,[])
 code=re.sub(r'^NARC_scr_seq_scr_seq_\d+_|_bin$','',fields['scriptsBank'])
 script_path=next((ROOT/'files/fielddata/script/scr_seq').glob(f'scr_seq_*_{code}.s'),None)
 labels={};entries=[];instructions=[];label=None
 if script_path:
  for raw in script_path.read_text().splitlines():
   line=raw.split('//')[0].strip()
   if not line or line.startswith(('#','.',';','@')):continue
   if line.startswith('ScrDef '):entries.append(line.split()[1]);continue
   if line=='ScrDefEnd':continue
   if line.endswith(':'):label=line[:-1];labels[label]=len(instructions);continue
   tokens=line.split(None,1);args=[x.strip() for x in tokens[1].split(',')] if len(tokens)>1 else []
   instructions.append([tokens[0],args])
  instructions=canonicalize_variable_aliases(instructions,variable_aliases(script_path.read_text()))
 msgcode=fields['msgBank'].replace('NARC_msg_msg_','').replace('_bin','')
 msgpath=next((ROOT/'files/msgdata/msg').glob('msg_'+msgcode+'.gmm'),None)
 messages={}
 if msgpath:
  for row in ET.parse(msgpath).getroot().findall('row'):
   text=row.find("language[@name='English']")
   if text is not None:messages[row.attrib['id']]=text.text or ''
 matrix=matrices[matrix_id];cells=[]
 for cell,model in enumerate(matrix['models']):
  if model==65535:continue
  if matrix['headers'] and matrix['headers'][cell]!=id:continue
  cells.append({'x':cell%matrix['width'],'z':cell//matrix['width'],'land':model,'altitude':matrix['altitudes'][cell]})
  land_jobs[(model,texid)]=None
  b=land[model];ps,pr,ms,bd=struct.unpack_from('<4I',b);sound=struct.unpack_from('<I',b,16)[0]>>16;start=20+sound
  props=[]
  for offset in range(0,pr,48):
   values=struct.unpack_from('<10i',b,start+ps+offset);pid=values[0]
   props.append({'id':pid,'position':[v/4096/16 for v in values[1:4]],'rotation':[v/4096 for v in values[4:7]],'scale':[v/4096 for v in values[7:10]],'asset':f'props/{kind}-{pid}-{proptexid}.glb'})
   prop_jobs[(kind,pid,proptexid)]=None
  tiledata=list(struct.unpack_from('<1024H',b,start))
  bdhc=b[start+ps+pr+ms:start+ps+pr+ms+bd]
  plates=[]
  if len(bdhc)>=16:
   np,nn,nc,npl,ns,na=struct.unpack_from('<6H',bdhc,4);off=16
   points=[struct.unpack_from('<ii',bdhc,off+i*8) for i in range(np)];off+=np*8
   normals=[struct.unpack_from('<iii',bdhc,off+i*12) for i in range(nn)];off+=nn*12
   constants0=struct.unpack_from('<'+'i'*nc,bdhc,off);off+=nc*4
   for i in range(npl):
    p1,p2,normal,constant=struct.unpack_from('<4H',bdhc,off+i*8)
    plates.append({'bounds':[v/4096/16 for v in (*points[p1],*points[p2])],'normal':[v/4096 for v in normals[normal]],'constant':constants0[constant]/4096/16})
  write(Path(f'lands/{model}.json'),{'permissions':tiledata,'plates':plates,'source':f'files/a/0/6/5:{model}'})
  cells[-1]['props']=props;cells[-1]['asset']=f'land/{model}-{texid}.glb'
 initpath=next((ROOT/'files/fielddata/script/scr_seq').glob('scr_seq_'+fields['scriptHeaderBank'].replace('NARC_scr_seq_scr_seq_','').replace('_bin','')+'.s'),None)
 inittext=initpath.read_text() if initpath else ''
 inits=[{'var':v,'value':int(val,0),'script':script.strip()} for v,val,script in re.findall(r'InitScriptGoToIfEqual\s+(\w+),\s*(\d+),\s*([^\n\r]+)',inittext)]
 mapconstpath=ROOT/'files'/event.get('header','nonexistent')
 localconstants=constants(mapconstpath.relative_to(ROOT)) if mapconstpath.exists() else {}
 maps[id]={'id':id,'key':key,'code':code,'name':key.removeprefix('MAP_').replace('_',' ').title(),'matrix':matrix_id,'area':area,'mapType':fields.get('mapType'),'fields':fields,'cells':cells,'events':event,'scripts':{'labels':labels,'entries':entries,'instructions':instructions},'messages':messages,'initTriggers':inits,'initScripts':dict(re.findall(r'InitScriptEntry_(OnTransition|OnResume|OnLoad)\s+([^\n\r]+)',inittext)),'constants':localconstants}
 write(Path(f'maps/{id}.json'),maps[id])
# Standard scripts are selected by the same descending thresholds as script_manager.c.
std_mappings=[]
manager=(ROOT/'src/script_manager.c').read_text()
for threshold,bank,messagebank in re.findall(r'\{\s*(\w+),\s*NARC_scr_seq_scr_seq_(\d+)_bin,\s*NARC_msg_msg_(\d+)_bin\s*\}',manager):
 minimum=int(threshold) if threshold.isdigit() else CONSTS.get(threshold)
 if minimum is None:raise ValueError('Unknown standard-script threshold '+threshold)
 scriptpath=ROOT/f'files/fielddata/script/scr_seq/scr_seq_{bank}.s';labels={};entries=[];instructions=[]
 for raw in scriptpath.read_text().splitlines():
  line=raw.split('//')[0].strip()
  if not line or line.startswith(('#','.',';','@')):continue
  if line.startswith('ScrDef '):entries.append(line.split()[1]);continue
  if line=='ScrDefEnd':continue
  if line.endswith(':'):labels[line[:-1]]=len(instructions);continue
  parts=line.split(None,1);instructions.append([parts[0],[x.strip() for x in parts[1].split(',')] if len(parts)>1 else []])
 instructions=canonicalize_variable_aliases(instructions,variable_aliases(scriptpath.read_text()))
 msgpath=next((ROOT/'files/msgdata/msg').glob('msg_'+messagebank+'*.gmm'));messages={row.attrib['id']:row.find("language[@name='English']").text or '' for row in ET.parse(msgpath).getroot().findall('row') if row.find("language[@name='English']") is not None}
 header=re.search(r'#include \"(fielddata/script/scr_seq/[^\"]+)\"',scriptpath.read_text());local=constants(Path('files')/header.group(1)) if header else {}
 write(Path(f'scripts/{bank}.json'),{'id':-int(bank),'code':'COMMON_'+bank,'scripts':{'labels':labels,'entries':entries,'instructions':instructions},'messages':messages,'constants':local})
 std_mappings.append({'min':minimum,'bank':bank,'messages':int(messagebank)})
# Extern-message commands name a bank and row at runtime.
for msgpath in (ROOT/'files/msgdata/msg').glob('*.gmm'):
 rows={int(row.attrib['index']):row.find("language[@name='English']").text or '' for row in ET.parse(msgpath).getroot().findall('row') if row.find("language[@name='English']") is not None}
 write(Path(f'messages/{int(msgpath.stem.split("_")[1])}.json'),rows)

index={str(id):{k:m[k] for k in ['id','key','code','name','matrix','area','mapType']} for id,m in maps.items()}
write(Path('index.json'),{'maps':index,'mapIds':MAPIDS,'sourceCommit':REPORT['sourceCommit'],'stdScripts':std_mappings})
# Source data is preserved completely; runtime adapters resolve numeric IDs explicitly.
write(Path('pokemon.json'),json.loads((ROOT/'files/poketool/personal/personal.json').read_text()))
write(Path('trainers.json'),json.loads((ROOT/'files/poketool/trainer/trainers.json').read_text()))
write(Path('encounters.json'),json.loads((ROOT/'files/fielddata/encountdata/gs_enc_data.json').read_text()))
write(Path('evolutions.json'),json.loads((ROOT/'files/poketool/personal/evo.json').read_text()))
write(Path('items.json'),list(csv.DictReader((ROOT/'files/itemtool/itemdata/item_data.csv').open())))
write(Path('growth.json'),{row[0].replace('GROWTH_',''):[int(x) for x in row[1:]] for row in csv.reader((ROOT/'files/poketool/personal/growtbl.csv').open()) if row[0].startswith('GROWTH_')})
move_records=[]
for id,b in enumerate(narc('files/poketool/waza/waza_tbl.narc')):
 effect,category,power,type,accuracy,pp,chance,target,priority,flags=struct.unpack_from('<H6BHbB',b)
 move_records.append({'id':id,'key':next((k for k,v in MOVES.items() if v==id and k.startswith('MOVE_')),f'MOVE_{id}'),'effect':effect,'category':category,'power':power,'type':type,'accuracy':accuracy,'pp':pp,'effectChance':chance,'target':target,'priority':priority,'flags':flags})
write(Path('moves.json'),move_records)
learnsets=[]
for b in narc('files/poketool/personal/wotbl.narc'):
 rows=[]
 for offset in range(0,len(b)-1,2):
  value=struct.unpack_from('<H',b,offset)[0]
  if value==65535:break
  rows.append({'level':value>>9,'move':value&511})
 learnsets.append(rows)
write(Path('learnsets.json'),learnsets)
# The DS applies the normal front palette to both front and back pixel indices.
# Back PNGs embed the shiny palette because the native build extracts it there.
exec((Path(__file__).parent/'export_battle_sprites.py').read_text(),{'__file__':str(Path(__file__).parent/'export_battle_sprites.py')})
# Decode original overworld character/follower sequences and preserve every frame.
prepareLUTs();spriteinfo={};mmodel=constants('include/constants/mmodel.h')
for sid,mid in re.findall(r'\.short\s+(SPRITE_\w+),\s+(MMODEL_\w+),',(ROOT/'asm/overlay_01_sprite_data.s').read_text()):
 if mid not in mmodel:continue
 model=mmodel[mid];source=ROOT/f'files/data/mmodel/mmodel/mmodel_{model:08}.NSBTX'
 if not source.exists():continue
 try:
  archive=NSBTX(source.read_bytes());textures=sorted(archive.textures,key=lambda item:int(item[0].split('.')[-1]) if item[0].split('.')[-1].isdigit() else 0)
  width=max(t.width for _,t in textures);height=max(t.height for _,t in textures);rows=(len(textures)+3)//4
  sheet=Image.new('RGBA',(width*4,height*rows));palette=[pack(*color) for color in archive.palettes[0][1].colors]
  for i,(_,tex) in enumerate(textures):
   image=renderTextureDataAsImage(tex.data1,tex.data2,tex.format,tex.width,tex.height,palette,tex.isColor0Transparent);sheet.paste(image,(i%4*width,i//4*height))
  path=OUT/f'sprites/{model}.png';path.parent.mkdir(exist_ok=True);sheet.save(path)
  spriteinfo[sid]={'model':model,'columns':4,'rows':rows,'frames':len(textures),'width':width,'height':height,'asset':f'sprites/{model}.png'}
 except Exception as e:REPORT['errors'].append({'sprite':sid,'error':str(e)})
write(Path('sprites.json'),spriteinfo)
print(f'Exported {len(maps)} maps, {len(move_records)} moves, {len(spriteinfo)} overworld sprites. Geometry: {len(land_jobs)} landscapes and {len(prop_jobs)} props.',flush=True)
# Pack PNGs into the GLB JSON so each imported asset is a self-contained fetch.
def pack_glb(path):
 b=path.read_bytes();length=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+length]);tail=b[20+length:]
 for image in j.get('images',[]):
  if 'uri'in image:image['uri']='data:image/png;base64,'+base64.b64encode((path.parent/image['uri']).read_bytes()).decode()
 data=json.dumps(j,separators=(',',':')).encode();data+=b' '*((-len(data))%4)
 return struct.pack('<III',0x46546c67,2,20+len(data)+len(tail))+struct.pack('<II',len(data),0x4e4f534a)+data+tail

def convert(name,model,texture):
 target=OUT/name
 if target.exists():
  if name.startswith('land/'):
   before=target.read_bytes();after=tag_glb(before,model)
   if after!=before:target.write_bytes(after)
  return
 target.parent.mkdir(exist_ok=True)
 with tempfile.TemporaryDirectory(dir=CACHE) as folder:
  folder=Path(folder);(folder/'model.nsbmd').write_bytes(model);(folder/'texture.nsbtx').write_bytes(texture)
  result=subprocess.run([str(APICULA),'convert','-f=glb',str(folder/'model.nsbmd'),str(folder/'texture.nsbtx'),'-o',str(folder/'out')],capture_output=True,text=True)
  glbs=list((folder/'out').glob('*.glb'))
  if result.returncode or len(glbs)!=1:raise RuntimeError(f'{name}: {result.stderr[-500:]} {result.stdout[-500:]}')
  data=pack_glb(glbs[0]);target.write_bytes(tag_glb(data,model) if name.startswith('land/') else data)

if '--data-only' not in sys.argv:
 for i,(model,texid) in enumerate(land_jobs):
  b=land[model];ps,pr,ms,_=struct.unpack_from('<4I',b);start=20+(struct.unpack_from('<I',b,16)[0]>>16)+ps+pr
  try:convert(f'land/{model}-{texid}.glb',b[start:start+ms],maptex[texid])
  except Exception as e:REPORT['errors'].append({'land':model,'texture':texid,'error':str(e)})
  if i%100==0:print('Landscapes',i,'/',len(land_jobs),flush=True)
 for i,(kind,pid,texid) in enumerate(prop_jobs):
  try:convert(f'props/{kind}-{pid}-{texid}.glb',(fieldprops if kind else roomprops)[pid],proptex[texid])
  except Exception as e:REPORT['errors'].append({'prop':pid,'kind':kind,'texture':texid,'error':str(e)})
  if i%100==0:print('Props',i,'/',len(prop_jobs),flush=True)
REPORT['counts']={'maps':len(maps),'matrices':len(matrices),'landscapes':len(land_jobs),'props':len(prop_jobs),'moves':len(move_records),'sprites':len(spriteinfo),'species':493,'trainers':len(json.loads((OUT/'trainers.json').read_text())['trainers'])}
write(Path('import-report.json'),REPORT)
subprocess.run([sys.executable,str(ROOT/'browser/scripts/export_foliage.py')],check=True)
subprocess.run([sys.executable,str(ROOT/'browser/scripts/export_story.py')],check=True)
subprocess.run([sys.executable,str(ROOT/'browser/scripts/export_entrances.py')],check=True)
print(json.dumps(REPORT['counts']),len(REPORT['errors']),'conversion errors (see import-report.json).',flush=True)
