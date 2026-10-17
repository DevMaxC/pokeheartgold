import type {TouchInput} from './touch-controls.ts';
const directional=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
/** Keyboard and touch own separate held state. Keyboard intent takes priority,
 * including opposed keys, without a touch release deleting a real key press. */
export function fieldInput(keys:ReadonlySet<string>,touch:TouchInput){
 const keyboard=directional.some(key=>keys.has(key));
 return{horizontal:keyboard?Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft')):touch.horizontal,forward:keyboard?Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown')):touch.forward,run:keys.has('ShiftLeft')||keys.has('ShiftRight')||touch.run};
}
/** Preserve the original four-direction collision/movement rules while aiming
 * the movement relative to the free camera. Touch magnitude is not a teleport. */
export function fieldInputFacing(input:{horizontal:number;forward:number},yaw:number){
 if(!Number.isFinite(input.horizontal)||!Number.isFinite(input.forward)||!Number.isFinite(yaw)||Math.hypot(input.horizontal,input.forward)<1e-6)return null;
 const x=input.horizontal*Math.cos(yaw)-input.forward*Math.sin(yaw),z=-input.horizontal*Math.sin(yaw)-input.forward*Math.cos(yaw);
 return Math.abs(x)>Math.abs(z)?x>0?3:2:z>0?1:0;
}
