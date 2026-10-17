import type {State} from './types.ts';
// src/gf_rtc.c: GF_RTC_GetTimeOfDayByHour.
export function timeOfDay(hour:number){return hour<4?4:hour<10?0:hour<17?1:hour<20?2:3;}
// src/trainer_card_data.c and pokedex.c: the five independent card achievements.
export function trainerCardStars(state:State){
  const mythicals=new Set([151,251,385,386,489,490,491,492,493]),caught=new Set(state.caught);
  const complete=Array.from({length:493},(_,i)=>i+1).every(id=>mythicals.has(id)||caught.has(id));
  return Number(!!state.flags.FLAG_GAME_CLEAR)+Number(complete)+Number((state.battleTowerStreaks||[]).some(n=>n>=100))+Number(!!state.flags.FLAG_UNK_0F1)+Number(!!state.flags.FLAG_UNK_184);
}
