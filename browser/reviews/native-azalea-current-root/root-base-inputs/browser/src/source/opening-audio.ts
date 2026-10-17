import type {SharedNativeAudioOutput} from './field-music.ts';

/** Opening cries borrow the game's output, including its live mute, volume
 * and background-page gate. This owner never creates or resumes a Context. */
export function createOpeningAudio(output:()=>SharedNativeAudioOutput|null){
 const owner=new AbortController();
 const voices=new Set<()=>void>();
 return{
  async playCry(species:183|250){
   if(owner.signal.aborted)return;
   const shared=output();if(!shared)return;
   if(shared.signal.aborted||shared.context.state!=='running')return;
   const request=new AbortController();let node:AudioBufferSourceNode|undefined,gain:GainNode|undefined,finished=false;
   let rejectCancelled!:(error:unknown)=>void;
   const cancelled=new Promise<never>((_resolve,reject)=>{rejectCancelled=reject;});
   // A disposed view releases pending I/O as well as already playing nodes.
   const finish=()=>{if(finished)return;finished=true;clearTimeout(timer);owner.signal.removeEventListener('abort',abort);shared.signal.removeEventListener('abort',abort);voices.delete(finish);request.abort();if(node){node.onended=null;try{node.stop();}catch{}node.disconnect();}gain?.disconnect();};
   const abort=()=>{finish();rejectCancelled(Error('Opening audio cancelled'));};
   const timer=setTimeout(abort,4000);
   voices.add(finish);owner.signal.addEventListener('abort',abort,{once:true});shared.signal.addEventListener('abort',abort,{once:true});
   const check=()=>{if(finished||owner.signal.aborted||shared.signal.aborted)throw Error('Opening audio cancelled');};
   try{
    const buffer=await Promise.race([cancelled,(async()=>{
     const response=await fetch(`/source/opening/cry-${species}.wav`,{signal:request.signal});check();if(!response.ok)throw Error('Original opening cry could not load ('+response.status+')');
     const data=await response.arrayBuffer();check();
     const decoded=await new Promise<AudioBuffer>((resolve,reject)=>{const pending=shared.context.decodeAudioData(data,resolve,reject);if(pending?.then)void pending.then(resolve,reject);});check();return decoded;
    })()]);
    check();clearTimeout(timer);
    // Drop a cry if sound is still muted when its assets finish loading.
    if(!output()){finish();return;}
    if(shared.context.state!=='running')throw Error('Shared opening AudioContext is not running');
    node=shared.context.createBufferSource();gain=shared.context.createGain();node.buffer=buffer;gain.gain.value=.6;node.connect(gain);gain.connect(shared.output);node.onended=finish;node.start();
   }catch(error){finish();throw error;}
  },
  dispose(){if(owner.signal.aborted)return;owner.abort();for(const stop of[...voices])stop();},
 };
}
