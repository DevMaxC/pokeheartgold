import type {ApricornBoxSave,GameData,State} from './types.ts';

/** Native SaveApricornBox's seven zero-based colors, not Bag item IDs and
 * not the one-based APRICORN_* tree constants. asm/apricorn_box_data.s. */
export const APRICORN_BALL_ITEMS=['ITEM_LEVEL_BALL','ITEM_MOON_BALL','ITEM_LURE_BALL','ITEM_FRIEND_BALL','ITEM_LOVE_BALL','ITEM_FAST_BALL','ITEM_HEAVY_BALL']as const;
type Owner=Pick<State,'apricornBox'>;
const between=(value:number,max:number)=>Number.isInteger(value)&&value>=0&&value<=max;
const empty=():ApricornBoxSave=>({apricorns:[0,0,0,0,0,0,0],kurtQuantity:0,kurtApricorn:0});
function color(index:number){if(!between(index,6))throw RangeError('Original Apricorn color must be an index from0 through6');}
function amount(quantity:number,max=0xff){if(!between(quantity,max))throw RangeError('Invalid original Apricorn quantity');}
function box(owner:Owner):ApricornBoxSave{
  if(owner.apricornBox===undefined)return empty(); // InitApricornBox zeroes native save storage.
  const saved=owner.apricornBox;
  if(!saved||!Array.isArray(saved.apricorns)||saved.apricorns.length!==7||!Array.from(saved.apricorns).every(value=>between(value,99))||!between(saved.kurtQuantity,99)||!between(saved.kurtApricorn,0xff))throw RangeError('Invalid saved original Apricorn Box');
  return saved;
}
function withCount(owner:Owner,current:ApricornBoxSave,index:number,next:number){const apricorns=[...current.apricorns];apricorns[index]=next;owner.apricornBox={...current,apricorns};}

export function countApricorn(owner:Owner,index:number){color(index);return box(owner).apricorns[index];}
export function totalApricornCount(owner:Owner){return box(owner).apricorns.reduce((sum,count)=>sum+count,0);}
/** ApricornBox_GiveApricorn caps the low-level addition at99 and returns the
 * new count. The script tree command has a distinct all-or-nothing guard. */
export function giveApricorn(owner:Owner,index:number,quantity:number){color(index);amount(quantity);const current=box(owner),next=Math.min(99,current.apricorns[index]+quantity);withCount(owner,current,index,next);return next;}
export function takeApricorn(owner:Owner,index:number,quantity:number){color(index);amount(quantity,0xffffffff);const current=box(owner),count=current.apricorns[index];if(count>=quantity)withCount(owner,current,index,count-quantity);return count>=quantity?count-quantity:count;}
export function giveApricornFromTree(owner:Owner,index:number,quantity:number){color(index);amount(quantity);const current=box(owner);if(current.apricorns[index]+quantity>99)return false;withCount(owner,current,index,current.apricorns[index]+quantity);return true;}

/** ApricornBox_SetKurtApricorn removes the submitted count at assignment;
 * insufficient stock leaves the complete box unchanged. Day completion and
 * the selection overlay are intentionally outside this saved-data adapter. */
export function setKurtApricorn(owner:Owner,index:number,quantity:number){
  color(index);amount(quantity,0xffffffff);const current=box(owner);if(current.apricorns[index]<quantity)return false;
  const apricorns=[...current.apricorns];apricorns[index]-=quantity;owner.apricornBox={...current,apricorns,kurtApricorn:index,kurtQuantity:quantity};return true;
}
export function kurtApricornQuantity(owner:Owner){return box(owner).kurtQuantity;}
export function clearKurtApricorn(owner:Owner){setKurtApricorn(owner,0,0);}
export function kurtBall(data:Pick<GameData,'constants'>,owner:Owner){
  const index=box(owner).kurtApricorn,key=index<7?APRICORN_BALL_ITEMS[index]:'ITEM_POKE_BALL',item=data.constants[key];
  if(!Number.isInteger(item)||item<0)throw Error('Missing original Kurt Ball item '+key);
  return item;
}
