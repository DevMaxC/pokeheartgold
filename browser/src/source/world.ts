import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { sourceJSON,type SourceMap,type SourceIndex,type Matrix,type Land,type Cell,type SpriteInfo,type NPC } from './types.ts';
import {tilePermission,permissionWalkable,terrainHeight} from './terrain.ts';
import {repairOriginalAsset,originalMaterial,type BuildingEntrance} from './render-repair.ts';
import {closeBuildingExterior,ownsBuildingExteriorResources} from './building-exterior.ts';
import type {FieldObject} from './objects.ts';
import type {WorldBattleView} from './battle-stage.ts';
import {sourceTallGrass,updateGrass} from './grass.ts';
import {WorldSky} from './sky.ts';
import {fieldCameraEntry,fieldCameraObstacles} from './camera.ts';
import {planTerrainSceneryAsync,closeTerrainScenery,terrainSceneryEntrances} from './terrain-scenery.ts';
import {furnitureObstacles,furnitureBlocksStep,type FurnitureObstacle} from './furniture-collision.ts';
import {closeBuildingFooting} from './building-footing.ts';
import {shorelineUnderlay} from './shoreline.ts';
import {Terraces,type TerraceData} from './ledges.ts';
import {terraceModel,terraceWalls,terraceCliffMaterial} from './terrace-model.ts';
import {terrainPause} from './terrain-work.ts';
import {VioletGym,VIOLET_GYM,type VioletLiftState} from './gym-violet.ts';
import {ScriptCameraTarget,type ScriptCameraTween} from './script-camera.ts';

type LoadedCell = {cell:Cell;land:Land;group:THREE.Group;map:SourceMap;furniture?:FurnitureObstacle[]};
export class OriginalWorld {
  readonly scene=new THREE.Scene();
  readonly camera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,.05,140);
  readonly renderer:THREE.WebGLRenderer;
  readonly maps=new Map<number,SourceMap>();
  readonly assets=new Map<string,Promise<THREE.Group>>();
  readonly cells=new Map<string,LoadedCell>();
  readonly npcSprites=new Map<string,{group:THREE.Group;sprite:THREE.Mesh;texture:THREE.Texture;info:SpriteInfo;npc:FieldObject;key:string}>();
  private loader=new GLTFLoader();
  private foliage:Promise<Record<string,Record<string,{asset:string;centers:number[];footU?:number;footV:number}>>>|null=null;
  private treeTextures=new Map<string,Promise<THREE.Texture>>();
  private landCache=new Map<number,Promise<Land>>();
  private activeMatrix=-1;
  private activeHeader=-1;
  private terraces:Terraces|null=null;
  private terraceData:Promise<Terraces>|null=null;
  private matrix:Matrix|null=null;
  private generation=0;
  private pending:Promise<void>|null=null;private grassTime=0;
  readonly sky:WorldSky;
  private violetGymInstance:VioletGym|undefined;
  get violetGym(){return this.violetGymInstance??=new VioletGym(this.scene,path=>this.asset(path));}
  private cameraReady=false;
  private cameraTransition=false;
  private cameraResizePending=false;
  private terraceFallback=new THREE.MeshBasicMaterial({color:'#a77d5a'});
  private backgroundCliff:Promise<THREE.MeshBasicMaterial>|null=null;
  private entrances:Promise<Record<number,BuildingEntrance[]>>|null=null;
  private streamCenter='';private streamRequest=false;private nextStreamAttempt=0;
  private latestStream:{matrix:number;id:number;x:number;z:number}|null=null;
  private scriptCameraTarget=new ScriptCameraTarget((x,z,y,fromX,fromZ)=>this.height(x,z,y,fromX,fromZ));
  yaw=0;pitch=.4;distance=13;
  target=new THREE.Vector3();
  loading=false;
  battleStage:WorldBattleView|null=null;
  constructor(readonly canvas:HTMLCanvasElement,readonly index:SourceIndex,readonly sprites:Record<string,SpriteInfo>){
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));this.renderer.setSize(innerWidth,innerHeight);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.NoToneMapping;
    this.sky=new WorldSky(this.scene,this.camera);this.scene.add(new THREE.HemisphereLight(0xffffff,0x8a9aa2,2));
    addEventListener('resize',()=>{if(this.cameraTransition){this.cameraResizePending=true;return;}this.resizeRenderer();});
  }
  async map(id:number):Promise<SourceMap>{if(!this.maps.has(id)){const map=await sourceJSON<SourceMap>(`maps/${id}.json`);for(const kind of ['objects','bgs','warps','coords'] as const)map.events[kind]??=[];map.initTriggers??=[];map.initScripts??={};this.maps.set(id,map);}return this.maps.get(id)!;}
  private land(id:number){if(!this.landCache.has(id))this.landCache.set(id,sourceJSON<Land>(`lands/${id}.json`).catch(error=>{this.landCache.delete(id);throw error;}));return this.landCache.get(id)!;}
  async asset(path:string):Promise<THREE.Group>{
    if(!this.assets.has(path))this.assets.set(path,this.loader.loadAsync('/source/'+path).then(async gltf=>{
      gltf.scene.traverse(object=>{if(!(object instanceof THREE.Mesh))return;
        const convert=(material:THREE.Material)=>originalMaterial(material as THREE.MeshStandardMaterial);
        object.material=Array.isArray(object.material)?object.material.map(convert):convert(object.material);
      });
      if(path.startsWith('land/')){
        this.foliage??=sourceJSON<Record<string,Record<string,{asset:string;centers:number[];footU?:number;footV:number}>>>('foliage.json').catch(error=>{this.foliage=null;throw error;});const context=path.match(/-(\d+)\.glb$/)![1],entries=(await this.foliage)[context]||{},jobs:Promise<void>[]=[];
        gltf.scene.traverse(object=>{if(!(object instanceof THREE.Mesh))return;for(const material of Array.isArray(object.material)?object.material:[object.material]){const entry=entries[material.name];if(!entry)continue;
          jobs.push((async()=>{let texture=(material as THREE.MeshBasicMaterial).map;if(entry.asset!==`foliage/${context}-${material.name}.png`){if(!this.treeTextures.has(entry.asset))this.treeTextures.set(entry.asset,new THREE.TextureLoader().loadAsync('/source/'+entry.asset).then(t=>{t.flipY=false;t.colorSpace=THREE.SRGBColorSpace;t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestFilter;t.generateMipmaps=false;return t;}).catch(error=>{this.treeTextures.delete(entry.asset);throw error;}));texture=await this.treeTextures.get(entry.asset)!;}material.userData.treeInfo={...entry,texture};})());
        }});await Promise.all(jobs);
      }
      // The original dynamic platform includes its complete long lift shaft.
      // Generic building/furniture inference must not reshape that machinery.
      if(path!==VIOLET_GYM.asset)repairOriginalAsset(gltf.scene,path.startsWith('props/'));return gltf.scene;
    }).catch(error=>{this.assets.delete(path);throw error;}));return this.assets.get(path)!;
  }
  private releaseCell(c:LoadedCell){const skeletons=new Set<THREE.Skeleton>(),geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();c.group.traverse(object=>{if(object instanceof THREE.SkinnedMesh&&!skeletons.has(object.skeleton)){skeletons.add(object.skeleton);object.skeleton.dispose();}if(!(object instanceof THREE.Mesh)||!ownsBuildingExteriorResources(object.name)&&!object.name.startsWith('terrain-scenery-')&&!['source-tall-grass','source-background-foundation','source-shoreline-underlay','source-terrace-surface','source-terrace-wall','source-building-footing'].includes(object.name))return;if(!geometries.has(object.geometry)){geometries.add(object.geometry);object.geometry.dispose();}if(object.name==='source-terrace-surface')return;for(const m of Array.isArray(object.material)?object.material:[object.material])if(!materials.has(m)){materials.add(m);m.dispose();}});this.scene.remove(c.group);}
  /** Keep the last rendered view while an asynchronous warp replaces the
   * scene. Incoming player coordinates must never steer the outgoing rig. */
  beginFieldTransition(){this.cameraTransition=true;}
  endFieldTransition(){this.cameraTransition=false;if(this.cameraResizePending){this.cameraResizePending=false;this.resizeRenderer();}}
  private resizeRenderer(){this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight);}
  /** Check the shared budget and build in the same continuation. Returning
   * permission to an awaiting caller lets concurrent cached jobs all pass
   * before any of them consumes the budget. */
  private async runSceneryWork(generation:number,build:()=>void){if(generation!==this.generation)return false;let pending:Promise<void>|null;while((pending=terrainPause())){await pending;if(generation!==this.generation)return false;}build();return true;}
  get fieldTransitionActive(){return this.cameraTransition;}
  get scriptCameraPosition(){return this.scriptCameraTarget?.position??null;}
  createScriptCameraTarget(map:number,x:number,z:number){
    if(map!==this.activeHeader)throw Error('Camera target belongs to an inactive source field');
    this.scriptCameraTarget??=new ScriptCameraTarget((x,z,y,fromX,fromZ)=>this.height(x,z,y,fromX,fromZ));
    this.scriptCameraTarget.create(map,x,z);const point=this.scriptCameraTarget.position!;this.updateStreaming(map,point.x,point.z);
  }
  clearScriptCameraTarget(){this.scriptCameraTarget?.clear();}
  moveScriptCameraTarget(map:SourceMap,label:string,tween:ScriptCameraTween){
    if(this.scriptCameraPosition?.map!==this.activeHeader)throw Error('Missing original camera movement object 241');
    return this.scriptCameraTarget.move(map,label,tween);
  }
  async enter(id:number,x:number,z:number,weather=0,initialHeight=0,violetLift:VioletLiftState=0){
    this.clearScriptCameraTarget();
    const ownsTransition=!this.cameraTransition;
    this.beginFieldTransition();
    this.violetGym.leave();
    try{
    const map=await this.map(id);
    const matrixChanged=this.activeMatrix!==map.matrix,roomChanged=!matrixChanged&&this.matrix?.headers===null&&this.activeHeader!==id;
    if(matrixChanged||roomChanged){this.generation++;this.streamCenter='';for(const c of this.cells.values())this.releaseCell(c);this.cells.clear();if(matrixChanged){const matrix=await sourceJSON<Matrix>(`matrices/${map.matrix}.json`);let terraces:Terraces|null=null;if(map.matrix===0){this.terraceData??=sourceJSON<TerraceData>('terraces/0.json').then(data=>new Terraces(data)).catch(error=>{this.terraceData=null;throw error;});terraces=await this.terraceData;}this.activeMatrix=map.matrix;this.matrix=matrix;this.terraces=terraces;}}
    this.activeHeader=id;
    this.latestStream={matrix:this.activeMatrix,id,x,z};
    await this.stream(id,x,z);await this.violetGym.enter(map,violetLift);fieldCameraEntry(this.camera,this.target,new THREE.Vector3(x,this.height(x,z,initialHeight)+.9,z),!this.cameraReady,this.yaw,this.pitch,this.distance,true);this.cameraReady=true;
    this.sky.enter(map,weather);
    return map;
    }finally{if(ownsTransition)this.endFieldTransition();}
  }
  async connect(id:number,x:number,z:number,weather=0){
    if(id!==this.activeHeader)this.clearScriptCameraTarget();
    const map=await this.map(id);if(map.matrix!==this.activeMatrix)throw Error('Connected field headers must share their source matrix');
    if(this.matrix?.headers===null&&this.activeHeader!==id)throw Error('Independent rooms do not share connected header ownership');this.activeHeader=id;
    if(!this.cell(x,z))await this.stream(id,x,z);else this.updateStreaming(id,x,z);this.sky.enter(map,weather);return map;
  }
  /** Coalesce field prefetch requests without putting distant asset downloads
   * in the player's movement lock. A loaded adjacent header is already safe. */
  updateStreaming(id:number,x:number,z:number){
    const focus=this.scriptCameraPosition;if(focus?.map===id){x=focus.x;z=focus.z;}
    this.latestStream={matrix:this.activeMatrix,id,x,z};const key=this.activeMatrix+':'+Math.floor(x/32)+','+Math.floor(z/32);
    if(this.streamRequest||this.loading||key===this.streamCenter||performance.now()<this.nextStreamAttempt)return;
    this.streamCenter=key;this.streamRequest=true;
    void this.stream(id,x,z).catch(error=>{this.streamCenter='';this.nextStreamAttempt=performance.now()+1000;console.error('Field scenery could not stream',error);}).finally(()=>{this.streamRequest=false;});
  }
  async stream(id:number,x:number,z:number):Promise<void>{
    if(!this.matrix)return;
    if(this.pending){try{await this.pending;}catch{/* Retry this centre independently of an earlier failed prefetch. */}return this.stream(id,x,z);}
    const matrix=this.matrix,generation=this.generation;const jobs:Promise<void>[]=[];const wanted=new Set<string>();
    // Source tile behaviours identify the façade direction. The complete matrix
    // manifest keeps real gate entrances independent of the streaming window.
    const matrixID=this.activeMatrix,doors=async()=>{this.entrances??=sourceJSON<Record<number,BuildingEntrance[]>>('entrances.json').catch(error=>{this.entrances=null;throw error;});return(await this.entrances)[matrixID]||[];};
    for(let zz=Math.floor(z/32)-2;zz<=Math.floor(z/32)+2;zz++)for(let xx=Math.floor(x/32)-2;xx<=Math.floor(x/32)+2;xx++){
      if(xx<0||zz<0||xx>=matrix.width||zz>=matrix.height)continue;
      const i=zz*matrix.width+xx,landID=matrix.models[i];if(landID===65535)continue;
      const owner=matrix.headers?.[i]??id;if(!this.index.maps[owner])continue;
      const key=xx+','+zz;wanted.add(key);if(this.cells.has(key))continue;
      jobs.push((async()=>{
        const map=await this.map(owner);const cell=map.cells.find(c=>c.x===xx&&c.z===zz);if(!cell)return;
        const [template,land]=await Promise.all([this.asset(cell.asset),this.land(landID)]);
        if(generation!==this.generation)return;
        const group=new THREE.Group();group.position.set(xx*32+16,cell.altitude*.5,zz*32+16);
        let retained=false;try{
        const model=clone(template);model.scale.setScalar(1/16);group.add(model);const grass=sourceTallGrass(land,cell);if(grass)group.add(grass);
        let beach:THREE.MeshBasicMaterial|undefined;template.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.name==='beach01')beach=m as THREE.MeshBasicMaterial;});if(beach){const underlay=shorelineUnderlay(land,cell,beach);if(underlay)group.add(underlay);}
        const terraces=this.terraces;if(terraces&&[-1,0,1].some(dx=>[-1,0,1].some(dz=>terraces.data.cells[(xx+dx)+','+(zz+dz)]))){
          if(!await terraceModel(group,terraces,()=>generation===this.generation))return;
          if(terraces.ledgeCells.has(xx+','+zz)){
            let cliff=terraceCliffMaterial(template);
            if(!cliff){const context=cell.asset.match(/-(\d+)\.glb$/)![1],path=terraces.data.cliffAssets[context]||terraces.data.cliffAssets['0'];if(path)try{cliff=terraceCliffMaterial(await this.asset(path));}catch(error){console.warn('Original cliff art unavailable; retaining a solid terrace wall',error);}}
            const walls=terraceWalls(terraces,cell,land,cliff??this.terraceFallback);if(walls)group.add(walls);
          }
        }
        // Native land was drawn for a fixed camera and may contain only a
        // raised top sheet. Close proven exposed terrain boundaries using the
        // actual placed height, adjacent collision floors and deformed ledges.
        const neighbors=new Map<string,{cell:Cell;land:Land}>();
        await Promise.all([[-1,0],[1,0],[0,-1],[0,1]].map(async([dx,dz])=>{const nx=xx+dx,nz=zz+dz;if(nx<0||nz<0||nx>=matrix.width||nz>=matrix.height)return;const ni=nz*matrix.width+nx,nl=matrix.models[ni];if(nl===65535)return;try{neighbors.set(nx+','+nz,{cell:{x:nx,z:nz,land:nl,altitude:matrix.altitudes[ni],props:[],asset:''},land:await this.land(nl)});}catch{/* Optional support is left unproven when a neighboring collision asset is unavailable. */}}));
        const sceneryContext={cell,matrix,land,mapType:map.mapType??this.index.maps[owner]?.mapType,neighbors,heightOffset:terraces?(wx:number,wz:number)=>terraces.height(wx,wz):undefined,entrances:terrainSceneryEntrances(map.events.warps,await doors())};
        const sceneryPlan=await planTerrainSceneryAsync(group,sceneryContext,()=>generation===this.generation);if(!sceneryPlan)return;
        if(sceneryPlan.patches.length){
          let cliff=terraceCliffMaterial(template);
          if(!cliff){this.backgroundCliff??=this.asset('land/210-0.glb').then(source=>{const material=terraceCliffMaterial(source);if(!material)throw Error('Original background cliff texture missing');return material;}).catch(error=>{this.backgroundCliff=null;throw error;});cliff=await this.backgroundCliff;}
          if(!await this.runSceneryWork(generation,()=>{closeTerrainScenery(group,sceneryContext,cliff,sceneryPlan);}))return;
        }
        const props=await Promise.allSettled(cell.props.map(async (prop,propIndex)=>{const foundation=terraces?.data.foundations?.[xx+','+zz+':'+propIndex];let offset=0;if(generation!==this.generation)return;const p=clone(await this.asset(prop.asset));group.add(p);if(generation!==this.generation)return;p.scale.set(prop.scale[0]/16,prop.scale[1]/16,prop.scale[2]/16);p.position.fromArray(prop.position);if(terraces){const anchor=foundation??[xx*32+16+p.position.x,zz*32+16+p.position.z];offset=terraces.height(anchor[0],anchor[1]);p.position.y+=offset;}p.rotation.set(prop.rotation[0]*Math.PI/180,prop.rotation[1]*Math.PI/180,prop.rotation[2]*Math.PI/180);const entrances=await doors();if(!await this.runSceneryWork(generation,()=>{closeBuildingExterior(p,prop.asset,entrances);if(terraces&&foundation)closeBuildingFooting(p,terraces,offset);}))return;}));for(const result of props)if(result.status==='rejected')throw result.reason;
        if(generation!==this.generation)return;this.scene.add(group);group.updateMatrixWorld(true);this.cells.set(key,{cell,land,group,map,furniture:furnitureObstacles(group)});retained=true;
        }finally{if(!retained)this.releaseCell({cell,land,group,map});}
      })());
    }
    this.loading=jobs.length>0;this.pending=Promise.allSettled(jobs).then(results=>{for(const result of results)if(result.status==='rejected')throw result.reason;if(generation!==this.generation)return;const latest=this.latestStream;for(const [key,c]of this.cells){const nearPlayer=latest?.matrix===this.activeMatrix&&Math.abs(c.cell.x-Math.floor(latest.x/32))<=2&&Math.abs(c.cell.z-Math.floor(latest.z/32))<=2;if(!wanted.has(key)&&!nearPlayer){this.releaseCell(c);this.cells.delete(key);}}}).finally(()=>{this.pending=null;this.loading=false;});
    await this.pending;
  }
  cell(x:number,z:number){return this.cells.get(Math.floor(x/32)+','+Math.floor(z/32));}
  /** Compare native plate levels using the reference position before adding relief. */
  height(x:number,z:number,currentY=0,fromX=x,fromZ=z){const c=this.cell(x,z),offset=this.terraces?.height(x,z)??0,reference=this.terraces?.height(fromX,fromZ)??0;return c?this.violetGym.height(x,z,currentY,terrainHeight(c.land,c.cell,x,z,currentY-reference)+offset):currentY;}
  permission(x:number,z:number){const c=this.cell(x,z);return c?tilePermission(c.land,x,z):0x8000;}
  terrainWalkable(x:number,z:number){const cell=this.cell(x,z);return !!cell&&cell.map.id!==0&&permissionWalkable(this.permission(x,z));}
  walkable(x:number,z:number,fromX=x,fromZ=z,currentY=0){
    if(!this.terrainWalkable(x,z))return false;
    const fromY=this.height(fromX,fromZ,currentY),toY=this.height(x,z,fromY,fromX,fromZ);
    if(this.violetGym.blocksStep(fromY,toY))return false;
    for(const loaded of this.cells.values())if(furnitureBlocksStep(loaded.furniture??[],fromX,fromZ,x,z,fromY,toY))return false;
    return true;
  }
  owner(x:number,z:number){const id=this.cell(x,z)?.map.id;return id===0?undefined:id;}
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
      if(!actor)continue;actor.npc=npc;actor.group.visible=npc.visible;actor.group.position.set(npc.x+.5,this.height(npc.x+.5,npc.z+.5,actor.group.position.y||npc.y/16,actor.group.position.x,actor.group.position.z),npc.z+.5);this.animate(actor,npc.facingDirection,npc.step);
    }
  }
  async healAnimation(count:number,x:number,z:number){
    const group=new THREE.Group(),balls:THREE.Mesh[]=[];group.position.set(x,this.height(x,z)+1.6,z);this.scene.add(group);
    try{for(let i=0;i<Math.min(6,count);i++){const ball=new THREE.Mesh(new THREE.SphereGeometry(.12,12,8),new THREE.MeshBasicMaterial({color:'#d87260'}));ball.position.set((i%3-1)*.3,Math.floor(i/3)*.24,0);group.add(ball);balls.push(ball);await new Promise(resolve=>setTimeout(resolve,130));}
      for(let i=0;i<6;i++){for(const b of balls)(b.material as THREE.MeshBasicMaterial).color.set(i%2?'#d87260':'#fff1ad');await new Promise(resolve=>setTimeout(resolve,130));}
    }finally{this.scene.remove(group);for(const b of balls){b.geometry.dispose();(b.material as THREE.Material).dispose();}}
  }
  draw(x:number,z:number,dt:number,actorY?:number){
    if(this.cameraTransition)return;
    this.grassTime+=dt;updateGrass(this.grassTime,x,actorY??this.height(x,z),z);
    if(this.battleStage?.active){this.battleStage.update(dt);for(const npc of this.npcSprites.values())this.animate(npc,npc.npc.facingDirection,npc.npc.step);this.sky.update(dt,x,this.height(x,z),z);this.renderer.render(this.scene,this.camera);return;}
    const focus=this.scriptCameraPosition,height=focus?.y??actorY??this.height(x,z,this.target.y-.9,this.target.x,this.target.z);const target=new THREE.Vector3(focus?.x??x,height+.9,focus?.z??z);this.target.lerp(target,1-Math.exp(-dt*9));
    const orbit=new THREE.Vector3(Math.sin(this.yaw)*Math.cos(this.pitch),Math.sin(this.pitch),Math.cos(this.yaw)*Math.cos(this.pitch));
    const ray=new THREE.Raycaster(this.target,orbit,.5,this.distance),obstacles=[...this.cells.values()].flatMap(c=>fieldCameraObstacles(c.group));const collisions=ray.intersectObjects(obstacles,false);const first=collisions.find(c=>c.distance>1.2);const d=first?Math.max(2.2,first.distance-.6):this.distance;
    const desired=this.target.clone().addScaledVector(orbit,d);this.camera.position.lerp(desired,1-Math.exp(-dt*12));this.camera.lookAt(this.target);
    for(const npc of this.npcSprites.values())this.animate(npc,npc.npc.facingDirection,npc.npc.step);
    this.sky.update(dt,x,height,z);
    this.renderer.render(this.scene,this.camera);
  }
}
