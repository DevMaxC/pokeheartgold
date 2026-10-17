import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NativeSEPlayer3,createNativeAzaleaAudio,loadNativeAzaleaAudio,UnsupportedNativeAzaleaAudio,type NativeAzaleaAudioResources,type AzaleaAudioStatus} from './gym-azalea-audio.ts';
const base=new URL('../../public/source/azalea-audio/',import.meta.url);
const bytes=async(name:string)=>{const b=await readFile(new URL(name,base));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)as ArrayBuffer;};
const resources=JSON.parse(await readFile(new URL('resources.json',base),'utf8'))as NativeAzaleaAudioResources;
const signal=()=>new AbortController();
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function deferred<T=void>(){let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
function voice(){const done=deferred();let stops=0;return{ended:done.promise,stop(){stops++;done.resolve();},done,get stops(){return stops;}};}
function wavDuration(data:ArrayBuffer){const v=new DataView(data);for(let at=12;at+8<v.byteLength;){const size=v.getUint32(at+4,true);if(String.fromCharCode(...new Uint8Array(data,at,4))==='data')return size/4/32768;at+=8+size+(size%2);}throw Error('No WAV data');}
function fixture(options:{outputError?:Error;timeout?:number;decode?:(data:ArrayBuffer)=>Promise<any>;read?:(url:string,signal:AbortSignal)=>Promise<ArrayBuffer>;report?:(value:AzaleaAudioStatus)=>void}={}){
 const shared=signal(),nodes:any[]=[],statuses:AzaleaAudioStatus[]=[],destination={name:'fieldGain'},events=new EventTarget(),context:any={addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events),state:'running',sampleRate:32768,decodeAudioData:options.decode??(async(data:ArrayBuffer)=>({numberOfChannels:2,duration:wavDuration(data)})),createBufferSource(){const node:any={onended:null,loop:false,stops:0,disconnects:0,start(){},stop(){node.stops++;},connect(to:unknown){assert.equal(to,destination);},disconnect(){node.disconnects++;},end(){node.onended?.();}};nodes.push(node);return node;}};
 const player=new NativeSEPlayer3(resources,shared.signal),audio=createNativeAzaleaAudio(resources,{player,output:()=>{if(options.outputError)throw options.outputError;return{context,output:destination,signal:shared.signal};},report:options.report??(value=>statuses.push(value)),fetchBytes:options.read??(async url=>bytes(url.split('/').at(-1)!)),ioTimeoutMs:options.timeout??4000});
 return{audio,player,shared,nodes,statuses,context};
}

test('literal manifest hash, PLAYER3 metadata and both actual WAVs are admitted',async()=>{
 const parsed=await loadNativeAzaleaAudio(signal().signal,async()=>bytes('resources.json'));
 assert.equal(Object.keys(parsed.playerSequences).length,695);assert.deepEqual(parsed.player,resources.player);
 for(const id of[1561,2171]as const){const a=parsed.sounds[id];assert.equal(a.playerPriority,64);assert.equal(a.channelPriority,89);assert.equal(createHash('sha256').update(Buffer.from(await bytes(a.file))).digest('hex'),a.wavSHA256);assert.equal(wavDuration(await bytes(a.file)),a.frames/32768);}
 assert.deepEqual(parsed.sounds[2171].loopFrames,[16729,33458]);assert.equal(parsed.sounds[1561].loopFrames,null);
});
test('manifest corruption and absent source metadata are configuration errors',async()=>{
 const changed=await bytes('resources.json');new Uint8Array(changed)[100]^=1;
 await assert.rejects(loadNativeAzaleaAudio(signal().signal,async()=>changed),/checksum/);
 assert.throws(()=>new NativeSEPlayer3({...resources,player:{id:3,maxSequences:2}}as any,signal().signal),UnsupportedNativeAzaleaAudio);
});
test('native PLAYER3 equal priority preempts other sequences, not unrelated owners',()=>{
 const p=new NativeSEPlayer3(resources,signal().signal),old=voice(),next=voice(),first={},second={};p.play(1610,first,()=>old);p.play(2171,second,()=>next);assert.equal(old.stops,1);assert.equal(p.isPlaying(1561),true);p.cancelOwner(first);p.stopOwned(2171,first,0);assert.equal(next.stops,0);p.cancelOwner(second);assert.equal(next.stops,1);p.dispose();
});
test('lower native player priority rejects and whole-player wait includes another higher sequence',async()=>{
 const p=new NativeSEPlayer3(resources,signal().signal),high=Object.values(resources.playerSequences).find(m=>m.playerPriority===74)!,v=voice();p.play(high.id,{},()=>v);let started=false;const outcome=p.play(1561,{},()=>{started=true;return voice();});assert.equal(outcome.kind,'no-voice');assert.equal(started,false);
 let idle=false;void p.waitIdle(signal().signal).then(()=>idle=true);v.done.resolve();await flush();assert.equal(idle,false);p.soundUpdate();await flush();assert.equal(idle,true);p.dispose();
});
test('native alloc precedes technical failure, replacing equal-priority sequence',()=>{
 const p=new NativeSEPlayer3(resources,signal().signal),v=voice();p.play(1610,{},()=>v);assert.deepEqual(p.play(1561,{},()=>{throw Error('Device unavailable');}),{kind:'no-voice',detail:'Device unavailable'});assert.equal(v.stops,1);assert.equal(p.isPlaying(1561),false);p.dispose();
});
test('fade1 counts at priority0 until exactly next injected sound update',()=>{
 const p=new NativeSEPlayer3(resources,signal().signal),owner={},v=voice();p.play(2171,owner,()=>v);p.stopOwned(2171,owner,1);assert.equal(v.stops,0);assert.equal(p.isPlaying(1561),true);p.soundUpdate();assert.equal(v.stops,1);assert.equal(p.isPlaying(1561),false);p.soundUpdate();assert.equal(v.stops,1);p.dispose();
});
test('fade lowers player priority so a literal lower-priority source cue can replace it',()=>{
 const p=new NativeSEPlayer3(resources,signal().signal),low=Object.values(resources.playerSequences).find(m=>m.playerPriority===54)!,owner={},v=voice();p.play(2171,owner,()=>v);assert.equal(p.play(low.id,{},()=>voice()).kind,'no-voice');p.stopOwned(2171,owner,1);assert.equal(p.play(low.id,{},()=>voice()).kind,'voice');assert.equal(v.stops,1);p.dispose();
});
test('cancelled waiting owner cannot stop a newer sequence; manual/global disposal drains waits',async()=>{
 const lifetime=signal(),p=new NativeSEPlayer3(resources,lifetime.signal),action=signal();p.play(1610,{},()=>voice());const pending=p.waitIdle(action.signal);action.abort(Error('Cancelled action'));await assert.rejects(pending,/Cancelled/);assert.equal(p.isPlaying(1561),true);const pending2=p.waitIdle(signal().signal);p.dispose();await assert.rejects(pending2,/disposed/);
 const p2=new NativeSEPlayer3(resources,lifetime.signal);p2.play(1610,{},()=>voice());const pending3=p2.waitIdle(signal().signal);lifetime.abort(Error('Shared output gone'));await assert.rejects(pending3);assert.throws(()=>p2.soundUpdate());
});
test('real robot PCM uses native loop marker, borrowed gain and owner-checked fade',async()=>{
 const f=fixture();await f.audio.prepare([1561,2171],signal().signal);const owner={};assert.equal(f.audio.robot2171(owner).kind,'voice');const node=f.nodes[0];assert.equal(node.loop,true);assert.equal(node.loopStart,16729/32768);assert.equal(node.loopEnd,33458/32768);f.audio.stop2171({},1);f.player.soundUpdate();assert.equal(node.stops,0);f.audio.stop2171(owner,1);assert.equal(node.stops,0);f.player.soundUpdate();assert.equal(node.stops,1);assert.equal(node.disconnects,1);f.audio.dispose();f.player.dispose();
});
test('switch waits entire player through replacement by external Cut1610',async()=>{
 const f=fixture();await f.audio.prepare([1561,2171],signal().signal);let ended=false;const wait=f.audio.switch1561(signal().signal).then(outcome=>{ended=true;return outcome;});assert.equal(f.nodes.length,1);const external=voice();f.player.play(1610,{},()=>external);await flush();f.player.soundUpdate();await flush();assert.equal(ended,false);external.done.resolve();await flush();f.player.soundUpdate();assert.equal((await wait).kind,'voice');assert.equal(ended,true);f.audio.dispose();f.player.dispose();
});
test('technical no-voice switch still waits native higher-priority PLAYER3',async()=>{
 const f=fixture({decode:async()=>{throw Error('Audio device decode failed');}});await f.audio.prepare([1561,2171],signal().signal);assert.equal(f.statuses.filter(v=>v.stage==='no-voice').length,2);const high=Object.values(resources.playerSequences).find(m=>m.playerPriority===74)!,v=voice();f.player.play(high.id,{},()=>v);let done=false;const wait=f.audio.switch1561(signal().signal).then(result=>{done=true;return result;});await flush();assert.equal(done,false);v.done.resolve();await flush();f.player.soundUpdate();assert.equal((await wait).kind,'no-voice');f.audio.dispose();f.player.dispose();
});
test('suspended device gives diagnosed no-voice without creating another AudioContext',async()=>{
 const f=fixture();await f.audio.prepare([1561,2171],signal().signal);f.context.state='suspended';const outcome=await f.audio.switch1561(signal().signal);assert.equal(outcome.kind,'no-voice');assert.equal(f.nodes.length,0);assert.match(f.statuses.at(-1)!.detail!,/not running/);f.audio.dispose();f.player.dispose();
});
test('missing/mismatched original WAV rejects instead of technical silent fallback',async()=>{
 const f=fixture({read:async()=>new ArrayBuffer(4)});await assert.rejects(f.audio.prepare([1561,2171],signal().signal),UnsupportedNativeAzaleaAudio);assert.throws(()=>f.audio.robot2171({}),/prepared/);f.audio.dispose();f.player.dispose();
});
test('noncooperative decoder is cancelled, late completion cannot publish a voice',async()=>{
 const pending=deferred<any>(),started=deferred(),f=fixture({decode:()=>{started.resolve();return pending.promise;}}),action=signal();const preparing=f.audio.prepare([1561,2171],action.signal);await started.promise;action.abort(Error('Action superseded'));await assert.rejects(preparing,/superseded/);pending.resolve({numberOfChannels:2,duration:resources.sounds[1561].frames/32768});await flush();assert.equal(f.nodes.length,0);assert.throws(()=>f.audio.robot2171({}),/prepared/);f.audio.dispose();f.player.dispose();
});
test('shared output abort cleans owned nodes; later old-owner stop cannot affect external Cut',async()=>{
 const f=fixture();await f.audio.prepare([1561,2171],signal().signal);const owner={};f.audio.robot2171(owner);const external=voice();f.player.play(1610,{},()=>external);f.audio.stop2171(owner,1);assert.equal(external.stops,0);f.audio.dispose();assert.equal(external.stops,0);f.shared.abort(Error('Output gone'));assert.equal(external.stops,1);assert.equal(f.nodes[0].disconnects,1);
});
test('native registry requires known source sequence; audio needs source/config and explicit report',()=>{
 const f=fixture();assert.throws(()=>f.player.play(99999,{},()=>voice()),/metadata/);assert.throws(()=>createNativeAzaleaAudio(resources,{player:f.player,output:()=>null}as any),/ports/);f.audio.dispose();f.player.dispose();
});

test('throwing status port is explicit failure and drains admitted voice',async()=>{
 const f=fixture({report:value=>{if(value.stage==='started')throw Error('Status sink failed');}});await f.audio.prepare([1561,2171],signal().signal);assert.throws(()=>f.audio.robot2171({}),/status port/);await assert.rejects(f.audio.failure,/Status sink failed/);assert.equal(f.player.isPlaying(1561),false);assert.equal(f.nodes[0].disconnects,1);f.audio.dispose();f.player.dispose();
});
test('asynchronous status failure is observable without escaping native node event',async()=>{
 const f=fixture({report:value=>{if(value.stage==='ended')throw Error('End status failed');}});await f.audio.prepare([1561,2171],signal().signal);f.audio.robot2171({});assert.doesNotThrow(()=>f.nodes[0].end());await assert.rejects(f.audio.failure,/End status failed/);f.audio.dispose();f.player.dispose();
});

test('Context suspension during switch releases only owned voice and reports technical no-voice',async()=>{
 const f=fixture();await f.audio.prepare([1561,2171],signal().signal);const waiting=f.audio.switch1561(signal().signal);f.context.state='suspended';f.context.dispatchEvent(new Event('statechange'));assert.equal((await waiting).kind,'no-voice');assert.equal(f.nodes[0].disconnects,1);assert.ok(f.statuses.some(row=>row.stage==='no-voice'&&row.detail?.includes('became suspended')));f.audio.dispose();f.player.dispose();
});
test('shared output owner identity is immutable across native actions',async()=>{
 const f=fixture(),output={context:f.context,output:{},signal:f.shared.signal}as any;const replacement=createNativeAzaleaAudio(resources,{player:f.player,output:()=>output,report(){},fetchBytes:async url=>bytes(url.split('/').at(-1)!)});await replacement.prepare([1561,2171],signal().signal);output.output={};assert.throws(()=>replacement.robot2171({}),/changed owner/);replacement.dispose();f.audio.dispose();f.player.dispose();
});

test('bounded noncooperative preparation times out as diagnosed technical no-voice',async()=>{
 const f=fixture({timeout:5,decode:()=>new Promise(()=>{})});await f.audio.prepare([1561,2171],signal().signal);assert.equal(f.statuses.filter(row=>row.stage==='no-voice'&&row.detail?.includes('timed out')).length,2);assert.equal((await f.audio.switch1561(signal().signal)).kind,'no-voice');f.audio.dispose();f.player.dispose();
});

test('temporary technical preparation failure retries on later admission',async()=>{
 let calls=0;const f=fixture({decode:async data=>{if(++calls===1)throw Error('Temporary device failure');return{numberOfChannels:2,duration:wavDuration(data)};}});await f.audio.prepare([1561,2171],signal().signal);assert.equal(calls,2);await f.audio.prepare([1561,2171],signal().signal);assert.equal(calls,3);assert.equal(f.statuses.filter(row=>row.id===1561&&row.stage==='prepared').length,1);const waiting=f.audio.switch1561(signal().signal);f.nodes[0].end();await flush();f.player.soundUpdate();assert.equal((await waiting).kind,'voice');f.audio.dispose();f.player.dispose();
});
test('same owner replay retains new voice tracking for Context cancellation',async()=>{
 const f=fixture();await f.audio.prepare([1561,2171],signal().signal);const owner={};f.audio.robot2171(owner);f.audio.robot2171(owner);assert.equal(f.nodes[0].disconnects,1);f.context.state='suspended';f.context.dispatchEvent(new Event('statechange'));assert.equal(f.nodes[1].disconnects,1);assert.equal(f.player.isPlaying(1561),false);f.audio.dispose();f.player.dispose();
});
test('Context change during requested fade is completion, not stray no-voice',async()=>{
 const f=fixture();await f.audio.prepare([1561,2171],signal().signal);const owner={};f.audio.robot2171(owner);f.audio.stop2171(owner,1);f.context.state='suspended';f.context.dispatchEvent(new Event('statechange'));assert.equal(f.statuses.filter(row=>row.stage==='no-voice').length,0);assert.equal(f.nodes[0].disconnects,1);f.audio.dispose();f.player.dispose();
});
test('reentrant native admission from old-voice stop cannot leak an overwritten voice',()=>{
 const p=new NativeSEPlayer3(resources,signal().signal);let innerStarts=0;const old=voice();p.play(1610,{},()=>({ended:old.ended,stop(){old.stop();assert.throws(()=>p.play(1561,{},()=>{innerStarts++;return voice();}),/Reentrant/);}}));const next=voice();assert.equal(p.play(2171,{},()=>next).kind,'voice');assert.equal(innerStarts,0);assert.equal(old.stops,1);p.dispose();assert.equal(next.stops,1);
});
test('shared registry disposal inside transport admission stops the just-created voice',()=>{
 const p=new NativeSEPlayer3(resources,signal().signal),v=voice();assert.throws(()=>p.play(2171,{},()=>{p.dispose();return v;}),/disposed/);assert.equal(v.stops,1);
});

test('real sharedAudioOutput getter unavailable is technical no-voice after source verification',async()=>{
 const f=fixture({outputError:Error('Tap or press a key to unlock native game sound')});await f.audio.prepare([1561,2171],signal().signal);assert.equal(f.statuses.filter(row=>row.stage==='no-voice'&&row.detail?.includes('unlock')).length,2);assert.equal((await f.audio.switch1561(signal().signal)).kind,'no-voice');assert.equal(f.audio.robot2171({}).kind,'no-voice');assert.equal(f.nodes.length,0);f.audio.dispose();f.player.dispose();
});
test('unavailable shared Context never masks a missing or corrupt original source WAV',async()=>{
 const f=fixture({outputError:Error('Not unlocked'),read:async()=>new ArrayBuffer(4)});await assert.rejects(f.audio.prepare([1561,2171],signal().signal),UnsupportedNativeAzaleaAudio);f.audio.dispose();f.player.dispose();
});
test('typed source/config absence during native admission rejects explicitly after native preemption',()=>{
 const p=new NativeSEPlayer3(resources,signal().signal),old=voice();p.play(1610,{},()=>old);assert.throws(()=>p.play(1561,{},()=>{throw new UnsupportedNativeAzaleaAudio('Missing source');}),/Missing source/);assert.equal(old.stops,1);assert.equal(p.isPlaying(1561),false);p.dispose();
});

test('source admission throw removes only its own owner token, avoiding later false no-voice',async()=>{
 const f=fixture(),statuses:AzaleaAudioStatus[]=[],output={context:f.context,output:{},signal:f.shared.signal}as any;const audio=createNativeAzaleaAudio(resources,{player:f.player,output:()=>output,report:value=>statuses.push(value),fetchBytes:async url=>bytes(url.split('/').at(-1)!)});await audio.prepare([1561,2171],signal().signal);output.output={};assert.throws(()=>audio.robot2171({}),/changed owner/);f.context.state='suspended';f.context.dispatchEvent(new Event('statechange'));assert.equal(statuses.filter(value=>value.stage==='no-voice').length,0);audio.dispose();f.audio.dispose();f.player.dispose();
});
