import type {SourceMap,State} from './types.ts';
import type {SourceActionResult} from './script-recovery.ts';
import {advancePhoneMinutes,advancePhoneRingSeconds,boostPhoneTimer,launchIncomingCall,newPhoneRingState,planTriggeredIncomingCall,resetPhoneRing,type PhoneRingState,type PhoneTriggerRules,type TriggeredPhoneCall} from './phone-scheduler.ts';

export type ElmHatchCall=Readonly<{trigger:0;contact:1;scripted:3;script:13;forcePickUp:false}>;
export type PhoneFieldSnapshot=Readonly<{ring:PhoneRingState;rtcAnchor:number}>;
export type PhoneFieldAvailability=
  |{kind:'none'}
  |{kind:'busy'}
  |{kind:'elm';call:ElmHatchCall}
  |{kind:'unsupported';call:TriggeredPhoneCall}
  |{kind:'random-fallback-required'};
type PhoneFieldState=Pick<State,'map'|'phoneTriggers'|'pokegear'>;
type SourceActionExecutor=<T>(action:()=>Promise<T>)=>Promise<SourceActionResult<T>>;

function rtcSeconds(value:number){if(!Number.isSafeInteger(value))throw RangeError('The field phone requires explicit whole RTC seconds');}
function elmCall(call:TriggeredPhoneCall):call is ElmHatchCall{
  return call.trigger===0&&call.contact===1&&call.scripted===3&&call.script===13&&call.forcePickUp===false;
}
function sameCall(left:TriggeredPhoneCall|null,right:TriggeredPhoneCall){
  return left!==null&&left.trigger===right.trigger&&left.contact===right.contact&&left.scripted===right.scripted&&left.script===right.script&&left.forcePickUp===right.forcePickUp;
}

/** Field host for the proven triggered-call path, not the complete native phone
 * engine. The field owns input priority, optional ring UI and an explicit RTC
 * port. Random callers, forced-call presentation and DS-global RNG are absent.
 * Only State.phoneTriggers is persistent; Continue constructs a fresh manager.
 * Include snapshot()/restore() in the OUTER source-action field checkpoint. */
export class FieldPhoneHost{
  private readonly rules:PhoneTriggerRules;
  private ring:PhoneRingState=newPhoneRingState();
  private rtcAnchor:number;
  private answering=false;

  constructor(rules:PhoneTriggerRules,rtcAnchor:number){
    rtcSeconds(rtcAnchor);this.rules=structuredClone(rules);this.rtcAnchor=rtcAnchor;
  }

  snapshot():PhoneFieldSnapshot{return structuredClone({ring:this.ring,rtcAnchor:this.rtcAnchor});}
  /** The answer admission lock belongs to the pending method, not a checkpoint.
   * Restoring during Retry/Return must not unlock a still-pending answer. */
  restore(snapshot:PhoneFieldSnapshot){rtcSeconds(snapshot.rtcAnchor);this.ring=structuredClone(snapshot.ring);this.rtcAnchor=snapshot.rtcAnchor;}

  /** field_time_events.c:55–77 compares against the LAST WHOLE-MINUTE anchor.
   * Subminute ticks do not move it; a whole-minute batch anchors at exact now,
   * discarding its seconds remainder. Backward time updates the anchor and
   * returns BEFORE ring-duration handling. Seconds are processed before minutes.
   * While an answer/recovery prompt owns the source action, defer observations;
   * the next field tick catches elapsed RTC time after its atomic result. */
  advanceRTC(seconds:number){
    rtcSeconds(seconds);if(this.answering)return;
    if(seconds<this.rtcAnchor){this.rtcAnchor=seconds;return;}
    const delta=seconds-this.rtcAnchor;
    if(delta>0)this.ring=advancePhoneRingSeconds(this.ring,seconds,this.rules);
    const minutes=Math.floor(delta/60);
    if(minutes>0){this.ring=advancePhoneMinutes(this.ring,minutes);this.rtcAnchor=seconds;}
  }

  /** Report ONLY a fresh SetPhoneCallTrigger/hatch event after its bit is set.
   * Merely loading saved pending bits must not call this or imply urgency. */
  triggerQueued(id:number,accelerate:boolean){
    if(!this.rules.triggers.some(rule=>rule.id===id))throw RangeError('Unknown native phone trigger '+id);
    this.ring=boostPhoneTimer(this.ring,accelerate,this.rules);
  }

  /** field_system.c:270 / gear_phone_ring_manager.c:238 use ResetIfActive.
   * An inactive freshly accelerated interval must survive ordinary events. */
  resetForSourceEvent(){if(this.ring.active)this.ring=resetPhoneRing(this.ring);}

  /** Render-only observation: no RTC advance, caller RNG or persistent writes. */
  current():PhoneFieldAvailability{return this.answering?{kind:'busy'}:this.ring.active?this.availability(this.ring.active):{kind:'none'};}

  /** Call only after native higher-priority field events. Unsupported tokens
   * remain explicit and unconsumed; no-trigger requests the UNPORTED random
   * fallback rather than claiming that a native polling cycle completed. */
  poll(state:PhoneFieldState,map:Pick<SourceMap,'id'|'fields'>,drawUint16:()=>number):PhoneFieldAvailability{
    if(this.answering)return{kind:'busy'};
    if(state.map!==map.id)throw Error('Field phone map metadata does not match the current source map');
    if(this.ring.active)return this.availability(this.ring.active);
    const plan=planTriggeredIncomingCall(this.ring,state.phoneTriggers??[],this.rules,{map:map.id,incomingAllowed:map.fields.incomingCalls==='TRUE',registeredContacts:state.pokegear?.contacts??[],drawUint16});
    this.ring=plan.ring;
    if(plan.call)return this.availability(plan.call);
    return{kind:plan.delivery==='no-trigger'?'random-fallback-required':'none'};
  }

  private availability(call:TriggeredPhoneCall):PhoneFieldAvailability{
    const copy=Object.freeze({...call});return elmCall(copy)?{kind:'elm',call:copy}:{kind:'unsupported',call:copy};
  }

  /** Pin Elm13 before the root captures its outer action. Launch (bit removal)
   * and all awaited UI share that action; root recovery restores State AND this
   * host snapshot on failure. Explicit Retry replays the same pinned call with
   * no caller reselection. This adapter does not save or compete with rollback.
   * Hold admission until the executor resolves, including its recovery prompt. */
  async answerElm<T>(state:Pick<State,'phoneTriggers'>,execute:SourceActionExecutor,deliver:(call:ElmHatchCall)=>Promise<T>):Promise<SourceActionResult<T>>{
    if(this.answering)throw Error('A field phone answer is already pending');
    const active=this.ring.active;
    if(!active||!elmCall(active))throw Error('Only the native optional Elm hatch call13 can be answered by this host');
    const pinned:ElmHatchCall=Object.freeze({...active});
    this.answering=true;
    try{return await execute(async()=>{
      if(!sameCall(this.ring.active,pinned)||!state.phoneTriggers?.includes(pinned.trigger))throw Error('The pinned Elm hatch call is no longer pending');
      const launch=launchIncomingCall(state,this.ring);this.ring=launch.ring;
      return deliver(pinned);
    });}finally{this.answering=false;}
  }
}
