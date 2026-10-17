/** Native GENDER_RATIO(frac), then pokemon.c's u8 PID comparison. This leaf
 * has no imports so ordinary creation and Eggs share one rule without cycles. */
export function nativeGenderRatio(ratio:number){return ratio<=1?Math.floor(ratio*254.75):255;}
export function nativeMonGender(ratio:number,personality:number):'male'|'female'|'genderless'{
 const raw=nativeGenderRatio(ratio);
 return raw===0?'male':raw===254?'female':raw===255?'genderless':raw>(personality&255)?'female':'male';
}

/** Native Pokepic chooses the female art slot only for MON_FEMALE. */
export function spriteGender(gender:'male'|'female'|'genderless'):'male'|'female'{return gender==='female'?'female':'male';}
/** Genderless Pokémon retain their gameplay gender but print no sex symbol. */
export function genderSymbol(gender:'male'|'female'|'genderless'):'♂'|'♀'|''{return gender==='male'?'♂':gender==='female'?'♀':'';}
