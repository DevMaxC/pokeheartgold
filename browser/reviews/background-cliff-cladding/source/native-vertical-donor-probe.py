import pathlib,json,struct,numpy as np
p=pathlib.Path('browser/public/source/land/112-9.glb');b=p.read_bytes();n=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+n]);data=b[28+n:];size={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4};fmt={5126:('f',4),5123:('H',2),5121:('B',1),5125:('I',4)}
def a(i):
 x=g['accessors'][i];v=g['bufferViews'][x['bufferView']];f,z=fmt[x['componentType']];k=size[x['type']];return np.array([struct.unpack_from('<'+f*k,data,v.get('byteOffset',0)+x.get('byteOffset',0)+j*v.get('byteStride',k*z))for j in range(x['count'])])
rows=[]
for mi,m in enumerate(g['meshes']):
 for pi,p in enumerate(m['primitives']):
  mat=g['materials'][p['material']]['name']
  if mat not in ['wall01_d','wall01_g','cliff01']:continue
  ps=a(p['attributes']['POSITION'])/16+[656,0,336];uv=a(p['attributes']['TEXCOORD_0']);ix=a(p['indices']).ravel()
  for t in range(len(ix)//3):
   ids=ix[t*3:t*3+3];points=ps[ids];normal=np.cross(points[1]-points[0],points[2]-points[0]);area=np.linalg.norm(normal)/2
   if area and abs(normal[1])/(2*area)<.7:rows.append({'material':mat,'mesh':mi,'primitive':pi,'triangle':t,'area':area,'normal':(normal/(2*area)).tolist(),'p':points.tolist(),'uv':uv[ids].tolist()})
rows.sort(key=lambda r:-r['area']);out=pathlib.Path('/tmp/hg-newbark-background-cliffs/materials/native-vertical-donors.json');out.write_text(json.dumps({'scope':'original raw112 opaque mainly vertical faces, no deformer or inferred fill','counts':{m:sum(r['material']==m for r in rows)for m in ['wall01_d','wall01_g','cliff01']},'faces':rows},indent=2));print(json.dumps({'counts':{m:sum(r['material']==m for r in rows)for m in ['wall01_d','wall01_g','cliff01']},'largest':rows[:6]},indent=2))
