/** Native field_control.c separates step-triggered transitions from pushing
 * against an exit tile. Facing uses the original N/S/W/E = 0/1/2/3. */
export function stepWarpFacing(permission:number,facing:number):number|null{
  switch(permission&255){
    case 100:case 110:case 62:return 0; // North entrances and ladders down.
    case 103:return facing; // Warp panel.
    case 106:return facing===2?3:facing===3?2:null; // Escalator flips facing.
    case 107:return facing===2||facing===3?facing:null;
    default:return null;
  }
}
export function pushWarp(permission:number,facing:number,blockedAhead=true){
  const behavior=permission&255;if(behavior===60)return facing===0;if(behavior===61)return facing===1;if(!blockedAhead)return false;
  switch(permission&255){
    case 98:case 108:case 94:return facing===3;
    case 99:case 109:case 95:return facing===2;
    case 101:case 111:return facing===1;
    default:return false;
  }
}
export function fieldEntryScripts(kind:'connection'|'warp'|'resume'){
  return kind==='connection'?['OnTransition']:kind==='resume'?['OnLoad','OnResume']:['OnTransition','OnLoad','OnResume'];
}
/** Door exits step clear; warp-stair placement/animation ends on its anchor. */
export function arrivalStep(permission:number,facing:number):number|null{
  const behavior=permission&255;
  if(behavior===105&&facing===1)return 1;
  return null;
}
export function arrivalFacing(permission:number,facing:number){const behavior=permission&255;return behavior===94?2:behavior===95?3:facing;}
