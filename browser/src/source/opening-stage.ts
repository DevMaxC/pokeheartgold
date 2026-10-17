import * as THREE from 'three';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';

/** Camera poses/translation from src/title_screen.c:350,690–767. The source
 * model and skeletal animation are imported. Material/palette animation and
 * the separate sparkle model remain an explicit parity gap. */
export class OpeningTitleCamera{
 readonly camera=new THREE.PerspectiveCamera(2*0xB60*360/65536,4/3,.5,900);
 private target=new THREE.Vector3(-2,124,-38);private index=0;private frame=0;private partial=0;
 private readonly script=[[180,177,301,10],[335,-293,296,5],[180,177,301,5],[625,152,256,10]];
 constructor(){this.camera.position.set(625,152,256);this.camera.lookAt(this.target);}
 update(dt:number,aspect:number){
  this.camera.aspect=aspect;this.camera.updateProjectionMatrix();this.partial+=dt*30;
  while(this.partial>=1){this.partial--;const[x,y,z,duration]=this.script[this.index];this.frame++;if(this.frame<=duration*30)continue;
   const before=new THREE.Vector3(x,y,z).sub(this.camera.position);for(const axis of['x','y','z']as const)if(Math.abs(before[axis])>1)this.camera.position[axis]+=Math.sign(before[axis])*5;
   if(Math.abs(before.x)<=1&&Math.abs(before.y)<=1&&Math.abs(before.z)<=1){this.frame=0;this.index=(this.index+1)%this.script.length;}
  }
  this.camera.lookAt(this.target);
 }
}
function disposeResources(model:THREE.Object3D|null,background:THREE.Texture|null){
 const maps=new Set<THREE.Texture>(),materials=new Set<THREE.Material>(),geometries=new Set<THREE.BufferGeometry>(),skeletons=new Set<THREE.Skeleton>();
 model?.traverse(o=>{if(!(o instanceof THREE.Mesh))return;if(o instanceof THREE.SkinnedMesh)skeletons.add(o.skeleton);geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const value of Object.values(m))if(value instanceof THREE.Texture)maps.add(value);}});
 if(background)maps.add(background);for(const skeleton of skeletons)skeleton.dispose();for(const map of maps)map.dispose();for(const material of materials)material.dispose();for(const geometry of geometries)geometry.dispose();
}
/** Keep a failed optional title import from leaking the other successful
 * request. Both requests settle before the native-art fallback takes over. */
export async function loadOpeningTitleAssets(loadModel:()=>Promise<GLTF>=()=>new GLTFLoader().loadAsync('/source/opening/ho-oh.glb'),loadBackground:()=>Promise<THREE.Texture>=()=>new THREE.TextureLoader().loadAsync('/source/opening/title-background.png')){
 const[model,background]=await Promise.allSettled([loadModel(),loadBackground()]);
 if(model.status==='rejected'||background.status==='rejected'){
  disposeResources(model.status==='fulfilled'?model.value.scene:null,background.status==='fulfilled'?background.value:null);
  throw model.status==='rejected'?model.reason:background.status==='rejected'?background.reason:Error('Opening title import failed');
 }
 return{gltf:model.value,background:background.value};
}
export class OpeningTitleStage{
 readonly scene=new THREE.Scene();readonly view=new OpeningTitleCamera();
 private mixer:THREE.AnimationMixer;private disposed=false;
 private constructor(private renderer:THREE.WebGLRenderer,private model:THREE.Group,private background:THREE.Texture,animations:THREE.AnimationClip[]){
  this.scene.background=background;model.position.set(30,95,0);this.scene.add(model);
  this.scene.add(new THREE.HemisphereLight(0xffffff,0x99978a,2));
  this.mixer=new THREE.AnimationMixer(model);for(const clip of animations)this.mixer.clipAction(clip).play();
 }
 static async create(renderer:THREE.WebGLRenderer){
  const{gltf,background}=await loadOpeningTitleAssets();
  background.colorSpace=THREE.SRGBColorSpace;background.magFilter=THREE.NearestFilter;
  gltf.scene.traverse(o=>{if(!(o instanceof THREE.Mesh))return;for(const m of Array.isArray(o.material)?o.material:[o.material]){const map=(m as THREE.MeshBasicMaterial).map;if(map){map.magFilter=THREE.NearestFilter;map.minFilter=THREE.NearestFilter;map.generateMipmaps=false;}}});
  return new OpeningTitleStage(renderer,gltf.scene,background,gltf.animations);
 }
 draw(dt:number){if(this.disposed)return;this.view.update(dt,this.renderer.domElement.clientWidth/Math.max(1,this.renderer.domElement.clientHeight));this.mixer.update(dt);this.renderer.render(this.scene,this.view.camera);}
 dispose(){if(this.disposed)return;this.disposed=true;this.mixer.stopAllAction();this.mixer.uncacheRoot(this.model);disposeResources(this.model,this.background);this.scene.clear();}
}
