import type {NativeDraw16} from './battle-volatiles.ts';

export type NativeObedienceContext={
  level:number;badges:readonly number[];playerOT:boolean;
  linkOrFrontier:boolean;opponentSide:boolean;aiPartner:boolean;canSelectAction:boolean;bideChargeHit:boolean;
  move:number;moveSlot:number;status:number;status2:number;ability:number;uproar:boolean;
  /** StruggleCheck with all flags. The selected slot is excluded here, not by the caller. */
  blockedMoves:()=>number;
};
export type NativeObedienceResult={outcome:'obey'|'asleep'|'nothing'|'other-move'|'nap'|'self-hit';status2:number;returnCode:0|1|2|3;slot?:number};
function integer(n:number,min:number,max:number,label:string){if(!Number.isInteger(n)||n<min||n>max)throw RangeError('Invalid native obedience '+label);return n;}

/** TryDisobedience, battle_controller_player.c. RNG is the local native u16
 * draw tape; this does not claim that the browser shares the cartridge LCG.
 * Damage, target selection and subscripts belong to the battle controller. */
export function nativeObedience(c:NativeObedienceContext,rng:NativeDraw16):NativeObedienceResult{
  integer(c.level,1,100,'level');integer(c.move,0,467,'move');integer(c.moveSlot,0,3,'move slot');
  integer(c.status,0,0xffffffff,'status');integer(c.status2,0,0xffffffff,'status2');integer(c.ability,0,123,'ability');
  if(!Array.isArray(c.badges)||c.badges.length>16||new Set(c.badges).size!==c.badges.length)throw RangeError('Invalid native obedience badges');
  for(const badge of c.badges)integer(badge,0,15,'badge');
  for(const key of['playerOT','linkOrFrontier','opponentSide','aiPartner','canSelectAction','bideChargeHit','uproar'] as const)if(typeof c[key]!=='boolean')throw TypeError('Invalid native obedience '+key);
  const result=(outcome:NativeObedienceResult['outcome'],returnCode:NativeObedienceResult['returnCode'],status2=c.status2,slot?:number):NativeObedienceResult=>slot===undefined?{outcome,returnCode,status2}:{outcome,returnCode,status2,slot};
  if(c.linkOrFrontier||c.opponentSide||c.aiPartner||c.playerOT||!c.canSelectAction||c.move===117&&c.bideChargeHit||c.badges.length>=8)return result('obey',0);
  let threshold=10;if(c.badges.length>=1)threshold=20;if(c.badges.length>=2)threshold=30;if(c.badges.includes(3))threshold=50;if(c.badges.includes(5))threshold=70;
  if(c.level<=threshold)return result('obey',0);
  const draw=()=>integer(rng(),0,65535,'u16 RNG result');
  const scaled=()=>((draw()&255)*(c.level+threshold))>>8;
  if(scaled()<threshold)return result('obey',0);
  const status2=c.move===99?(c.status2&~0x00800000)>>>0:c.status2;
  if((c.status&7)&&(c.move===173||c.move===214))return result('asleep',1,status2);
  if(scaled()<threshold){
    const blocked=integer(c.blockedMoves(),0,15,'blocked move mask')|(1<<c.moveSlot);
    if(blocked===15)return result('nothing',1,status2);
    let slot:number;do{slot=draw()&3;}while(blocked&(1<<slot));
    return result('other-move',2,status2,slot);
  }
  const delta=c.level-threshold;let random=draw()&255;
  if(random<delta&&!(c.status&0xff)&&c.ability!==72&&c.ability!==15&&!c.uproar)return result('nap',1,status2);
  random-=delta;
  if(random<delta)return result('self-hit',3,status2);
  return result('nothing',1,status2);
}

/** DisobeyNothing0255 Random3,0: four messages, consuming one native draw. */
export function nativeDisobedienceMessage(rng:NativeDraw16){return integer(rng(),0,65535,'u16 RNG result')%4;}
