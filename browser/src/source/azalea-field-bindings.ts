import type {AzaleaFieldActor,AzaleaFieldMovement,AzaleaFieldPoint} from './gym-azalea-host.ts';

export type AzaleaPaper={group:{position:{x:number;y:number;z:number;set:(x:number,y:number,z:number)=>unknown}}};
export type AzaleaActorRole='player'|'follower';
type Logical={current:AzaleaFieldPoint;previous:AzaleaFieldPoint};
type RecordEntry=Logical&{paper:AzaleaPaper;actor:AzaleaFieldActor;movement:AzaleaFieldMovement|null};
export type AzaleaActorCheckpoint={player:Logical|null;follower:Logical|null};
export type AzaleaActorBindingsPorts={
 player:()=>AzaleaPaper;follower:()=>AzaleaPaper|null;followerActive:()=>boolean;
 playerLogical:()=>AzaleaFieldPoint;forcedMovement:()=>boolean;
 facing:(role:AzaleaActorRole)=>number;face:(role:AzaleaActorRole,direction:number)=>void;
 settle:(role:AzaleaActorRole,point:AzaleaFieldPoint)=>void;
};
const copy=(point:AzaleaFieldPoint):AzaleaFieldPoint=>({x:point.x,y:point.y,z:point.z});
function valid(point:AzaleaFieldPoint){if(!point||![point.x,point.y,point.z].every(Number.isFinite))throw Error('Invalid original Azalea actor coordinates');return copy(point);}
const obsolete=()=>new DOMException('The original Azalea actor was replaced','AbortError');

/** Stable adapters for actual field papers. Logical tiles, vector positions
 * and owned movement frames are distinct, as in the native MapObject. */
export class AzaleaFieldActors{
 private player:RecordEntry|null=null;private follower:RecordEntry|null=null;
 constructor(private ports:AzaleaActorBindingsPorts){}
 private paper(role:AzaleaActorRole){return role==='player'?this.ports.player():this.ports.followerActive()?this.ports.follower():null;}
 private guard(role:AzaleaActorRole,paper:AzaleaPaper){if(this.paper(role)!==paper)throw obsolete();}
 private record(role:AzaleaActorRole):RecordEntry|null{
  const paper=this.paper(role);if(!paper){this[role]=null;return null;}
  let record=this[role];
  if(record?.paper!==paper){
   const logical=valid(role==='player'?this.ports.playerLogical():paper.group.position);
   record={paper,current:logical,previous:copy(logical),movement:null,actor:null as unknown as AzaleaFieldActor};
   const owned=record;
   const place=(point:AzaleaFieldPoint)=>{this.guard(role,paper);const value=valid(point);paper.group.position.set(value.x,value.y,value.z);this.guard(role,paper);};
   owned.actor={
    position:()=>{this.guard(role,paper);return valid(paper.group.position);},
    facing:()=>{this.guard(role,paper);return this.ports.facing(role);},
    place,
    settle:point=>{place(point);owned.current=valid(point);owned.previous=valid(point);owned.movement=null;this.ports.settle(role,copy(point));this.guard(role,paper);},
    face:direction=>{this.guard(role,paper);if(!Number.isInteger(direction)||direction<0||direction>3)throw Error('Invalid original Azalea actor facing');this.ports.face(role,direction);this.guard(role,paper);},
    movement:value=>{
     // A departed action may release only its own record. It must never
     // write coordinates/facing or clear a newer paper's animation owner.
     if(value===null){owned.movement=null;return;}
     this.guard(role,paper);if(![0,1].includes(value.direction)||!Number.isInteger(value.step)||value.step<0||value.step>7)throw Error('Invalid original Azalea movement frame');
     owned.current=valid(value.current);owned.previous=valid(value.previous);owned.movement={direction:value.direction,step:value.step,current:copy(owned.current),previous:copy(owned.previous)};
    },
   };
   this[role]=record;
  }
  if(!record.movement&&!this.ports.forcedMovement()){
   const current=valid(role==='player'?this.ports.playerLogical():paper.group.position);
   if(current.x!==record.current.x||current.y!==record.current.y||current.z!==record.current.z){record.current=current;record.previous=copy(current);}
  }
  return record;
 }
 actors(){const player=this.record('player');if(!player)throw Error('Missing original Azalea player');return{player:player.actor,follower:this.record('follower')?.actor??null};}
 movement(role:AzaleaActorRole){const record=this.record(role);return record?.movement?structuredClone(record.movement):null;}
 snapshot():AzaleaActorCheckpoint{const take=(record:RecordEntry|null)=>record?{current:copy(record.current),previous:copy(record.previous)}:null;return{player:take(this.record('player')),follower:take(this.record('follower'))};}
 /** Main already restored physical papers and State. Hydrate only these
  * logical records; no source movement/face callback is replayed here. */
 restore(snapshot:AzaleaActorCheckpoint){for(const role of['player','follower']as const){const record=this.record(role),saved=snapshot[role];if(record&&saved){record.current=valid(saved.current);record.previous=valid(saved.previous);record.movement=null;}}}
 reset(){this.player=null;this.follower=null;}
}
