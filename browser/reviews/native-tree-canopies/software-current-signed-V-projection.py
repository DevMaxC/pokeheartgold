import json,base64,hashlib
import numpy as np
from PIL import Image,ImageDraw,ImageFont
p=json.load(open('/tmp/hg-tree-resolution/final-current-geometry.json'));N=240;span=70
views=[('front',(0,22,150)),('back',(0,22,-150)),('side',(-150,22,0)),('above',(0,172,0)),('quarter',(110,105,130))]
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',15)
canvas=Image.new('RGB',(len(views)*N,len(p['results'])*(N+34)+64),(240,239,229));d=ImageDraw.Draw(canvas);d.text((8,5),'Actual native candidate families, radial trees and native palm fronds — unlit software projection, NOT browser/GPU proof',fill=(25,30,28),font=font)
reports=[]
for row,r in enumerate(p['results']):
 tris=[];uvs=[];tex=None;tints=[];textures=[];wraps=[];wrapTs=[]
 for surf in r['surfaces']:
  count=len(surf['positions'])//9;tints.extend([surf['tint']]*count);wraps.extend([surf['wrap']]*count);wrapTs.extend([surf.get('wrapT',1001)]*count);tris.extend(np.array(surf['positions']).reshape((-1,3,3)));uvs.extend(np.array(surf['uv']).reshape((-1,3,2)));tex=np.frombuffer(base64.b64decode(surf['texture']['data']),dtype=np.uint8).reshape((surf['texture']['height'],surf['texture']['width'],4))
  textures.extend([tex]*count)
 tris=np.array(tris);uvs=np.array(uvs);tints=np.array(tints);normals=np.cross(tris[:,1]-tris[:,0],tris[:,2]-tris[:,0]);minimum=tris.reshape((-1,3)).min(axis=0);maximum=tris.reshape((-1,3)).max(axis=0);target=(minimum+maximum)/2;span=max(maximum-minimum)*1.4;
 for col,(label,pos) in enumerate(views):
  relative={'front':(0,0,3),'back':(0,0,-3),'side':(-3,0,0),'above':(0,3,0),'quarter':(2,1.5,2)}[label];eye=target+np.array(relative)*span;forward=target-eye;forward/=np.linalg.norm(forward);up=np.array([0,1,0.]) if label!='above' else np.array([0,0,-1.]);right=np.cross(forward,up);right/=np.linalg.norm(right);up=np.cross(right,forward);q=tris-target;screen=np.stack((q@right/ span*N+N/2,-q@up/span*N+N/2),axis=-1);depth=(tris-eye)@forward;image=np.full((N,N,3),[224,230,218],dtype=np.uint8);zbuf=np.full((N,N),np.inf)
  for i,pts in enumerate(screen):
   if np.dot(normals[i],eye-tris[i].mean(axis=0))<=0:continue
   x0=max(0,int(np.floor(pts[:,0].min())));x1=min(N,int(np.ceil(pts[:,0].max())));y0=max(0,int(np.floor(pts[:,1].min())));y1=min(N,int(np.ceil(pts[:,1].max())))
   if x1<=x0 or y1<=y0:continue
   tex=textures[i];a,b,c=pts;den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
   if abs(den)<1e-12:continue
   xx,yy=np.meshgrid(np.arange(x0,x1)+.5,np.arange(y0,y1)+.5);wa=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den;wb=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den;wc=1-wa-wb;dist=wa*depth[i,0]+wb*depth[i,1]+wc*depth[i,2];mask=(wa>=-1e-8)&(wb>=-1e-8)&(wc>=-1e-8)&(dist<zbuf[y0:y1,x0:x1]);uv=wa[...,None]*uvs[i,0]+wb[...,None]*uvs[i,1]+wc[...,None]*uvs[i,2];wrap=lambda v,mode:1-np.abs((v%2)-1) if mode==1002 else np.clip(v,0,1) if mode==1001 else v%1;tx=np.clip(np.floor(wrap(uv[...,0],wraps[i])*tex.shape[1]).astype(int),0,tex.shape[1]-1);ty=np.clip(np.floor(wrap(uv[...,1],wrapTs[i])*tex.shape[0]).astype(int),0,tex.shape[0]-1);rgb=tex[ty,tx,:3]/255;linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)*tints[i];display=np.where(linear<=.0031308,linear*12.92,1.055*linear**(1/2.4)-.055);image[y0:y1,x0:x1][mask]=np.rint(np.clip(display,0,1)*255).astype(np.uint8)[mask];zbuf[y0:y1,x0:x1][mask]=dist[mask]
  y=64+row*(N+34);canvas.paste(Image.fromarray(image),(col*N,y));d.text((col*N+5,y-24),f'{r["label"]} / {label}',fill=(25,30,28),font=font)
 # Literal closed-edge proof handles greedy-face T junctions by line interval parity.
 edges={};lines={}
 for tri in tris:
  for j in range(3):
   a=tuple(tri[j]);b=tuple(tri[(j+1)%3]);axes=[k for k in range(3) if a[k]!=b[k]]
   if len(axes)==1:
    axis=axes[0];key=(axis,)+tuple(a[k] for k in range(3) if k!=axis);ev=lines.setdefault(key,{})
    for n in [a[axis],b[axis]]:ev[n]=ev.get(n,0)+1
   else:
    key=tuple(sorted([a,b]));edges[key]=edges.get(key,0)+1
 closed=all(v%2==0 for v in edges.values()) and all(v%2==0 for ev in lines.values() for v in ev.values())
 rays=[]
 for origin,direction in [((target[0],maximum[1]+span,target[2]),(0,-1,0)),((target[0],target[1],minimum[2]-span),(0,0,1)),((target[0],target[1],maximum[2]+span),(0,0,-1)),((minimum[0]-span,target[1],target[2]),(1,0,0))]:
  o=np.array(origin);v=np.array(direction);ab=tris[:,1]-tris[:,0];ac=tris[:,2]-tris[:,0];h=np.cross(v,ac);det=(ab*h).sum(axis=1);good=abs(det)>1e-10;inv=np.zeros(len(det));inv[good]=1/det[good];s=o-tris[:,0];u=(s*h).sum(axis=1)*inv;q=np.cross(s,ab);vv=(v*q).sum(axis=1)*inv;dist=(ac*q).sum(axis=1)*inv;rays.append(bool(np.any(good&(u>=0)&(vv>=0)&(u+vv<=1)&(dist>0))))
 reports.append({k:v for k,v in r.items() if k!='surfaces'}|{'closedLiteralEdgeIntervals':closed,'fourAboveBackSideRaysHit':rays,'derivedTextureSHA':hashlib.sha256(tex.tobytes()).hexdigest()})
canvas.save('/tmp/hg-tree-resolution/native-current-five-families-fronds-v13.png');json.dump({'status':'Bounded copied resolution experiment; NOT browser/GPU/whole-tree visual approval','render':'Unlit orthographic CPU rasterization of actual candidate emitted Float32 positions/UVs + native derivedRGBA nearest pixels','results':reports},open('/tmp/hg-tree-resolution/native-current-five-families-v13-receipt.json','w'),indent=2)
