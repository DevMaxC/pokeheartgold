import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {extrudeTriangle,repairOriginalAsset} from './render-repair.ts';

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
test('tilted original tree planes become upright instanced camera-facing artwork',()=>{
  const root=new THREE.Group(),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([-32,0,0,32,0,0,32,49.34375,-40.765625,-32,0,0,32,49.34375,-40.765625,-32,49.34375,-40.765625],3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,1,1,1,1,0,0,1,1,0,0,0],2));const material=new THREE.MeshBasicMaterial();material.name='tree01';const original=new THREE.Mesh(geometry,material);root.add(original);
  const result=repairOriginalAsset(root,false);assert.equal(result.billboardTrees,1);assert.equal(original.visible,false);const tree=root.children.find(c=>c.name==='camera-facing-original-trees') as THREE.InstancedMesh;assert.equal(tree.count,1);const matrix=new THREE.Matrix4();tree.getMatrixAt(0,matrix);const scale=new THREE.Vector3(),position=new THREE.Vector3(),rotation=new THREE.Quaternion();matrix.decompose(position,rotation,scale);assert.ok(Math.abs(scale.y-64)<.1);assert.equal(position.y,0);assert.equal(scale.x,64);
});
