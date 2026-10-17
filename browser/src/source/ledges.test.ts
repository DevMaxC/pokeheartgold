import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ledgeDirection,jumpHeight,Terraces,type TerraceData} from './ledges.ts';
import {readFile} from 'node:fs/promises';

test('native ledges allow only their original downhill jump direction',()=>{
 for(const [permission,direction]of [[56,3],[57,2],[58,0],[59,1]]){assert.equal(ledgeDirection(permission|0x8000),direction);}assert.equal(ledgeDirection(0x8000),null);assert.equal(ledgeDirection(0x65),null);
});
test('jump arcs connect actual terrace heights continuously without overshooting the endpoints',()=>{
 assert.equal(jumpHeight(2.1,1,0),2.1);assert.ok(Math.abs(jumpHeight(2.1,1,1)-1)<1e-10);assert.equal(jumpHeight(2.1,1,.5),2.2);assert.ok(jumpHeight(2.1,1,.25)>2.1);
});
test('exported Route 29 ledges have distinct upper/lower heights and continuous open edges across cell borders',async()=>{
 const data=JSON.parse(await readFile(new URL('../../public/source/terraces/0.json',import.meta.url),'utf8')) as TerraceData,terrain=new Terraces(data);
 // South ledge: native upper/lower BDHC heights are both 1.
 assert.ok(terrain.height(599.5,395.5)-terrain.height(599.5,397.5)>.7);
 let intact=0,seams=0;const ledgeEdges=new Set<string>();for(const[x,z,b]of [...data.ledges,...(data.cornerEdges??[])]){const[dx,dz]=({56:[1,0],57:[-1,0],58:[0,-1],59:[0,1]} as Record<number,number[]>)[b];ledgeEdges.add([[x,z],[x+dx,z+dz]].sort().map(p=>p.join(',')).join('|'));}
 for(const key of Object.keys(data.cells)){const[cx,cz]=key.split(',').map(Number);for(let z=cz*32;z<cz*32+32;z++)for(let x=cx*32;x<cx*32+32;x++){const a=terrain.corners(x,z);assert.ok(a.every(Number.isFinite));for(const[dx,dz,ai,aj,bi,bj]of [[1,0,1,2,0,3],[0,1,3,2,0,1]]){const edge=[[x,z],[x+dx,z+dz]].sort().map(p=>p.join(',')).join('|'),b=terrain.corners(x+dx,z+dz);if(ledgeEdges.has(edge)){seams++;continue;}assert.equal(a[ai],b[bi],edge);assert.equal(a[aj],b[bj],edge);intact++;}}}
 assert.ok(seams>1000);assert.ok(intact>100000);
});

test('terrain displacement keeps every affected native water tile flat at its original level',async()=>{
 const load=async(path:string)=>JSON.parse(await readFile(new URL('../../public/source/'+path,import.meta.url),'utf8')),terrain=new Terraces(await load('terraces/0.json')),matrix=await load('matrices/0.json'),lands=new Map<number,{permissions:number[]}>();let water=0;
 for(const key of Object.keys(terrain.data.cells)){const[cx,cz]=key.split(',').map(Number),id=matrix.models[cz*matrix.width+cx];if(id===65535)continue;let land=lands.get(id);if(!land){land=await load(`lands/${id}.json`);lands.set(id,land!);}for(let z=0;z<32;z++)for(let x=0;x<32;x++)if([16,17,19,21,23].includes(land!.permissions[z*32+x]&255)){assert.ok(terrain.points(cx*32+x,cz*32+z).every(h=>h===0));water++;}}
 assert.ok(water>1000);
});

test('every raised native ledge retains a physical drop at its edge midpoint, including single-tile ends',async()=>{
 const terrain=new Terraces(JSON.parse(await readFile(new URL('../../public/source/terraces/0.json',import.meta.url),'utf8')) as TerraceData);
 for(const[x,z,b]of terrain.data.ledges){const[dx,dz]=({56:[1,0],57:[-1,0],58:[0,-1],59:[0,1]} as Record<number,number[]>)[b],px=x+.5+dx*.5,pz=z+.5+dz*.5;assert.ok(terrain.sample(x,z,px,pz)-terrain.sample(x+dx,z+dz,px,pz)>.9,`${x},${z}: short ledge face must not disappear`);assert.ok(terrain.height(x-dx+.5,z-dz+.5)-terrain.height(x+dx+.5,z+dz+.5)>.9);}
});

test('major outdoor structures sit on flat terrace offsets through their complete source footprints',async()=>{
 const load=async(path:string)=>JSON.parse(await readFile(new URL('../../public/source/'+path,import.meta.url),'utf8')),terrain=new Terraces(await load('terraces/0.json')),foundations=await load('terraces/foundations-0.json');let raised=0;
 assert.ok(foundations.structures.length>300);
 for(const building of foundations.structures){
  const [x1,z1,x2,z2]=building.bounds,[ax,az]=building.anchor,expected=terrain.height(ax,az);assert.deepEqual(terrain.data.foundations?.[building.key],building.anchor,building.key);if(expected)raised++;
  const xs=[x1,x2],zs=[z1,z2];for(let x=Math.ceil(x1*4)/4;x<x2;x+=.25)xs.push(x);for(let z=Math.ceil(z1*4)/4;z<z2;z+=.25)zs.push(z);
  for(const x of xs)for(const z of zs)assert.ok(Math.abs(terrain.height(x,z)-expected)<1e-8,`${building.key} ${building.asset}: ground at ${x},${z} must meet its rigid foundation`);
 }
 assert.ok(raised>100);
});
