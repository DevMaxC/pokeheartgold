import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {getEventListeners} from 'node:events';
import {createHash} from 'node:crypto';
import {AzaleaFieldSound} from './azalea-field-sound.ts';
import {NativeFieldClock} from './native-field-clock.ts';
import {NativeSEPlayer4,createNativeRepelAudio,loadNativeRepelAudio,UnsupportedNativeRepelAudio} from './repel-audio.ts';
import {REPEL_AUDIO_MANIFEST_SHA256} from './repel-audio-data.ts';

const bytes=async(url:string)=>readFile(new URL('../../public'+url,import.meta.url));
const array=(value:Buffer)=>value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength)as ArrayBuffer;
const p3=JSON.parse((await bytes('/source/azalea-audio/resources.json')).toString()),p4bytes=await bytes('/source/repel-audio/resources.json'),p4=JSON.parse(p4bytes.toString());
const hash=(value:Buffer)=>createHash('sha256').update(value).digest('hex');
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes;});return{resolve,promise};};
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
function fixture(options:{menuLoad?:(signal:AbortSignal)=>Promise<any>;reportMenu?:(status:any)=>void;timeout?:number;locked?:boolean;fetch?:(url:string)=>Promise<ArrayBuffer>;decode?:(value:ArrayBuffer)=>Promise<any>;report?:(status:any)=>void}={}){
 const root=new AbortController(),nodes:any[]=[],errors:unknown[]=[],requests:string[]=[],status:any[]=[],field={map:180,mapRunning:false};let p3Loads=0,p4Loads=0,hooks=0,activeHooks=0,reads=0,decodes=0,failNode=false;
 class Context extends EventTarget{state='running';sampleRate=32768;async decodeAudioData(value:ArrayBuffer){decodes++;if(options.decode)return options.decode(value);const wav=Buffer.from(value);return{numberOfChannels:2,duration:wav.readUInt32LE(40)/4/32768};}createBufferSource(){if(failNode)throw Error('menu node technical failure');const node={buffer:null,onended:null as null|(()=>void),loop:false,stopped:false,disconnected:false,connect(){},disconnect(){node.disconnected=true;},start(){},stop(){node.stopped=true;},end(){node.onended?.();}};nodes.push(node);return node;}}
 const context=new Context(),master={context,gain:{value:0}},output={context:context as unknown as AudioContext,output:master as unknown as AudioNode,signal:root.signal};
 const clock=new NativeFieldClock({field:()=>field,onError:error=>{errors.push(error);}}),register=clock.onAfterTasks.bind(clock);clock.onAfterTasks=(fn,signal)=>{hooks++;activeHooks++;const remove=register(fn,signal);let removed=false;return()=>{if(!removed){removed=true;activeHooks--;remove();}};};
 const sound=new AzaleaFieldSound({clock,signal:root.signal,output:()=>{reads++;if(options.locked)throw Error('Native sound is gesture locked');return output;},report:s=>{options.report?.(s);},reportMenu:s=>{status.push(s);options.reportMenu?.(s);},metadataTimeoutMs:options.timeout,loadMetadata:async()=>{p3Loads++;return structuredClone(p3);},loadMenuMetadata:async signal=>{p4Loads++;return options.menuLoad?options.menuLoad(signal):structuredClone(p4);},fetchBytes:async(url)=>{requests.push(url);return options.fetch?options.fetch(url):array(await bytes(url));}});
 const frame=async()=>{clock.frame(1/30);await clock.settled();};
 return{root,clock,sound,context,master,output,nodes,errors,requests,status,field,frame,get hooks(){return hooks;},get activeHooks(){return activeHooks;},get reads(){return reads;},get decodes(){return decodes;},get p3Loads(){return p3Loads;},get p4Loads(){return p4Loads;},set failNode(value:boolean){failNode=value;},dispose(){sound.dispose();clock.dispose();}};
}

test('menu authenticates exact accepted SELECT1500 metadata/PCM while P3 source remains byte-identical',async()=>{
 assert.equal(hash(p4bytes),REPEL_AUDIO_MANIFEST_SHA256);assert.equal(hash(await readFile(new URL('./gym-azalea-audio.ts',import.meta.url))),'0cbec1a1c2570d4d433ef3918213586211a92bb455a6a38455b28cdb69cbb1a7');
 const meta=p4.sounds[1500];assert.deepEqual([meta.player,meta.bank,meta.volume,meta.channelPriority,meta.playerPriority,meta.frames],[4,700,54,104,64,25776]);assert.deepEqual([p4.players[4].maxSequences,p4.players[4].channelMask,p4.players[4].heapSize],[1,55296,2000]);assert.equal(hash(await bytes('/source/repel-audio/'+meta.file)),meta.wavSHA256);
 const loaded=await loadNativeRepelAudio(new AbortController().signal,async url=>array(await bytes(url)));assert.deepEqual(loaded,p4);
});

test('one Root P4 and one existing hook are reused with no output admission until explicit menu preparation',async()=>{
 const h=fixture();try{const one=await h.sound.preparePlayer4(h.root.signal),two=await h.sound.preparePlayer4(h.root.signal);assert.ok(one===two,'one Root P4 reference is reused');assert.ok(one instanceof NativeSEPlayer4);assert.equal(one.signal,h.root.signal);assert.equal(h.p3Loads,1);assert.equal(h.p4Loads,1);assert.equal(h.reads,0);assert.equal(h.hooks,1);assert.deepEqual(h.sound.diagnostics,{status:[],player:[],failed:false});assert.equal(h.sound.anySEPlaying(),false);assert.throws(()=>h.sound.isSEPlayerPlaying(5),/not created/);assert.throws(()=>h.sound.isSEPlayerPlaying(6),/not created/);await h.frame();assert.equal(h.clock.tick,1);}finally{h.dispose();}
});

test('concurrent menu preparation decodes SELECT once for Root lifetime; no CARD2 or new audio owner is created',async()=>{
 const h=fixture();try{const [one,two]=await Promise.all([h.sound.prepareMenuPlayer(h.root.signal),h.sound.prepareMenuPlayer(h.root.signal)]);assert.ok(one===two,'one Root P4 reference is reused');assert.equal(h.p4Loads,1);assert.equal(h.decodes,1);assert.deepEqual(h.requests,['/source/repel-audio/1500-SEQ_SE_DP_SELECT.wav']);await h.sound.prepareMenuPlayer(h.root.signal);assert.equal(h.decodes,1);assert.equal(h.nodes.length,0);assert.equal(h.master.gain.value,0,'native transport does not change shared global mute');assert.deepEqual(h.sound.diagnostics,{status:[],player:[],failed:false});}finally{h.dispose();}
});

test('actual Root after-tasks hook preserves P3 then P4 order without map scopes and counts finite completion until sound update',async()=>{
 const h=fixture();try{const one=await h.sound.preparePlayer(h.root.signal),two=await h.sound.prepareMenuPlayer(h.root.signal),order:string[]=[],a=one.soundUpdate.bind(one),b=two.soundUpdate.bind(two);one.soundUpdate=()=>{order.push('P3');a();};two.soundUpdate=()=>{order.push('P4');b();};await h.sound.audio.prepare([1561,2171],h.root.signal);const switchDone=h.sound.audio.switch1561(h.root.signal);h.sound.menuSE1500({},h.root.signal,{selectMuted:false});assert.equal(h.nodes.length,2);assert.equal(h.sound.isSEPlayerPlaying(3),true);assert.equal(h.sound.isSEPlayerPlaying(4),true);for(const node of h.nodes)node.end();await flush();assert.equal(h.sound.anySEPlaying(),true);assert.equal(h.sound.isSEPlayerPlaying(4),true,'P4 alone stays counted before Root sound phase');assert.equal(h.hooks,1);await h.frame();await switchDone;assert.deepEqual(order,['P3','P4']);assert.equal(h.sound.anySEPlaying(),false);assert.equal(h.clock.tick,1);assert.deepEqual(h.errors,[]);}finally{h.dispose();}
});

test('native SELECT-only mute suppresses allocation before preemption; master mute is a separate gain owner',async()=>{
 const h=fixture();try{await h.sound.prepareMenuPlayer(h.root.signal);const first={};assert.equal(h.sound.menuSE1500(first,h.root.signal,{selectMuted:false}).kind,'voice');const node=h.nodes[0];assert.equal(h.master.gain.value,0);assert.equal(h.sound.menuSE1500({},h.root.signal,{selectMuted:true}).kind,'no-voice');assert.equal(node.stopped,false);assert.equal(h.nodes.length,1);h.sound.cancelMenuOwner(first);assert.equal(node.stopped,true);assert.equal(h.sound.anySEPlaying(),false);}finally{h.dispose();}
});

test('equal priority menu attempt preempts BEFORE failed technical allocation and stale owner cleanup cannot stop newer P4',async()=>{
 const h=fixture();try{const registry=await h.sound.prepareMenuPlayer(h.root.signal),old={};h.sound.menuSE1500(old,h.root.signal,{selectMuted:false});h.failNode=true;assert.equal(h.sound.menuSE1500({},h.root.signal,{selectMuted:false}).kind,'no-voice');assert.equal(h.nodes[0].stopped,true);assert.equal(registry.isPlaying(1500),false);h.failNode=false;h.sound.menuSE1500(old,h.root.signal,{selectMuted:false});let stopped=false;const foreign={};registry.play(1500,foreign,()=>({ended:new Promise(()=>{}),stop(){stopped=true;}}));h.sound.cancelMenuOwner(old);assert.equal(stopped,false);assert.equal(registry.isPlaying(1500),true);registry.cancelOwner(foreign);assert.equal(stopped,true);}finally{h.dispose();}
});

test('existing Repel transport borrows the SAME P3/P4/resources identity instead of making another registry',async()=>{
 const h=fixture();try{const player3=await h.sound.preparePlayer(h.root.signal),player4=await h.sound.preparePlayer4(h.root.signal),repel=createNativeRepelAudio(player4.resources,{player3,player4,output:()=>h.output,report(){},fetchBytes:async url=>array(await bytes(url))});try{await repel.prepare(h.root.signal);repel.play(1500,{},h.root.signal,{selectMuted:false});assert.equal(h.sound.isSEPlayerPlaying(4),true);repel.play(1535,{},h.root.signal,{selectMuted:false});assert.equal(h.sound.isSEPlayerPlaying(3),true);assert.equal(h.hooks,1);for(const node of h.nodes)node.end();await h.frame();assert.equal(h.sound.anySEPlaying(),false);}finally{repel.dispose();}}finally{h.dispose();}
});

test('menu caller cancellation abandons only bounded root metadata/cache and cannot create a late action',async()=>{
 const loading=deferred<any>(),caller=new AbortController();const h=fixture({menuLoad:()=>loading.promise});try{const pending=h.sound.prepareMenuPlayer(caller.signal);await flush();caller.abort(Error('learner canceled'));await assert.rejects(pending,/learner canceled/);loading.resolve(structuredClone(p4));const registry=await h.sound.preparePlayer4(h.root.signal);assert.ok(registry);assert.equal(h.nodes.length,0);assert.equal(h.decodes,0);assert.equal(h.reads,0);await h.sound.prepareMenuPlayer(h.root.signal);assert.equal(h.decodes,1);assert.equal(h.p4Loads,1);}finally{h.dispose();}
});

test('ignored menu metadata timeout cannot publish late ownership and explicit retry reauthenticates',async()=>{
 const loading=deferred<any>();let calls=0;const h=fixture({timeout:20,menuLoad:()=>++calls===1?loading.promise:Promise.resolve(structuredClone(p4))});try{await assert.rejects(h.sound.preparePlayer4(h.root.signal),/menu metadata preparation timed out/);loading.resolve(structuredClone(p4));const registry=await h.sound.preparePlayer4(h.root.signal);assert.equal(calls,2);assert.equal(registry.signal,h.root.signal);assert.equal(h.reads,0);assert.equal(h.hooks,1);}finally{h.dispose();}
});

test('partial menu constructor failure removes its P4 listener and preserves existing P3/root for retry',async()=>{
 const h=fixture();try{const registry=await h.sound.preparePlayer(h.root.signal),before=getEventListeners(h.root.signal,'abort').length,old=registry.resources.playerSequences[1535].volume;registry.resources.playerSequences[1535].volume=old+1;await assert.rejects(h.sound.preparePlayer4(h.root.signal),/different CARD2 metadata/);assert.equal(getEventListeners(h.root.signal,'abort').length,before);assert.equal(h.sound.diagnostics.failed,false);assert.equal(h.sound.isSEPlayerPlaying(4),false);registry.resources.playerSequences[1535].volume=old;await h.sound.preparePlayer4(h.root.signal);assert.equal(h.p4Loads,2);await h.frame();assert.deepEqual(h.errors,[]);}finally{h.dispose();}
});

test('root abort during metadata admission rejects pending work, removes the single hook and never revives late P4',async()=>{
 const loading=deferred<any>(),h=fixture({menuLoad:()=>loading.promise});const pending=h.sound.preparePlayer4(h.root.signal);await flush();h.root.abort(Error('root teardown'));await assert.rejects(pending,/root teardown/);loading.resolve(structuredClone(p4));await flush();assert.equal(h.reads,0);assert.equal(h.nodes.length,0);assert.equal(getEventListeners(h.root.signal,'abort').length,0);await assert.rejects(h.sound.preparePlayer4(new AbortController().signal),/root teardown/);h.dispose();
});

test('menu diagnostics failure remains local and cannot kill Root clock, P3 or newer external P4 owner',async()=>{
 const h=fixture({reportMenu:status=>{if(status.stage==='ended')throw Error('menu reporter unavailable');}});try{const registry=await h.sound.prepareMenuPlayer(h.root.signal);h.sound.menuSE1500({},h.root.signal,{selectMuted:false});h.nodes[0].end();await flush();await flush();assert.equal(h.sound.menuDiagnostics.failed,true);assert.equal(h.sound.diagnostics.failed,false);assert.throws(()=>h.sound.menuSE1500({},h.root.signal,{selectMuted:false}),/status port failed/);let stopped=false;registry.play(1500,{},()=>({ended:new Promise(()=>{}),stop(){stopped=true;}}));await h.frame();await h.frame();assert.equal(h.clock.tick,2);assert.deepEqual(h.errors,[]);assert.equal(stopped,false);assert.equal(h.sound.isSEPlayerPlaying(4),true);await h.sound.audio.prepare([1561,2171],h.root.signal);const switchDone=h.sound.audio.switch1561(h.root.signal);assert.equal(h.sound.isSEPlayerPlaying(3),true);h.nodes.at(-1).end();await h.frame();await switchDone;}finally{h.dispose();}
});

test('locked menu preparation admits explicit no-voice, no Context, and never rewrites mute/preferences',async()=>{
 const h=fixture({locked:true});try{await h.sound.prepareMenuPlayer(h.root.signal);assert.equal(h.requests.length,0);assert.equal(h.decodes,0);assert.equal(h.sound.menuSE1500({},h.root.signal,{selectMuted:false}).kind,'no-voice');assert.equal(h.nodes.length,0);assert.equal(h.master.gain.value,0);await h.frame();assert.equal(h.sound.anySEPlaying(),false);assert.deepEqual(h.errors,[]);}finally{h.dispose();}
});

test('menu dispatch needs prior actual preparation and action abort/disposal releases only owned admissions',async()=>{
 const h=fixture();assert.throws(()=>h.sound.menuSE1500({},h.root.signal,{selectMuted:false}),/prepared/);const registry=await h.sound.prepareMenuPlayer(h.root.signal),action=new AbortController();h.sound.menuSE1500({},action.signal,{selectMuted:false});action.abort(Error('menu closed'));assert.equal(h.nodes[0].stopped,true);assert.equal(registry.isPlaying(1500),false);h.sound.menuSE1500({},h.root.signal,{selectMuted:false});h.dispose();assert.ok(h.nodes.every(node=>node.stopped&&node.disconnected));assert.throws(()=>registry.isPlaying(1500),/disposed/);
});


test('prepared and started menu reporting failures are local even when a foreign P4 voice follows synchronously',async()=>{
 for(const stage of['prepared','started']){const h=fixture({reportMenu:status=>{if(status.stage===stage)throw Error('synchronous menu reporter '+stage);}});try{const registry=await h.sound.preparePlayer4(h.root.signal);if(stage==='prepared')await assert.rejects(h.sound.prepareMenuPlayer(h.root.signal),/status port failed/);else{await h.sound.prepareMenuPlayer(h.root.signal);assert.throws(()=>h.sound.menuSE1500({},h.root.signal,{selectMuted:false}),/status port failed/);}let stopped=false;registry.play(1500,{},()=>({ended:new Promise(()=>{}),stop(){stopped=true;}}));await flush();assert.equal(h.sound.menuDiagnostics.failed,true);assert.equal(h.sound.diagnostics.failed,false);assert.equal(stopped,false);assert.equal(h.sound.isSEPlayerPlaying(4),true);await h.frame();assert.deepEqual(h.errors,[]);}finally{h.dispose();}}
});

test('Root P3 failure tears down its borrowed foreign P4 and removes the existing shared sound hook',async()=>{
 const h=fixture({report:status=>{if(status.stage==='started')throw Error('fatal Root P3 reporter');}});try{const registry=await h.sound.preparePlayer4(h.root.signal);let stopped=false;registry.play(1500,{},()=>({ended:new Promise(()=>{}),stop(){stopped=true;}}));await h.sound.audio.prepare([1561,2171],h.root.signal);const fatal=assert.rejects(h.sound.failure,/status|report/);await assert.rejects(h.sound.audio.switch1561(h.root.signal),/status|report/);await fatal;assert.equal(stopped,true);assert.equal(h.sound.diagnostics.failed,true);assert.throws(()=>registry.isPlaying(1500),/disposed/);assert.equal(h.activeHooks,0);}finally{h.dispose();}
});

test('caller abort during real SELECT decode abandons only its wait; Root cache completes once and no late action is created',async()=>{
 const decoded=deferred<any>(),entered=deferred<void>(),caller=new AbortController();let payload:ArrayBuffer|undefined;const h=fixture({decode:async value=>{payload=value;entered.resolve();return decoded.promise;}});try{const pending=h.sound.prepareMenuPlayer(caller.signal);await entered.promise;caller.abort(Error('closed during SELECT decode'));await assert.rejects(pending,/closed during SELECT decode/);const wav=Buffer.from(payload!);decoded.resolve({numberOfChannels:2,duration:wav.readUInt32LE(40)/4/32768});await h.sound.prepareMenuPlayer(h.root.signal);assert.equal(h.decodes,1);assert.equal(h.requests.length,1);assert.equal(h.nodes.length,0);assert.throws(()=>h.sound.menuSE1500({},caller.signal,{selectMuted:false}),/closed during SELECT decode/);assert.equal(h.sound.anySEPlaying(),false);}finally{h.dispose();}
});

test('cleanup from one menu owner cannot stop a newer menu owner sharing the same transport',async()=>{
 const h=fixture();try{await h.sound.prepareMenuPlayer(h.root.signal);const first={},second={};h.sound.menuSE1500(first,h.root.signal,{selectMuted:false});h.sound.menuSE1500(second,h.root.signal,{selectMuted:false});assert.equal(h.nodes[0].stopped,true);assert.equal(h.nodes[1].stopped,false);h.sound.cancelMenuOwner(first);assert.equal(h.nodes[1].stopped,false);assert.equal(h.sound.isSEPlayerPlaying(4),true);h.sound.cancelMenuOwner(second);assert.equal(h.nodes[1].stopped,true);assert.equal(h.sound.isSEPlayerPlaying(4),false);}finally{h.dispose();}
});

test('frozen accepted Repel source proves exact unchanged P4 class and only additive menu preparation',async()=>{
 const before=await readFile(new URL('../../reviews/native-menu-player4/accepted-89f5c7d5/repel-audio.ts',import.meta.url),'utf8'),after=await readFile(new URL('./repel-audio.ts',import.meta.url),'utf8'),block=(s:string)=>s.slice(s.indexOf('export class NativeSEPlayer4'),s.indexOf('export type RepelAudioStatus'));assert.equal(block(after),block(before));assert.equal(hash(Buffer.from(before)),'f4f5a1645e9a49b3cf181762a54c35016f3ef4e1f331db1e2aef22bac556afc4');assert.equal(after.replace('async prepareMenu(signal:AbortSignal){await prepareOne(1500,signal);},',''),before);
});
