import json,struct,math,numpy as np,hashlib
from pathlib import Path
R=Path('/Users/maxchurch/Documents/pokeheartgold-background-cliffs/browser/public/source');m=json.loads((R/'matrices/0.json').read_text());cells=[];raw=[]
formats={5121:('B',1),5123:('H',2),5125:('I',4),5126:('f',4)};sizes={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
for z in range(10,15):
 for x in range(19,24):
  i=z*m['width']+x;model=m['models'][i];owner=m['headers'][i]
  if model==65535:continue
  mapData=json.loads((R/f'maps/{owner}.json').read_text());cell=next(c for c in mapData['cells']if c['x']==x and c['z']==z);p=R/cell['asset'];data=p.read_bytes();n=struct.unpack_from('<I',data,12)[0];g=json.loads(data[20:20+n]);binary=data[20+n+8:]
  def acc(ai):
   a=g['accessors'][ai];v=g['bufferViews'][a['bufferView']];fmt,size=formats[a['componentType']];nn=sizes[a['type']];stride=v.get('byteStride',nn*size);off=v.get('byteOffset',0)+a.get('byteOffset',0);return[list(struct.unpack_from('<'+fmt*nn,binary,off+j*stride))for j in range(a['count'])]
  for mi,mesh in enumerate(g['meshes']):
   for pi,prim in enumerate(mesh['primitives']):
    mat=g['materials'][prim['material']];name=mat.get('name','')
    # Restrict to literal opaque geological faces; neither foliage nor alpha cut cards are solid authority.
    if mat.get('alphaMode','OPAQUE')!='OPAQUE' or not any(k in name for k in['wall','cliff','grass','road','slope','beach']):continue
    pos=acc(prim['attributes']['POSITION']);ids=[r[0]for r in acc(prim['indices'])]
    for j in range(0,len(ids),3):
     ps=[[v/16+[x*32+16,cell['altitude']*.5,z*32+16][k]for k,v in enumerate(pos[ix])]for ix in ids[j:j+3]];raw.append({'owner':f'{x},{z}:{cell["asset"]}/mesh{mi}/primitive{pi}/triangle{j//3}','cell':[x,z],'asset':cell['asset'],'material':name,'p':ps})
  cells.append(cell)
import gzip
Path('/tmp/hg-newbark-background-cliffs/all-raw-opaque-triangles.json.gz').write_bytes(gzip.compress(json.dumps(raw).encode()))
ps=np.array([t['p']for t in raw]);v0=ps[:,0];e1=ps[:,1]-v0;e2=ps[:,2]-v0;o=np.array([695.5,6.96243845,410.47379292]);target=np.array([695.5,1.9,398.5]);forward=target-o;forward/=np.linalg.norm(forward);right=np.cross(forward,[0,1,0]);right/=np.linalg.norm(right);up=np.cross(right,forward)
def ray(pixel):
 xx=(pixel[0]/1280*2-1)*(1280/800)*math.tan(math.radians(26));yy=(1-pixel[1]/800*2)*math.tan(math.radians(26));d=forward+right*xx+up*yy;d/=np.linalg.norm(d);h=np.cross(np.broadcast_to(d,e2.shape),e2);det=(e1*h).sum(axis=1);valid=det!=0;inv=np.zeros_like(det);inv[valid]=1/det[valid];s=o-v0;u=inv*(s*h).sum(axis=1);qq=np.cross(s,e1);v=inv*(np.broadcast_to(d,qq.shape)*qq).sum(axis=1);t=inv*(e2*qq).sum(axis=1);sel=np.where(valid&(u>=0)&(v>=0)&(u+v<=1)&(t>=0)&(t<=140))[0];sel=sorted(sel,key=lambda j:t[j]);return{'pixel':pixel,'direction':d.tolist(),'hits':[{'distance':float(t[j]),'point':(o+d*t[j]).tolist(),**raw[j]}for j in sel[:3]]}
pixels=[[320,60],[350,75],[375,95],[400,110],[420,115],[450,110],[900,135],[1000,140],[1200,160],[1050,120]];result={'camera':o.tolist(),'target':target.tolist(),'fov':52,'viewport':[1280,800],'sourceOnlyRawProof':'opaque native raw faces, no current terrace deformation/props/camera smoothing: source-owner attribution only','triangles':len(raw),'cells':cells,'rays':[ray(p)for p in pixels]};Path('/tmp/hg-newbark-background-cliffs/raw-source-pixel-owner.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps([{'pixel':r['pixel'],'hits':[{k:v for k,v in h.items()if k in['owner','point','distance','material']}for h in r['hits']]}for r in result['rays']],indent=2))
