import {sourceJSON,type GameData,type State,type SourceMap} from './types.ts';
type PhoneData={scripts:Record<number,{messages:[number,number][];scriptType:string;param0:string;param1:string}>;elmMapScripts:number[]};
let definitions:Promise<PhoneData>|null=null;
/** Selection follows phone_scripts_prof_elm.c and phone_scripts_mother.c. */
export async function phoneCall(data:GameData,state:State,contact:number,scripted:number,predefined:number,message:(text:string)=>Promise<void>,choice:(text?:string)=>Promise<number>){
  definitions??=sourceJSON<PhoneData>('phone.json');const phone=await definitions;let script=0,name='';
  if(contact===data.constants.PHONE_CONTACT_PROF__ELM){name='Professor Elm';if(scripted===2)script=phone.elmMapScripts[predefined];else{
    const map=await sourceJSON<SourceMap>(`maps/${state.map}.json`),f=state.flags;
    if(map.fields.mapsec==='MAPSEC_NEW_BARK_TOWN')script=1;else if(!f.FLAG_GOT_ELMS_PANIC_CALL)script=8;else if(!f.FLAG_GAVE_RIVAL_NAME_TO_OFFICER)script=9;else if(!f.FLAG_GOT_PICK_UP_EGG_CALL_FROM_ELM)script=10;else if(!f.FLAG_GOT_EGG_FROM_ELMS_ASSISTANT)script=11;
    else if(state.badges.length<7)script=!f.FLAG_SYS_HATCHED_TOGEPI_EGG?12:f.FLAG_GOT_EVERSTONE_FROM_ELM?14+Math.floor(Math.random()*2):13;
    else {const key='VAR_SCENE_ROCKET_TAKEOVER',takeover=state.vars['#'+data.constants[key]]??state.vars[key]??0;if(takeover>=2&&takeover<=4)script=16;else if(state.badges.length<8)script=17;else if(!f.FLAG_GAME_CLEAR)script=18;else if(!f.FLAG_GOT_SS_TICKET_FROM_ELM)script=19;else script=f.FLAG_SYS_HATCHED_TOGEPI_EGG&&!f.FLAG_GOT_EVERSTONE_FROM_ELM?13:!f.FLAG_SYS_HATCHED_TOGEPI_EGG?12:20+Math.floor(Math.random()*(f.FLAG_WAS_TOLD_ABOUT_POKERUS?3:2));}
  }}else if(contact===data.constants.PHONE_CONTACT_PROF__OAK&&scripted===2){name='Professor Oak';script=82;}
  else if(contact===data.constants.PHONE_CONTACT_MOTHER&&scripted===2){const bank=await sourceJSON<Record<string,string>>('messages/664.json');state.flags.FLAG_TALKED_TO_MOM_AFTER_NAMING_RIVAL=true;await message('Mom: '+bank[22]);const saving=await choice(bank[22])===0;state.flags.FLAG_SYS_MOMS_SAVINGS=saving;await message('Mom: '+bank[saving?25:26]);return;}
  else throw Error(`Unported original phone caller/context ${contact}:${scripted}:${predefined}`);
  const definition=phone.scripts[script];if(!definition)throw Error(`Missing original phone script ${script}`);
  if(!['PHONESCRIPTTYPE_NONE','PHONESCRIPTTYPE_FLAG'].includes(definition.scriptType))throw Error(`Unported phone script effect ${definition.scriptType}`);
  const [bank,id]=definition.messages[state.gender==='boy'?0:1],messages=await sourceJSON<Record<string,string>>(`messages/${bank}.json`);if(messages[id]===undefined)throw Error(`Missing phone dialogue ${bank}:${id}`);await message(name+': '+messages[id]);
  if(definition.scriptType==='PHONESCRIPTTYPE_FLAG')state.flags[definition.param1]=definition.param0!=='0';
}
