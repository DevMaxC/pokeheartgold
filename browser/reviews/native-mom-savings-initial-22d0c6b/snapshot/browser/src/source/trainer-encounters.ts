import type {GameData,NPC,SourceMap,State} from './types.ts';
import type {EngagedTrainer,TrainerApproachContext} from './script.ts';
import {trainerIdForScript,trainerDefeated} from './trainer-script-state.ts';

export const TRAINER_DIRECTIONS=[{x:0,z:-1},{x:0,z:1},{x:-1,z:0},{x:1,z:0}]as const;
export type TrainerActor=NPC&{shown?:boolean;invisible?:boolean;previousX?:number;previousZ?:number;previousY?:number};
export type SightTrainer=EngagedTrainer&{direction:number;distance:number};
export type TrainerEncounter=TrainerApproachContext&{trainers:SightTrainer[]};
export type TrainerCollision=(actor:TrainerActor,x:number,z:number,direction:number)=>number;
export function actorActive(actor:TrainerActor,state:State){return actor.shown??(actor.eventFlag==='FLAG_NOTHING'||!state.flags[actor.eventFlag]);}
function sightType(actor:TrainerActor){const type=actor.type??0;return type>=4&&type<=8?1:type;}
function trainerScript(data:GameData,map:SourceMap,actor:TrainerActor){const script=String(actor.scriptId),match=script.match(/^std_trainer(_2)?\((\w+)\)$/);return match?(map.constants[match[2]]??data.constants[match[2]])-1+(match[1]?5000:3000):Number(actor.scriptId);}
export class MissingTrainerPartner extends Error{constructor(readonly object:string){super(`Missing native double-trainer partner for ${object}`);}}
export type TrainerAttemptSnapshot=Readonly<{location:string;attempts:readonly string[]}>;
/** Failure suppression is field runtime state, deliberately outside saves and
 * automatic rollback. A broken source encounter reports once, then permits
 * walking out. Only explicit Retry restores the pre-outer-action snapshot. */
export class TrainerAttemptLatch{
 private location='';private attempts=new Set<string>();
 snapshot():TrainerAttemptSnapshot{return Object.freeze({location:this.location,attempts:Object.freeze([...this.attempts])});}
 restore(snapshot:TrainerAttemptSnapshot){this.location=snapshot.location;this.attempts=new Set(snapshot.attempts);}
 observe(state:Pick<State,'map'|'x'|'z'>){const location=`${state.map}:${Math.floor(state.x)},${Math.floor(state.z)}`;if(location!==this.location){this.location=location;this.attempts.clear();}}
 admit(state:Pick<State,'map'|'x'|'z'>,key:string){this.observe(state);if(this.attempts.has(key))return false;this.attempts.add(key);return true;}
}
/** map_object_behavior.c TrainerSight_FindPlayer/IsPathBlocked. Bit 1 is
 * movement-range only and is ignored; all intermediate tiles must be clear,
 * and the final tile must contain the player (collision bit 4 alone). */
export function trainerSight(actor:TrainerActor,player:{x:number;z:number},collision:TrainerCollision):{direction:number;distance:number}|null{
 const mode=sightType(actor);if(mode!==1&&mode!==2)return null;const x=Math.floor(actor.x),z=Math.floor(actor.z),px=Math.floor(player.x),pz=Math.floor(player.z),range=actor.param0??0;
 for(const direction of mode===1?[actor.facingDirection]:[0,1,2,3]){const d=TRAINER_DIRECTIONS[direction];if(!d)continue;const distance=(px-x)*d.x+(pz-z)*d.z;if(distance<1||distance>range||x+d.x*distance!==px||z+d.z*distance!==pz)continue;let blocked=false;for(let i=1;i<=distance;i++){const flags=collision(actor,x+d.x*i,z+d.z*i,direction)&~1;if(i===distance?flags!==4:flags!==0){blocked=true;break;}}if(!blocked)return{direction,distance};}
 return null;
}
/** Uses active native object order, type/range/facing, visibility event flags,
 * and durable native trainer flags. It does not replace collision with a
 * radius test or search around an obstructed sight line. */
export function findTrainerEncounter(data:GameData,state:State,map:SourceMap,actors:TrainerActor[],collision:TrainerCollision):TrainerEncounter|null{
 const candidates=actors.filter(actor=>actorActive(actor,state));
 const find=(exclude?:string)=>{for(const actor of candidates){if(actor.id===exclude)continue;const id=trainerIdForScript(trainerScript(data,map,actor));if(id===null||!data.trainers[id]||trainerDefeated(state,id))continue;const sight=trainerSight(actor,state,collision);if(sight)return{trainer:id,object:actor.id,...sight};}return null;};
 const first=find();if(!first)return null;const doubles=state.party.filter(mon=>!mon.isEgg&&mon.hp>0).length>=2;
 if(data.trainers[first.trainer].double){if(!doubles)return null;const partner=candidates.find(actor=>actor.id!==first.object&&[1,2].includes(sightType(actor))&&trainerIdForScript(trainerScript(data,map,actor))===first.trainer);if(!partner)throw new MissingTrainerPartner(first.object);return{eyeType:1,trainers:[first,{...first,object:partner.id}]};}
 const second=doubles?find(first.object):null;return{eyeType:second?2:0,trainers:second?[first,second]:[first]};
}

/** Source metatile_behavior.c / map_object_update.c entry/exit tests. */
export function trainerBehaviorBlocked(from:number,to:number,direction:number){const blocked=[[50,52,53,60,73],[51,54,55,61,73],[49,53,55,74],[48,52,54,74]],opposite=[1,0,3,2];return(to&255)===255||blocked[direction]?.includes(from&255)||blocked[opposite[direction]]?.includes(to&255)||false;}
export type TrainerTerrain={permission:(x:number,z:number)=>number;height:(x:number,z:number,reference?:number,fromX?:number,fromZ?:number)=>number;obstructed?:(x:number,z:number,fromX:number,fromZ:number,reference:number)=>boolean;actorHeight?:(actor:TrainerActor)=>number;playerHeight?:()=>number;occupants?:()=>{x:number;z:number;height:number}[]};
/** Adapt actual permission/plate/furniture queries to native collision bits.
 * Native height collision is >=20 DS units (=1.25 rendered tiles); occupancy
 * compares floor(height/8 DS units), permitting different bridge floors. */
export function fieldTrainerCollision(terrain:TrainerTerrain,state:State,actors:TrainerActor[]):TrainerCollision{
 const level=(y:number)=>Math.floor(y*2),height=(actor:TrainerActor)=>terrain.actorHeight?.(actor)??terrain.height(actor.x+.5,actor.z+.5,actor.y/16);
 return(actor,x,z,direction)=>{const sx=Math.floor(actor.x)+.5,sz=Math.floor(actor.z)+.5,reference=height(actor),target=terrain.height(x+.5,z+.5,reference,sx,sz);let flags=0;
  // NPC sight uses native collision attributes, never the player's Surf/HM
  // eligibility gate. Water itself does not add collision bit 2.
  if(terrain.permission(x+.5,z+.5)&0x8000||terrain.obstructed?.(x+.5,z+.5,sx,sz,reference)||trainerBehaviorBlocked(terrain.permission(sx,sz),terrain.permission(x+.5,z+.5),direction))flags|=2;
  if(Math.abs(target-reference)>=1.25)flags|=10;
  const sameLevel=(y:number)=>Math.abs(level(y)-level(reference))<2;
  if(Math.floor(state.x)===x&&Math.floor(state.z)===z&&sameLevel(terrain.playerHeight?.()??terrain.height(state.x,state.z)))flags|=4;
  if(actors.some(other=>other.id!==actor.id&&actorActive(other,state)&&(Math.floor(other.x)===x&&Math.floor(other.z)===z&&sameLevel(height(other))||other.previousX!==undefined&&other.previousZ!==undefined&&Math.floor(other.previousX)===x&&Math.floor(other.previousZ)===z&&sameLevel(other.previousY??height(other)))))flags|=4;
  if(terrain.occupants?.().some(other=>Math.floor(other.x)===x&&Math.floor(other.z)===z&&sameLevel(other.height)))flags|=4;
  return flags;
 };
}
/** field_control.c checks on-frame scripts, then trainers, before coordinate
 * events, warps, wild encounters, interaction and directional input. */
export async function trainerEventPriority(frame:()=>Promise<boolean>,trainer:()=>Promise<boolean>){return await frame()||await trainer();}

export type ApproachHooks={notice:(trainer:SightTrainer,hidden:boolean)=>Promise<void>;step:(trainer:SightTrainer,x:number,z:number)=>Promise<void>;facePlayer:(direction:number)=>void;finish:(trainer:SightTrainer)=>void};
/** Exact native straight approach: distance-1 steps, no fabricated path around
 * obstacles. The plan is revalidated before notice and again before each step. */
export async function approachTrainer(plan:SightTrainer,index:number,eyeType:number,actor:TrainerActor,player:{x:number;z:number},collision:TrainerCollision,hooks:ApproachHooks){
 const d=TRAINER_DIRECTIONS[plan.direction];if(!d||Math.floor(actor.x)+d.x*plan.distance!==Math.floor(player.x)||Math.floor(actor.z)+d.z*plan.distance!==Math.floor(player.z))throw Error('Native trainer approach no longer matches the player');
 for(let i=1;i<=plan.distance;i++){const bits=collision(actor,Math.floor(actor.x)+d.x*i,Math.floor(actor.z)+d.z*i,plan.direction)&~1;if(i===plan.distance?bits!==4:bits!==0)throw Error('Native trainer approach path became blocked');}
 await hooks.notice(plan,[51,52,53,54].includes(actor.movement));
 for(let remaining=plan.distance;remaining>1;remaining--){const x=Math.floor(actor.x)+d.x,z=Math.floor(actor.z)+d.z;if(collision(actor,x,z,plan.direction)&~1)throw Error('Native trainer approach step became blocked');await hooks.step(plan,x,z);if(Math.floor(actor.x)!==x||Math.floor(actor.z)!==z)throw Error('Native trainer movement did not reach its source tile');}
 if(index===0||eyeType===2)hooks.facePlayer([1,0,3,2][plan.direction]);hooks.finish(plan);
}
