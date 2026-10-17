"""Decode the native Oak-speech BG/cell artwork without redrawing it.
References: src/oaks_speech.c and files/data/resdat/resdat_00000078.json.
Pillow decodes the2D artwork; --audio additionally requires ndspy, and
--title-model requires apicula. Re-run from any directory. Optional exports
retain their previous provenance when only the2D artwork is regenerated.
"""
from pathlib import Path
import argparse,base64,hashlib,json,struct,subprocess,tempfile,wave
from PIL import Image
args=argparse.ArgumentParser(description=__doc__);args.add_argument('--title-model',action='store_true');args.add_argument('--audio',action='store_true');args.add_argument('--apicula',type=Path);args=args.parse_args()
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'files/demo/intro/intro'
OUT=ROOT/'browser/public/source/opening';OUT.mkdir(parents=True,exist_ok=True)
previous=json.loads((OUT/'assets.json').read_text())if(OUT/'assets.json').exists()else{}
used=set()
def original(n,ext):
 p=SOURCE/f'intro_{n:08}.{ext}';used.add(p);return p.read_bytes()
def palette(n):
 b=original(n,'NCLR');assert b[:4]==b'RLCN' and b[16:20]==b'TTLP';size,offset=struct.unpack_from('<II',b,32);raw=b[24+offset:24+offset+size];return [tuple(((v>>s)&31)*255//31 for s in [0,5,10]) for v, in struct.iter_unpack('<H',raw)]
def tiles(n):
 b=original(n,'NCGR');assert b[:4]==b'RGCN' and b[16:20]==b'RAHC';assert struct.unpack_from('<I',b,28)[0]==3;size,offset=struct.unpack_from('<II',b,40);return b[24+offset:24+offset+size]
def tilepixel(raw,t,x,y):
 at=t*32+y*4+x//2
 if at>=len(raw):raise ValueError(f'tile {t} exceeds native tile bank')
 return(raw[at]>>(4*(x%2)))&15

def bg(n,pal):
 raw=tiles(n);colors=palette(pal);b=original(9,'NSCR');width,height=struct.unpack_from('<HH',b,24);assert(width,height)==(256,192);image=Image.new('RGBA',(width,height))
 for i,(entry,)in enumerate(struct.iter_unpack('<H',b[36:])):
  t=entry&1023;flipx=bool(entry&1024);flipy=bool(entry&2048)
  for y in range(8):
   for x in range(8):
    color=tilepixel(raw,t,7-x if flipx else x,7-y if flipy else y)
    if color:image.putpixel(((i%32)*8+x,(i//32)*8+y),(*colors[color],255))
 return image

assets={}
for name,char,pal in [('oak',10,11),('boy',12,16),('girl',17,21)]+[(f'boy-shrink-{i}',n,16) for i,n in enumerate(range(22,26),1)]+[(f'girl-shrink-{i}',n,21) for i,n in enumerate(range(26,30),1)]:
 image=bg(char,pal);image.save(OUT/f'{name}.png');
 if name in ['boy','girl']:image.crop(image.getbbox()).save(OUT/f'{name}-choice.png')
 assets[name]={'image':f'{name}.png','size':list(image.size),'opaqueBounds':list(image.getbbox()),'character':char,'palette':pal,'tilemap':9}

# Native Marill/ball cells. The three cell records have explicit OAM bounds,
# 1D32 tile indices, flips and palette offsets; no battle sprite substitute.
raw=tiles(64);colors=palette(63);bank=original(65,'NCER');assert bank[:4]==b'RECN' and bank[16:20]==b'KBEC';count,kind,offset=struct.unpack_from('<HHI',bank,24);assert(count,kind)==(3,1);cellstart=24+offset;oamstart=cellstart+count*16
sizes=[[(8,8),(16,16),(32,32),(64,64)],[(16,8),(32,8),(32,16),(64,32)],[(8,16),(8,32),(16,32),(32,64)]]
cells=[]
for i in range(count):
 num,attrs,start,maxx,maxy,minx,miny=struct.unpack_from('<HHIhhhh',bank,cellstart+i*16);image=Image.new('RGBA',(maxx-minx+1,maxy-miny+1));basepal=1 if i==2 else 0
 for j in reversed(range(num)):
  # Sprite_SetPaletteOverride overwrites OAM's high palette nibble, rather
  # than adding to it (src/sprite.c:368; g2d_renderer.c:75). The tiny ball
  # cell already carries OAM palette1; adding its override again turns black.
  a,b,c=struct.unpack_from('<HHH',bank,oamstart+start+j*6);x=b&511;y=a&255;x=x-512 if x>=256 else x;y=y-256 if y>=128 else y;w,h=sizes[(a>>14)&3][(b>>14)&3];tile=c&1023;pal=basepal
  for py in range(h):
   for px in range(w):
    sx=w-1-px if b&4096 else px;sy=h-1-py if b&8192 else py;color=tilepixel(raw,tile+(sy//8)*(w//8)+sx//8,sx%8,sy%8)
    if color:image.putpixel((x-minx+px,y-miny+py),(*colors[pal*16+color],255))
 name=f'demo-cell-{i}.png';image.save(OUT/name);cells.append({'image':name,'origin':[-minx,-miny],'bounds':[minx,miny,maxx,maxy]})
anim=original(66,'NANR');assert anim[:4]==b'RNAN';seqCount=struct.unpack_from('<H',anim,24)[0];so,fo,do=struct.unpack_from('<III',anim,28);sequences=[]
for i in range(seqCount):
 count,loop,element,typ,mode,start=struct.unpack_from('<HHHHII',anim,24+so+i*16);frames=[]
 for j in range(count):
  off,duration,pad=struct.unpack_from('<IHH',anim,24+fo+start+j*8);p=24+do+off;cell=struct.unpack_from('<H',anim,p)[0];frame={'cell':cell,'duration':duration,'translate':[0,0],'scale':[1,1],'rotation':0}
  if element==1:
   rotation,sx,sy,x,y=struct.unpack_from('<Hii hh',anim,p+2);frame.update(rotation=rotation*360/65536,scale=[sx/4096,sy/4096],translate=[x,y])
  elif element==2:frame['translate']=list(struct.unpack_from('<hh',anim,p+4))
  else:assert element==0
  assert cell<len(cells);frames.append(frame)
 sequences.append({'frames':frames,'loopStart':loop,'loop':mode==2,'mode':mode})
# Source title logo/background PNGs are artwork inputs, not screenshots.
for name,filename in [('title-logo','titledemo_00000003.png'),('title-background','titledemo_00000034.png')]:
 p=ROOT/'files/demo/title/titledemo'/filename;used.add(p);im=Image.open(p);rgba=im.convert('RGBA');pixels=rgba.load()
 if name=='title-logo':
  for y in range(im.height):
   for x in range(im.width):
    if im.getpixel((x,y))==0:pixels[x,y]=(*pixels[x,y][:3],0)
 rgba.save(OUT/f'{name}.png');assets[name]={'image':f'{name}.png','size':list(rgba.size)}
title_paths=[ROOT/'files/demo/title/titledemo'/f'titledemo_{i:08}.{ext}' for i,ext in [(25,'NSBMD'),(26,'NSBCA'),(27,'NSBTA'),(28,'NSBMA'),(29,'NSBTP')]]
if args.title_model:
 executable=args.apicula or ROOT/'.local-tools/apicula/target/release/apicula'
 with tempfile.TemporaryDirectory() as folder:
  folder=Path(folder)/'converted';result=subprocess.run([str(executable),'convert','-f=glb',*[str(p)for p in title_paths if p.suffix!='.NSBMA'],'-o',str(folder)],capture_output=True,text=True)
  files=list(folder.glob('*.glb'))
  if result.returncode or len(files)!=1:raise RuntimeError(result.stdout+result.stderr)
  b=files[0].read_bytes();length=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+length]);tail=b[20+length:]
  for image in j.get('images',[]):
   if 'uri'in image:image['uri']='data:image/png;base64,'+base64.b64encode((folder/image['uri']).read_bytes()).decode()
  # EXT_property_animation has no standard node target and Three cannot play
  # it. Keep only the valid native joint clip; record this limitation below.
  j['animations']=[a for a in j.get('animations',[]) if all('node'in c['target'] for c in a['channels'])]
  if 'EXT_property_animation'in j.get('extensionsUsed',[]):j['extensionsUsed'].remove('EXT_property_animation')
  j.get('extensions',{}).pop('EXT_property_animation',None)
  encoded=json.dumps(j,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
  (OUT/'ho-oh.glb').write_bytes(struct.pack('<III',0x46546c67,2,20+len(encoded)+len(tail))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+tail)
if args.title_model:used.update(title_paths)
audio={species:entry for species,entry in previous.get('cries',{}).items()if(OUT/entry.get('file',entry.get('image',''))).is_file()}if not args.audio else{}
if args.audio:
 from ndspy.soundArchive import SDAT
 sound_path=ROOT/'files/data/sound/gs_sound_data.sdat';archive=SDAT(sound_path.read_bytes());used.add(sound_path)
 for species in [183,250]:
  name=f'WAVE_ARC_PV{species:03}';sample=next(w for n,w in archive.waveArchives if n==name).waves[0];assert int(sample.waveType)==0,'Expected source PCM8 cry'
  target=OUT/f'cry-{species}.wav'
  with wave.open(str(target),'wb') as out:out.setnchannels(1);out.setsampwidth(1);out.setframerate(sample.sampleRate);out.writeframes(bytes((b+128)&255 for b in sample.data))
  audio[str(species)]={'file':target.name,'archive':name,'sampleRate':sample.sampleRate,'frames':len(sample.data),'signedPCMSourceSHA256':hashlib.sha256(sample.data).hexdigest()}
# Retain original hashes for optional artifacts that were not regenerated.
# Rehashing their current inputs would incorrectly imply a fresh conversion.
preserve={str(p.relative_to(ROOT))for p in title_paths}if not args.title_model and(OUT/'ho-oh.glb').exists()else set()
if not args.audio and audio:preserve.add('files/data/sound/gs_sound_data.sdat')
sources={s['path']:s for s in previous.get('sources',[])if s['path']in preserve}
sources.update({str(p.relative_to(ROOT)):{'path':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}for p in sorted(used)})
manifest={'source':'src/oaks_speech.c:496, src/oaks_speech_obj.c:129, files/data/resdat/resdat_00000078.json','backgrounds':assets,'title':{'model':'ho-oh.glb'if(OUT/'ho-oh.glb').exists()else None,'nativeJointAnimation':(OUT/'ho-oh.glb').exists(),'unsupported':['NSBMA palette animation28','NSBTA/NSBTP material and pattern playback','separate sparkle model38..40','five-scene intro movie','title and introduction BGM']},'cries':audio,'demo':{'cells':cells,'sequences':sequences,'sourceSpritePosition':[160,80]},'sources':sorted(sources.values(),key=lambda s:s['path'])}
(OUT/'assets.json').write_text(json.dumps(manifest,indent=2)+'\n');print(f'Decoded {len(assets)} native backgrounds, {len(cells)} cells and {len(sequences)} animation sequences into {OUT}')
