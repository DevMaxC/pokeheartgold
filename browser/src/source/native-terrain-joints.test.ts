import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Terraces} from './ledges.ts';
import {terraceModel} from './terrace-model.ts';
import {nativeTerraceBaseline} from '../../scripts/terrain-native-test-support.ts';
const before=await nativeTerraceBaseline();
const values=new Int16Array(1024*9),height=(z:number)=>z===.5||z===1.5?1:z===1?-1:0;
for(let z=0;z<32;z++)for(let x=0;x<32;x++)for(let r=0;r<3;r++)for(let c=0;c<3;c++)values[(z*32+x)*9+r*3+c]=height(z+r/2);
const relief=new Terraces({version:2,scale:1,cells:{'0,0':Buffer.from(values.buffer).toString('base64')},ledges:[],cliffAssets:{}});
function fixture(option=''){
 const root=new THREE.Group(),source=[[[0,2,0],[0,2,2],[1,2,2]],[[0,2,0],[0,0,2],[0,2,2]],[[0,2,0],[0,0,0],[0,0,2]]];
 if(option==='foreign')for(const tri of source.slice(1))for(const p of tri)p[0]+=.125;
 const geometry=new THREE.BufferGeometry(),positions=source.flat(2);geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 const uvs=source.flatMap((tri,i)=>tri.flatMap(p=>i===0?[p[0]*.25,p[2]*.25]:[p[2]/2,p[1]/2])),colors=source.flatMap((tri,i)=>tri.flatMap(p=>i===0?[1,p[0],0]:[p[1]/2,0,p[2]/2]));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.addGroup(0,3,0);geometry.addGroup(3,6,1);
 const up=new THREE.MeshBasicMaterial({vertexColors:true}),side=new THREE.MeshBasicMaterial({vertexColors:true});up.name=side.name='cliff01';if(option==='water')up.name='water01';if(option==='wall-water')side.name='water01';if(option==='mask')up.alphaTest=.5;if(option==='blend'){up.transparent=true;up.opacity=.5;}
 if(option==='standalone')geometry.setDrawRange(3,6);if(option==='rooted')geometry.setAttribute('sceneryRoot',new THREE.Float32BufferAttribute(source.flatMap(t=>t.map(()=>[0,0,0,1])).flat(),4));
 const mesh=new THREE.Mesh(geometry,[up,side]);mesh.name=option==='rigid'?'solid-original-rocks':option==='generated-wall'?'source-terrace-wall':'native';if(option==='legacy')mesh.userData.terrainSceneryCoverageOnly=true;root.add(mesh);return{root,mesh,geometry};
}
function output(root:THREE.Group){root.updateMatrixWorld(true);const rows:{slot:number;p:number[][];uv:number[][];color:number[][]}[]=[];root.traverseVisible(o=>{if(!(o instanceof THREE.Mesh)||o.name!=='source-terrace-surface')return;const g=o.geometry,p=g.getAttribute('position'),uv=g.getAttribute('uv'),color=g.getAttribute('color');for(const group of g.groups)for(let at=group.start;at<group.start+group.count;at+=3)rows.push({slot:group.materialIndex??0,p:[0,1,2].map(j=>[p.getX(at+j),p.getY(at+j),p.getZ(at+j)]),uv:[0,1,2].map(j=>[uv.getX(at+j),uv.getY(at+j)]),color:[0,1,2].map(j=>[color.getX(at+j),color.getY(at+j),color.getZ(at+j)])});});return rows;}
function segments(rows:ReturnType<typeof output>,slot:number,predicate:(p:number[])=>boolean){const out:string[]=[];for(const row of rows.filter(r=>r.slot===slot))for(let j=0;j<3;j++){const a=row.p[j],b=row.p[(j+1)%3];if(predicate(a)&&predicate(b)&&a[2]!==b[2])out.push([JSON.stringify(a),JSON.stringify(b)].sort().join('|'));}return out.sort();}
test('adjoining native ground and wall share exact LOCAL Float32 edge segments while original upward buffers and materials stay intact',async()=>{
 const a=fixture(),b=fixture(),original=Array.from(b.geometry.getAttribute('position').array);await before(a.root,relief);await terraceModel(b.root,relief);const old=output(a.root),next=output(b.root),upper=(p:number[])=>p[0]===0&&p[1]===2+relief.height(p[0],p[2]);
 assert.notDeepEqual(segments(old,0,upper),segments(old,1,upper));assert.deepEqual(segments(next,0,upper),segments(next,1,upper));assert.equal(segments(next,0,upper).length,4);assert.deepEqual(next.filter(t=>t.slot===0),old.filter(t=>t.slot===0));assert.deepEqual(Array.from(b.geometry.getAttribute('position').array),original);assert.equal(b.root.getObjectByName('source-terrace-surface')!.userData.researchOriginalFaces,undefined);assert.equal((b.root.getObjectByName('source-terrace-surface')as THREE.Mesh).material,b.mesh.material);
 const diagonal=segments(next,1,p=>p[1]===2-p[2]+relief.height(p[0],p[2])),counts=new Map<string,number>();for(const edge of diagonal)counts.set(edge,(counts.get(edge)??0)+1);assert.equal(counts.size,4);assert.ok([...counts.values()].every(n=>n===2),'native wall-internal diagonal remains shared by both original faces');
});
test('native wall UVs/colors use their own affine source coordinates rather than the upward-face donor',async()=>{
 const f=fixture();await terraceModel(f.root,relief);for(const row of output(f.root).filter(r=>r.slot===1))for(let j=0;j<3;j++){const[x,y,z]=row.p[j],rawY=y-relief.height(x,z);assert.deepEqual(row.uv[j],[Math.fround(z/2),Math.fround(rawY/2)]);assert.deepEqual(row.color[j],[Math.fround(rawY/2),0,Math.fround(z/2)]);}
});
for(const option of['standalone','foreign','water','wall-water','mask','blend','rooted','rigid','legacy','generated-wall'])test(option+' geometry does not borrow unproven native edge authority',async()=>{const a=fixture(option),b=fixture(option);await before(a.root,relief);await terraceModel(b.root,relief);assert.deepEqual(output(b.root),output(a.root));});
test('two unrelated meshes with coincident raw positions cannot lend each other native source edges',async()=>{
 const f=fixture(),g=f.geometry;f.root.remove(f.mesh);const materials=f.mesh.material as THREE.Material[];for(const[start,count,slot]of[[0,3,0],[3,6,1]]){const own=g.clone();own.setDrawRange(start,count);f.root.add(new THREE.Mesh(own,materials));}
 const original=f.root.clone();await before(original,relief);await terraceModel(f.root,relief);assert.deepEqual(output(f.root),output(original));
});
test('a real one-sided ledge discontinuity keeps both native upward heights and cannot borrow one canonical branch',async()=>{
 const data=new Int16Array(1024*9);for(let x=0;x<32;x++)for(let col=0;col<3;col++)data[x*9+6+col]=1;
 const discontinuous=new Terraces({version:2,scale:1,cells:{'0,0':Buffer.from(data.buffer).toString('base64')},ledges:[],cliffAssets:{}}),a=fixture(),b=fixture();await before(a.root,discontinuous);await terraceModel(b.root,discontinuous);const old=output(a.root),next=output(b.root);
 assert.deepEqual([...new Set(old.filter(r=>r.slot===0).flatMap(r=>r.p.filter(p=>p[0]===0&&p[2]===1).map(p=>p[1])))].sort(),[2,3]);assert.deepEqual(next,old,'ambiguous source edge preserves the original ledge and all other buffers');
});
test('a stale native edge prepass cannot hide or replace the shared source',async()=>{const f=fixture();assert.equal(await terraceModel(f.root,relief,()=>false),false);assert.equal(f.mesh.visible,true);assert.equal(f.root.children.length,1);});

test('an upward branch cannot lift an unattached wall bottom across a one-sided relief jump',async()=>{
 const values=new Int16Array(1024*9);values.fill(0);for(let z=0;z<32;z++)for(let i=0;i<9;i++)values[(z*32)*9+i]=1;
 const field=new Terraces({version:2,scale:1,cells:{'0,0':Buffer.from(values.buffer).toString('base64')},ledges:[],cliffAssets:{}}),root=new THREE.Group();
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,2,0,0,2,1,1,2,1,0,2,0,1,2,1,1,2,0,1,2,0,1,2,1,1,0,1,1,2,0,1,0,1,1,0,0],3));g.setAttribute('uv',new THREE.Float32BufferAttribute(Array(24).fill(0),2));g.setAttribute('color',new THREE.Float32BufferAttribute(Array(36).fill(1),3));g.addGroup(0,6,0);g.addGroup(6,6,1);const a=new THREE.MeshBasicMaterial(),b=new THREE.MeshBasicMaterial();a.name=b.name='cliff01';root.add(new THREE.Mesh(g,[a,b]));
 const old=root.clone();await before(old,field);await terraceModel(root,field);assert.deepEqual(output(root),output(old),'without a proven lower branch, preserve the whole ambiguous wall rather than relocating a slit to its foot');
});
