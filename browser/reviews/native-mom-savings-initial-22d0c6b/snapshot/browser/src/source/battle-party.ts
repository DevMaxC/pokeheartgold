import type {Mon} from './types.ts';

/** Native party selection and EXP masks require a living non-Egg. These two
 * leaf predicates are extracted from the reviewed Egg consumer integration;
 * they do not create Eggs or introduce gift, hatching or field dependencies.
 */
export function isUsableBattler(mon:Mon|undefined):mon is Mon{return!!mon&&!mon.isEgg&&mon.hp>0;}
export function firstUsableBattlerIndex(party:readonly Mon[]){return party.findIndex(isUsableBattler);}
