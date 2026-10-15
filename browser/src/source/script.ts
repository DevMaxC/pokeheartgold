import {speciesName,titleCase,healParty} from './data.ts';
import type {GameData,SourceMap,State} from './types.ts';
import {sourceJSON} from './types.ts';
import {hasBagSpace,addBagItem,takeBagItem} from './bag.ts';
import {phoneCall} from './phone.ts';
import {originalSpawn} from './spawns.ts';
import {timeOfDay,trainerCardStars} from './field-services.ts';

export type ScriptHooks={
  message:(text:string)=>Promise<void>;choice:(text?:string)=>Promise<number>;
  move:(object:string,label:string,map:SourceMap)=>Promise<void>;position:(object:string,x:number,z:number,facing?:number)=>void;
  face:(object:string,facing?:number)=>void;visible:(object:string,value:boolean)=>void;
  chooseStarter:()=>Promise<void>;nickname:(index:number)=>Promise<void>;refresh:()=>Promise<void>;
  battle:(trainer:number,options?:{second:number;canLose:boolean;suppressFollower:boolean})=>Promise<boolean>;warp:(map:number,x:number,z:number)=>Promise<void>;
  coordinates?:(object:string)=>{x:number;z:number};nameRival?:()=>Promise<string>;whiteOut?:()=>Promise<void>;
  catchingTutorial?:()=>Promise<void>;objectName?:(id:number)=>string|undefined;healAnimation?:(count:number)=>Promise<void>;followerVisible?:(visible:boolean)=>void;
};
export class UnsupportedScript extends Error{
  readonly map:string;readonly command:string;readonly pc:number;
  constructor(map:string,command:string,pc:number){super(`Unported source command ${command} at ${map}:${pc}`);this.map=map;this.command=command;this.pc=pc;}
}
// Only presentation commands may be ignored. Unknown gameplay commands stop explicitly.
const presentation=new Set(['Nop','Dummy','DebugWatch','ResetBGM','UnlockDir','WaitButtonOrDpad','StopSE','LeaveOverworld','DoorAnimationLoad','DoorAnimationOpen','DoorAnimationClose','DoorAnimationWait','DoorAnimationUnload','LockAll','ReleaseAll','Lock','Release','LockDir','PlaySE','WaitSE','PlayFanfare','WaitFanfare','PlayCry','WaitCry','CloseMsg','WaitButton','FadeScreen','WaitFade','FollowMonResetMovement','TouchscreenMenuHide','TouchscreenMenuShow','FollowingPokemonMovement','WaitFollowingPokemonMovement','ToggleFollowingPokemonMovement','FollowMonSetPositionNextToPlayer','FollowMonSpawnReleaseBall','PlaceStarterBallsInElmsLab','SetFollowingPokemonActive','RestoreOverworld','DrawPokemonPreview','HidePokemonPreview','ShowMoneyBox','HideMoneyBox','SetWeather','FadeOutBGM','PlayBGM','StopBGM','SetBGM','WaitABPress','SetWindow','ScrCmd_609']);
const standardCache=new Map<string,Promise<SourceMap>>();
export class ScriptVM{
  busy=false;lastUnsupported:{map:string;command:string;pc:number}|null=null;
  readonly supported=new Set<string>();
  private instruction:{map:string;command:string;pc:number}|null=null;private child:ScriptVM|null=null;
  get current():{map:string;command:string;pc:number}|null{return this.child?.current??this.instruction;}
  buffers:Record<number,string>={};
  private battleWon=false;
  private pendingPhone:[number,number,number]|null=null;
  readonly data:GameData;readonly state:State;readonly hooks:ScriptHooks;
  constructor(data:GameData,state:State,hooks:ScriptHooks){this.data=data;this.state=state;this.hooks=hooks;}
  value(token:string,map:SourceMap):number{
    token=token.trim();if(token.includes('+'))return token.split('+').reduce((n,t)=>n+this.value(t,map),0);
    const trainer=token.match(/^std_trainer(_2)?\((\w+)\)$/);if(trainer)return this.value(trainer[2],map)-1+(trainer[1]?5000:3000);
    if(token.startsWith('VAR_')){const id=this.data.constants[token];return (id!==undefined?this.state.vars['#'+id]:undefined)??this.state.vars[token]??0;}
    if(/^0x[0-9a-f]+$|^-?\d+$/i.test(token))return Number(token);
    return map.constants[token]??this.data.constants[token]??0;
  }
  set(token:string,n:number){this.state.vars[token]=n&0xffff;const id=this.data.constants[token];if(id!==undefined)this.state.vars['#'+id]=n&0xffff;}
  private itemKey(token:string,map:SourceMap){if(token.startsWith('ITEM_'))return token;const id=this.value(token,map);return this.data.items.find(item=>this.data.constants[item.item]===id)?.item||'ITEM_NONE';}
  private async standard(id:number,object:string){const match=this.data.index.stdScripts.filter(row=>id>=row.min).reduce<(typeof this.data.index.stdScripts)[number]|undefined>((best,row)=>!best||row.min>best.min?row:best,undefined);if(!match)throw new Error(`Missing original standard script ${id}`);if(!standardCache.has(match.bank))standardCache.set(match.bank,sourceJSON<SourceMap>(`scripts/${match.bank}.json`));const common=await standardCache.get(match.bank)!;const entry=common.scripts.entries[id-match.min];if(!entry)throw new Error(`Missing original standard entry ${id}`);const child=new ScriptVM(this.data,this.state,this.hooks);this.child=child;child.buffers=this.buffers;child.battleWon=this.battleWon;child.pendingPhone=this.pendingPhone;try{await child.run(common,entry,object,true);}finally{this.child=null;this.buffers=child.buffers;this.battleWon=child.battleWon;this.pendingPhone=child.pendingPhone;if(child.lastUnsupported)this.lastUnsupported=child.lastUnsupported;for(const command of child.supported)this.supported.add(command);}}
  text(message:string,map:SourceMap){
    const raw=map.messages[message]??message;
    return raw.replace(/\{STRVAR_1 (\d+), (\d+), \d+\}/g,(_,kind,slot)=>kind==='3'?this.state.name:this.buffers[Number(slot)]??(kind==='1'?this.state.rivalName:'')).replace(/\{YESNO \d+\}/g,'').replace(/\{[^}]+\}/g,'').replace(/\\n/g,'\n');
  }
  async run(map:SourceMap,script:string|number,object='obj_player',allowNested=false){
    if(this.busy&&!allowNested)return;
    if(script===0)return;
    this.busy=true;if(!allowNested){this.buffers={0:this.state.name};this.lastUnsupported=null;}let pc=0,compare=0,switchValue=0,lastMessage='';const stack:number[]=[];let pendingMoves:Promise<void>[]=[];const movementFailure:{error?:unknown;failed:boolean}={failed:false};
    const scriptID=typeof script==='number'?script:this.value(script,map);if(scriptID>=2000){try{await this.standard(scriptID,object);}finally{this.busy=false;}return;}
    const entry=scriptID-1;
    let label=typeof script==='string'&&map.scripts.labels[script]!==undefined?script:map.scripts.entries[entry];
    if(label===undefined){this.busy=false;return;}
    pc=map.scripts.labels[label];
    const jump=(target:string)=>{if(map.scripts.labels[target]===undefined)throw new Error(`Missing original script label ${target}`);pc=map.scripts.labels[target];};
    const conditions:Record<string,()=>boolean>={Eq:()=>compare===0,Ne:()=>compare!==0,Lt:()=>compare<0,Gt:()=>compare>0,Le:()=>compare<=0,Ge:()=>compare>=0};
    const v=(s:string)=>this.value(s,map);
    const actor=(token:string)=>token.startsWith('obj_')?token:this.hooks.objectName?.(v(token))??map.events?.objects.find(n=>map.constants[n.id]===v(token))?.id??token;
    try{
      let remaining=4000;
      while(true){
        if(remaining--===0)throw new Error(`Source script instruction limit reached at ${map.code}:${pc}`);
        if(movementFailure.failed)throw movementFailure.error;
        const instruction=map.scripts.instructions[pc++];if(!instruction)break;const [cmd,a]=instruction;this.instruction={map:map.code,command:cmd,pc:pc-1};
        if(cmd==='End'||cmd==='EndScript')break;
        this.supported.add(cmd);
        if(presentation.has(cmd))continue;
        if(cmd==='GoTo'){jump(a[0]);continue;}
        if(cmd==='Call'){stack.push(pc);jump(a[0]);continue;}
        if(cmd==='Return'){if(!stack.length)break;pc=stack.pop()!;continue;}
        if(cmd==='Compare'||cmd==='CompareVarToValue'||cmd==='CompareVars'){compare=v(a[0])-v(a[1]);continue;}
        if(cmd==='Switch'){switchValue=v(a[0]);continue;}
        if(cmd==='Case'){if(switchValue===v(a[0]))jump(a[1]);continue;}
        if(cmd==='GoToIfSet'||cmd==='GoToIfUnset'){if(!!this.state.flags[a[0]]===(cmd==='GoToIfSet'))jump(a[1]);continue;}
        if(cmd==='CallIfSet'||cmd==='CallIfUnset'){if(!!this.state.flags[a[0]]===(cmd==='CallIfSet')){stack.push(pc);jump(a[1]);}continue;}
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
        if(cmd==='Wait'){await new Promise(resolve=>setTimeout(resolve,Math.min(1000,v(a[0])*1000/60)));continue;}
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
        if(cmd==='GivePokedex'){this.state.pokedexEnabled=true;continue;}
        if(cmd==='CheckPokedex'){this.set(a[0],Number(!!this.state.pokedexEnabled));continue;}
        if(cmd==='SetMysteryGiftActive'){this.state.mysteryGiftEnabled=true;continue;}
        if(cmd==='SetSpawn'){this.state.lastHeal={...(await originalSpawn(v(a[0]))).death};continue;}
        if(cmd==='PhoneCall'){const args=a.map(v);this.set('VAR_SPECIAL_x8004',args[0]);this.set('VAR_SPECIAL_x8005',args[1]);this.set('VAR_SPECIAL_x8006',args[2]);await this.standard(this.data.constants.std_phone_call,object);continue;}
        if(cmd==='SetPhoneCall'){this.pendingPhone=[v(a[0]),v(a[1]),v(a[2])];continue;}
        if(cmd==='RunPhoneCall'){if(!this.pendingPhone)throw Error('Original phone call has no caller');await phoneCall(this.data,this.state,...this.pendingPhone,text=>this.hooks.message(this.text(text,map)),text=>this.hooks.choice(text));this.pendingPhone=null;continue;}
        if(cmd==='SetPhoneCallTrigger'||cmd==='UnsetPhoneCallTrigger'){this.state.phoneTriggers??=[];const id=v(a[0]);this.state.phoneTriggers=this.state.phoneTriggers.filter(trigger=>trigger!==id);if(cmd==='SetPhoneCallTrigger'&&v(a[1]))this.state.phoneTriggers.push(id);continue;}
        if(cmd==='GetFriendSprite'){this.set(a[0],this.data.constants[this.state.gender==='boy'?'SPRITE_HEROINE':'SPRITE_HERO']);continue;}
        if(cmd==='CheckBadge'){this.set(a[1],Number(this.state.badges.includes(v(a[0]))));continue;}
        if(cmd==='GetTrcardStars'){this.set(a[0],trainerCardStars(this.state));continue;}
        if(cmd==='GetCurrentTimeOfDay'){this.set(a[0],timeOfDay(new Date().getHours()));continue;}
        if(cmd==='GetCurrentMapId'){this.set(a[0],this.state.map);continue;}
        if(cmd==='GetPlayerState'){const pose=this.state.avatarState??0;this.set(a[0],pose===10?0:pose===12?3:pose);continue;}
        if(cmd==='SetAvatarBits'){const transitions:Record<number,number>={[this.data.constants.PLAYER_TRANSITION_WALKING]:0,[this.data.constants.PLAYER_TRANSITION_HEAL]:10,[this.data.constants.PLAYER_TRANSITION_ROCKET]:3,[this.data.constants.PLAYER_TRANSITION_ROCKET_HEAL]:12};const next=transitions[v(a[0])];if(next===undefined)throw new UnsupportedScript(map.code,cmd,pc-1);this.state.avatarState=next;continue;}
        if(cmd==='UpdateAvatarState')continue;
        if(cmd==='PartyCountNotEgg'){this.set(a[0],this.state.party.filter(mon=>!mon.isEgg).length);continue;}
        if(cmd==='PartyHasPokerus'){this.set(a[0],Number(this.state.party.some(mon=>!!mon.pokerus)));continue;}
        if(cmd==='PokeCenAnim'){if(!this.hooks.healAnimation)throw new UnsupportedScript(map.code,cmd,pc-1);await this.hooks.healAnimation(v(a[0]));continue;}
        if(cmd==='FollowMonHopIntoBall'){this.hooks.followerVisible?.(false);continue;}
        if(cmd==='GetWeekday'){this.set(a[0],new Date().getDay());continue;}
        if(cmd==='GiveRunningShoes'){this.state.runningShoes=true;continue;}
        if(cmd==='CheckRunningShoes'){this.set(a[0],Number(!!this.state.runningShoes));continue;}
        if(cmd==='RegisterGearNumber'||cmd==='RegisterPokegearCard'){this.state.pokegear??={contacts:[],cards:[]};if(cmd==='RegisterGearNumber'){if(!this.state.pokegear.contacts.includes(a[0]))this.state.pokegear.contacts.push(a[0]);}else if(!this.state.pokegear.cards.includes(v(a[0])))this.state.pokegear.cards.push(v(a[0]));continue;}
        if(cmd==='GetPartyCount'){this.set(a[0],this.state.party.length);continue;}
        if(cmd==='GetPartyLeadAlive'){this.set(a[0],Math.max(0,this.state.party.findIndex(m=>m.hp>0&&!m.isEgg)));continue;}
        if(cmd==='GetPartyMonSpecies'){this.set(a[1],this.state.party[v(a[0])]?.species||0);continue;}
        if(cmd==='GetPartyMonForm2'){this.set(a[1],0);continue;}
        if(cmd==='GetStarterChoice'){this.set(a[0],this.state.starter);continue;}
        if(cmd==='SetStarterChoice'){this.state.starter=v(a[0]);continue;}
        if(cmd==='ChooseStarter'){await this.hooks.chooseStarter();continue;}
        if(cmd==='NicknameInput'){await this.hooks.nickname(v(a[0]));this.set(a[1],0);continue;}
        if(cmd==='BufferPlayersName'){this.buffers[v(a[0])]=this.state.name;continue;}
        if(cmd==='BufferRivalsName'){this.buffers[v(a[0])]=this.state.rivalName;continue;}
        if(cmd==='BufferFriendsName'){this.buffers[v(a[0])]=this.state.gender==='boy'?'Lyra':'Ethan';continue;}
        if(cmd==='BufferMonSpeciesName'||cmd==='BufferPartyMonNick'||cmd==='BufferPartyMonSpeciesNameIndef'){const m=this.state.party[v(a[1])];this.buffers[v(a[0])]=m?(cmd==='BufferPartyMonNick'?m.name:cmd==='BufferPartyMonSpeciesNameIndef'?this.data.names.speciesIndefinite[m.species]:speciesName(this.data,m.species)):'';continue;}
        if(cmd==='BufferSpeciesName'){this.buffers[v(a[0])]=speciesName(this.data,v(a[1]));continue;}
        if(cmd==='BufferItemName'||cmd==='BufferItemNamePlural'||cmd==='BufferItemNameIndef'){const id=this.data.constants[this.itemKey(a[1],map)];this.buffers[v(a[0])]=this.data.names[cmd==='BufferItemNamePlural'?'itemsPlural':cmd==='BufferItemNameIndef'?'itemsIndefinite':'items'][id]||'';continue;}
        if(cmd==='GetItemPocket'){const item=this.data.items.find(item=>item.item===this.itemKey(a[0],map));this.set(a[1],this.data.constants[item?.fieldPocket||'POCKET_ITEMS']||0);continue;}
        if(cmd==='BufferPocketName'){const pockets=['Items','Medicine','Poké Balls','TMs & HMs','Berries','Mail','Battle Items','Key Items'];this.buffers[v(a[0])]=pockets[v(a[1])]||'Items';continue;}
        if(cmd==='BufferInteger'||cmd==='BufferNumber'){this.buffers[v(a[0])]=String(v(a[1]));continue;}
        if(cmd==='HasItem'||cmd==='CheckItemSpace'||cmd==='HasSpaceForItem'){const key=this.itemKey(a[0],map);this.set(a[2],cmd==='HasItem'?Number((this.state.bag[key]||0)>=v(a[1])):Number(hasBagSpace(this.data,this.state.bag,key,v(a[1]))));continue;}
        if(cmd==='GoToIfNoItemSpace'||cmd==='GoToIfNoItemSpace2'){const item=v(a[0]),quantity=v(a[1]);this.set('VAR_SPECIAL_x8004',item);this.set('VAR_SPECIAL_x8005',quantity);const result=Number(hasBagSpace(this.data,this.state.bag,this.itemKey(a[0],map),quantity));this.set('VAR_SPECIAL_RESULT',result);compare=result-(cmd==='GoToIfNoItemSpace'?0:1);if(!result)jump(a[2]);continue;}
        if(cmd==='GiveItemNoCheck'){const item=v(a[0]),quantity=v(a[1]);this.set('VAR_SPECIAL_x8004',item);this.set('VAR_SPECIAL_x8005',quantity);await this.standard(this.data.constants.std_give_item_verbose,object);continue;}
        if(cmd==='AddItem'||cmd==='GiveItem'){const result=addBagItem(this.data,this.state.bag,this.itemKey(a[0],map),v(a[1]));if(a[2])this.set(a[2],Number(result));continue;}
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
        if(cmd==='Warp'){await this.hooks.warp(v(a[0]),v(a[3]),v(a[4]));continue;}
        this.supported.delete(cmd);throw new UnsupportedScript(map.code,cmd,pc-1);
      }
      await Promise.all(pendingMoves);if(movementFailure.failed)throw movementFailure.error;await this.hooks.refresh();
    }catch(error){if(error instanceof UnsupportedScript)this.lastUnsupported={map:error.map,command:error.command,pc:error.pc};throw error;}
    finally{await Promise.allSettled(pendingMoves);this.busy=false;}
  }
}
