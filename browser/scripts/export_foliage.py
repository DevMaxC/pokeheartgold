"""Export original individual-tree art and trunk metadata from converted landscapes."""
from pathlib import Path
import base64,io,json,re,struct
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'public/source'
OUT=SOURCE/'foliage';OUT.mkdir(exist_ok=True)
textures={}
for path in sorted((SOURCE/'land').glob('*.glb')):
 data=path.read_bytes();gltf=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]])
 context=path.stem.split('-')[-1]
 for material in gltf['materials']:
  name=material.get('name','')
  if not any(word in name.lower() for word in ['tree','bush']) or re.search(r'_un(?:_|$)',name):continue
  texture=gltf['textures'][material['pbrMetallicRoughness']['baseColorTexture']['index']]
  encoded=gltf['images'][texture['source']]['uri'].split(',')[1]
  key=(context,name);raw=base64.b64decode(encoded)
  if key in textures:assert textures[key]==raw,key
  textures[key]=raw
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
 if re.search(r'_re(?:_|$)',name):
  if len(runs)%roots_per_tree:raise ValueError(f'Unresolved repeated root layout {context}:{name}')
  centers=[(runs[i][0]+runs[i+roots_per_tree-1][1])/2/image.width for i in range(0,len(runs),roots_per_tree)]
 else:centers=[.5]
 foot=canonical_image.getchannel('A').getbbox()[3]/canonical_image.height
 manifest.setdefault(context,{})[name]={'asset':path,'centers':centers or [.5],'footV':foot}
(SOURCE/'foliage.json').write_text(json.dumps(manifest,separators=(',',':'))+'\n')
print(f'Exported {len(list(OUT.glob("*.png")))} original tree textures and {len(textures)} trunk layouts.')
