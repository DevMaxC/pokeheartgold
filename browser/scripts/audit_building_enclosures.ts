/** Geometry audit, not visual approval. Run from the repository root:
 * node --experimental-transform-types browser/scripts/audit_building_enclosures.ts
 * Optional: --assets=1-40,1-39 --output=/tmp/enclosures.json
 *
 * Uses the runtime's repaired geometry, skeleton vertices, placement transforms,
 * used indices, material visibility, and source entrance directions. Horizontal
 * rays start in roof-covered body cores; open floors and gate corridors are not
 * treated as broken walls. MASK/BLEND hits sample embedded PNG alpha at the
 * barycentric UV; passing this audit is still not visual approval.
 */
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {inflateSync,deflateSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {repairOriginalAsset,originalMaterial,closeBuildingBack,type BuildingEntrance} from '../src/source/render-repair.ts';
import {HOUSE_BUILDING_MODELS} from '../src/source/house-building-shells.ts';

type Pixels={data:Uint8Array;width:number;height:number};
type Triangle={a:THREE.Vector3;b:THREE.Vector3;c:THREE.Vector3;normal:THREE.Vector3;area:number;name:string;uv:THREE.Vector2[];map?:THREE.Texture;alphaThreshold:number;opacity:number};
type Prop={asset:string;position:number[];scale:number[];rotation:number[];id:number};
type Placement={matrix:number;map:number;mapName:string;key:string;cell:[number,number];altitude:number;prop:Prop};
type EdgeWitness={material:string;point:number[];distance:number;barycentric:number[];outsideDistanceTiles:number;thresholdTiles:number};
type Ray={origin:number[];direction:number[];exit:string;allowed:boolean;reason?:string;witness?:EdgeWitness};
type Opening={axis:0|2;sign:number;at:number;y:number;side:[number,number];door:BuildingEntrance;normal:number[];point:number[];measuredGapTop:number|null};
type OpeningPlane={axis:0|2;sign:number;at:number;door:BuildingEntrance;wall:Triangle[];normal:THREE.Vector3;point:THREE.Vector3;measuredGapTop?:number|null};
type NativeRecess={bounds:THREE.Box3;inverse:THREE.Matrix4;doors:BuildingEntrance[]};
type BuilderMetric={elapsedMilliseconds:number;mode:string;family:string|null;roofSampling:{status:'exposed'|'unsupported';samples:number|null;fields:{path:string;samples:number}[];reason?:string}};
type PhysicalAperture={axis:0|2;sign:number;at:number;side:[number,number];height:[number,number];sideHeightPolygon?:[number,number][];portalTriangles?:[number,number,number][][];inverse:THREE.Matrix4;evidence:string;reason:string;provenance?:'source'|'event-derived repair';nativeDoors?:BuildingEntrance[]};
const openingPlanes=new WeakMap<Opening[],OpeningPlane[]>();
const nativeRecesses=new WeakMap<Opening[],NativeRecess[]>();
const physicalApertures=new WeakMap<Opening[],PhysicalAperture[]>();
const geometryDiagnostics=new WeakMap<THREE.Object3D,{omittedProjectedLightTriangles:number}>();
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const [k,...v]=a.replace(/^--/,'').split('=');return[k,v.join('=')];}));
const rayPattern='dense' in args?[[0,64],[8,64],[24,64],[48,64],[72,64],[90,1]]:[[0,32],[8,16],[24,16],[48,8],[72,8],[90,1]];
const rayDirections:THREE.Vector3[]=[];
for(const [pitch,count]of rayPattern)for(let i=0;i<count;i++){const yaw=i*Math.PI*2/count,p=pitch*Math.PI/180;rayDirections.push(new THREE.Vector3(Math.sin(yaw)*Math.cos(p),Math.sin(p),Math.cos(yaw)*Math.cos(p)));}
const root=new URL('../public/source/',import.meta.url),loader=new GLTFLoader();
const assetFilter=args.assets?.split(','),output=args.output?new URL('file://'+args.output):new URL('../reviews/building-enclosure-audit.json',import.meta.url);
const sourceDataHashes:Record<string,string>={};
const readJSON=async(path:string)=>{const bytes=await readFile(new URL(path,root));sourceDataHashes[path]=createHash('sha256').update(bytes).digest('hex');return JSON.parse(bytes.toString());};
const round=(v:number)=>Math.round(v*10000)/10000;
const xyz=(v:THREE.Vector3)=>v.toArray().map(round);
const edgeTolerance='strict' in args?0:1e-6;let tolerantHits=0;
const rayNear=1e-7;
let lastCast={exactTriangleHits:0,alphaRejected:0,nearOriginHits:0,exactOpaqueDistance:Infinity};
const decorative=/tree|foliage|leaf|flower|grass|bush|fence|saku|hana|plant|kage|shadow/i;
const foliageMaterial=/tree|foliage|leaf|flower|grass|bush|fence|saku|hana|plant/i;
const houseIDs=HOUSE_BUILDING_MODELS;
const openAirIDs=new Set([19,78,115,119,121,143,170,173,174,175,176,182,184,234,249,291]);
const gateIDs=new Set([3,4,35,36,42,147,167,171,172,181,246,247,271,295,308,309]);
const sourceCategoryRegistry=JSON.parse(await readFile(new URL('../reviews/building-category-triage.json',import.meta.url),'utf8'));
const sourceCategories=new Map<string,any>((sourceCategoryRegistry.readOnlySourceClassifications?.classifications||[]).map((entry:any)=>[entry.asset,entry]));
const sourceNames=new Map([...((await readFile(new URL('../../include/constants/buildmodel.h',import.meta.url),'utf8')).matchAll(/^#define\s+(BUILD_MODEL_\w+)\s+(\d+)\s*$/gm))].map(m=>[Number(m[2]),m[1]]));
const dispatcherText=await readFile(new URL('../src/source/building-exterior.ts',import.meta.url),'utf8');
const importedFunctions=[...dispatcherText.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]\.\/([^'"]+\.ts)['"]/g)].flatMap(match=>match[1].split(',').map(name=>({exportName:name.trim(),module:'src/source/'+match[2],name:match[2].replace(/(?:-building)?-shells\.ts$/,'')}))).filter(item=>/^close\w+Shell$/.test(item.exportName));
const dispatcherCallOrder=[...dispatcherText.matchAll(/(?:if|else\s+if)\s*\(\s*(close\w+Shell)\s*\(\s*root\s*,\s*asset\s*,\s*doors\s*\)\s*\)/g)].map(match=>match[1]);
const helperGraph=dispatcherCallOrder.map(exportName=>{const entry=importedFunctions.find(item=>item.exportName===exportName);if(!entry)throw Error(`Dispatcher helper ${exportName} has no discoverable source import`);return entry;});
if(!helperGraph.length)throw Error('No dispatcher helper calls discovered; update parser rather than silently auditing an empty helper list');
if('help' in args){console.log('Usage: node --experimental-transform-types browser/scripts/audit_building_enclosures.ts [--candidate=all] [--strict] [--dense] [--assets=1-40,1-39] [--output=/absolute/report.json] [--self-test] [--brute-force] [--verify-broadphase]');console.log('Default81 rays/core; --dense uses321 rays/core at64 azimuths per nonvertical pitch.');console.log('Partial candidate helpers (development only), discovered in runtime order: '+helperGraph.map(item=>item.name).join(', '));process.exit(0);}
const hasCandidate='candidate' in args,integratedCandidate=hasCandidate&&(!args.candidate||args.candidate==='all');
const requestedHelpers=hasCandidate?(integratedCandidate?helperGraph.map(item=>item.name):args.candidate.split(',')):[];
const sourceRevision=execFileSync('git',['rev-parse','HEAD'],{cwd:new URL('../../',import.meta.url),encoding:'utf8'}).trim();
const dispatcherDependencies=integratedCandidate?[...dispatcherText.matchAll(/from\s+['"]\.\/([^'"]+\.ts)['"]/g)].map(m=>'src/source/'+m[1]):[];
const partialHelpers=requestedHelpers.map((name:string)=>{const entry=helperGraph.find(item=>item.name===name);if(!entry)throw Error(`Unknown helper ${name}; use all or ${helperGraph.map(item=>item.name).join(', ')}`);return entry;});
const sourceHashes=Object.fromEntries(await Promise.all([...new Set(['scripts/audit_building_enclosures.ts','reviews/building-category-triage.json','../include/constants/buildmodel.h','src/source/render-repair.ts','src/source/house-building-shells.ts','src/source/building-exterior.ts','public/source/entrances.json',...dispatcherDependencies,...partialHelpers.map(item=>item.module)])].map(async path=>[path,createHash('sha256').update(await readFile(new URL('../'+path,import.meta.url))).digest('hex')])));
const sourceWorkingTreeChanges=execFileSync('git',['status','--porcelain','--',...Object.keys(sourceHashes).map(path=>'browser/'+path)],{cwd:new URL('../../',import.meta.url),encoding:'utf8'}).trim().split('\n').filter(Boolean);
const dispatcher=integratedCandidate?(await import('../src/source/building-exterior.ts')).closeBuildingExterior:null;
const candidateHelpers=integratedCandidate?[]:await Promise.all(partialHelpers.map(async item=>{const module=await import(new URL('../'+item.module,import.meta.url).href),helper=module[item.exportName];if(typeof helper!=='function')throw Error(`Missing exported helper ${item.exportName}`);return helper;}));

function png(bytes:Buffer):Pixels{
 if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Expected PNG image');
 let width=0,height=0,bpp=0;const chunks:Buffer[]=[];
 for(let at=8;at<bytes.length;){const length=bytes.readUInt32BE(at),type=bytes.toString('ascii',at+4,at+8),data=bytes.subarray(at+8,at+8+length);at+=length+12;
  if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);if(data[8]!==8||data[9]!==6||data[12]!==0)throw Error('Audit decoder requires non-interlaced 8-bit RGBA PNG');bpp=4;}else if(type==='IDAT')chunks.push(data);
 }
 const raw=inflateSync(Buffer.concat(chunks)),stride=width*bpp,data=new Uint8Array(stride*height);let offset=0;
 const paeth=(a:number,b:number,c:number)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){const filter=raw[offset++];if(filter>4)throw Error('Unsupported PNG filter');for(let x=0;x<stride;x++){const left=x>=bpp?data[y*stride+x-bpp]:0,up=y?data[(y-1)*stride+x]:0,corner=y&&x>=bpp?data[(y-1)*stride+x-bpp]:0;data[y*stride+x]=(raw[offset++]+[0,left,up,Math.floor((left+up)/2),paeth(left,up,corner)][filter])&255;}}
 return {data,width,height};
}
function textures(bytes:Buffer){
 const length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length).toString()),binary=bytes.subarray(28+length);
 for(const material of json.materials||[]){const t=material.pbrMetallicRoughness?.baseColorTexture;if(t&&(t.texCoord||t.extensions?.KHR_texture_transform))throw Error('Audit needs explicit support for this non-native UV set/transform');}
 const images=(json.images||[]).map((image:any)=>{const view=json.bufferViews[image.bufferView];return png(image.uri?Buffer.from(image.uri.split(',')[1],'base64'):binary.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength));});
 const wrapping=(value=10497)=>{const mode=({10497:THREE.RepeatWrapping,33071:THREE.ClampToEdgeWrapping,33648:THREE.MirroredRepeatWrapping} as Record<number,THREE.Wrapping>)[value];if(mode===undefined)throw Error(`Unknown glTF texture wrap ${value}`);return mode;};
 return (json.textures||[]).map((t:any)=>{const image=images[t.source],texture=new THREE.DataTexture(image.data,image.width,image.height),sampler=json.samplers?.[t.sampler]||{};texture.flipY=false;texture.wrapS=wrapping(sampler.wrapS);texture.wrapT=wrapping(sampler.wrapT);return texture;});
}

function geometryGLB(bytes:Buffer):ArrayBuffer{
 const length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length).toString());
 delete json.images;delete json.textures;delete json.samplers;
 for(const m of json.materials||[]){m.extras={...m.extras,auditTextureIndex:m.pbrMetallicRoughness?.baseColorTexture?.index};delete m.pbrMetallicRoughness?.baseColorTexture;delete m.pbrMetallicRoughness?.metallicRoughnessTexture;delete m.normalTexture;delete m.occlusionTexture;delete m.emissiveTexture;}
 let encoded=JSON.stringify(json);encoded+=' '.repeat((4-Buffer.byteLength(encoded)%4)%4);
 const header=bytes.subarray(0,20),rest=bytes.subarray(20+length),chunk=Buffer.from(encoded),result=Buffer.concat([header,chunk,rest]);
 result.writeUInt32LE(result.length,8);result.writeUInt32LE(chunk.length,12);return result.buffer.slice(result.byteOffset,result.byteOffset+result.byteLength) as ArrayBuffer;
}
function triangles(root:THREE.Object3D):Triangle[]{
 root.updateWorldMatrix(true,true);const result:Triangle[]=[];let omittedProjectedLightTriangles=0;
 root.traverseVisible(o=>{
  if(!(o instanceof THREE.Mesh)||o instanceof THREE.InstancedMesh)return;
  const g=o.geometry,p=g.getAttribute('position'),index=g.index,materials=Array.isArray(o.material)?o.material:[o.material];
  for(const group of g.groups.length?g.groups:[{start:0,count:index?.count??p.count,materialIndex:0}]){
   const m=materials[group.materialIndex??0];if(!m||!m.visible||m.opacity<.5||foliageMaterial.test(m.name))continue;
   for(let i=group.start;i<Math.min(group.start+group.count,index?.count??p.count);i+=3){
    const [a,b,c]=[0,1,2].map(j=>o.getVertexPosition(index?index.getX(i+j):i+j,new THREE.Vector3()).applyMatrix4(o.matrixWorld));
    const n=b.clone().sub(a).cross(c.clone().sub(a)),area=n.length()/2;if(area<1e-7)continue;
    const color=g.getAttribute('color');if(color?.itemSize===4&&(m as THREE.MeshBasicMaterial).vertexColors)throw Error('Audit needs explicit support for this non-native vertex alpha');
    const u=g.getAttribute('uv'),uv=[0,1,2].map(j=>{const k=index?index.getX(i+j):i+j;return u?new THREE.Vector2(u.getX(k),u.getY(k)):new THREE.Vector2();}),material=m as THREE.MeshBasicMaterial;
    if(root.userData.auditModelId===110&&m.name==='hikari'&&uv.every(p=>p.x>=.02&&p.x<.15)){omittedProjectedLightTriangles++;continue;}
    result.push({a,b,c,normal:n.normalize(),area,name:m.name||o.name,uv,map:material.map??undefined,alphaThreshold:material.alphaTest>0?material.alphaTest:(material.transparent ? .5 : 0),opacity:material.opacity});
   }
  }
 });geometryDiagnostics.set(root,{omittedProjectedLightTriangles});return result;
}
function bounds(ts:Triangle[]){const b=new THREE.Box3();for(const t of ts)for(const p of [t.a,t.b,t.c])b.expandByPoint(p);return b;}
function hull(points:THREE.Vector2[]){
 const p=[...new Map(points.map(p=>[`${round(p.x)},${round(p.y)}`,p])).values()].sort((a,b)=>a.x-b.x||a.y-b.y);
 const cross=(a:THREE.Vector2,b:THREE.Vector2,c:THREE.Vector2)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x),lo:THREE.Vector2[]=[],hi:THREE.Vector2[]=[];
 for(const v of p){while(lo.length>1&&cross(lo.at(-2)!,lo.at(-1)!,v)<=0)lo.pop();lo.push(v);}
 for(const v of p.reverse()){while(hi.length>1&&cross(hi.at(-2)!,hi.at(-1)!,v)<=0)hi.pop();hi.push(v);}return lo.slice(0,-1).concat(hi.slice(0,-1));
}
function inside(p:THREE.Vector2,polygon:THREE.Vector2[],margin=.05){return polygon.every((a,i)=>{const b=polygon[(i+1)%polygon.length];return (b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x)>margin*a.distanceTo(b);});}
function visibleTexel(t:Triangle,hit:THREE.Vector3){
 if(t.alphaThreshold<=0||!t.map)return true;
 const pixels=t.map.image as Pixels;if(!pixels?.data)throw Error('Alpha-tested material has no decoded PNG');
 const bary=THREE.Triangle.getBarycoord(hit,t.a,t.b,t.c,new THREE.Vector3())!,uv=t.uv[0].clone().multiplyScalar(bary.x).addScaledVector(t.uv[1],bary.y).addScaledVector(t.uv[2],bary.z);t.map.transformUv(uv);
 if(t.map.wrapS===THREE.RepeatWrapping&&uv.x===1)uv.x=0;if(t.map.wrapT===THREE.RepeatWrapping&&uv.y===1)uv.y=0;
 const x=THREE.MathUtils.clamp(Math.floor(uv.x*pixels.width),0,pixels.width-1),y=THREE.MathUtils.clamp(Math.floor(uv.y*pixels.height),0,pixels.height-1);
 return pixels.data[(y*pixels.width+x)*4+3]/255*t.opacity>=t.alphaThreshold;
}
function opaqueSourcePoint(ts:Triangle[],point:THREE.Vector3){
 return ts.some(t=>{if(Math.abs(point.clone().sub(t.a).dot(t.normal))>1e-7)return false;const bary=THREE.Triangle.getBarycoord(point,t.a,t.b,t.c,new THREE.Vector3());return bary&&Math.min(...bary.toArray())>=-1e-7&&visibleTexel(t,point);});
}
function edgeWitness(ts:Triangle[],origin:THREE.Vector3,direction:THREE.Vector3,far:number,tolerance=1e-6):EdgeWitness|null{
 const hit=new THREE.Vector3();let closest:EdgeWitness|null=null;
 for(const t of ts){
  const denominator=t.normal.dot(direction);if(Math.abs(denominator)<1e-10)continue;
  const distance=t.a.clone().sub(origin).dot(t.normal)/denominator;if(distance<=rayNear||distance>far||closest&&distance>=closest.distance)continue;hit.copy(origin).addScaledVector(direction,distance);
  const bary=THREE.Triangle.getBarycoord(hit,t.a,t.b,t.c,new THREE.Vector3());if(!bary)continue;
  const edgeLengths=[t.b.distanceTo(t.c),t.a.distanceTo(t.c),t.a.distanceTo(t.b)],outside=Math.max(0,...bary.toArray().map((value,i)=>-value*2*t.area/edgeLengths[i]));
  if(outside>tolerance||!visibleTexel(t,hit))continue;
  closest={material:t.name,point:hit.toArray(),distance,barycentric:bary.toArray(),outsideDistanceTiles:outside,thresholdTiles:tolerance};
 }
 return closest;
}
// Broadphase only: immutable stage snapshots retain their original triangle order.
// Padding admits extra candidates; exact Three intersections and alpha decisions
// below still use zero tolerance in --strict mode.
type TriangleBound={triangle:Triangle;index:number;min:[number,number,number];max:[number,number,number]};
type BoundNode={min:[number,number,number];max:[number,number,number];entries?:TriangleBound[];left?:BoundNode;right?:BoundNode};
const broadphasePadding=1e-6,broadphaseLeafTriangles=8,broadphaseCache=new WeakMap<Triangle[],{length:number;root:BoundNode|null}>();let verifiedBroadphaseCasts=0;
function stageBounds(ts:Triangle[]){
 const cached=broadphaseCache.get(ts);if(cached&&cached.length===ts.length)return cached.root;
 const entries:TriangleBound[]=ts.map((triangle,index)=>({triangle,index,min:[Math.min(triangle.a.x,triangle.b.x,triangle.c.x),Math.min(triangle.a.y,triangle.b.y,triangle.c.y),Math.min(triangle.a.z,triangle.b.z,triangle.c.z)],max:[Math.max(triangle.a.x,triangle.b.x,triangle.c.x),Math.max(triangle.a.y,triangle.b.y,triangle.c.y),Math.max(triangle.a.z,triangle.b.z,triangle.c.z)]}));
 const build=(entries:TriangleBound[]):BoundNode=>{
  const min:[number,number,number]=[Infinity,Infinity,Infinity],max:[number,number,number]=[-Infinity,-Infinity,-Infinity];for(const entry of entries)for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],entry.min[axis]);max[axis]=Math.max(max[axis],entry.max[axis]);}
  if(entries.length<=broadphaseLeafTriangles)return {min,max,entries};
  const axis=[0,1,2].reduce((best,a)=>max[a]-min[a]>max[best]-min[best]?a:best),sorted=[...entries].sort((a,b)=>(a.min[axis]+a.max[axis])-(b.min[axis]+b.max[axis])||a.index-b.index),mid=Math.floor(sorted.length/2);
  return {min,max,left:build(sorted.slice(0,mid)),right:build(sorted.slice(mid))};
 };
 const root=entries.length?build(entries):null;broadphaseCache.set(ts,{length:ts.length,root});return root;
}
function rayBound(node:BoundNode,origin:THREE.Vector3,direction:THREE.Vector3,far:number){
 let near=0,end=far;for(let axis=0;axis<3;axis++){
  const o=origin.getComponent(axis),d=direction.getComponent(axis),min=node.min[axis]-broadphasePadding,max=node.max[axis]+broadphasePadding;
  if(d===0){if(o<min||o>max)return false;continue;}
  const a=(min-o)/d,b=(max-o)/d;near=Math.max(near,Math.min(a,b));end=Math.min(end,Math.max(a,b));if(near>end)return false;
 }return true;
}
function candidateTriangles(ts:Triangle[],origin:THREE.Vector3,direction:THREE.Vector3,far:number){
 const root=stageBounds(ts);if(!root)return [];const stack=[root],found:TriangleBound[]=[];
 while(stack.length){const node=stack.pop()!;if(!rayBound(node,origin,direction,far))continue;if(node.entries){for(const entry of node.entries)if(rayBound(entry,origin,direction,far))found.push(entry);}else{stack.push(node.left!,node.right!);}}
 return found.sort((a,b)=>a.index-b.index).map(entry=>entry.triangle);
}
function cast(ts:Triangle[],origin:THREE.Vector3,direction:THREE.Vector3,far:number){
 const candidates='brute-force' in args?ts:candidateTriangles(ts,origin,direction,far),before=tolerantHits,result=castNarrowphase(candidates,origin,direction,far,ts);
 if('verify-broadphase' in args&&!('brute-force' in args)){
  const metric={...lastCast},after=tolerantHits,brute=castNarrowphase(ts,origin,direction,far,ts),context=`Broadphase changed exact cast at ${origin.toArray()} / ${direction.toArray()}`;
  assert.equal(result,brute,context);assert.deepEqual(lastCast,metric,context);assert.equal(tolerantHits-after,after-before,context);lastCast=metric;tolerantHits=after;verifiedBroadphaseCasts++;
 }return result;
}
function castNarrowphase(ts:Triangle[],origin:THREE.Vector3,direction:THREE.Vector3,far:number,allTriangles:Triangle[]){
 const ray=new THREE.Ray(origin,direction),hit=new THREE.Vector3();let distance=Infinity;lastCast={exactTriangleHits:0,alphaRejected:0,nearOriginHits:0,exactOpaqueDistance:Infinity};
 for(const t of ts)if(ray.intersectTriangle(t.a,t.b,t.c,false,hit)){
  const d=origin.distanceTo(hit);if(d<=rayNear||d>far)continue;lastCast.exactTriangleHits++;if(d<.015)lastCast.nearOriginHits++;if(!visibleTexel(t,hit)){lastCast.alphaRejected++;continue;}if(d<distance)distance=d;
 }
 lastCast.exactOpaqueDistance=distance;
 if(Number.isFinite(distance)||edgeTolerance===0)return distance;
 // Flattening native bone vertices into large world coordinates can put an
 // exact seam ray a few double-precision ulps outside both adjacent triangles.
 // Retry within one millionth of a tile; count these separately in every stage.
 const witness=edgeWitness(allTriangles,origin,direction,far,edgeTolerance);if(witness)distance=witness.distance;
 if(Number.isFinite(distance))tolerantHits++;return distance;
}
if('self-test' in args){
 // These fixtures exercise every native PNG scanline filter and the important
 // difference between a transparent pixel and a transparent-rendering material.
 const pixels=Uint8Array.from([10,20,30,0,40,50,60,255,70,80,90,255,100,110,120,0]),width=2,height=2,stride=8;
 const chunk=(type:string,data:Buffer)=>{const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);data.copy(b,8);return b;};
 for(let filter=0;filter<5;filter++){
  const raw=Buffer.alloc(height*(stride+1));let offset=0;
  const paeth=(a:number,b:number,c:number)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<height;y++){raw[offset++]=filter;for(let x=0;x<stride;x++){const left=x>=4?pixels[y*stride+x-4]:0,up=y?pixels[(y-1)*stride+x]:0,corner=y&&x>=4?pixels[(y-1)*stride+x-4]:0;raw[offset++]=(pixels[y*stride+x]-[0,left,up,Math.floor((left+up)/2),paeth(left,up,corner)][filter])&255;}}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;
  const encoded=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);assert.deepEqual(png(encoded),{data:pixels,width,height});
 }
 const map=new THREE.DataTexture(pixels,width,height);map.flipY=false;map.wrapS=THREE.RepeatWrapping;map.wrapT=THREE.RepeatWrapping;
 const a=new THREE.Vector3(-1,-1,0),b=new THREE.Vector3(1,-1,0),c=new THREE.Vector3(-1,1,0),origin=new THREE.Vector3(-.5,-.5,-1),direction=new THREE.Vector3(0,0,1);
 const triangle:Triangle={a,b,c,normal:new THREE.Vector3(0,0,1),area:2,name:'alpha-fixture',uv:[new THREE.Vector2(0,0),new THREE.Vector2(1,0),new THREE.Vector2(0,1)],map,alphaThreshold:.5,opacity:1};
 assert.equal(cast([triangle],origin,direction,5),Infinity,'MASK pixel zero must let the ray through');
 assert.equal(lastCast.exactTriangleHits,1);assert.equal(lastCast.alphaRejected,1);assert.equal(lastCast.exactOpaqueDistance,Infinity,'Alpha-only miss must remain distinct from absent geometry');
 assert.equal(cast([{...triangle,alphaThreshold:0}],origin,direction,5),1,'OPAQUE ignores PNG alpha exactly as the renderer does');
 assert.equal(opaqueSourcePoint([triangle],new THREE.Vector3(-.5,-.5,0)),false,'Transparent source cards cannot prove a bounded exterior alcove');
 assert.equal(opaqueSourcePoint([{...triangle,alphaThreshold:0}],new THREE.Vector3(-.5,-.5,0)),true,'An actual opaque source card point provides seed classification evidence');
 assert.equal(opaqueSourcePoint([{...triangle,alphaThreshold:0}],new THREE.Vector3(-.5,-.5,.01)),false,'Off-plane points cannot masquerade as card evidence');
 const lightRoot=new THREE.Group();lightRoot.userData.auditModelId=110;
 for(const u of [.1,.25]){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,-1,1,0],3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute([u,.25,u,.25,u,.25],2));const material=new THREE.MeshBasicMaterial();material.name='hikari';lightRoot.add(new THREE.Mesh(geometry,material));}
 assert.equal(triangles(lightRoot).length,1,'A projected lighthouse beam cannot block the room, while real luminous glazing remains');assert.equal(geometryDiagnostics.get(lightRoot)?.omittedProjectedLightTriangles,1);
 lightRoot.userData.auditModelId=109;assert.equal(triangles(lightRoot).length,2,'The measured UV discriminator must be scoped to the actual lighthouse model');
 assert.equal(cast([{...triangle,alphaThreshold:0}],new THREE.Vector3(-.5,-.5,-.002),direction,5),.002,'A real nearby roof must not be discarded as a self-hit');
 map.flipY=true;assert.equal(cast([triangle],origin,direction,5),1,'flipY must select the other PNG row');map.flipY=false;
 assert.equal(cast([{...triangle,uv:triangle.uv.map(()=>new THREE.Vector2(1.25,.25))}],origin,direction,5),Infinity,'RepeatWrapping must preserve the transparent hit');
 assert.equal(cast([{...triangle,uv:triangle.uv.map(()=>new THREE.Vector2(.75,.25))}],origin,direction,5),1,'An opaque texel must block');
 assert.equal(cast([{...triangle,uv:triangle.uv.map(()=>new THREE.Vector2(1,.25))}],origin,direction,5),Infinity,'Exact repeating texture edge samples texel zero');
 map.wrapS=THREE.ClampToEdgeWrapping;assert.equal(cast([{...triangle,uv:triangle.uv.map(()=>new THREE.Vector2(1.25,.25))}],origin,direction,5),1,'Native clamping must retain the final texel');map.wrapS=THREE.RepeatWrapping;
 assert.equal(cast([triangle,{...triangle,a:a.clone().setZ(1),b:b.clone().setZ(1),c:c.clone().setZ(1),alphaThreshold:0}],origin,direction,5),2,'Transparent foreground must continue to the opaque shell behind it');
 assert.equal(cast([{...triangle,alphaThreshold:0}],new THREE.Vector3(-1.0000005,-.5,-1),direction,5),edgeTolerance?1:Infinity,'Strict mode must retain a sub-millionth tile exact miss');
 assert.ok(edgeWitness([{...triangle,alphaThreshold:0}],new THREE.Vector3(-1.0000005,-.5,-1),direction,5),'A secondary edge witness may diagnose the retained exact miss');
 assert.equal(cast([{...triangle,alphaThreshold:0}],new THREE.Vector3(-1.0001,-.5,-1),direction,5),Infinity,'A larger physical gap must remain an escape');
 assert.equal(edgeWitness([{...triangle,alphaThreshold:0}],new THREE.Vector3(-1.0001,-.5,-1),direction,5),null,'The diagnostic edge witness must not swallow a larger physical gap');
 const diagnosed=measure([{...triangle,alphaThreshold:0}],new THREE.Box3(new THREE.Vector3(-2,-2,-2),new THREE.Vector3(2,2,2)),[new THREE.Vector3(-1.0000005,-.5,-1)],[],0,[],true);
 assert.ok(diagnosed.diagnosticEdgeWitnesses>0,'Final-stage diagnostics must retain the near-edge witness');
 if(edgeTolerance===0){assert.equal(diagnosed.edgeToleranceHits,0);assert.equal(diagnosed.strictUnexpected,diagnosed.unexpected,'A diagnostic witness cannot reduce or double-count a strict miss');}
 const rectangle=(left:number,right:number,z:number):Triangle[]=>{const p=[new THREE.Vector3(left,0,z),new THREE.Vector3(right,0,z),new THREE.Vector3(right,2,z),new THREE.Vector3(left,2,z)];return [[0,1,2],[0,2,3]].map(([i,j,k])=>({...triangle,a:p[i],b:p[j],c:p[k],normal:new THREE.Vector3(0,0,1),area:(right-left),alphaThreshold:0}));};
 const door:BuildingEntrance={x:0,z:.25,axis:2,sign:1},recess=[...rectangle(-2,-.5,0),...rectangle(.5,2,0),...rectangle(-2,2,-1)],seed=new THREE.Vector3(0,1,-.2),openings=nativeOpenings(recess,[door],0,[seed]);
 assert.equal(openings.length,1,'Authored outer facade aperture must be found ahead of the larger recessed door plane');assert.equal(openings[0].at,0);
 assert.equal(doorwayRay(seed,new THREE.Vector3(.9,0,.5).normalize(),[door],0,openings),true,'Fan through a real door recess must not be called a wall leak');
 assert.equal(doorwayRay(new THREE.Vector3(-1,1,-.2),new THREE.Vector3(-.9,0,.5).normalize(),[door],0,openings),false,'The aperture allowance must not exempt the adjacent wall');
 const projectingCard=rectangle(.6,2,.1),behindDecoration=nativeOpenings([...recess,...projectingCard],[door],0,[seed]);assert.equal(behindDecoration[0].at,0,'A solid projecting window card must not replace the source facade with a real doorway gap');
 const scaleFaces=(faces:Triangle[],scale:number,offset=0)=>faces.map(t=>({...t,a:t.a.clone().setY(t.a.y*scale+offset),b:t.b.clone().setY(t.b.y*scale+offset),c:t.c.clone().setY(t.c.y*scale+offset)}));
 const tallWalls=scaleFaces([...rectangle(-2,-.5,0),...rectangle(.5,2,0)],2),header=scaleFaces(rectangle(-.5,.5,0),.5,3),tallSeed=new THREE.Vector3(0,2.5,-.2),tallOpenings=nativeOpenings([...tallWalls,...header],[door],0,[tallSeed]);
 assert.equal(tallOpenings[0].measuredGapTop,3,'Tall aperture ceiling must end at its actual source header');
 assert.equal(doorwayRay(tallSeed,direction,[door],0,tallOpenings),true,'A proven tall source door may exceed the generic event height');
 assert.equal(doorwayRay(new THREE.Vector3(0,3.2,-.2),direction,[door],0,tallOpenings),false,'The measured header must stop the doorway allowance');
 assert.equal(doorwayRay(tallSeed,direction,[door],0,nativeOpenings(tallWalls,[door],0,[tallSeed])),false,'A gap continuing through the facade top cannot prove a tall doorway');
 const root=new THREE.Group();root.position.set(900,6,200);root.scale.setScalar(1/16);root.rotation.y=Math.PI/2;root.updateMatrixWorld(true);
 const nativeFaces=[[-10,2,-4,-10,2,16,-10,30,16],[10,2,-4,10,2,16,10,30,16]].map(values=>({...triangle,name:'h_in',a:new THREE.Vector3(...values.slice(0,3) as [number,number,number]).applyMatrix4(root.matrixWorld),b:new THREE.Vector3(...values.slice(3,6) as [number,number,number]).applyMatrix4(root.matrixWorld),c:new THREE.Vector3(...values.slice(6,9) as [number,number,number]).applyMatrix4(root.matrixWorld)}));
 const front=root.localToWorld(new THREE.Vector3(0,0,16)),nativeDoor:BuildingEntrance={x:front.x,z:front.z,axis:0,sign:1},nativeOpeningRecords:Opening[]=[],nativeRecessRecords=authoredRecesses(nativeFaces,root,[nativeDoor]);assert.equal(nativeRecessRecords.length,1);
 nativeRecesses.set(nativeOpeningRecords,nativeRecessRecords);const nativeDirection=new THREE.Vector3(0,0,1).transformDirection(root.matrixWorld);
 assert.equal(doorwayReason(root.localToWorld(new THREE.Vector3(0,20,0)),nativeDirection,[nativeDoor],6,nativeOpeningRecords),'authored h_in recess with native entrance','Native recess must survive translated, rotated, scaled placements');
 assert.equal(doorwayReason(root.localToWorld(new THREE.Vector3(0,40,0)),nativeDirection,[nativeDoor],6,nativeOpeningRecords),null,'The recess exception must stop at its physical top');
 assert.equal(authoredRecesses(nativeFaces,root,[{...nativeDoor,sign:-1}]).length,0,'An opposite-facing warp must not authorize a front aperture');
 assert.equal(authoredRecesses(nativeFaces,root,[{...nativeDoor,x:nativeDoor.x+10}]).length,0,'A distant entrance must not authorize this recess');
 const canopyRecords:Opening[]=[];physicalApertures.set(canopyRecords,[{axis:2,sign:-1,at:-68.0859375,side:[40,88],height:[1.96875,40],inverse:root.matrixWorld.clone().invert(),evidence:'test native canopy',reason:'source-authored physical canopy aperture; active warp not asserted'}]);
 const canopyOrigin=(x:number,y:number)=>root.localToWorld(new THREE.Vector3(x,y,-40)),canopyDirection=new THREE.Vector3(0,0,-1).transformDirection(root.matrixWorld);
 assert.equal(doorwayReason(canopyOrigin(64,20),canopyDirection,[],6,canopyRecords),'source-authored physical canopy aperture; active warp not asserted','A source physical canopy remains distinct from active warp metadata');
 assert.equal(doorwayReason(canopyOrigin(38,20),canopyDirection,[],6,canopyRecords),null,'The physical opening must not exempt its adjacent wall');
 assert.equal(doorwayReason(canopyOrigin(64,41),canopyDirection,[],6,canopyRecords),null,'The physical opening must stop below its native lintel');
 assert.equal(doorwayReason(canopyOrigin(64,20),canopyDirection.clone().negate(),[],6,canopyRecords),null,'A physical aperture cannot excuse the opposite wall');
 const porchPoints=[[117.6796875,81,-2.6015625],[164.46875,81,-2.6015625],[164.46875,81,45.1640625],[117.6796875,81,45.1640625]].map(p=>new THREE.Vector3(...p as [number,number,number]).applyMatrix4(root.matrixWorld));
 const porchFaces:Triangle[]=[[0,1,2],[0,2,3]].map(([i,j,k])=>({...triangle,name:'lambert10',a:porchPoints[i],b:porchPoints[j],c:porchPoints[k]}));
 porchFaces.push({...triangle,name:'body-floor',a:root.localToWorld(new THREE.Vector3(0,0,0)),b:root.localToWorld(new THREE.Vector3(1,0,0)),c:root.localToWorld(new THREE.Vector3(0,0,1))});
 const porchWarp=root.localToWorld(new THREE.Vector3(64,0,16)),porchDoor:BuildingEntrance={x:porchWarp.x,z:porchWarp.z,axis:2,sign:-1},porches=authoredPhysicalApertures(porchFaces,root,264,[porchDoor]),porchRecords:Opening[]=[];assert.equal(porches.length,1);physicalApertures.set(porchRecords,porches);
 const porchDirection=new THREE.Vector3(1,0,0).transformDirection(root.matrixWorld);
 assert.equal(doorwayReason(root.localToWorld(new THREE.Vector3(0,20,16)),porchDirection,[porchDoor],6,porchRecords),'source-authored physical porch aperture with native entrance','The tall source porch needs its measured roof height and active source approach');
 assert.equal(doorwayReason(root.localToWorld(new THREE.Vector3(0,82,16)),porchDirection,[porchDoor],6,porchRecords),null,'The porch allowance must not hide roof gaps above its actual underside');
 assert.equal(doorwayReason(root.localToWorld(new THREE.Vector3(0,20,46)),porchDirection,[],6,porchRecords),null,'The porch allowance must stop at its literal side bounds');
 assert.equal(authoredPhysicalApertures(porchFaces,root,264,[{...porchDoor,passageOnly:true}]).length,0,'A passage-only hint cannot authorize this physical functional porch');
 const profiledRecords:Opening[]=[],profiledDirection=new THREE.Vector3(-1,0,0).transformDirection(root.matrixWorld);physicalApertures.set(profiledRecords,[{axis:0,sign:-1,at:-79,side:[-34,32],height:[3,115],sideHeightPolygon:[[-34,3],[32,3],[32,82],[23,115],[-24,115],[-34,82]],inverse:root.matrixWorld.clone().invert(),evidence:'test source sloping jamb profile',reason:'source-authored physical door recess with native entrance'}]);
 assert.equal(doorwayReason(root.localToWorld(new THREE.Vector3(0,100,0)),profiledDirection,[],6,profiledRecords),'source-authored physical door recess with native entrance','A measured polygonal mouth must survive a rotated placement');
 assert.equal(doorwayReason(root.localToWorld(new THREE.Vector3(0,110,31)),profiledDirection,[],6,profiledRecords),null,'The narrowing source jamb must reject the rectangular-bounds corner');
 assert.equal(doorwayReason(root.localToWorld(new THREE.Vector3(0,116,0)),profiledDirection,[],6,profiledRecords),null,'The physical header must stop a profiled opening');
 const tiltedRecords:Opening[]=[],tiltedMouth:[number,number,number][]=[[-79,3,-34],[-79,3,32],[-91,82,32],[-91,82,-34],[-79,115,23],[-79,115,-24]];physicalApertures.set(tiltedRecords,[{axis:0,sign:-1,at:-79,side:[-34,32],height:[3,115],portalTriangles:[[0,1,2],[0,2,3],[3,2,4],[3,4,5]].map(indices=>indices.map(i=>tiltedMouth[i])),inverse:root.matrixWorld.clone().invert(),evidence:'test literal nonplanar portal boundary',reason:'source-authored physical door recess with native entrance'}]);
 const fan=new THREE.Vector3(-.9807852804032303,0,-.19509032201612866).transformDirection(root.matrixWorld);
 assert.equal(doorwayReason(root.localToWorld(new THREE.Vector3(-40,20,40)),fan,[],6,tiltedRecords),'source-authored physical door recess with native entrance','A real sloping portal must allow a ray that clears its jamb after crossing the inner reference plane');
 assert.equal(doorwayReason(root.localToWorld(new THREE.Vector3(-40,20,43)),fan,[],6,tiltedRecords),null,'Nonplanar aperture probes must still reject the adjacent native wall');
 assert.equal(doorwayReason(root.localToWorld(new THREE.Vector3(-40,116,0)),profiledDirection,[],6,tiltedRecords),null,'A virtual portal probe does not extend above its source header');
 console.log('Enclosure audit self-test passed: PNG filters, native opacity, UV flip/wrap/clamp, close roof hits, transparent foreground, measured/transformed source recesses and bounded physical canopies.');process.exit(0);
}
function exitFace(origin:THREE.Vector3,direction:THREE.Vector3,b:THREE.Box3){
 let nearest=Infinity,face='';for(const axis of [0,1,2]){const component=direction.getComponent(axis);if(Math.abs(component)<1e-6)continue;const d=((component>0?b.max:b.min).getComponent(axis)-origin.getComponent(axis))/component;if(d>0&&d<nearest){nearest=d;face=['x','y','z'][axis]+(component>0?'+':'-');}}return face;
}
function doorGaps(plane:OpeningPlane,y:number):[number,number][]{
 const sideAxis=plane.axis===0?2:0,sideDoor=plane.axis===0?plane.door.z:plane.door.x,spans:[number,number][]=[];
 for(const t of plane.wall){const points:number[]=[];for(const [a,b]of [[t.a,t.b],[t.b,t.c],[t.c,t.a]]){if(Math.abs(a.y-y)<1e-7)points.push(a.getComponent(sideAxis));if((a.y-y)*(b.y-y)<0)points.push(a.clone().lerp(b,(y-a.y)/(b.y-a.y)).getComponent(sideAxis));}if(points.length>=2)spans.push([Math.min(...points),Math.max(...points)]);}
 const merged:[number,number][]=[];for(const span of spans.sort((a,b)=>a[0]-b[0])){const last=merged.at(-1);if(last&&span[0]<=last[1]+.001)last[1]=Math.max(last[1],span[1]);else merged.push([...span]);}
 const gaps:[number,number][]=[];for(let i=0;i<merged.length-1;i++){const side:[number,number]=[merged[i][1],merged[i+1][0]];if(side[1]-side[0]<.15||side[1]-side[0]>2.6||sideDoor<side[0]-.15||sideDoor>side[1]+.15)continue;gaps.push(side);}return gaps;
}
function measuredGapTop(plane:OpeningPlane,floor:number):number|null{
 // Extend beyond the legacy 2.25-tile event height only when the actual
 // facade gap continues upward from door height and ends at a real header.
 // A gap continuing through the whole facade top is not a proven tall door.
 const base=floor+.6,ys=[base,...new Set(plane.wall.flatMap(t=>[t.a.y,t.b.y,t.c.y]).filter(y=>y>base+1e-7))].sort((a,b)=>a-b),side=plane.axis===0?plane.door.z:plane.door.x;let gapBelow=false;
 for(let i=0;i<ys.length-1;i++){
  const y=(ys[i]+ys[i+1])/2,hasGap=doorGaps(plane,y).some(span=>side>=span[0]-.005&&side<=span[1]+.005);
  if(!hasGap)return gapBelow?ys[i]:null;gapBelow=true;
 }
 return null;
}
function nativeOpenings(ts:Triangle[],doors:BuildingEntrance[],floor:number,seeds:THREE.Vector3[]):Opening[]{
 const openings:Opening[]=[],planesFound:OpeningPlane[]=[],ys=[...new Set(seeds.map(s=>s.y))];
 for(const door of doors){
  const axis=door.axis??2,atDoor=axis===0?door.x:door.z,planes:{area:number;normal:THREE.Vector3;point:THREE.Vector3}[]=[];
  for(const t of ts){
   if(Math.abs(t.normal.getComponent(axis))<.995||Math.min(t.a.y,t.b.y,t.c.y)>floor+.3||Math.max(t.a.y,t.b.y,t.c.y)<floor+.6)continue;
   const at=(t.a.getComponent(axis)+t.b.getComponent(axis)+t.c.getComponent(axis))/3;if(Math.abs(at-atDoor)>2)continue;
   const normal=t.normal.clone().multiplyScalar(t.normal.getComponent(axis)*(door.sign??1)>0?1:-1),entry=planes.find(p=>p.normal.dot(normal)>.999999&&Math.abs(t.a.clone().sub(p.point).dot(p.normal))<.002);
   if(entry)entry.area+=t.area;else planes.push({area:t.area,normal,point:t.a.clone()});
  }
  const strongest=planes.reduce((n,v)=>Math.max(n,v.area),0),facades=planes.filter(v=>v.area>=Math.max(.15,strongest*.1)).sort((a,b)=>(b.point.getComponent(axis)-a.point.getComponent(axis))*(door.sign??1)).map(front=>({axis,sign:door.sign??1,at:front.point.getComponent(axis),door,wall:ts.filter(t=>Math.abs(t.normal.dot(front.normal))>.999999&&[t.a,t.b,t.c].every(p=>Math.abs(p.clone().sub(front.point).dot(front.normal))<.002)),normal:front.normal,point:front.point} as OpeningPlane));
  // Projecting window/planter cards can be farther forward than the actual
  // facade. Prefer a plane with a real gap at this native doorway; a solid
  // decorative rectangle must not suppress the authored recess behind it.
  // Keep the old opaque-plane fallback so no-gap walls do not become blanket
  // event corridors merely because a native warp is nearby.
  const probes=[floor+.6,...ys.filter(y=>y<=floor+2.25)],plane=facades.find(facade=>probes.some(y=>doorGaps(facade,y).length>0))??facades[0];if(!plane)continue;const at=plane.at;
  plane.measuredGapTop=measuredGapTop(plane,floor);planesFound.push(plane);
  for(const y of ys.filter(y=>y<=Math.max(floor+2.25,plane.measuredGapTop??-Infinity))){
   for(const side of doorGaps(plane,y))openings.push({axis,sign:door.sign??1,at,y,side,door,normal:plane.normal.toArray(),point:plane.point.toArray(),measuredGapTop:plane.measuredGapTop});
  }
 }
 openingPlanes.set(openings,planesFound);return openings;
}
function authoredRecesses(ts:Triangle[],root:THREE.Object3D,doors:BuildingEntrance[]):NativeRecess[]{
 const hIn=ts.filter(t=>/^h_in(?:_|$)/i.test(t.name));if(!hIn.length)return [];
 const inverse=root.matrixWorld.clone().invert(),points=hIn.flatMap(t=>[t.a,t.b,t.c].map(p=>p.clone().applyMatrix4(inverse))),b=new THREE.Box3().setFromPoints(points),size=b.getSize(new THREE.Vector3());
 // Native h_in is the dark floor/reveals of an authored door recess. Do not
 // turn a whole facade or disconnected broad material region into an opening.
 if(size.x<4||size.x>48||size.y<8||size.y>64||size.z<1||size.z>48)return [];
 const matching=doors.filter(door=>{
  if(door.passageOnly||door.axis===undefined||door.sign===undefined)return false;
  const p=new THREE.Vector3(door.x,root.getWorldPosition(new THREE.Vector3()).y,door.z).applyMatrix4(inverse),facing=new THREE.Vector3().setComponent(door.axis,door.sign).transformDirection(inverse);
  return facing.z>.8&&p.x>=b.min.x-4&&p.x<=b.max.x+4&&Math.abs(p.z-b.max.z)<=12;
 });
 return matching.length?[{bounds:b,inverse,doors:matching}]:[];
}
function authoredPhysicalApertures(ts:Triangle[],root:THREE.Object3D,modelId:number,doors:BuildingEntrance[]=[]):PhysicalAperture[]{
 const sourceShrine=[...sourceCategories.values()].find(entry=>entry.modelId===modelId&&entry.physicalSourcePortal)?.physicalSourcePortal;
 if(sourceShrine){
  const inverse=root.matrixWorld.clone().invert(),ns=ts.map(t=>[t.a,t.b,t.c].map(p=>p.clone().applyMatrix4(inverse))),guard=sourceShrine.literalGeometryGuards,left=guard.leftJambX,right=guard.rightJambX;
  const jambs=ns.filter(ps=>ps.every(p=>(Math.abs(p.x-left)<.02||Math.abs(p.x-right)<.02)&&p.y>=guard.innerJambY[0]-.02&&p.y<=guard.innerJambY[1]+.02&&p.z>=sourceShrine.jambDepth[0]-.02&&p.z<=sourceShrine.jambDepth[1]+.02)).flat();
  const header=ns.some(ps=>ps.every(p=>Math.abs(p.z-sourceShrine.at)<.02&&p.x>=left-.02&&p.x<=right+.02&&p.y>=guard.lintelY[0]-.02&&p.y<=guard.lintelY[1]+.02));
  const lowerJambs=ns.filter(ps=>ps.every(p=>(Math.abs(p.x-left)<.02||Math.abs(p.x-right)<.02)&&p.y>=guard.lowerJambY[0]-.02&&p.y<=guard.lowerJambY[1]+.02&&p.z>=sourceShrine.jambDepth[0]-.02&&p.z<=sourceShrine.jambDepth[1]+.02)).flat();
  const lowerJambProof=[left,right].every(x=>lowerJambs.some(p=>Math.abs(p.x-x)<.02))&&guard.lowerJambY.every((y:number)=>lowerJambs.some(p=>Math.abs(p.y-y)<.02));
  if(header&&lowerJambProof&&[left,right].every(x=>jambs.some(p=>Math.abs(p.x-x)<.02))&&guard.innerJambY.every((y:number)=>jambs.some(p=>Math.abs(p.y-y)<.02)))return [{axis:2,sign:1,at:sourceShrine.at,side:[left,right],height:sourceShrine.height,inverse,provenance:'source',evidence:'Literal Ruins shrine original upper jambs, Y36 lintel and lower vertical jamb feet reaching Y2, guarded against the source classification asset SHA; no horizontal floor asserted; no exported functional warp asserted.',reason:'source-authored physical shrine entrance; functional warp not asserted'}];
 }
 if(modelId===265){
  const inverse=root.matrixWorld.clone().invert(),points=ts.filter(t=>t.name==='d32_s03b_lm4').flatMap(t=>[t.a,t.b,t.c].map(p=>p.clone().applyMatrix4(inverse))),has=(x:number,y:number,z:number)=>points.some(p=>p.distanceTo(new THREE.Vector3(x,y,z))<.025);
  // The large western factory mouth has sloping jambs, so an axis-aligned
  // facade query cannot find it. Its source projected gap narrows above Y82
  // and terminates at the actual X-79 header, not the roof bounding box.
  if(![[-79,3,-33.765625],[-91,81.5078125,-33.765625],[-79,115.3671875,-23.765625],[-79,115.3671875,22.75],[-91,82.1875,31.75],[-79,3,31.75],[-79,115.3671875,-16.609375],[-79,115.3671875,15.6875]].every(p=>has(...p as [number,number,number])))return [];
  const matching=doors.filter(door=>{if(door.passageOnly||door.axis===undefined||door.sign===undefined)return false;const p=new THREE.Vector3(door.x,root.getWorldPosition(new THREE.Vector3()).y,door.z).applyMatrix4(inverse),facing=new THREE.Vector3().setComponent(door.axis,door.sign).transformDirection(inverse);return facing.x<-.99&&Math.abs(p.x+56)<1&&Math.abs(p.z)<=9;});
  const mouth:[number,number,number][]=[[-79,3,-33.765625],[-79,3,31.75],[-91,82.1875,31.75],[-91,81.5078125,-33.765625],[-79,115.3671875,22.75],[-79,115.3671875,-23.765625]],portalTriangles=[[0,1,2],[0,2,3],[3,2,4],[3,4,5]].map(indices=>indices.map(i=>mouth[i]));
  return matching.length?[{axis:0,sign:-1,at:-79,side:[-33.765625,31.75],height:[3,115.3671875],sideHeightPolygon:[[-33.765625,3],[31.75,3],[31.75,82.1875],[22.75,115.3671875],[-23.765625,115.3671875],[-33.765625,81.5078125]],portalTriangles,inverse,evidence:'265 virtual aperture probe surface bounded by literal d32_s03b_lm4 nonplanar western jambs and header; source lower X-79/Y3, outer X-91/Y81.5078..82.1875, header X-79/Y115.3671875; matching native west approach X-56/Z+/-8. Probe triangles are not solid/generated building geometry.',reason:'source-authored physical door recess with native entrance',nativeDoors:matching}]:[];
 }
 if(modelId===317){
  const inverse=root.matrixWorld.clone().invert(),jambs=ts.filter(t=>t.name==='lambert3').map(t=>[t.a,t.b,t.c].map(p=>p.clone().applyMatrix4(inverse))).filter(ps=>ps.every(p=>Math.abs(p.x+16.109375)<.02||Math.abs(p.x-15.8984375)<.02)&&ps.every(p=>p.z>=11.98&&p.z<=24.02)).flat();
  if(![-16.109375,15.8984375].every(x=>jambs.some(p=>Math.abs(p.x-x)<.02))||!jambs.some(p=>Math.abs(p.y-48.015625)<.02)||![12,24].every(z=>jambs.some(p=>Math.abs(p.z-z)<.02)))return [];
  const matching=doors.filter(door=>{if(door.passageOnly||door.axis===undefined||door.sign===undefined)return false;const p=new THREE.Vector3(door.x,root.getWorldPosition(new THREE.Vector3()).y,door.z).applyMatrix4(inverse),facing=new THREE.Vector3().setComponent(door.axis,door.sign).transformDirection(inverse);return facing.z>.99&&Math.abs(p.x)<2&&Math.abs(p.z-24)<1;});
  return matching.length?[{axis:2,sign:1,at:24,side:[-16.109375,15.8984375],height:[Math.min(...jambs.map(p=>p.y)),48.015625],inverse,evidence:'317 literal lambert3 source jambs X-16.109375/+15.8984375, Z12..24 and lintel48.015625, tied to actual front warp',reason:'source-authored physical door recess with native entrance',nativeDoors:matching}]:[];
 }
 if(modelId===264){
  const inverse=root.matrixWorld.clone().invert(),points=ts.flatMap(t=>[t.a,t.b,t.c].map(p=>p.clone().applyMatrix4(inverse))),porch=ts.filter(t=>t.name==='lambert10').map(t=>[t.a,t.b,t.c].map(p=>p.clone().applyMatrix4(inverse))).filter(ps=>ps.every(p=>Math.abs(p.y-81)<.02)).flat();
  if(![117.6796875,164.46875].every(x=>porch.some(p=>Math.abs(p.x-x)<.02))||![-2.6015625,45.1640625].every(z=>porch.some(p=>Math.abs(p.z-z)<.02)))return [];
  const matching=doors.filter(door=>{if(door.passageOnly||door.axis===undefined||door.sign===undefined)return false;const p=new THREE.Vector3(door.x,root.getWorldPosition(new THREE.Vector3()).y,door.z).applyMatrix4(inverse),facing=new THREE.Vector3().setComponent(door.axis,door.sign).transformDirection(inverse);return facing.x>.99&&Math.abs(p.x-64)<1&&p.z>=15&&p.z<=33;});
  return matching.length?[{axis:0,sign:1,at:117.6796875,side:[-2.6015625,45.1640625],height:[Math.min(...points.map(p=>p.y)),81],inverse,evidence:'264 actual horizontal lambert10 porch roof at Y81, inner edge X117.6796875 and measured Z bounds, tied to native east approach',reason:'source-authored physical porch aperture with native entrance',nativeDoors:matching}]:[];
 }
 // The Pokeathlon gate's two source canopies exist in all three contexts even
 // where only one is an active warp. These are physical openings, not an
 // assertion that both exits function in each map. Exact material guards keep
 // this measured exception away from unrelated gates and future replacements.
 if(modelId!==181||!['gate_lm1','gate_p2_lm1','gate_3_lm1'].every(name=>ts.some(t=>t.name===name)))return [];
 const inverse=root.matrixWorld.clone().invert(),points=ts.flatMap(t=>[t.a,t.b,t.c].map(p=>p.clone().applyMatrix4(inverse))),trim=ts.filter(t=>t.name==='gate_lm1').flatMap(t=>[t.a,t.b,t.c].map(p=>p.clone().applyMatrix4(inverse)));
 if(!trim.some(p=>Math.abs(p.y-60)<.02)||!trim.some(p=>Math.abs(p.y-64)<.02))return [];
 if(![-128,-96,40,88].every(x=>points.some(p=>Math.abs(p.x-x)<.02&&Math.abs(p.z+68.0859375)<.02&&(Math.abs(p.y-40)<.02||Math.abs(p.y-44)<.02))))return [];
 return [[-128,-96],[40,88]].map(side=>({axis:2,sign:-1,at:-68.0859375,side:side as [number,number],height:[1.96875,40] as [number,number],inverse,evidence:'181 native canopy outer edges, lintel underside and source side/trim materials; physical exit independent of active warp',reason:'source-authored physical canopy aperture; active warp not asserted'}));
}
function doorwayReason(origin:THREE.Vector3,direction:THREE.Vector3,doors:BuildingEntrance[],floor:number,openings:Opening[]):string|null{
 for(const aperture of physicalApertures.get(openings)||[]){
 const p=origin.clone().applyMatrix4(aperture.inverse),d=direction.clone().transformDirection(aperture.inverse),component=d.getComponent(aperture.axis);if(component*aperture.sign<=1e-7)continue;
  if(aperture.portalTriangles){const ray=new THREE.Ray(p,d);if(aperture.portalTriangles.some(points=>ray.intersectTriangle(...points.map(point=>new THREE.Vector3(...point)) as [THREE.Vector3,THREE.Vector3,THREE.Vector3],false,new THREE.Vector3())!==null))return aperture.reason;continue;}
  const distance=(aperture.at-p.getComponent(aperture.axis))/component;if(distance<0)continue;const at=p.addScaledVector(d,distance),side=at.getComponent(aperture.axis===0?2:0);
  const insideProfile=!aperture.sideHeightPolygon||aperture.sideHeightPolygon.every((a,i)=>{const b=aperture.sideHeightPolygon![(i+1)%aperture.sideHeightPolygon!.length];return (b[0]-a[0])*(at.y-a[1])-(b[1]-a[1])*(side-a[0])>=0;});
  if(side>=aperture.side[0]&&side<=aperture.side[1]&&at.y>=aperture.height[0]&&at.y<=aperture.height[1]&&insideProfile)return aperture.reason;
 }
 for(const recess of nativeRecesses.get(openings)||[]){
  const p=origin.clone().applyMatrix4(recess.inverse),d=direction.clone().transformDirection(recess.inverse);if(d.z<=1e-7)continue;
  const distance=(recess.bounds.max.z-p.z)/d.z;if(distance<0)continue;const at=p.addScaledVector(d,distance),b=recess.bounds;
  if(at.x>=b.min.x-.02&&at.x<=b.max.x+.02&&at.y>=b.min.y-.02&&at.y<=b.max.y+.02)return 'authored h_in recess with native entrance';
 }
 const planes=openingPlanes.get(openings)||[];
 for(const plane of planes){const component=direction.dot(plane.normal);if(component<1e-7)continue;const distance=plane.point.clone().sub(origin).dot(plane.normal)/component;if(distance<-.015)continue;const p=origin.clone().addScaledVector(direction,Math.max(0,distance));if(p.y>Math.max(floor+2.25,plane.measuredGapTop??-Infinity))continue;const side=p.getComponent(plane.axis===0?2:0);if(doorGaps(plane,p.y).some(gap=>side>=gap[0]-.005&&side<=gap[1]+.005))return 'measured native facade aperture';}
 if(origin.y>floor+2.25)return null;
 return doors.some(d=>{if(planes.some(p=>p.door===d))return false;const axis=d.axis??2,component=direction.getComponent(axis);if(Math.abs(component)<1e-5||Math.sign(component)!==d.sign)return false;const distance=((axis===0?d.x:d.z)-origin.getComponent(axis))/component;if(distance<0)return false;const p=origin.clone().addScaledVector(direction,distance);return p.y<=floor+2.25&&Math.abs((axis===0?p.z:p.x)-(axis===0?d.z:d.x))<=.72;})?'source entrance event corridor':null;
}
function doorwayRay(origin:THREE.Vector3,direction:THREE.Vector3,doors:BuildingEntrance[],floor:number,openings:Opening[]){return doorwayReason(origin,direction,doors,floor,openings)!==null;}
function measure(ts:Triangle[],body:THREE.Box3,seeds:THREE.Vector3[],doors:BuildingEntrance[],floor:number,openings:Opening[]=[],diagnoseEdges=false){
 const size=body.getSize(new THREE.Vector3()),far=size.length()*2+5,rays:Ray[]=[],edgeRays:Ray[]=[],edgeCount=tolerantHits;let tested=0,blocked=0,exactNoTriangleRays=0,alphaOnlyMissRays=0,alphaRejectedIntersections=0,exactOpaqueMissRays=0,nearOriginIntersections=0;
 for(const origin of seeds)for(const direction of rayDirections){
  tested++;const beforeEdge=tolerantHits,distance=cast(ts,origin,direction,far);alphaRejectedIntersections+=lastCast.alphaRejected;nearOriginIntersections+=lastCast.nearOriginHits;
  if(!lastCast.exactTriangleHits)exactNoTriangleRays++;if(!Number.isFinite(lastCast.exactOpaqueDistance)){exactOpaqueMissRays++;if(lastCast.exactTriangleHits&&lastCast.alphaRejected===lastCast.exactTriangleHits)alphaOnlyMissRays++;}
  if(Number.isFinite(distance)){blocked++;if(tolerantHits>beforeEdge)edgeRays.push({origin:origin.toArray(),direction:direction.toArray(),exit:exitFace(origin,direction,body),allowed:doorwayRay(origin,direction,doors,floor,openings),reason:'Exact intersection miss; blocker found only within edge tolerance',...(diagnoseEdges?{witness:edgeWitness(ts,origin,direction,far)!}:{})});continue;}
  const reason=doorwayReason(origin,direction,doors,floor,openings),ray={origin:origin.toArray(),direction:direction.toArray(),exit:exitFace(origin,direction,body),allowed:reason!==null,...(reason?{reason}:{})};rays.push(ray);
  if(diagnoseEdges&&edgeTolerance===0){const witness=edgeWitness(ts,origin,direction,far);if(witness)edgeRays.push({...ray,reason:'Exact intersection miss retained; opaque triangle within diagnostic edge threshold',witness});}
 }
 return {tested,blocked,exactNoTriangleRays,alphaOnlyMissRays,alphaRejectedIntersections,exactOpaqueMissRays,nearOriginIntersections,edgeToleranceHits:tolerantHits-edgeCount,diagnosticEdgeWitnesses:edgeRays.length,unexpectedDiagnosticEdgeWitnesses:edgeRays.filter(r=>!r.allowed).length,allowed:rays.filter(r=>r.allowed).length,physicalCanopyAllowances:rays.filter(r=>r.reason==='source-authored physical canopy aperture; active warp not asserted').length,sourceShrineApertureAllowances:rays.filter(r=>r.reason==='source-authored physical shrine entrance; functional warp not asserted').length,nativePorchAllowances:rays.filter(r=>r.reason==='source-authored physical porch aperture with native entrance').length,nativeProfiledDoorAllowances:rays.filter(r=>r.reason==='source-authored physical door recess with native entrance').length,nativeRecessAllowances:rays.filter(r=>r.reason==='authored h_in recess with native entrance').length,measuredApertureAllowances:rays.filter(r=>r.reason==='measured native facade aperture').length,eventCorridorAllowances:rays.filter(r=>r.reason==='source entrance event corridor').length,repairedPassageAllowances:rays.filter(r=>r.reason==='event-derived repaired passage; functional warp not asserted').length,unexpected:rays.filter(r=>!r.allowed).length,strictUnexpected:rays.filter(r=>!r.allowed).length+(edgeTolerance>0?edgeRays.filter(r=>!r.allowed).length:0),rays,edgeRays};
}
const index=await readJSON('index.json'),entrances=await readJSON('entrances.json'),maps=new Map<number,any>(),matrices=new Map<number,any>(),placements:Placement[]=[],seen=new Set<string>();
for(const info of Object.values(index.maps) as any[]){
 if(!['MAP_TYPE_ROUTE','MAP_TYPE_CITY_TOWN'].includes(info.mapType)&&![117,147].includes(info.id)||info.id===0)continue;
 const map=await readJSON(`maps/${info.id}.json`);maps.set(info.id,map);
 if(!matrices.has(info.matrix))matrices.set(info.matrix,await readJSON(`matrices/${info.matrix}.json`));const matrix=matrices.get(info.matrix);
 for(const cell of map.cells){
  if(matrix.headers&&matrix.headers[cell.z*matrix.width+cell.x]!==info.id)continue;
  for(const [n,prop]of cell.props.entries()){
   if(!prop.asset.startsWith('props/1-'))continue;
   const key=`${info.matrix}:${cell.x},${cell.z}:${n}`;if(seen.has(key))continue;seen.add(key);placements.push({matrix:info.matrix,map:info.id,mapName:info.name,key,cell:[cell.x,cell.z],altitude:cell.altitude,prop});
  }
 }
}
const templates=new Map<string,{raw:THREE.Object3D;repaired:THREE.Object3D;sha256:string}>(),assets:any[]=[],candidates:any[]=[];let scanned=0;
async function templateFor(asset:string){
 if(!templates.has(asset)){
  const bytes=await readFile(new URL(asset,root)),maps=textures(bytes),gltf=await loader.parseAsync(geometryGLB(bytes),'');
  gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){const convert=(old:THREE.Material)=>{const m=originalMaterial(old as THREE.MeshStandardMaterial);if(old.userData.auditTextureIndex!==undefined)m.map=maps[old.userData.auditTextureIndex];return m;};o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);}});
  const raw=clone(gltf.scene);repairOriginalAsset(gltf.scene,true);templates.set(asset,{raw,repaired:gltf.scene,sha256:createHash('sha256').update(bytes).digest('hex')});
 }
 return templates.get(asset)!;
}
function placed(base:THREE.Object3D,placement:Placement){const {prop}=placement,p=clone(base);p.userData.auditModelId=prop.id;p.scale.set(prop.scale[0]/16,prop.scale[1]/16,prop.scale[2]/16);p.rotation.set(prop.rotation[0]*Math.PI/180,prop.rotation[1]*Math.PI/180,prop.rotation[2]*Math.PI/180);p.position.set(placement.cell[0]*32+16+prop.position[0],placement.altitude*.5+prop.position[1],placement.cell[1]*32+16+prop.position[2]);p.updateMatrixWorld(true);return p;}
const builderMetrics=new WeakMap<THREE.Object3D,BuilderMetric>();
function candidateClose(root:THREE.Object3D,placement:Placement){
 const doors=entrances[placement.matrix]||[];
 const started=performance.now();let result:any;
 if(dispatcher)result=dispatcher(root,placement.prop.asset,doors);
 else{closeBuildingBack(root,doors);for(const helper of candidateHelpers)helper(root,placement.prop.asset,doors);result={family:requestedHelpers.join(',')};}
 const elapsedMilliseconds=performance.now()-started,fields=Object.entries(root.userData).flatMap(([name,value])=>value&&typeof value==='object'&&Number.isFinite(value.roofSamples)?[{path:`userData.${name}.roofSamples`,samples:Number(value.roofSamples)}]:[]);
 builderMetrics.set(root,{elapsedMilliseconds,mode:integratedCandidate?'runtime dispatcher':'partial helpers; development only',family:result.family??null,roofSampling:fields.length?{status:'exposed',samples:fields.reduce((n,field)=>n+field.samples,0),fields}:{status:'unsupported',samples:null,fields:[],reason:'This builder does not expose a roof-sample counter; zero samples cannot be inferred.'}});
 return result;
}
type PlacedGeometry={placement:Placement;bounds:THREE.Box3;raw:Triangle[];shared:Triangle[];repaired:Triangle[];candidate:Triangle[]};
const placedGeometry=new Map<string,PlacedGeometry>();
async function variantsFor(p:Placement){
 if(!placedGeometry.has(p.key)){
  const t=await templateFor(p.prop.asset),raw=triangles(placed(t.raw,p)),shared=triangles(placed(t.repaired,p)),rear=placed(t.repaired,p);closeBuildingBack(rear,entrances[p.matrix]||[]);
  const final=placed(t.repaired,p);candidateClose(final,p);placedGeometry.set(p.key,{placement:p,bounds:bounds(raw),raw,shared,repaired:triangles(rear),candidate:triangles(final)});
 }
 return placedGeometry.get(p.key)!;
}
const doorsPlaced:PlacedGeometry[]=[];
for(const p of placements)if(/DOOR/.test(sourceNames.get(p.prop.id)||''))doorsPlaced.push(await variantsFor(p));
// These are separate native placements, not missing faces in either GLB.
// Census of the selected matrices finds one exact co-located major assembly:
// BUILD_MODEL_POKE_C_DOME179 + POKE_C_DOME2 226. Gym107 is not actually placed.
const assemblyFamilies=[[179,226]];
function sameNativePose(a:Placement,b:Placement){
 if(a.matrix!==b.matrix)return false;
 const position=(p:Placement)=>[p.cell[0]*32+16+p.prop.position[0],p.altitude*.5+p.prop.position[1],p.cell[1]*32+16+p.prop.position[2]];
 return position(a).every((v,i)=>Math.abs(v-position(b)[i])<1/4096)&&a.prop.rotation.every((v,i)=>Math.abs(v-b.prop.rotation[i])<1e-6)&&a.prop.scale.every((v,i)=>Math.abs(v-b.prop.scale[i])<1e-6);
}
for(const placement of placements){
 if(assetFilter&&!assetFilter.some((s:string)=>placement.prop.asset.startsWith('props/'+s+'-')))continue;
 const {prop}=placement,template=await templateFor(prop.asset),raw=placed(template.raw,placement),repaired=placed(template.repaired,placement),rawTriangles=triangles(raw),structural=rawTriangles.filter(t=>!decorative.test(t.name)),b=bounds(structural.length?structural:rawTriangles),size=b.getSize(new THREE.Vector3());
 const ordinarySize=structural.length>0&&size.x>=2&&size.z>=2&&size.y>=2,candidate={...placement,modelName:sourceNames.get(prop.id),bounds:[xyz(b.min),xyz(b.max)],size:xyz(size),visibleTriangles:rawTriangles.length,structuralTriangles:structural.length,included:ordinarySize||prop.id===147,selectionReason:ordinarySize?'major solid geometry bounds':prop.id===147?'source-named thin League gate':structural.length?'below major dimensions; retained for explicit review':'no structural geometry; visible nonstructural cards retained for review'};candidates.push(candidate);
 if(!candidate.included){if(hasCandidate){const clone=placed(template.repaired,placement);candidateClose(clone,placement);(candidate as any).builder=builderMetrics.get(clone);}continue;}
 const assemblyFamily=assemblyFamilies.find(ids=>ids.includes(prop.id)),assemblyMembers:PlacedGeometry[]=[];
 if(assemblyFamily)for(const p of placements)if(p.key!==placement.key&&assemblyFamily.includes(p.prop.id)&&sameNativePose(placement,p))assemblyMembers.push(await variantsFor(p));
 const assemblyBounds=b.clone();for(const member of assemblyMembers)assemblyBounds.union(member.bounds);
 const attachmentBounds=assemblyBounds.clone().expandByScalar(.45),attachments=doorsPlaced.filter(d=>d.placement.matrix===placement.matrix&&d.placement.key!==placement.key&&attachmentBounds.intersectsBox(d.bounds)&&attachmentBounds.containsPoint(d.bounds.getCenter(new THREE.Vector3()))),rawAttachments=attachments.flatMap(a=>a.raw).concat(assemblyMembers.flatMap(a=>a.raw)),sharedAttachments=attachments.flatMap(a=>a.shared).concat(assemblyMembers.flatMap(a=>a.shared)),repairedAttachments=attachments.flatMap(a=>a.repaired).concat(assemblyMembers.flatMap(a=>a.repaired)),candidateAttachments=attachments.flatMap(a=>a.candidate).concat(assemblyMembers.flatMap(a=>a.candidate)),rawScene=rawTriangles.concat(rawAttachments);
 // Source roof shadows/decorations do not define the occupied body footprint.
 const floor=b.min.y,baseWalls=structural.filter(t=>Math.abs(t.normal.y)<.25&&Math.min(t.a.y,t.b.y,t.c.y)<=floor+.3&&Math.max(t.a.y,t.b.y,t.c.y)-Math.min(t.a.y,t.b.y,t.c.y)>.2&&t.area>.025),shell=structural.filter(t=>Math.abs(t.normal.y)<.25&&baseWalls.some(base=>Math.abs(base.normal.dot(t.normal))>.999&&[t.a,t.b,t.c].every(p=>Math.abs(p.clone().sub(base.a).dot(base.normal))<.03)));
 const body=baseWalls.length?bounds(baseWalls):b,footprint=hull(baseWalls.flatMap(t=>[t.a,t.b,t.c].filter(p=>p.y<=floor+.3).map(p=>new THREE.Vector2(p.x,p.z)))),bodyTop=shell.length?Math.max(...shell.flatMap(t=>[t.a.y,t.b.y,t.c.y])):floor+size.y*.6,bodyHeight=bodyTop-floor;
 const doors:BuildingEntrance[]=(entrances[placement.matrix]||[]).filter((d:BuildingEntrance)=>d.x>=body.min.x-.75&&d.x<=body.max.x+.75&&d.z>=body.min.z-.75&&d.z<=body.max.z+.75);
 const sourceCategory=sourceCategories.get(prop.asset);if(sourceCategory&&(sourceCategory.modelId!==prop.id||sourceCategory.sourceAssetSHA256!==template.sha256))throw Error(`Source category evidence no longer matches ${prop.asset}; recheck the native asset instead of applying stale classification`);
 const sourceKind=sourceCategory?.auditCategory;
 const passage=doors.some((a:BuildingEntrance)=>a.axis!==undefined&&a.sign!==undefined&&doors.some((b:BuildingEntrance)=>a.axis===b.axis&&b.sign!==undefined&&a.sign===-b.sign)),classification=sourceKind==='open-air decoration'||sourceKind==='damaged tower; enclosed ground story and authored open upper roof'?sourceKind:gateIDs.has(prop.id)?'source gate; passage review required':openAirIDs.has(prop.id)?'open-air decoration':prop.id===71?'raised enclosed shrine; open below stilts':prop.id===113?'enclosed decorative silo':passage?'through-building passage':doors.some(d=>!d.passageOnly)?'enclosed building with entrance':houseIDs.has(prop.id)||sourceKind==='closed decorative building'?'closed decorative building':'unclassified exterior structure';
 const seeds:THREE.Vector3[]=[],seedAudit={strategy:'floor-supported body grid',potential:27,outsideFootprintColumns:0,baseCoreRejectedColumns:0,roofRejected:0,horizontalSupportRejected:0,accepted:0,footprintDefined:footprint.length>=3,bodyHeight:round(bodyHeight),baseProbeY:round(floor+.2),replacedGenericGrid:null as Record<string,unknown>|null,sourceStoryRanges:[] as number[][],sourceBodyBounds:[] as number[][],supplementaryNativeCoreGrids:[] as {volume:string;x:number[];y:number[];z:number[];accepted:number}[],sourceRoofAbsences:0,sourceUnsupportedHorizontalCores:[] as {volume:string;nativeOrigin:number[];originalBlockers:number;reason:string}[],aboveSourceRoofRejected:[] as {origin:number[];nativeOrigin:number[];roofPoint:number[];reason:string}[],outsideSourceDoorCardRejected:[] as {origin:number[];nativeOrigin:number[];cardPoint:number[];floorPoint:number[];aperturePoint?:number[];reason:string}[],sourceVerandaRejected:[] as {origin:number[];nativeOrigin:number[];roomWallPoint:number[];floorPoint:number[];reason:string}[]};
 const replaceGenericGrid=(strategy:string,potential:number,reason:string)=>{
  seedAudit.replacedGenericGrid={potential:seedAudit.potential,acceptedCoordinates:seeds.map(seed=>seed.toArray()),outsideFootprintColumns:seedAudit.outsideFootprintColumns,baseCoreRejectedColumns:seedAudit.baseCoreRejectedColumns,roofRejected:seedAudit.roofRejected,horizontalSupportRejected:seedAudit.horizontalSupportRejected,reason};
  seedAudit.strategy=strategy;seedAudit.potential=potential;seedAudit.outsideFootprintColumns=0;seedAudit.baseCoreRejectedColumns=0;seedAudit.roofRejected=0;seedAudit.horizontalSupportRejected=0;seeds.length=0;
 };
 const cardinals=[new THREE.Vector3(1,0,0),new THREE.Vector3(-1,0,0),new THREE.Vector3(0,0,1),new THREE.Vector3(0,0,-1)],requiredSupport=passage?2:3;
 if(footprint.length>=3&&bodyHeight>.4)for(const fx of [.25,.5,.75])for(const fz of [.25,.5,.75]){
  const x=THREE.MathUtils.lerp(body.min.x,body.max.x,fx),z=THREE.MathUtils.lerp(body.min.z,body.max.z,fz);if(!inside(new THREE.Vector2(x,z),footprint,.12)){seedAudit.outsideFootprintColumns++;continue;}
  // A concave building's roof overhang can have three blockers at eave height
  // over otherwise open air. Require a supported body core near the floor too.
  const baseOrigin=new THREE.Vector3(x,floor+.2,z),baseSupport=cardinals.filter(d=>Number.isFinite(cast(rawScene,baseOrigin,d,size.length()*2))).length;
  if(baseSupport<requiredSupport){seedAudit.baseCoreRejectedColumns++;continue;}
  for(const fy of [.2,.5,.8]){const origin=new THREE.Vector3(x,floor+Math.min(bodyHeight-.12,Math.max(.2,bodyHeight*fy)),z);if(!Number.isFinite(cast(rawScene,origin,new THREE.Vector3(0,1,0),size.y*2))){seedAudit.roofRejected++;continue;}
   // Three enclosure directions prevent eaves/porches becoming fake interiors.
   const supported=cardinals.filter(d=>Number.isFinite(cast(rawScene,origin,d,size.length()*2))).length;
   if(supported>=requiredSupport)seeds.push(origin);else seedAudit.horizontalSupportRejected++;
  }
 }
 // The underground stair headhouse has raised glass above an intact sloping
 // opaque roof. A point between that roof and the ornamental frame is outside
 // the body even if the frame supplies roof coverage and side blockers. Keep
 // the source-plane/down-hit proof instead of counting it as an interior leak.
 if([290,339].includes(prop.id)&&seeds.length){
  const inverse=raw.matrixWorld.clone().invert(),mainRoof=structural.filter(t=>t.name==='ko_chika_a'&&[t.a,t.b,t.c].map(p=>p.clone().applyMatrix4(inverse)).every(p=>p.x>=9.98&&p.x<=28.02&&Math.abs(p.y+7*p.x/6-143/3)<.02)),down=new THREE.Vector3(0,-1,0).transformDirection(raw.matrixWorld);
  for(let i=seeds.length-1;i>=0;i--){const origin=seeds[i],distance=cast(mainRoof,origin,down,size.length()*2);if(!Number.isFinite(distance))continue;
   const roofPoint=origin.clone().addScaledVector(down,distance);seedAudit.aboveSourceRoofRejected.push({origin:origin.toArray(),nativeOrigin:origin.clone().applyMatrix4(inverse).toArray(),roofPoint:roofPoint.toArray(),reason:'Outside body: opaque ko_chika_a main-roof plane below seed; raised glass/frame is decorative roof coverage'});seeds.splice(i,1);
  }
 }
 if(prop.id===236&&seeds.length){
  const inverse=raw.matrixWorld.clone().invert(),faces=structural.filter(t=>t.name==='lambert2').map(t=>({triangle:t,points:[t.a,t.b,t.c].map(p=>p.clone().applyMatrix4(inverse))})),wall=faces.filter(face=>face.points.every(p=>Math.abs(p.z-12.23828125)<.02)).map(face=>face.triangle),deck=faces.filter(face=>face.points.every(p=>Math.abs(p.y-12)<.02)).map(face=>face.triangle);
  for(let i=seeds.length-1;i>=0;i--){const origin=seeds[i],local=origin.clone().applyMatrix4(inverse);if(local.x< -6||local.x>30||local.z<14||local.z>34||local.y<12||local.y>52)continue;
   const roomWallPoint=local.clone().setZ(12.23828125).applyMatrix4(raw.matrixWorld),floorPoint=local.clone().setY(12).applyMatrix4(raw.matrixWorld);if(!opaqueSourcePoint(wall,roomWallPoint)||!opaqueSourcePoint(deck,floorPoint))continue;
   seedAudit.sourceVerandaRejected.push({origin:origin.toArray(),nativeOrigin:local.toArray(),roomWallPoint:roomWallPoint.toArray(),floorPoint:floorPoint.toArray(),reason:'Outside closed room: bounded native veranda over opaque Y12 deck and in front of full opaque room facade at Z12.23828125'});seeds.splice(i,1);
  }
 }
 const sourceRecessProfiles:Record<number,{name:string;material:string;x:[number,number];y:[number,number];z:[number,number]}>= {
  295:{name:'Pal Park',material:'lambert10',x:[-18,18],y:[12,41],z:[26,38]},
  218:{name:'port h_in',material:'h_in',x:[-16,16.0859375],y:[2,32],z:[15,38]},
  240:{name:'prize exchange',material:'lambert3',x:[-17.607421875,1.607421875],y:[4.97265625,31.748046875],z:[4.369140625,20.369140625]},
 };
 const sourceRecess=sourceRecessProfiles[prop.id];
 if(sourceRecess&&seeds.length){
  const profile=sourceRecess,inverse=raw.matrixWorld.clone().invert(),ns=structural.map(triangle=>({triangle,points:[triangle.a,triangle.b,triangle.c].map(p=>p.clone().applyMatrix4(inverse))}));
  const jambs=ns.filter(face=>face.triangle.name===profile.material&&face.points.every(p=>(Math.abs(p.x-profile.x[0])<.02||Math.abs(p.x-profile.x[1])<.02)&&p.y>=profile.y[0]-.02&&p.y<=profile.y[1]+.02&&p.z>=profile.z[0]-.02&&p.z<=profile.z[1]+.02));
  const floorFaces=ns.filter(face=>face.points.every(p=>Math.abs(p.y-profile.y[0])<.02)).map(face=>face.triangle),cards=ns.filter(face=>face.points.every(p=>Math.abs(p.z-profile.z[0])<.02)).map(face=>face.triangle);
  if(profile.x.every(x=>jambs.some(face=>face.points.some(p=>Math.abs(p.x-x)<.02)))&&profile.y.every(y=>jambs.some(face=>face.points.some(p=>Math.abs(p.y-y)<.02))))for(let i=seeds.length-1;i>=0;i--){
   const origin=seeds[i],local=origin.clone().applyMatrix4(inverse);if(local.x<profile.x[0]||local.x>profile.x[1]||local.y<profile.y[0]||local.y>profile.y[1]||local.z<=profile.z[0]||local.z>profile.z[1])continue;
   const cardPoint=local.clone().setZ(profile.z[0]).applyMatrix4(raw.matrixWorld),floorPoint=local.clone().setY(profile.y[0]).applyMatrix4(raw.matrixWorld);if(!opaqueSourcePoint(cards,cardPoint)||!opaqueSourcePoint(floorFaces,floorPoint))continue;
   seedAudit.outsideSourceDoorCardRejected.push({origin:origin.toArray(),nativeOrigin:local.toArray(),cardPoint:cardPoint.toArray(),floorPoint:floorPoint.toArray(),reason:`Outside closed room: literal ${profile.name} front recess ahead of opaque source Z${profile.z[0]} backplate, bounded by native X[${profile.x}], Y${profile.y[0]} floor and Y${profile.y[1]} lintel; actual opaque source card and floor points verified`});seeds.splice(i,1);
  }
 }
 if(prop.id===87&&seeds.length){
  const inverse=raw.matrixWorld.clone().invert(),ns=structural.filter(t=>t.name==='ko_seimei_lm4').map(triangle=>({triangle,points:[triangle.a,triangle.b,triangle.c].map(p=>p.clone().applyMatrix4(inverse))}));
  const portal=[[-16.25390625,2.234375,16.94921875],[-9.88671875,11.42578125,15.65234375],[.14453125,31.16015625,12.41015625],[.08984375,31.16015625,12.41015625],[9.17578125,11.42578125,15.65234375],[15.63671875,2.234375,16.94921875]].map(p=>new THREE.Vector3(...p as [number,number,number]));
  const cards=ns.filter(face=>face.points.every(p=>p.z>=4.96875-.001&&p.z<=5.0546875+.001)).map(face=>face.triangle),floorFaces=ns.filter(face=>face.points.every(p=>Math.abs(p.y-2.234375)<.001)).map(face=>face.triangle);
  const probeTriangles=[[0,1,2],[0,2,3],[0,3,4],[0,4,5]].map(ids=>ids.map(i=>portal[i]));
  if(cards.length===3&&floorFaces.length===2&&portal.every(p=>ns.some(face=>face.points.some(v=>v.distanceTo(p)<.001))))for(let i=seeds.length-1;i>=0;i--){
   const origin=seeds[i],local=origin.clone().applyMatrix4(inverse);if(local.z<=5.0546875||local.z>16.94921875||local.y<2.234375||local.y>31.16015625)continue;
   const probe=new THREE.Ray(local,new THREE.Vector3(0,0,1)),aperturePoint=probeTriangles.map(ps=>probe.intersectTriangle(...ps as [THREE.Vector3,THREE.Vector3,THREE.Vector3],false,new THREE.Vector3())).find(p=>p!==null);if(!aperturePoint)continue;
   const backward=new THREE.Vector3(0,0,-1).transformDirection(raw.matrixWorld),distance=cast(cards,origin,backward,size.length()*2),floorPoint=local.clone().setY(2.234375).applyMatrix4(raw.matrixWorld);if(!Number.isFinite(distance)||!opaqueSourcePoint(floorFaces,floorPoint))continue;
   const cardPoint=origin.clone().addScaledVector(backward,distance);seedAudit.outsideSourceDoorCardRejected.push({origin:origin.toArray(),nativeOrigin:local.toArray(),cardPoint:cardPoint.toArray(),floorPoint:floorPoint.toArray(),aperturePoint:aperturePoint.clone().applyMatrix4(raw.matrixWorld).toArray(),reason:'Outside closed room: original87 inclined-curtain entry alcove. Actual opaque nonplanar native backplate hit, exact Y2.234375 floor point and bounded six-vertex original jamb/apex probe all verified; no functional warp asserted'});seeds.splice(i,1);
  }
 }
 if([35,36,246,247].includes(prop.id)&&seeds.length){
  const inverse=raw.matrixWorld.clone().invert(),ns=structural.filter(t=>t.name==='gate_2_lm1').map(t=>({triangle:t,points:[t.a,t.b,t.c].map(p=>p.clone().applyMatrix4(inverse))})),alongZ=[35,246].includes(prop.id),axis=alongZ?2:0,cardAt=alongZ?17.29296875:21.29296875,outerAt=alongZ?36:40,floors=ns.filter(face=>face.points.every(p=>Math.abs(p.y-8)<.02)).map(face=>face.triangle);
  for(let i=seeds.length-1;i>=0;i--){
   const origin=seeds[i],local=origin.clone().applyMatrix4(inverse),component=local.getComponent(axis),sign=alongZ?1:Math.sign(component),side=local.getComponent(alongZ?0:2);
   if(local.y<8||local.y>40||Math.abs(side)>20||component*sign<=cardAt+1e-7||component*sign>outerAt)continue;
   const cards=ns.filter(face=>face.points.every(p=>Math.abs(p.getComponent(axis)-sign*cardAt)<.02)).map(face=>face.triangle),cardPoint=local.clone().setComponent(axis,sign*cardAt).applyMatrix4(raw.matrixWorld),floorPoint=local.clone().setY(8).applyMatrix4(raw.matrixWorld);
   if(!opaqueSourcePoint(cards,cardPoint)||!opaqueSourcePoint(floors,floorPoint))continue;
   seedAudit.outsideSourceDoorCardRejected.push({origin:origin.toArray(),nativeOrigin:local.toArray(),cardPoint:cardPoint.toArray(),floorPoint:floorPoint.toArray(),reason:'Outside closed room: bounded native exterior entry alcove ahead of opaque gate_2_lm1 card, over its authored Y8 floor'});seeds.splice(i,1);
  }
  if(ns.some(face=>face.points.every(p=>Math.abs(p.getComponent(axis)-cardAt)<.02)&&face.points.some(p=>Math.abs(p.y-8)<.02)&&face.points.some(p=>Math.abs(p.y-40)<.02))&&floors.length){
   replaceGenericGrid('source-measured central gate room; exterior alcoves and rear awnings excluded',27,'Native plinths, rear awnings and entry alcoves enlarge the generic hull. Replace with source-measured central closed-room cores; event-derived rear entry geometry is not labelled source-authored.');
   const up=new THREE.Vector3(0,1,0).transformDirection(raw.matrixWorld),nativeCardinals=cardinals.map(d=>d.clone().transformDirection(raw.matrixWorld)),grid={volume:'common closed gate room behind native cards and event-derived north card where present',x:[-16,0,16],y:[16,32,52],z:alongZ?[-12,0,12]:[-16,0,16],accepted:0};seedAudit.supplementaryNativeCoreGrids.push(grid);
   for(const x of grid.x)for(const y of grid.y)for(const z of grid.z){
    const origin=new THREE.Vector3(x,y,z).applyMatrix4(raw.matrixWorld);if(!Number.isFinite(cast(rawScene,origin,up,size.length()*2))){seedAudit.roofRejected++;continue;}
    if(nativeCardinals.filter(d=>Number.isFinite(cast(rawScene,origin,d,size.length()*2))).length<3){seedAudit.horizontalSupportRejected++;continue;}seeds.push(origin);grid.accepted++;
   }
  }
 }
 // The pagodas' native bases extend beneath the enclosed first story, so a
 // hull taken at global minY has no actual walls. Use the nine measured timber
 // story ranges instead of reporting zero rays as enclosure proof. The X/Z
 // cores lie inside its actual +/-29.953 upper walls (+/-36 lower story), not
 // under the eaves. Each point still needs real roof and wall support.
 const pagodaStories=prop.id===9?[[8,56],[76.453125,96],[114.625,134.171875],[153.234375,172.78125],[192.015625,211.5625],[230.796875,250.34375],[270.28125,289.84375],[309.765625,329.328125],[348.90625,368.453125]]:prop.id===54?[[8,56],[76.4453125,96],[115.2265625,134.78125]]:null;
 if(pagodaStories&&!seeds.length&&structural.some(t=>t.name===(prop.id===9?'en_suzu2':'kk_mada_b'))){
  const stories=pagodaStories;
  replaceGenericGrid('source-measured timber story cores',stories.length*27,'Source pedestal lies below the actual timber room walls; native story ranges replace the unsupported floor hull.');seedAudit.sourceStoryRanges=stories;
  const up=new THREE.Vector3(0,1,0).transformDirection(raw.matrixWorld),nativeCardinals=cardinals.map(d=>d.clone().transformDirection(raw.matrixWorld));
  for(const [bottom,top]of stories)for(const x of [-20,0,20])for(const z of [-20,0,20])for(const fy of [.25,.5,.75]){
   const origin=new THREE.Vector3(x,THREE.MathUtils.lerp(bottom,top,fy),z).applyMatrix4(raw.matrixWorld);
   if(!Number.isFinite(cast(rawScene,origin,up,size.length()*2))){seedAudit.roofRejected++;continue;}
   const supported=nativeCardinals.filter(d=>Number.isFinite(cast(rawScene,origin,d,size.length()*2))).length;
   if(supported>=3)seeds.push(origin);else seedAudit.horizontalSupportRejected++;
  }
 }
 if(prop.id===71&&!seeds.length&&structural.some(t=>t.name==='t5_s02_lm')){
  replaceGenericGrid('source-measured raised shrine chamber; undercroft remains open',27,'The native platform/stilts lie below the enclosed chamber and must remain open.');seedAudit.sourceBodyBounds=[[-14,19.19921875,-12.599609375],[14,36,16.599609375]];
  const up=new THREE.Vector3(0,1,0).transformDirection(raw.matrixWorld),nativeCardinals=cardinals.map(d=>d.clone().transformDirection(raw.matrixWorld));
  for(const x of [-8,0,8])for(const z of [-8,0,8])for(const y of [20,28,35]){
   const origin=new THREE.Vector3(x,y,z).applyMatrix4(raw.matrixWorld);
   if(!Number.isFinite(cast(rawScene,origin,up,size.length()*2))){seedAudit.roofRejected++;continue;}
   const supported=nativeCardinals.filter(d=>Number.isFinite(cast(rawScene,origin,d,size.length()*2))).length;
   if(supported>=3)seeds.push(origin);else seedAudit.horizontalSupportRejected++;
  }
 }
 // Frontier Tower262's projecting entrance landing lies below the enclosed
 // body and its fins extend behind the actual wall plane. The body is proven
 // by four native side-wall bands, not those decorative bounds. Its source
 // roof is genuinely missing: retain that original-stage failure rather than
 // refusing every interior seed because it has no roof before the repair.
 if(prop.id===262&&!seeds.length&&structural.some(t=>t.name==='b_tower3_lm5')){
  const inverse=raw.matrixWorld.clone().invert(),points=structural.filter(t=>t.name==='b_tower3_lm5').flatMap(t=>[t.a,t.b,t.c].map(p=>p.clone().applyMatrix4(inverse)));
  if([-95,95].every(x=>[-122,-38,2,48,208].every(y=>points.some(p=>Math.abs(p.x-x)<.02&&Math.abs(p.y-y)<.02&&p.z>=-79.02&&p.z<=22.091)))){
   replaceGenericGrid('source-measured tower body; original roof absence retained',27,'The low entrance landing and projecting rear fins do not define the actual native wall rectangle.');seedAudit.sourceBodyBounds=[[-95,-122,-79],[95,208,22.0703125]];
   const up=new THREE.Vector3(0,1,0).transformDirection(raw.matrixWorld),nativeCardinals=cardinals.map(d=>d.clone().transformDirection(raw.matrixWorld));
   for(const x of [-60,0,60])for(const z of [-55,-20,10])for(const y of [-100,0,180]){
    const origin=new THREE.Vector3(x,y,z).applyMatrix4(raw.matrixWorld),supported=nativeCardinals.filter(d=>Number.isFinite(cast(rawScene,origin,d,size.length()*2))).length;
    if(supported<3){seedAudit.horizontalSupportRejected++;continue;}
    if(!Number.isFinite(cast(rawScene,origin,up,size.length()*2)))seedAudit.sourceRoofAbsences++;seeds.push(origin);
   }
  }
 }
 // These large structures start below their occupied cabin/body elevations.
 // Their authored front/side planes and roof establish conservative interior
 // volumes even when another original side is absent. Do not require that
 // missing side to exist before testing whether the candidate really seals it.
 if([168,265,266].includes(prop.id)&&!seeds.length){
  const inverse=raw.matrixWorld.clone().invert(),name=prop.id===168?'aqua_mn6':prop.id===265?'d32_s03b_lm4':'d32_s04a_lm2',points=structural.filter(t=>t.name===name).flatMap(t=>[t.a,t.b,t.c].map(p=>p.clone().applyMatrix4(inverse))),has=(x:number,y:number,z:number)=>points.some(p=>p.distanceTo(new THREE.Vector3(x,y,z))<.025),guard=prop.id===168?has(-42.859375,32,-56)&&has(-42.859375,62,-56)&&has(-18.6640625,62,-24):prop.id===265?has(-79,3,82)&&has(-91,82,82)&&has(79,82,82)&&points.some(p=>Math.abs(p.z+82)<.02&&Math.abs(p.y-3)<.02):has(-80,1.984375,-62.1328125)&&has(-80,96,65.03125)&&points.some(p=>Math.abs(p.x-72.6015625)<.02&&Math.abs(p.z-65.03125)<.02);
  if(guard){
   const grid=prop.id===168?{volume:'measured S.S. Aqua enclosed cabin; exterior decks and hull are not claimed',x:[-38,-30,-22],y:[40,48,56],z:[-52,-40,-28],accepted:0}:prop.id===265?{volume:'measured Factory body behind native west entrance, below main source roof',x:[-40,0,40],y:[20,50,75],z:[-40,0,40],accepted:0}:{volume:'measured Arcade body behind native west entrance, below source Y103 deck',x:[-40,0,40],y:[20,50,80],z:[-30,0,30],accepted:0},up=new THREE.Vector3(0,1,0).transformDirection(raw.matrixWorld),nativeCardinals=cardinals.map(d=>d.clone().transformDirection(raw.matrixWorld));
   replaceGenericGrid('source-measured cabin/body cores; original missing sides do not censor interior coverage',grid.x.length*grid.y.length*grid.z.length,'The generic lowest-geometry hull cannot establish these raised cabin/body interiors; exact native body vertices guard the replacement.');seedAudit.sourceBodyBounds=prop.id===168?[[-42.859375,32,-56],[-18.6640625,62,-24]]:prop.id===265?[[-79,3,-82],[79,82,82]]:[[-80,1.984375,-62.1328125],[72.6015625,96,65.03125]];seedAudit.supplementaryNativeCoreGrids.push(grid);
   for(const x of grid.x)for(const y of grid.y)for(const z of grid.z){
    const origin=new THREE.Vector3(x,y,z).applyMatrix4(raw.matrixWorld),originalBlockers=nativeCardinals.filter(d=>Number.isFinite(cast(rawScene,origin,d,size.length()*2))).length;
    if(!Number.isFinite(cast(rawScene,origin,up,size.length()*2))){if(prop.id===265)seedAudit.sourceRoofAbsences++;else{seedAudit.roofRejected++;continue;}}
    if(originalBlockers<3)seedAudit.sourceUnsupportedHorizontalCores.push({volume:grid.volume,nativeOrigin:[x,y,z],originalBlockers,reason:'Interior profile established by measured native body planes and overhead source roof; omitted original side is retained as an original-stage failure'});
    seeds.push(origin);grid.accepted++;
   }
  }
 }
 if([86,110,113].includes(prop.id)){
  const inverse=raw.matrixWorld.clone().invert(),name=prop.id===86?'radio_b':prop.id===110?'toudai2':'r39_naya_lm2',points=structural.filter(t=>t.name===name).flatMap(t=>[t.a,t.b,t.c].map(p=>p.clone().applyMatrix4(inverse))),bands=prop.id===86?[67,129]:prop.id===110?[62.84375,129.2421875]:[8.2265625,81.0625];
  if(bands.every(y=>points.some(p=>Math.abs(p.y-y)<.02))){
   const grids=prop.id===86?[{volume:'measured radio tower octagonal mast',x:[-3,0,3],y:[75,95,115],z:[-3,0,3],accepted:0},{volume:'measured radio tower curved observation elevation',x:[-10,0,10],y:[128,133,137],z:[-10,0,10],accepted:0}]:[{volume:prop.id===110?'measured lighthouse hexagonal shaft and upper flare':'measured enclosed hexagonal silo',x:[-5,0,5],y:prop.id===110?[70,95,120,135]:[12,25,45,65,77],z:[-5,0,5],accepted:0}],up=new THREE.Vector3(0,1,0).transformDirection(raw.matrixWorld),nativeCardinals=cardinals.map(d=>d.clone().transformDirection(raw.matrixWorld));
   if(prop.id===110&&structural.some(t=>t.name==='hikari'))grids.push({volume:'measured lighthouse lantern inside literal glazing',x:[-3,0,3],y:[150,160],z:[-3,0,3],accepted:0});
   for(const grid of grids){seedAudit.potential+=grid.x.length*grid.y.length*grid.z.length;seedAudit.supplementaryNativeCoreGrids.push(grid);
    for(const x of grid.x)for(const y of grid.y)for(const z of grid.z){
     const origin=new THREE.Vector3(x,y,z).applyMatrix4(raw.matrixWorld);if(seeds.some(seed=>seed.distanceToSquared(origin)<1e-12))continue;
     const originalBlockers=nativeCardinals.filter(d=>Number.isFinite(cast(rawScene,origin,d,size.length()*2))).length;
     if(originalBlockers<3){if(prop.id===86)seedAudit.sourceUnsupportedHorizontalCores.push({volume:grid.volume,nativeOrigin:[x,y,z],originalBlockers,reason:'Proven central circular/octagonal source body; original rear half is absent and must remain an original-stage failure rather than censoring its back-half cores'});else{seedAudit.horizontalSupportRejected++;continue;}}
     if(!Number.isFinite(cast(rawScene,origin,up,size.length()*2)))seedAudit.sourceRoofAbsences++;seeds.push(origin);grid.accepted++;
    }
   }
  }
 }
 seedAudit.accepted=seeds.length;
 const openings=nativeOpenings(structural,doors,floor,seeds),recesses=authoredRecesses(structural,raw,doors),canopies=authoredPhysicalApertures(structural,raw,prop.id,doors);nativeRecesses.set(openings,recesses);physicalApertures.set(openings,canopies);
 const shared=triangles(repaired).concat(sharedAttachments),added=closeBuildingBack(repaired,entrances[placement.matrix]||[]),final=triangles(repaired).concat(repairedAttachments);
 const before=measure(rawScene,b,seeds,doors,floor,openings),afterShared=measure(shared,b,seeds,doors,floor,openings),after=measure(final,b,seeds,doors,floor,openings,!hasCandidate);
 const candidateRoot=placed(template.repaired,placement),closure=hasCandidate?candidateClose(candidateRoot,placement):undefined;
 if(hasCandidate)(candidate as any).builder=builderMetrics.get(candidateRoot);
 const candidateTriangles=hasCandidate?triangles(candidateRoot).concat(candidateAttachments):[];
 if(hasCandidate&&prop.id===295&&closure?.family==='civic'&&candidateRoot.userData.civicBuildingShell?.family==='pal-park'){
  const inverse=raw.matrixWorld.clone().invert(),hints=doors.filter(door=>{const p=new THREE.Vector3(door.x,raw.getWorldPosition(new THREE.Vector3()).y,door.z).applyMatrix4(inverse);return door.passageOnly&&Math.abs(Math.abs(p.x)-8)<.02&&Math.abs(p.z+40)<.02;}),at=(p:number[])=>new THREE.Vector3(...p as [number,number,number]).applyMatrix4(raw.matrixWorld);
  if(hints.length===2&&[[0,44.2,-44],[-16.2,20,-44],[16.2,20,-44]].every(point=>opaqueSourcePoint(candidateTriangles,at(point))))canopies.push({axis:2,sign:-1,at:-44,side:[-16.1,16.1],height:[2,44.1],inverse,provenance:'event-derived repair',evidence:'295 candidate Pal Park shell applied; opaque generated header/side witnesses verified. Exact repaired cut is the union of two passageOnly hint centers X-8/+8 at Z-40, with 8.1 native unit repair half-widths; this northern aperture is not source-authored and does not assert a functional warp.',reason:'event-derived repaired passage; functional warp not asserted',nativeDoors:hints});
 }
 const candidateStage=hasCandidate?measure(candidateTriangles,b,seeds,doors,floor,openings,true):undefined;
 const rayKey=(r:Ray)=>r.origin.join(',')+'/'+r.direction.join(','),legacyEscapes=new Set(after.rays.filter(r=>!r.allowed).map(rayKey)),candidateOnlyUnexpected=candidateStage?.rays.filter(r=>!r.allowed&&!legacyEscapes.has(rayKey(r)))||[];
 assets.push({key:placement.key,matrix:placement.matrix,map:placement.map,mapName:placement.mapName,asset:prop.asset,modelId:prop.id,modelName:sourceNames.get(prop.id),classification,materials:[...new Set(rawTriangles.map(t=>t.name))],alphaMaterials:[...new Set(rawTriangles.filter(t=>t.alphaThreshold>0).map(t=>t.name))],bounds:[xyz(b.min),xyz(b.max)],bodyBounds:[xyz(body.min),xyz(body.max)],bodyTop:round(bodyTop),footprint:footprint.map(p=>p.toArray().map(round)),seeds:seeds.map(xyz),seedAudit,geometryDiagnostics:{original:geometryDiagnostics.get(raw),candidate:geometryDiagnostics.get(candidateRoot)},entrances:doors,assemblyMembers:assemblyMembers.map(m=>({key:m.placement.key,asset:m.placement.prop.asset,modelId:m.placement.prop.id,reason:'source-authored co-located Dome179/Dome2-226 assembly'})),attachments:attachments.map(d=>({key:d.placement.key,asset:d.placement.prop.asset,modelId:d.placement.prop.id,bounds:[xyz(d.bounds.min),xyz(d.bounds.max)]})),nativeOpenings:openings,authoredRecesses:recesses.map(r=>({bounds:[r.bounds.min.toArray(),r.bounds.max.toArray()],doors:r.doors})),sourcePhysicalApertures:canopies.map(({inverse,...aperture})=>aperture),addedRearTriangles:added,candidateClosure:closure,builder:builderMetrics.get(candidateRoot),candidateOnlyUnexpected,stages:{original:{...before,rays:undefined},sharedRepair:{...afterShared,rays:undefined},withEntrances:{...after,rays:undefined},...(candidateStage?{candidate:{...candidateStage,rays:undefined}}:{})},escapes:(candidateStage??after).rays,numericalEdgeRays:(candidateStage??after).edgeRays,reviewRequired:seeds.length===0?'no confident interior core':classification==='unclassified exterior structure'?'source category requires manual classification':classification.includes('gate')?'check native corridor and archway openings individually':undefined});
 scanned++;if(scanned%25===0)console.error(`Audited ${scanned} major placements`);
}
const finalStage=(a:any)=>a.stages.candidate??a.stages.withEntrances,closed=(a:any)=>['enclosed building with entrance','closed decorative building','raised enclosed shrine; open below stilts','enclosed decorative silo'].includes(a.classification);
const assetSummary=[...new Set(assets.map(a=>a.asset))].sort().map(asset=>{
 const rows=assets.filter(a=>a.asset===asset),stages:Record<string,Record<string,number>>={};
 for(const row of rows)for(const [name,stage]of Object.entries(row.stages))for(const [key,value]of Object.entries(stage as object))if(typeof value==='number'){stages[name]??={};stages[name][key]=(stages[name][key]||0)+value;}
 return {asset,modelId:rows[0].modelId,modelName:rows[0].modelName,sha256:templates.get(asset)!.sha256,placements:rows.map(a=>a.key),classifications:[...new Set(rows.map(a=>a.classification))],placementsWithoutCore:rows.filter(a=>!a.seeds.length).map(a=>a.key),unexpectedPlacements:rows.filter(a=>finalStage(a).unexpected).map(a=>a.key),manualClassification:rows.some(a=>a.reviewRequired!==undefined),stages};
});
const builderRows=candidates.filter(row=>row.builder).map(row=>({key:row.key,asset:row.prop.asset,modelId:row.prop.id,major:row.included,...row.builder}));
function builderStats(rows:typeof builderRows){
 const elapsed=rows.map(row=>row.elapsedMilliseconds).sort((a,b)=>a-b),percentile=(p:number)=>elapsed.length?elapsed[Math.max(0,Math.ceil(elapsed.length*p)-1)]:null;
 return {placements:rows.length,elapsedMilliseconds:elapsed.reduce((n,v)=>n+v,0),p50Milliseconds:percentile(.5),p95Milliseconds:percentile(.95),maxMilliseconds:elapsed.at(-1)??null,exposedRoofSamplingPlacements:rows.filter(row=>row.roofSampling.status==='exposed').length,unsupportedRoofSamplingPlacements:rows.filter(row=>row.roofSampling.status==='unsupported').length,exposedRoofSamples:rows.reduce((n,row)=>n+(row.roofSampling.samples??0),0)};
}
const builderPerformance={status:hasCandidate?'measured single synchronous call per inventoried bank-one placement':'unsupported without candidate stage',scope:'Only closeBuildingExterior (or explicit partial helpers), including generic and family construction. Excludes clone, asset load/shared repair, world terrain/footings, ray tests and metric collection. Node wall-clock timings under current process/CPU contention are not browser frame-time measurements.',allInventoried:builderStats(builderRows),majorStructures:builderStats(builderRows.filter(row=>row.major)),families:Object.fromEntries([...new Set(builderRows.map(row=>row.family??'generic-only'))].map(family=>[family,builderStats(builderRows.filter(row=>(row.family??'generic-only')===family))])),slowestPlacements:[...builderRows].sort((a,b)=>b.elapsedMilliseconds-a.elapsedMilliseconds).slice(0,30),largestExposedRoofSampling:[...builderRows].filter(row=>row.roofSampling.status==='exposed').sort((a,b)=>b.roofSampling.samples-a.roofSampling.samples).slice(0,30),limitation:'Roof-sample counts are exposed counters only. Builders without counters are explicitly unsupported, never assumed to perform zero sampling.'};
const sourceHashesAfter=Object.fromEntries(await Promise.all(Object.keys(sourceHashes).map(async path=>[path,createHash('sha256').update(await readFile(new URL('../'+path,import.meta.url))).digest('hex')])));
const changedSourceFilesDuringAudit=Object.keys(sourceHashes).filter(path=>sourceHashes[path]!==sourceHashesAfter[path]);
const sourceRevisionAfter=execFileSync('git',['rev-parse','HEAD'],{cwd:new URL('../../',import.meta.url),encoding:'utf8'}).trim();
const result={version:4,provenanceStatus:changedSourceFilesDuringAudit.length===0&&sourceRevision===sourceRevisionAfter&&sourceWorkingTreeChanges.length===0?'committed-source snapshot; finite ray evidence, separate visual approval required':'provisional working-source snapshot; immutable commit and complete rerun required',sourceRevision,sourceRevisionAfter,sourceWorkingTreeChanges,sourceHashes,sourceHashesAfter,changedSourceFilesDuringAudit,codeSnapshotStable:changedSourceFilesDuringAudit.length===0&&sourceRevision===sourceRevisionAfter,sourceDataHashes,sourceAssets:Object.fromEntries([...templates].map(([asset,v])=>[asset,v.sha256])),generatedAt:new Date().toISOString(),method:{scope:'All exterior route/city/town maps plus source forest gate maps 117/147. Bank-1 solid bounds at least 2×2×2 tiles, plus thin League gates. All rejected candidates retain bounds and placement transforms.',rayDirections:rayDirections.length,broadphase:{mode:'brute-force' in args?'disabled; original triangle scan':'read-only triangle-AABB BVH',paddingTiles:broadphasePadding,leafTriangles:broadphaseLeafTriangles,verifiedCasts:verifiedBroadphaseCasts,narrowphase:'Original triangle order, exact Three intersection, rayNear, UV/alpha and full diagnostic fallback are unchanged. Padding only admits extra broadphase candidates.'},raySamplingMode:"dense" in args?"dense321":"default81",pitchAzimuthCounts:rayPattern,pitchesDegrees:rayPattern.map(([pitch])=>pitch),edgeToleranceTiles:edgeTolerance,diagnosticEdgeWitnessThresholdTiles:1e-6,rayNearTiles:rayNear,assemblyFamilies,bodySeeds:'3×3 footprint grid, three wall-relative heights, under source roof, at least three horizontal blockers both near the floor and at each seed height; through-buildings allow two. Pagodas9/54 and raised shrine71 use measured native chamber/story cores. Gates35/36/246/247 use measured central rooms behind native cards and any event-derived rear card. Tower262 retains original roof absence within proven body cores; source-body profiles168/265/266 preserve omitted-side deficits. Native roof ornament/veranda/entry-alcove exclusions retain actual source-hit witnesses. Lighthouse/radio/silo elevations add proven shaft/lantern cores. Replaced generic grids, rejection counts and explicit source ranges remain recorded.',usedGeometry:'Visible used-index triangles, skinned getVertexPosition plus full world transforms; Body bounds exclude shadow/foliage materials. Surface intersections are two-sided for physical enclosure; the separate gallery must review outward visibility and material sides. Rays include visible shadow-named door cards with decoded alpha, while omitting foliage and materials below 0.5 opacity. Lighthouse110 projected hikari searchlights with native U0.02..<0.15 are omitted and counted separately; actual glazing U>0.19 remains. Actual placed DOOR attachments and verified native co-located assemblies remain separate recorded blockers.',alpha:'Embedded 8-bit RGBA PNG decoded losslessly. MASK/BLEND intersections interpolate UV barycentrically and use texture wrap/flipY, native alphaTest or 0.5 blend-opacity threshold. Native OPAQUE remains opaque regardless of image alpha.',exceptions:'Event corridors have a 2.25-tile height bound; measured facade gaps extend only to a proven native header. Authored h_in recesses use their native rectangle and a matching front-facing functional entrance. Physical source apertures181/264/265/317 use guarded native canopy/porch/jamb extents; Ruins158/159/161/162 physical entrances use source-hashed literal upper/lower jamb and lintel geometry without asserting a functional warp;265 uses a nonplanar virtual probe bounded by source jamb/header vertices, not building geometry;181 remains distinct from active warp metadata.218/240/295 reject only source-card/floor-proven front exterior alcoves.87 additionally verifies its inclined native curtain aperture and exact nonplanar backplate hit.295 separately labels its event-derived repaired northern passage; functional warp is not asserted. No downward-floor assertion. Open-air props and named gates retain raw rays and require source review.',candidateHelpers:requestedHelpers,helperGraph,houseModelClassificationSource:"HOUSE_BUILDING_MODELS export from src/source/house-building-shells.ts",sourceCategoryRegistry:"reviews/building-category-triage.json readOnlySourceClassifications; exact native asset SHA guarded per placement",dispatcherDependencies,candidateDispatcher:integratedCandidate?'src/source/building-exterior.ts':null,limitations:['No automatic visual approval or stylistic/material validation.','numericalEdgeRays preserve exact-intersection misses and optional nearby opaque triangle witnesses, including strict mode; diagnostic witnesses do not change strict blocked/unexpected counts and are not strict seals.','Unclassified structures, native gate passages and missing confident cores require manual classification.','Interior seeds are conservative and cannot prove every decorative attachment is closed.']},summary:{candidatePlacements:candidates.length,majorPlacements:assets.length,uniqueAssets:new Set(assets.map(a=>a.asset)).size,canonicalModels:new Set(assets.map(a=>a.modelId)).size,matrices:[...new Set(assets.map(a=>a.matrix))].sort((a,b)=>a-b),confidentPlacements:assets.filter(a=>a.seeds.length).length,rawUnexpectedEscapePlacements:assets.filter(a=>finalStage(a).unexpected).length,rawUnexpectedRays:assets.reduce((n,a)=>n+finalStage(a).unexpected,0),closedBuildingPlacements:assets.filter(closed).length,closedBuildingPlacementsWithoutCore:assets.filter(a=>closed(a)&&!a.seeds.length).length,closedBuildingSampledRays:assets.filter(closed).reduce((n,a)=>n+finalStage(a).tested,0),closedBuildingDiagnosticEdgeWitnesses:assets.filter(closed).reduce((n,a)=>n+finalStage(a).unexpectedDiagnosticEdgeWitnesses,0),closedBuildingEscapePlacements:assets.filter(a=>closed(a)&&finalStage(a).unexpected).length,closedBuildingUnexpectedRays:assets.filter(closed).reduce((n,a)=>n+finalStage(a).unexpected,0),closedBuildingUnexpectedRaysWithoutDiagnosticWitness:assets.filter(closed).reduce((n,a)=>n+finalStage(a).unexpected-finalStage(a).unexpectedDiagnosticEdgeWitnesses,0),unclassified:assets.filter(a=>a.classification==='unclassified exterior structure').length,totalSampledRays:assets.reduce((n,a)=>n+finalStage(a).tested,0),exactNoTriangleRays:assets.reduce((n,a)=>n+finalStage(a).exactNoTriangleRays,0),alphaOnlyMissRays:assets.reduce((n,a)=>n+finalStage(a).alphaOnlyMissRays,0),nativeRecessAllowances:assets.reduce((n,a)=>n+finalStage(a).nativeRecessAllowances,0),physicalCanopyAllowances:assets.reduce((n,a)=>n+finalStage(a).physicalCanopyAllowances,0),sourceShrineApertureAllowances:assets.reduce((n,a)=>n+finalStage(a).sourceShrineApertureAllowances,0),nativePorchAllowances:assets.reduce((n,a)=>n+finalStage(a).nativePorchAllowances,0),nativeProfiledDoorAllowances:assets.reduce((n,a)=>n+finalStage(a).nativeProfiledDoorAllowances,0),measuredApertureAllowances:assets.reduce((n,a)=>n+finalStage(a).measuredApertureAllowances,0),eventCorridorAllowances:assets.reduce((n,a)=>n+finalStage(a).eventCorridorAllowances,0),repairedPassageAllowances:assets.reduce((n,a)=>n+finalStage(a).repairedPassageAllowances,0),diagnosticEdgeWitnesses:assets.reduce((n,a)=>n+finalStage(a).diagnosticEdgeWitnesses,0),unexpectedDiagnosticEdgeWitnesses:assets.reduce((n,a)=>n+finalStage(a).unexpectedDiagnosticEdgeWitnesses,0),edgeToleranceHits:assets.reduce((n,a)=>n+finalStage(a).edgeToleranceHits,0),invalidCorePlacements:assets.filter(a=>!a.seeds.length).length},classificationSummary:Object.fromEntries([...new Set(assets.map(a=>a.classification))].map(classification=>{const rows=assets.filter(a=>a.classification===classification);return [classification,{placements:rows.length,placementsWithoutCore:rows.filter(a=>!a.seeds.length).length,sampledRays:rows.reduce((n,a)=>n+finalStage(a).tested,0),strictUnexpectedRays:rows.reduce((n,a)=>n+finalStage(a).strictUnexpected,0),unexpectedDiagnosticEdgeWitnesses:rows.reduce((n,a)=>n+finalStage(a).unexpectedDiagnosticEdgeWitnesses,0)}];})),builderPerformance,assetSummary,candidates,placements:assets};
const temporary=new URL(output.href+'.tmp');await writeFile(temporary,JSON.stringify(result,null,2)+'\n');await rename(temporary,output);console.log(JSON.stringify(result.summary));
