import {NativeSEPlayer3,createNativeAzaleaAudio,loadNativeAzaleaAudio,UnsupportedNativeAzaleaAudio,type AzaleaAudioStatus,type NativeAzaleaAudioResources,type NativeAudioFetch,type SharedAzaleaAudioOutput} from './gym-azalea-audio.ts';
import type {AzaleaGymAudio} from './gym-azalea-host.ts';
import type {NativeFieldClock} from './native-field-clock.ts';
import {NativeSEPlayer4,createNativeRepelAudio,loadNativeRepelAudio,UnsupportedNativeRepelAudio,type NativeRepelAudioResources,type RepelAudioStatus} from './repel-audio.ts';

export type AzaleaFieldSoundPorts={
 clock:NativeFieldClock;signal:AbortSignal;output:()=>SharedAzaleaAudioOutput;report:(status:AzaleaAudioStatus)=>void;
 loadMetadata?:(signal:AbortSignal)=>Promise<NativeAzaleaAudioResources>;
 fetchBytes?:NativeAudioFetch;metadataTimeoutMs?:number;ioTimeoutMs?:number;
 /** Separate optional menu diagnostics. Existing PLAYER3 reporter is unchanged. */
 loadMenuMetadata?:(signal:AbortSignal)=>Promise<NativeRepelAudioResources>;
 reportMenu?:(status:RepelAudioStatus)=>void;
};
const reason=(signal:AbortSignal)=>signal.reason??new DOMException('Original field sound cancelled','AbortError');
function check(signal:AbortSignal){if(signal.aborted)throw reason(signal);}
function observe<T>(work:()=>Promise<T>,signal:AbortSignal):Promise<T>{
 return new Promise((resolve,reject)=>{let done=false;const finish=(ok:boolean,value:unknown)=>{if(done)return;done=true;signal.removeEventListener('abort',abort);if(ok)resolve(value as T);else reject(value);},abort=()=>finish(false,reason(signal));if(signal.aborted){abort();return;}signal.addEventListener('abort',abort,{once:true});try{void work().then(value=>finish(true,value),error=>finish(false,error));}catch(error){finish(false,error);}});
}

/** One root-lifetime native PLAYER3 and post-task sound update. Map/action
 * cancellation never removes the global hook. Context/gain are borrowed only
 * when the reviewed audio adapter actually prepares/plays a source voice. */
export class AzaleaFieldSound{
 readonly audio:AzaleaGymAudio;readonly failure:Promise<never>;
 private registry:NativeSEPlayer3|null=null;private transport:ReturnType<typeof createNativeAzaleaAudio>|null=null;
 private admission:Promise<void>|null=null;private lifetime=new AbortController();private failed=new AbortController();
 private closed=false;private removeSound:()=>void;private rejectFailure!:(error:unknown)=>void;
 private statuses:AzaleaAudioStatus[]=[];
 private menuRegistry:NativeSEPlayer4|null=null;private menuTransport:ReturnType<typeof createNativeRepelAudio>|null=null;
 private menuAdmission:Promise<void>|null=null;private menuPreparation:Promise<void>|null=null;
 private menuStatuses:RepelAudioStatus[]=[];private menuError:unknown;
 constructor(private ports:AzaleaFieldSoundPorts){
  check(ports.signal);const timeout=ports.metadataTimeoutMs??4000;if(!Number.isInteger(timeout)||timeout<1||timeout>120000)throw Error('Invalid original sound metadata deadline');
  this.failure=new Promise((_,reject)=>{this.rejectFailure=reject;});void this.failure.catch(()=>{});
  // No mapRunning condition: source sound update survives map transitions,
  // zero field scopes, script waits, fades and owned presentation phases.
  this.removeSound=ports.clock.onAfterTasks(()=>{this.registry?.soundUpdate();this.menuRegistry?.soundUpdate();},ports.signal);
  ports.signal.addEventListener('abort',this.rootEnded,{once:true});
  void ports.clock.failure.catch(error=>this.fail(error));
  this.audio={
   prepare:async(ids,signal)=>{const owner=this.owner(signal);await this.preparePlayer(owner);check(owner);await this.required().prepare(ids,owner);},
   switch1561:signal=>this.required().switch1561(this.owner(signal)),
   isPlayerIdle:id=>this.required().isPlayerIdle(id),
   robot2171:owner=>this.required().robot2171(owner),
   stop2171:(owner,fade)=>{if(fade!==1)throw new UnsupportedNativeAzaleaAudio('Original robot stop requires fade1');if(this.closed||this.failed.signal.aborted){this.registry?.cancelOwner(owner);return;}this.required().stop2171(owner,fade);},
  };
 }
 private rootEnded=()=>this.dispose();
 private guard(){check(this.ports.signal);check(this.lifetime.signal);check(this.failed.signal);if(this.closed)throw Error('Original field sound disposed');}
 private owner(signal:AbortSignal){const owner=AbortSignal.any([signal,this.ports.signal,this.lifetime.signal,this.failed.signal]);check(owner);return owner;}
 private required(){this.guard();if(!this.transport)throw new UnsupportedNativeAzaleaAudio('Original field sound must be prepared before dispatch');return this.transport;}
 private fail(error:unknown){if(this.closed||this.failed.signal.aborted)return;this.failed.abort(error);this.rejectFailure(error);this.removeSound();this.transport?.dispose();this.registry?.dispose();this.menuTransport?.dispose();this.menuRegistry?.dispose();}
 get diagnostics(){return{status:this.statuses.map(value=>({...value})),player:this.registry?.diagnostics??[],failed:this.failed.signal.aborted};}
 get menuDiagnostics(){return{status:this.menuStatuses.map(value=>({...value})),player:this.menuRegistry?.diagnostics??[],failed:this.menuError!==undefined};}
 /** Live actual created registries. Players5/6 have not been admitted; an
  * explicit request for them is unsupported, never an invented idle player. */
 isSEPlayerPlaying(player:3|4|5|6){this.guard();if(player===3)return this.registry?.isPlaying(1561)??false;if(player===4)return this.menuRegistry?.isPlaying(1500)??false;throw new UnsupportedNativeRepelAudio('Original SE player is not created: '+player);}
 anySEPlaying(){return this.isSEPlayerPlaying(3)||this.isSEPlayerPlaying(4);}
 /** Future actual PLAYER3 consumers must use this same registry BEFORE
  * starting voices. This does not install generic PlaySE or Cut adapters. */
 async preparePlayer(signal:AbortSignal):Promise<NativeSEPlayer3>{
  const owner=this.owner(signal);if(this.registry){check(owner);return this.registry;}
  if(!this.admission){
   const deadline=new AbortController(),root=AbortSignal.any([this.ports.signal,this.lifetime.signal,this.failed.signal,deadline.signal]);
   const timeout=this.ports.metadataTimeoutMs??4000;
   const pending=(async()=>{
    const timer=setTimeout(()=>deadline.abort(Error('Original SE metadata preparation timed out after '+timeout+'ms')),timeout);
    try{
     const resources=await observe(()=>this.ports.loadMetadata?this.ports.loadMetadata(root):loadNativeAzaleaAudio(root),root);check(root);this.guard();
     const registry=new NativeSEPlayer3(resources,this.ports.signal);
     try{
      const transport=createNativeAzaleaAudio(resources,{player:registry,output:this.ports.output,report:status=>{this.statuses.push({...status});if(this.statuses.length>32)this.statuses.shift();this.ports.report(status);},fetchBytes:this.ports.fetchBytes,ioTimeoutMs:this.ports.ioTimeoutMs});
      check(root);this.guard();this.registry=registry;this.transport=transport;void transport.failure.catch(error=>this.fail(error));
     }catch(error){registry.dispose();throw error;}
    }finally{clearTimeout(timer);}
   })();
   this.admission=pending;void pending.then(()=>{if(this.admission===pending)this.admission=null;},()=>{if(this.admission===pending)this.admission=null;});
  }
  // Caller cancellation abandons only this wait. A root-owned metadata read
  // remains bounded and may cache configuration, never an action or voice.
  await observe(()=>this.admission!,owner);check(owner);this.guard();if(!this.registry)throw new UnsupportedNativeAzaleaAudio('Original PLAYER3 metadata was not admitted');return this.registry;
 }
 /** Root-owned PLAYER4 metadata, shared by menus and the original Repel
  * adapter. Caller cancellation abandons its wait, never the root registry. */
 async preparePlayer4(signal:AbortSignal):Promise<NativeSEPlayer4>{
  const owner=this.owner(signal);if(this.menuRegistry)return this.menuRegistry;
  if(!this.menuAdmission){
   const deadline=new AbortController(),root=AbortSignal.any([this.ports.signal,this.lifetime.signal,this.failed.signal,deadline.signal]);
   const timeout=this.ports.metadataTimeoutMs??4000;
   const pending=(async()=>{
    const timer=setTimeout(()=>deadline.abort(Error('Original menu metadata preparation timed out after '+timeout+'ms')),timeout);
    try{
     const player3=await this.preparePlayer(root);
     const resources=await observe(()=>this.ports.loadMenuMetadata?this.ports.loadMenuMetadata(root):loadNativeRepelAudio(root,this.ports.fetchBytes),root);check(root);this.guard();
     const registry=new NativeSEPlayer4(resources,this.ports.signal);
     try{
      const transport=createNativeRepelAudio(resources,{player3,player4:registry,output:this.ports.output,report:status=>{this.menuStatuses.push({...status});if(this.menuStatuses.length>32)this.menuStatuses.shift();this.ports.reportMenu?.(status);},fetchBytes:this.ports.fetchBytes,ioTimeoutMs:this.ports.ioTimeoutMs});
      check(root);this.guard();this.menuRegistry=registry;this.menuTransport=transport;
      // Optional menu diagnostics fail this adapter only. They must not kill
      // Root's clock/PLAYER3 or stop another consumer's newer PLAYER4 voice.
      void transport.failure.catch(error=>{this.menuError=error;transport.dispose();});
     }catch(error){registry.dispose();throw error;}
    }finally{clearTimeout(timer);}
   })();
   this.menuAdmission=pending;void pending.then(()=>{if(this.menuAdmission===pending)this.menuAdmission=null;},()=>{if(this.menuAdmission===pending)this.menuAdmission=null;});
  }
  await observe(()=>this.menuAdmission!,owner);check(owner);this.guard();if(!this.menuRegistry)throw new UnsupportedNativeRepelAudio('Original PLAYER4 metadata was not admitted');return this.menuRegistry;
 }
 private requiredMenu(){this.guard();if(this.menuError!==undefined)throw this.menuError;if(!this.menuTransport)throw new UnsupportedNativeRepelAudio('Original menu sound must be prepared before dispatch');return this.menuTransport;}
 /** Authenticate/decode SELECT once under Root lifetime, without creating or
  * unlocking audio. A canceled menu cannot publish a late action or voice. */
 async prepareMenuPlayer(signal:AbortSignal):Promise<NativeSEPlayer4>{
  const owner=this.owner(signal),registry=await this.preparePlayer4(owner);check(owner);
  if(!this.menuPreparation){const pending=this.requiredMenu().prepareMenu(this.owner(this.ports.signal));this.menuPreparation=pending;void pending.then(()=>{if(this.menuPreparation===pending)this.menuPreparation=null;},()=>{if(this.menuPreparation===pending)this.menuPreparation=null;});}
  await observe(()=>this.menuPreparation!,owner);check(owner);this.requiredMenu();return registry;
 }
 menuSE1500(owner:object,signal:AbortSignal,options:{selectMuted:boolean}){return this.requiredMenu().play(1500,owner,this.owner(signal),options);}
 cancelMenuOwner(owner:object){this.menuTransport?.cancelOwner(owner);}
 dispose(){if(this.closed)return;this.closed=true;this.lifetime.abort(new DOMException('Original field sound disposed','AbortError'));this.ports.signal.removeEventListener('abort',this.rootEnded);this.removeSound();this.transport?.dispose();this.registry?.dispose();this.menuTransport?.dispose();this.menuRegistry?.dispose();this.transport=null;this.registry=null;this.menuTransport=null;this.menuRegistry=null;}
}
