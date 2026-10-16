import * as THREE from 'three';
import {fieldBattleLayout,battleTrainerSpot} from './battle-layout.ts';
import {fieldCameraObstacles} from './camera.ts';
import type {OriginalWorld} from './world.ts';
import type {BattleView} from './battle-view.ts';
import type {Mon,MoveData} from './types.ts';

type Context={x:number;z:number;y?:number;facing:number;location:string;gender:'boy'|'girl';actors:THREE.Object3D[]};
type Art={texture:THREE.Texture;aspect:number};
type Fighter={root:THREE.Group;plane:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>;shadow:THREE.Mesh;home:THREE.Vector3;key:string;front?:Art;back?:Art;flash:number;hidden:boolean};
const typeColors=['#e4d7aa','#e4a064','#c5e4e9','#bba7d9','#c7a86e','#cba47b','#c2dd8a','#b3a6d5','#c8d0df','#d6d6d6','#fa9b45','#73c9f0','#a9d26c','#f5dc71','#f49ab7','#a1e4eb','#9ea3e5','#aaa0b5'];
const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));

/** Uses the live field scene and camera: no replacement background or battle map. */
export class WorldBattleView implements BattleView {
  active=false;
  private group=new THREE.Group();
  private fighters:Fighter[]=[];
  private art=new Map<string,Promise<Art>>();
  private center=new THREE.Vector3();
  private time=0;
  private shake=0;
  private previousYaw=0;
  private previousFov=52;
  private previousPitch=.4;private previousDistance=13;
  private disposed=false;
  private ball:THREE.Group|null=null;
  private hiddenActors:{object:THREE.Object3D;visible:boolean}[]=[];
  private trainers:{paper:ReturnType<OriginalWorld['paper']>;facing:number}[]=[];
  private sparks:{mesh:THREE.Mesh;velocity:THREE.Vector3;life:number}[]=[];
  private context:()=>Context;
  readonly world:OriginalWorld;
  get location(){return this.context().location;}

  constructor(world:OriginalWorld,context:()=>Context){this.world=world;this.context=context;}

  async begin(player:Mon,enemy:Mon,trainer=false){
    this.disposed=false;this.time=0;this.previousYaw=this.world.yaw;this.previousFov=this.world.camera.fov;this.previousPitch=this.world.pitch;this.previousDistance=this.world.distance;
    const c=this.context(),layout=fieldBattleLayout(this.world,{x:c.x,z:c.z,y:c.y??this.world.height(c.x,c.z),facing:c.facing}),positions=layout.positions,axis=new THREE.Vector2(layout.axis.x,layout.axis.z);
    this.group=new THREE.Group();this.group.name='battle-in-field';this.world.scene.add(this.group);this.active=true;this.world.battleStage=this;
    this.fighters=positions.map(p=>this.fighter(p.x,p.z,p.y));
    this.center.copy(this.fighters[0].home).add(this.fighters[1].home).multiplyScalar(.5);this.center.y+=.85;
    const nearby=[...this.world.npcSprites.values()].filter(n=>n.group.visible&&n.group.position.distanceTo(this.center)<7).sort((a,b)=>a.group.position.distanceToSquared(this.center)-b.group.position.distanceToSquared(this.center));
    this.hiddenActors=[...c.actors,...nearby.map(n=>n.group)].map(object=>({object,visible:object.visible}));for(const a of this.hiddenActors)a.object.visible=false;
    const trainerKeys=[c.gender==='boy'?'SPRITE_HERO':'SPRITE_HEROINE',...(trainer&&nearby.length?[nearby[0].key]:[])];
    const toward=layout.axis.x<0?2:layout.axis.x>0?3:layout.axis.z<0?0:1;
    this.trainers=trainerKeys.map((key,i)=>{const paper=this.world.paper(key,1.9);this.group.add(paper.group);const home=this.fighters[i].home,position=battleTrainerSpot(this.world,{x:home.x,z:home.z,y:home.y-.035},layout.axis,i===0?1:-1);paper.group.position.set(position.x,position.y,position.z);return{paper,facing:i===0?toward:[1,0,3,2][toward]};});
    // Three-quarter shoulder view along the line between the two Pokémon.
    this.world.yaw=Math.atan2(-axis.x,-axis.y)+.6;this.world.pitch=.37;this.world.distance=8.4;this.active=true;this.world.battleStage=this;
    this.sync(player,enemy);await Promise.all([...this.art.values()]);await wait(350);
  }

  private fighter(x:number,z:number,currentY:number):Fighter{
    const root=new THREE.Group(),height=1.85;
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(1,height),new THREE.MeshBasicMaterial({transparent:true,alphaTest:.15,side:THREE.DoubleSide}));
    plane.geometry.translate(0,height/2,0);root.add(plane);
    const shadow=new THREE.Mesh(new THREE.CircleGeometry(.65,32),new THREE.MeshBasicMaterial({color:'#182c29',transparent:true,opacity:.22,depthWrite:false}));
    shadow.rotation.x=-Math.PI/2;shadow.scale.y=.62;shadow.position.y=.025;root.add(shadow);
    root.position.set(x,currentY+.035,z);this.group.add(root);
    return{root,plane,shadow,home:root.position.clone(),key:'',flash:0,hidden:false};
  }

  private loadArt(path:string):Promise<Art>{
    if(!this.art.has(path))this.art.set(path,new THREE.TextureLoader().loadAsync(path).then(texture=>{
      texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;
      const image=texture.image as HTMLImageElement,canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,image.width,image.height).data;
      let left=image.width,right=0,top=image.height,bottom=0;
      for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)if(pixels[(y*image.width+x)*4+3]>30){left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);}
      const width=Math.max(1,right-left),height=Math.max(1,bottom-top);
      texture.repeat.set(width/image.width,height/image.height);texture.offset.set(left/image.width,1-bottom/image.height);
      return{texture,aspect:width/height};
    }));return this.art.get(path)!;
  }

  sync(player:Mon,enemy:Mon){
    if(!this.active)return;
    for(const [i,mon] of [player,enemy].entries()){
      const f=this.fighters[i],key=mon.species+'-'+mon.gender;if(f.key===key)continue;
      f.key=key;f.hidden=false;f.root.scale.setScalar(1);f.plane.visible=false;
      void Promise.all(['front','back'].map(face=>this.loadArt(`/source/pokemon/${key}-${face}.png`))).then(([front,back])=>{
        if(this.disposed||f.key!==key)return;f.front=front;f.back=back;f.plane.visible=true;
      },()=>{f.plane.visible=false;});
    }
  }

  update(dt:number){
    if(!this.active)return;this.time+=dt;
    const camera=this.world.camera,aspect=camera.aspect;
    const vertical=THREE.MathUtils.degToRad(46),horizontal=2*Math.atan(Math.tan(vertical/2)*aspect);
    const fit=3.1/Math.sin(Math.min(vertical,horizontal)/2);
    const distance=this.world.distance*Math.max(1,fit/8.4);
    const desired=this.center.clone().add(new THREE.Vector3(Math.sin(this.world.yaw)*Math.cos(this.world.pitch)*distance,Math.sin(this.world.pitch)*distance,Math.cos(this.world.yaw)*Math.cos(this.world.pitch)*distance));
    // Raise the camera for solid architecture behind the shoulder.
    const ray=new THREE.Raycaster(this.center,desired.clone().sub(this.center).normalize(),1,desired.distanceTo(this.center));
    const blocker=ray.intersectObjects([...this.world.cells.values()].flatMap(c=>fieldCameraObstacles(c.group)),false).find(hit=>hit.distance>1.4);
    if(blocker)desired.y+=Math.min(5,Math.max(0,desired.distanceTo(this.center)-blocker.distance)*.8);
    camera.position.lerp(desired,1-Math.exp(-dt*5));camera.fov=THREE.MathUtils.lerp(camera.fov,46,1-Math.exp(-dt*5));camera.updateProjectionMatrix();
    const look=this.center.clone();look.y-=aspect<.9?.1:.2;
    if(this.shake>0){camera.position.x+=Math.sin(this.time*97)*this.shake;this.shake=Math.max(0,this.shake-dt*.7);}
    camera.lookAt(look);
    for(const trainer of this.trainers)this.world.animate(trainer.paper,trainer.facing,-1);
    for(const [i,f]of this.fighters.entries()){
      const toward=this.fighters[1-i].home.clone().sub(f.home),viewer=camera.position.clone().sub(f.home);
      const art=viewer.dot(toward)>0?f.front:f.back;
      if(art){f.plane.material.map=art.texture;f.plane.material.needsUpdate=false;f.plane.scale.x=1.85*art.aspect;f.plane.visible=!f.hidden;}
      f.plane.rotation.y=Math.atan2(viewer.x,viewer.z);f.plane.position.y=Math.sin(this.time*2.2+i)*.025;
      f.flash=Math.max(0,f.flash-dt);f.plane.material.color.set(f.flash>0&&Math.floor(f.flash*25)%2?'#ffb39c':'#ffffff');
    }
    for(const spark of this.sparks){spark.life-=dt;spark.velocity.y-=dt*3;spark.mesh.position.addScaledVector(spark.velocity,dt);spark.mesh.scale.multiplyScalar(Math.exp(-dt*4));}
    this.sparks=this.sparks.filter(s=>{if(s.life>0)return true;this.group.remove(s.mesh);s.mesh.geometry.dispose();(s.mesh.material as THREE.Material).dispose();return false;});
  }

  private async motion(seconds:number,fn:(t:number)=>void){const start=performance.now();await new Promise<void>(resolve=>{const frame=()=>{if(!this.active){resolve();return;}const t=Math.min(1,(performance.now()-start)/(seconds*1000));fn(t);if(t<1)requestAnimationFrame(frame);else resolve();};frame();});}
  async attack(playerSide:boolean,move:MoveData){
    const actor=this.fighters[playerSide?0:1],target=this.fighters[playerSide?1:0],color=typeColors[move.type]||'#f0dab2';
    if(move.category===2){this.burst(actor.home.clone().add(new THREE.Vector3(0,.6,0)),color);await this.motion(.45,t=>{actor.root.position.y=actor.home.y+Math.sin(t*Math.PI)*.25;});}
    else if(move.category===0){const delta=target.home.clone().sub(actor.home).normalize().multiplyScalar(.75);await this.motion(.42,t=>{actor.root.position.copy(actor.home).addScaledVector(delta,Math.sin(t*Math.PI));actor.root.position.y+=Math.sin(t*Math.PI)*.12;});}
    else{
      const orb=new THREE.Mesh(new THREE.IcosahedronGeometry(.18,1),new THREE.MeshBasicMaterial({color}));this.group.add(orb);
      await this.motion(.5,t=>{orb.position.lerpVectors(actor.home,target.home,t);orb.position.y+=.9+Math.sin(t*Math.PI)*.3;orb.rotation.y=t*8;});this.group.remove(orb);orb.geometry.dispose();orb.material.dispose();
    }
    actor.root.position.copy(actor.home);
  }
  private burst(position:THREE.Vector3,color:string){for(let i=0;i<10;i++){const mesh=new THREE.Mesh(new THREE.IcosahedronGeometry(.055,0),new THREE.MeshBasicMaterial({color}));mesh.position.copy(position);this.group.add(mesh);this.sparks.push({mesh,velocity:new THREE.Vector3(Math.cos(i*2.4)*1.7,.5+(i%3)*.6,Math.sin(i*2.4)*1.7),life:.65});}}
  async hit(playerSide:boolean){const f=this.fighters[playerSide?0:1];f.flash=.4;this.shake=.07;this.burst(f.home.clone().add(new THREE.Vector3(0,.8,0)),'#fff2c1');await wait(180);}
  async capture(shakes:number){
    const from=this.fighters[0].home.clone().add(new THREE.Vector3(0,1,0)),enemy=this.fighters[1],to=enemy.home.clone().add(new THREE.Vector3(0,.2,0));
    const ball=new THREE.Group();this.ball=ball;
    for(const [color,theta]of [[0xe46151,0],[0xf8f4df,Math.PI/2]])ball.add(new THREE.Mesh(new THREE.SphereGeometry(.18,20,12,0,Math.PI*2,theta,Math.PI/2),new THREE.MeshBasicMaterial({color})));
    const band=new THREE.Mesh(new THREE.TorusGeometry(.18,.025,8,24),new THREE.MeshBasicMaterial({color:'#283a42'}));band.rotation.x=Math.PI/2;ball.add(band);this.group.add(ball);
    await this.motion(.65,t=>{ball.position.lerpVectors(from,to,t);ball.position.y+=Math.sin(t*Math.PI)*2;ball.rotation.z=t*8;});
    this.burst(to.clone().add(new THREE.Vector3(0,.5,0)),'#f9de91');await this.motion(.22,t=>enemy.root.scale.setScalar(1-t));enemy.hidden=true;enemy.plane.visible=false;
    for(let i=0;i<Math.min(3,shakes);i++)await this.motion(.4,t=>{ball.rotation.z=Math.sin(t*Math.PI*2)*.4;});
    if(shakes<4){enemy.hidden=false;enemy.root.scale.setScalar(1);this.burst(to.clone(),'#f9de91');this.group.remove(ball);ball.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();(object.material as THREE.Material).dispose();}});}else ball.rotation.z=0;
  }
  orbit(amount:number){this.world.yaw+=amount;}
  end(){
    if(!this.active)return;this.active=false;this.disposed=true;this.world.yaw=this.previousYaw;this.world.pitch=this.previousPitch;this.world.distance=this.previousDistance;this.world.camera.fov=this.previousFov;this.world.camera.updateProjectionMatrix();
    for(const a of this.hiddenActors)a.object.visible=a.visible;this.hiddenActors=[];for(const t of this.trainers)t.paper.texture.dispose();this.trainers=[];
    this.world.scene.remove(this.group);this.group.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();}});
    for(const art of this.art.values())void art.then(value=>value.texture.dispose(),()=>{});this.art.clear();this.sparks=[];this.ball=null;
    if(this.world.battleStage===this)this.world.battleStage=null;
  }
}
