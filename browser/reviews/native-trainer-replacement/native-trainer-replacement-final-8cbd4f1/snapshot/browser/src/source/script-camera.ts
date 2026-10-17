import {movementAction} from './movement.ts';
import type {SourceMap} from './types.ts';

/** Script_GetMapObjectByPerson reserves 0xF1 for SCRIPTENV_CAMERA_TARGET. */
export const SCRIPT_CAMERA_PERSON=0xf1;
export const SCRIPT_CAMERA_ACTOR='obj_camera_target';
export type ScriptCameraPosition={map:number;x:number;y:number;z:number};
export type ScriptCameraTween=(seconds:number,update:(progress:number)=>void)=>Promise<void>;
type Height=(x:number,z:number,currentY?:number,fromX?:number,fromZ?:number)=>number;
type ScriptCameraHost={createScriptCameraTarget:(map:number,x:number,z:number)=>void;clearScriptCameraTarget:()=>void;moveScriptCameraTarget:(source:SourceMap,label:string,tween:ScriptCameraTween)=>Promise<void>};

/** Script banks may be common banks; native target ownership is the live field. */
export function setScriptCameraTarget(world:ScriptCameraHost,fieldMap:number,target:{x:number;z:number}|null){
  if(target)world.createScriptCameraTarget(fieldMap,target.x,target.z);else world.clearScriptCameraTarget();
}
export function scriptCameraMovement(world:ScriptCameraHost,object:string,label:string,source:SourceMap,tween:ScriptCameraTween):Promise<void>|null{
  return object===SCRIPT_CAMERA_ACTOR?world.moveScriptCameraTarget(source,label,tween):null;
}

/** A source movement actor and streaming focus, with no rendered NPC or save data. */
export class ScriptCameraTarget {
  private actor:ScriptCameraPosition|null=null;
  private generation=0;
  constructor(private readonly height:Height){}
  get position():ScriptCameraPosition|null{return this.actor?{...this.actor}:null;}
  create(map:number,x:number,z:number){
    if(!Number.isInteger(map)||![x,z].every(Number.isFinite))throw Error('Invalid source camera target');
    this.clear();const worldX=x+.5,worldZ=z+.5;
    this.actor={map,x:worldX,y:this.height(worldX,worldZ),z:worldZ};
  }
  clear(){this.generation++;this.actor=null;}
  async move(map:SourceMap,label:string,tween:ScriptCameraTween){
    const actor=this.actor,generation=this.generation;
    if(!actor)throw Error('Missing original camera movement object 241');
    let index=map.scripts.labels[label];if(index===undefined)throw Error(`Missing original camera movement ${label}`);
    const current=()=>this.actor===actor&&this.generation===generation;
    const requireCurrent=()=>{if(!current())throw Error('Original camera movement was cancelled by a field change');};
    while(index<map.scripts.instructions.length){
      requireCurrent();const[command,args]=map.scripts.instructions[index++],action=movementAction(command,args);
      if(action.end)return;
      if(action.distance&&action.facing!==null){
        const direction=[{x:0,z:-1},{x:0,z:1},{x:-1,z:0},{x:1,z:0}][action.facing];
        for(let repeat=0;repeat<action.repeats;repeat++){
          requireCurrent();const from={...actor},dx=direction.x*action.distance,dz=direction.z*action.distance;
          await tween(action.seconds,progress=>{
            if(!current())return;
            const x=from.x+dx*progress,z=from.z+dz*progress;
            actor.y=this.height(x,z,actor.y,actor.x,actor.z);actor.x=x;actor.z=z;
          });requireCurrent();
        }
      }else if(action.delay){await tween(action.delay,()=>{});requireCurrent();}
      // Facing/visibility actions have no visual effect on SPRITE_CAMERA_FOCUS.
    }
    throw Error(`Unterminated original camera movement ${label}`);
  }
}
