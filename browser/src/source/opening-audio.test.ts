import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createOpeningAudio} from './opening-audio.ts';
import {createNativeFieldMusicPlayer} from './field-music.ts';

function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>resolve=yes);return{promise,resolve};}
function fixture(){
 const prior=globalThis.fetch,requests:string[]=[],gains:any[]=[],nodes:any[]=[];let enabled=true,failStart=false;
 const controls:{fetch?:()=>Promise<Response>;decode?:()=>Promise<AudioBuffer>;callbackOnly?:boolean}={};
 class Context{
  state='running';destination={};sampleRate=48000;currentTime=0;resumes=0;
  async resume(){this.resumes++;}async close(){this.state='closed';}
  createGain(){const gain={gain:{value:1},connected:null as unknown,disconnected:false,connect(target:unknown){this.connected=target;},disconnect(){this.disconnected=true;}};gains.push(gain);return gain;}
  createBufferSource(){const node={buffer:null,started:false,stopped:false,disconnected:false,onended:null as null|(()=>void),connected:null as unknown,connect(target:unknown){this.connected=target;},start(){if(failStart)throw Error('start failed');this.started=true;},stop(){this.stopped=true;},disconnect(){this.disconnected=true;}};nodes.push(node);return node;}
  decodeAudioData(_data:ArrayBuffer,resolve?:(value:AudioBuffer)=>void){const work=controls.decode?controls.decode():Promise.resolve({duration:1,numberOfChannels:1}as AudioBuffer);if(controls.callbackOnly){void work.then(resolve);return undefined;}return work;}
 }
 const context=new Context(),player=createNativeFieldMusicPlayer({enabled:true,volume:.4,createContext:()=>context as unknown as AudioContext});
 globalThis.fetch=(async input=>{requests.push(String(input));return controls.fetch?controls.fetch():new Response(new Uint8Array([1,2]));})as typeof fetch;
 const audio=createOpeningAudio(()=>enabled?player.sharedAudioOutput():null);
 return{audio,player,context,controls,requests,gains,nodes,set enabled(value:boolean){enabled=value;},set failStart(value:boolean){failStart=value;},async restore(){audio.dispose();await player.dispose();globalThis.fetch=prior;}};
}
test('opening requests no audio while muted and never creates or resumes its own Context',async()=>{
 const f=fixture();try{f.enabled=false;await f.audio.playCry(183);assert.equal(f.requests.length,0);assert.equal(f.context.resumes,0);f.enabled=true;await assert.rejects(f.audio.playCry(250),/unlock native game sound/);assert.equal(f.requests.length,0);assert.equal(f.context.resumes,0);}finally{await f.restore();}
});
test('both original opening cries share live master mute, volume and hidden-page gating',async()=>{
 const f=fixture();try{await f.player.unlock();await f.audio.playCry(183);await f.audio.playCry(250);assert.deepEqual(f.requests,['/source/opening/cry-183.wav','/source/opening/cry-250.wav']);assert.equal(f.context.resumes,1);assert.equal(f.nodes.length,2);
  for(const node of f.nodes){assert.equal(node.connected.gain.value,.6);assert.equal(node.connected.connected,f.gains[0]);}
  await f.player.setPreferences({enabled:false,volume:.2});assert.equal(f.gains[0].gain.value,0);assert.ok(f.nodes.every(node=>node.started));
  f.player.setPageActive(false);await f.player.setPreferences({enabled:true,volume:.2});assert.equal(f.gains[0].gain.value,0);f.player.setPageActive(true);assert.equal(f.gains[0].gain.value,.2);
  f.nodes[0].onended();assert.equal(f.nodes[0].disconnected,true);assert.equal(f.gains[1].disconnected,true);f.audio.dispose();assert.ok(f.nodes.every(node=>node.stopped&&node.disconnected));assert.equal(f.gains[0].disconnected,false);assert.equal(f.context.state,'running');
 }finally{await f.restore();}
});
test('mute during pending decode drops the cry and disposal prevents ignored late I/O from starting audio',async()=>{
 const f=fixture();try{await f.player.unlock();const decoded=deferred<AudioBuffer>();f.controls.decode=()=>decoded.promise;const first=f.audio.playCry(183);await new Promise(resolve=>setImmediate(resolve));f.enabled=false;decoded.resolve({}as AudioBuffer);await first;assert.equal(f.nodes.length,0);
  f.enabled=true;const loading=deferred<Response>();f.controls.fetch=()=>loading.promise;const second=f.audio.playCry(250),rejected=assert.rejects(second,/cancelled/);f.audio.dispose();await rejected;loading.resolve(new Response(new Uint8Array([1])));await new Promise(resolve=>setImmediate(resolve));assert.equal(f.nodes.length,0);
 }finally{await f.restore();}
});
test('shared player disposal cancels pending opening decode and failed starts release both nodes',async()=>{
 const f=fixture();try{await f.player.unlock();f.failStart=true;await assert.rejects(f.audio.playCry(183),/start failed/);assert.equal(f.nodes[0].disconnected,true);assert.equal(f.gains[1].disconnected,true);
  f.failStart=false;const decoded=deferred<AudioBuffer>();f.controls.decode=()=>decoded.promise;const pending=f.audio.playCry(250),rejected=assert.rejects(pending,/cancelled/);await new Promise(resolve=>setImmediate(resolve));await f.player.dispose();await rejected;decoded.resolve({}as AudioBuffer);await new Promise(resolve=>setImmediate(resolve));assert.equal(f.nodes.length,1);
 }finally{await f.restore();}
});
test('callback-only WebKit decoding waits for a real buffer; mute/unmute during loading uses current master output',async()=>{
 const f=fixture();try{await f.player.unlock();const decoded=deferred<AudioBuffer>();f.controls.callbackOnly=true;f.controls.decode=()=>decoded.promise;
  const pending=f.audio.playCry(183);await new Promise(resolve=>setImmediate(resolve));assert.equal(f.nodes.length,0);f.enabled=false;await f.player.setPreferences({enabled:false,volume:.1});f.enabled=true;await f.player.setPreferences({enabled:true,volume:.1});
  const buffer={duration:1,numberOfChannels:1}as AudioBuffer;decoded.resolve(buffer);await pending;assert.equal(f.nodes.length,1);assert.equal(f.nodes[0].buffer,buffer);assert.equal(f.gains[0].gain.value,.1);
 }finally{await f.restore();}
});
test('HTTP failure and a suspended shared context cannot leave an opening voice connected',async()=>{
 const f=fixture();try{await f.player.unlock();f.controls.fetch=async()=>new Response('',{status:503});await assert.rejects(f.audio.playCry(183),/503/);assert.equal(f.nodes.length,0);
  f.controls.fetch=undefined;const decoded=deferred<AudioBuffer>();f.controls.decode=()=>decoded.promise;const pending=f.audio.playCry(250),rejected=assert.rejects(pending,/unlock native game sound|not running/);await new Promise(resolve=>setImmediate(resolve));f.context.state='suspended';decoded.resolve({}as AudioBuffer);await rejected;assert.equal(f.nodes.length,0);
 }finally{await f.restore();}
});
test('opening audio times out ignored I/O and cannot start a node from its later response',async t=>{
 const f=fixture();try{await f.player.unlock();const loading=deferred<Response>();f.controls.fetch=()=>loading.promise;t.mock.timers.enable({apis:['setTimeout']});
  const pending=f.audio.playCry(183),rejected=assert.rejects(pending,/cancelled/);t.mock.timers.tick(4000);await rejected;loading.resolve(new Response(new Uint8Array([1])));await new Promise(resolve=>setImmediate(resolve));assert.equal(f.nodes.length,0);
 }finally{t.mock.timers.reset();await f.restore();}
});
