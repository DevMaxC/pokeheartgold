import type {State} from './types.ts';
import {NATIVE_GAME_STAT_RULES as rules} from './game-stat-rules.ts';
/** src/game_stats.c:275–293. Missing old-save counters read as native zero. */
export function gameStatMaximum(index:number){
 if(!Number.isInteger(index)||index<0||index>=rules.extraWide.length)throw RangeError('Unknown native game-stat index '+index);
 return index<rules.wordCount?(rules.extraWide[index]?999999999:999999):(rules.extraWide[index]?65535:9999);
}
export function gameStat(state:State,index:number){return Math.min(gameStatMaximum(index),state.gameStats?.[index]??0);}
/** AddSpecialGameStat reads a literal event ID and changes GAME_STAT_SCORE,
 * not a counter with that event number. Native AddScore has its own99M cap. */
export function addSpecialGameStat(state:State,event:number){
 if(!Number.isInteger(event)||event<0||event>=rules.scoreModifiers.length)throw RangeError('Unknown native score event '+event);
 const value=Math.min(rules.scoreLimit,gameStat(state,rules.scoreStat)+rules.scoreModifiers[event]);state.gameStats??={};state.gameStats[rules.scoreStat]=value;return value;
}
/** Native badge bitset semantics: each of the16 badges can only be set once. */
export function giveBadge(state:State,index:number){
 if(!Number.isInteger(index)||index<0||index>=16)throw RangeError('Unknown native badge '+index);
 if(!state.badges.includes(index))state.badges.push(index);
}
export function countBadges(state:State){return new Set(state.badges.filter(index=>Number.isInteger(index)&&index>=0&&index<16)).size;}
