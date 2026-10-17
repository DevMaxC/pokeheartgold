import type {State} from './types.ts';

export type PhoneTriggerRule={id:number;key:string;contact:number;contactKey:string;map:number;script:number;forcePickUp:boolean};
export type PhoneTriggerRules={callIntervalMinutes:number;maxActiveDurationSeconds:number;triggers:readonly PhoneTriggerRule[]};
export type TriggeredPhoneCall=Readonly<{trigger:number;contact:number;scripted:3;script:number;forcePickUp:boolean}>;
export type RandomPhoneCall=Readonly<{contact:number;scripted:0;script:0;forcePickUp:false;category:0|1|2;candidateCount:number}>;
export type IncomingPhoneCall=TriggeredPhoneCall|RandomPhoneCall;
/** The native ring manager is ephemeral. Only State.phoneTriggers is saved. */
export type PhoneRingState=Readonly<{elapsedMinutes:number;minuteAdvanceSeen:boolean;active:IncomingPhoneCall|null;activeSince:number|null}>;
export const newPhoneRingState=():PhoneRingState=>({elapsedMinutes:0,minuteAdvanceSeen:false,active:null,activeSince:null});
const triggerCount=13; // constants/phone_constants.h:NUM_CALL_TRIGGERS.
function triggerId(id:number){if(!Number.isInteger(id)||id<0||id>=triggerCount)throw RangeError('Invalid native phone trigger '+id);}
function minutes(value:number){if(!Number.isSafeInteger(value)||value<0)throw RangeError('Phone minutes require an explicit nonnegative RTC delta');}

/** SetPhoneCallTrigger's second argument accelerates timing; it NEVER decides
 * whether the persistent bit is set. UnsetPhoneCallTrigger is separate. */
export function setPendingPhoneTrigger(state:Pick<State,'phoneTriggers'>,id:number){triggerId(id);state.phoneTriggers=[...(state.phoneTriggers??[]).filter(value=>value!==id),id];}
export function unsetPendingPhoneTrigger(state:Pick<State,'phoneTriggers'>,id:number){triggerId(id);state.phoneTriggers=(state.phoneTriggers??[]).filter(value=>value!==id);}
export function boostPhoneTimer(ring:PhoneRingState,accelerate:boolean,rules:PhoneTriggerRules):PhoneRingState{
  return accelerate&&ring.elapsedMinutes<rules.callIntervalMinutes-1?{...ring,elapsedMinutes:rules.callIntervalMinutes-1}:ring;
}
/** Explicit port for FieldSystem_HandleMinutesPassed; never derive time from
 * render distance, steps, playSeconds or an implicit Date.now(). */
export function advancePhoneMinutes(ring:PhoneRingState,delta:number):PhoneRingState{
  minutes(delta);
  // Native FieldSystem_CheckTimeAdvance never forwards zero-minute frames.
  if(delta===0)return ring;
  if(!ring.minuteAdvanceSeen&&delta>=10)return{...ring,minuteAdvanceSeen:true};
  return{...ring,minuteAdvanceSeen:true,elapsedMinutes:ring.elapsedMinutes+delta};
}
export function resetPhoneRing(ring:PhoneRingState):PhoneRingState{return{...ring,elapsedMinutes:0,active:null,activeSince:null};}
/** Native HandleTimeAdvance measures ring duration after its first time tick.
 * A missed call resets the manager, leaving persistent pending bits intact. */
export function advancePhoneRingSeconds(ring:PhoneRingState,seconds:number,rules:PhoneTriggerRules):PhoneRingState{
  if(!Number.isSafeInteger(seconds))throw RangeError('Phone ringing requires explicit RTC seconds');
  if(!ring.active)return ring;
  if(ring.activeSince===null)return{...ring,activeSince:seconds};
  const elapsed=seconds-ring.activeSince;
  return elapsed<0||elapsed>rules.maxActiveDurationSeconds||elapsed>59?resetPhoneRing(ring):ring;
}
/** Pending-trigger scheduling only. Random callers, recent-caller rotation and
 * Safari trigger generation remain separate native phone-engine work. The
 * injected draw is the caller's RNG port; no DS-global RNG equivalence claim. */
export function planTriggeredIncomingCall(ring:PhoneRingState,pending:readonly number[],rules:PhoneTriggerRules,field:{map:number;incomingAllowed:boolean;registeredContacts:readonly string[];drawUint16:()=>number}):{ring:PhoneRingState;call:TriggeredPhoneCall|null;delivery:'none'|'no-trigger'|'ring'|'forced'}{
  if(!field.incomingAllowed||ring.active||ring.elapsedMinutes<rules.callIntervalMinutes)return{ring,call:null,delivery:'none'};
  for(const id of pending)triggerId(id);
  // Native scans bit flags from0..12; save-array insertion order is irrelevant.
  const candidates=rules.triggers.filter(rule=>pending.includes(rule.id)&&(rule.contactKey==='PHONE_CONTACT_DAY_C_MAN'?field.registeredContacts.includes(rule.contactKey):rule.map!==field.map)).slice().sort((a,b)=>a.id-b.id);
  if(!candidates.length)return{ring,call:null,delivery:'no-trigger'};
  const draw=field.drawUint16();if(!Number.isInteger(draw)||draw<0||draw>0xffff)throw RangeError('Phone trigger selection requires an unsigned16-bit RNG draw');
  const selected=candidates[draw%candidates.length],call:TriggeredPhoneCall={trigger:selected.id,contact:selected.contact,scripted:3,script:selected.script,forcePickUp:selected.forcePickUp};
  return{ring:{...ring,active:call,activeSince:null},call,delivery:call.forcePickUp?'forced':'ring'};
}
/** FieldSystem_InitPokegearArgs clears a triggered bit when the player opens
 * the incoming call, not when it starts ringing or times out. The host must
 * wrap this mutation and awaited call UI in one source recovery action. */
export function launchIncomingCall(state:Pick<State,'phoneTriggers'>,ring:PhoneRingState){
  if(!ring.active)throw Error('No native incoming call is ringing');
  if(ring.active.scripted!==3)throw Error('Original random incoming phone delivery is unported');
  const call={...ring.active};unsetPendingPhoneTrigger(state,call.trigger);return{ring:resetPhoneRing(ring),call};
}
