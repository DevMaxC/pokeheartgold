import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,access} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {furnitureObstacles,furnitureBlocksStep} from './furniture-collision.ts';
import {repairOriginalAsset,closeBuildingBack,originalMaterial} from './render-repair.ts';
import {Terraces} from './ledges.ts';
import {terraceModel} from './terrace-model.ts';
import {nativeTreeAsset} from './tree-fixture.test.ts';

const root=new URL('../../public/source/',import.meta.url);
const readJSON=async(path:string)=>JSON.parse(await readFile(new URL(path,root),'utf8'));

// Keep the original binary geometry, accessors, material names and transforms.
// Omit only image references: this batch checks geometry, not texture decoding.
function geometryGLB(bytes:Buffer):ArrayBuffer{
  const jsonLength=bytes.readUInt32LE(12);const json=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
  delete json.images;delete json.textures;delete json.samplers;
  for(const material of json.materials||[]){material.extras={...material.extras,geometryAuditHasTexture:!!material.pbrMetallicRoughness?.baseColorTexture};delete material.pbrMetallicRoughness?.baseColorTexture;delete material.pbrMetallicRoughness?.metallicRoughnessTexture;delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;}
  let encoded=JSON.stringify(json);encoded+=' '.repeat((4-Buffer.byteLength(encoded)%4)%4);const jsonBuffer=Buffer.from(encoded);const rest=bytes.subarray(20+jsonLength);
  const result=Buffer.alloc(20+jsonBuffer.length+rest.length);bytes.copy(result,0,0,20);result.writeUInt32LE(result.length,8);result.writeUInt32LE(jsonBuffer.length,12);jsonBuffer.copy(result,20);rest.copy(result,20+jsonBuffer.length);return result.buffer.slice(result.byteOffset,result.byteOffset+result.byteLength) as ArrayBuffer;
}
test('all imported prop and landscape geometries accept shared rendering repairs without invalid vertices',async t=>{
  const loader=new GLTFLoader(),foliage=await readJSON('foliage.json'),texture=new THREE.Texture();let props=0,lands=0,solidAssets=0,treeAssets=0,uprightAssets=0,fenceAssets=0,flowerAssets=0,terrainAssets=0,texturedBacks=0;
  for(const folder of ['props','land'])for(const file of (await readdir(new URL(folder+'/',root))).filter(f=>f.endsWith('.glb'))){
    const gltf=await loader.parseAsync(geometryGLB(await readFile(new URL(folder+'/'+file,root))),'');
    const entries=folder==='land'?foliage[file.match(/-(\d+)\.glb$/)![1]]??{}:{};let nativeTrees=folder==='props'&&file==='1-136-7.glb';gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh&&(Array.isArray(o.material)?o.material:[o.material]).some(m=>entries[m.name]))nativeTrees=true;});
    if(nativeTrees)gltf.scene=await nativeTreeAsset(folder+'/'+file);else gltf.scene.traverse(object=>{if(!(object instanceof THREE.Mesh))return;const convert=(old:THREE.Material)=>{const m=originalMaterial(old as THREE.MeshStandardMaterial);if(old.userData.geometryAuditHasTexture)m.map=texture;return m;};object.material=Array.isArray(object.material)?object.material.map(convert):convert(object.material);});
    const result=repairOriginalAsset(gltf.scene,folder==='props');if(result.solidFaces)solidAssets++;if(result.billboardTrees){treeAssets++;let crowns=0;gltf.scene.traverseVisible(o=>{if(!(o instanceof THREE.InstancedMesh)||!o.name.startsWith('solid-original-tree-'))return;if(o.name==='solid-original-tree-canopies')crowns+=o.count;assert.equal(o.userData.sceneryRoots.length,o.count,'Every native tree component keeps its authored root');assert.ok((o.material as THREE.MeshBasicMaterial).map instanceof THREE.DataTexture,'Native tree repair requires readable pixels, not placeholders');assert.ok(o.geometry.getAttribute('uv'),'Every closed native component has texture coordinates');});assert.equal(crowns,result.billboardTrees,folder+'/'+file);}if(result.uprightPanels)uprightAssets++;if(result.fencePosts)fenceAssets++;if(result.flowerClumps)flowerAssets++;if(result.terrainSkirts)terrainAssets++;
    if(folder==='land'&&file==='0-2.glb')gltf.scene.traverse(object=>{if(!(object instanceof THREE.InstancedMesh)||object.name!=='solid-original-tree-canopies')return;assert.ok(object.userData.sceneryRoots.length>0);for(let i=0;i<object.count;i++){const matrix=new THREE.Matrix4();object.getMatrixAt(i,matrix);assert.ok(new THREE.Vector3().setFromMatrixScale(matrix).x<=64.001,'Original New Bark forest rows must be split into individual 64-unit trees.');}});
    gltf.scene.traverse(object=>{if(!(object instanceof THREE.Mesh))return;if(object.name==='textured-terrain-back')texturedBacks++;if(object instanceof THREE.InstancedMesh)assert.ok(Array.from(object.instanceMatrix.array).every(Number.isFinite));const p=object.geometry.getAttribute('position');assert.ok(Array.from(p.array).every(Number.isFinite),folder+'/'+file);object.geometry.dispose();for(const m of Array.isArray(object.material)?object.material:[object.material]){if(m.vertexColors)assert.ok(object.geometry.getAttribute('color'),`${folder}/${file}: ${object.name} enables vertex colours without colour data`);m.dispose();}});
    if(folder==='props')props++;else lands++;
  }
  assert.equal(props,948,'947 static prop contexts plus native Azalea dynamic118');assert.equal(lands,648);assert.ok(solidAssets>100);assert.ok(treeAssets>10);assert.ok(texturedBacks>100,'Texture placeholders must exercise the generated textured-back material path');t.diagnostic(`Audited ${props} prop contexts and ${lands} landscapes; repaired ${solidAssets} structural assets and ${treeAssets} tree assets and ${uprightAssets} upright cut-out assets; ${fenceAssets} solid-fence, ${flowerAssets} flower-volume and ${terrainAssets} terrain-closure contexts; ${texturedBacks} textured backs.`);
});
test('all 540 map headers reference existing imported geometry and tile data',async()=>{
  const index=await readJSON('index.json');assert.equal(Object.keys(index.maps).length,540);const paths=new Set<string>();
  for(const id of Object.keys(index.maps)){const map=await readJSON(`maps/${id}.json`);assert.equal(map.id,Number(id));paths.add(`matrices/${map.matrix}.json`);
    for(const cell of map.cells){paths.add(cell.asset);paths.add(`lands/${cell.land}.json`);for(const prop of cell.props)paths.add(prop.asset);}
    // 0xFFF is the source's dynamic return-location sentinel (field_control.c).
    for(const warp of map.events.warps||[])if(Number(warp.header)!==0xFFF)assert.notEqual(index.mapIds[warp.header],undefined,`${id}: ${warp.header}`);
  }
  await Promise.all([...paths].map(path=>access(new URL(path,root))));
});

test('terrace deformation preserves actual native tree roots and valid geometry across adjacent town/route cells',async()=>{
 const terraces=new Terraces(await readJSON('terraces/0.json'));let trees=0;
 for(const[id,cx,cz]of [[33,18,12],[67,17,12],[60,21,12]]){
  const map=await readJSON(`maps/${id}.json`),cell=map.cells.find((c:{x:number;z:number})=>c.x===cx&&c.z===cz),gltf={scene:await nativeTreeAsset(cell.asset)};repairOriginalAsset(gltf.scene,false);
  const group=new THREE.Group();group.position.set(cx*32+16,cell.altitude*.5,cz*32+16);gltf.scene.scale.setScalar(1/16);group.add(gltf.scene);group.updateMatrixWorld(true);const roots:{mesh:THREE.InstancedMesh;index:number;point:THREE.Vector3;anchor:THREE.Vector3}[]=[];group.traverseVisible(o=>{if(o instanceof THREE.InstancedMesh&&['solid-original-tree-canopies','solid-original-tree-trunks'].includes(o.name))for(let i=0;i<o.count;i++){const matrix=new THREE.Matrix4();o.getMatrixAt(i,matrix);roots.push({mesh:o,index:i,point:new THREE.Vector3().setFromMatrixPosition(matrix).applyMatrix4(o.matrixWorld),anchor:new THREE.Vector3().fromArray(o.userData.sceneryRoots[i]).applyMatrix4(o.matrixWorld)});}});
  await terraceModel(group,terraces);group.updateMatrixWorld(true);for(const root of roots){const matrix=new THREE.Matrix4();root.mesh.getMatrixAt(root.index,matrix);const p=new THREE.Vector3().setFromMatrixPosition(matrix).applyMatrix4(root.mesh.matrixWorld);assert.ok(Math.abs(p.x-root.point.x)<1e-5);assert.ok(Math.abs(p.z-root.point.z)<1e-5);assert.ok(Math.abs(p.y-root.point.y-terraces.height(root.anchor.x,root.anchor.z))<1e-5);trees++;}
  group.traverseVisible(o=>{if(!(o instanceof THREE.Mesh))return;assert.ok(Array.from(o.geometry.getAttribute('position').array).every(Number.isFinite),cell.asset);for(const m of Array.isArray(o.material)?o.material:[o.material]){if(m.vertexColors)assert.ok(o.geometry.getAttribute('color'));if((m as THREE.MeshBasicMaterial).map&&!(m instanceof THREE.ShaderMaterial))assert.ok(o.geometry.getAttribute('uv'));}});
 }
 assert.ok(trees>30);
});
test('repeated lightmap forest textures resolve to complete individual-tree artwork',async()=>{
 const foliage=await readJSON('foliage.json');let repeated=0;
 for(const group of Object.values(foliage) as Record<string,{asset:string;centers:number[];footV:number}>[])for(const [name,entry]of Object.entries(group))if(/_re(?:_|$)/.test(name)){
  repeated++;assert.ok(!/_re(?:_|\.)/.test(entry.asset),name);assert.ok(entry.centers.length>=1);assert.ok(entry.footV>0&&entry.footV<=1);await access(new URL(entry.asset,root));
 }
 assert.ok(repeated>10);assert.equal(foliage['2'].tree01_re_lm1.asset,'foliage/2-tree01gs_lm1.png');assert.equal(foliage['2'].treekn_re_lm1.asset,'foliage/2-treekn_lm1.png');
});
test('forked roots are grouped without losing off-centre trunks or unmarked multi-tree art',async()=>{
 const foliage=await readJSON('foliage.json');
 for(const name of ['en_tree02_re','en_tree03_re','en_tree04_re','en_tree05_re'])assert.equal(foliage['6'][name].centers.length,2,name);
 for(const name of ['en_tree02','en_tree03','en_tree04','en_tree05'])assert.equal(foliage['6'][name].centers.length,1,name);
 assert.equal(foliage['13'].bush_a.centers[0],.25);assert.equal(foliage['8'].tree_ki3.centers[0],.15625);assert.equal(foliage['93'].tree3_01_lm1.centers[0],.765625);
 for(const name of ['tree_w02','tree_w02_2','tree_w2_2']){assert.equal(foliage['8'][name].centers.length,2);assert.ok(/tree_w01/.test(foliage['8'][name].asset));}
 for(const suffix of ['lm1','lm2','lm3']){const entry=foliage['92']['bf_tree03_'+suffix];assert.equal(entry.centers.length,2);assert.equal(entry.asset,'foliage/92-bf_tree01_'+suffix+'.png');assert.ok(entry.footU<.5);}
});
test('entrance metadata takes façade direction from native door and gate tiles across the entire matrix',async()=>{
 const all=await readJSON('entrances.json');let count=0;for(const entries of Object.values(all) as {x:number;z:number;axis:number;sign:number;behavior:number;map:number;passageOnly?:boolean}[][])for(const e of entries){if(e.passageOnly)continue;count++;assert.ok([98,99,100,101,105,108,109,110,111].includes(e.behavior));assert.ok(e.axis===0||e.axis===2);assert.ok(e.sign===1||e.sign===-1);if(e.behavior===105){assert.equal(e.axis,2);assert.equal(e.sign,1);}}
 assert.ok(count>500);const cherrygrove=all['0'].filter((e:{map:number})=>e.map===67);assert.equal(cherrygrove.length,5);assert.ok(cherrygrove.some((e:{x:number;z:number})=>e.x===564.5&&e.z===391.5));
});
test('the actual Cherrygrove Center, Mart and houses have opaque rear walls below their roofs',async()=>{
 for(const [file,doorX,doorZ]of [['1-40-0.glb',0,1.5],['1-39-0.glb',-.5,1],['1-37-0.glb',-.5,1]] as const){const gltf=await new GLTFLoader().parseAsync(geometryGLB(await readFile(new URL('props/'+file,root))),'');gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh)o.material=Array.isArray(o.material)?o.material.map(m=>originalMaterial(m as THREE.MeshStandardMaterial)):originalMaterial(o.material as THREE.MeshStandardMaterial);});repairOriginalAsset(gltf.scene,true);gltf.scene.scale.setScalar(1/16);assert.ok(closeBuildingBack(gltf.scene,[{x:doorX,z:doorZ}])>0,file);gltf.scene.updateMatrixWorld(true);for(const x of [-.5,0,.5]){const hits=new THREE.Raycaster(new THREE.Vector3(x,1,-10),new THREE.Vector3(0,0,1)).intersectObject(gltf.scene,true);assert.ok(hits.length>0,`${file} rear x=${x}`);assert.ok(hits[0].point.z<0,`${file} rear must block sight through to its front`);}if(file==='1-37-0.glb'){const wall=new THREE.Box3().setFromObject(gltf.scene.getObjectByName('entrance-rear-wall')!),building=new THREE.Box3().setFromObject(gltf.scene);assert.ok(wall.max.y<building.max.y-.2,'Rear wall cladding must stay below the original roof');}}
});

test('every native flat-seat variant becomes a closed raised seat while cushions stay low',async t=>{
 const ids=new Set([32,53,54,55,56,57,58,75,185]),files=(await readdir(new URL('props/',root))).filter(f=>f.startsWith('0-')&&ids.has(Number(f.split('-')[1])));let repaired=0;
 for(const file of files){
  const gltf=await new GLTFLoader().parseAsync(geometryGLB(await readFile(new URL('props/'+file,root))),'');
  gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh)o.material=Array.isArray(o.material)?o.material.map(m=>originalMaterial(m as THREE.MeshStandardMaterial)):originalMaterial(o.material as THREE.MeshStandardMaterial);});
  const original=gltf.scene.children[0],summary=repairOriginalAsset(gltf.scene,true),seat=gltf.scene.getObjectByName('solid-original-furniture') as THREE.Mesh;assert.equal(summary.solidSeats,1,file);assert.ok(seat,file);repaired++;
  const b=new THREE.Box3().setFromObject(seat),c=b.getCenter(new THREE.Vector3());const obstacles=furnitureObstacles(gltf.scene);assert.equal(obstacles.length,1,file);assert.equal(furnitureBlocksStep(obstacles,c.x-20,c.z,c.x,c.z,0,0,3.84),true,file+' blocks entry at native 16-unit scale');assert.equal(furnitureBlocksStep(obstacles,c.x-20,c.z,c.x+20,c.z,0,0,3.84),true,file+' blocks crossing with clear endpoints');assert.equal(furnitureBlocksStep(obstacles,c.x,c.z,c.x+20,c.z,0,0,3.84),false,file+' old saves can leave');assert.ok(Math.abs(b.min.y)<.001,file+' supports reach source floor');assert.equal(b.max.y,Number(file.split('-')[1])===56?2.5:8,file);
  assert.ok(b.max.x<=8.001&&b.min.x>=-8.001&&b.max.z<=32.001&&b.min.z>=-32.001,file+' stays within its source footprint');
  const top=new THREE.Raycaster(new THREE.Vector3(c.x,20,c.z),new THREE.Vector3(0,-1,0)).intersectObject(seat)[0];assert.ok(top,file+' top');assert.equal(top.point.y,b.max.y,file);
  for(const [x,z,dx,dz]of [[c.x,50,0,-1],[c.x,-50,0,1],[-50,c.z,1,0],[50,c.z,-1,0]])assert.ok(new THREE.Raycaster(new THREE.Vector3(x,b.max.y-.5,z),new THREE.Vector3(dx,0,dz)).intersectObject(seat).length,file+' opaque side');
  const p=seat.geometry.getAttribute('position');for(let i=0;i<p.count;i++)if(Math.abs(p.getY(i))<.001){const hit=new THREE.Raycaster(new THREE.Vector3(p.getX(i),20,p.getZ(i)),new THREE.Vector3(0,-1,0)).intersectObject(seat)[0];assert.ok(hit&&Math.abs(hit.point.y-b.max.y)<.001,file+' every support stays fully beneath the seat');}const edges=new Map<string,number>();for(let i=0;i<p.count;i+=3)for(let e=0;e<3;e++){const key=[i+e,i+(e+1)%3].map(j=>[p.getX(j),p.getY(j),p.getZ(j)].map(n=>n.toFixed(4)).join(',')).sort().join('|');edges.set(key,(edges.get(key)||0)+1);}assert.ok([...edges.values()].every(n=>n===2),file+' every surface is closed');
  assert.equal((seat.material as THREE.Material).transparent,false);assert.equal((seat.material as THREE.Material).alphaTest,0);for(const name of ['position','uv','color','normal'])assert.ok(Array.from(seat.geometry.getAttribute(name).array).every(Number.isFinite),file+':'+name);
  assert.equal(original.parent,gltf.scene,'original source hierarchy remains attached');assert.equal(repairOriginalAsset(gltf.scene,true).solidSeats,0,'repair is idempotent');
 }
 assert.equal(repaired,files.length);assert.ok(repaired>=35);t.diagnostic(`Verified all ${repaired} native seat/bench/cushion/box texture variants.`);
});

test('all exported tree shapes retain visible sprite bounds and proven generic material aliases',async()=>{
 const foliage=await readJSON('foliage.json');let layouts=0,aliases=0;for(const entries of Object.values(foliage) as Record<string,{topV:number;footV:number;crownWidth:number;family?:string}>[])for(const entry of Object.values(entries)){layouts++;assert.ok(entry.topV>=0&&entry.topV<entry.footV);assert.ok(entry.crownWidth>0&&entry.crownWidth<=1);if(entry.family)aliases++;}assert.equal(layouts,124);assert.equal(aliases,5);assert.equal(foliage['2'].tree01.topV,15/64);assert.equal(foliage['2'].lambert77.family,'treekn');
});
