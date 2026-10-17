import {NATIVE_SPECIES_NICKNAMES,NATIVE_SPECIES_NICKNAME_CODES,NATIVE_NICKNAME_GLYPHS,NATIVE_NICKNAME_PROVENANCE} from './nickname-data.ts';
import type {GameData,Mon,State} from './types.ts';

type NameData=Pick<GameData,'names'>;
export type NativeNicknameInputCode=0|1;
export type NativeNicknameResult={kind:'no-input'}|{kind:'named';name:string};
export class UnsupportedNativeNickname extends Error{
 constructor(message:string){super(message);this.name='UnsupportedNativeNickname';}
}
function unsupported(message:string):never{throw new UnsupportedNativeNickname(message);}
/** Required original English237 row. The display TitleCase fallback is not
 * evidence for native default-name/flag semantics. Index0/494/495 are retained
 * as original bank entries; migration admits only national non-Egg1..493. */
export function canonicalNativeSpeciesName(data:NameData,species:number):string{
 if(!Number.isInteger(species)||species<0||species>=NATIVE_SPECIES_NICKNAMES.length)unsupported('Native nickname requires an original species-name index');
 const value=NATIVE_SPECIES_NICKNAMES[species];
 if(data.names?.species?.[species]!==value)unsupported('Missing or incompatible original English species-name row '+species);
 return value;
}
/** Exact unambiguous source glyphs +EOS. No trimming, case folding, Unicode
 * normalization, replacement glyphs or implicit truncation. This is storage
 * encoding, not a claim that the English naming keyboard admits every glyph. */
export function nativeNicknameCodes(name:string):readonly number[]{
 if(typeof name!=='string')unsupported('Nickname input must be an explicit string');
 const chars=Array.from(name);if(chars.length>NATIVE_NICKNAME_PROVENANCE.maxLength)unsupported('Native nickname exceeds10 glyphs');
 const result=chars.map(char=>{if(!Object.hasOwn(NATIVE_NICKNAME_GLYPHS,char))unsupported('Unrepresented or ambiguous native nickname glyph');return NATIVE_NICKNAME_GLYPHS[char];});
 return Object.freeze([...result,NATIVE_NICKNAME_PROVENANCE.eos]);
}
function same(a:readonly number[],b:readonly number[]){let i=0;while(a[i]===b[i]){if(a[i]===65535)return true;i++;}return false;}

/** Native naming-screen blank/all-CHAR_SPACE behavior. An explicit no-input
 * result may also originate in caller cancellation; it never changes a Mon. */
export function resolveNativeNicknameInput(input:string|null):NativeNicknameResult{
 if(input===null)return{kind:'no-input'};
 const codes=nativeNicknameCodes(input);
 return codes.length===1||codes.slice(0,-1).every(code=>code===NATIVE_NICKNAME_PROVENANCE.space)?{kind:'no-input'}:{kind:'named',name:input};
}
/** Field Task_NamingScreen also compares with its current/default nickname.
 * Capture/hatch own separate noInput flows: use resolveNativeNicknameInput,
 * not this field-only unchanged-name rule, for those callers. */
export function resolveNativeFieldNicknameInput(mon:Pick<Mon,'name'>,input:string|null):NativeNicknameResult{
 if(!mon||typeof mon.name!=='string')unsupported('Missing native field nickname subject');
 const result=resolveNativeNicknameInput(input);
 if(result.kind==='no-input')return result;
 return result.name===mon.name?{kind:'no-input'}:result;
}

/** pokemon.c MON_DATA attribute118 FLAT_COMPARE (also120 STRING_AND_FLAG): compare
 * against the species default then copy. Return is the field naming noInput
 * ABI0/1, never void. A named canonical input clears an existing true flag;
 * explicit no-input leaves even a canonical-looking true flag untouched. */
export function applyNativeNicknameResult(data:NameData,mon:Pick<Mon,'species'|'name'|'hasNickname'>,result:NativeNicknameResult):NativeNicknameInputCode{
 if(!mon||typeof mon.name!=='string'||!Number.isInteger(mon.species)||mon.species<0||mon.species>=NATIVE_SPECIES_NICKNAMES.length)unsupported('Missing native nickname subject');
 if(result?.kind==='no-input')return 1;
 if(result?.kind!=='named')unsupported('Missing resolved native nickname result');
 const resolved=resolveNativeNicknameInput(result.name);if(resolved.kind!=='named')unsupported('Blank native naming must be represented as no-input');
 canonicalNativeSpeciesName(data,mon.species);
 const hasNickname=!same(nativeNicknameCodes(result.name),NATIVE_SPECIES_NICKNAME_CODES[mon.species]);
 mon.name=result.name;mon.hasNickname=hasNickname;return 0;
}
export function applyNativeFieldNicknameInput(data:NameData,mon:Pick<Mon,'species'|'name'|'hasNickname'>,input:string|null):NativeNicknameInputCode{return applyNativeNicknameResult(data,mon,resolveNativeFieldNicknameInput(mon,input));}

export type BrowserNicknameMigrationReceipt=Readonly<{
 policy:'local-browser-v2-name-preservation';kind:'complete'|'partial';
 admission:'migrated'|'already-marked';
 changed:readonly Readonly<{location:'party'|'boxes';index:number;species:number;hasNickname:boolean;basis:'exact-canonical'|'preserve-existing-text'}>[];
 retained:number;skippedEggs:number;
 unresolved:readonly Readonly<{location:'party'|'boxes';index:number;reason:string}>[];
}>;
/** ONE-TIME, explicit browser compatibility policy BEFORE queue admission.
 * It cannot recover a historic raw DS flag. Missing exact-current-canonical
 * names become false; ALL other existing names become true to preserve text,
 * including TitleCase defaults/arbitrary legacy Unicode. Present booleans are
 * authoritative. A persisted browser marker prevents inference on later
 * Continue/admission calls. Fresh browser states start with that marker.
 * No caller may infer again on each evolution/queue poll.
 * Partial/unresolved records remain without fabricated metadata; queue's
 * required boolean port must still reject them if an actual slot needs it. */
export function migrateLegacyBrowserNicknames(data:NameData,state:Pick<State,'version'|'party'|'boxes'|'nicknameMetadata'>,context:{origin:'local-browser-v2'}):BrowserNicknameMigrationReceipt{
 if(context?.origin!=='local-browser-v2'||state?.version!==2||!Array.isArray(state.party)||!Array.isArray(state.boxes))unsupported('Nickname migration requires an explicitly admitted local browser version2 save');
 const marker=state.nicknameMetadata;
 if(marker!==undefined&&(!marker||marker.version!==1||(marker.origin!=='fresh-browser'&&marker.origin!=='migrated-local-v2')))unsupported('Unknown browser nickname admission marker');
 const infer=marker===undefined;
 const changed:BrowserNicknameMigrationReceipt['changed'][number][]=[],unresolved:BrowserNicknameMigrationReceipt['unresolved'][number][]=[],writes:{mon:Mon;flag:boolean}[]=[];let retained=0,skippedEggs=0;
 for(const location of['party','boxes']as const)state[location].forEach((mon,index)=>{
  const unknown=(reason:string)=>unresolved.push(Object.freeze({location,index,reason}));
  if(!mon||typeof mon!=='object'){unknown('invalid-mon');return;}
  if(mon.isEgg){skippedEggs++;return;}
  if(mon.checksumFailed){unknown('corrupt-mon');return;}
  if(!Number.isInteger(mon.species)||mon.species<1||mon.species>493||typeof mon.name!=='string'||!mon.name.length){unknown('invalid-species-or-name');return;}
  if(typeof mon.hasNickname==='boolean'){retained++;return;}
  if(mon.hasNickname!==undefined){unknown('invalid-present-flag');return;}
  if(mon.provenance?.language!==undefined&&mon.provenance.language!==2){unknown('foreign-language-not-in-browser-policy');return;}
  if(!infer){unknown('required-flag-missing-after-admission');return;}
  let canonical:string;try{canonical=canonicalNativeSpeciesName(data,mon.species);}catch(error){if(error instanceof UnsupportedNativeNickname){unknown('missing-original-canonical-name');return;}throw error;}
  const flag=mon.name!==canonical;writes.push({mon,flag});changed.push(Object.freeze({location,index,species:mon.species,hasNickname:flag,basis:flag?'preserve-existing-text':'exact-canonical'}));
 });
 // All ordinary validation/lookup work finishes before the synchronous writes.
 for(const{mon,flag}of writes)mon.hasNickname=flag;
 if(infer)state.nicknameMetadata={version:1,origin:'migrated-local-v2'};
 return Object.freeze({policy:'local-browser-v2-name-preservation',kind:unresolved.length?'partial':'complete',admission:infer?'migrated':'already-marked',changed:Object.freeze(changed),retained,skippedEggs,unresolved:Object.freeze(unresolved)});
}
