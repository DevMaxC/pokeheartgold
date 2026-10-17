import type {NativeNicknameInputCode} from './mon-nickname.ts';
import {ensureMysteryGiftSave,nextMysteryGift,type MysteryGiftSave} from './mystery-gifts.ts';
import {isTMHMItem,tmhmMove} from './tmhm.ts';
import {speciesName,titleCase,healParty,moveName} from './data.ts';
import type {GameData,SourceMap,State} from './types.ts';
import {sourceJSON} from './types.ts';
import {hasBagSpace,addBagItem,takeBagItem} from './bag.ts';
import {phoneCall} from './phone.ts';
import {setPendingPhoneTrigger,unsetPendingPhoneTrigger} from './phone-scheduler.ts';
import {originalSpawn} from './spawns.ts';
import {timeOfDay,trainerCardStars} from './field-services.ts';
import {mapWeather} from './atmosphere.ts';
import {addSpecialGameStat,giveBadge,countBadges} from './game-stats.ts';
import {kurtApricornQuantity,totalApricornCount,kurtBall,clearKurtApricorn} from './apricorn-box.ts';
import {giveTogepiEgg,isOriginalTogepiGift,isUsableBattler,partyMonSpecies,type EggContext} from './eggs.ts';
import {TRAINER_APPROACH_SCRIPT,trainerIdForScript,trainerDefeated,setTrainerDefeated,trainerContacts,phoneContactKey,phoneRematchTrainer,type TrainerContact} from './trainer-script-state.ts';
import {getPartySlotWithMove,monHasMove,loadNativeFieldMoveData,resolveTeachingPersonalIndex} from './field-moves.ts';
import {peekMomGift,hasMomGift,popMomGift} from './mom-gifts.ts';
import type {MomGift} from './mom-savings.ts';

export type EngagedTrainer={trainer:number;object:string};
/** Supplied by the field's sight detector, never inferred by the script VM. */
export type TrainerApproachContext={eyeType:0|1|2;trainers:EngagedTrainer[]};
import {SCRIPT_CAMERA_PERSON,SCRIPT_CAMERA_ACTOR} from './script-camera.ts';

/** Every asynchronous port must stop its own actor/effect writes and settle
 * when signal aborts. startEffect starts now; its Promise means finished and
 * resources released, not merely scheduled. The VM owns doneVar and draining. */
export type ScriptFieldMoveContext={map:SourceMap;object:string;signal:AbortSignal};
export type ScriptGymContext={map:SourceMap;signal:AbortSignal};
export type ScriptAzaleaGymPorts={init:(context:ScriptGymContext)=>void|Promise<void>;spinarak:(station:number,context:ScriptGymContext)=>Promise<void>;switch:(index:number,context:ScriptGymContext)=>Promise<void>};
export type ScriptFieldMovePorts={
 cutIn:(partyIndex:number,context:ScriptFieldMoveContext)=>Promise<void>;
 startEffect:(kind:0|3,context:ScriptFieldMoveContext)=>Promise<void>;
 /** Ends at native TaskManager child completion; parent resumes that tick. */
 swapPlayerFollower:(mode:1|2,context:ScriptFieldMoveContext)=>Promise<void>;
 /** Same native task boundary. Diglett/Dugtrio skip creates no child: the port
  * still waits one dispatch tick, matching the TRUE-returning command. */
 jumpFollower:(count:number,context:ScriptFieldMoveContext)=>Promise<void>;
 resetFollowerMovement:(context:ScriptFieldMoveContext)=>Promise<void>;
 addFollowerMood:(signedDelta:number)=>void;
 followerVisibleFlag:()=>boolean;
 /** ScrCmd_PlayCry's second variable is the native playback pattern, not form. */
 cry:(species:number,pattern:number,context:ScriptFieldMoveContext)=>Promise<void>;
 waitFrames?:(frames:number,context:ScriptFieldMoveContext)=>Promise<void>;
};
export type ScriptHooks={
  eggContext?:EggContext;
  eggHatchAnim?:()=>Promise<void>;
  phoneTrigger?:(id:number,accelerate:boolean)=>void;
  message:(text:string)=>Promise<void>;choice:(text?:string)=>Promise<number>;
  move:(object:string,label:string,map:SourceMap)=>Promise<void>;position:(object:string,x:number,z:number,facing?:number)=>void;
  face:(object:string,facing?:number)=>void;visible:(object:string,value:boolean)=>void;
  chooseStarter:()=>Promise<void>;nickname:(index:number)=>Promise<NativeNicknameInputCode>;refresh:()=>Promise<void>;
  battle:(trainer:number,options?:{second:number;canLose:boolean;suppressFollower:boolean})=>Promise<boolean>;warp:(map:number,x:number,z:number,facing?:number)=>Promise<void>;
  coordinates?:(object:string)=>{x:number;z:number};nameRival?:()=>Promise<string>;whiteOut?:()=>Promise<void>;
  catchingTutorial?:()=>Promise<void>;objectName?:(id:number)=>string|undefined;healAnimation?:(count:number)=>Promise<void>;followerVisible?:(visible:boolean)=>void;
  weather?:(value?:number)=>number;
  objectMovement?:(object:string,next?:number)=>number;objectFacing?:(object:string)=>number;
  encounterMusic?:(trainer:number)=>Promise<void>|void;followerActive?:()=>boolean;
  trainerPath?:(index:number,trainer:EngagedTrainer)=>Promise<void>;trainerStep?:(index:number,trainer:EngagedTrainer)=>Promise<boolean>;
  trainerCandle?:(action:'bind'|'unbind'|'extinguish',useLastInteracted:boolean)=>Promise<void>|void;
  violetGym?:{init:()=>void|Promise<void>;elevator:()=>Promise<void>};
  azaleaGym?:ScriptAzaleaGymPorts;
  cameraTarget?:(target:{map:SourceMap;x:number;z:number}|null)=>void;
  fieldMoves?:ScriptFieldMovePorts;
};
export class UnsupportedScript extends Error{
  readonly map:string;readonly command:string;readonly pc:number;
  constructor(map:string,command:string,pc:number){super(`Unported source command ${command} at ${map}:${pc}`);this.map=map;this.command=command;this.pc=pc;}
}
// Only presentation commands may be ignored. Unknown gameplay commands stop explicitly.
const presentation=new Set(['Nop','Dummy','DebugWatch','ResetBGM','UnlockDir','WaitButtonOrDpad','StopSE','LeaveOverworld','DoorAnimationLoad','DoorAnimationOpen','DoorAnimationClose','DoorAnimationWait','DoorAnimationUnload','LockAll','ReleaseAll','Lock','Release','LockDir','PlaySE','WaitSE','PlayFanfare','WaitFanfare','PlayCry','WaitCry','CloseMsg','WaitButton','FadeScreen','WaitFade','FollowMonResetMovement','TouchscreenMenuHide','TouchscreenMenuShow','FollowingPokemonMovement','WaitFollowingPokemonMovement','ToggleFollowingPokemonMovement','FollowMonSetPositionNextToPlayer','FollowMonSpawnReleaseBall','PlaceStarterBallsInElmsLab','SetFollowingPokemonActive','RestoreOverworld','DrawPokemonPreview','HidePokemonPreview','ShowMoneyBox','HideMoneyBox','FadeOutBGM','PlayBGM','StopBGM','SetBGM','WaitABPress','SetWindow','ScrCmd_609']);
const standardCache=new Map<string,Promise<SourceMap>>();
export class ScriptVM{
  busy=false;lastUnsupported:{map:string;command:string;pc:number}|null=null;
  readonly supported=new Set<string>();
  private instruction:{map:string;command:string;pc:number}|null=null;private child:ScriptVM|null=null;
  get current():{map:string;command:string;pc:number}|null{return this.child?.current??this.instruction;}
  buffers:Record<number,string>={};
  private battleWon=false;
  private pendingPhone:[number,number,number]|null=null;
  private mysteryGiftSession:{save:MysteryGiftSave|null}={save:null};
  private momGiftDelivery:{gift:MomGift;given:boolean}|null=null;
  private context:{activeScript:number;map:SourceMap;object:string;phone:TrainerContact|null;approach?:TrainerApproachContext}|null=null;
  private runAbort:AbortController|null=null;private runGeneration=0;private inheritedSignal:AbortSignal|undefined;private standardID:number|null=null;private fieldMoveOrigin:number|null=null;
  /** The host cancels before an external map replacement/recovery. A failed
   * run also aborts itself and drains ports before SourceActionRecovery sees it. */
  cancel(reason:unknown=new DOMException('Source script was cancelled','AbortError')){if(this.runAbort&&!this.runAbort.signal.aborted){this.runGeneration++;this.runAbort.abort(reason);}this.child?.cancel(reason);}
  readonly data:GameData;readonly state:State;readonly hooks:ScriptHooks;
  constructor(data:GameData,state:State,hooks:ScriptHooks){this.data=data;this.state=state;this.hooks=hooks;}
  value(token:string,map:SourceMap):number{
    token=token.trim();if(token.includes('+'))return token.split('+').reduce((n,t)=>n+this.value(t,map),0);
    if(token==='TRUE')return 1;if(token==='FALSE')return 0;
    const trainer=token.match(/^std_trainer(_2)?\((\w+)\)$/);if(trainer)return this.value(trainer[2],map)-1+(trainer[1]?5000:3000);
    if(token.startsWith('VAR_')){const id=this.data.constants[token];return (id!==undefined?this.state.vars['#'+id]:undefined)??this.state.vars[token]??0;}
    if(/^0x[0-9a-f]+$|^-?\d+$/i.test(token))return Number(token);
    return map.constants[token]??this.data.constants[token]??0;
  }
  set(token:string,n:number){this.runAbort?.signal.throwIfAborted();if(this.fieldMoveOrigin!==null&&this.state.map!==this.fieldMoveOrigin)throw Error('Field move was cancelled by a field change');this.state.vars[token]=n&0xffff;const id=this.data.constants[token];if(id!==undefined)this.state.vars['#'+id]=n&0xffff;}
  private itemKey(token:string,map:SourceMap){if(token.startsWith('ITEM_'))return token;const id=this.value(token,map);return this.data.items.find(item=>this.data.constants[item.item]===id)?.item||'ITEM_NONE';}
  private async runChild(map:SourceMap,script:string|number,object:string,standardID:number|null=this.standardID,approach?:TrainerApproachContext):Promise<void>{
    const previous=this.child,child=new ScriptVM(this.data,this.state,this.hooks);this.child=child;child.standardID=standardID;child.inheritedSignal=this.runAbort?.signal;child.context=this.context;child.buffers=this.buffers;child.battleWon=this.battleWon;child.pendingPhone=this.pendingPhone;child.momGiftDelivery=this.momGiftDelivery;child.mysteryGiftSession=this.mysteryGiftSession;
    try{await child.run(map,script,object,true,approach);}finally{this.child=previous;this.buffers=child.buffers;this.battleWon=child.battleWon;this.pendingPhone=child.pendingPhone;this.momGiftDelivery=child.momGiftDelivery;if(child.lastUnsupported)this.lastUnsupported=child.lastUnsupported;for(const command of child.supported)this.supported.add(command);}
  }
  private async standard(id:number,object:string){const signal=this.runAbort?.signal;const match=this.data.index.stdScripts.filter(row=>id>=row.min).reduce<(typeof this.data.index.stdScripts)[number]|undefined>((best,row)=>!best||row.min>best.min?row:best,undefined);if(!match)throw new Error(`Missing original standard script ${id}`);if(!standardCache.has(match.bank)){const loading:Promise<SourceMap>=sourceJSON<SourceMap>(`scripts/${match.bank}.json`).catch(error=>{if(standardCache.get(match.bank)===loading)standardCache.delete(match.bank);throw error;});standardCache.set(match.bank,loading);}const common=await standardCache.get(match.bank)!;signal?.throwIfAborted();const entry=common.scripts.entries[id-match.min];if(!entry)throw new Error(`Missing original standard entry ${id}`);await this.runChild(common,entry,object,id);}
  text(message:string,map:SourceMap){
    const raw=map.messages[message]??message;
    return raw.replace(/\{STRVAR_1 (\d+), (\d+), \d+\}/g,(_,kind,slot)=>kind==='3'?this.state.name:this.buffers[Number(slot)]??(kind==='1'?this.state.rivalName:'')).replace(/\{YESNO \d+\}/g,'').replace(/\{[^}]+\}/g,'').replace(/\\+([nrf])/g,(_,control)=>control==='n'?'\n':'\\'+control);
  }
  async runTrainerApproach(map:SourceMap,approach:TrainerApproachContext){
    if(approach.trainers.length!==(approach.eyeType===0?1:2)||new Set(approach.trainers.map(t=>t.object)).size!==approach.trainers.length||approach.trainers.some(t=>!this.data.trainers[t.trainer]||!map.events.objects.some(n=>n.id===t.object&&trainerIdForScript(this.value(String(n.scriptId),map))===t.trainer))||approach.eyeType===1&&(approach.trainers[0].trainer!==approach.trainers[1].trainer||!this.data.trainers[approach.trainers[0].trainer].double)||approach.eyeType!==1&&approach.trainers.some(t=>this.data.trainers[t.trainer].double))throw Error('Invalid native engaged-trainer context');
    return this.run(map,TRAINER_APPROACH_SCRIPT,approach.trainers[0].object,false,approach);
  }
  async run(map:SourceMap,script:string|number,object='obj_player',allowNested=false,approach?:TrainerApproachContext):Promise<void>{
    if(this.busy){if(!allowNested)return;await this.runChild(map,script,object,this.standardID,approach);return;}
    if(script===0)return;
    const controller=new AbortController(),generation=++this.runGeneration,parentSignal=this.inheritedSignal,inheritAbort=()=>controller.abort(parentSignal?.reason);
    this.runAbort=controller;parentSignal?.addEventListener('abort',inheritAbort,{once:true});
    const finish=()=>{if(!allowNested)this.mysteryGiftSession.save=null;parentSignal?.removeEventListener('abort',inheritAbort);if(this.runAbort===controller){this.runAbort=null;this.fieldMoveOrigin=null;}this.busy=false;};
    if(parentSignal?.aborted){inheritAbort();finish();controller.signal.throwIfAborted();}
    this.busy=true;if(!allowNested){this.buffers={0:this.state.name};this.lastUnsupported=null;this.momGiftDelivery=null;this.mysteryGiftSession={save:null};}let pc=0,compare=0,switchValue=0,lastMessage='',ownsCameraTarget=false;const stack:number[]=[];let pendingMoves:Promise<void>[]=[];const movementFailure:{error?:unknown;failed:boolean}={failed:false};
    const scriptID=typeof script==='number'?script:this.value(script,map);if(!allowNested){this.battleWon=false;this.context={activeScript:scriptID,map,object,phone:null,approach};const event=map.events.objects.find(n=>n.id===object),id=event?map.constants[event.id]??this.data.constants[event.id]:undefined;if(id!==undefined)this.set('VAR_SPECIAL_LAST_TALKED',id);}
    if(scriptID>=2000){try{await this.standard(scriptID,object);controller.signal.throwIfAborted();}catch(error){controller.abort(error);throw error;}finally{finish();}return;}
    const entry=scriptID-1;
    let label=typeof script==='string'&&map.scripts.labels[script]!==undefined?script:map.scripts.entries[entry];
    if(label===undefined){finish();return;}
    pc=map.scripts.labels[label];
    const jump=(target:string)=>{if(map.scripts.labels[target]===undefined)throw new Error(`Missing original script label ${target}`);pc=map.scripts.labels[target];};
    const conditions:Record<string,()=>boolean>={Eq:()=>compare===0,Ne:()=>compare!==0,Lt:()=>compare<0,Gt:()=>compare>0,Le:()=>compare<=0,Ge:()=>compare>=0};
    const v=(s:string)=>this.value(s,map);
    const originMap=this.context?.map??map;
    const cutScript=(this.standardID===this.data.constants.std_field_cut||this.standardID===this.data.constants.std_menu_cut)&&map.code==='COMMON_0146';
    if(cutScript)this.fieldMoveOrigin=originMap.id;
    const assertLive=()=>{controller.signal.throwIfAborted();if(this.runAbort!==controller||this.runGeneration!==generation||cutScript&&this.state.map!==originMap.id)throw Error('Field move was cancelled by a field change');};
    const fieldContext=():ScriptFieldMoveContext=>({map:originMap,object:this.context?.object??object,signal:controller.signal});
    const requireFieldMoves=(command:string)=>{const ports=this.hooks.fieldMoves;if(!ports?.startEffect)throw new UnsupportedScript(map.code,command,pc-1);return ports;};
    const aliveSlot=()=>this.state.party.findIndex(mon=>mon.hp>0&&!mon.isEgg&&!mon.checksumFailed);
    const firstAlive=()=>{const slot=aliveSlot();if(slot<0)throw Error('Native first-alive party query has no valid non-Egg');return slot;};
    const pendingFields:Promise<void>[]=[];let pendingCry:Promise<void>|null=null;
    const asyncFailure:{failed:boolean;error?:unknown}={failed:false};
    const own=(promise:Promise<void>,completed?:()=>void)=>{if(!promise||typeof promise.then!=='function')throw Error('Native field-move port must return a completion Promise');const owned=Promise.resolve(promise).then(()=>{controller.signal.throwIfAborted();if(this.runAbort!==controller||this.runGeneration!==generation||this.state.map!==originMap.id)throw Error('Field move was cancelled by a field change');completed?.();}).catch(error=>{if(!asyncFailure.failed){asyncFailure.failed=true;asyncFailure.error=error;}controller.abort(error);});pendingFields.push(owned);return owned;};
    const awaitedField=async(promise:Promise<void>)=>{await own(promise);if(asyncFailure.failed)throw asyncFailure.error;controller.signal.throwIfAborted();};
    // SetupNativeScript first polls next tick, then resumes bytecode one tick
    // after its completion callback. Keep these boundaries local to Cut.
    const resumeNativeField=async(pending:Promise<void>)=>{await waitFrames(1);await pending;if(asyncFailure.failed)throw asyncFailure.error;assertLive();await waitFrames(1);};
    const raw=(token:string,bits:8|16)=>{const literal=/^(?:0x[0-9a-f]+|-?\d+)$/i.test(token)?Number(token):map.constants[token]??this.data.constants[token];if(!Number.isInteger(literal))throw new UnsupportedScript(map.code,this.instruction?.command??'NativeLiteral',pc-1);return literal&(bits===8?255:65535);};
    const waitFrames=async(frames:number)=>{
      if(!Number.isInteger(frames)||frames<0)throw Error('Invalid native frame count');
      if(cutScript&&this.hooks.fieldMoves?.waitFrames){await this.hooks.fieldMoves.waitFrames(frames,fieldContext());assertLive();return;}
      await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(controller.signal.reason);},timer=setTimeout(()=>{controller.signal.removeEventListener('abort',abort);resolve();},Math.min(1000,frames*1000/60));controller.signal.addEventListener('abort',abort,{once:true});if(controller.signal.aborted)abort();});
      assertLive();
    };
    const actor=(token:string)=>v(token)===SCRIPT_CAMERA_PERSON?SCRIPT_CAMERA_ACTOR:token.startsWith('obj_')?token:originMap.events?.objects.find(n=>(originMap.constants[n.id]??this.data.constants[n.id])===v(token))?.id??this.hooks.objectName?.(v(token))??token;
    const activeTrainer=()=>{const script=this.context?.activeScript??scriptID,id=trainerIdForScript(script);if(id===null&&script!==TRAINER_APPROACH_SCRIPT)throw new UnsupportedScript(map.code,this.instruction?.command??'GetTrainerNum',pc-1);return id??740;};
    const engaged=(index:number)=>{const trainer=this.context?.approach?.trainers[index];if(!trainer)throw new UnsupportedScript(map.code,this.instruction?.command??'GetEyeTrainerNum',pc-1);return trainer;};
    try{
      let remaining=4000;
      while(true){
        assertLive();if(asyncFailure.failed)throw asyncFailure.error;
        if(remaining--===0)throw new Error(`Source script instruction limit reached at ${map.code}:${pc}`);
        if(movementFailure.failed)throw movementFailure.error;
        const instruction=map.scripts.instructions[pc++];if(!instruction)break;const [cmd,a]=instruction;this.instruction={map:map.code,command:cmd,pc:pc-1};
        if(cmd==='End'||cmd==='EndScript')break;
        this.supported.add(cmd);
        if(cutScript&&(cmd==='PlayCry'||cmd==='WaitCry')){
          const ports=requireFieldMoves(cmd);if(!ports.cry)throw new UnsupportedScript(map.code,cmd,pc-1);
          if(cmd==='PlayCry'){pendingCry=own(ports.cry(v(a[0]),v(a[1]),fieldContext()));}else{await resumeNativeField(pendingCry??Promise.resolve());pendingCry=null;}
          continue;
        }
        if(cutScript&&cmd==='FollowMonResetMovement'){const ports=requireFieldMoves(cmd);if(!ports.resetFollowerMovement)throw new UnsupportedScript(map.code,cmd,pc-1);await awaitedField(ports.resetFollowerMovement(fieldContext()));await waitFrames(1);continue;}
        if(presentation.has(cmd))continue;
        if(cmd==='OpenMsg')continue;
        if(cmd==='GoTo'){jump(a[0]);continue;}
        if(cmd==='Call'){stack.push(pc);jump(a[0]);continue;}
        if(cmd==='GoToIf'||cmd==='CallIf'){const condition=[compare<0,compare===0,compare>0,compare<=0,compare>=0,compare!==0][v(a[0])];if(condition){if(cmd==='CallIf')stack.push(pc);jump(a[1]);}continue;}
        if(cmd==='Return'){if(!stack.length)break;pc=stack.pop()!;continue;}
        if(cmd==='Compare'||cmd==='CompareVarToValue'||cmd==='CompareVars'){compare=v(a[0])-v(a[1]);continue;}
        if(cmd==='Switch'){switchValue=v(a[0]);continue;}
        if(cmd==='Case'){if(switchValue===v(a[0]))jump(a[1]);continue;}
        if(cmd==='GoToIfSet'||cmd==='GoToIfUnset'){if(!!this.state.flags[a[0]]===(cmd==='GoToIfSet'))jump(a[1]);continue;}
        if(cmd==='CallIfSet'||cmd==='CallIfUnset'){if(!!this.state.flags[a[0]]===(cmd==='CallIfSet')){stack.push(pc);jump(a[1]);}continue;}
        if(cmd==='GoToIfDefeated'||cmd==='GoToIfNotDefeated'||cmd==='CallIfDefeated'||cmd==='CallIfNotDefeated'){if(trainerDefeated(this.state,v(a[0]))===!cmd.includes('NotDefeated')){if(cmd.startsWith('Call'))stack.push(pc);jump(a[1]);}continue;}
        if(cmd==='SetTrainerFlag'||cmd==='ClearTrainerFlag'){setTrainerDefeated(this.state,v(a[0]),cmd==='SetTrainerFlag');continue;}
        if(cmd==='CheckTrainerFlag'){compare=trainerDefeated(this.state,v(a[0]))?0:-1;continue;}
        if(cmd==='SetLastInteractedTrainerFlag'||cmd==='GoToIfTrainerDefeated'){if(!originMap.events.objects.some(n=>n.id===this.context?.object))throw new UnsupportedScript(map.code,cmd,pc-1);const id=this.value('VAR_SPECIAL_LAST_TALKED',originMap);if(cmd==='SetLastInteractedTrainerFlag')setTrainerDefeated(this.state,id);else if(trainerDefeated(this.state,id))jump(a[0]);continue;}
        if(cmd==='GetTrainerNum'){this.set(a[0],activeTrainer());continue;}
        if(cmd==='TrainerIsDoubleBattle'){this.set(a[0],Number(!!this.data.trainers[activeTrainer()]?.double));continue;}
        if(cmd==='PartyCheckForDouble'){this.set(a[0],Number(this.state.party.filter(isUsableBattler).length>=2));continue;}
        if(cmd==='GetTrainerMsgParams'||cmd==='GetRematchMsgParams'){const double=!!this.data.trainers[activeTrainer()]?.double,partner=(this.context?.activeScript??scriptID)>=5000;const ids=cmd==='GetTrainerMsgParams'?(double?(partner?[7,9,10]:[3,5,6]):[0,2,0]):(double?(partner?[19,0,10]:[18,0,6]):[17,0,0]);a.forEach((token,i)=>this.set(token,ids[i]));continue;}
        if(cmd==='TrainerMessage'){const trainer=this.data.trainers[v(a[0])];if(!trainer)throw Error(`Missing original trainer ${v(a[0])}`);const message=trainer.messages?.find(row=>this.data.constants[row.type]===v(a[1]))?.message??'';lastMessage=this.text(message,map);if(lastMessage)await this.hooks.message(lastMessage);continue;}
        if(cmd==='EncounterMusic'){await this.hooks.encounterMusic?.(v(a[0]));continue;}
        if(cmd==='GetObjectMovementType'){const name=actor(a[1]);this.set(a[0],this.hooks.objectMovement?.(name)??originMap.events.objects.find(n=>n.id===name)?.movement??0);continue;}
        if(cmd==='ChangeObjectMovement'||cmd==='SetLastTalkedTrainerMovement'){if(!this.hooks.objectMovement)throw new UnsupportedScript(map.code,cmd,pc-1);const name=cmd==='ChangeObjectMovement'?actor(a[0]):this.context?.object??object;if(cmd==='ChangeObjectMovement')this.hooks.objectMovement(name,v(a[1]));else{if(!this.hooks.objectFacing)throw new UnsupportedScript(map.code,cmd,pc-1);const facing=this.hooks.objectFacing(name),movement=14+facing;this.hooks.objectMovement(name,movement);if(this.data.trainers[activeTrainer()]?.double)for(const partner of originMap.events.objects)if(partner.id!==name&&trainerIdForScript(this.value(String(partner.scriptId),originMap))===activeTrainer())this.hooks.objectMovement(partner.id,movement);}continue;}
        if(cmd==='GetTrainerEyeType'){if(!this.context?.approach)throw new UnsupportedScript(map.code,cmd,pc-1);this.set(a[0],this.context.approach.eyeType);continue;}
        if(cmd==='GetEyeTrainerNum'){this.set(a[1],engaged(v(a[0])).trainer);continue;}
        if(cmd==='GetTrainerPathToPlayer'){if(!this.hooks.trainerPath)throw new UnsupportedScript(map.code,cmd,pc-1);await this.hooks.trainerPath(v(a[0]),engaged(v(a[0])));continue;}
        if(cmd==='TrainerStepTowardsPlayer'){if(!this.hooks.trainerStep)throw new UnsupportedScript(map.code,cmd,pc-1);this.set(a[1],Number(await this.hooks.trainerStep(v(a[0]),engaged(v(a[0])))));continue;}
        if(cmd==='FollowMonIsActive'){if(!this.hooks.followerActive)throw new UnsupportedScript(map.code,cmd,pc-1);this.set(a[0],Number(this.hooks.followerActive()));continue;}
        if(cmd==='GetPartySlotWithMove'){this.set(a[0],getPartySlotWithMove(this.state.party,v(a[1])));continue;}
        if(cmd==='MonHasMove'){const mon=this.state.party[v(a[2])];if(!mon)throw Error('Native move query has no party slot');this.set(a[0],Number(monHasMove(mon,v(a[1]))));continue;}
        if(cmd==='GetFollowPokePartyIndex'){this.set(a[0],firstAlive());continue;}
        if(cmd==='FollowMonIsInactiveOrVisible'){
          if(!this.hooks.followerActive)throw new UnsupportedScript(map.code,cmd,pc-1);
          const active=this.hooks.followerActive();if(active&&!this.hooks.fieldMoves?.followerVisibleFlag)throw new UnsupportedScript(map.code,cmd,pc-1);
          this.set(a[0],Number(!active||this.hooks.fieldMoves!.followerVisibleFlag()));continue;
        }
        if(cmd==='PlayFieldMoveCutIn'){
          if(!cutScript)throw new UnsupportedScript(map.code,cmd,pc-1);
          const ports=requireFieldMoves(cmd),slot=v(a[0]);if(!ports.cutIn||!this.state.party[slot])throw new UnsupportedScript(map.code,cmd,pc-1);
          await resumeNativeField(own(ports.cutIn(slot,fieldContext())));continue;
        }
        if(cmd==='StartFieldMoveEffect'){
          if(!cutScript)throw new UnsupportedScript(map.code,cmd,pc-1);
          const kind=v(a[0]);if(kind!==0&&kind!==3)throw new UnsupportedScript(map.code,cmd,pc-1);const ports=requireFieldMoves(cmd);
          // COMMON_0146 runs Wait7/HidePerson before polling this variable.
          // Awaiting completion here would hide the tree at the wrong phase.
          // This TRUE-returning command yields once; Wait's native callback
          // also resumes bytecode on the following tick (src/script.c).
          this.set(a[1],0);own(ports.startEffect(kind,fieldContext()),()=>this.set(a[1],1));if(cutScript)await waitFrames(1);continue;
        }
        if(cmd==='SwapPlayerAndFollowMonPositions'){
          if(!cutScript)throw new UnsupportedScript(map.code,cmd,pc-1);
          const mode=raw(a[0],16),ports=requireFieldMoves(cmd);
          if((mode!==1&&mode!==2)||!ports.swapPlayerFollower||!ports.jumpFollower||!ports.addFollowerMood||!ports.cry)throw new UnsupportedScript(map.code,cmd,pc-1);
          await awaitedField(ports.swapPlayerFollower(mode,fieldContext()));continue;
        }
        if(cmd==='FollowMonAddMood'){if(!cutScript)throw new UnsupportedScript(map.code,cmd,pc-1);const ports=requireFieldMoves(cmd);if(!ports.addFollowerMood)throw new UnsupportedScript(map.code,cmd,pc-1);const byte=raw(a[0],8);ports.addFollowerMood(byte>=128?byte-256:byte);continue;}
        if(cmd==='FollowMonJumpOnSpot'){if(!cutScript)throw new UnsupportedScript(map.code,cmd,pc-1);const ports=requireFieldMoves(cmd);if(!ports.jumpFollower)throw new UnsupportedScript(map.code,cmd,pc-1);await awaitedField(ports.jumpFollower(raw(a[0],8),fieldContext()));continue;}
        if(cmd==='FirstAliveMonHasType'){
          const mon=this.state.party[firstAlive()],native=await loadNativeFieldMoveData();controller.signal.throwIfAborted();
          const base=this.data.personal[resolveTeachingPersonalIndex(native,mon.species,mon.form??0)];if(!base)throw Error('Missing original field Pokémon type record');let types=base.types.map(type=>this.data.constants[type]);
          if(mon.species===this.data.constants.SPECIES_ARCEUS&&base.abilities.includes('ABILITY_MULTITYPE')){const item=mon.heldItem?this.data.items.find(row=>row.item===mon.heldItem):undefined;if(mon.heldItem&&!item)throw Error('Missing original Arceus held-item record');const effect=item?.holdEffect??'',type=this.data.constants['TYPE_'+effect.replace(/^HOLD_EFFECT_ARCEUS_/,'')];types=[effect.startsWith('HOLD_EFFECT_ARCEUS_')&&type!==undefined?type:this.data.constants.TYPE_NORMAL];}
          this.set(a[1],Number(types.includes(raw(a[0],8))));continue;
        }
        if(cmd==='EcruteakGymExtinguishCandle'||cmd==='EcruteakGymBindCandleToTrainer'||cmd==='EcruteakGymUnbindCandleFromTrainer'){if(originMap.id===this.data.constants.MAP_ECRUTEAK_GYM){if(!this.hooks.trainerCandle)throw new UnsupportedScript(map.code,cmd,pc-1);await this.hooks.trainerCandle(cmd==='EcruteakGymExtinguishCandle'?'extinguish':cmd==='EcruteakGymBindCandleToTrainer'?'bind':'unbind',cmd==='EcruteakGymExtinguishCandle'&&!!v(a[0]));}continue;}
        const branch=cmd.match(/^(GoTo|Call)If(Eq|Ne|Lt|Gt|Le|Ge)$/);if(branch){if(conditions[branch[2]]()){if(branch[1]==='Call')stack.push(pc);jump(a[0]);}continue;}
        if(cmd==='SetVar'||cmd==='CopyVar'||cmd==='SetOrCopyVar'){this.set(a[0],v(a[1]));continue;}
        if(cmd==='AddVar'||cmd==='SubVar'){this.set(a[0],v(a[0])+(cmd==='AddVar'?1:-1)*v(a[1]));continue;}
        if(cmd==='SetFlag'||cmd==='ClearFlag'){this.state.flags[a[0]]=cmd==='SetFlag';continue;}
        if(cmd==='CheckFlag'){this.set(a[1]||'VAR_SPECIAL_RESULT',Number(!!this.state.flags[a[0]]));continue;}
        if(cmd==='NPCMsg'||cmd==='Message'||cmd==='SimpleNPCMsg'||cmd==='NonNPCMsg'){lastMessage=this.text(a[0],map);await this.hooks.message(lastMessage);continue;}
        if(cmd==='TrainerTipsEx'||cmd==='DirectionSignpostEx'||cmd==='TrainerTips'){const token=cmd==='TrainerTipsEx'?a[1]:cmd==='DirectionSignpostEx'?a[2]:a[0];lastMessage=this.text(token,map);await this.hooks.message(lastMessage);this.set(cmd==='TrainerTips'?a[1]:'VAR_SPECIAL_RESULT',2);continue;}
        if(cmd==='GenderMsgBox'){lastMessage=this.text(a[this.state.gender==='boy'?0:1],map);await this.hooks.message(lastMessage);continue;}
        if(cmd==='NPCMsgVar'||cmd==='NonNPCMsgVar'){const message=Object.keys(map.messages).find(key=>Number(key.slice(-5))===v(a[0]));if(!message)throw new Error(`Missing original message ${v(a[0])}`);lastMessage=this.text(message,map);await this.hooks.message(lastMessage);continue;}
        if(cmd==='GetStdMsgNaix'){this.set(a[1],[752,211,30,435][v(a[0])]??0);continue;}
        if(cmd==='MsgBoxExtern'||cmd==='NonNPCMsgExtern'){const bank=await sourceJSON<Record<string,string>>(`messages/${v(a[0])}.json`),raw=bank[v(a[1])];if(raw===undefined)throw Error(`Missing source message ${v(a[0])}:${v(a[1])}`);lastMessage=this.text(raw,map);await this.hooks.message(lastMessage);continue;}
        if(cmd==='GetMenuChoice'||cmd==='YesNoBox'){this.set(a[0],await this.hooks.choice(lastMessage.split(/\\[rf]/).filter(Boolean).at(-1)));continue;}
        if(cmd==='Wait'){if(cutScript){const frames=raw(a[0],16);this.set(a[1],frames);for(let left=frames||65536;left>0;left--){await waitFrames(1);controller.signal.throwIfAborted();this.set(a[1],left-1);}await waitFrames(1);remaining=4000;}else await waitFrames(v(a[0]));continue;}
        if(cmd==='CreateCameraTarget'||cmd==='RemoveCameraTarget'){
          if(!this.hooks.cameraTarget)throw new UnsupportedScript(map.code,cmd,pc-1);
          this.hooks.cameraTarget(cmd==='CreateCameraTarget'?{map,x:v(a[0]),z:v(a[1])}:null);ownsCameraTarget=cmd==='CreateCameraTarget';continue;
        }
        if(cmd==='ApplyMovement'){pendingMoves.push(this.hooks.move(actor(a[0]),a[1],map).catch(error=>{movementFailure.failed=true;movementFailure.error=error;}));continue;}
        if(cmd==='WaitMovement'){await Promise.all(pendingMoves);pendingMoves=[];if(movementFailure.failed)throw movementFailure.error;continue;}
        if(cmd==='MovePersonFacing'){this.hooks.position(actor(a[0]),v(a[1]),v(a[3]),v(a[4]));continue;}
        if(cmd==='MovePerson'){this.hooks.position(actor(a[0]),v(a[1]),v(a[3]));continue;}
        if(cmd==='FacePlayer'){this.hooks.face(object);continue;}
        if(cmd==='ShowPerson'||cmd==='HidePerson'){this.hooks.visible(actor(a[0]),cmd==='ShowPerson');continue;}
        if(cmd==='GetPlayerCoords'){this.set(a[0],Math.floor(this.state.x));this.set(a[1],Math.floor(this.state.z));continue;}
        if(cmd==='GetPersonCoords'){const name=actor(a[0]);const p=a[0]==='obj_player'?{x:Math.floor(this.state.x),z:Math.floor(this.state.z)}:this.hooks.coordinates?.(name);if(!p)throw new UnsupportedScript(map.code,cmd,pc-1);this.set(a[1],p.x);this.set(a[2],p.z);continue;}
        if(cmd==='GetPlayerFacing'){this.set(a[0],this.state.facing);continue;}
        if(cmd==='GetGender'||cmd==='GetPlayerGender'){this.set(a[0],this.state.gender==='boy'?0:1);continue;}
        if(cmd==='GetGameVersion'){this.set(a[0],this.data.constants.GAME_VERSION);continue;}
        if(cmd==='GetWeatherType'){this.set(a[0],this.hooks.weather?.()??mapWeather(map,this.state));continue;}
        if(cmd==='VioletGymInit'||cmd==='VioletGymElevator'){if(!this.hooks.violetGym)throw new UnsupportedScript(map.code,cmd,pc-1);if(cmd==='VioletGymInit')await this.hooks.violetGym.init();else await this.hooks.violetGym.elevator();continue;}
        if(cmd==='AzaleaGymInit'||cmd==='AzaleaGymSpinarak'||cmd==='AzaleaGymSwitch'){
          const ports=this.hooks.azaleaGym;if(!ports||originMap.id!==180||originMap.key!=='MAP_AZALEA_GYM'||this.state.map!==180)throw new UnsupportedScript(map.code,cmd,pc-1);
          const context:ScriptGymContext={map:originMap,signal:controller.signal};
          if(cmd==='AzaleaGymInit')await ports.init(context);
          else{const index=raw(a[0],8);await awaitedField(cmd==='AzaleaGymSpinarak'?ports.spinarak(index,context):ports.switch(index,context));}
          assertLive();continue;
        }
        if(cmd==='SetWeather'||cmd==='FlashEffect'){if(!this.hooks.weather)throw new UnsupportedScript(map.code,cmd,pc-1);this.hooks.weather(cmd==='FlashEffect'?12:v(a[0]));continue;}
        if(cmd==='FlashAction'||cmd==='DefogAction'){const flag=cmd==='FlashAction'?'FLAG_SYS_FLASH':'FLAG_SYS_DEFOG',action=v(a[0]);if(action===2)this.set(a[1],Number(!!this.state.flags[flag]));else if(action===0||action===1)this.state.flags[flag]=!!action;else throw new UnsupportedScript(map.code,cmd,pc-1);continue;}
        if(cmd==='GivePokedex'){this.state.pokedexEnabled=true;continue;}
        if(cmd==='CheckPokedex'){this.set(a[0],Number(!!this.state.pokedexEnabled));continue;}
        if(cmd==='NopVar490'){
          // ScrCmd_NopVar490 consumes one ScriptGetVarPointer and never writes it.
          if(a.length!==1)throw new UnsupportedScript(map.code,cmd,pc-1);
          const id=raw(a[0],16);if(id>=0x4000&&!(id<=0x416f||id>=0x8000&&id<=0x800d))throw new UnsupportedScript(map.code,cmd,pc-1);
          continue;
        }
        if(cmd==='MysteryGift'){
          // Selector is ScriptReadHalfword: a VAR selector is its literal ID,
          // never the current value stored in that variable.
          const selector=raw(a[0],16);
          if(selector===0){this.mysteryGiftSession.save=ensureMysteryGiftSave(this.state);continue;}
          if(selector===7||selector===8){this.mysteryGiftSession.save=null;continue;}
          if(selector===1||selector===2){
            if(!this.mysteryGiftSession.save)throw Error('Mystery Gift query without native BEGIN');
            const gift=nextMysteryGift(this.mysteryGiftSession.save);
            this.set(a[1],selector===1?Number(gift!==null):gift?.tag??0);continue;
          }
          // External gift checks, grants and message construction require the
          // native tag-specific payload adapters. Never consume queued bytes.
          throw new UnsupportedScript(map.code,cmd,pc-1);
        }
        if(cmd==='SetMysteryGiftActive'){this.state.mysteryGiftEnabled=true;continue;}
        if(cmd==='SetSpawn'){this.state.lastHeal={...(await originalSpawn(v(a[0]))).death};continue;}
        if(cmd==='PhoneCall'){const args=a.map(v);this.set('VAR_SPECIAL_x8004',args[0]);this.set('VAR_SPECIAL_x8005',args[1]);this.set('VAR_SPECIAL_x8006',args[2]);await this.standard(this.data.constants.std_phone_call,object);continue;}
        if(cmd==='SetPhoneCall'){this.pendingPhone=[v(a[0]),v(a[1]),v(a[2])];continue;}
        if(cmd==='RunPhoneCall'){if(!this.pendingPhone)throw Error('Original phone call has no caller');await phoneCall(this.data,this.state,...this.pendingPhone,text=>this.hooks.message(this.text(text,map)),text=>this.hooks.choice(text));this.pendingPhone=null;continue;}
        if(cmd==='LoadPhoneDat'){if(!this.context)throw new UnsupportedScript(map.code,cmd,pc-1);this.context.phone=(await trainerContacts()).contacts.find(entry=>entry.trainer===v(a[0]))??null;this.set(a[1],this.context.phone?.id??255);continue;}
        if(cmd==='CheckRegisteredPhoneNumber'){const key=phoneContactKey(this.data,v(a[0]));this.set(a[1],Number(!!key&&!!this.state.pokegear?.contacts.includes(key)));continue;}
        if(cmd==='GetPhoneContactMsgIds'){const contact=this.context?.phone;if(!contact)throw new UnsupportedScript(map.code,cmd,pc-1);const index=v(a[0]);this.set(a[1],contact.messageBank);this.set(a[2],(index>4?0:index)+1);continue;}
        if(cmd==='GetPhoneBookRematch'){const period=timeOfDay(new Date().getHours());this.set(a[1],phoneRematchTrainer(this.data,this.state,await trainerContacts(),v(a[0]),period===0?0:period===1||period===2?1:2));continue;}
        if(cmd==='ClearPhoneRematchSeeking'){if(this.state.trainerPhone)this.state.trainerPhone.seeking=this.state.trainerPhone.seeking.filter(id=>id!==v(a[0]));continue;}
        if(cmd==='GetPhoneContactGiftItem'){const id=this.context?.phone?.id;this.set(a[0],id===undefined?0:this.state.trainerPhone?.gifts[id]??0);if(id!==undefined&&this.state.trainerPhone)delete this.state.trainerPhone.gifts[id];continue;}
        if(cmd==='GetPhoneContactRandomGiftBerry'){const gift=this.context?.phone?.gift??0;this.set(a[0],gift===this.data.constants.ITEM_CHERI_BERRY?gift+Math.floor(Math.random()*10):gift);continue;}
        if(cmd==='SetPhoneCallTrigger'||cmd==='UnsetPhoneCallTrigger'){const id=v(a[0]);if(cmd==='SetPhoneCallTrigger'){setPendingPhoneTrigger(this.state,id);this.hooks.phoneTrigger?.(id,!!v(a[1]));}else unsetPendingPhoneTrigger(this.state,id);continue;}
        if(cmd==='GetFriendSprite'){this.set(a[0],this.data.constants[this.state.gender==='boy'?'SPRITE_HEROINE':'SPRITE_HERO']);continue;}
        if(cmd==='CheckBadge'){this.set(a[1],Number(this.state.badges.includes(v(a[0]))));continue;}
        if(cmd==='GiveBadge'){const index=v(a[0]);if(!Number.isInteger(index)||index<0||index>=16)throw new UnsupportedScript(map.code,cmd,pc-1);giveBadge(this.state,index);continue;}
        if(cmd==='CountBadges'){this.set(a[0],countBadges(this.state));continue;}
        if(cmd==='AddSpecialGameStat'||cmd==='AddSpecialGameStat2'){
          // Unlike GiveBadge/SetTrainerFlag this operand is ScriptReadHalfword,
          // so a VAR token is its raw ID and must never dereference State.vars.
          const token=a[0],event=/^(?:0x[0-9a-f]+|\d+)$/i.test(token)?Number(token):map.constants[token]??this.data.constants[token];
          if(!Number.isInteger(event)||event<0||event>=this.data.constants.SCORE_EVENT_COUNT)throw new UnsupportedScript(map.code,cmd,pc-1);
          addSpecialGameStat(this.state,event);continue;
        }
        if(cmd==='GetTrcardStars'){this.set(a[0],trainerCardStars(this.state));continue;}
        if(cmd==='GetCurrentTimeOfDay'){this.set(a[0],timeOfDay(new Date().getHours()));continue;}
        if(cmd==='GetCurrentMapId'){this.set(a[0],this.state.map);continue;}
        if(cmd==='GetPlayerState'){const pose=this.state.avatarState??0;this.set(a[0],pose===10?0:pose===12?3:pose);continue;}
        if(cmd==='SetAvatarBits'){const transitions:Record<number,number>={[this.data.constants.PLAYER_TRANSITION_WALKING]:0,[this.data.constants.PLAYER_TRANSITION_HEAL]:10,[this.data.constants.PLAYER_TRANSITION_ROCKET]:3,[this.data.constants.PLAYER_TRANSITION_ROCKET_HEAL]:12};const next=transitions[v(a[0])];if(next===undefined)throw new UnsupportedScript(map.code,cmd,pc-1);this.state.avatarState=next;continue;}
        if(cmd==='UpdateAvatarState')continue;
        if(cmd==='PartyCountNotEgg'){this.set(a[0],this.state.party.filter(mon=>!mon.isEgg).length);continue;}
        if(cmd==='PartyCountEgg'){this.set(a[0],this.state.party.filter(mon=>!!mon.isEgg).length);continue;}
        if(cmd==='GiveTogepiEgg'){giveTogepiEgg(this.data,this.state,this.hooks.eggContext);continue;}
        if(cmd==='EggHatchAnim'){if(!this.hooks.eggHatchAnim)throw new UnsupportedScript(map.code,cmd,pc-1);await this.hooks.eggHatchAnim();continue;}
        if(cmd==='MonIsFromTogepiEgg'){this.set(a[1],Number(isOriginalTogepiGift(this.data,this.state,this.state.party[v(a[0])])));continue;}
        if(cmd==='PartyHasPokerus'){this.set(a[0],Number(this.state.party.some(mon=>!!mon.pokerus)));continue;}
        if(cmd==='PokeCenAnim'){if(!this.hooks.healAnimation)throw new UnsupportedScript(map.code,cmd,pc-1);await this.hooks.healAnimation(v(a[0]));continue;}
        if(cmd==='FollowMonHopIntoBall'){this.hooks.followerVisible?.(false);continue;}
        if(cmd==='GetWeekday'){this.set(a[0],new Date().getDay());continue;}
        if(cmd==='GiveRunningShoes'){this.state.runningShoes=true;continue;}
        if(cmd==='CheckRunningShoes'){this.set(a[0],Number(!!this.state.runningShoes));continue;}
        if(cmd==='RegisterGearNumber'||cmd==='RegisterPokegearCard'){this.state.pokegear??={contacts:[],cards:[]};if(cmd==='RegisterGearNumber'){const key=phoneContactKey(this.data,v(a[0]));if(key&&!this.state.pokegear.contacts.includes(key))this.state.pokegear.contacts.push(key);}else if(!this.state.pokegear.cards.includes(v(a[0])))this.state.pokegear.cards.push(v(a[0]));continue;}
        if(cmd==='GetPartyCount'){this.set(a[0],this.state.party.length);continue;}
        if(cmd==='GetKurtApricornQuantity'){this.set(a[0],kurtApricornQuantity(this.state));continue;}
        if(cmd==='GetTotalApricornCount'){this.set(a[0],totalApricornCount(this.state));continue;}
        if(cmd==='GetKurtBall'){this.set(a[0],kurtBall(this.data,this.state));continue;}
        if(cmd==='ClearKurtApricorn'){clearKurtApricorn(this.state);continue;}
        if(cmd==='GetPartyLeadAlive'){this.set(a[0],Math.max(0,aliveSlot()));continue;}
        if(cmd==='GetPartyMonSpecies'){const mon=this.state.party[v(a[0])];this.set(a[1],mon?.checksumFailed?0:partyMonSpecies(mon));continue;}
        if(cmd==='GetPartyMonForm2'){this.set(a[1],0);continue;}
        if(cmd==='GetStarterChoice'){this.set(a[0],this.state.starter);continue;}
        if(cmd==='SetStarterChoice'){this.state.starter=v(a[0]);continue;}
        if(cmd==='ChooseStarter'){await this.hooks.chooseStarter();continue;}
        if(cmd==='NicknameInput'){const code=await this.hooks.nickname(v(a[0]));if(code!==0&&code!==1)throw new UnsupportedScript(map.code,cmd,pc-1);this.set(a[1],code);continue;}
        if(cmd==='BufferPlayersName'){this.buffers[v(a[0])]=this.state.name;continue;}
        if(cmd==='BufferRivalsName'){this.buffers[v(a[0])]=this.state.rivalName;continue;}
        if(cmd==='BufferFriendsName'){this.buffers[v(a[0])]=this.state.gender==='boy'?'Lyra':'Ethan';continue;}
        if(cmd==='BufferMonSpeciesName'||cmd==='BufferPartyMonNick'||cmd==='BufferPartyMonSpeciesNameIndef'){const m=this.state.party[v(a[1])];if(!m)throw Error('Native party name buffer has no party slot');this.buffers[raw(a[0],8)]=cmd==='BufferPartyMonNick'?m.name:cmd==='BufferPartyMonSpeciesNameIndef'?this.data.names.speciesIndefinite[m.species]:speciesName(this.data,m.species);continue;}
        if(cmd==='BufferSpeciesName'){this.buffers[v(a[0])]=speciesName(this.data,v(a[1]));continue;}
        if(cmd==='BufferItemName'||cmd==='BufferItemNamePlural'||cmd==='BufferItemNameIndef'){const id=this.data.constants[this.itemKey(a[1],map)];this.buffers[v(a[0])]=this.data.names[cmd==='BufferItemNamePlural'?'itemsPlural':cmd==='BufferItemNameIndef'?'itemsIndefinite':'items'][id]||'';continue;}
        if(cmd==='BufferTMHMMoveName'){const slot=Number(a[0]);if(!Number.isInteger(slot)||slot<0||slot>255)throw Error('Invalid native message buffer byte');this.buffers[slot]=moveName(this.data,await tmhmMove(this.data,v(a[1])));continue;}
        if(cmd==='ItemIsTMOrHM'){this.set(a[1],Number(isTMHMItem(this.data,v(a[0]))));continue;}
        if(cmd==='GetItemPocket'){const item=this.data.items.find(item=>item.item===this.itemKey(a[0],map));this.set(a[1],this.data.constants[item?.fieldPocket||'POCKET_ITEMS']||0);continue;}
        if(cmd==='BufferPocketName'){const pockets=['Items','Medicine','Poké Balls','TMs & HMs','Berries','Mail','Battle Items','Key Items'];this.buffers[v(a[0])]=pockets[v(a[1])]||'Items';continue;}
        if(cmd==='BufferInteger'||cmd==='BufferNumber'){this.buffers[v(a[0])]=String(v(a[1]));continue;}
        if(cmd==='HasItem'||cmd==='CheckItemSpace'||cmd==='HasSpaceForItem'){const key=this.itemKey(a[0],map);this.set(a[2],cmd==='HasItem'?Number((this.state.bag[key]||0)>=v(a[1])):Number(hasBagSpace(this.data,this.state.bag,key,v(a[1]))));continue;}
        if(cmd==='MomGiftCheck'){this.set(a[0],Number(hasMomGift(this.state)));continue;}
        if(cmd==='PeekMomGift'){const gift=peekMomGift(this.state);this.set(a[0],gift.item);this.set(a[1],gift.quantity);if(this.standardID===this.data.constants.std_moms_gift_deliveryman)this.momGiftDelivery={gift,given:false};continue;}
        if(cmd==='PopMomGift'){
          if(this.standardID===this.data.constants.std_moms_gift_deliveryman){const head=peekMomGift(this.state),receipt=this.momGiftDelivery;if(!receipt?.given||head.item!==receipt.gift.item||head.quantity!==receipt.gift.quantity)throw Error('Mom gift delivery has no successful matching source item grant');}
          popMomGift(this.state);this.momGiftDelivery=null;continue;
        }
        if(cmd==='GoToIfNoItemSpace'||cmd==='GoToIfNoItemSpace2'){const item=v(a[0]),quantity=v(a[1]);this.set('VAR_SPECIAL_x8004',item);this.set('VAR_SPECIAL_x8005',quantity);const result=Number(hasBagSpace(this.data,this.state.bag,this.itemKey(a[0],map),quantity));this.set('VAR_SPECIAL_RESULT',result);compare=result-(cmd==='GoToIfNoItemSpace'?0:1);if(!result)jump(a[2]);continue;}
        if(cmd==='GiveItemNoCheck'){const item=v(a[0]),quantity=v(a[1]);this.set('VAR_SPECIAL_x8004',item);this.set('VAR_SPECIAL_x8005',quantity);await this.standard(this.data.constants.std_give_item_verbose,object);continue;}
        if(cmd==='AddItem'||cmd==='GiveItem'){
          const key=this.itemKey(a[0],map),quantity=v(a[1]),result=addBagItem(this.data,this.state.bag,key,quantity);if(a[2])this.set(a[2],Number(result));
          // Native std10202 checks space before std2033. Browser presentation
          // awaits external ports, so fail atomically if that invariant changed
          // rather than silently Pop an ungranted package. Other grants retain
          // their original result-variable semantics.
          const receipt=this.momGiftDelivery;
          if(this.standardID===this.data.constants.std_give_item_verbose&&receipt&&this.data.constants[key]===receipt.gift.item&&quantity===receipt.gift.quantity){if(!result)throw Error('Mom gift item grant failed after the source capacity check');receipt.given=true;}
          continue;
        }
        if(cmd==='TakeItem'||cmd==='RemoveItem'||cmd==='TakeItemNoCheck'){const key=this.itemKey(a[0],map),quantity=v(a[1]);if(cmd==='TakeItemNoCheck'){this.set('VAR_SPECIAL_x8004',v(a[0]));this.set('VAR_SPECIAL_x8005',quantity);}const result=takeBagItem(this.state.bag,key,quantity);if(a[2]||cmd==='TakeItemNoCheck')this.set(a[2]||'VAR_SPECIAL_RESULT',Number(result));continue;}
        if(cmd==='HealParty'){healParty(this.state);continue;}
        if(cmd==='CountMailboxMessages'){this.set(a[0],0);continue;}
        if(cmd==='Random'){this.set(a[0],Math.floor(Math.random()*v(a[1])));continue;}
        if(cmd==='CallStd'){
          if(/music|bgm/i.test(a[0]))continue;
          await this.standard(v(a[0]),object);continue;
        }
        if(cmd==='RestartCurrentScript')continue; // Awaited child context resumes its caller on return.
        if(cmd==='TrainerBattle'){this.battleWon=await this.hooks.battle(v(a[0]),{second:v(a[1]||'0'),canLose:!!v(a[2]||'0'),suppressFollower:!!v(a[3]||'0')});this.set('VAR_BATTLE_RESULT',this.battleWon?1:2);continue;}
        if(cmd==='CheckBattleWon'){this.set(a[0],Number(this.battleWon));continue;}
        if(cmd==='CatchingTutorial'){if(!this.hooks.catchingTutorial)throw new UnsupportedScript(map.code,cmd,pc-1);await this.hooks.catchingTutorial();continue;}
        if(cmd==='NameRival'){if(!this.hooks.nameRival)throw new UnsupportedScript(map.code,cmd,pc-1);this.state.rivalName=await this.hooks.nameRival();if(a[0])this.set(a[0],0);continue;}
        if(cmd==='WhiteOut'){if(!this.hooks.whiteOut)throw new UnsupportedScript(map.code,cmd,pc-1);await this.hooks.whiteOut();continue;}
        // ScrCmd_Warp consumes operand1 as an unused literal halfword and
        // passes warpId=-1: the following operands are X, Z and facing.
        if(cmd==='Warp'){await this.hooks.warp(v(a[0]),v(a[2]),v(a[3]),v(a[4]));continue;}
        this.supported.delete(cmd);throw new UnsupportedScript(map.code,cmd,pc-1);
      }
      await Promise.all([...pendingMoves,...pendingFields]);controller.signal.throwIfAborted();if(asyncFailure.failed)throw asyncFailure.error;if(movementFailure.failed)throw movementFailure.error;await this.hooks.refresh();controller.signal.throwIfAborted();
    }catch(error){controller.abort(error);if(error instanceof UnsupportedScript)this.lastUnsupported={map:error.map,command:error.command,pc:error.pc};throw error;}
    finally{try{if(ownsCameraTarget)this.hooks.cameraTarget?.(null);}finally{await Promise.allSettled([...pendingMoves,...pendingFields]);finish();}}
  }
}
