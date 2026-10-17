/** Native GENDER_RATIO(frac), then pokemon.c's u8 PID comparison. This leaf
 * has no imports so ordinary creation and Eggs share one rule without cycles. */
export function nativeGenderRatio(ratio:number){return ratio<=1?Math.floor(ratio*254.75):255;}
export function nativeMonGender(ratio:number,personality:number):'male'|'female'|'genderless'{
 const raw=nativeGenderRatio(ratio);
 return raw===0?'male':raw===254?'female':raw===255?'genderless':raw>(personality&255)?'female':'male';
}
