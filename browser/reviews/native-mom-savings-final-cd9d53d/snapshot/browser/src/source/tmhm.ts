import {sourceJSON,type GameData} from './types.ts';
let moves:Promise<number[]>|null=null;
/** Literal field_misc_util.c:ItemIsTMOrHM, inclusive through HM08. */
export function isTMHMItem(data:Pick<GameData,'constants'>,item:number){return Number.isInteger(item)&&item>=data.constants.ITEM_TM01&&item<=data.constants.ITEM_HM08;}
/** src/item.c:sTMHMMoves/TMHMGetMove. The generated asset keeps the original
 * ordered 92 TMs + 8 HMs; ordinary items return MOVE_NONE without a fetch. */
export async function tmhmMove(data:Pick<GameData,'constants'|'moves'>,item:number){
 if(!isTMHMItem(data,item))return data.constants.MOVE_NONE;
 if(!moves){const loading:Promise<number[]>=sourceJSON<number[]>('tmhm-moves.json').then(table=>{if(table.length!==data.constants.ITEM_HM08-data.constants.ITEM_TM01+1||!table.every(id=>Number.isInteger(id)&&!!data.moves[id]))throw Error('Invalid original TM/HM move table');return table;}).catch(error=>{if(moves===loading)moves=null;throw error;});moves=loading;}
 return(await moves)[item-data.constants.ITEM_TM01];
}
