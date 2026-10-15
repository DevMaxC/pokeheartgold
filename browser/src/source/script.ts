import {speciesName,titleCase,healParty} from './data.ts';
import type {GameData,SourceMap,State} from './types.ts';
import {sourceJSON} from './types.ts';

export type ScriptHooks={
  message:(text:string)=>Promise<void>;choice:(text?:string)=>Promise<number>;
  move:(object:string,label:string,map:SourceMap)=>Promise<void>;position:(object:string,x:number,z:number,facing?:number)=>void;
  face:(object:string,facing?:number)=>void;visible:(object:string,value:boolean)=>void;
  chooseStarter:()=>Promise<void>;nickname:(index:number)=>Promise<void>;refresh:()=>Promise<void>;
  battle:(trainer:number)=>Promise<boolean>;warp:(map:number,x:number,z:number)=>Promise<void>;
};
export class UnsupportedScript extends Error{
  readonly map:string;readonly command:string;readonly pc:number;
  constructor(map:string,command:string,pc:number){super(`Unported source command ${command} at ${map}:${pc}`);this.map=map;this.command=command;this.pc=pc;}
}
// Only presentation commands may be ignored. Unknown gameplay commands stop explicitly.
const presentation=new Set(['Nop','Dummy','LockAll','ReleaseAll','Lock','Release','LockDir','PlaySE','WaitSE','PlayFanfare','WaitFanfare','PlayCry','WaitCry','CloseMsg','WaitButton','FadeScreen','WaitFade','FollowMonResetMovement','TouchscreenMenuHide','TouchscreenMenuShow','FollowingPokemonMovement','WaitFollowingPokemonMovement','ToggleFollowingPokemonMovement','FollowMonSetPositionNextToPlayer','FollowMonSpawnReleaseBall','PlaceStarterBallsInElmsLab','SetFollowingPokemonActive','RestoreOverworld','DrawPokemonPreview','HidePokemonPreview','ShowMoneyBox','HideMoneyBox','SetWeather','FadeOutBGM','PlayBGM','StopBGM','SetBGM','WaitABPress','SetWindow','ScrCmd_609']);
const standardCache=new Map<string,Promise<SourceMap>>();
export class ScriptVM{
  busy=false;lastUnsupported:{map:string;command:string;pc:number}|null=null;
  readonly supported=new Set<string>();
  buffers:Record<number,string>={};
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
  private async standard(id:number,object:string){const match=this.data.index.stdScripts.find(row=>id>=row.min);if(!match)throw new Error(`Missing original standard script ${id}`);if(!standardCache.has(match.bank))standardCache.set(match.bank,sourceJSON<SourceMap>(`scripts/${match.bank}.json`));const common=await standardCache.get(match.bank)!;const entry=common.scripts.entries[id-match.min];if(!entry)throw new Error(`Missing original standard entry ${id}`);const child=new ScriptVM(this.data,this.state,this.hooks);child.buffers=this.buffers;try{await child.run(common,entry,object,true);}finally{this.buffers=child.buffers;for(const command of child.supported)this.supported.add(command);}}
  text(message:string,map:SourceMap){
    const raw=map.messages[message]??message;
    return raw.replace(/\{STRVAR_1 (\d+), (\d+), \d+\}/g,(_,kind,slot)=>kind==='3'?this.state.name:this.buffers[Number(slot)]??(kind==='1'?this.state.rivalName:'')).replace(/\{YESNO \d+\}/g,'').replace(/\{[^}]+\}/g,'').replace(/\\n/g,'\n');
  }
  async run(map:SourceMap,script:string|number,object='obj_player',allowNested=false){
    if(this.busy&&!allowNested)return;
    if(script===0)return;
    this.busy=true;if(!allowNested)this.buffers={0:this.state.name};let pc=0,compare=0,switchValue=0,lastMessage='';const stack:number[]=[];let pendingMoves:Promise<void>[]=[];
    const scriptID=typeof script==='number'?script:this.value(script,map);if(scriptID>=2000){try{await this.standard(scriptID,object);}finally{this.busy=false;}return;}
    const entry=scriptID-1;
    let label=typeof script==='string'&&map.scripts.labels[script]!==undefined?script:map.scripts.entries[entry];
    if(label===undefined){this.busy=false;return;}
    pc=map.scripts.labels[label];
    const jump=(target:string)=>{if(map.scripts.labels[target]===undefined)throw new Error(`Missing original script label ${target}`);pc=map.scripts.labels[target];};
    const conditions:Record<string,()=>boolean>={Eq:()=>compare===0,Ne:()=>compare!==0,Lt:()=>compare<0,Gt:()=>compare>0,Le:()=>compare<=0,Ge:()=>compare>=0};
    const v=(s:string)=>this.value(s,map);
    try{
      for(let count=0;count<4000;count++){
        const instruction=map.scripts.instructions[pc++];if(!instruction)break;const [cmd,a]=instruction;
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
        if(cmd==='GetMenuChoice'||cmd==='YesNoBox'){this.set(a[0],await this.hooks.choice(lastMessage.split(/\\[rf]/).filter(Boolean).at(-1)));continue;}
        if(cmd==='Wait'){await new Promise(resolve=>setTimeout(resolve,Math.min(1000,v(a[0])*1000/60)));continue;}
        if(cmd==='ApplyMovement'){pendingMoves.push(this.hooks.move(a[0],a[1],map));continue;}
        if(cmd==='WaitMovement'){await Promise.all(pendingMoves);pendingMoves=[];continue;}
        if(cmd==='MovePersonFacing'){this.hooks.position(a[0],v(a[1]),v(a[3]),v(a[4]));continue;}
        if(cmd==='MovePerson'){this.hooks.position(a[0],v(a[1]),v(a[3]));continue;}
        if(cmd==='FacePlayer'){this.hooks.face(object);continue;}
        if(cmd==='ShowPerson'||cmd==='HidePerson'){this.hooks.visible(a[0],cmd==='ShowPerson');continue;}
        if(cmd==='GetPlayerCoords'){this.set(a[0],Math.floor(this.state.x));this.set(a[1],Math.floor(this.state.z));continue;}
        if(cmd==='GetPlayerFacing'){this.set(a[0],this.state.facing);continue;}
        if(cmd==='GetGender'){this.set(a[0],this.state.gender==='boy'?0:1);continue;}
        if(cmd==='GetFriendSprite'){this.set(a[0],this.data.constants[this.state.gender==='boy'?'SPRITE_HEROINE':'SPRITE_HERO']);continue;}
        if(cmd==='CheckBadge'){this.set(a[1],Number(this.state.badges.includes(v(a[0]))));continue;}
        if(cmd==='GetWeekday'){this.set(a[0],new Date().getDay());continue;}
        if(cmd==='GiveRunningShoes'){this.state.runningShoes=true;continue;}
        if(cmd==='CheckRunningShoes'){this.set(a[0],Number(!!this.state.runningShoes));continue;}
        if(cmd==='RegisterGearNumber'||cmd==='RegisterPokegearCard'){this.state.pokegear??={contacts:[],cards:[]};if(cmd==='RegisterGearNumber'){if(!this.state.pokegear.contacts.includes(a[0]))this.state.pokegear.contacts.push(a[0]);}else if(!this.state.pokegear.cards.includes(v(a[0])))this.state.pokegear.cards.push(v(a[0]));continue;}
        if(cmd==='GetPartyCount'){this.set(a[0],this.state.party.length);continue;}
        if(cmd==='GetPartyLeadAlive'){this.set(a[0],Math.max(0,this.state.party.findIndex(m=>m.hp>0)));continue;}
        if(cmd==='GetPartyMonSpecies'){this.set(a[1],this.state.party[v(a[0])]?.species||0);continue;}
        if(cmd==='GetPartyMonForm2'){this.set(a[1],0);continue;}
        if(cmd==='GetStarterChoice'){this.set(a[0],this.state.starter);continue;}
        if(cmd==='SetStarterChoice'){this.state.starter=v(a[0]);continue;}
        if(cmd==='ChooseStarter'){await this.hooks.chooseStarter();continue;}
        if(cmd==='NicknameInput'){await this.hooks.nickname(v(a[0]));this.set(a[1],0);continue;}
        if(cmd==='BufferPlayersName'){this.buffers[v(a[0])]=this.state.name;continue;}
        if(cmd==='BufferRivalsName'){this.buffers[v(a[0])]=this.state.rivalName;continue;}
        if(cmd==='BufferFriendsName'){this.buffers[v(a[0])]=this.state.gender==='boy'?'Lyra':'Ethan';continue;}
        if(cmd==='BufferMonSpeciesName'||cmd==='BufferPartyMonNick'){const m=this.state.party[v(a[1])];this.buffers[v(a[0])]=m?(cmd==='BufferPartyMonNick'?m.name:speciesName(this.data,m.species)):'';continue;}
        if(cmd==='BufferSpeciesName'){this.buffers[v(a[0])]=speciesName(this.data,v(a[1]));continue;}
        if(cmd==='BufferItemName'||cmd==='BufferItemNamePlural'){this.buffers[v(a[0])]=titleCase(this.itemKey(a[1],map));continue;}
        if(cmd==='GetItemPocket'){const item=this.data.items.find(item=>item.item===this.itemKey(a[0],map));this.set(a[1],this.data.constants[item?.fieldPocket||'POCKET_ITEMS']||0);continue;}
        if(cmd==='BufferPocketName'){const pockets=['Items','Medicine','Poké Balls','TMs & HMs','Berries','Mail','Battle Items','Key Items'];this.buffers[v(a[0])]=pockets[v(a[1])]||'Items';continue;}
        if(cmd==='BufferInteger'||cmd==='BufferNumber'){this.buffers[v(a[0])]=String(v(a[1]));continue;}
        if(cmd==='HasItem'||cmd==='CheckItemSpace'){const key=this.itemKey(a[0],map),max=/ITEM_(TM|HM)\d+/.test(key)?99:999;this.set(a[2],cmd==='HasItem'?Number((this.state.bag[key]||0)>=v(a[1])):Number((this.state.bag[key]||0)+v(a[1])<=max));continue;}
        if(cmd==='AddItem'||cmd==='GiveItem'||cmd==='GiveItemNoCheck'){const key=this.itemKey(a[0],map);this.state.bag[key]=(this.state.bag[key]||0)+v(a[1]);if(a[2])this.set(a[2],1);continue;}
        if(cmd==='TakeItem'||cmd==='RemoveItem'){const key=this.itemKey(a[0],map);this.state.bag[key]=Math.max(0,(this.state.bag[key]||0)-v(a[1]));if(a[2])this.set(a[2],1);continue;}
        if(cmd==='HealParty'){healParty(this.state);continue;}
        if(cmd==='CountMailboxMessages'){this.set(a[0],0);continue;}
        if(cmd==='Random'){this.set(a[0],Math.floor(Math.random()*v(a[1])));continue;}
        if(cmd==='CallStd'){
          if(/music|bgm/i.test(a[0]))continue;
          await this.standard(v(a[0]),object);continue;
        }
        if(cmd==='RestartCurrentScript')continue; // Awaited child context resumes its caller on return.
        if(cmd==='TrainerBattle'){this.set('VAR_SPECIAL_RESULT',Number(await this.hooks.battle(v(a[0]))));continue;}
        if(cmd==='Warp'){await this.hooks.warp(v(a[0]),v(a[3]),v(a[4]));continue;}
        this.supported.delete(cmd);throw new UnsupportedScript(map.code,cmd,pc-1);
      }
      await Promise.all(pendingMoves);await this.hooks.refresh();
    }catch(error){if(error instanceof UnsupportedScript)this.lastUnsupported={map:error.map,command:error.command,pc:error.pc};throw error;}
    finally{this.busy=false;}
  }
}
