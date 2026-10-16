"""Export original individual-tree art and trunk metadata from converted landscapes."""
from pathlib import Path
import base64,io,json,re,struct,hashlib
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'public/source'
OUT=SOURCE/'foliage';OUT.mkdir(exist_ok=True)
textures={};generic={}
for path in sorted((SOURCE/'land').glob('*.glb')):
 data=path.read_bytes();gltf=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]])
 context=path.stem.split('-')[-1]
 for material in gltf['materials']:
  name=material.get('name','')
  known=any(word in name.lower() for word in ['tree','bush']) and not re.search(r'_un(?:_|$)',name)
  alias=bool(re.fullmatch(r'(?:lambert|material)\d+',name,re.I))
  if not known and not alias:continue
  if 'baseColorTexture' not in material.get('pbrMetallicRoughness',{}):continue
  texture=gltf['textures'][material['pbrMetallicRoughness']['baseColorTexture']['index']]
  encoded=gltf['images'][texture['source']]['uri'].split(',')[1]
  key=(context,name);raw=base64.b64decode(encoded)
  if known:
   if key in textures:assert textures[key]==raw,key
   textures[key]=raw
  else:generic.setdefault(key,set()).add(raw)
def foot_runs(image):
 alpha=image.getchannel('A');row=alpha.getbbox()[3]-1;runs=[];start=None
 for x in range(image.width+1):
  solid=x<image.width and alpha.getpixel((x,row))>=200
  if solid and start is None:start=x
  if not solid and start is not None:runs.append((start,x));start=None
 return runs

manifest={}
for (context,name),raw in textures.items():
 canonical=re.sub(r'_re(?=_|$)','',name)
 # These banks use numbered composite art rather than the `_re` suffix.
 if context=='8':canonical={'tree_w02':'tree_w01','tree_w02_2':'tree_w01_2','tree_w2_2':'tree_w01_2'}.get(canonical,canonical)
 if context=='92':canonical=re.sub(r'^bf_tree03_', 'bf_tree01_',canonical)
 if (context,canonical) not in textures:
  # The original lightmap banks call the individual tree "tree01gs_lm1".
  candidates=[canonical.replace('_lm','gs_lm'),re.sub(r'_lm\d+$','',canonical)]
  canonical=next((candidate for candidate in candidates if (context,candidate) in textures),canonical)
 canonical_raw=textures.get((context,canonical))
 if canonical_raw is None:raise ValueError(f'Missing original individual tree {context}:{canonical}')
 path=f'foliage/{context}-{canonical}.png';(SOURCE/path).write_bytes(canonical_raw)
 image=Image.open(io.BytesIO(raw)).convert('RGBA');canonical_image=Image.open(io.BytesIO(canonical_raw)).convert('RGBA')
 runs=foot_runs(image);roots_per_tree=max(1,len(foot_runs(canonical_image)))
 # A single tree can have forked roots. Its repeated artwork preserves that
 # root pattern, so group the roots instead of spawning one tree per root.
 if name!=canonical or re.search(r'_re(?:_|$)',name):
  if len(runs)%roots_per_tree:raise ValueError(f'Unresolved repeated root layout {context}:{name}')
  centers=[(runs[i][0]+runs[i+roots_per_tree-1][1])/2/image.width for i in range(0,len(runs),roots_per_tree)]
 else:centers=[(runs[0][0]+runs[-1][1])/2/image.width] if runs else [.5]
 bounds=canonical_image.getchannel('A').getbbox();foot=bounds[3]/canonical_image.height
 top=bounds[1]/canonical_image.height;crown_width=(bounds[2]-bounds[0])/canonical_image.width
 canonical_runs=foot_runs(canonical_image);foot_u=(canonical_runs[0][0]+canonical_runs[-1][1])/2/canonical_image.width if canonical_runs else .5
 manifest.setdefault(context,{})[name]={'asset':path,'centers':centers or [.5],'footU':foot_u,'footV':foot,'topV':top,'crownWidth':crown_width}
# Some native trees kept editor material names. Resolve only exact original
# image matches; a generic name alone never makes an asset into vegetation.
images={}
for key,raw in textures.items():images.setdefault(hashlib.sha256(raw).digest(),[]).append(key)
aliases=0
for (context,name),variants in generic.items():
 # Editor names are reused for unrelated art in some texture banks.
 if len(variants)!=1:continue
 raw=next(iter(variants))
 candidates=images.get(hashlib.sha256(raw).digest(),[])
 if not candidates:continue
 owner,source=min(candidates,key=lambda pair:(pair[0]!=context,len(manifest[pair[0]][pair[1]]['centers'])!=1,int(pair[0]),pair[1]))
 family=re.sub(r'_(?:re|un)(?=_|$)','',source);family=re.sub(r'_lm\d+$','',family);family=re.sub(r'gs$','',family)
 manifest.setdefault(context,{})[name]={**manifest[owner][source],'family':family};aliases+=1
(SOURCE/'foliage.json').write_text(json.dumps(manifest,separators=(',',':'))+'\n')
print(f'Exported {len(list(OUT.glob("*.png")))} original tree textures and {len(textures)+aliases} trunk layouts ({aliases} image-proven aliases).')
