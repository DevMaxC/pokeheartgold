import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {extrudeTriangle,repairOriginalAsset,originalMaterial,closeBuildingBack} from './render-repair.ts';
import {syntheticTreeTexture,treeTexture} from './tree-fixture.test.ts';

test('repeated placements keep the same fallback tint without changing the shared colour cache',()=>{
  const material=new THREE.MeshBasicMaterial({color:new THREE.Color(.8,.6,.4)}),geometry=new THREE.BoxGeometry(4,3,3),colors=new Float32Array(geometry.attributes.position.count*3).fill(.5);geometry.translate(0,1.5,0);geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const observed:THREE.Color[]=[];for(let i=0;i<3;i++){const root=new THREE.Group();root.add(new THREE.Mesh(geometry,material));assert.ok(closeBuildingBack(root,[{x:0,z:1.5,axis:2,sign:1}])>0);observed.push(((root.getObjectByName('entrance-rear-wall')as THREE.Mesh).material as THREE.MeshBasicMaterial).color.clone());}
  for(const color of observed)assert.ok(Math.hypot(color.r-.4,color.g-.3,color.b-.2)<1e-12,'vertex tint is applied once to each placement');assert.deepEqual(material.color.toArray(),[.8,.6,.4]);
});

test('a missing rear surface becomes a closed prism, with every edge used twice',()=>{
  const front=[new THREE.Vector3(-2,0,2),new THREE.Vector3(2,0,2),new THREE.Vector3(0,4,2)];
  const faces=[front,...extrudeTriangle(front,2,-2)];const edges=new Map<string,number>();
  for(const face of faces)for(let i=0;i<3;i++){const key=[face[i].toArray().join(','),face[(i+1)%3].toArray().join(',')].sort().join('|');edges.set(key,(edges.get(key)||0)+1);}
  assert.equal(faces.length,8);assert.ok([...edges.values()].every(n=>n===2));
});
test('one-sided building and small-prop geometry gets solid rear surfaces',()=>{
  for(const size of [4,80]){const root=new THREE.Group(),geometry=new THREE.PlaneGeometry(size,size);geometry.translate(0,size/2,3);const material=new THREE.MeshBasicMaterial({color:'#d0c5a3',side:THREE.DoubleSide});material.name='original-wall';root.add(new THREE.Mesh(geometry,material));
    const before=new THREE.Box3().setFromObject(root);const result=repairOriginalAsset(root,true);assert.ok(result.solidFaces>0);assert.ok(root.children.some(c=>c.name==='3d-solid-backing'));
    const after=new THREE.Box3().setFromObject(root);assert.equal(after.min.x,before.min.x);assert.equal(after.max.x,before.max.x);assert.ok(after.max.z-after.min.z>=1.5);
  }
});
test('fully volumetric props and translucent ground shadows are left intact',()=>{
  const root=new THREE.Group();root.add(new THREE.Mesh(new THREE.BoxGeometry(4,4,4),new THREE.MeshBasicMaterial()));const shadow=new THREE.MeshBasicMaterial({transparent:true,opacity:.29});shadow.name='h_kage';root.add(new THREE.Mesh(new THREE.PlaneGeometry(9,9),shadow));const result=repairOriginalAsset(root,true);assert.equal(result.solidFaces,0);
});
test('a disconnected mailbox gets its own local backing rather than the building bounds',()=>{
  const root=new THREE.Group();const material=new THREE.MeshBasicMaterial();material.name='wall';
  root.add(new THREE.Mesh(new THREE.BoxGeometry(80,80,60),material));
  const mailbox=new THREE.PlaneGeometry(4,4);mailbox.translate(60,4,40);root.add(new THREE.Mesh(mailbox,material));repairOriginalAsset(root,true);
  const backing=root.children.find(c=>c.name==='3d-rear-facade') as THREE.Mesh;assert.ok(backing);
  backing.geometry.computeBoundingBox();const bounds=backing.geometry.boundingBox!;
  assert.equal(bounds.min.z,38.5);assert.equal(bounds.max.z,38.5);assert.equal(bounds.min.x,58);assert.equal(bounds.max.x,62);
});
test('an original front doorway does not create a transparent hole through the rear',()=>{
  const root=new THREE.Group();const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});material.name='house';
  // A U-shaped front wall with an actual doorway, plus a rearward roof.
  for(const [w,h,x,y]of [[4,8,-4,4],[4,8,4,4],[4,3,0,6.5]]){const geometry=new THREE.PlaneGeometry(w,h);geometry.translate(x,y,5);root.add(new THREE.Mesh(geometry,material));}
  const roof=new THREE.PlaneGeometry(12,10);roof.rotateX(-Math.PI/2);roof.translate(0,8,0);root.add(new THREE.Mesh(roof,material));
  repairOriginalAsset(root,true);root.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(new THREE.Vector3(0,2,-10),new THREE.Vector3(0,0,1));
  const hit=ray.intersectObjects(root.children,true).find(h=>h.object.name==='3d-solid-backing');assert.ok(hit);assert.ok(hit.point.z<0);
});
test('tilted native tree cards become closed pixel-textured instances at their literal foot UV',()=>{
 const root=new THREE.Group(),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([-32,0,0,32,0,0,32,49.34375,-40.765625,-32,0,0,32,49.34375,-40.765625,-32,49.34375,-40.765625],3));g.setAttribute('uv',new THREE.Float32BufferAttribute([0,1,1,1,1,0,0,1,1,0,0,0],2));const material=new THREE.MeshBasicMaterial({map:syntheticTreeTexture()});material.name='tree01';const original=new THREE.Mesh(g,material);root.add(original);assert.equal(repairOriginalAsset(root,false).billboardTrees,1);assert.equal(original.visible,false);const tree=root.getObjectByName('solid-original-tree-canopies')as THREE.InstancedMesh,matrix=new THREE.Matrix4();tree.getMatrixAt(0,matrix);assert.ok(Math.abs(new THREE.Vector3().setFromMatrixScale(matrix).y-64)<.1);const foot=tree.userData.sceneryRoots[0];assert.ok(Math.abs(foot[1]-49.34375*.0625)<1e-5);assert.ok(Math.abs(foot[2]+40.765625*.0625)<1e-5);assert.equal(root.getObjectByName('camera-facing-original-trees'),undefined);
});
test('blended source materials retain their original depth-write setting',()=>{const source=new THREE.MeshStandardMaterial({transparent:true,depthWrite:false,opacity:.7});source.name='source-alpha';const material=originalMaterial(source);assert.equal(material.depthWrite,false);assert.equal(material.transparent,true);assert.equal(material.opacity,.7);assert.equal(material.name,source.name);});
test('recessed rear artwork sits outside its backing and thin cutouts have no front-facing backing',()=>{
  const root=new THREE.Group(),wall=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});wall.name='wall';const front=new THREE.PlaneGeometry(10,10);front.translate(0,5,3);root.add(new THREE.Mesh(front,wall));const roof=new THREE.PlaneGeometry(10,10);roof.rotateX(-Math.PI/2);roof.translate(0,10,0);root.add(new THREE.Mesh(roof,wall));repairOriginalAsset(root,true);root.updateMatrixWorld(true);
  const rear=new THREE.Raycaster(new THREE.Vector3(0,5,-15),new THREE.Vector3(0,0,1)).intersectObjects(root.children,true);assert.equal(rear[0].object.name,'3d-rear-facade');
  const thin=new THREE.Group();thin.add(new THREE.Mesh(new THREE.PlaneGeometry(4,4),wall));repairOriginalAsset(thin,true);thin.updateMatrixWorld(true);const backing=thin.children.filter(c=>c.name==='3d-solid-backing');assert.equal(new THREE.Raycaster(new THREE.Vector3(0,0,10),new THREE.Vector3(0,0,-1)).intersectObjects(backing,true).length,0);assert.ok(new THREE.Raycaster(new THREE.Vector3(0,0,-10),new THREE.Vector3(0,0,1)).intersectObjects(backing,true).length>0);
});
test('a mailbox touching a building at one corner still uses local bounds',()=>{
  const root=new THREE.Group(),wall=new THREE.MeshBasicMaterial();wall.name='wall';root.add(new THREE.Mesh(new THREE.BoxGeometry(8,8,8),wall));const box=new THREE.PlaneGeometry(4,4);box.translate(6,6,4);root.add(new THREE.Mesh(box,wall));repairOriginalAsset(root,true);const cap=root.children.find(c=>c.name==='3d-rear-facade') as THREE.Mesh;cap.geometry.computeBoundingBox();assert.equal(cap.geometry.boundingBox!.min.z,2.5);assert.equal(cap.geometry.boundingBox!.min.x,4);
});
function partialRearHouse(){
 const root=new THREE.Group(),material=new THREE.MeshBasicMaterial({color:'#c7bda0'});material.name='wall';
 const box=(w:number,h:number,d:number,x:number,y:number,z:number)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);root.add(mesh);};
 box(.1,3,4,-3,1.5,0);box(.1,3,4,3,1.5,0);box(6.2,.1,4.2,0,3.05,0);
 for(const z of [-2,2]){box(2,3,.1,-2,1.5,z);box(2,3,.1,2,1.5,z);box(2,1,.1,0,2.5,z);}return root;
}
test('a source entrance closes a partial rear wall across the mirrored doorway opening',()=>{
 const root=partialRearHouse();assert.ok(closeBuildingBack(root,[{x:0,z:2.2}])>0);root.updateMatrixWorld(true);const hits=new THREE.Raycaster(new THREE.Vector3(0,1,-10),new THREE.Vector3(0,0,1)).intersectObject(root,true);assert.equal(hits[0].object.name,'entrance-rear-wall');assert.ok(hits[0].point.z<0);
});
test('opposing source entrances keep a real passage and unrelated props receive no new wall',()=>{
 for(const doors of [[],[{x:20,z:20}],[{x:0,z:2.2},{x:0,z:-2.2}],[{x:0,z:2.2,passageOnly:true}],[{x:0,z:2.2},{x:0,z:-2.2,passageOnly:true}]]){const root=partialRearHouse();assert.equal(closeBuildingBack(root,doors),0);assert.equal(root.getObjectByName('entrance-rear-wall'),undefined);}
});
test('rear closure uses the original world doorway after prop rotation and translation',()=>{
 const parent=new THREE.Group(),root=partialRearHouse();parent.position.set(17,4,33);root.rotation.y=Math.PI/2;parent.add(root);parent.updateMatrixWorld(true);const door=root.localToWorld(new THREE.Vector3(0,0,2.2));assert.ok(closeBuildingBack(root,[{x:door.x,z:door.z}])>0);parent.updateMatrixWorld(true);const hits=new THREE.Raycaster(new THREE.Vector3(7,5,33),new THREE.Vector3(1,0,0)).intersectObject(root,true);assert.equal(hits[0].object.name,'entrance-rear-wall');
});
test('rear wall cladding reuses source wall UVs while staying opaque',()=>{
 const root=partialRearHouse(),texture=new THREE.Texture();root.traverse(o=>{if(o instanceof THREE.Mesh)(o.material as THREE.MeshBasicMaterial).map=texture;});closeBuildingBack(root,[{x:0,z:2.2}]);const wall=root.getObjectByName('entrance-rear-wall') as THREE.Mesh,material=wall.material as THREE.MeshBasicMaterial;assert.equal(material.map,texture);assert.equal(material.transparent,false);assert.equal(material.alphaTest,0);assert.ok(Array.from(wall.geometry.getAttribute('uv').array).every(Number.isFinite));
});
test('split wall bands close the upper rear while a neighbouring corner door cannot choose the front',()=>{
 const root=new THREE.Group(),wall=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});wall.name='house-wall';
 for(const x of [-3,3])for(const y of [.6,1.8,3]){const g=new THREE.PlaneGeometry(4,1.2);g.rotateY(Math.PI/2);g.translate(x,y,0);root.add(new THREE.Mesh(g,wall));}
 const roof=new THREE.PlaneGeometry(6,4);roof.rotateX(-Math.PI/2);roof.translate(0,3.6,0);root.add(new THREE.Mesh(roof,wall));
 assert.ok(closeBuildingBack(root,[{x:-3.4,z:2.4},{x:0,z:2.2}])>0);root.updateMatrixWorld(true);
 for(const y of [.4,1.6,2.8,3.4]){const hit=new THREE.Raycaster(new THREE.Vector3(0,y,-10),new THREE.Vector3(0,0,1)).intersectObject(root,true)[0];assert.ok(hit,`rear wall at y=${y}`);assert.equal(hit.object.name,'entrance-rear-wall');assert.ok(hit.point.z<0);}
});
test('native door direction overrides an ambiguous corner of the building bounds',()=>{
 const root=partialRearHouse();assert.ok(closeBuildingBack(root,[{x:2.9,z:2.1,axis:2,sign:1}])>0);root.updateMatrixWorld(true);const hit=new THREE.Raycaster(new THREE.Vector3(0,1,-10),new THREE.Vector3(0,0,1)).intersectObject(root,true)[0];assert.equal(hit.object.name,'entrance-rear-wall');assert.ok(hit.point.z<0);
});
test('rotated native tree quads retain measured UV scale and mixed-mesh shadows',()=>{
 const root=new THREE.Group(),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,-32,0,0,32,-40.765625,49.34375,32,0,0,-32,-40.765625,49.34375,32,-40.765625,49.34375,-32,0,0,0,1,0,0,0,0,1],3));g.setAttribute('uv',new THREE.Float32BufferAttribute([1,0,0,0,0,1,1,0,0,1,1,1,0,0,1,0,0,1],2));g.addGroup(0,6,0);g.addGroup(6,3,1);const tree=new THREE.MeshBasicMaterial({map:syntheticTreeTexture()});tree.name='tree';const shadow=new THREE.MeshBasicMaterial({opacity:.2});shadow.name='shadow';root.add(new THREE.Mesh(g,[tree,shadow]));assert.equal(repairOriginalAsset(root,false).billboardTrees,1);const panel=root.getObjectByName('solid-original-tree-canopies')as THREE.InstancedMesh,matrix=new THREE.Matrix4();panel.getMatrixAt(0,matrix);assert.ok(Math.abs(new THREE.Vector3().setFromMatrixScale(matrix).y-64)<.1);const leftover=root.getObjectByName('original-scenery-remainder')as THREE.Mesh;assert.equal(leftover.material,shadow);assert.equal(leftover.geometry.getAttribute('position').count,3);
});
test('repeated forest and lightmap cards create four native root instances on their ground marks',()=>{
 for(const suffix of['','_lm1']){const root=new THREE.Group(),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,6,128,0,6,128,49.34375,-34.765625,0,0,6,128,49.34375,-34.765625,0,49.34375,-34.765625],3));g.setAttribute('uv',new THREE.Float32BufferAttribute([0,1,2,1,2,0,0,1,2,0,0,0],2));const leaf=new THREE.MeshBasicMaterial({map:syntheticTreeTexture()});leaf.name='tree01_re'+suffix;leaf.userData.treeInfo={centers:[.25,.75],footU:.5,footV:.90625};root.add(new THREE.Mesh(g,leaf));const shadow=new THREE.MeshBasicMaterial();shadow.name='tree01_un'+suffix;for(const x of[16,48,80,112]){const ground=new THREE.PlaneGeometry(32,32);ground.rotateX(-Math.PI/2);ground.translate(x,0,0);root.add(new THREE.Mesh(ground,shadow));}assert.equal(repairOriginalAsset(root,false).billboardTrees,4);const trees=root.getObjectByName('solid-original-tree-canopies')as THREE.InstancedMesh;assert.deepEqual(trees.userData.sceneryRoots,[[16,0,0],[48,0,0],[80,0,0],[112,0,0]]);assert.equal(trees.count,4);const matrix=new THREE.Matrix4();trees.getMatrixAt(0,matrix);assert.equal(new THREE.Vector3().setFromMatrixScale(matrix).x,64);}
});

test('tilted flower beds become separately rooted crossed clumps with depth',()=>{
 for(const name of ['yo_sp1_yo_sp1','flower_sp2','ph_hana2_lm1']){
  const root=new THREE.Group(),geometry=new THREE.PlaneGeometry(32,16);geometry.translate(0,8,0);geometry.rotateX(-Math.PI/4);geometry.translate(0,3,10);
  const material=new THREE.MeshBasicMaterial({alphaTest:.5,side:THREE.DoubleSide});material.name=name;const original=new THREE.Mesh(geometry,material);root.add(original);
  const ground=new THREE.PlaneGeometry(100,100);ground.rotateX(-Math.PI/2);const grass=new THREE.MeshBasicMaterial();grass.name='grass';root.add(new THREE.Mesh(ground,grass));
  const before=new THREE.Box3().setFromObject(original),result=repairOriginalAsset(root,false);assert.equal(result.uprightPanels,1);assert.equal(result.flowerClumps,1);assert.equal(original.visible,false);
  const fixed=root.children.find(o=>o.name==='crossed-original-flowers') as THREE.Mesh;fixed.geometry.computeBoundingBox();const bounds=fixed.geometry.boundingBox!;assert.ok(bounds.max.z-bounds.min.z>20);assert.ok(Math.abs((bounds.max.z+bounds.min.z)/2-(before.min.z+before.max.z)/2)<.001);assert.ok(Math.abs(bounds.min.y)<.0001);assert.ok(Math.abs(bounds.max.y-16)<.001);assert.equal(fixed.geometry.getAttribute('position').count,18);
 }
});
test('source fence cards and horizontal atlas runs become solid upright posts and rails',()=>{
 for(const flat of [false,true]){const root=new THREE.Group(),g=new THREE.PlaneGeometry(32,16);g.translate(0,8,0);g.rotateX(flat?-Math.PI/2:-Math.PI/4);const m=new THREE.MeshBasicMaterial({alphaTest:.5});m.name='fence_a';root.add(new THREE.Mesh(g,m));const result=repairOriginalAsset(root,false);assert.equal(result.fencePosts,4);const fence=root.children.find(o=>o.name==='solid-original-fences') as THREE.InstancedMesh;assert.ok(fence);const posts=[];for(let i=0;i<fence.count;i++){const matrix=new THREE.Matrix4();fence.getMatrixAt(i,matrix);const scale=new THREE.Vector3().setFromMatrixScale(matrix);if(Math.abs(scale.y-13)<.01)posts.push(new THREE.Vector3().setFromMatrixPosition(matrix));}assert.equal(posts.length,4);assert.ok(posts.every(p=>Math.abs(p.z-posts[0].z)<.001));assert.equal(new Set(posts.map(p=>p.x)).size,4);assert.ok(fence.geometry.getAttribute('normal').count>0);}
});
test('standing cut-out repairs preserve ground textures, shadows and actual sloping solid surfaces',()=>{
 const root=new THREE.Group();for(const [name,alpha,angle]of [['flower01',.5,-Math.PI/2],['roof',.5,-Math.PI/4],['fence_opaque',0,-Math.PI/4],['fence_shadow',.5,-Math.PI/4]] as const){const g=new THREE.PlaneGeometry(32,16);g.rotateX(angle);const m=new THREE.MeshBasicMaterial({alphaTest:alpha,opacity:name.includes('shadow')?.3:1});m.name=name;root.add(new THREE.Mesh(g,m));}
 const result=repairOriginalAsset(root,false);assert.equal(result.uprightPanels,0);assert.ok(root.children.every(o=>o.visible));
});

test('adjacent leaning rock cards become separate closed boulders with depth in every direction',()=>{
 const root=new THREE.Group(),material=new THREE.MeshBasicMaterial({color:'#938a83',alphaTest:.5,vertexColors:true});material.name='sea_rock';
 for(const x of [0,32]){const g=new THREE.PlaneGeometry(32,32);g.translate(16,16,0);g.rotateX(-Math.PI/4);g.translate(x,0,0);g.setAttribute('color',new THREE.Float32BufferAttribute(Array.from({length:g.getAttribute('position').count*3},()=>1),3));root.add(new THREE.Mesh(g,material));}
 const result=repairOriginalAsset(root,false);assert.equal(result.solidRocks,2);const rocks=root.getObjectByName('solid-original-rocks') as THREE.Mesh;assert.ok(rocks);root.updateMatrixWorld(true);const edges=new Map<string,number>(),p=rocks.geometry.getAttribute('position');
 for(let i=0;i<p.count;i+=3)for(let k=0;k<3;k++){const pair=[i+k,i+(k+1)%3].map(j=>[p.getX(j),p.getY(j),p.getZ(j)].map(v=>v.toFixed(4)).join(',')).sort().join('|');edges.set(pair,(edges.get(pair)||0)+1);}assert.ok([...edges.values()].every(count=>count===2),'Every boulder edge belongs to two faces');
 for(const [x,z,dx,dz]of [[16,60,0,-1],[16,-60,0,1],[-60,-11.3,1,0],[100,-11.3,-1,0]])assert.ok(new THREE.Raycaster(new THREE.Vector3(x,10,z),new THREE.Vector3(dx,0,dz)).intersectObject(rocks).length>0);
 assert.equal((rocks.material as THREE.Material).transparent,false);assert.ok(rocks.geometry.getAttribute('color'));assert.equal(root.children.filter(o=>o.name==='solid-original-terrain').length,0,'Cut-out rocks must not also receive rectangular cliff skirts');
});
test('an unmatched rock triangle does not prevent later cards becoming closed rocks, and pole UVs stay local',()=>{
 const root=new THREE.Group(),quad=new THREE.PlaneGeometry(32,32).toNonIndexed();quad.translate(0,16,0);quad.rotateX(-Math.PI/4);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([-100,0,0,-90,0,0,-95,10,0,...quad.getAttribute('position').array],3));g.setAttribute('uv',new THREE.Float32BufferAttribute([0,1,1,1,.5,0,...quad.getAttribute('uv').array],2));const material=new THREE.MeshBasicMaterial({alphaTest:.5});material.name='rock01';root.add(new THREE.Mesh(g,material));const result=repairOriginalAsset(root,false);assert.equal(result.solidRocks,1);const rocks=root.getObjectByName('solid-original-rocks') as THREE.Mesh,uv=rocks.geometry.getAttribute('uv');for(let i=0;i<uv.count;i+=3){const us=[0,1,2].map(j=>uv.getX(i+j));assert.ok(Math.max(...us)-Math.min(...us)<.5,'Cap poles must use the unwrapped neighbouring ring UVs');}assert.equal(root.getObjectByName('textured-terrain-back'),undefined);
});
test('off-centre native plant art retains its selected atlas half around the measured ground pivot',async()=>{
 const root=new THREE.Group(),g=new THREE.PlaneGeometry(32,64);g.translate(0,32,0);g.rotateX(-Math.PI/4);const uv=g.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setX(i,uv.getX(i)*.5);const texture=await treeTexture('foliage/13-bush_a.png'),material=new THREE.MeshBasicMaterial({map:texture});material.name='bush_a';material.userData.treeInfo={centers:[.25],footU:.25,footV:.9375};root.add(new THREE.Mesh(g,material));repairOriginalAsset(root,false);const trees=root.getObjectByName('solid-original-tree-canopies')as THREE.InstancedMesh;assert.equal(trees.count,1);assert.equal(trees.userData.nativeTreeShape.footU,.25);assert.deepEqual(trees.userData.nativeTreeBounds,[1,1,15,30]);
});

test('open hill and cliff backs receive opaque skirts down to their original base',()=>{const root=new THREE.Group(),m=new THREE.MeshBasicMaterial({alphaTest:.5,side:THREE.DoubleSide});m.name='allpeak';const wall=new THREE.PlaneGeometry(12,8);wall.translate(0,4,5);root.add(new THREE.Mesh(wall,m));const top=new THREE.PlaneGeometry(12,10);top.rotateX(-Math.PI/2);top.translate(0,8,0);root.add(new THREE.Mesh(top,m));const result=repairOriginalAsset(root,false);assert.ok(result.terrainSkirts>0);root.updateMatrixWorld(true);const ray=new THREE.Raycaster(new THREE.Vector3(0,4,-15),new THREE.Vector3(0,0,1));const hit=ray.intersectObjects(root.children,true).find(h=>h.object.name==='solid-original-terrain');assert.ok(hit);assert.ok(hit.point.z<0);assert.equal((hit.object as THREE.Mesh).material instanceof THREE.MeshBasicMaterial,true);assert.equal(((hit.object as THREE.Mesh).material as THREE.MeshBasicMaterial).transparent,false);assert.equal(root.children[0].visible,true);});
test('raised forest platforms close down to surrounding terrain using cliff art instead of vertical stump patterns',()=>{
 const root=new THREE.Group(),grass=new THREE.MeshBasicMaterial(),forest=new THREE.MeshBasicMaterial(),cliff=new THREE.MeshBasicMaterial({map:new THREE.Texture(),vertexColors:true});grass.name='grass01';forest.name='hu_tree01_un';cliff.name='cliff01';
 for(const [material,y,size]of [[grass,16,160],[forest,80,64]] as const){const g=new THREE.PlaneGeometry(size,size);g.rotateX(-Math.PI/2);g.translate(0,y,0);root.add(new THREE.Mesh(g,material));}const g=new THREE.PlaneGeometry(10,10);g.translate(100,21,0);root.add(new THREE.Mesh(g,cliff));repairOriginalAsset(root,false);root.updateMatrixWorld(true);
 const hits=new THREE.Raycaster(new THREE.Vector3(0,40,100),new THREE.Vector3(0,0,-1)).intersectObject(root,true).filter(h=>h.object.name==='textured-terrain-back');assert.ok(hits.length);assert.equal((hits[0].object as THREE.Mesh).material instanceof THREE.MeshBasicMaterial,true);assert.equal(((hits[0].object as THREE.Mesh).material as THREE.MeshBasicMaterial).name,'cliff01');assert.ok((hits[0].object as THREE.Mesh).geometry.getAttribute('color'));
});
