import {calculateStats,speciesName} from './data.ts';
import {nativeMonGender} from './gender.ts';
import {addSpecialGameStat,gameStat,gameStatMaximum} from './game-stats.ts';
import {NATIVE_EVOLUTION_METHOD} from './evolution-native.ts';
import type {GameData,Mon,State} from './types.ts';
import type {BattleEvolutionCompletion,BattleEvolutionScenePort,EvolutionLearningEvent,EvolutionMonSnapshot,EvolutionMoveChoice,EvolutionMoveRequest} from './battle-evolution-types.ts';

export class UnsupportedBattleEvolution extends Error{}
export type NativeEvolutionSelection=
 |{kind:'eligible';target:number;method:number;methodKey:string;param:number}
 |{kind:'ineligible';reason?:string}
 |{kind:'unsupported';reason:string;requirements?:readonly string[]};
export type NativeEvolutionMetadata={form:number;hasNickname:boolean};
export type BattleEvolutionPorts={
 select:(party:readonly Mon[],mon:Mon,index:number)=>NativeEvolutionSelection;
 /** Actual native metadata, including an explicit legacy-save adapter if needed. */
 metadata:(mon:Mon,index:number)=>NativeEvolutionMetadata;
 present:BattleEvolutionScenePort;
 moveLearning:{
  /** Final confirmed native choice; Back alone is not a confirmed decline. */
  choose:(request:EvolutionMoveRequest,signal:AbortSignal)=>Promise<EvolutionMoveChoice>;
  show:(event:EvolutionLearningEvent,signal:AbortSignal)=>Promise<void>;
  isHM:(move:number)=>boolean;
 };
};
export type BattleEvolutionSummary={evolved:number[];cancelled:number[];ineligible:number[]};

function integer(value:number,min:number,max:number,name:string){if(!Number.isInteger(value)||value<min||value>max)throw new UnsupportedBattleEvolution('Invalid native evolution '+name);return value;}
function freezeSnapshot(mon:Mon):EvolutionMonSnapshot{
 const snapshot=structuredClone(mon);
 const freeze=(value:unknown):void=>{if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value);}};
 freeze(snapshot);return snapshot;
}

/**
 * Ordinary form0 EVO_LEVEL only. Other eligible methods require their own
 * source side effects; the predicate may describe them but cannot admit them
 * through this transition. Form, nickname and held data are never guessed.
 */
export function ordinaryLevelEvolution(data:GameData,mon:Mon,target:number,metadata:NativeEvolutionMetadata):Mon{
 integer(target,1,493,'target');integer(metadata.form,0,31,'form');
 if(metadata.form!==0||(mon.form!==undefined&&mon.form!==metadata.form))throw new UnsupportedBattleEvolution('Unsupported native evolution form transition');
 if(typeof metadata.hasNickname!=='boolean'||(mon.hasNickname!==undefined&&mon.hasNickname!==metadata.hasNickname))throw new UnsupportedBattleEvolution('Missing or inconsistent native nickname flag');
 if(mon.isEgg||mon.checksumFailed)throw new UnsupportedBattleEvolution('Egg cannot own a legal battle level-up bit');
 integer(mon.personality,0,0xffffffff,'personality');integer(mon.exp,0,0xffffffff,'experience');
 const base=data.personal[target],source=data.personal[mon.species];
 if(!base||!source||!Array.isArray(base.abilities)||!base.abilities[0])throw new UnsupportedBattleEvolution('Missing native target personal data');
 const growth=data.growth[base.growthRate];if(!growth||growth.length<101)throw new UnsupportedBattleEvolution('Missing native target growth table');
 let level=1;while(level<100&&mon.exp>=growth[level+1])level++;
 const calculated=calculateStats(base,level,mon.ivs,mon.evs,mon.nature);
 // CalcMonStats retains a faint, caps a shrinking maximum, otherwise adds
 // the maximum-HP difference. It does not heal status or restore any PP.
 const hp=mon.hp===0?0:calculated.maxHP<mon.maxHP?Math.min(mon.hp,calculated.maxHP):mon.hp+calculated.maxHP-mon.maxHP;
 return {...structuredClone(mon),species:target,level,...calculated,hp,gender:nativeMonGender(base.genderRatio,mon.personality),hasNickname:metadata.hasNickname};
}

type MonCheckpoint={mon:Mon;value:Mon;stats:Mon['stats'];moves:Mon['moves'];moveRefs:Mon['moves'];ivs:number[];evs:number[]};
function checkpoint(mon:Mon):MonCheckpoint{return{mon,value:structuredClone(mon),stats:mon.stats,moves:mon.moves,moveRefs:[...mon.moves],ivs:mon.ivs,evs:mon.evs};}
function restoreMon(saved:MonCheckpoint){
 const {mon,value}=saved;
 // These are the only fields changed by this controller. Existing identity,
 // provenance and arbitrary save extensions remain the original references.
 for(const key of ['species','level','hp','maxHP','gender','name','hasNickname']as const){
  if(Object.hasOwn(value,key))Object.assign(mon,{[key]:value[key]});else Reflect.deleteProperty(mon,key);
 }
 Object.assign(saved.stats,value.stats);mon.stats=saved.stats;
 for(let i=0;i<saved.moveRefs.length;i++)Object.assign(saved.moveRefs[i],value.moves[i]);
 saved.moves.splice(0,saved.moves.length,...saved.moveRefs);mon.moves=saved.moves;
 saved.ivs.splice(0,saved.ivs.length,...value.ivs);mon.ivs=saved.ivs;
 saved.evs.splice(0,saved.evs.length,...value.evs);mon.evs=saved.evs;
}

/**
 * BattleSystem_CheckEvolution consumes the lowest levelUpFlag bit before
 * querying its mon, once per slot, after a WIN/CAUGHT/PLAYER_FLED result.
 * The completion record is non-destructive. A failed browser scene restores
 * this drain's pending mask and provisional transitions before rethrowing to
 * the field's SourceActionRecovery owner. A native B-cancel consumes the bit.
 */
export class BattleEvolutionQueue{
 private consumed=new WeakMap<BattleEvolutionCompletion,number>();
 private running=false;private generation=0;
 pending(completion:BattleEvolutionCompletion){return completion.levelUpMask&~(this.consumed.get(completion)??0);}
 async run(data:GameData,state:State,completion:BattleEvolutionCompletion,ports:BattleEvolutionPorts,signal?:AbortSignal):Promise<BattleEvolutionSummary>{
  if(this.running)throw Error('A native evolution batch already owns the field');
  integer(completion.levelUpMask,0,63,'six-slot level-up mask');
  if(state.party.length>6||new Set(state.party).size!==state.party.length)throw new UnsupportedBattleEvolution('Invalid native party slots');
  const identity=()=>{if(state.party.length!==completion.party.length||state.party.some((mon,index)=>mon!==completion.party[index]))throw Error('Native evolution party identity changed');};identity();
  if(completion.levelUpMask>>state.party.length)throw new UnsupportedBattleEvolution('Native level-up bit has no party mon');
  const summary:BattleEvolutionSummary={evolved:[],cancelled:[],ineligible:[]};
  if(!['won','caught','ran'].includes(completion.result)){this.consumed.set(completion,completion.levelUpMask);return summary;}
  signal?.throwIfAborted();
  const consumed=this.consumed.get(completion)??0,partyRef=state.party,monCheckpoints=state.party.map(checkpoint),seenRef=state.seen,caughtRef=state.caught,seen=[...state.seen],caught=[...state.caught],statsRef=state.gameStats,stats=structuredClone(state.gameStats);
  const generation=++this.generation;this.running=true;
  try{
   for(let index=0;index<6;index++){
    const bit=1<<index;if(!(this.pending(completion)&bit))continue;
    signal?.throwIfAborted();identity();
    this.consumed.set(completion,(this.consumed.get(completion)??0)|bit);
    const mon=state.party[index],selection=ports.select(state.party,mon,index);
    if(selection.kind==='unsupported')throw new UnsupportedBattleEvolution(selection.reason);
    if(selection.kind==='ineligible'){summary.ineligible.push(index);continue;}
    // include/constants/pokemon.h:EvoMethod. No other method's consumption,
    // companion creation, form or item behavior is approximated here.
    if(selection.method!==NATIVE_EVOLUTION_METHOD.EVO_LEVEL||selection.methodKey!=='EVO_LEVEL')throw new UnsupportedBattleEvolution('Unsupported native evolution transition '+selection.methodKey);
    const metadata=ports.metadata(mon,index),preview=ordinaryLevelEvolution(data,mon,selection.target,metadata),before=freezeSnapshot(mon),after=freezeSnapshot(preview);
    const controller=new AbortController(),abort=()=>controller.abort(signal?.reason);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    let active=true;const sceneState:{phase:'ready'|'evolved'|'registered'|'learning'|'learned'|'finished'}={phase:'ready'};
    const tasks:Promise<void>[]=[];
    const current=()=>{controller.signal.throwIfAborted();if(!active||generation!==this.generation)throw Error('Stale native evolution callback');identity();};
    const requirePhase=(expected:typeof sceneState.phase)=>{current();if(sceneState.phase!==expected)throw Error('Native evolution callback order '+sceneState.phase+'; expected '+expected);};
    const show=async(event:EvolutionLearningEvent)=>{current();await ports.moveLearning.show(event,controller.signal);current();};
    const learn=async()=>{
     for(const row of data.learnsets[mon.species]??[]){
      current();if(row.level!==mon.level||mon.moves.some(move=>move.id===row.move))continue;
      const move=data.moves[row.move];if(!move||!move.id||!Number.isInteger(move.pp))throw new UnsupportedBattleEvolution('Missing native evolution move data');
      if(mon.moves.length<4){mon.moves.push({id:move.id,pp:move.pp,maxPP:move.pp});await show({kind:'learned',mon:freezeSnapshot(mon),move:move.id,replaced:null});continue;}
      const request:EvolutionMoveRequest={mon:freezeSnapshot(mon),move:move.id,existing:freezeSnapshot(mon).moves,unforgettablyHM:Object.freeze(mon.moves.map(row=>ports.moveLearning.isHM(row.id)))};
      const choice=await ports.moveLearning.choose(request,controller.signal);current();
      if(choice.kind==='decline'){await show({kind:'declined',mon:freezeSnapshot(mon),move:move.id});continue;}
      integer(choice.slot,0,3,'move slot');if(request.unforgettablyHM[choice.slot])throw Error('Native evolution summary cannot forget an HM');
      const forgotten=mon.moves[choice.slot].id;await show({kind:'forget',mon:freezeSnapshot(mon),move:move.id,forgotten});
      current();mon.moves[choice.slot]={id:move.id,pp:move.pp,maxPP:move.pp};await show({kind:'learned',mon:freezeSnapshot(mon),move:move.id,replaced:forgotten});
     }
    };
    try{
     const outcome=await ports.present({flags:3,partyIndex:index,before,after,method:selection.method,methodKey:selection.methodKey,param:selection.param},{
      evolve:()=>{requirePhase('ready');mon.species=preview.species;mon.level=preview.level;mon.hp=preview.hp;mon.maxHP=preview.maxHP;mon.gender=preview.gender;mon.hasNickname=metadata.hasNickname;Object.assign(mon.stats,preview.stats);sceneState.phase='evolved';return{nickname:before.name,speciesName:speciesName(data,mon.species)};},
      register:()=>{requirePhase('evolved');if(!state.seen.includes(mon.species))state.seen.push(mon.species);if(!state.caught.includes(mon.species))state.caught.push(mon.species);const counter=data.constants.GAME_STAT_UNIQUE_MONS_CAUGHT,event=data.constants.SCORE_EVENT_REGISTER_SPECIES_CAUGHT;state.gameStats??={};state.gameStats[counter]=Math.min(gameStatMaximum(counter),gameStat(state,counter)+1);addSpecialGameStat(state,event);if(!metadata.hasNickname)mon.name=speciesName(data,mon.species);sceneState.phase='registered';},
      learnMoves:()=>{requirePhase('registered');sceneState.phase='learning';const task=learn().then(()=>{current();sceneState.phase='learned';});tasks.push(task);void task.catch(()=>{});return task;},
      finish:()=>{requirePhase('learned');sceneState.phase='finished';},
     },controller.signal);
     current();
     if(outcome==='cancelled'){if(sceneState.phase!=='ready')throw Error('Native evolution cancelled after committing');summary.cancelled.push(index);}
     else if(outcome==='evolved'){if(sceneState.phase!=='finished')throw Error('Native evolution returned before completion');summary.evolved.push(index);}
     else throw Error('Invalid native evolution scene result');
    }finally{
     active=false;controller.abort(new DOMException('Native evolution scene ended','AbortError'));signal?.removeEventListener('abort',abort);await Promise.allSettled(tasks);
    }
   }
   return summary;
  }catch(error){
   // A view/port failure is not native B. Drain owned asynchronous work first
   // (above), then restore every provisional transition in this batch.
   for(const saved of monCheckpoints)restoreMon(saved);partyRef.splice(0,partyRef.length,...monCheckpoints.map(saved=>saved.mon));state.party=partyRef;
   seenRef.splice(0,seenRef.length,...seen);state.seen=seenRef;caughtRef.splice(0,caughtRef.length,...caught);state.caught=caughtRef;
   if(statsRef){for(const key of Object.keys(statsRef))delete statsRef[Number(key)];Object.assign(statsRef,stats);state.gameStats=statsRef;}else delete state.gameStats;
   this.consumed.set(completion,consumed);throw error;
  }finally{this.running=false;}
 }
}
