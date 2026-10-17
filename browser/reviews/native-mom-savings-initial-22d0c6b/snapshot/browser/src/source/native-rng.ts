/** src/math_util.c:70. JS multiplication must use imul to retain native u32. */
export function advanceLCRNG(seed:number){
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw RangeError('Invalid native LCG seed');
 const next=(Math.imul(seed,1103515245)+24691)>>>0;return{seed:next,value:next>>>16};
}
/** Full unsigned32-bit browser seed/profile initialization. The subsequent
 * Egg draws use the native LCG; browser boot entropy is an explicit adaptation. */
export function sampleUint32(random:()=>number=Math.random){const value=random();if(!Number.isFinite(value)||value<0||value>=1)throw RangeError('Invalid browser random sample');return Math.floor(value*0x100000000);}
