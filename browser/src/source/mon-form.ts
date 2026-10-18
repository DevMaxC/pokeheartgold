import {calculateStats} from './data.ts';
import {nativeMonGender} from './gender.ts';
import type {BrowserFormMetadataAdmission,GameData,Mon,State} from './types.ts';

/** pokemon.c:SanitizeMonForm cases. Missing metadata on these native form
 * families is deliberately outside the browser base-form compatibility policy. */
export const AMBIGUOUS_LEGACY_FORM_SPECIES=Object.freeze(['SPECIES_BURMY','SPECIES_WORMADAM','SPECIES_SHELLOS','SPECIES_GASTRODON','SPECIES_CHERRIM','SPECIES_ARCEUS','SPECIES_CASTFORM','SPECIES_DEOXYS','SPECIES_UNOWN','SPECIES_SHAYMIN','SPECIES_ROTOM','SPECIES_GIRATINA','SPECIES_PICHU']as const);
type FormData=Pick<GameData,'personal'|'moves'|'growth'|'constants'>;
type FormState=Pick<State,'version'|'party'|'boxes'|'formMetadata'>;
type Place={location:'party'|'boxes';index:number};
export type BrowserFormMigrationReceipt=Readonly<{policy:'local-browser-v2-base-form';admission:'migrated'|'already-marked';kind:'complete'|'partial';changed:readonly Readonly<Place&{species:number;form:0;basis:'legacy-browser-base-form-compatibility'}>[];retained:number;unresolved:readonly Readonly<Place&{reason:string}>[]}>;
export class UnsupportedBrowserFormAdmission extends Error{constructor(message:string){super(message);this.name='UnsupportedBrowserFormAdmission';}}
const fail=(message:string):never=>{throw new UnsupportedBrowserFormAdmission(message);};
const integer=(v:unknown,min:number,max:number):v is number=>Number.isInteger(v)&&Number(v)>=min&&Number(v)<=max;
function ordinary(v:unknown):v is Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))return false;return Reflect.ownKeys(v).every(k=>typeof k==='string'&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)!,'value'));}
const required=['species','level','name','gender','hp','maxHP','exp','ivs','evs','nature','personality','status','sleepTurns','moves','stats','friendship','heldItem','ot','id'];
const optional=['form','hasNickname','isEgg','checksumFailed'];
function factoryShape(data:FormData,mon:Record<string,unknown>):string|null{
 if(Object.keys(mon).some(k=>![...required,...optional].includes(k)))return'unsupported-record-extension';
 if(required.some(k=>!Object.hasOwn(mon,k)))return'incomplete-legacy-factory-record';
 if(!integer(mon.species,1,493)||!integer(mon.level,1,100)||!integer(mon.personality,0,0xffffffff)||!integer(mon.id,0,0xfffffffe)||!integer(mon.nature,0,24)||mon.nature!==mon.personality%25)return'invalid-factory-identity-or-level';
 const base=data.personal[mon.species];if(!base||data.constants['SPECIES_'+base.species]!==mon.species||![0,.125,.25,.5,.75,1,2].includes(base.genderRatio))return'unsupported-original-species';
 if(typeof mon.name!=='string'||!mon.name.length||typeof mon.ot!=='string')return'invalid-factory-text';
 // These are factory shape/gender consistency checks, NEVER OT/ownership proof.
 if(mon.gender!==nativeMonGender(base.genderRatio,mon.personality))return'invalid-factory-gender';
 if(!integer(mon.maxHP,1,65535)||!integer(mon.hp,0,mon.maxHP)||!integer(mon.exp,0,0xffffffff)||!integer(mon.friendship,0,255)||!integer(mon.sleepTurns,0,7)||!['','SLP','PSN','TOX','BRN','FRZ','PAR'].includes(mon.status as string))return'invalid-factory-battle-data';
 for(const[field,max]of[['ivs',31],['evs',255]]as const){const values=mon[field];if(!Array.isArray(values)||values.length!==6||values.some(v=>!integer(v,0,max)))return'invalid-factory-'+field;}
 if((mon.evs as number[]).reduce((a,b)=>a+b,0)>510)return'invalid-factory-ev-total';
 if(!ordinary(mon.stats)||Object.keys(mon.stats).length!==5||!['atk','def','spatk','spdef','speed'].every(k=>integer((mon.stats as Record<string,unknown>)[k],1,65535)))return'invalid-factory-stats';
 const minimum=calculateStats(base,mon.level,mon.ivs as number[],Array(6).fill(0),mon.nature),maximum=calculateStats(base,mon.level,mon.ivs as number[],mon.evs as number[],mon.nature);if(mon.maxHP<minimum.maxHP||mon.maxHP>maximum.maxHP||!Object.keys(minimum.stats).every(k=>Number((mon.stats as Record<string,unknown>)[k])>=minimum.stats[k as keyof typeof minimum.stats]&&Number((mon.stats as Record<string,unknown>)[k])<=maximum.stats[k as keyof typeof maximum.stats]))return'inconsistent-factory-stat-range';
 const growth=data.growth[base.growthRate];if(!Array.isArray(growth)||!integer(growth[mon.level],0,0xffffffff)||Number(mon.exp)<growth[mon.level]||(mon.level<100&&Number(mon.exp)>=growth[mon.level+1]))return'invalid-factory-experience';
 if(mon.heldItem!==null&&(typeof mon.heldItem!=='string'||!/^ITEM_\w+$/.test(mon.heldItem)||!integer(data.constants[mon.heldItem],1,65535)))return'invalid-factory-held-item';
 if(!Array.isArray(mon.moves)||mon.moves.length>4||new Set(mon.moves.map(m=>m?.id)).size!==mon.moves.length)return'invalid-factory-moves';
 for(const move of mon.moves){if(!ordinary(move)||Object.keys(move).length!==3||!integer(move.id,1,65535)||!data.moves[move.id]||move.maxPP!==data.moves[move.id].pp||!integer(move.pp,0,Number(move.maxPP)))return'unsupported-factory-move-record';}
 if(Object.hasOwn(mon,'hasNickname')&&typeof mon.hasNickname!=='boolean')return'invalid-nickname-metadata';
 return null;
}

/** ONE-TIME explicit local-v2 browser compatibility, not historic native form or
 * ownership recovery. The host attests SAVE_KEY origin BEFORE queue/Recovery.
 * It must report unresolved records; no later evolution poll may infer again.
 * Never reads State.name, trainerId or Mon.ot/id/name as ownership evidence. */
export function migrateLegacyBrowserForms(data:FormData,state:FormState,context:{origin:'local-browser-v2'}):BrowserFormMigrationReceipt{
 if(context?.origin!=='local-browser-v2'||!ordinary(state)||state.version!==2||!Array.isArray(state.party)||state.party.length>6||!Array.isArray(state.boxes)||state.boxes.length>540)fail('Form admission requires an explicitly attested local browser version2 save');
 const marker=state.formMetadata;if(marker!==undefined&&(!ordinary(marker)||Object.keys(marker).length!==2||marker.version!==1||!['fresh-browser','migrated-local-v2'].includes(marker.origin as string)))fail('Unknown browser form admission marker');
 if(!data||!Array.isArray(data.personal)||!Array.isArray(data.moves)||!data.constants||!data.growth)fail('Form admission needs original factory data');
 const ambiguous=new Set<number>();for(const key of AMBIGUOUS_LEGACY_FORM_SPECIES){const id=data.constants[key];if(!integer(id,1,493))fail('Missing original form family '+key);ambiguous.add(id);}
 const infer=marker===undefined,changed:BrowserFormMigrationReceipt['changed'][number][]=[],unresolved:BrowserFormMigrationReceipt['unresolved'][number][]=[],writes:{mon:Mon;before:PropertyDescriptor|undefined}[]=[];let retained=0;
 const references=new Map<object,number>();for(const rows of[state.party,state.boxes])for(let i=0;i<rows.length;i++){if(!Object.hasOwn(rows,i))fail('Sparse browser party/box arrays are unsupported');const m=rows[i];if(m&&typeof m==='object')references.set(m,(references.get(m)??0)+1);}
 for(const location of['party','boxes']as const)state[location].forEach((value,index)=>{const at={location,index},unknown=(reason:string)=>unresolved.push(Object.freeze({...at,reason}));if(!ordinary(value)){unknown('invalid-record');return;}const mon=value as unknown as Mon;
  if(references.get(mon)!==1){unknown('aliased-record');return;}
  if(value.checksumFailed===true){unknown('corrupt-mon');return;}
  if((Object.hasOwn(value,'isEgg')&&typeof value.isEgg!=='boolean')||(Object.hasOwn(value,'checksumFailed')&&value.checksumFailed!==false)){unknown('invalid-egg-or-corruption-metadata');return;}
  // Already-known forms are authoritative metadata, not a migration candidate.
  // Do not reject actual hatched mons/known Eggs merely for provenance/PP/extensions.
  if(value.form!==undefined){if(integer(value.form,0,31))retained++;else unknown('invalid-present-form');return;}
  if(Object.hasOwn(value,'provenance')||Object.hasOwn(value,'foreign')||Object.hasOwn(value,'origin')){unknown('explicit-native-or-foreign-provenance');return;}
  if(value.isEgg===true){unknown('egg-not-in-browser-form-policy');return;}
  const reason=factoryShape(data,value);if(reason){unknown(reason);return;}
  if(!infer){unknown('required-form-missing-after-admission');return;}
  if(ambiguous.has(mon.species)){unknown('ambiguous-native-form-family');return;}
  const before=Object.getOwnPropertyDescriptor(mon,'form');if(before?(!before.writable):!Object.isExtensible(mon)){unknown('unwritable-form');return;}
  writes.push({mon,before});changed.push(Object.freeze({...at,species:mon.species,form:0,basis:'legacy-browser-base-form-compatibility'}));
 });
 // Plan everything first. Only plain own data properties are written, with no
 // user callbacks/await; rollback descriptors if an unexpected write rejects.
 const mark=Object.getOwnPropertyDescriptor(state,'formMetadata');if(infer&&(mark?!mark.writable:!Object.isExtensible(state)))fail('Browser form admission marker is not writable');
 const applied:typeof writes=[];try{for(const w of writes){Object.defineProperty(w.mon,'form',w.before?{...w.before,value:0}:{value:0,writable:true,configurable:true,enumerable:true});applied.push(w);}if(infer)Object.defineProperty(state,'formMetadata',mark?{...mark,value:{version:1,origin:'migrated-local-v2'}satisfies BrowserFormMetadataAdmission}:{value:{version:1,origin:'migrated-local-v2'}satisfies BrowserFormMetadataAdmission,writable:true,configurable:true,enumerable:true});}catch(error){for(const w of applied.reverse())if(w.before)Object.defineProperty(w.mon,'form',w.before);else delete w.mon.form;throw error;}
 return Object.freeze({policy:'local-browser-v2-base-form',admission:infer?'migrated':'already-marked',kind:unresolved.length?'partial':'complete',changed:Object.freeze(changed),retained,unresolved:Object.freeze(unresolved)});
}
