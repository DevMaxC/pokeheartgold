import * as THREE from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {OriginalWorld} from './world.ts';
import {sourceJSON,type SourceIndex,type SpriteInfo} from './types.ts';

// Development-only visual fixture: the same import/render code used by the game.
async function review(){
  const [index,sprites]=await Promise.all([sourceJSON<SourceIndex>('index.json'),sourceJSON<Record<string,SpriteInfo>>('sprites.json')]);
  const world=new OriginalWorld(document.getElementById('review') as HTMLCanvasElement,index,sprites);
  const assets=['props/1-20-0.glb','props/1-21-0.glb','props/1-22-0.glb','props/1-29-0.glb'];
  const report:Record<string,unknown>={};
  for(let i=0;i<assets.length;i++){const template=await world.asset(assets[i]);const model=clone(template);model.scale.setScalar(1/16);model.position.set((i-1.5)*8,0,1);world.scene.add(model);report[assets[i]]=template.userData.renderRepairs;}
  const forest=await world.asset('land/0-2.glb');const first=forest.getObjectByName('camera-facing-original-trees') as THREE.InstancedMesh;
  if(first){const tree=first.clone();tree.count=Math.min(4,first.count);const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion();for(let i=0;i<tree.count;i++){first.getMatrixAt(i,matrix);matrix.decompose(position,rotation,scale);position.set((-12+i*8)*16,0,-6*16);matrix.compose(position,rotation,scale);tree.setMatrixAt(i,matrix);}tree.scale.setScalar(1/16);world.scene.add(tree);report.trees=tree.count;}
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.MeshBasicMaterial({color:'#bfd2ad'}));ground.rotation.x=-Math.PI/2;ground.position.y=-.04;world.scene.add(ground);
  const views:Record<string,THREE.Vector3>={front:new THREE.Vector3(0,10,28),rear:new THREE.Vector3(0,10,-28),left:new THREE.Vector3(-29,11,3),right:new THREE.Vector3(29,11,3)};
  let view='front';function select(name:string){view=name;world.camera.position.copy(views[name]);world.camera.lookAt(0,2,0);frame();}
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button=>button.onclick=()=>select(button.dataset.view!));select(view);
  document.getElementById('review-result')!.textContent='Original home · Elm’s lab with mailbox · neighborhood house · sign · four original trees. Rotate to inspect every side.';
  function frame(){world.renderer.render(world.scene,world.camera);(window as unknown as {__RENDER_REVIEW__:unknown}).__RENDER_REVIEW__={ready:true,view,report,drawCalls:world.renderer.info.render.calls};}frame();
}review().catch(error=>{console.error(error);document.getElementById('review-result')!.textContent=String(error);});
