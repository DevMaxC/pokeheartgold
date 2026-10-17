// @ts-nocheck
/** Offline native data/World qualification; see route-traversal review notes. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {nativeField,originalObjects,nativeLandMembers,nativePermissions,repository as root,source} from './native-route-fixture.ts';
import {permissionWalkable,doorwayEntry} from '../src/source/terrain.ts';
import {ledgeDirection} from '../src/source/ledges.ts';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const {world:native,maps,lands}=nativeField('');
const cells=native.cells;
const paths={baseline:source+'/terraces/0.json',candidate:process.argv[2]||source+'/terraces/0.json'};
const worlds={};for(const[k,p]of Object.entries(paths)){worlds[k]=nativeField(p).world;}
const dirs=[[0,-1,0],[0,1,1],[-1,0,2],[1,0,3]];
const actorMap=(flags={})=>new Map(originalObjects(maps,flags).filter(o=>o.visible).map(o=>[o.x+','+o.z,o]));
let visibleObjects=actorMap();
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const perm=(x,z)=>native.permission(x+.5,z+.5);
const positionHeight=(w,x,z)=>w.height(x+.5,z+.5,0);
const bounds={minX:480,maxX:607,minZ:256,maxZ:415};
const inside=(x,z)=>x>=bounds.minX&&x<=bounds.maxX&&z>=bounds.minZ&&z<=bounds.maxZ;
const goals={'MrPokemonHouse':[568,295],'DarkCave':[565,270],'ApricornHouse':[555,356],'VioletGate':[519,269]};
const routeEdges=[],nativeHigh=[];let compared=0,changed=0,maxChange=0,maxStep=0;let worldMismatch=0,samples=0,maxTweenHeightStep=0,headerSeams=0,cellSeams=0;
for(const loaded of cells.values()){
 if(![34,35].includes(loaded.map.id))continue;
 const {cell}=loaded;
 for(let z=cell.z*32;z<(cell.z+1)*32;z++)for(let x=cell.x*32;x<(cell.x+1)*32;x++){
  if(!native.terrainWalkable(x+.5,z+.5))continue;
  for(const[dx,dz,facing]of dirs){const tx=x+dx,tz=z+dz;if(!native.terrainWalkable(tx+.5,tz+.5))continue;if(ledgeDirection(perm(tx,tz))===facing)continue;
   const fromNative=positionHeight(native,x,z),toNative=native.height(tx+.5,tz+.5,fromNative,x+.5,z+.5);
   const entry={from:[x,z],to:[tx,tz],facing,permission:[perm(x,z),perm(tx,tz)],native:[fromNative,toNative],nativeDelta:toNative-fromNative,heights:{}};
   for(const[k,w]of Object.entries(worlds)){const from=positionHeight(w,x,z),to=w.height(tx+.5,tz+.5,from,x+.5,z+.5);const allowed=w.walkable(tx+.5,tz+.5,x+.5,z+.5,from);entry.heights[k]={from,to,delta:to-from,allowed};if(!allowed)worldMismatch++; let py=from,px=x+.5,pz=z+.5; for(let t=1;t<=16;t++){const nx=x+.5+dx*t/16,nz=z+.5+dz*t/16,ny=w.height(nx,nz,py,px,pz); assert.ok(Number.isFinite(ny));maxTweenHeightStep=Math.max(maxTweenHeightStep,Math.abs(ny-py));samples++;py=ny;px=nx;pz=nz;} }
   compared++;if(native.cell(tx+.5,tz+.5).map.id!==loaded.map.id)headerSeams++;if(Math.floor(x/32)!==Math.floor(tx/32)||Math.floor(z/32)!==Math.floor(tz/32))cellSeams++;const delta=Math.max(Math.abs(entry.heights.baseline.from-entry.heights.candidate.from),Math.abs(entry.heights.baseline.to-entry.heights.candidate.to));if(delta>0){changed++;maxChange=Math.max(maxChange,delta);}
   maxStep=Math.max(maxStep,Math.abs(entry.heights.candidate.delta));
   if(Math.abs(toNative-fromNative)>=1.25)nativeHigh.push(entry);
   if(Math.abs(entry.heights.candidate.delta)>=1.25||Math.abs(entry.heights.baseline.delta)>=1.25)routeEdges.push(entry);
  }
 }
}
function bfs(start,objects,strictNativeHeight=false){const queue=[start],prev=new Map([[start.join(','),null]]),edgeType=new Map();for(let i=0;i<queue.length;i++){
 const[x,z]=queue[i];const fromY=positionHeight(native,x,z);
 for(const[dx,dz,facing]of dirs){let tx=x+dx,tz=z+dz,type='walk';if(!inside(tx,tz))continue;
 if(ledgeDirection(perm(tx,tz))===facing){tx+=dx;tz+=dz;type='ledge';if(!inside(tx,tz))continue;}
 else if(!permissionWalkable(perm(tx,tz)))continue;
 if(objects&&visibleObjects.has(tx+','+tz))continue;
 if(type==='walk'&&strictNativeHeight&&Math.abs(native.height(tx+.5,tz+.5,fromY,x+.5,z+.5)-fromY)>=1.25)continue;
 const key=tx+','+tz;if(prev.has(key))continue;prev.set(key,[x,z]);edgeType.set(key,type);queue.push([tx,tz]);
 }
 }const results={};for(const[name,p]of Object.entries(goals)){let at=p.join(',');if(!prev.has(at)){results[name]={reachable:false};continue;}const result=[];while(at){const v=at.split(',').map(Number);result.push({position:v,type:edgeType.get(at)||'start'});const parent=prev.get(at);at=parent?.join(',');}result.reverse();results[name]={reachable:true,steps:result.length-1,path:result};}return{visited:prev.size,goals:results};}
const start=[548,383];
const connectivity={sourceOnly:bfs(start,false),initialObjects:bfs(start,true),nativeHeight:bfs(start,false,true),nativeHeightInitialObjects:bfs(start,true,true)}; visibleObjects=actorMap({FLAG_HIDE_ROUTE_30_BATTLERS:true,FLAG_HIDE_ROUTE_30_YOUNGSTER_JOEY:false});connectivity.afterNativeMysteryEggReturn=bfs(start,true,true);
const fixtureCoords=[[[568,295],[568,294]],[[558,295],[559,295]],[[550,291],[550,292]],[[550,291],[550,293]],[[565,270],[565,269]],[[560,295],[561,295]],[[568,295],[568,296]]];
const fixtures=fixtureCoords.map(([from,to])=>{const facing=to[0]<from[0]?2:to[0]>from[0]?3:to[1]<from[1]?0:1;return{from,to,permission:[perm(...from),perm(...to)],objectAtTo:visibleObjects.get(to.join(','))||null,ledge:ledgeDirection(perm(...to)),door:doorwayEntry(perm(...to),[...maps.values()].some(m=>m.events.warps.some(w=>w.x===to[0]&&w.z===to[1])),facing),heights:Object.fromEntries(Object.entries({native,...worlds}).map(([k,w])=>{const fromY=positionHeight(w,...from);return[k,{from:fromY,to:w.height(to[0]+.5,to[1]+.5,fromY,from[0]+.5,from[1]+.5),worldAllowed:w.walkable(to[0]+.5,to[1]+.5,from[0]+.5,from[1]+.5,fromY)}]}))}});
const members=nativeLandMembers();for(const[id,land]of lands)assert.deepEqual(land.permissions,nativePermissions(members[id]),'Original land '+id);
const codePaths=['browser/src/source/main.ts','browser/src/source/world.ts','browser/src/source/terrain.ts','browser/src/source/ledges.ts','browser/src/source/objects.ts','browser/src/source/field-transitions.ts','browser/src/source/furniture.ts','browser/src/source/furniture-collision.ts','src/field_terrain.c','src/map_object_movement_utilities.c','src/map_object_update.c','src/metatile_behavior.c','browser/scripts/native-route-fixture.ts','browser/scripts/audit_native_route_traversal.ts','browser/src/source/native-route-traversal.test.ts'];
const sourcePaths=['files/a/0/6/5','browser/public/source/matrices/0.json','browser/public/source/terraces/0.json','browser/public/source/initial-state.json',...([...maps.keys()].map(id=>'browser/public/source/maps/'+id+'.json')),...([...lands.keys()].map(id=>'browser/public/source/lands/'+id+'.json'))];
const codePins=Object.fromEntries(codePaths.map(p=>[p,hash(root+'/'+p)]));const dataPins=Object.fromEntries(sourcePaths.map(p=>{const file=root+'/'+p,current=execFileSync('git',['hash-object',file],{cwd:root,encoding:'utf8'}).trim(),expected=execFileSync('git',['rev-parse','93bf982:'+p],{cwd:root,encoding:'utf8'}).trim();assert.equal(current,expected,p+' differs from production baseline');return[p,{sha256:hash(file),gitBlob:current}];}));
const report={status:'read-only qualification; no runtime collision fix, no visual approval',codePins,dataPins,permissionImportProof:{members:lands.size,permissions:lands.size*1024,allEqualToOriginalNARC:true},limitations:['Exact screenshot player tile is unknown.','Static source objects are tested; saved actor positions and in-flight NPC movement are not inferred.','Outdoor furniture arrays are empty in this numerical fixture; this is not a GLB furniture audit.','Bridge height selection is tested separately; native on-bridge/surf state is not implemented by this fixture.'],base:'93bf982b0d866a1150f22eae6ad6caf91da46bc5',paths:Object.fromEntries(Object.entries(paths).map(([k,p])=>[k,{path:p,sha256:hash(p)}])),counts:{cells:cells.size,maps:maps.size,routeOrdinaryDirectedEdges:compared,headerSeamTransitions:headerSeams,cellSeamTransitions:cellSeams,changedEdges:changed,maxHeightChange:maxChange,maxCandidateStep:maxStep,worldWalkableDisagreements:worldMismatch,withinStepSamples:samples,maxWithinStepHeightDelta:maxTweenHeightStep,nativeHeightBlockedEdges:nativeHigh.length,presentationHighEdges:routeEdges.length},bounds,start,connectivity,fixtures,routeEdges,nativeHigh};
fs.writeFileSync(process.argv[3]||'/tmp/hg-route30-traversal-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output:process.argv[3]||'/tmp/hg-route30-traversal-report.json',counts:report.counts,connectivity:Object.fromEntries(Object.entries(connectivity).map(([k,v])=>[k,{visited:v.visited,goals:Object.fromEntries(Object.entries(v.goals).map(([k,v])=>[k,{reachable:v.reachable,steps:v.steps}]))}])),fixtures,largestPresentationSteps:routeEdges.sort((a,b)=>Math.abs(b.heights.candidate.delta)-Math.abs(a.heights.candidate.delta)).slice(0,15)},null,2));
