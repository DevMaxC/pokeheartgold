import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Terraces} from './ledges.ts';
import {terraceModel} from './terrace-model.ts';
import {OriginalWorld} from './world.ts';
import {nativeTerraceBaseline} from '../../scripts/terrain-native-test-support.ts';
const before=await nativeTerraceBaseline();
function fixture(option=''){
 const values=new Int16Array(1024*9);for(let z=0;z<32;z++)for(let i=0;i<9;i++)values[z*32*9+i]=1;
 const field=new Terraces({version:2,scale:1,cells:{'0,0':Buffer.from(values.buffer).toString('base64')},ledges:[],cliffAssets:{}}),root=new THREE.Group(),g=new THREE.BufferGeometry(),triangles=[[[0,2,0],[0,2,2],[1,2,2]],[[0,2,0],[1,2,2],[1,2,0]],[[1,2,0],[1,2,2],[2,2,2]],[[1,2,0],[2,2,2],[2,2,0]]];
 if(option==='same-side')for(const p of triangles.slice(2).flat())p[0]=2-p[0];if(option==='third-face')triangles.push([[1,2,0],[1,2,2],[3,2,2]]);
 g.setAttribute('position',new THREE.Float32BufferAttribute(triangles.flat(2),3));g.setAttribute('uv',new THREE.Float32BufferAttribute(triangles.flatMap((t,i)=>t.flatMap(p=>[p[2],i<2?0:1])),2));g.setAttribute('color',new THREE.Float32BufferAttribute(triangles.flatMap((t,i)=>t.flatMap(p=>[p[2]/2,i<2?0:1,.5])),3));const m=new THREE.MeshBasicMaterial({side:THREE.DoubleSide,vertexColors:true});m.name='grass01';if(option==='mask')m.alphaTest=.5;if(option==='water')m.name='water01';if(option==='front-only')m.side=THREE.FrontSide;
 const mesh=new THREE.Mesh(g,m);mesh.name='native';if(option==='foreign'){for(const[start,count]of[[0,6],[6,6]]){const geometry=g.clone();geometry.setDrawRange(start,count);root.add(new THREE.Mesh(geometry,m));}}else root.add(mesh);if(option==='rotated')root.rotation.y=.5;if(option==='scaled')root.scale.setScalar(2);if(option==='rooted')g.setAttribute('sceneryRoot',new THREE.Float32BufferAttribute(Array.from({length:g.getAttribute('position').count},()=>[0,0,0,1]).flat(),4));return{field,root,g,m};
}
function surfaces(root:THREE.Group){return root.children.filter(o=>o.name==='source-terrace-surface').map(o=>{const mesh=o as THREE.Mesh;return{material:mesh.material,groups:mesh.geometry.groups,attributes:Object.fromEntries(['position','uv','color'].map(k=>[k,Array.from(mesh.geometry.getAttribute(k).array)]))};});}
function joints(root:THREE.Group){return root.children.filter(o=>o.name==='source-terrace-joint')as THREE.Mesh[];}
test('a literal native UP↔UP edge closes only the exact stored relief strip with both original branches and own artwork preserved',async()=>{
 const f=fixture(),a=f.root.clone(),source=Array.from(f.g.getAttribute('position').array);await before(a,f.field);await terraceModel(f.root,f.field);assert.deepEqual(surfaces(f.root),surfaces(a));const added=joints(f.root);assert.equal(added.length,1);assert.equal(added[0].material,f.m);assert.equal(added[0].userData.terrainSceneryCoverageOnly,true);const p=added[0].geometry.getAttribute('position'),uv=added[0].geometry.getAttribute('uv'),color=added[0].geometry.getAttribute('color');assert.equal(p.count,6);for(let i=0;i<p.count;i++){assert.equal(p.getX(i),1);assert.ok(p.getY(i)===2||p.getY(i)===3);assert.ok(p.getZ(i)===0||p.getZ(i)===2);const originalSide=p.getY(i)===3?0:1;assert.deepEqual([uv.getX(i),uv.getY(i)],[p.getZ(i),originalSide]);assert.deepEqual([color.getX(i),color.getY(i),color.getZ(i)],[p.getZ(i)/2,originalSide,.5]);}assert.deepEqual(Array.from(f.g.getAttribute('position').array),source);
});
for(const option of['foreign','mask','water','front-only','same-side','third-face','rotated','scaled','rooted'])test(option+' cannot supply new upward relief-strip authority',async()=>{const f=fixture(option);await terraceModel(f.root,f.field);assert.equal(joints(f.root).length,0);});
test('a continuous field has no missing strip and cannot create an internal wall',async()=>{const f=fixture();const flat=new Terraces({version:2,scale:1,cells:{},ledges:[],cliffAssets:{}});await terraceModel(f.root,flat);assert.equal(joints(f.root).length,0);});
test('release disposes a shared placed relief-join geometry once while preserving original template materials/maps/buffers',async()=>{
 const f=fixture(),texture=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);f.m.map=texture;await terraceModel(f.root,f.field);const mesh=joints(f.root)[0];assert.ok(mesh);const duplicate=new THREE.Mesh(mesh.geometry,mesh.material);duplicate.name=mesh.name;f.root.add(duplicate);const scene=new THREE.Scene();scene.add(f.root);const calls=new Map<object,number>();for(const resource of[mesh.geometry,f.g,f.m,texture])resource.addEventListener('dispose',()=>calls.set(resource,(calls.get(resource)??0)+1));const world=Object.create(OriginalWorld.prototype);world.scene=scene;world.releaseCell({group:f.root});assert.equal(calls.get(mesh.geometry),1);for(const resource of[f.g,f.m,texture])assert.equal(calls.get(resource),undefined);assert.equal(f.root.parent,null);
});

test('only complete explicit native coverage in the actual owning cell suppresses a redundant strip',async()=>{
 for(const option of['complete','partial','foreign','missing-profile']){const f=fixture();f.root.position.set(16,0,16);const p=f.g.getAttribute('position');for(let i=0;i<p.count;i++)p.setZ(i,p.getZ(i)/2);const values=new Int16Array(1024*9);for(let z=0;z<32;z++)for(let r=0;r<3;r++)for(let c=0;c<3;c++)values[(z*32+16)*9+r*3+c]=c===1?2:1;
  const ledger=option==='foreign'?[1,0,57]:[17,16,57],key=ledger[0]+','+ledger[1],profile=option==='partial'?[2,2,2,1.5,1.5,1.5]:[2,2,2,2,2,2],field=new Terraces({version:2,scale:1,cells:{'0,0':Buffer.from(values.buffer).toString('base64')},ledges:[ledger as[number,number,number]],cliffAssets:{},nativeEdges:option==='missing-profile'?{}:{[key]:profile}});await terraceModel(f.root,field);const added=joints(f.root);if(option==='complete')assert.equal(added.length,0,'the actual six-height native wall fully covers both half-grid strip intervals');else assert.ok(added.length>0,option+' cannot establish complete same-cell coverage');
 }
});

test('a large foreign native-ledge inventory yields and cancels before hiding the original source',async()=>{
 const f=fixture(),field=new Terraces({...f.field.data,ledges:Array.from({length:5000},(_,i)=>[1000+i,1000,57]as[number,number,number])});let calls=0;assert.equal(await terraceModel(f.root,field,()=>++calls<3),false);assert.equal(calls,3);assert.equal(f.root.children.length,1);assert.equal(f.root.children[0].visible,true);assert.equal(joints(f.root).length,0);
});

test('actual native UV endpoint bits survive a tiny atlas coordinate opposite a unit coordinate',async()=>{
 const f=fixture(),p=f.g.getAttribute('position'),uv=f.g.getAttribute('uv');for(let i=0;i<p.count;i++)uv.setX(i,p.getZ(i)===2?1e-10:1);await terraceModel(f.root,f.field);const added=joints(f.root)[0];assert.ok(added);const q=added.geometry.getAttribute('position'),u=added.geometry.getAttribute('uv');for(let i=0;i<q.count;i++)assert.equal(u.getX(i),q.getZ(i)===2?Math.fround(1e-10):1,'new endpoint artwork equals its actual original Float32 coordinate');
});

test('a sloped branch with unmatched interior cuts is declined rather than approximated by a nearby Float32 sample',async()=>{
 const f=fixture(),position=f.g.getAttribute('position');for(let i=0;i<position.count;i++)position.setY(i,position.getY(i)+position.getZ(i)*.5);const values=new Int16Array(1024*9);for(let z=0;z<32;z++)for(let r=0;r<3;r++)for(let c=0;c<3;c++)values[z*32*9+r*3+c]=c===1?2:1;const field=new Terraces({...f.field.data,cells:{'0,0':Buffer.from(values.buffer).toString('base64')}});await terraceModel(f.root,field);assert.equal(joints(f.root).length,0);
});

test('production native corner walls fully covering a future strip have the same suppression authority as main ledges',async()=>{
 const f=fixture();f.root.position.set(16,0,16);const p=f.g.getAttribute('position');for(let i=0;i<p.count;i++)p.setZ(i,p.getZ(i)/2);const values=new Int16Array(1024*9);for(let z=0;z<32;z++)for(let r=0;r<3;r++)for(let c=0;c<3;c++)values[(z*32+16)*9+r*3+c]=c===1?2:1;
 const edge:[number,number,number]=[17,16,57],field=new Terraces({version:2,scale:1,cells:{'0,0':Buffer.from(values.buffer).toString('base64')},ledges:[],cornerEdges:[edge],nativeCornerEdges:{[edge.join(',')]:[2,2,2,2,2,2]},cliffAssets:{}}),{terraceWalls}=await import('./terrace-model.ts'),wall=terraceWalls(field,{x:0,z:0,altitude:0,land:0,asset:'native.glb',props:[]},{permissions:Array(1024).fill(0),plates:[]},f.m);assert.ok(wall,'production really emits this exact two-half native wall');
 await terraceModel(f.root,field);assert.equal(joints(f.root).length,0,'an already fully covered native corner wall must not acquire a second coplanar source join');
});

for(const option of['partial','foreign','missing-profile','main-profile-key'])test('production corner '+option+' cannot suppress an uncovered native strip',async()=>{
 const f=fixture();f.root.position.set(16,0,16);const p=f.g.getAttribute('position');for(let i=0;i<p.count;i++)p.setZ(i,p.getZ(i)/2);const values=new Int16Array(1024*9);for(let z=0;z<32;z++)for(let r=0;r<3;r++)for(let c=0;c<3;c++)values[(z*32+16)*9+r*3+c]=c===1?2:1;
 const edge:[number,number,number]=option==='foreign'?[49,16,57]:[17,16,57],key=option==='main-profile-key'?edge.slice(0,2).join(','):edge.join(','),profile=option==='partial'?[2,2,2,1.5,1.5,1.5]:[2,2,2,2,2,2],field=new Terraces({version:2,scale:1,cells:{'0,0':Buffer.from(values.buffer).toString('base64')},ledges:[],cornerEdges:[edge],nativeCornerEdges:option==='missing-profile'?{}:{[key]:profile},cliffAssets:{}});
 await terraceModel(f.root,field);assert.ok(joints(f.root).length>0,'only literal whole-strip owning-cell corner coverage is authority');
 const{terraceWalls}=await import('./terrace-model.ts'),make=()=>terraceWalls(field,{x:0,z:0,altitude:0,land:0,asset:'native.glb',props:[]},{permissions:Array(1024).fill(0),plates:[]},f.m);
 if(option==='missing-profile'||option==='main-profile-key')assert.throws(make,/Missing native ledge corner profile/,'the existing production error is retained');else if(option==='foreign')assert.equal(make(),null,'a foreign cell cannot render or suppress an owning-cell wall');else assert.ok(make(),'partial native walls remain rendered without suppressing the uncovered strip');
});
