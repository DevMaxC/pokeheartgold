export type MovementAction={facing:number|null;lockFacing:boolean|null;invisible:boolean|null;distance:number;repeats:number;seconds:number;delay:number;jump:boolean;end:boolean};
/** Tile distances match the near/far movement families in movement.inc. */
export function movementAction(command:string,args:string[]):MovementAction{
  const result:MovementAction={facing:null,lockFacing:null,invisible:null,distance:0,repeats:Number(args[0]||1),seconds:0,delay:0,jump:false,end:command==='EndMovement'};
  if(result.end)return result;
  if(command==='LockDir'||command==='UnlockDir'){result.lockFacing=command==='LockDir';return result;}
  if(command==='SetInvisible'||command==='SetVisible'){result.invisible=command==='SetInvisible';return result;}
  const delay=command.match(/^Delay(\d+)$/);if(delay){result.delay=Number(delay[1])*result.repeats/60;return result;}
  const direction=command.match(/(North|South|West|East)$/);if(direction)result.facing={North:0,South:1,West:2,East:3}[direction[1] as 'North'];
  if(command.startsWith('Face')||command.startsWith('WalkOnSpot')||command.startsWith('JumpOnSpot'))return result;
  if(['PlayerGive','PlayerReceive','NurseJoyBow'].includes(command)){result.delay=.4;return result;}
  if(command.startsWith('Emote')){result.delay=.25*result.repeats;return result;}
  if(result.facing!==null&&/^(Walk|Run|Jump)/.test(command)){result.jump=command.startsWith('Jump');result.distance=command.startsWith('JumpFar')?2:1;result.seconds=command.includes('Slow')?.4:command.includes('Fast')||command.startsWith('Run')?.16:.25;return result;}
  throw Error(`Unported original movement ${command}`);
}
