import {createMon} from './data.ts';
import type {GameData,State} from './types.ts';
/** BattleSetup_New_Tutorial uses a separate party and bag; results aren't saved. */
export function catchingTutorialState(data:GameData,state:State){const demo=structuredClone(state);demo.gender=state.gender==='boy'?'girl':'boy';demo.name=demo.gender==='girl'?'Lyra':'Ethan';demo.party=[createMon(data,data.constants.SPECIES_MARILL,5,demo.name)];demo.bag={ITEM_POKE_BALL:20};return {state:demo,enemy:createMon(data,data.constants.SPECIES_RATTATA,2,'')};}
