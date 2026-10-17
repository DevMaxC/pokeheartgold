import * as THREE from 'three';
import type {BuildingEntrance} from './render-repair.ts';

type Face={p:THREE.Vector3[];uv:THREE.Vector2[];color:THREE.Color[];material:THREE.MeshBasicMaterial};
export type FrontierBuildingShell={family:'battle-castle'|'battle-factory'|'cerulean-cycle-shop';triangles:number;removedPanels:number;removedHullFaces?:number};
const near=(a:number,b:number)=>Math.abs(a-b)<.035;
function nativeFaces(root:THREE.Object3D){
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),out:Face[]=[];
 root.traverse(o=>{
  if(!(o instanceof THREE.Mesh)||o instanceof THREE.InstancedMesh||o.name.startsWith('3d-')||o.name==='entrance-rear-wall'||o.name.startsWith('frontier-building-'))return;
  const g=o.geometry,p=g.getAttribute('position'),uv=g.getAttribute('uv'),color=g.getAttribute('color'),index=g.index,materials=Array.isArray(o.material)?o.material:[o.material];
  for(const group of g.groups.length?g.groups:[{start:0,count:index?.count??p.count,materialIndex:0}]){const material=materials[group.materialIndex??0]as THREE.MeshBasicMaterial;if(!material.visible||material.opacity<.5||/kage|shadow|light/i.test(material.name))continue;for(let i=group.start;i<group.start+group.count;i+=3){const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),points=ids.map(id=>o.getVertexPosition(id,new THREE.Vector3()).applyMatrix4(o.matrixWorld).applyMatrix4(inverse));if(new THREE.Triangle(...points as[THREE.Vector3,THREE.Vector3,THREE.Vector3]).getArea()<1e-6)continue;out.push({p:points,uv:ids.map(id=>uv?new THREE.Vector2(uv.getX(id),uv.getY(id)):new THREE.Vector2()),color:ids.map(id=>color?new THREE.Color(color.getX(id),color.getY(id),color.getZ(id)):new THREE.Color(1,1,1)),material});}}
 });return out;
}
function hideEntrancePanels(root:THREE.Object3D){let count=0;root.traverse(o=>{if(o.name==='entrance-rear-wall'&&o.visible){o.visible=false;count++;}});return count;}
function castle(root:THREE.Object3D,source:Face[]):FrontierBuildingShell|null{
 // D32_S01 has a stepped west rear, an upper hall and independent turrets.
 // The existing per-component repair closes its source omissions correctly.
 // A later entrance silhouette unnecessarily flattens that entire castle
 // into one enormous wall, with roof atlas pixels stretched down to ground.
 const rearBands:[string,number,number][]=[['d32_s01c_lm1',2.21875,58.9921875],['d32_s01c_lm1',58.9921875,85.234375],['d32_s01b_lm1',85.234375,98.4765625]];
 if(!rearBands.every(([name,bottom,top])=>source.some(f=>f.material.name===name&&f.p.every(p=>near(p.x,-113.296875))&&near(Math.min(...f.p.map(p=>p.y)),bottom)&&near(Math.max(...f.p.map(p=>p.y)),top))))return null;
 if(!source.some(f=>f.material.name==='d32_s01c_lm1'&&f.p.every(p=>near(p.x,-35.0234375))&&f.p.some(p=>near(p.y,134.3125)))||!source.some(f=>f.material.name==='d32_s01a_lm1'&&f.p.some(p=>p.y>216)))return null;
 // This component already has a complete native hip roof. Its convex
 // backing projects the ridge onto the rear eave plane, producing a beige
 // wedge above that roof. Remove exactly that three-facet hull, retaining
 // every other backing and the native rear/body bands surrounding it.
 const inverse=root.matrixWorld.clone().invert(),replacements:{original:THREE.Mesh;replacement:THREE.Mesh;triangles:number}[]=[];
 root.traverse(o=>{if(!(o instanceof THREE.Mesh)||o.name!=='3d-solid-backing')return;const g=o.geometry,p=g.getAttribute('position'),index=g.index,keep:number[]=[];let removed=0;for(let i=0;i<(index?.count??p.count);i+=3){const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),points=ids.map(id=>o.getVertexPosition(id,new THREE.Vector3()).applyMatrix4(o.matrixWorld).applyMatrix4(inverse));if(points.every(q=>Math.abs(q.z-39.503125)<.003)&&points.some(q=>q.y>145)){removed++;continue;}keep.push(...ids);}if(removed!==3)return;const geometry=g.clone();geometry.setIndex(keep);geometry.computeVertexNormals();const material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone(),replacement=new THREE.Mesh(geometry,material);replacement.name='frontier-building-castle-backing';replacement.position.copy(o.position);replacement.quaternion.copy(o.quaternion);replacement.scale.copy(o.scale);replacement.matrixAutoUpdate=o.matrixAutoUpdate;replacement.matrix.copy(o.matrix);replacements.push({original:o,replacement,triangles:keep.length/3});});
 let triangles=0;for(const r of replacements){r.original.visible=false;r.original.parent!.add(r.replacement);triangles+=r.triangles;}
 return{family:'battle-castle',triangles,removedPanels:hideEntrancePanels(root),removedHullFaces:replacements.length*3};
}
function cycleShop(root:THREE.Object3D,source:Face[],doors:BuildingEntrance[]):FrontierBuildingShell|null{
 const inverse=root.matrixWorld.clone().invert();if(doors.some(d=>{const p=new THREE.Vector3(d.x,root.getWorldPosition(new THREE.Vector3()).y,d.z).applyMatrix4(inverse),direction=d.axis===undefined?null:new THREE.Vector3(d.axis===0?d.sign??1:0,0,d.axis===2?d.sign??1:0).transformDirection(inverse);return Math.abs(p.x)<44&&Math.abs(p.z+24)<12&&(!direction||direction.z<-.6);}))return null;
 // The side atlas contains a plain gray lower wall and the actual orange /
 // gray upper bands. Reuse those, rather than reflecting the front curtains
 // and recessed shop entrance onto its back. The three upper window bays
 // and the authored front awning remain in the existing component repair.
 const lower=source.find(f=>f.material.name==='hdc_cy05'&&f.p.every(p=>near(p.x,-36))&&near(Math.min(...f.p.map(p=>p.y)),2)&&near(Math.max(...f.p.map(p=>p.y)),33)),upper=source.find(f=>f.material.name==='hdc_cy04'&&f.p.every(p=>near(p.x,-36))&&f.p.some(p=>near(p.y,33))&&f.p.some(p=>near(p.y,64)));
 if(!lower||!upper)return null;
 const groups=new Map<THREE.MeshBasicMaterial,{positions:number[];uvs:number[];colors:number[]}>();
 const append=(points:THREE.Vector3[],face:Face)=>{
  let group=groups.get(face.material);if(!group){group={positions:[],uvs:[],colors:[]};groups.set(face.material,group);}
  // Both measured side-wall bands use one opaque atlas column. Sampling
  // that native column retains their exact height and avoids UV extrapolation.
  const min=Math.min(...face.p.map(p=>p.y)),max=Math.max(...face.p.map(p=>p.y)),bottom=face.p.findIndex(p=>near(p.y,min)),top=face.p.findIndex(p=>near(p.y,max));
  for(const i of[0,1,2,0,2,3]){const t=(points[i].y-min)/(max-min),uv=face.uv[bottom].clone().lerp(face.uv[top],t),color=face.color[bottom].clone().lerp(face.color[top],t);group.positions.push(...points[i].toArray());group.uvs.push(...uv.toArray());group.colors.push(...color.toArray());}
 };
 const rear=-24.02,join=-19.7578125;
 for(const[bottom,top,face]of[[2,33,lower],[33,41.1953125,upper]]as const)append([new THREE.Vector3(-36,bottom,rear),new THREE.Vector3(36,bottom,rear),new THREE.Vector3(36,top,rear),new THREE.Vector3(-36,top,rear)],face);
 // Upper windows are recessed into a narrower facade. Retain that native
 // window bank, backing it inside the wall and closing the two outer jambs.
 // Without these strips the removed generic hull leaves an upper corner gap.
 append([new THREE.Vector3(-36,41.1953125,join-.02),new THREE.Vector3(36,41.1953125,join-.02),new THREE.Vector3(36,64,join-.02),new THREE.Vector3(-36,64,join-.02)],upper);
 append([new THREE.Vector3(-36,41.1953125,rear),new THREE.Vector3(36,41.1953125,rear),new THREE.Vector3(36,41.1953125,join-.02),new THREE.Vector3(-36,41.1953125,join-.02)],upper);
 for(const[left,right]of[[-36,-31.7578125],[31.7578125,36]])append([new THREE.Vector3(left,41.1953125,rear),new THREE.Vector3(right,41.1953125,rear),new THREE.Vector3(right,64,rear),new THREE.Vector3(left,64,rear)],upper);
 // Return each rear corner to the measured original side wall. This closes
 // the small depth difference between the roof/window eaves and body plane.
 for(const x of[-36,36])for(const[bottom,top,face]of[[2,33,lower],[33,64,upper]]as const)append([new THREE.Vector3(x,bottom,rear),new THREE.Vector3(x,bottom,join),new THREE.Vector3(x,top,join),new THREE.Vector3(x,top,rear)],face);
 let triangles=0;for(const[original,data]of groups){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(data.uvs,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(data.colors,3));geometry.computeVertexNormals();const material=original.clone();material.side=THREE.DoubleSide;material.transparent=false;material.opacity=1;material.alphaTest=0;material.depthWrite=true;material.vertexColors=true;const mesh=new THREE.Mesh(geometry,material);mesh.name='frontier-building-cycle-rear-'+original.name;root.add(mesh);triangles+=data.positions.length/9;}
 return{family:'cerulean-cycle-shop',triangles,removedPanels:hideEntrancePanels(root)};
}
function factory(root:THREE.Object3D,source:Face[],doors:BuildingEntrance[]):FrontierBuildingShell|null{
 const inverse=root.matrixWorld.clone().invert();if(doors.some(d=>{const p=new THREE.Vector3(d.x,root.getWorldPosition(new THREE.Vector3()).y,d.z).applyMatrix4(inverse),direction=d.axis===undefined?null:new THREE.Vector3(d.axis===0?d.sign??1:0,0,d.axis===2?d.sign??1:0).transformDirection(inverse);return Math.abs(p.z)<94&&p.x>67&&p.x<114&&(!direction||direction.x>.6);}))return null;
 const b='d32_s03b_lm4',roof='d32_s03a_lm3',point=(p:number[])=>new THREE.Vector3(...p as[number,number,number]);
 const find=(name:string,points:number[][])=>source.find(f=>f.material.name===name&&points.every(p=>f.p.some(q=>q.distanceTo(point(p))<.035)));
 const gray=find(b,[[-79,3,82],[79,3,82],[79,82,82]]),rim=find(b,[[-96.328125,98,92.1640625],[-96.328125,98,55.0234375],[-96.328125,78.8984375,55.0234375]]),slope=find(roof,[[101.3125,98,-92.1640625],[85.3125,127.2578125,-92.1640625],[85.3125,127.2578125,-45.40625]]);
 if(!gray||!rim||!slope)return null;
 const patches:{original:number[][];replacement:number[][]}[]=[
  {original:[[-110.109375,115.3671875,-16.5859375],[-79,115.3671875,-16.609375],[-79,126.9453125,-21.46875]],replacement:[[-110.109375,115.3671875,15.9375],[-79,115.3671875,15.6875],[-79,126.9453125,20.7421875]]},
  {original:[[-110.109375,115.3671875,-16.5859375],[-79,126.9453125,-21.46875],[-98,157,-34]],replacement:[[-110.109375,115.3671875,15.9375],[-79,126.9453125,20.7421875],[-98,157,34]]},
  {original:[[-79,126.9453125,-21.46875],[-52.703125,157,-34],[-53,198,-51]],replacement:[[-79,126.9453125,20.7421875],[-52.703125,157,34],[-53,198,52]]},
  {original:[[-79,126.9453125,-21.46875],[-53,198,-51],[-98,157,-34]],replacement:[[-79,126.9453125,20.7421875],[-53,198,52],[-98,157,34]]},
  {original:[[-52.703125,157,-34],[52.703125,157,-34],[53,198,-51]],replacement:[[-52.703125,157,34],[52.703125,157,34],[53,198,52]]},
  {original:[[-52.703125,157,-34],[53,198,-51],[-53,198,-51]],replacement:[[-52.703125,157,34],[53,198,52],[-53,198,52]]},
  {original:[[52.703125,157,-34],[79,126.9453125,-21.46875],[96.0859375,157,-34]],replacement:[[52.703125,157,34],[79,126.9453125,20.7421875],[96.0859375,157,34]]},
  {original:[[52.703125,157,-34],[96.0859375,157,-34],[53,198,-51]],replacement:[[52.703125,157,34],[96.0859375,157,34],[53,198,52]]},
  {original:[[79,126.9453125,-21.46875],[79,115.828125,-16.8359375],[108.1953125,115.3671875,-16.5859375]],replacement:[[79,126.9453125,20.7421875],[79,115.3671875,15.6875],[108.1953125,115.3671875,15.828125]]},
  {original:[[79,126.9453125,-21.46875],[108.1953125,115.3671875,-16.5859375],[96.0859375,157,-34]],replacement:[[79,126.9453125,20.7421875],[108.1953125,115.3671875,15.828125],[96.0859375,157,34]]},
  {original:[[-110.109375,115.3671875,22.828125],[-79,115.3671875,22.75],[-79,127.3984375,28.0078125]],replacement:[[-110.109375,115.3671875,-23.5859375],[-79,115.3671875,-23.765625],[-79,127.3984375,-28.765625]]},
  {original:[[-110.109375,115.3671875,22.828125],[-79,127.3984375,28.0078125],[-98,157,41]],replacement:[[-110.109375,115.3671875,-23.5859375],[-79,127.3984375,-28.765625],[-98,157,-41]]},
  {original:[[-79,127.3984375,28.0078125],[-52.703125,157,41],[-53,198,59]],replacement:[[-79,127.3984375,-28.765625],[-52.703125,157,-41],[-53,198,-58]]},
  {original:[[-79,127.3984375,28.0078125],[-53,198,59],[-98,157,41]],replacement:[[-79,127.3984375,-28.765625],[-53,198,-58],[-98,157,-41]]},
  {original:[[-52.703125,157,41],[52.703125,157,41],[53,198,59]],replacement:[[-52.703125,157,-41],[52.703125,157,-41],[53,198,-58]]},
  {original:[[-52.703125,157,41],[53,198,59],[-53,198,59]],replacement:[[-52.703125,157,-41],[53,198,-58],[-53,198,-58]]},
  {original:[[52.703125,157,41],[79,127.3984375,28.0078125],[96.0859375,157,41]],replacement:[[52.703125,157,-41],[79,127.3984375,-28.765625],[96.0859375,157,-41]]},
  {original:[[52.703125,157,41],[96.0859375,157,41],[53,198,59]],replacement:[[52.703125,157,-41],[96.0859375,157,-41],[53,198,-58]]},
  {original:[[79,127.3984375,28.0078125],[79,115.3671875,22.75],[108.1953125,115.3671875,22.828125]],replacement:[[79,127.3984375,-28.765625],[79,115.3671875,-23.765625],[108.1953125,115.3671875,-23.5859375]]},
  {original:[[79,127.3984375,28.0078125],[108.1953125,115.3671875,22.828125],[96.0859375,157,41]],replacement:[[79,127.3984375,-28.765625],[108.1953125,115.3671875,-23.5859375],[96.0859375,157,-41]]},
 ];
 const counterparts=patches.map(p=>find(b,p.original));if(counterparts.some(f=>!f)||!source.some(f=>f.material.name===b&&f.p.some(p=>near(p.y,198)&&near(p.z,52))))return null;
 const groups=new Map<THREE.MeshBasicMaterial,{positions:number[];uvs:number[];colors:number[]}>();
 const append=(points:THREE.Vector3[],face:Face,samples:THREE.Vector3[])=>{let group=groups.get(face.material);if(!group){group={positions:[],uvs:[],colors:[]};groups.set(face.material,group);}for(let i=1;i<points.length-1;i++)for(const j of[0,i,i+1]){const bary=THREE.Triangle.getBarycoord(samples[j],...face.p as[THREE.Vector3,THREE.Vector3,THREE.Vector3],new THREE.Vector3())!,uv=face.uv[0].clone().multiplyScalar(bary.x).addScaledVector(face.uv[1],bary.y).addScaledVector(face.uv[2],bary.z),color=face.color[0].clone().multiplyScalar(bary.x).add(face.color[1].clone().multiplyScalar(bary.y)).add(face.color[2].clone().multiplyScalar(bary.z));group.positions.push(...points[j].toArray());group.uvs.push(...uv.toArray());group.colors.push(...color.toArray());}};
 // The fixed camera model authored only the positive fin's outside and the
 // negative fin's inside. Their other two skins were omitted despite native
 // top and end thickness. Follow those authored edges with matching panels.
 patches.forEach((p,i)=>append(p.replacement.map(point),counterparts[i]!,p.original.map(point)));
 const grayQuad=(points:number[][])=>append(points.map(point),gray,points.map(()=>gray.p[0]));
 grayQuad([[79.01,3,-82],[79.01,3,82],[79.01,82,82],[79.01,82,-82]]);
 // The rear fin support closes at the existing header, not up to its tip.
 grayQuad([[79.01,82,-16.8359375],[79.01,82,15.6875],[79.01,115.3671875,15.6875],[79.01,115.828125,-16.8359375]]);
 // The missing east eave is the same measured band as the existing west
 // eave. Repeat its atlas bays rather than stretching a giant wall texture.
 const width=92.1640625-55.0234375;for(let z=-92.1640625;z<92.163;z+=width){const end=Math.min(z+width,92.1640625),nativeEnd=55.0234375+end-z,p=[[101.3125,78.8984375,z],[101.3125,78.8984375,end],[101.3125,98,end],[101.3125,98,z]],samples=[[-96.328125,78.8984375,55.0234375],[-96.328125,78.8984375,nativeEnd],[-96.328125,98,nativeEnd],[-96.328125,98,55.0234375]];append(p.map(point),rim,samples.map(point));}
 // Complete the one omitted north-east diagonal eave using its actual
 // south-east counterpart. The west entrance opening stays untouched.
 for(const coordinates of[[[101.3125,98,92.1640625],[22.09375,98,135],[22.09375,78.8984375,135]],[[101.3125,98,92.1640625],[22.09375,78.8984375,135],[101.3125,78.8984375,92.1640625]]]){const face=find(b,coordinates);if(!face)return null;append(coordinates.map(p=>new THREE.Vector3(p[0],p[1],-p[2])),face,coordinates.map(point));}
 // The rear hood's central slope stops at the same two source profiles as
 // its adjacent blue panels. It is not a vertical silhouette of the fins.
 const bay=92.1640625-45.40625;for(let z=-45.40625;z<45.405;z+=bay){const end=Math.min(z+bay,45.40625),nativeEnd=-92.1640625+end-z,p=[[101.3125,98,z],[101.3125,98,end],[85.3125,127.2578125,end],[85.3125,127.2578125,z]],samples=[[101.3125,98,-92.1640625],[101.3125,98,nativeEnd],[85.3125,127.2578125,nativeEnd],[85.3125,127.2578125,-92.1640625]];append(p.map(point),slope,samples.map(point));}
 const step=find(roof,[[85.3125,127.2578125,92.1640625],[85.3125,127.2578125,45.40625],[85.3125,138,51.015625]]);if(!step)return null;
 // The hood has a second, vertical blue course before its top slope. Its
 // center was omitted along with the lower rear hood, leaving a thin escape
 // for diagonal rays just above the127.2578-unit join.
 for(const sign of[-1,1]){const p=[[85.3125,127.2578125,sign*45.40625],[85.3125,127.2578125,0],[85.3125,138,0],[85.3125,138,sign*51.015625]],samples=[[85.3125,127.2578125,45.40625],[85.3125,127.2578125,92.1640625],[85.3125,138,92.1640625],[85.3125,138,51.015625]];append(p.map(point),step,samples.map(point));}
 let triangles=0;for(const[original,data]of groups){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(data.uvs,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(data.colors,3));geometry.computeVertexNormals();const material=original.clone();material.side=THREE.DoubleSide;material.transparent=false;material.opacity=1;material.alphaTest=0;material.depthWrite=true;material.vertexColors=true;const mesh=new THREE.Mesh(geometry,material);mesh.name='frontier-building-factory-'+original.name;root.add(mesh);triangles+=data.positions.length/9;}
 return{family:'battle-factory',triangles,removedPanels:hideEntrancePanels(root)};
}
/** Source-specific castle, Factory and cycle-shop closures. The Factory's
 * gray foundation and D32_S04 (266) purple walls remain authored source art. */
export function closeFrontierBuildingShell(root:THREE.Object3D,asset:string,doors:BuildingEntrance[]=[]):FrontierBuildingShell|null{
 const match=asset.match(/(?:^|\/)1-(263|265|278)-\d+\.glb$/);if(!match)return null;const previous=root.userData.frontierBuildingShell as FrontierBuildingShell|undefined;if(previous)return previous;const source=nativeFaces(root),id=Number(match[1]),result=id===263?castle(root,source):id===265?factory(root,source,doors):cycleShop(root,source,doors);if(result)root.userData.frontierBuildingShell=result;return result;
}
