// @ts-nocheck — actual Main binding extraction, with real clock/sound/host/player.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createContext,runInContext} from 'node:vm';
import ts from 'typescript';
import {loadData,newState} from './data.ts';
import {loadNativeEvolutionData} from './evolution-native.ts';
import {loadNativeFieldMoveData} from './field-moves.ts';
import {createNativeFieldMusicPlayer} from './field-music.ts';
import {createEvolutionAudio} from './evolution-audio.ts';
import {EvolutionFieldHost} from './evolution-field-host.ts';
import {UnsupportedBattleEvolution} from './battle-evolution.ts';
import {AzaleaFieldSound} from './azalea-field-sound.ts';
import {NativeFieldClock} from './native-field-clock.ts';
import {UI} from './ui.ts';
import {installUIDOM} from './ui-test-dom.ts';
import {viewFixture} from './evolution-test-fixtures.ts';
const url=new URL('./main.ts',import.meta.url),source=await readFile(url,'utf8'),hash=x=>createHash('sha256').update(x).digest('hex'),sha=hash(source),ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true),functions=new Map(ast.statements.filter(ts.isFunctionDeclaration).map(n=>[n.name.text,n.getText(ast)]));
after(async()=>assert.equal(hash(await readFile(url,'utf8')),sha));
globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData(),native=await loadNativeEvolutionData(data),fieldMoves=await loadNativeFieldMoveData(),messages=JSON.parse(await readFile(new URL('../../public/source/messages/197.json',import.meta.url),'utf8'));
const flush=()=>new Promise(r=>setImmediate(r));
function fixture(){
 const d=installUIDOM(),field=viewFixture(),ui=new UI(),state=newState(data,'Gold','boy',()=>.5);state.map=field.field.map;const errors=[],music=createNativeFieldMusicPlayer({enabled:false,volume:0}),clock=new NativeFieldClock({field:()=>({map:state.map,mapRunning:false}),onError:e=>errors.push(e)}),sound=new AzaleaFieldSound({clock,signal:music.lifetimeSignal,output:()=>music.sharedAudioOutput(),report(){}}),events=[];
 const c={data,nativeEvolutionData:native,nativeFieldMoveData:fieldMoves,evolutionMessages:messages,state,world:Object.assign(field.world,{npcSprites:new Map()}),fieldClock:clock,fieldSound:sound,music,evolutionHost:undefined,evolutionAudio:undefined,battleMusicParent:undefined,battleSoundOwned:false,player:{group:field.actors[0]},follower:null,ui,preferences:{music:false},textDelay:()=>0,pendingMusicRestores:new Set(),MUSIC_WAIT_MS:1500,createEvolutionAudio,UnsupportedBattleEvolution,DOMException,AbortController,setTimeout,clearTimeout,window:new EventTarget(),$:id=>d.ids.get(id),console,Date,
 EvolutionFieldHost:class extends EvolutionFieldHost{constructor(ports){events.push(['host-construction',clock.phase]);super(ports);}}};createContext(c);runInContext(ts.transpileModule(['musicDeadline','installEvolutionField','cancelEvolutionField'].map(name=>{assert.ok(functions.has(name),name);return functions.get(name);}).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,c);
 return{c,d,field,clock,sound,events,errors,async dispose(){c.evolutionHost?.dispose();await c.evolutionHost?.settled();c.evolutionAudio?.dispose();sound.dispose();clock.dispose();await music.dispose();d.restore();}};
}
test('actual Main constructs persistent queue/backend only after SAME clock settles, even readiness begins in after-tasks',async()=>{
 const f=fixture();try{await f.sound.preparePlayer(f.c.music.lifetimeSignal);let work;const remove=f.clock.onAfterTasks(()=>{if(!work)work=f.c.installEvolutionField();},f.c.music.lifetimeSignal);f.clock.frame(1/30);await f.clock.settled();await work;remove();assert.deepEqual(f.events,[['host-construction','idle']]);assert.ok(f.c.evolutionHost instanceof EvolutionFieldHost);assert.equal(f.c.evolutionHost.active,false);assert.equal(f.errors.length,0);const first=f.c.evolutionHost,queue=first.queue,backend=f.c.evolutionAudio;await f.c.installEvolutionField();assert.notEqual(f.c.evolutionHost,first);assert.notEqual(f.c.evolutionHost.queue,queue,'new Battle receives new persistent queue');assert.equal(f.c.evolutionAudio,backend,'root backend/global phase is reused');assert.equal(f.clock['afterTasks'].size,3,'one sound hook + one backend + one live host; no old host leak');}finally{await f.dispose();}
});
test('actual Main awaited readiness observes root abort and cannot install a late host or lease',async()=>{
 const f=fixture();try{const before=f.c.music.lifetimeSignal;await f.c.music.dispose();await assert.rejects(f.c.installEvolutionField());assert.equal(before.aborted,true);assert.equal(f.c.evolutionHost,undefined);assert.equal(f.c.evolutionAudio,undefined);assert.deepEqual(f.events,[]);assert.equal(f.clock['afterTasks'].size,0);}finally{await f.dispose();}
});
test('actual Main backend cannot borrow absent or foreign battle ownership; real parent is mandatory',async()=>{
 const f=fixture();try{await f.c.installEvolutionField();const scene={flags:3,partyIndex:0,method:4,methodKey:'EVO_LEVEL',param:14,before:{species:155,form:0},after:{species:156,form:0}};assert.throws(()=>f.c.evolutionAudio.open(scene,()=>null,new AbortController().signal),/active real battle sound parent/);f.c.battleSoundOwned=true;assert.throws(()=>f.c.evolutionAudio.open(scene,()=>null,new AbortController().signal),/active real battle sound parent/);assert.equal(f.c.music.capture().kind,'none');}finally{await f.dispose();}
});


test('actual Main learner ports prepare and dispatch SELECT through SAME root PLAYER4 without another phase or Context',async()=>{
 const f=fixture();try{await f.c.installEvolutionField();const host=f.c.evolutionHost,owner={},signal=f.c.music.lifetimeSignal,ports=host['ports'];await ports.prepareMenu(signal);const registry=await f.sound.preparePlayer4(signal);ports.menuSE(owner,signal);assert.equal(f.sound['menuRegistry'],registry);assert.equal(f.sound.anySEPlaying(),false,'locked borrowed output admits no invented voice');assert.equal(f.clock['afterTasks'].size,3);assert.equal(f.c.music.isUnlocked(),false);ports.cancelMenuOwner(owner);assert.deepEqual(f.errors,[]);}finally{await f.dispose();}
});
