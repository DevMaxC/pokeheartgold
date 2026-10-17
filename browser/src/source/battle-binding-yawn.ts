import {nativeStatus2,type NativeDraw16} from './battle-volatiles.ts';
function integer(value:number,min:number,max:number,label:string){if(!Number.isInteger(value)||value<min||value>max)throw RangeError(`Invalid native ${label}`);return value;}
function status(value:number){return integer(value,0,0xffffffff,'status2');}
/** BindStart0058: admission (hit, live target, no Substitute) belongs to the
 * host. A duplicate does not refresh or draw. GripClaw overrides AFTER Random. */
export function nativeBindingStart(value:number,rng:NativeDraw16,gripClaw:boolean){
  status(value);if(value&nativeStatus2.bind)return{status2:value,applied:false};
  const raw=integer(rng(),0,65535,'u16 RNG result'),turns=gripClaw?6:raw%4+3;
  return{status2:(value|(turns<<13))>>>0,applied:true};
}
/** UMC_BINDING decrements before calling0059/0060. The activation turn counts;
 * count1 expires without damage. MagicGuard suppresses0059, not the counter. */
export function nativeBindingTick(value:number,hp:number,maxHP:number,magicGuard:boolean){
  status(value);integer(maxHP,1,65535,'maximum HP');integer(hp,0,maxHP,'HP');
  if(!(value&nativeStatus2.bind)||!hp)return{status2:value,outcome:'none' as const,damage:0};
  const next=value-(1<<13);return{status2:next,outcome:next&nativeStatus2.bind?'bound' as const:'ended' as const,damage:!(next&nativeStatus2.bind)||magicGuard?0:Math.max(1,Math.floor(maxHP/16))};
}
/** CantEscape and BattlerCanSwitch share Bind/MeanLook but not their bypasses.
 * GenIV Ghost types have no special exemption. This is not ability trapping. */
export function nativeBindingBlocks(value:number,action:'switch'|'escape',context:{shedShell:boolean;smokeBall:boolean;runAway:boolean;noExperienceBattle:boolean}){
  status(value);return!!(value&(nativeStatus2.bind|nativeStatus2.meanLook))&&!(action==='switch'?context.shedShell:context.smokeBall||context.runAway||context.noExperienceBattle);
}
