import type {GameData,NPC,State,ObjectEventSave} from './types.ts';

export type FieldObject=NPC&{shown:boolean|undefined;step:number;resolvedSprite:string;visible:boolean;directionLocked:boolean;invisible:boolean};

/** Original object-event state exists independently of its displayed sprite. */
export class FieldObjects{
  readonly objects=new Map<string,FieldObject>();
  readonly data:Pick<GameData,'constants'|'sprites'>;readonly state:State;
  private spriteNames=new Map<number,string>();
  constructor(data:Pick<GameData,'constants'|'sprites'>,state:State){this.data=data;this.state=state;for(const name of Object.keys(data.sprites)){const id=data.constants[name];if(!this.spriteNames.has(id))this.spriteNames.set(id,name);}}
  load(events:NPC[]){this.objects.clear();for(const npc of events)this.objects.set(npc.id,{...npc,shown:undefined,step:-1,resolvedSprite:'',visible:false,directionLocked:false,invisible:false});}
  get(id:string){return this.objects.get(id);}
  save(map:number):ObjectEventSave{return{map,actors:[...this.objects.values()].map(n=>({id:n.id,x:n.x,z:n.z,facing:n.facingDirection,movement:n.movement,shown:n.shown,invisible:n.invisible,directionLocked:n.directionLocked}))};}
  restore(map:number,saved?:ObjectEventSave){if(saved?.map!==map)return;for(const row of saved.actors){const actor=this.get(row.id);if(!actor||!Number.isFinite(row.x)||!Number.isFinite(row.z))continue;actor.x=row.x;actor.z=row.z;actor.facingDirection=row.facing;if(Number.isInteger(row.movement)&&row.movement!>=0)actor.movement=row.movement!;actor.shown=row.shown;actor.invisible=row.invisible;actor.directionLocked=row.directionLocked;}}
  position(id:string,x:number,z:number,facing?:number){const npc=this.get(id);if(!npc)throw Error(`Missing original object ${id}`);npc.x=x;npc.z=z;if(facing!==undefined)npc.facingDirection=facing;}
  movement(id:string,next?:number){const npc=this.get(id);if(!npc)throw Error(`Missing original object ${id}`);if(next!==undefined){npc.movement=next;if(next>=14&&next<=17)npc.facingDirection=next-14;}return npc.movement;}
  facing(id:string){const npc=this.get(id);if(!npc)throw Error(`Missing original object ${id}`);return npc.facingDirection;}
  show(id:string,visible:boolean){const npc=this.get(id);if(!npc)throw Error(`Missing original object ${id}`);npc.shown=visible;}
  snapshot(){return [...this.objects.values()].map(npc=>{
    let sprite=npc.spriteId;const variable=sprite.match(/^SPRITE_VAR_(\d+)$/);
    if(variable){const key='VAR_OBJ_'+(Number(variable[1])-1),id=this.data.constants[key],value=(id===undefined?undefined:this.state.vars['#'+id])??this.state.vars[key];sprite=this.spriteNames.get(value)||sprite;}
    npc.resolvedSprite=sprite;npc.visible=!npc.invisible&&(npc.shown??(npc.eventFlag==='FLAG_NOTHING'||!this.state.flags[npc.eventFlag]));return npc;
  });}
}
