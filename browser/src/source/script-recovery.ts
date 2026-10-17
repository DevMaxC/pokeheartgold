import type {State} from './types.ts';

/** Retain the root object: the VM, battle and field objects all share it. */
export function restoreStateInPlace(state:State,snapshot:State){
  const restored=structuredClone(snapshot);
  // The adventure clock includes time spent in failed scenes and load retries.
  restored.playSeconds=Math.max(restored.playSeconds,state.playSeconds);
  for(const key of Object.keys(state))if(!Object.hasOwn(restored,key))delete (state as unknown as Record<string,unknown>)[key];
  Object.assign(state,restored);
}

/** Failed automatic scenes may be retried explicitly or after changing maps.
 * Idle frame polling must not reopen the same error dialog every frame. */
export class SourceTriggerGate{
  private location='';private blocked='';
  visit(location:string){if(location!==this.location){this.location=location;this.blocked='';}}
  allows(scene:string){return scene!==this.blocked;}
  failed(location:string,scene:string){this.location=location;this.blocked=scene;}
  retry(){this.blocked='';}
}

export class SourceRecoveryError extends Error{
  readonly actionError:unknown;readonly recoveryError:unknown;
  constructor(actionError:unknown,recoveryError:unknown){
    super('The source action failed and its field could not yet be restored',{cause:actionError});
    this.actionError=actionError;this.recoveryError=recoveryError;
  }
}

/** One checkpoint spans a complete field action, including nested standards,
 * map entry and battles. A battle inside a failed scene is provisional; battles
 * completed by earlier actions remain in the next checkpoint. Never commit a
 * battle separately before its trainer/quest script has finished. */
export class SourceActionRecovery<Field>{
  private checkpoint:{state:State;field:Field}|null=null;
  private running=false;
  private restoring=false;
  private failure:unknown;
  readonly state:State;
  readonly field:{capture:()=>Field;restore:(snapshot:Field,error:unknown)=>Promise<void>};
  constructor(state:State,field:{capture:()=>Field;restore:(snapshot:Field,error:unknown)=>Promise<void>}){this.state=state;this.field=field;}
  /** Also gates autosave/pagehide while recovery is waiting for a retry. */
  get busy(){return this.running||this.checkpoint!==null;}
  get recovering(){return this.restoring||(!this.running&&this.checkpoint!==null);}
  async run<T>(action:()=>Promise<T>):Promise<T>{
    if(this.recovering)throw new SourceRecoveryError(this.failure,Error('Retry field recovery before running another action'));
    if(this.running)return action(); // A nested failure must reach the outer owner.
    this.checkpoint={state:structuredClone(this.state),field:structuredClone(this.field.capture())};
    this.running=true;
    try{
      const result=await action();
      this.checkpoint=null;
      return result;
    }catch(error){
      this.failure=error;
      await this.restore();
      throw error;
    }finally{this.running=false;}
  }
  /** Retry only hydration, never replay a partially executed source script. */
  async retryRecovery(){
    if(this.running)throw Error('Cannot retry recovery while a source action is running');
    if(this.checkpoint)await this.restore();
  }
  private async restore(){
    if(!this.checkpoint)return;
    this.restoring=true;
    try{
      restoreStateInPlace(this.state,this.checkpoint.state);
      await this.field.restore(structuredClone(this.checkpoint.field),this.failure);
      this.checkpoint=null;
    }catch(error){throw new SourceRecoveryError(this.failure,error);}
    finally{this.restoring=false;}
  }
}

export type SourceActionResult<T>={ok:true;value:T}|{ok:false};
export type SourceActionPrompts={
  failed:(error:unknown)=>Promise<'retry'|'return'>;
  recoveryFailed:(error:SourceRecoveryError)=>Promise<void>;
  retry:()=>void;
  committed:()=>void;
};

/** UI decisions happen only after the field has been restored. A failed first
 * entry has the same return/retry choices as a later scene: hydration itself is
 * sufficient to provide a coherent playable field. Nested failures are never
 * presented/committed here; the outer owner restores the whole source action. */
export async function runRecoverableSourceAction<T,Field>(recovery:SourceActionRecovery<Field>,action:()=>Promise<T>,prompts:SourceActionPrompts):Promise<SourceActionResult<T>>{
  if(recovery.busy)return{ok:true,value:await recovery.run(action)};
  for(;;){
    let value:T;
    try{value=await recovery.run(action);}
    catch(error){
      const cause=error instanceof SourceRecoveryError?error.actionError:error;
      while(recovery.recovering){
        await prompts.recoveryFailed(error instanceof SourceRecoveryError?error:new SourceRecoveryError(cause,error));
        try{await recovery.retryRecovery();}catch(retryError){error=retryError;}
      }
      if(await prompts.failed(cause)==='return'){prompts.committed();return{ok:false};}
      prompts.retry();
      continue;
    }
    prompts.committed();return{ok:true,value};
  }
}

/** A trainer fight inside a source scene shares that scene's checkpoint. A
 * standalone wild battle finishes before unrelated field-resume scripts begin:
 * a missing map command must not erase an already completed catch or victory. */
export async function runFieldBattleAction<T>(ports:{nested:boolean;execute:<R>(action:()=>Promise<R>)=>Promise<SourceActionResult<R>>;fight:()=>Promise<T>;resume:()=>Promise<void>}):Promise<SourceActionResult<T>>{
  const result=await ports.execute(async()=>{
    const value=await ports.fight();
    if(ports.nested)await ports.resume();
    return value;
  });
  if(result.ok&&!ports.nested)await ports.execute(ports.resume);
  return result;
}
