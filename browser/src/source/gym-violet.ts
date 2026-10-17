import * as THREE from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import type {SourceMap,State} from './types.ts';

// src/field/gymmick/violet.c, in browser tile units (native units /16).
export const VIOLET_GYM={key:'MAP_VIOLET_GYM',asset:'props/0-111-26.glb',model:111,x:15.5,z:20.5,down:2,up:31,speed:1,frames:29,seconds:29/30,plate:{x:14,z:19,width:3,depth:3}} as const;
export type VioletLiftState=0|1;
export type VioletGymHooks={waitFollower:(signal:AbortSignal)=>Promise<void>;player:()=>{x:number;y:number;z:number};placeRiders:(y:number)=>void};
export type VioletGymAnimation=(seconds:number,frame:(progress:number)=>void,signal:AbortSignal)=>Promise<void>;
export class VioletGymCancelled extends Error{constructor(){super('Violet Gym lift was unloaded');this.name='AbortError';}}
function check(signal:AbortSignal){if(signal.aborted)throw new VioletGymCancelled();}
function abortable<T>(pending:Promise<T>,signal:AbortSignal){return new Promise<T>((resolve,reject)=>{
  const abort=()=>{signal.removeEventListener('abort',abort);reject(new VioletGymCancelled());};
  if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});
  pending.then(value=>{signal.removeEventListener('abort',abort);resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
});}

/** Main-queue tasks run once per two VBlanks (src/main.c:109–123).
 * Interpolate the 29 native30Hz movement ticks at any display rate. */
export const animateVioletLift:VioletGymAnimation=(seconds,frame,signal)=>new Promise((resolve,reject)=>{
  let request=0,start:number|undefined;
  const cleanup=()=>{cancelAnimationFrame(request);signal.removeEventListener('abort',abort);};
  const abort=()=>{cleanup();reject(new VioletGymCancelled());};
  if(signal.aborted){reject(new VioletGymCancelled());return;}
  signal.addEventListener('abort',abort,{once:true});
  const tick=(now:number)=>{try{check(signal);start??=now;const progress=Math.min(1,(now-start)/(seconds*1000));frame(progress);if(progress===1){cleanup();resolve();}else request=requestAnimationFrame(tick);}catch(error){cleanup();reject(error);}};
  request=requestAnimationFrame(tick);
});

export function onVioletLift(x:number,z:number){const p=VIOLET_GYM.plate;return Math.floor(x)>=p.x&&Math.floor(x)<p.x+p.width&&Math.floor(z)>=p.z&&Math.floor(z)<p.z+p.depth;}
export function violetLiftY(state:VioletLiftState){return state?VIOLET_GYM.up:VIOLET_GYM.down;}
/** Continue rehydrates the saved height; field_warp_tasks.c clears the native
 * gymmick on real warps. Keep this witness stable across asset-load retries. */
export function gymFieldEntry(state:State,restoreObjects:boolean,connection=false){
  const initialHeight=restoreObjects&&Number.isFinite(state.fieldHeight)?state.fieldHeight!:0;
  const violetLift:VioletLiftState=restoreObjects&&state.gymmick?.kind==='violet'&&state.gymmick.liftState===1?1:0;
  if(!restoreObjects&&!connection){delete state.fieldHeight;delete state.gymmick;}
  return{initialHeight,violetLift};
}

/** Owns only a placed clone and its skeletons; cached meshes/maps stay shared.
 * The native plate changes at the end of the ride. During it the actor height
 * override replaces automatic terrain updates for both player and follower.
 */
export class VioletGym{
  private generation=0;private controller:AbortController|null=null;
  private plateY:number=VIOLET_GYM.down;private mapID=-1;
  platform:THREE.Group|null=null;riderHeight:number|undefined;moving=false;
  constructor(private scene:THREE.Scene,private asset:(path:string)=>Promise<THREE.Group>,private animate:VioletGymAnimation=animateVioletLift){}
  get active(){return this.platform!==null;}
  async enter(map:Pick<SourceMap,'id'|'key'>,state:VioletLiftState=0){
    this.leave();const generation=this.generation;if(map.key!==VIOLET_GYM.key)return;
    // Native GymmickInit_Violet_sub asserts on invalid data, then falls back
    // to DOWN. A malformed browser save must not trap Continue in Retry.
    state=state===1?1:0;
    const template=await this.asset(VIOLET_GYM.asset);if(generation!==this.generation)return;
    const platform=clone(template)as THREE.Group;platform.name='native-violet-gym-elevator';platform.scale.setScalar(1/16);platform.position.set(VIOLET_GYM.x,violetLiftY(state),VIOLET_GYM.z);
    this.mapID=map.id;this.plateY=violetLiftY(state);this.platform=platform;this.scene.add(platform);platform.updateMatrixWorld(true);
  }
  leave(){
    this.generation++;this.controller?.abort();this.controller=null;this.riderHeight=undefined;this.moving=false;
    if(this.platform){this.scene.remove(this.platform);const skeletons=new Set<THREE.Skeleton>();this.platform.traverse(object=>{if(object instanceof THREE.SkinnedMesh)skeletons.add(object.skeleton);});for(const skeleton of skeletons)skeleton.dispose();}
    this.platform=null;this.mapID=-1;this.plateY=VIOLET_GYM.down;
  }
  init(state:State,restore=false){
    if(!this.platform||state.map!==this.mapID||this.moving)throw Error('Violet Gym initialization needs its loaded, stationary source platform');
    const saved=restore&&state.gymmick?.kind==='violet'&&state.gymmick.liftState===1?1:0;
    state.gymmick={kind:'violet',liftState:saved};this.plateY=violetLiftY(saved);this.platform.position.y=this.plateY;
  }
  height(x:number,z:number,currentY:number,bdhcY:number){
    if(!this.active||!onVioletLift(x,z))return bdhcY;
    // field_terrain.c:Terrain_CalcHeight: BDHC wins ties and a dynamic plate
    // below BDHC never overrides it. Keep the lower floor under the lift.
    return this.plateY<=bdhcY||Math.abs(bdhcY-currentY)<=Math.abs(this.plateY-currentY)?bdhcY:this.plateY;
  }
  blocksStep(fromY:number,toY:number){return this.active&&Math.abs(toY-fromY)>=1.25;}
  async ride(state:State,hooks:VioletGymHooks){
    const platform=this.platform,player=hooks.player();
    if(!platform||state.map!==this.mapID||this.moving)throw Error('Violet Gym elevator is unavailable');
    if(!onVioletLift(player.x,player.z)||Math.abs(player.y-platform.position.y)>1/65536||![VIOLET_GYM.down,VIOLET_GYM.up].includes(player.y as 2|31))throw Error('Violet Gym elevator requires a rider on its stationary platform');
    const generation=this.generation,controller=new AbortController(),signal=controller.signal;
    const from=platform.position.y,target=player.y===VIOLET_GYM.down?VIOLET_GYM.up:VIOLET_GYM.down,previous=state.gymmick,next={kind:'violet' as const,liftState:(target===VIOLET_GYM.up?1:0)as VioletLiftState};
    this.controller=controller;this.moving=true;state.gymmick=next;let complete=false;
    try{
      await abortable(hooks.waitFollower(signal),signal);check(signal);
      await abortable(this.animate(VIOLET_GYM.seconds,progress=>{check(signal);const y=from+(target-from)*progress;platform.position.y=y;this.riderHeight=y;hooks.placeRiders(y);},signal),signal);check(signal);
      platform.position.y=target;this.plateY=target;hooks.placeRiders(target);complete=true;
    }finally{
      if(!complete&&state.gymmick===next){if(previous)state.gymmick=previous;else delete state.gymmick;}
      if(generation===this.generation){try{if(!complete){platform.position.y=from;this.plateY=from;hooks.placeRiders(from);}}finally{this.riderHeight=undefined;this.controller=null;this.moving=false;}}
    }
  }
}
