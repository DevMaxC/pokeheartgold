"""Native source, unlit top-down geometry/nearest-texture diagnostic. No browser."""
from pathlib import Path
import json,struct,base64,io,math
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parents[3];raw=(root/'browser/public/source/land/4-2.glb').read_bytes();size=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+size]);binary=raw[28+size:]
def accessor(idx):
 a=doc['accessors'][idx];view=doc['bufferViews'][a['bufferView']];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];fmt={5126:'f',5123:'H',5125:'I',5121:'B'}[a['componentType']];stride=view.get('byteStride',struct.calcsize(fmt)*n);offset=view.get('byteOffset',0)+a.get('byteOffset',0);return[struct.unpack_from('<'+fmt*n,binary,offset+i*stride)for i in range(a['count'])]
images=[Image.open(io.BytesIO(base64.b64decode(im['uri'].split(',')[1]))).convert('RGBA')for im in doc['images']];triangles=[]
for primitive in doc['meshes'][0]['primitives']:
 material=doc['materials'][primitive['material']];tex=material.get('pbrMetallicRoughness',{}).get('baseColorTexture')
 if not tex or material.get('alphaMode')=='BLEND':continue
 p=accessor(primitive['attributes']['POSITION']);uv=accessor(primitive['attributes']['TEXCOORD_0']);indices=accessor(primitive['indices']);texture=doc['textures'][tex['index']];image=images[texture['source']];sampler=doc['samplers'][texture.get('sampler',0)]
 for i in range(0,len(indices),3):
  ids=[indices[i+k][0]for k in range(3)];v=[[p[n][0]/16+528,p[n][1]/16,p[n][2]/16+400]for n in ids]
  if max(q[0]for q in v)<523 or min(q[0]for q in v)>532 or max(q[2]for q in v)<403 or min(q[2]for q in v)>410:continue
  triangles.append((v,[uv[n]for n in ids],material,tex,image,sampler))
def render(corrected):
 scale=40;width,height=360,280;out=Image.new('RGB',(width,height),'#cccccc');pixels=out.load();depth=[-math.inf]*(width*height)
 for v,uv,material,tex,image,sampler in triangles:
  a,b,c=v;den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2])
  if den==0:continue
  for py in range(max(0,math.floor((min(q[2]for q in v)-403)*scale)),min(height,math.ceil((max(q[2]for q in v)-403)*scale))):
   z=403+(py+.5)/scale
   for px in range(max(0,math.floor((min(q[0]for q in v)-523)*scale)),min(width,math.ceil((max(q[0]for q in v)-523)*scale))):
    x=523+(px+.5)/scale;wa=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den;wb=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den;wc=1-wa-wb
    if min(wa,wb,wc)<0:continue
    y=sum(w*p[1]for w,p in zip([wa,wb,wc],v));index=py*width+px
    if y<depth[index]:continue
    q=[sum(w*t[n]for w,t in zip([wa,wb,wc],uv))for n in range(2)];offset=tex.get('extensions',{}).get('KHR_texture_transform',{}).get('offset',[0,0])if corrected else[0,0];q=[x+t for x,t in zip(q,offset)]
    for axis,key in enumerate(['wrapS','wrapT']):q[axis]=min(1,max(0,q[axis]))if sampler.get(key,10497)==33071 else q[axis]%1
    rgba=image.getpixel((min(image.width-1,math.floor(q[0]*image.width)),min(image.height-1,math.floor(q[1]*image.height))))
    if material.get('alphaMode')=='MASK'and rgba[3]<128:continue
    depth[index]=y;pixels[px,py]=rgba[:3]
 return out
sheet=Image.new('RGB',(736,340),'#202b36');draw=ImageDraw.Draw(sheet);draw.text((8,7),'Native source software texture diagnostic - not a browser capture',fill='white');draw.text((8,30),'Before: omitted surf matrix',fill='white');draw.text((376,30),'After: exact native translation',fill='white');sheet.paste(render(False),(8,52));sheet.paste(render(True),(376,52));dest=root/'browser/reviews/shoreline-native-translation/native-software-diagnostic.png';sheet.save(dest);print(dest)
