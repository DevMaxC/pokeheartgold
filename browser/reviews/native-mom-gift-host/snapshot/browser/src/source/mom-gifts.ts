import {readMomSavings,type MomGift,type MomSavingsState} from './mom-savings.ts';

/** ScrCmd_MomGiftCheck / PeekMomGift inspect only the packed queue head.
 * Reading a saved queue never awards items or schedules a new call. */
export function peekMomGift(state:MomSavingsState):MomGift{
  return readMomSavings(state).gifts[0]??{item:0,quantity:0};
}
export function hasMomGift(state:MomSavingsState){return peekMomGift(state).quantity!==0;}

/** PhoneCallPersistentState_MomGiftQueue_Get: shift once and preserve bank/mask.
 * This is the raw native Pop command, NOT a grant. The real COMMON0144 delivery
 * script invokes it after successful std2033; its whole action (including final
 * acknowledgement) must share the existing outer State/field recovery owner. */
export function popMomGift(state:MomSavingsState):MomGift{
  const save=readMomSavings(state),gift=save.gifts.shift()??{item:0,quantity:0};
  if(state.momSavings!==undefined||gift.quantity)state.momSavings=save;
  return gift;
}
