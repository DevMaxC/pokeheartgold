import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { sourceJSON,type SourceMap,type SourceIndex,type Matrix,type Land,type Cell,type SpriteInfo,type NPC } from './types.ts';
import {tilePermission,permissionWalkable,terrainHeight} from './terrain.ts';
import {repairOriginalAsset,originalMaterial} from './render-repair.ts';
import type {FieldObject} from './objects.ts';
import type {WorldBattleView} from './battle-stage.ts';

type LoadedCell = {cell:Cell;land:Land;group:THREE.Group;map:SourceMap};
export class OriginalWorld {
  readonly scene=new THREE.Scene();
  readonly camera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,.05,140);
  readonly renderer:THREE.WebGLRenderer;
  readonly maps=new Map<number,SourceMap>();
  readonly assets=new Map<string,Promise<THREE.Group>>();
  readonly cells=new Map<string,LoadedCell>();
  readonly npcSprites=new Map<string,{group:THREE.Group;sprite:THREE.Mesh;texture:THREE.Texture;info:SpriteInfo;npc:FieldObject;key:string}>();
  private loader=new GLTFLoader();
  private foliage:Promise<Record<string,Record<string,{asset:string;centers:number[];footV:number}>>>|null=null;
  private treeTextures=new Map<string,Promise<THREE.Texture>>();
  private landCache=new Map<number,Promise<Land>>();
  private activeMatrix=-1;
  private matrix:Matrix|null=null;
  private generation=0;
  private pending:Promise<void>|null=null;
  private sky=new THREE.Color('#d4e1df');
  yaw=0;pitch=.4;distance=13;
  target=new THREE.Vector3();
  loading=false;
  battleStage:WorldBattleView|null=null;
  constructor(readonly canvas:HTMLCanvasElement,readonly index:SourceIndex,readonly sprites:Record<string,SpriteInfo>){
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));this.renderer.setSize(innerWidth,innerHeight);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.NoToneMapping;
    this.scene.background=this.sky;this.scene.fog=new THREE.Fog(this.sky,50,115);this.scene.add(new THREE.HemisphereLight(0xffffff,0x8a9aa2,2));
    addEventListener('resize',()=>{this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight);});
  }
  async map(id:number):Promise<SourceMap>{if(!this.maps.has(id)){const map=await sourceJSON<SourceMap>(`maps/${id}.json`);for(const kind of ['objects','bgs','warps','coords'] as const)map.events[kind]??=[];map.initTriggers??=[];map.initScripts??={};this.maps.set(id,map);}return this.maps.get(id)!;}
  async asset(path:string):Promise<THREE.Group>{
    if(!this.assets.has(path))this.assets.set(path,this.loader.loadAsync('/source/'+path).then(async gltf=>{
      gltf.scene.traverse(object=>{if(!(object instanceof THREE.Mesh))return;
        const convert=(material:THREE.Material)=>originalMaterial(material as THREE.MeshStandardMaterial);
        object.material=Array.isArray(object.material)?object.material.map(convert):convert(object.material);
      });
      if(path.startsWith('land/')){
        this.foliage??=sourceJSON('foliage.json');const context=path.match(/-(\d+)\.glb$/)![1],entries=(await this.foliage)[context]||{},jobs:Promise<void>[]=[];
        gltf.scene.traverse(object=>{if(!(object instanceof THREE.Mesh))return;for(const material of Array.isArray(object.material)?object.material:[object.material]){const entry=entries[material.name];if(!entry)continue;
          jobs.push((async()=>{let texture=(material as THREE.MeshBasicMaterial).map;if(material.name.endsWith('_re')){if(!this.treeTextures.has(entry.asset))this.treeTextures.set(entry.asset,new THREE.TextureLoader().loadAsync('/source/'+entry.asset).then(t=>{t.flipY=false;t.colorSpace=THREE.SRGBColorSpace;t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestFilter;t.generateMipmaps=false;return t;}));texture=await this.treeTextures.get(entry.asset)!;}material.userData.treeInfo={...entry,texture};})());
        }});await Promise.all(jobs);
      }
      repairOriginalAsset(gltf.scene,path.startsWith('props/'));return gltf.scene;
    }));return this.assets.get(path)!;
  }
  async enter(id:number,x:number,z:number){
    const map=await this.map(id);
    if(this.activeMatrix!==map.matrix){this.generation++;for(const c of this.cells.values())this.scene.remove(c.group);this.cells.clear();this.activeMatrix=map.matrix;this.matrix=await sourceJSON<Matrix>(`matrices/${map.matrix}.json`);}
    await this.stream(id,x,z);this.target.set(x,this.height(x,z)+.9,z);this.camera.position.copy(this.target).add(new THREE.Vector3(0,7,12));
    const indoor=map.mapType==='MAP_TYPE_INTERIOR';this.scene.background=indoor?new THREE.Color('#242e39'):this.sky;this.pitch=indoor?.6:.36;this.distance=indoor?12:15;
    return map;
  }
  async stream(id:number,x:number,z:number):Promise<void>{
    if(!this.matrix)return;
    if(this.pending){await this.pending;return this.stream(id,x,z);}
    const matrix=this.matrix,generation=this.generation;const jobs:Promise<void>[]=[];const wanted=new Set<string>();
    for(let zz=Math.floor(z/32)-1;zz<=Math.floor(z/32)+1;zz++)for(let xx=Math.floor(x/32)-1;xx<=Math.floor(x/32)+1;xx++){
      if(xx<0||zz<0||xx>=matrix.width||zz>=matrix.height)continue;
      const i=zz*matrix.width+xx,landID=matrix.models[i];if(landID===65535)continue;
      const owner=matrix.headers?.[i]||id;if(!this.index.maps[owner])continue;
      const key=xx+','+zz;wanted.add(key);if(this.cells.has(key))continue;
      jobs.push((async()=>{
        const map=await this.map(owner);const cell=map.cells.find(c=>c.x===xx&&c.z===zz);if(!cell)return;
        if(!this.landCache.has(landID))this.landCache.set(landID,sourceJSON<Land>(`lands/${landID}.json`));
        const [template,land]=await Promise.all([this.asset(cell.asset),this.landCache.get(landID)!]);
        const group=new THREE.Group();group.position.set(xx*32+16,cell.altitude*.5,zz*32+16);
        const model=clone(template);model.scale.setScalar(1/16);group.add(model);
        await Promise.all(cell.props.map(async prop=>{const p=clone(await this.asset(prop.asset));p.scale.set(prop.scale[0]/16,prop.scale[1]/16,prop.scale[2]/16);p.position.fromArray(prop.position);p.rotation.set(prop.rotation[0]*Math.PI/180,prop.rotation[1]*Math.PI/180,prop.rotation[2]*Math.PI/180);group.add(p);}));
        if(generation!==this.generation)return;this.scene.add(group);this.cells.set(key,{cell,land,group,map});
      })());
    }
    this.loading=jobs.length>0;this.pending=Promise.all(jobs).then(()=>{for(const [key,c]of this.cells)if(!wanted.has(key)){this.scene.remove(c.group);this.cells.delete(key);}}).finally(()=>{this.pending=null;this.loading=false;});
    await this.pending;
  }
  cell(x:number,z:number){return this.cells.get(Math.floor(x/32)+','+Math.floor(z/32));}
  height(x:number,z:number,currentY=0){const c=this.cell(x,z);return c?terrainHeight(c.land,c.cell,x,z,currentY):currentY;}
  permission(x:number,z:number){const c=this.cell(x,z);return c?tilePermission(c.land,x,z):0x8000;}
  walkable(x:number,z:number){return permissionWalkable(this.permission(x,z));}
  owner(x:number,z:number){return this.cell(x,z)?.map.id;}
  paper(key:string,height=2){const info=this.sprites[key];if(!info)throw Error(`Original sprite missing: ${key}`);
    const texture=new THREE.TextureLoader().load('/source/'+info.asset);texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.colorSpace=THREE.SRGBColorSpace;texture.repeat.set(1/info.columns,1/info.rows);texture.offset.set(0,1-1/info.rows);
    const sprite=new THREE.Mesh(new THREE.PlaneGeometry(height*info.width/info.height,height),new THREE.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.2,side:THREE.DoubleSide}));sprite.geometry.translate(0,height/2,0);
    const group=new THREE.Group();group.add(sprite);const shadow=new THREE.Mesh(new THREE.CircleGeometry(.3,16),new THREE.MeshBasicMaterial({color:'#203029',transparent:true,opacity:.18,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.02;group.add(shadow);this.scene.add(group);return{group,sprite,texture,info};
  }
  animate(paper:{sprite:THREE.Mesh;texture:THREE.Texture;info:SpriteInfo},facing:number,step:number){
    // Relative facing preserves the original four directions as the camera turns.
    const directions=[Math.PI,0,-Math.PI/2,Math.PI/2],relative=directions[facing]??0;
    const angle=Math.atan2(Math.sin(relative-this.yaw),Math.cos(relative-this.yaw));
    const row=Math.abs(angle)<.7?1:Math.abs(angle)>2.4?0:angle>0?3:2;
    const frame=Math.min(paper.info.frames-1,row*4+(step<0?0:Math.floor(step)%4));
    paper.texture.offset.set(frame%4/paper.info.columns,1-(Math.floor(frame/4)+1)/paper.info.rows);paper.sprite.rotation.y=this.yaw;
  }
  clearNPCs(){for(const actor of this.npcSprites.values()){this.scene.remove(actor.group);actor.texture.dispose();actor.group.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();}});}this.npcSprites.clear();}
  updateNPCs(objects:FieldObject[]){
    for(const npc of objects){const key=npc.resolvedSprite;let actor=this.npcSprites.get(npc.id);
      if(actor&&actor.key!==key){this.scene.remove(actor.group);actor.texture.dispose();this.npcSprites.delete(npc.id);actor=undefined;}
      if(!actor&&this.sprites[key]){actor={...this.paper(key,key.includes('FOLLOWER')?1.4:2),npc,key};this.npcSprites.set(npc.id,actor);}
      if(!actor)continue;actor.npc=npc;actor.group.visible=npc.visible;actor.group.position.set(npc.x+.5,this.height(npc.x+.5,npc.z+.5,actor.group.position.y||npc.y/16),npc.z+.5);this.animate(actor,npc.facingDirection,npc.step);
    }
  }
  draw(x:number,z:number,dt:number){
    if(this.battleStage?.active){this.battleStage.update(dt);for(const npc of this.npcSprites.values())this.animate(npc,npc.npc.facingDirection,npc.npc.step);this.renderer.render(this.scene,this.camera);return;}
    const height=this.height(x,z,this.target.y-.9);const target=new THREE.Vector3(x,height+.9,z);this.target.lerp(target,1-Math.exp(-dt*9));
    const orbit=new THREE.Vector3(Math.sin(this.yaw)*Math.cos(this.pitch),Math.sin(this.pitch),Math.cos(this.yaw)*Math.cos(this.pitch));
    const ray=new THREE.Raycaster(this.target,orbit,.5,this.distance);const collisions=ray.intersectObjects([...this.cells.values()].map(c=>c.group),true);const first=collisions.find(c=>c.distance>1.2&&c.object.visible&&c.object.name!=='camera-facing-original-trees');const d=first?Math.max(2.2,first.distance-.6):this.distance;
    const desired=this.target.clone().addScaledVector(orbit,d);this.camera.position.lerp(desired,1-Math.exp(-dt*12));this.camera.lookAt(this.target);
    for(const npc of this.npcSprites.values())this.animate(npc,npc.npc.facingDirection,npc.npc.step);
    this.renderer.render(this.scene,this.camera);
  }
}
