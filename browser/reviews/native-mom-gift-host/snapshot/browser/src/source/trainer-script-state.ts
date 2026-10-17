import {sourceJSON,type GameData,type State} from './types.ts';

export const TRAINER_FLAG_BASE=0x550;
export const TRAINER_APPROACH_SCRIPT=3739; // std_trainer(LAST_TRAINER_INDEX)
/** Excludes the shared approach entry, which is not an individual trainer. */
export function trainerIdForScript(script:number):number|null{
 const base=script>=5000?5000:3000,id=script-base+1;
 return script>=base&&id>0&&id<740?id:null;
}
export function trainerDefeated(state:State,id:number){return !!state.flags['#'+(TRAINER_FLAG_BASE+id)];}
export function setTrainerDefeated(state:State,id:number,defeated=true){state.flags['#'+(TRAINER_FLAG_BASE+id)]=defeated;}
export type TrainerContact={id:number;key:string;trainer:number;gift:number;messageBank:number};
export type TrainerContacts={contacts:TrainerContact[];rematchSets:number[][]};
let contacts:Promise<TrainerContacts>|undefined;
export function trainerContacts(){if(!contacts){const loading:Promise<TrainerContacts>=sourceJSON<TrainerContacts>('trainer-contacts.json').catch(error=>{if(contacts===loading)contacts=undefined;throw error;});contacts=loading;}return contacts;}
export function phoneContactKey(data:GameData,id:number){return id===255?undefined:Object.keys(data.constants).find(key=>key.startsWith('PHONE_CONTACT_')&&data.constants[key]===id);}
function flagAt(data:GameData,state:State,id:number){const key=Object.keys(data.constants).find(key=>key.startsWith('FLAG_')&&data.constants[key]===id);return !!(state.flags['#'+id]??(key?state.flags[key]:false));}
/** phone_rematch.c / trainer_rematch.c. Scheduling calls is a separate field service. */
export function phoneRematchTrainer(data:GameData,state:State,book:TrainerContacts,contact:number,time:number){
 if(!state.trainerPhone?.seeking.includes(contact)||contact===16&&time!==1)return 0;
 const entry=book.contacts[contact],set=entry&&book.rematchSets.find(row=>row[0]===entry.trainer);if(!set)return 0;
 let index=5;for(let i=1;i<6;i++){if(set[i]===0){index=i-1;break;}if(set[i]!==0xffff&&!trainerDefeated(state,set[i])){index=i;break;}}
 if(index&&!flagAt(data,state,(data.constants.FLAG_UNK_97B??0x97b)+index)){do{index--;}while(index>0&&set[index]===0xffff);}
 return set[index];
}
