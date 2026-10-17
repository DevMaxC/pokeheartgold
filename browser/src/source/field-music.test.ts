import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createNativeFieldMusicPlayer,nativeFieldMusic,UnsupportedNativeMusic,type NativeFieldCatalog,type NativeFieldTrack,type SharedHatchTrack} from './field-music.ts';
const A={id:1018,key:'SEQ_GS_T_WAKABA'},B={id:1019,key:'SEQ_GS_C_YOSHINO'},SURF={id:1014,key:'SEQ_GS_NAMINORI'};
const clone=<T>(value:T)=>structuredClone(value),flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
const hash=(data:ArrayBuffer)=>createHash('sha256').update(Buffer.from(data)).digest('hex');
function body(value:unknown){const b=Buffer.from(JSON.stringify(value));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)as ArrayBuffer;}
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
function fixture(options:{ioTimeoutMs?:number}={}){
 const files=new Map<string,ArrayBuffer>(),requests:string[]=[],log:string[]=[],sources:any[]=[],contexts:any[]=[];
 const tracks:Record<string,NativeFieldTrack>={};for(const cue of[A,B,SURF]){const formats=(['aac','mp3']as const).map(codec=>{const file=cue.id+'-'+cue.key+(codec==='aac'?'.m4a':'.mp3'),bytes=body({codec,id:cue.id,duration:10,channels:2});files.set('/source/music/'+file,bytes);return{codec,file,bytes:bytes.byteLength,sha256:hash(bytes),decodedSampleRate:48000,decodedFrames:480000,leadingFrames:0};});tracks[cue.id]={...cue,status:'ready',sampleRate:32768,frames:327680,channels:2,loopFrames:[32768,294912],formats};}
 const catalog:NativeFieldCatalog={version:1,maps:{60:{day:A,night:B},61:{day:A,night:A},73:{day:B,night:B}},storyOverrides:[{map:60,flag:'FLAG_FIXTURE_STORY',flagId:123,cue:B}],surf:SURF,surfSuppressionFlag:'FLAG_UNK_99A',surfSuppressionFlagId:0x99A,nightHours:[0,1,2,3,20,21,22,23],tracks};
 const controls:{failAAC?:boolean;resume?:()=>Promise<void>;load?:()=>Promise<NativeFieldCatalog>;fetch?:(url:string,signal:AbortSignal)=>Promise<ArrayBuffer>;decode?:(data:ArrayBuffer)=>Promise<any>;badDuration?:boolean}={};
 class Source{buffer:any;loop=false;loopStart=0;loopEnd=0;offset=0;onended:(()=>void)|null=null;stopped=false;disconnected=false;connect(){}start(_when:number,offset:number){this.offset=offset;log.push('start:'+JSON.stringify(this.buffer));}stop(){this.stopped=true;}disconnect(){this.disconnected=true;}}
 class Context{state='suspended';sampleRate=48000;currentTime=0;destination={};gain={gain:{value:1},connect(){},disconnect(){log.push('gain-disconnect');}};constructor(){contexts.push(this);log.push('context');}resume(){log.push('resume');if(controls.resume)return controls.resume();this.state='running';return Promise.resolve();}createGain(){return this.gain;}createBufferSource(){const source=new Source();sources.push(source);return source;}async decodeAudioData(data:ArrayBuffer){if(controls.decode)return controls.decode(data);const metadata=JSON.parse(Buffer.from(data).toString());if(controls.failAAC&&metadata.codec==='aac')throw Error('Fixture mobile decoder rejects AAC');return{numberOfChannels:metadata.channels,duration:controls.badDuration?metadata.duration+1:metadata.duration,metadata};}async close(){this.state='closed';log.push('close');}}
 let catalogLoads=0;const player=createNativeFieldMusicPlayer({enabled:true,volume:.5,unlockTimeoutMs:20,...options,createContext:()=>new Context()as any,loadCatalog:async()=>{catalogLoads++;return controls.load?controls.load():catalog;},fetchBytes:async(url,signal)=>{requests.push(url);if(controls.fetch)return controls.fetch(url,signal);const found=files.get(url);if(!found)throw Error('Missing fixture audio '+url);return found.slice(0);}});
 return{player,catalog,files,requests,log,sources,contexts,controls,get catalogLoads(){return catalogLoads;}};
}
test('native resolver preserves RTC boundary, story flag order, Surf suppression and saved override precedence',()=>{
 const f=fixture(),state={hour:12,flags:{}as Record<string,boolean>};assert.deepEqual(nativeFieldMusic(f.catalog,{id:60},state),{cue:A,source:'map'});
 for(const hour of[0,3,20,23])assert.deepEqual(nativeFieldMusic(f.catalog,{id:60},{...state,hour}).cue,B);for(const hour of[4,19])assert.deepEqual(nativeFieldMusic(f.catalog,{id:60},{...state,hour}).cue,A);
 assert.deepEqual(nativeFieldMusic(f.catalog,{id:60},{...state,flags:{'#123':true}}).cue,B);
 assert.deepEqual(nativeFieldMusic(f.catalog,{id:60},{...state,surfing:true,override:B}),{cue:SURF,source:'surf'});
 assert.deepEqual(nativeFieldMusic(f.catalog,{id:60},{...state,surfing:true,flags:{FLAG_UNK_99A:true},override:B}),{cue:B,source:'other'});
 assert.deepEqual(nativeFieldMusic(f.catalog,{id:60},{...state,surfing:true,flags:{'#2458':true}}).cue,A);
 assert.throws(()=>nativeFieldMusic(f.catalog,{id:9999},state),UnsupportedNativeMusic);assert.throws(()=>nativeFieldMusic(f.catalog,{id:60},{...state,hour:24}));
});
test('construction and map intent fetch no songs or Context until synchronous gesture unlock',async()=>{
 const f=fixture();assert.equal(f.contexts.length,0);assert.deepEqual(await f.player.playMap({id:60},{hour:12,flags:{}}),{status:'locked',cue:A});assert.equal(f.contexts.length,0);assert.equal(f.requests.length,0);
 const unlocking=f.player.unlock();assert.deepEqual(f.log,['context','resume']);await unlocking;assert.equal(f.requests.length,1);assert.equal(f.sources.length,1);assert.equal(f.sources[0].loop,true);assert.equal(f.sources[0].loopStart,1);assert.equal(f.sources[0].loopEnd,9);await f.player.dispose();
});
test('same native cue across headers preserves actual phase/identity and changing cues stops the old voice',async()=>{
 const f=fixture();await f.player.unlock();await f.player.playCue(A,'map');f.contexts[0].currentTime=11;const before=f.player.capture();assert.equal(before.kind,'playing');if(before.kind==='playing')assert.equal(before.positionSeconds,3);
 await f.player.playMap({id:61},{hour:22,flags:{}});assert.deepEqual(f.player.capture(),before);assert.equal(f.sources.length,1);await f.player.playCue(B,'map');assert.equal(f.sources.length,2);assert.ok(f.sources[0].stopped&&f.sources[0].disconnected);assert.notDeepEqual(f.player.capture(),before);await f.player.dispose();
});
test('mute/volume owns the shared gain and preserves the paused phase without a new download or intro restart',async()=>{
 const f=fixture();await f.player.unlock();await f.player.playCue(A,'map');f.contexts[0].currentTime=4;await f.player.setPreferences({enabled:false,volume:.2});const paused=f.player.capture();f.contexts[0].currentTime=104;assert.deepEqual(f.player.capture(),paused);assert.equal(f.contexts[0].gain.gain.value,0);const count=f.requests.length;await f.player.setPreferences({enabled:true,volume:.2});assert.equal(f.contexts[0].gain.gain.value,.2);assert.equal(f.sources.at(-1).offset,4);assert.equal(f.requests.length,count);assert.throws(()=>createNativeFieldMusicPlayer({enabled:true,volume:2}));await f.player.dispose();
});
test('unsupported primary mobile codec falls back to the independently checksummed MP3 and no unsupported tune substitutes',async()=>{
 const f=fixture();f.controls.failAAC=true;await f.player.unlock();await f.player.playCue(A);assert.equal(f.requests.length,2);assert.ok(f.requests[1].endsWith('.mp3'));assert.equal(f.sources.length,1);await assert.rejects(f.player.playCue({id:999,key:'SEQ_NOT_EXPORTED'}),UnsupportedNativeMusic);assert.ok(f.sources[0].stopped);assert.deepEqual(f.player.capture(),{kind:'none'});await f.player.dispose();
});
test('bad decoded timing rejects all formats explicitly instead of claiming enabled silent success',async()=>{
 const f=fixture();f.controls.badDuration=true;await f.player.unlock();await assert.rejects(f.player.playCue(A),/None of the original audio formats/);assert.equal(f.sources.length,0);assert.equal(f.requests.length,2);await f.player.dispose();
});
test('latest cue wins an in-flight switch; late bytes from an aborted older request cannot start a node',async()=>{
 const f=fixture(),old=deferred<ArrayBuffer>();await f.player.unlock();f.controls.fetch=async(url)=>url.includes('1018-')?old.promise:f.files.get(url)!.slice(0);const pending=f.player.playCue(A),failed=assert.rejects(pending,/replaced/);await flush();await f.player.playCue(B);old.resolve(f.files.get('/source/music/'+f.catalog.tracks[A.id].formats![0].file)!);await failed;assert.equal(f.sources.length,1);assert.deepEqual((f.player.capture()as any).cue,B);await f.player.dispose();
});
test('late map-catalog completion cannot overwrite a newer direct cue intent',async()=>{
 const f=fixture(),loaded=deferred<NativeFieldCatalog>();f.controls.load=()=>loaded.promise;await f.player.unlock();const old=f.player.playMap({id:60},{hour:12,flags:{}}),rejected=assert.rejects(old,/intent replaced/);const latest=f.player.playCue(B);loaded.resolve(f.catalog);await Promise.all([latest,rejected]);assert.deepEqual((f.player.capture()as any).cue,B);assert.equal(f.sources.length,1);await f.player.dispose();
});
test('external abort during cue loading cannot interrupt the prior committed voice or start late audio',async()=>{
 const f=fixture();await f.player.unlock();await f.player.playCue(A);const loaded=deferred<ArrayBuffer>(),signal=new AbortController();f.controls.fetch=()=>loaded.promise;const pending=f.player.playCue(B,'map',signal.signal),rejected=assert.rejects(pending,/cancel transition/);await flush();signal.abort(Error('cancel transition'));loaded.resolve(f.files.get('/source/music/'+f.catalog.tracks[B.id].formats![0].file)!);await rejected;assert.equal(f.sources.length,1);assert.equal(f.sources[0].stopped,false);assert.deepEqual((f.player.capture()as any).cue,A);await f.player.dispose();
});
test('field interruption captures authoritative paused phase after loading latency and restore ignores the aborted hatch signal',async()=>{
 const f=fixture();await f.player.unlock();await f.player.playCue(A,'surf');f.contexts[0].currentTime=2;const initial=f.player.capture();f.contexts[0].currentTime=5;const paused=await f.player.field.suspend(initial);assert.equal((paused as any).positionSeconds,5);f.contexts[0].currentTime=50;assert.deepEqual(f.player.capture(),paused);await f.player.field.restore(paused);assert.equal(f.sources.at(-1).offset,5);await f.player.field.restore(paused);assert.equal(f.sources.length,2);await f.player.dispose();
});
test('a newer map intent while interrupted replaces the old song on resume instead of resurrecting stale field music',async()=>{
 const f=fixture();await f.player.unlock();await f.player.playCue(A,'map');const paused=await f.player.field.suspend(f.player.capture());await f.player.playCue(B,'map');assert.equal(f.sources.length,1);await f.player.field.restore(paused);assert.deepEqual((f.player.capture()as any).cue,B);assert.equal(f.sources.length,2);await f.player.dispose();
});
test('shared hatch transport uses the already unlocked context, retains volume and disposes only its own nodes',async()=>{
 const f=fixture();await f.player.unlock();await f.player.playCue(A,'map');const paused=await f.player.field.suspend(f.player.capture());const data=body({codec:'wave',duration:10,channels:2}),track:SharedHatchTrack={id:1011,key:'SEQ_GS_SHINKA',file:'1011-SEQ_GS_SHINKA.wav',sampleRate:32768,frames:327680,completionFrame:327680,loopFrames:[32768,294912],wavSHA256:hash(data)};f.files.set('/source/hatching/music/'+track.file,data);const transport=f.player.createHatchTransport(),signal=new AbortController();await transport.prepare(track,signal.signal);const requests=f.requests.length,music=await transport.play(track,signal.signal);assert.equal(f.requests.length,requests);assert.equal(f.contexts.length,1);assert.equal(f.contexts[0].gain.gain.value,.5);music.pause();music.resume();await transport.dispose();assert.equal(f.contexts[0].state,'running');await f.player.field.restore(paused);assert.deepEqual((f.player.capture()as any).cue,A);await f.player.dispose();
});
test('native effects borrow only the gesture-unlocked output, retain preferences and observe player disposal',async()=>{
 const f=fixture(),lifetime=f.player.lifetimeSignal;assert.equal(lifetime.aborted,false);assert.equal(f.player.lifetimeSignal,lifetime);assert.throws(()=>f.player.sharedAudioOutput(),/unlock native game sound/);assert.equal(f.contexts.length,0);assert.equal(f.requests.length,0);
 await f.player.unlock();const output=f.player.sharedAudioOutput();assert.equal(output.context,f.contexts[0]);assert.equal(output.output,f.contexts[0].gain);assert.equal(output.signal.aborted,false);assert.equal(output.signal,lifetime);assert.equal(f.contexts.length,1);assert.equal(f.requests.length,0);
 await f.player.setPreferences({enabled:false,volume:.3});assert.equal(f.player.sharedAudioOutput().output,output.output);assert.equal(f.contexts[0].gain.gain.value,0);
 await f.player.setPreferences({enabled:true,volume:.3});assert.equal(f.contexts[0].gain.gain.value,.3);assert.equal(output.signal.aborted,false);
 f.contexts[0].state='suspended';assert.throws(()=>f.player.sharedAudioOutput(),/unlock native game sound/);assert.equal(f.log.filter(value=>value==='resume').length,1);f.contexts[0].state='running';
 let cancelled=0;output.signal.addEventListener('abort',()=>{cancelled++;assert.equal(f.contexts[0].state,'running');assert.equal(f.log.includes('gain-disconnect'),false);});await f.player.dispose();assert.equal(cancelled,1);assert.equal(output.signal.aborted,true);assert.match(String(output.signal.reason),/disposed/);assert.throws(()=>f.player.sharedAudioOutput(),/disposed/);assert.equal(f.contexts.length,1);
});
test('whole-player disposal rejects active shared voices, closes one context and never revives on a late operation',async()=>{
 const f=fixture();await f.player.unlock();const data=body({codec:'wave',duration:10,channels:2}),track:SharedHatchTrack={id:1011,key:'SEQ_GS_SHINKA',file:'1011-SEQ_GS_SHINKA.wav',sampleRate:32768,frames:327680,completionFrame:327680,loopFrames:null,wavSHA256:hash(data)};f.files.set('/source/hatching/music/'+track.file,data);const transport=f.player.createHatchTransport(),voice=await transport.play(track,new AbortController().signal),ended=assert.rejects(voice.ended,/disposed/);await f.player.dispose();await ended;assert.equal(f.contexts[0].state,'closed');assert.ok(f.sources.every(source=>source.stopped&&source.disconnected));await f.player.dispose();await assert.rejects(f.player.playCue(A),/disposed/);await transport.dispose();
});
test('blocked gesture unlock times out explicitly, and a later real gesture can retry the same Context',async()=>{
 const f=fixture();f.controls.resume=()=>new Promise(()=>{});await assert.rejects(f.player.unlock(),/Tap again/);assert.equal(f.contexts.length,1);f.controls.resume=async()=>{f.contexts[0].state='running';};await f.player.unlock();assert.equal(f.contexts.length,1);await f.player.playCue(A);assert.equal(f.sources.length,1);await f.player.dispose();
});
test('catalog failure is retryable and deliberate muted intent does not fetch or decode a song',async()=>{
 const f=fixture();let attempts=0;f.controls.load=async()=>{if(++attempts===1)throw Error('catalog503');return f.catalog;};await assert.rejects(f.player.playMap({id:60},{hour:12,flags:{}}),/503/);await f.player.setPreferences({enabled:false,volume:.4});assert.deepEqual(await f.player.playMap({id:60},{hour:12,flags:{}}),{status:'muted',cue:A});assert.equal(f.catalogLoads,2);assert.equal(f.requests.length,0);assert.equal(f.contexts.length,0);await f.player.dispose();
});
test('failed field restore is retryable and cannot silently mark a missing restored song successful',async()=>{
 const f=fixture();await f.player.unlock();await f.player.playCue(A);const saved=await f.player.field.suspend(f.player.capture());await f.player.playCue(B);f.controls.badDuration=true;await assert.rejects(f.player.field.restore(saved),/None of/);f.controls.badDuration=false;await f.player.field.restore(saved);assert.deepEqual((f.player.capture()as any).cue,B);await f.player.dispose();
});
test('missing map stops old committed and late-loading music rather than retaining stale intent',async()=>{
 const f=fixture();await f.player.unlock();await f.player.playCue(A);await assert.rejects(f.player.playMap({id:99999},{hour:12,flags:{}}),UnsupportedNativeMusic);assert.deepEqual(f.player.capture(),{kind:'none'});await f.player.setPreferences({enabled:true,volume:.8});assert.deepEqual(f.player.capture(),{kind:'none'});const pending=deferred<ArrayBuffer>();f.controls.fetch=()=>pending.promise;const old=f.player.playCue(B),rejected=assert.rejects(old,/replaced/);await flush();await assert.rejects(f.player.playMap({id:99999},{hour:12,flags:{}}),UnsupportedNativeMusic);pending.resolve(f.files.get('/source/music/'+f.catalog.tracks[B.id].formats![0].file)!);await rejected;assert.equal(f.sources.length,1);assert.deepEqual(f.player.capture(),{kind:'none'});await f.player.dispose();
});
test('native sequence identity preserves phase across map/override/radio label changes',async()=>{
 const f=fixture();await f.player.unlock();await f.player.playCue(A,'map');f.contexts[0].currentTime=6;const previous=f.player.capture();await f.player.playCue(A,'radio');assert.equal(f.sources.length,1);assert.equal((f.player.capture()as any).identity,(previous as any).identity);assert.equal((f.player.capture()as any).positionSeconds,6);assert.equal((f.player.capture()as any).source,'radio');await f.player.dispose();
});
test('volume-only preferences share the active load without dropping its caller cancellation',async()=>{
 const f=fixture();await f.player.unlock();const pending=deferred<ArrayBuffer>(),cancel=new AbortController();f.controls.fetch=()=>pending.promise;const load=f.player.playCue(A,'map',cancel.signal),rejected=assert.rejects(load,/cancel original/);await flush();const volume=f.player.setPreferences({enabled:true,volume:.2}),volumeRejected=assert.rejects(volume,/cancel original/);cancel.abort(Error('cancel original'));pending.resolve(f.files.get('/source/music/'+f.catalog.tracks[A.id].formats![0].file)!);await Promise.all([rejected,volumeRejected]);assert.equal(f.requests.length,1);assert.equal(f.sources.length,0);await f.player.dispose();
});
test('battle cue session owns a distinct voice, restores actual field phase and rejects nested interruptions',async()=>{
 const f=fixture();await f.player.unlock();await f.player.playCue(A,'map');f.contexts[0].currentTime=6;const saved=f.player.capture(),battle=f.player.createCueSession(),cancel=new AbortController();await battle.start(B,cancel.signal);assert.equal(f.sources.length,2);assert.deepEqual(f.player.capture(),saved);assert.ok(f.sources[0].stopped);await assert.rejects(f.player.createCueSession().start(B,new AbortController().signal),/interruption/);f.contexts[0].currentTime=50;await battle.restore();assert.ok(f.sources[1].stopped);assert.equal(f.sources[2].offset,6);await battle.restore();assert.equal(f.sources.length,3);await f.player.dispose();
});
test('battle abort stops owned cue and blackout/new map intent wins the return; failed restore can retry',async()=>{
 const f=fixture();await f.player.unlock();await f.player.playCue(A,'map');const battle=f.player.createCueSession(),cancel=new AbortController();await battle.start(B,cancel.signal);cancel.abort(Error('battle failed'));assert.ok(f.sources[1].stopped);await f.player.playCue(SURF,'surf');f.controls.badDuration=true;await assert.rejects(battle.restore(),/None of/);f.controls.badDuration=false;await battle.restore();assert.deepEqual((f.player.capture()as any).cue,SURF);assert.equal(f.sources.at(-1).offset,0);await f.player.dispose();
});
test('muted battle requests no song, unmute starts its native cue, mute/unmute retains its phase',async()=>{
 const f=fixture();await f.player.unlock();await f.player.setPreferences({enabled:false,volume:.4});const session=f.player.createCueSession();await session.start(B,new AbortController().signal);assert.equal(f.requests.length,0);await f.player.setPreferences({enabled:true,volume:.4});assert.equal(f.requests.length,1);f.contexts[0].currentTime=5;await f.player.setPreferences({enabled:false,volume:.4});f.contexts[0].currentTime=50;await f.player.setPreferences({enabled:true,volume:.4});assert.equal(f.sources.at(-1).offset,5);await session.restore();assert.deepEqual(f.player.capture(),{kind:'none'});await f.player.dispose();
});
test('restoring a battle session while its fetch ignores abort cannot leak a late battle voice',async()=>{
 const f=fixture();await f.player.unlock();const pending=deferred<ArrayBuffer>();f.controls.fetch=()=>pending.promise;const session=f.player.createCueSession(),started=session.start(B,new AbortController().signal),rejected=assert.rejects(started,/restored/);await flush();await session.restore();pending.resolve(f.files.get('/source/music/'+f.catalog.tracks[B.id].formats![0].file)!);await rejected;assert.equal(f.sources.length,0);await f.player.dispose();
});
test('a newer map during slow restore owns playback and cannot re-arm stale interruption',async()=>{
 const f=fixture();await f.player.unlock();await f.player.playCue(A,'map');const session=f.player.createCueSession();await session.start(B,new AbortController().signal);await f.player.playCue(SURF,'surf');const old=deferred<ArrayBuffer>();f.controls.fetch=async(url)=>url.includes('1014-')?old.promise:f.files.get(url)!.slice(0);const restore=session.restore();await flush();await f.player.playCue(B,'map');old.resolve(f.files.get('/source/music/'+f.catalog.tracks[SURF.id].formats![0].file)!);await restore;assert.deepEqual((f.player.capture()as any).cue,B);await f.player.playCue(A);assert.deepEqual((f.player.capture()as any).cue,A);const next=f.player.createCueSession();await next.start(B,new AbortController().signal);await next.restore();await f.player.dispose();
});
test('an encounter before first gesture records locked ownership; unlock starts encounter music, not field',async()=>{
 const f=fixture();await f.player.playCue(A,'map');const battle=f.player.createCueSession();await battle.start(B,new AbortController().signal);assert.equal(f.contexts.length,0);assert.equal(f.requests.length,0);await f.player.unlock();assert.equal(f.sources.length,1);assert.equal(f.sources[0].buffer.metadata.id,B.id);await battle.restore();assert.deepEqual((f.player.capture()as any).cue,A);await f.player.dispose();
});
test('repeated successful gesture unlock shares in-flight music loading and original caller cancellation',async()=>{
 const f=fixture();await f.player.unlock();const pending=deferred<ArrayBuffer>(),cancel=new AbortController();f.controls.fetch=()=>pending.promise;const load=f.player.playCue(A,'map',cancel.signal),rejected=assert.rejects(load,/original cancel/);await flush();const gesture=f.player.unlock(),gestureRejected=assert.rejects(gesture,/original cancel/);cancel.abort(Error('original cancel'));pending.resolve(f.files.get('/source/music/'+f.catalog.tracks[A.id].formats![0].file)!);await Promise.all([rejected,gestureRejected]);assert.equal(f.requests.length,1);await f.player.dispose();
});
test('mute changes after encounter abort do not resurrect or reject its terminated owned cue',async()=>{
 const f=fixture();await f.player.unlock();await f.player.playCue(A);const battle=f.player.createCueSession(),cancel=new AbortController();await battle.start(B,cancel.signal);cancel.abort(Error('encounter cancelled'));await f.player.setPreferences({enabled:false,volume:.3});await f.player.setPreferences({enabled:true,volume:.3});assert.equal(f.sources.length,2);await battle.restore();assert.deepEqual((f.player.capture()as any).cue,A);await f.player.dispose();
});
test('restore in the suspension microtask cancels start and coherently releases the field',async()=>{
 const f=fixture();await f.player.unlock();await f.player.playCue(A);const paused=deferred<void>(),release=deferred<void>(),original=f.player.field.suspend;f.player.field.suspend=async expected=>{const saved=await original(expected);paused.resolve();await release.promise;return saved;};const battle=f.player.createCueSession(),started=battle.start(B,new AbortController().signal),rejected=assert.rejects(started,/restored/);await paused.promise;await battle.restore();release.resolve();await rejected;await f.player.playCue(SURF);assert.deepEqual((f.player.capture()as any).cue,SURF);await f.player.dispose();
});
test('same native cue source label changes while interrupted remain current after phase restoration',async()=>{
 const f=fixture();await f.player.unlock();await f.player.playCue(A,'map');const saved=await f.player.field.suspend(f.player.capture());await f.player.playCue(A,'radio');assert.equal((f.player.capture()as any).source,'radio');await f.player.field.restore(saved);assert.equal((f.player.capture()as any).source,'radio');await f.player.dispose();
});
test('catalog caller cancellation rejects promptly without poisoning a shared consumer',async()=>{
 const f=fixture(),pending=deferred<NativeFieldCatalog>(),cancel=new AbortController();f.controls.load=()=>pending.promise;
 const abandoned=f.player.catalog(cancel.signal),rejected=assert.rejects(abandoned,/leave catalog/),retained=f.player.catalog();cancel.abort(Error('leave catalog'));await rejected;assert.equal(f.catalogLoads,1);
 pending.resolve(f.catalog);assert.equal(await retained,f.catalog);assert.equal(await f.player.catalog(),f.catalog);assert.equal(f.catalogLoads,1);await f.player.dispose();
});
test('catalog deadline evicts a hung shared request and cannot adopt its late result',async()=>{
 const f=fixture({ioTimeoutMs:15}),old=deferred<NativeFieldCatalog>();f.controls.load=()=>old.promise;await assert.rejects(f.player.catalog(),/catalog timed out/);
 f.controls.load=undefined;assert.equal(await f.player.catalog(),f.catalog);old.resolve({...f.catalog,tracks:{}});await flush();assert.equal(await f.player.catalog(),f.catalog);assert.equal(f.catalogLoads,2);await f.player.dispose();
});
for(const stage of['fetch','digest','decode']as const)test('abort-aware '+stage+' observation rejects without waiting for ignored abort, and late completion is not cached',{timeout:1000},async t=>{
 const f=fixture(),pending=deferred<any>(),entered=deferred<void>(),cancel=new AbortController();await f.player.unlock();
 const data=f.files.get('/source/music/'+f.catalog.tracks[A.id].formats![0].file)!,realDigest=crypto.subtle.digest.bind(crypto.subtle);
 let restore=()=>{};
 if(stage==='fetch')f.controls.fetch=()=>{entered.resolve();return pending.promise;};
 if(stage==='decode')f.controls.decode=()=>{entered.resolve();return pending.promise;};
 if(stage==='digest'){const spy=t.mock.method(crypto.subtle,'digest',()=>{entered.resolve();return pending.promise;});restore=()=>spy.mock.restore();}
 const loading=f.player.playCue(A,'map',cancel.signal),rejected=assert.rejects(loading,/cancel slow/);await entered.promise;cancel.abort(Error('cancel slow '+stage));await rejected;assert.equal(f.sources.length,0);
 pending.resolve(stage==='fetch'?data:stage==='digest'?await realDigest('SHA-256',data):{numberOfChannels:2,duration:10,metadata:{id:A.id}});await flush();restore();f.controls.fetch=undefined;f.controls.decode=undefined;
 await f.player.playCue(A);assert.equal(f.sources.length,1);assert.equal(f.requests.length,2);await f.player.dispose();
});
for(const stage of['fetch','decode']as const)test('background '+stage+' deadline aborts the owner without attempting another codec or starting late audio',async()=>{
 const f=fixture({ioTimeoutMs:15}),pending=deferred<any>();await f.player.unlock();let observed:AbortSignal|undefined;
 if(stage==='fetch')f.controls.fetch=(_url,signal)=>{observed=signal;return pending.promise;};else f.controls.decode=()=>pending.promise;
 await assert.rejects(f.player.playCue(A),/preparation timed out/);assert.equal(f.requests.length,1);assert.equal(f.sources.length,0);if(observed)assert.ok(observed.aborted);
 pending.resolve(stage==='fetch'?f.files.get('/source/music/'+f.catalog.tracks[A.id].formats![0].file)!:{numberOfChannels:2,duration:10});await flush();assert.equal(f.sources.length,0);await f.player.dispose();
});
test('a caller deadline during field restore preserves retryable interruption and no late voice',async()=>{
 const f=fixture(),pending=deferred<ArrayBuffer>(),entered=deferred<void>(),cancel=new AbortController();await f.player.unlock();await f.player.playCue(A);const saved=await f.player.field.suspend(f.player.capture());await f.player.playCue(B);
 f.controls.fetch=()=>{entered.resolve();return pending.promise;};const restoring=f.player.field.restore(saved,cancel.signal),rejected=assert.rejects(restoring,/restore deadline/);await entered.promise;cancel.abort(Error('restore deadline'));await rejected;assert.equal(f.sources.length,1);assert.equal(f.sources[0].stopped,true);
 f.controls.fetch=undefined;await f.player.field.restore(saved);assert.deepEqual((f.player.capture()as any).cue,B);pending.resolve(f.files.get('/source/music/'+f.catalog.tracks[B.id].formats![0].file)!);await flush();assert.equal(f.sources.length,2);await f.player.dispose();
});
test('cue session restore abort stops its owned voice immediately, keeps failed cleanup retryable and releases ownership on success',async()=>{
 const f=fixture(),pending=deferred<ArrayBuffer>(),entered=deferred<void>(),cancel=new AbortController();await f.player.unlock();await f.player.playCue(A);const battle=f.player.createCueSession();await battle.start(B,new AbortController().signal);await f.player.playCue(SURF);
 f.controls.fetch=()=>{entered.resolve();return pending.promise;};const restoring=battle.restore(cancel.signal),rejected=assert.rejects(restoring,/return deadline/);assert.equal(f.sources[1].stopped,true);await entered.promise;cancel.abort(Error('return deadline'));await rejected;await assert.rejects(f.player.createCueSession().start(B,new AbortController().signal),/interruption/);
 f.controls.fetch=undefined;await battle.restore();assert.deepEqual((f.player.capture()as any).cue,SURF);pending.resolve(f.files.get('/source/music/'+f.catalog.tracks[SURF.id].formats![0].file)!);await flush();assert.equal(f.sources.length,3);const next=f.player.createCueSession();await next.start(B,new AbortController().signal);await next.restore();await f.player.dispose();
});
test('already-aborted restore still tears down the session voice before rejecting, then can retry',async()=>{
 const f=fixture(),cancel=new AbortController();await f.player.unlock();await f.player.playCue(A);const battle=f.player.createCueSession();await battle.start(B,new AbortController().signal);cancel.abort(Error('already cancelled'));
 await assert.rejects(battle.restore(cancel.signal),/already cancelled/);assert.equal(f.sources[1].stopped,true);await battle.restore();assert.deepEqual((f.player.capture()as any).cue,A);await f.player.dispose();
});
test('aborted session catalog wait and disposed player reject despite a loader ignoring cancellation',async()=>{
 const f=fixture(),pending=deferred<NativeFieldCatalog>(),cancel=new AbortController();f.controls.load=()=>pending.promise;const battle=f.player.createCueSession(),starting=battle.start(B,cancel.signal),rejected=assert.rejects(starting,/cancel preparation/);cancel.abort(Error('cancel preparation'));await rejected;await battle.restore();
 const retained=f.player.catalog(),disposed=assert.rejects(retained,/disposed/);await f.player.dispose();await disposed;pending.resolve(f.catalog);await flush();assert.equal(f.sources.length,0);
});
test('shared hatch decode observes owner disposal and cannot cache or play a late decoded result',async()=>{
 const f=fixture(),pending=deferred<any>(),entered=deferred<void>();await f.player.unlock();const data=body({codec:'wave',duration:10,channels:2}),track:SharedHatchTrack={id:1011,key:'SEQ_GS_SHINKA',file:'1011-SEQ_GS_SHINKA.wav',sampleRate:32768,frames:327680,completionFrame:327680,loopFrames:null,wavSHA256:hash(data)};f.files.set('/source/hatching/music/'+track.file,data);f.controls.decode=()=>{entered.resolve();return pending.promise;};const transport=f.player.createHatchTransport(),preparing=transport.prepare(track,new AbortController().signal),rejected=assert.rejects(preparing,/disposed/);await entered.promise;await transport.dispose();await rejected;pending.resolve({numberOfChannels:2,duration:10});await flush();assert.equal(f.sources.length,0);await f.player.dispose();
});
test('isUnlocked reports actual Context permission separately from music preparation success',async()=>{
 const f=fixture();assert.equal(f.player.isUnlocked(),false);await f.player.playCue(A);f.controls.badDuration=true;await assert.rejects(f.player.unlock(),/None of/);assert.equal(f.player.isUnlocked(),true);
 f.contexts[0].state='suspended';assert.equal(f.player.isUnlocked(),false);f.controls.badDuration=false;await f.player.unlock();assert.equal(f.player.isUnlocked(),true);await f.player.dispose();assert.equal(f.player.isUnlocked(),false);
});
for(const session of[false,true])test('player disposal rejects a pending '+(session?'session':'field')+' restore instead of reporting a newer-map success',async()=>{
 const f=fixture(),pending=deferred<ArrayBuffer>(),entered=deferred<void>();await f.player.unlock();await f.player.playCue(A);let saved,battle;
 if(session){battle=f.player.createCueSession();await battle.start(B,new AbortController().signal);}else saved=await f.player.field.suspend(f.player.capture());
 await f.player.playCue(SURF);f.controls.fetch=()=>{entered.resolve();return pending.promise;};const restoring=battle?battle.restore():f.player.field.restore(saved!),rejected=assert.rejects(restoring,/disposed/);await entered.promise;await f.player.dispose();await rejected;assert.ok(f.sources.every(source=>source.stopped&&source.disconnected));assert.equal(f.player.isUnlocked(),false);
 pending.resolve(f.files.get('/source/music/'+f.catalog.tracks[SURF.id].formats![0].file)!);await flush();assert.equal(f.sources.length,session?2:1);assert.equal(f.contexts[0].state,'closed');
});


test('hidden-page master gate silences field, battle and shared hatch output through late loads and preference changes',async()=>{
 const f=fixture();f.player.setPageActive(false);assert.equal(f.contexts.length,0);await f.player.unlock();await f.player.playCue(A);assert.equal(f.contexts[0].gain.gain.value,0);
 await f.player.setPreferences({enabled:true,volume:.8});assert.equal(f.contexts[0].gain.gain.value,0);const battle=f.player.createCueSession();await battle.start(B,new AbortController().signal);assert.equal(f.contexts[0].gain.gain.value,0);
 f.player.setPageActive(true);assert.equal(f.contexts[0].gain.gain.value,.8);f.player.setPageActive(false);assert.equal(f.contexts[0].gain.gain.value,0);await battle.restore();assert.equal(f.contexts[0].gain.gain.value,0);
 const data=body({codec:'wave',duration:10,channels:2}),track:SharedHatchTrack={id:1011,key:'SEQ_GS_SHINKA',file:'1011-SEQ_GS_SHINKA.wav',sampleRate:32768,frames:327680,completionFrame:327680,loopFrames:null,wavSHA256:hash(data)};f.files.set('/source/hatching/music/'+track.file,data);const hatch=f.player.createHatchTransport();await hatch.play(track,new AbortController().signal);assert.equal(f.contexts.length,1);assert.equal(f.contexts[0].gain.gain.value,0);
 await f.player.setPreferences({enabled:false,volume:.8});f.player.setPageActive(true);assert.equal(f.contexts[0].gain.gain.value,0);await hatch.dispose();await f.player.dispose();
});
test('hiding while a decoder is pending cannot publish audible music after backgrounding',async()=>{
 const f=fixture();await f.player.unlock();const pending=deferred<ArrayBuffer>();f.controls.fetch=()=>pending.promise;const playing=f.player.playCue(A);await flush();f.player.setPageActive(false);pending.resolve(f.files.get('/source/music/'+f.catalog.tracks[A.id].formats![0].file)!);await playing;assert.equal(f.sources.length,1);assert.equal(f.contexts[0].gain.gain.value,0);f.player.setPageActive(true);assert.equal(f.contexts[0].gain.gain.value,.5);await f.player.dispose();
});

test('post-battle child leases pause battle music across every candidate without a field or preference gap',async()=>{
 const f=fixture();await f.player.unlock();await f.player.playCue(A,'map');f.contexts[0].currentTime=2;const parent=f.player.createCueSession();await parent.start(B,new AbortController().signal);assert.equal(f.sources.length,2);
 const first=parent.borrow({resumeOnRelease:false});assert.equal(first.signal.aborted,false);assert.equal(f.sources[1].stopped,true);assert.equal(f.sources[0].stopped,true);
 f.player.setPageActive(false);await f.player.setPreferences({enabled:false,volume:.2});await f.player.setPreferences({enabled:true,volume:.8});assert.equal(f.contexts[0].gain.gain.value,0);f.player.setPageActive(true);assert.equal(f.contexts[0].gain.gain.value,.8);assert.equal(f.sources.length,2,'neither the private battle cue nor field cue may restart');
 await first.release(new AbortController().signal);assert.equal(first.signal.aborted,true);await f.player.setPreferences({enabled:true,volume:.7});assert.equal(f.sources.length,2,'returning from one candidate leaves the parent silent');
 const second=parent.borrow({resumeOnRelease:false});await second.release(new AbortController().signal);assert.equal(f.sources.length,2);await parent.restore();assert.equal(f.sources.length,3);assert.equal(f.sources[2].buffer.metadata.id,A.id);assert.equal(f.sources[2].offset,2);assert.equal(f.contexts.length,1);await f.player.dispose();
});

test('a preference decoder started before child admission cannot publish a late battle cue after release',async()=>{
 const f=fixture(),decoding=deferred<any>(),entered=deferred<void>();await f.player.unlock();await f.player.setPreferences({enabled:false,volume:.5});await f.player.playCue(A);const parent=f.player.createCueSession();await parent.start(B,new AbortController().signal);
 f.controls.decode=()=>{entered.resolve();return decoding.promise;};const unmute=f.player.setPreferences({enabled:true,volume:.5});await entered.promise;const child=parent.borrow({resumeOnRelease:false});decoding.resolve({numberOfChannels:2,duration:10,metadata:{id:B.id}});await unmute;assert.equal(f.sources.length,0);
 await child.release(new AbortController().signal);await f.player.setPreferences({enabled:true,volume:.6});assert.equal(f.sources.length,0);f.controls.decode=undefined;await parent.restore();assert.equal(f.sources.length,1);assert.equal(f.sources[0].buffer.metadata.id,A.id);await f.player.dispose();
});

test('an aborted child release keeps its ownership retryable and refuses a competing candidate',async()=>{
 const f=fixture();await f.player.unlock();await f.player.playCue(A);const parent=f.player.createCueSession();await parent.start(B,new AbortController().signal);const child=parent.borrow({resumeOnRelease:false}),cancel=new AbortController();cancel.abort(Error('cleanup deadline'));
 await assert.rejects(child.release(cancel.signal),/cleanup deadline/);assert.equal(child.signal.aborted,false);assert.throws(()=>parent.borrow({resumeOnRelease:false}),/already owns/);await child.release(new AbortController().signal);assert.equal(child.signal.aborted,true);await child.release(cancel.signal);await parent.restore();await f.player.dispose();
});

test('parent restore cancels its child, and a stale release cannot change a newer parent owner',async()=>{
 const f=fixture();await f.player.unlock();await f.player.playCue(A);const old=f.player.createCueSession();await old.start(B,new AbortController().signal);const child=old.borrow({resumeOnRelease:false});await old.restore();assert.equal(child.signal.aborted,true);
 const current=f.player.createCueSession();await current.start(B,new AbortController().signal);const voice=f.sources.at(-1);await child.release(new AbortController().signal);assert.equal(voice.stopped,false);const currentChild=current.borrow({resumeOnRelease:false});await child.release(new AbortController().signal);assert.equal(currentChild.signal.aborted,false);await currentChild.release(new AbortController().signal);await current.restore();await f.player.dispose();
});

test('parent and player cancellation invalidate child lifetime before any field restoration',async()=>{
 for(const dispose of[false,true]){
  const f=fixture(),owner=new AbortController();await f.player.unlock();await f.player.playCue(A);const parent=f.player.createCueSession();await parent.start(B,owner.signal);const child=parent.borrow({resumeOnRelease:false});let activeDuringCancel=false;child.signal.addEventListener('abort',()=>{activeDuringCancel=f.contexts[0].state==='running';});
  if(dispose)await f.player.dispose();else owner.abort(Error('source action cancelled'));assert.equal(child.signal.aborted,true);assert.equal(activeDuringCancel,true);assert.equal(f.sources.length,2);await child.release(new AbortController().signal);
  if(dispose){assert.equal(f.contexts[0].state,'closed');await assert.rejects(parent.restore(),/disposed/);}else{await parent.restore();assert.equal(f.sources.length,3);await f.player.dispose();}
 }
});

test('child ownership requires an active parent and an explicit silent-return policy without unlocking sound',async()=>{
 const f=fixture(),parent=f.player.createCueSession();assert.throws(()=>parent.borrow({resumeOnRelease:false}),/active parent/);assert.throws(()=>parent.borrow({resumeOnRelease:true}as any),/silent parent/);assert.equal(f.contexts.length,0);assert.equal(f.requests.length,0);
 await parent.start(B,new AbortController().signal);const child=parent.borrow({resumeOnRelease:false});assert.equal(f.contexts.length,0,'locked playback does not acquire a Context');await child.release(new AbortController().signal);await parent.restore();assert.throws(()=>parent.borrow({resumeOnRelease:false}),/restored|active parent/);await f.player.dispose();
});

test('technical pre-catalog failure becomes a real silent parent without retrying source IO or creating sound',async()=>{
 const f=fixture(),owner=new AbortController(),parent=f.player.createCueSession();f.controls.load=async()=>{throw Error('catalog unavailable');};await assert.rejects(parent.start(B,owner.signal),/catalog unavailable/);const reads=f.catalogLoads;await parent.startSilent(owner.signal);assert.equal(f.catalogLoads,reads);assert.equal(f.contexts.length,0);assert.equal(f.requests.length,0);
 const child=parent.borrow({resumeOnRelease:false});await child.release(new AbortController().signal);const next=parent.borrow({resumeOnRelease:false});await next.release(new AbortController().signal);await assert.rejects(parent.startSilent(owner.signal),/unused or failed/);await parent.restore();await f.player.dispose();
});

test('technical decode failure pauses ACTUAL current field phase once, owns silence across preferences/candidates, then only outer restore resumes',async()=>{
 const f=fixture(),owner=new AbortController();await f.player.unlock();await f.player.playCue(A);f.contexts[0].currentTime=4;const parent=f.player.createCueSession();f.controls.decode=async()=>{throw Error('native decode unavailable');};await assert.rejects(parent.start(B,owner.signal),/None of the original audio formats/);const requests=f.requests.length;await parent.startSilent(owner.signal);assert.equal(f.requests.length,requests);assert.equal(f.sources.length,1);assert.equal(f.sources[0].stopped,true);
 f.controls.decode=undefined;await f.player.setPreferences({enabled:false,volume:.2});await f.player.setPreferences({enabled:true,volume:.8});assert.equal(f.sources.length,1);const child=parent.borrow({resumeOnRelease:false});await child.release(new AbortController().signal);const sibling=parent.borrow({resumeOnRelease:false});await sibling.release(new AbortController().signal);assert.equal(f.sources.length,1);await parent.restore();assert.equal(f.sources.length,2);assert.equal(f.sources[1].offset,4);assert.equal(f.sources[1].buffer.metadata.id,A.id);assert.equal(f.contexts.length,1);await f.player.dispose();
});

test('partial post-suspend ordinary failure retains real registry and silent fallback never resumes field between modes',async()=>{
 const f=fixture(),owner=new AbortController();await f.player.unlock();await f.player.playCue(A);f.contexts[0].currentTime=5;const originalSuspend=f.player.field.suspend;let suspended=false;
 f.player.field.suspend=async saved=>{const result=await originalSuspend(saved);suspended=true;throw Error('post-suspend callback failed');};const parent=f.player.createCueSession();await assert.rejects(parent.start(B,owner.signal),/post-suspend callback failed/);assert.equal(suspended,true);assert.equal(f.sources.length,1);assert.equal(f.sources[0].stopped,true);const other=f.player.createCueSession();await assert.rejects(other.startSilent(owner.signal),/Another native/);
 f.player.field.suspend=originalSuspend;await parent.startSilent(owner.signal);const child=parent.borrow({resumeOnRelease:false});await child.release(new AbortController().signal);assert.equal(f.sources.length,1);await parent.restore();assert.equal(f.sources.length,2);assert.equal(f.sources[1].offset,5);await f.player.dispose();
});

test('silent fallback aborts old decoder observation and source aborts, disposal and stale releases cannot revive music or steal a newer parent',async()=>{
 const f=fixture({ioTimeoutMs:2000}),owner=new AbortController(),decode=deferred<any>(),entered=deferred<void>();await f.player.unlock();await f.player.playCue(A);const parent=f.player.createCueSession();f.controls.decode=()=>{entered.resolve();return decode.promise;};const start=parent.start(B,owner.signal),failure=assert.rejects(start,/preparation timed out/);await entered.promise;await failure;await parent.startSilent(owner.signal);const child=parent.borrow({resumeOnRelease:false});decode.resolve({numberOfChannels:2,duration:10,metadata:{id:B.id}});await flush();assert.equal(f.sources.length,1);assert.equal(f.sources[0].stopped,true);owner.abort(Error('battle owner cancelled'));assert.equal(child.signal.aborted,true);await assert.rejects(parent.startSilent(owner.signal),/battle owner cancelled/);f.controls.decode=undefined;await parent.restore();const newer=f.player.createCueSession();await newer.startSilent(new AbortController().signal);const current=newer.borrow({resumeOnRelease:false});await child.release(new AbortController().signal);assert.equal(current.signal.aborted,false);await current.release(new AbortController().signal);await newer.restore();await f.player.dispose();
});

test('silent parent restore failure retains exclusive ownership and can retry without context allocation or fabricated cue',async()=>{
 const f=fixture(),owner=new AbortController(),parent=f.player.createCueSession();await parent.startSilent(owner.signal);const child=parent.borrow({resumeOnRelease:false});await child.release(new AbortController().signal);const cancel=new AbortController();cancel.abort(Error('restore deadline'));await assert.rejects(parent.restore(cancel.signal),/restore deadline/);await assert.rejects(f.player.createCueSession().startSilent(owner.signal),/Another native/);assert.equal(f.contexts.length,0);await parent.restore(new AbortController().signal);assert.equal(f.contexts.length,0);await f.player.dispose();
});


test('a stale failed cue handle cannot claim silent ownership from a newer active parent',async()=>{
 const f=fixture();await f.player.unlock();await f.player.playCue(A);const old=f.player.createCueSession();await assert.rejects(old.start({id:999,key:'SEQ_MISSING'},new AbortController().signal),/not exported/);
 const current=f.player.createCueSession();await current.start(B,new AbortController().signal);const active=f.sources.at(-1);await assert.rejects(old.startSilent(new AbortController().signal),/Another native music interruption/);assert.equal(active.stopped,false);await old.restore();assert.equal(active.stopped,false);
 const child=current.borrow({resumeOnRelease:false});assert.equal(active.stopped,true);await child.release(new AbortController().signal);await current.restore();assert.equal((f.player.capture()as any).cue.id,A.id);await f.player.dispose();
});

test('retained-restore takeover carries original battle snapshot; old retries cannot resume through a later silent child',async()=>{
 const f=fixture();await f.player.unlock();await f.player.playCue(A,'map');f.contexts[0].currentTime=6;const original=f.player.capture(),old=f.player.createCueSession();await old.start(B,new AbortController().signal);await f.player.playCue(SURF,'surf');f.controls.badDuration=true;await assert.rejects(old.restore(),/None of/);assert.deepEqual(f.player.capture(),{kind:'none'});
 const next=f.player.createCueSession();await assert.rejects(next.startSilent(new AbortController().signal),/Another native/);const count=f.sources.length,requests=f.requests.length;await next.startSilentAfterRetainedRestore(new AbortController().signal);const child=next.borrow({resumeOnRelease:false});await old.restore();assert.equal(f.sources.length,count);assert.equal(f.requests.length,requests);assert.equal(child.signal.aborted,false);await f.player.setPreferences({enabled:false,volume:.2});await f.player.setPreferences({enabled:true,volume:.2});assert.equal(f.sources.length,count);assert.equal(f.contexts[0].gain.gain.value,.2);
 const restore=f.player.field.restore;let transferred:unknown;f.player.field.restore=async(saved,signal)=>{transferred=saved;return restore(saved,signal);};f.controls.badDuration=false;await child.release(new AbortController().signal);assert.equal(f.sources.length,count);await next.restore(new AbortController().signal);assert.deepEqual(transferred,original,'original saved identity/phase must transfer, never current none');assert.equal(f.sources.length,count+1);assert.equal(f.sources.at(-1).buffer.metadata.id,SURF.id);assert.equal(f.contexts.length,1);await old.restore();assert.equal(f.sources.length,count+1);await f.player.dispose();
});

test('retained takeover aborts and drains in-flight old restore before child admission; ignored decoder cannot publish',async()=>{
 const f=fixture();await f.player.unlock();await f.player.playCue(A);const old=f.player.createCueSession();await old.start(B,new AbortController().signal);await f.player.playCue(SURF);f.controls.badDuration=true;await assert.rejects(old.restore(),/None of/);f.controls.badDuration=false;const entered=deferred<void>(),decoded=deferred<any>();f.controls.decode=()=>{entered.resolve();return decoded.promise;};let finished=false;const retry=old.restore().finally(()=>{finished=true;});await entered.promise;const count=f.sources.length,requests=f.requests.length,next=f.player.createCueSession();await next.startSilentAfterRetainedRestore(new AbortController().signal);assert.equal(finished,true,'old observer drains before new admission');await retry;const child=next.borrow({resumeOnRelease:false});decoded.resolve({numberOfChannels:2,duration:10,metadata:{id:SURF.id}});await flush();await old.restore();assert.equal(f.sources.length,count);assert.equal(f.requests.length,requests);assert.equal(child.signal.aborted,false);f.controls.decode=undefined;await f.player.playCue(A);assert.equal(f.sources.length,count);await child.release(new AbortController().signal);await next.restore();assert.equal(f.sources.at(-1).buffer.metadata.id,A.id);assert.equal(f.sources.length,count+1);await f.player.dispose();
});

test('source abort after atomic retained transfer leaves exact snapshot owned and independently recoverable',async()=>{
 const f=fixture();await f.player.unlock();await f.player.playCue(A);f.contexts[0].currentTime=4;const original=f.player.capture(),old=f.player.createCueSession();await old.start(B,new AbortController().signal);await f.player.playCue(SURF);f.controls.badDuration=true;await assert.rejects(old.restore(),/None of/);f.controls.badDuration=false;const entered=deferred<void>(),bytes=deferred<ArrayBuffer>(),action=new AbortController();f.controls.fetch=async(_url,signal)=>{signal.addEventListener('abort',()=>action.abort(Error('takeover source canceled after transfer')),{once:true});entered.resolve();return bytes.promise;};const retry=old.restore();await entered.promise;const next=f.player.createCueSession(),count=f.sources.length;await assert.rejects(next.startSilentAfterRetainedRestore(action.signal),/after transfer/);await retry;await old.restore();assert.equal(f.sources.length,count);const restore=f.player.field.restore;let recovered:unknown;f.player.field.restore=async(saved,signal)=>{recovered=saved;return restore(saved,signal);};f.controls.fetch=undefined;await next.restore(new AbortController().signal);assert.deepEqual(recovered,original);assert.equal(f.sources.at(-1).buffer.metadata.id,SURF.id);bytes.resolve(f.files.get('/source/music/'+f.catalog.tracks[SURF.id].formats![0].file)!);await flush();assert.equal(f.sources.length,count+1);await f.player.dispose();
});

test('dedicated retained takeover rejects active/absent/preparation-only owners and never allocates Context',async()=>{
 const f=fixture(),action=new AbortController();await assert.rejects(f.player.createCueSession().startSilentAfterRetainedRestore(action.signal),/No closed/);const active=f.player.createCueSession();await active.startSilent(action.signal);await assert.rejects(f.player.createCueSession().startSilentAfterRetainedRestore(action.signal),/No closed/);await active.restore();const failed=f.player.createCueSession();await assert.rejects(failed.start({id:999,key:'SEQ_MISSING'},action.signal),/not exported/);const aborted=new AbortController();aborted.abort(Error('independent restore canceled'));await assert.rejects(failed.restore(aborted.signal),/restore canceled/);await assert.rejects(f.player.createCueSession().startSilentAfterRetainedRestore(action.signal),/No closed/);await failed.restore();assert.equal(f.contexts.length,0);assert.equal(f.requests.length,0);await f.player.dispose();
});

test('Root disposal during retained retry transfer drains old work and prevents every late voice',async()=>{
 const f=fixture();await f.player.unlock();await f.player.playCue(A);const old=f.player.createCueSession();await old.start(B,new AbortController().signal);await f.player.playCue(SURF);f.controls.badDuration=true;await assert.rejects(old.restore(),/None of/);f.controls.badDuration=false;const entered=deferred<void>(),bytes=deferred<ArrayBuffer>();let disposing:Promise<void>|undefined;f.controls.fetch=async(_url,signal)=>{signal.addEventListener('abort',()=>{disposing=f.player.dispose();},{once:true});entered.resolve();return bytes.promise;};const retry=old.restore(),retryDone=Promise.allSettled([retry]);await entered.promise;const count=f.sources.length,next=f.player.createCueSession();await assert.rejects(next.startSilentAfterRetainedRestore(new AbortController().signal),/disposed/);await retryDone;await disposing;bytes.resolve(f.files.get('/source/music/'+f.catalog.tracks[SURF.id].formats![0].file)!);await flush();assert.equal(f.sources.length,count);assert.ok(f.sources.every(source=>source.stopped));assert.equal(f.contexts.length,1);assert.equal(f.contexts[0].state,'closed');await assert.rejects(next.restore(),/disposed/);await old.restore();
});
