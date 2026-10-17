import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {AzaleaFieldSound} from './azalea-field-sound.ts';
import {NativeFieldClock} from './native-field-clock.ts';
import {UnsupportedNativeAzaleaAudio,type NativeAzaleaAudioResources,type AzaleaAudioStatus} from './gym-azalea-audio.ts';
import {AZALEA_AUDIO_MANIFEST_SHA256} from './azalea-audio-data.ts';

const root=new URL('../../public/source/azalea-audio/',import.meta.url);
const bytes=await readFile(new URL('resources.json',root));
assert.equal(createHash('sha256').update(bytes).digest('hex'),AZALEA_AUDIO_MANIFEST_SHA256);
const metadata=JSON.parse(bytes.toString())as NativeAzaleaAudioResources;
const deferred=<T>()=>{let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return{resolve,reject,promise};};
const arrayBuffer=(bytes:Buffer)=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)as ArrayBuffer;

// Explicit WebAudio port only: no real Context, output device or audition.
function fixture(options:{loader?:(signal:AbortSignal)=>Promise<NativeAzaleaAudioResources>;metadataTimeoutMs?:number;report?:(status:AzaleaAudioStatus)=>void}={}){
 const lifetime=new AbortController(),nodes:any[]=[],statuses:AzaleaAudioStatus[]=[],field={map:180,mapRunning:true};let outputReads=0,loads=0;
 const context={state:'running',sampleRate:32768,addEventListener(){},removeEventListener(){},
  async decodeAudioData(value:ArrayBuffer){const wav=Buffer.from(value);let channels=0,rate=0,bits=0,data=0;for(let at=12;at+8<=wav.length;){const size=wav.readUInt32LE(at+4),tag=wav.toString('ascii',at,at+4);if(tag==='fmt '){channels=wav.readUInt16LE(at+10);rate=wav.readUInt32LE(at+12);bits=wav.readUInt16LE(at+22);}if(tag==='data')data=size;at+=8+size+(size&1);}return{numberOfChannels:channels,duration:data/(channels*bits/8)/rate};},
  createBufferSource(){const node={buffer:null,onended:null as null|(()=>void),loop:false,loopStart:0,loopEnd:0,starts:0,stops:0,connect(){},disconnect(){},start(){node.starts++;},stop(){node.stops++;},end(){node.onended?.();}};nodes.push(node);return node;},
 };
 const clock=new NativeFieldClock({field:()=>field,onError:error=>{throw error;}}),output={context:context as unknown as AudioContext,output:{context}as unknown as AudioNode,signal:lifetime.signal};
 const sound=new AzaleaFieldSound({clock,signal:lifetime.signal,output:()=>{outputReads++;return output;},report:status=>{statuses.push(status);options.report?.(status);},loadMetadata:signal=>{loads++;return options.loader?options.loader(signal):Promise.resolve(structuredClone(metadata));},fetchBytes:async url=>arrayBuffer(await readFile(new URL(url.split('/').at(-1)!,root))),metadataTimeoutMs:options.metadataTimeoutMs});
 const frame=async()=>{clock.frame(1/30);await clock.settled();};
 return{sound,clock,lifetime,field,nodes,statuses,context,frame,outputReads:()=>outputReads,loads:()=>loads,dispose(){sound.dispose();clock.dispose();}};
}

test('root hook and metadata registry exist without consulting or unlocking an audio Context',async()=>{
 const h=fixture();try{assert.equal(h.outputReads(),0);const one=await h.sound.preparePlayer(new AbortController().signal),two=await h.sound.preparePlayer(new AbortController().signal);assert.equal(one,two);assert.equal(one.signal,h.lifetime.signal);assert.equal(h.loads(),1);assert.equal(h.outputReads(),0);await h.frame();assert.equal(h.clock.tick,1);}finally{h.dispose();}
});

test('caller abort abandons only bounded root metadata work and cannot start a late voice',async()=>{
 const loading=deferred<NativeAzaleaAudioResources>();let rootSignal:AbortSignal|undefined;
 const h=fixture({loader:signal=>{rootSignal=signal;return loading.promise;}}),owner=new AbortController();
 try{const pending=h.sound.audio.prepare([1561,2171],owner.signal);owner.abort(new Error('scene left'));await assert.rejects(pending,/scene left/);assert.equal(rootSignal!.aborted,false);loading.resolve(structuredClone(metadata));await h.sound.preparePlayer(new AbortController().signal);assert.equal(h.nodes.length,0);assert.equal(h.outputReads(),0);await h.sound.audio.prepare([1561,2171],new AbortController().signal);assert.equal(h.loads(),1);assert.equal(h.nodes.length,0);}finally{h.dispose();}
});

test('ignored metadata deadline never publishes late ownership; explicit retry refetches configuration',async()=>{
 const late=deferred<NativeAzaleaAudioResources>();let attempts=0;
 const h=fixture({metadataTimeoutMs:15,loader:()=>++attempts===1?late.promise:Promise.resolve(structuredClone(metadata))});
 try{await assert.rejects(h.sound.preparePlayer(new AbortController().signal),/metadata preparation timed out/);late.resolve(structuredClone(metadata));const player=await h.sound.preparePlayer(new AbortController().signal);assert.ok(player);assert.equal(attempts,2);assert.equal(h.nodes.length,0);assert.equal(h.outputReads(),0);}finally{h.dispose();}
});

test('native fade1 sound update runs after tasks even with no map scopes or running field',async()=>{
 const h=fixture();try{await h.sound.audio.prepare([1561,2171],new AbortController().signal);const owner={},result=h.sound.audio.robot2171(owner);assert.equal(result.kind,'voice');const player=await h.sound.preparePlayer(new AbortController().signal);h.sound.audio.stop2171(owner,1);assert.equal(player.isPlaying(2171),true);assert.equal(h.nodes[0].stops,0);
 h.field.map=-1;h.field.mapRunning=false;h.clock.cancel(Error('map left'));await h.frame();assert.equal(player.isPlaying(2171),false);assert.equal(h.nodes[0].stops,1);
 h.field.map=180;h.field.mapRunning=true;assert.equal(await h.sound.preparePlayer(new AbortController().signal),player);assert.equal(h.loads(),1);
 }finally{h.dispose();}
});

test('actual voice end settles PLAYER idle only at the shared post-task sound update',async()=>{
 const h=fixture();try{await h.sound.audio.prepare([1561,2171],new AbortController().signal);const owner=new AbortController();let done=false;const pending=h.sound.audio.switch1561(owner.signal).then(value=>{done=true;return value;});h.nodes[0].end();assert.equal(h.sound.audio.isPlayerIdle(1561),false);assert.equal(done,false);await h.frame();assert.equal((await pending).kind,'voice');assert.equal(h.sound.audio.isPlayerIdle(1561),true);}finally{h.dispose();}
});

test('locked shared output is diagnosed no-voice, while malformed source metadata remains explicit',async()=>{
 const h=fixture();try{h.context.state='suspended';await h.sound.audio.prepare([1561,2171],new AbortController().signal);assert.equal(h.sound.audio.robot2171({}).kind,'no-voice');assert.ok(h.statuses.some(value=>value.stage==='no-voice'));assert.equal(h.nodes.length,0);}finally{h.dispose();}
 const broken=fixture({loader:async()=>({...structuredClone(metadata),version:99})as unknown as NativeAzaleaAudioResources});try{await assert.rejects(broken.sound.audio.prepare([1561,2171],new AbortController().signal),UnsupportedNativeAzaleaAudio);assert.equal(broken.nodes.length,0);}finally{broken.dispose();}
});

test('root disposal removes the global callback and rejects pending source admission without unlocking',async()=>{
 const late=deferred<NativeAzaleaAudioResources>(),h=fixture({loader:()=>late.promise});
 try{const pending=h.sound.preparePlayer(new AbortController().signal);h.lifetime.abort(new DOMException('root closed','AbortError'));await assert.rejects(pending,{name:'AbortError'});late.resolve(structuredClone(metadata));await h.frame();assert.equal(h.nodes.length,0);assert.equal(h.outputReads(),0);await assert.rejects(h.sound.preparePlayer(new AbortController().signal),{name:'AbortError'});}finally{h.dispose();}
});

test('asynchronous reporting failure aborts its owned audio and cannot orphan a looping voice',async()=>{
 let fail=false;const h=fixture({report:()=>{if(fail)throw Error('status owner failed');}});
 try{await h.sound.audio.prepare([1561,2171],new AbortController().signal);h.sound.audio.robot2171({});fail=true;h.nodes[0].end();await assert.rejects(h.sound.failure,/status port failed/);assert.ok(h.nodes[0].stops>0);assert.equal(h.sound.diagnostics.failed,true);await assert.rejects(h.sound.preparePlayer(new AbortController().signal),/status port failed/);await h.frame();}finally{h.dispose();}
});
