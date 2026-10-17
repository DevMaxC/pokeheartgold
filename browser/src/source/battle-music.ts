import {UnsupportedNativeMusic,type NativeMusicCue,type NativeFieldCatalog} from './field-music.ts';
export type NativeBattleMusicRules={
 trainerClasses:{id:number;key:string;param:number}[];
 wildSpecies:{id:number;key:string;param:number}[];
 parameters:{transition:number;cue:NativeMusicCue}[];
 mapRegions:Record<string,number>;
 palParkMap:number;kantoFlypointFlag:string;kantoFlypointFlagId:number;
 regionRemaps:Record<string,NativeMusicCue>;alwaysTrueGymGuard:true;
};
export type NativeBattleMusicSetup={battleType:number;mapId:number;trainerClass?:number;leadSpecies?:number;flags:Record<string,boolean>};
/** Literal BattleSetup_GetTransitionAndMusicParam / GetWildBattleMusic selector.
 * Inputs are actual native setup values. It selects music only and does not
 * claim the special battle modes/transition effects themselves are supported.
 */
export function nativeBattleMusic(catalog:NativeFieldCatalog&{battle?:NativeBattleMusicRules},setup:NativeBattleMusicSetup):{cue:NativeMusicCue;parameter:number}{
 const rules=catalog.battle;if(!rules||rules.parameters.length!==45||rules.alwaysTrueGymGuard!==true)throw new UnsupportedNativeMusic('Original battle music rules are not catalogued');
 const {battleType,mapId,flags}=setup;
 if(!Number.isInteger(battleType)||battleType<0||battleType>0xffffffff||!Number.isInteger(mapId)||rules.mapRegions[String(mapId)]===undefined)throw Error('Actual native battle type and map required for music');
 let parameter:number;
 if(battleType&1){
  if(!Number.isInteger(setup.trainerClass)||setup.trainerClass!<0)throw Error('Actual original trainer class required for trainer music');
  parameter=rules.trainerClasses.find(row=>row.id===setup.trainerClass)?.param??41;
  if(battleType&0x80)parameter=parameter===39?39:(battleType&2?37:35);
  else if(!(parameter>=29&&parameter<=34)&&parameter!==43&&parameter!==44){if(battleType&2)parameter=37;else if(battleType&4)parameter=36;}
 }else{
  if(!Number.isInteger(setup.leadSpecies)||setup.leadSpecies!<1||setup.leadSpecies!>493)throw Error('Actual first alive enemy species required for wild music');
  parameter=mapId===rules.palParkMap?42:(rules.wildSpecies.find(row=>row.id===setup.leadSpecies)?.param??42);
  if(parameter>=42&&(battleType&2))parameter=38;
 }
 let cue=rules.parameters[parameter]?.cue;if(!cue)throw new UnsupportedNativeMusic('Original battle music parameter missing: '+parameter);
 // Native BattleIntroConfig_AlwaysTrue prevents its third (Gym) regional
 // remap. The wild/trainer remaps require the actual Vermilion flypoint flag.
 if((flags[rules.kantoFlypointFlag]||flags['#'+rules.kantoFlypointFlagId])&&rules.mapRegions[String(mapId)]!==0)cue=rules.regionRemaps[String(cue.id)]??cue;
 return{cue:{...cue},parameter};
}
