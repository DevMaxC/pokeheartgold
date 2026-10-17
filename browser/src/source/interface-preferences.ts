export type InterfacePreferences={music:boolean;volume:number;cameraSensitivity:number;textSpeed:0|1|2};
export const INTERFACE_PREFERENCES_KEY='heartgold-interface-v1';
export const defaultInterfacePreferences=():InterfacePreferences=>({music:true,volume:.55,cameraSensitivity:.8,textSpeed:1});
type PreferenceStorage=Pick<Storage,'getItem'|'setItem'>;
function finiteBetween(value:unknown,min:number,max:number):value is number{return typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;}
export function interfacePreferences(value:unknown):InterfacePreferences{
 const p=value as Partial<InterfacePreferences>|null,defaults=defaultInterfacePreferences();if(!p||typeof p!=='object')return defaults;
 return{music:typeof p.music==='boolean'?p.music:defaults.music,volume:finiteBetween(p.volume,0,1)?p.volume:defaults.volume,cameraSensitivity:finiteBetween(p.cameraSensitivity,.3,1.6)?p.cameraSensitivity:defaults.cameraSensitivity,textSpeed:[0,1,2].includes(p.textSpeed as number)?p.textSpeed!:defaults.textSpeed};
}
export function readInterfacePreferences(storage:PreferenceStorage|null):InterfacePreferences{try{const saved=JSON.parse(storage?.getItem(INTERFACE_PREFERENCES_KEY)??'null');return saved?.version===1?interfacePreferences(saved):defaultInterfacePreferences();}catch{return defaultInterfacePreferences();}}
export function writeInterfacePreferences(storage:PreferenceStorage|null,value:InterfacePreferences){const next=interfacePreferences(value);try{storage?.setItem(INTERFACE_PREFERENCES_KEY,JSON.stringify({version:1,...next}));}catch{/* Private mode must not disable the game or its sound controls. */}return next;}
