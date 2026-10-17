import type {State} from './types.ts';
import {resetPhoneRing,type PhoneRingState,type PhoneTriggerRules,type RandomPhoneCall} from './phone-scheduler.ts';

export type RandomPhoneBookEntry=Readonly<{id:number;key:string;type:number;group:number;map:number}>;
export type PhoneAdmissionRules=PhoneTriggerRules&{
  randomCallChance:number;randomCallers:readonly RandomPhoneBookEntry[];
  recentCallerChunks:readonly Readonly<{offset:number;length:number}>[];
  randomRestrictions:Readonly<{buenaContact:number;nationalParkMap:number;rocketTakeoverVar:number;bugContestFlag:number}>;
};
type PhoneRandomState=Pick<State,'pokegear'|'phoneRecentCallers'|'flags'|'vars'>;
export type PhoneRandomPorts={map:number;rtcHour:number;drawLCUint16:()=>number;drawMTUint32:()=>number};
const randomTypes=new Set([0,12,11,10,14]);
function draw(port:()=>number,max:number,label:string){const value=port();if(!Number.isInteger(value)||value<0||value>max)throw RangeError('Phone '+label+' requires an explicit unsigned '+(max===0xffff?'16':'32')+'-bit draw');return value;}
function recentBytes(state:PhoneRandomState,rules:PhoneAdmissionRules){
  const bytes=state.phoneRecentCallers??Array<number>(8).fill(255);
  if(bytes.length!==8||bytes.some(id=>!Number.isInteger(id)||id!==255&&!rules.randomCallers.some(row=>row.id===id)))throw Error('Invalid native eight-byte phone caller history');
  return bytes;
}

/** Native overlay_2_gear_phone.c:130–233, including the RANDOM CATEGORY (not
 * the current time of day). The injected LC/MT ports preserve draw ordering and
 * modulo operations; this is not a DS-global RNG implementation.
 *
 * This may clear a persistent recent-caller chunk before filtering. The field
 * must run due admission inside its OUTER source transaction/save gate. Native
 * history ADD happens only on answering a random call (gear_phone_ring_manager
 * .c:81–82); unported random dialogue is never launched or added here. */
export function planRandomIncomingCall(state:PhoneRandomState,ring:PhoneRingState,rules:PhoneAdmissionRules,ports:PhoneRandomPorts):{ring:PhoneRingState;call:RandomPhoneCall|null;outcome:'blocked'|'chance-rejected'|'no-candidates'|'no-callers'|'ring'}{
  if(ring.active||ring.elapsedMinutes<rules.callIntervalMinutes)return{ring,call:null,outcome:'blocked'};
  if(!Number.isInteger(ports.rtcHour)||ports.rtcHour<0||ports.rtcHour>23)throw RangeError('Phone admission requires the explicit native RTC anchor hour');
  if(draw(ports.drawMTUint32,0xffffffff,'MT')%100>rules.randomCallChance)return{ring:resetPhoneRing(ring),call:null,outcome:'chance-rejected'};
  const categoryDraw=draw(ports.drawLCUint16,0xffff,'LC')%1000,category:0|1|2=categoryDraw<500?0:categoryDraw<800?1:2;
  const contacts=(state.pokegear?.contacts??[]).map(key=>{
    const entry=rules.randomCallers.find(row=>row.key===key);if(!entry)throw Error('Unknown original registered phone contact '+key);return entry;
  });
  const candidates=contacts.filter(entry=>entry.group===category&&randomTypes.has(entry.type));
  if(!candidates.length)return{ring:resetPhoneRing(ring),call:null,outcome:'no-candidates'};
  const chunk=rules.recentCallerChunks[category],history=recentBytes(state,rules);
  // Count scans the ENTIRE native chunk, while Contains stops at its first255.
  const count=history.slice(chunk.offset,chunk.offset+chunk.length).filter(id=>id!==255).length;
  if(count===candidates.length){const bytes=[...history];bytes.fill(255,chunk.offset,chunk.offset+chunk.length);state.phoneRecentCallers=bytes;}
  const bytes=state.phoneRecentCallers??history;
  const contains=(id:number)=>{for(let i=chunk.offset;i<chunk.offset+chunk.length;i++){if(bytes[i]===255)break;if(bytes[i]===id)return true;}return false;};
  const restrictions=rules.randomRestrictions;
  const takeover=state.vars['#'+restrictions.rocketTakeoverVar]??state.vars.VAR_SCENE_ROCKET_TAKEOVER??0;
  const contest=state.flags.FLAG_UNK_996??state.flags['#'+restrictions.bugContestFlag]??false;
  const callers=candidates.filter(entry=>entry.map!==ports.map&&!contains(entry.id)
    &&!(entry.id===restrictions.buenaContact&&(ports.rtcHour%3===2||takeover>=2&&takeover<=4))
    &&!(entry.map===restrictions.nationalParkMap&&contest));
  if(!callers.length)return{ring:resetPhoneRing(ring),call:null,outcome:'no-callers'};
  const index=Math.floor((draw(ports.drawMTUint32,0xffffffff,'MT')%(callers.length*100))/100),selected=callers[index];
  const call:RandomPhoneCall={contact:selected.id,scripted:0,script:0,forcePickUp:false,category,candidateCount:candidates.length};
  return{ring:{...ring,active:call,activeSince:null},call,outcome:'ring'};
}
