import type {GameData,State} from './types.ts';

export const MOM_SAVINGS_MAX=999999;
export const MOM_GIFT_CAPACITY=5;
export type MomGift={item:number;quantity:number};
export type MomSavingsSave={balance:number;normalGiftsGiven:number;gifts:MomGift[]};
/** Optional fields accommodate saves written before this native subsystem.
 * State may adopt the complete MomSavingsSave type when the host is wired. */
export type MomSavingsState=Pick<State,'money'|'flags'|'phoneTriggers'>&{momSavings?:Partial<MomSavingsSave>};
export type MomBattleMoney={beforeMoney:number;afterMoney:number;random16?:()=>number};
export type MomBattleSettlement={money:number;deposited:number;savings:MomSavingsSave;newGifts:MomGift[];phoneTrigger:Readonly<{id:12;accelerate:true}>|null};

// mom_gift.c, in source order. Repeated Super Potions are separate queue entries.
const normalGifts=[
 ['ITEM_SUPER_POTION',900,600],['ITEM_REPEL',4000,270],['ITEM_SUPER_POTION',7000,600],
 ['ITEM_SILK_SCARF',10000,100],['ITEM_MOON_STONE',15000,3000],['ITEM_HYPER_POTION',19000,900],
 ['ITEM_CHOICE_SCARF',30000,200],['ITEM_MUSCLE_BAND',40000,200],['ITEM_FOCUS_SASH',50000,200],
]as const;
const berryGifts=['ITEM_OCCA_BERRY','ITEM_PASSHO_BERRY','ITEM_WACAN_BERRY','ITEM_RINDO_BERRY','ITEM_YACHE_BERRY','ITEM_CHOPLE_BERRY','ITEM_KEBIA_BERRY','ITEM_SHUCA_BERRY','ITEM_COBA_BERRY','ITEM_PAYAPA_BERRY','ITEM_TANGA_BERRY','ITEM_CHARTI_BERRY','ITEM_KASIB_BERRY','ITEM_HABAN_BERRY','ITEM_COLBUR_BERRY','ITEM_BABIRI_BERRY','ITEM_CHILAN_BERRY']as const;
function integer(value:number,max:number,name:string){if(!Number.isSafeInteger(value)||value<0||value>max)throw RangeError('Invalid native '+name);return value;}
function copy(save:MomSavingsSave):MomSavingsSave{return{balance:save.balance,normalGiftsGiven:save.normalGiftsGiven,gifts:save.gifts.map(gift=>({...gift}))};}
function item(data:Pick<GameData,'constants'>,key:string){const id=integer(data.constants[key],65535,'Mom gift item');if(!id)throw RangeError('Missing native Mom gift '+key);return id;}

/** SavePokegear initializes bank, mask and queue to zero. Reading/Continue never
 * infers a deposit, a historical purchase or a fresh phone-timer boost. */
export function readMomSavings(state:Pick<MomSavingsState,'momSavings'>):MomSavingsSave{
 const saved=state.momSavings;if(saved!==undefined&&(saved===null||typeof saved!=='object'||Array.isArray(saved)))throw RangeError('Invalid native Mom savings');
 const balance=integer(saved?.balance===undefined?0:saved.balance,MOM_SAVINGS_MAX,'Mom balance'),normalGiftsGiven=integer(saved?.normalGiftsGiven===undefined?0:saved.normalGiftsGiven,511,'Mom gift mask');
 const gifts=saved?.gifts===undefined?[]:saved.gifts;if(!Array.isArray(gifts)||gifts.length>MOM_GIFT_CAPACITY)throw RangeError('Invalid native Mom gift queue');
 return{balance,normalGiftsGiven,gifts:gifts.map(gift=>{if(!gift||typeof gift!=='object')throw RangeError('Invalid native Mom gift');const id=integer(gift.item,65535,'Mom gift item'),quantity=integer(gift.quantity,65535,'Mom gift quantity');if(!id||!quantity)throw RangeError('Invalid native Mom gift');return{item:id,quantity};})};
}

/** BattleSetup snapshots this BEFORE battle for its prize-message branch.
 * The actual later deposit can be zero even when that message bit is true. */
export function momSavingsActive(state:Pick<MomSavingsState,'flags'|'momSavings'>){return readMomSavings(state).balance<MOM_SAVINGS_MAX&&!!state.flags.FLAG_SYS_MOMS_SAVINGS;}

/** FieldSystem_DepositBattleMoneyToMomsSavings, after native prize/loss display.
 * before/after are the two capped battle-profile wallets, NOT nominal prize.
 * Call for zero/loss outcomes too: existing unbought normal gifts can qualify.
 * All validation/RNG occurs before writes. The outer source action owns rollback
 * if a later presentation/phone port fails. Fresh phoneTrigger is an event;
 * the host accelerates its manager only after the persistent bit is committed.
 * Gift delivery, Mother call presentation and bank transaction UI are separate.
 * Berry selection requires an explicit native-width draw; no global RNG stream
 * or saved pending bit is invented by this module. */
export function settleMomBattleMoney(data:Pick<GameData,'constants'>,state:MomSavingsState,input:MomBattleMoney):MomBattleSettlement{
 const before=integer(input.beforeMoney,MOM_SAVINGS_MAX,'pre-battle wallet'),after=integer(input.afterMoney,MOM_SAVINGS_MAX,'post-battle wallet'),savings=readMomSavings(state),newGifts:MomGift[]=[],enabled=!!state.flags.FLAG_SYS_MOMS_SAVINGS;
 let money=after,deposited=0;
 if(enabled){
  const oldBalance=savings.balance,delta=Math.trunc((after-before)/4);
  if(delta>0){deposited=Math.min(delta,MOM_SAVINGS_MAX-savings.balance);money-=deposited;savings.balance+=deposited;}
  const newBalance=savings.balance;
  if(savings.gifts.length<MOM_GIFT_CAPACITY){
   for(const[index,[key,threshold,cost]]of normalGifts.entries()){
    if(savings.normalGiftsGiven&(1<<index))continue;if(savings.balance<threshold)break;
    const gift={item:item(data,key),quantity:1};savings.normalGiftsGiven|=1<<index;savings.gifts.push(gift);newGifts.push({...gift});savings.balance=Math.max(0,savings.balance-cost);
    if(savings.gifts.length===MOM_GIFT_CAPACITY)break;
   }
   // The native routine returns immediately if ANY normal gift was bought.
   if(!newGifts.length&&Math.floor(newBalance/3000)>Math.floor(oldBalance/3000)){
    if(!input.random16)throw Error('Mom berry purchase requires a native16-bit random draw');
    const draw=integer(input.random16(),65535,'Mom berry random draw'),gift={item:item(data,berryGifts[draw%berryGifts.length]),quantity:5};savings.gifts.push(gift);newGifts.push({...gift});savings.balance=Math.max(0,savings.balance-100);
   }
  }
 }
 const phoneTrigger=newGifts.length?Object.freeze({id:12 as const,accelerate:true as const}):null;
 const triggers=phoneTrigger?state.phoneTriggers??[]:undefined,nextTriggers=triggers&&!triggers.includes(12)?[...triggers,12]:undefined;
 // No await, external callback or fallible data lookup after the commit starts.
 state.money=money;if(enabled)state.momSavings=copy(savings);if(nextTriggers)state.phoneTriggers=nextTriggers;
 return{money,deposited,savings:copy(savings),newGifts,phoneTrigger};
}
