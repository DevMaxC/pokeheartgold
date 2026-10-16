import type {State} from './types.ts';

/** Retain the root object: the VM, battle and field objects all share it. */
export function restoreStateInPlace(state:State,snapshot:State){
  const restored=structuredClone(snapshot);
  for(const key of Object.keys(state))if(!Object.hasOwn(restored,key))delete (state as unknown as Record<string,unknown>)[key];
  Object.assign(state,restored);
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
    this.checkpoint={state:structuredClone(this.state),field:this.field.capture()};
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
