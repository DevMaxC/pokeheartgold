import type {GameData} from './types.ts';
const pocketCounts:Record<string,string>={POCKET_ITEMS:'NUM_BAG_ITEMS',POCKET_MEDICINE:'NUM_BAG_MEDICINE',POCKET_BALLS:'NUM_BAG_BALLS',POCKET_TMHMS:'NUM_BAG_TMS_HMS',POCKET_BERRIES:'NUM_BAG_BERRIES',POCKET_MAIL:'NUM_BAG_MAIL',POCKET_BATTLE_ITEMS:'NUM_BAG_BATTLE_ITEMS',POCKET_KEY_ITEMS:'NUM_BAG_KEY_ITEMS'};
/** src/bag.c: one stack per item, per-pocket slot counts and atomic failure. */
export function hasBagSpace(data:GameData,bag:Record<string,number>,key:string,quantity:number){
  const item=data.items.find(item=>item.item===key);if(!item||key==='ITEM_NONE'||quantity<0)return false;
  const pocket=item.fieldPocket,maximum=data.constants[pocket==='POCKET_TMHMS'?'BAG_TMHM_QUANTITY_MAX':'BAG_SLOT_QUANTITY_MAX'];
  if((bag[key]||0)+quantity>maximum)return false;if(bag[key]>0)return true;
  const used=Object.entries(bag).filter(([id,count])=>count>0&&data.items.find(i=>i.item===id)?.fieldPocket===pocket).length;
  return used<data.constants[pocketCounts[pocket]];
}
export function addBagItem(data:GameData,bag:Record<string,number>,key:string,quantity:number){if(!hasBagSpace(data,bag,key,quantity))return false;bag[key]=(bag[key]||0)+quantity;return true;}
export function takeBagItem(bag:Record<string,number>,key:string,quantity:number){if(bag[key]===undefined||quantity<0||bag[key]<quantity)return false;bag[key]-=quantity;if(bag[key]===0)delete bag[key];return true;}

export function isCaptureBall(data:Pick<GameData,'items'>,key:string){return data.items.find(item=>item.item===key)?.fieldPocket==='POCKET_BALLS';}
