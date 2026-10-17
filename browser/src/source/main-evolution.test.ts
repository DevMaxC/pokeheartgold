// @ts-nocheck — execute the actual Main source bodies, not an orchestration copy.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createContext,runInContext} from 'node:vm';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {loadData,newState,healParty} from './data.ts';
import {Battle} from './battle.ts';
import {ScriptVM,UnsupportedScript} from './script.ts';
import {originalTrainerParty,trainerPrize,battleMoneyLoss} from './trainers.ts';
import {freshStages,moveDamage} from './battle-math.ts';
import {momSavingsActive,settleMomBattleMoney} from './mom-savings.ts';
import {SourceActionRecovery,runFieldBattleAction,runRecoverableSourceAction} from './script-recovery.ts';
import {migrateLegacyBrowserNicknames} from './mon-nickname.ts';
import {migrateLegacyBrowserForms} from './mon-form.ts';
import {loadNativeEvolutionData} from './evolution-native.ts';
import {giveTogepiEgg} from './eggs.ts';
import {UnsupportedBrowserFormAdmission} from './mon-form.ts';
import {loadNativeFieldMoveData} from './field-moves.ts';
import {EvolutionFieldHost} from './evolution-field-host.ts';
import {NativeFieldClock} from './native-field-clock.ts';
import {NativeSEPlayer3,loadNativeAzaleaAudio} from './gym-azalea-audio.ts';
import {createNativeFieldMusicPlayer,UnsupportedNativeMusic} from './field-music.ts';
import {nativeBattleMusic} from './battle-music.ts';
import {createEvolutionAudio} from './evolution-audio.ts';
import {UI} from './ui.ts';
import {installUIDOM} from './ui-test-dom.ts';
import {viewFixture} from './evolution-test-fixtures.ts';

globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData(),native=await loadNativeEvolutionData(data),fieldMoves=await loadNativeFieldMoveData(),map=JSON.parse(await readFile(new URL('../../public/source/maps/156.json',import.meta.url),'utf8')),messages=JSON.parse(await readFile(new URL('../../public/source/messages/197.json',import.meta.url),'utf8')),earned=JSON.parse(await readFile(new URL('../../reviews/native-evolution-main-host/earned-pre-li.json',import.meta.url),'utf8'));
const azaleaAudio=await loadNativeAzaleaAudio(new AbortController().signal);
const mainURL=process.env.HG_EVOLUTION_MAIN?pathToFileURL(process.env.HG_EVOLUTION_MAIN):new URL('./main.ts',import.meta.url),source=await readFile(mainURL,'utf8'),sha=text=>createHash('sha256').update(text).digest('hex'),sourceHash=sha(source),ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),functions=new Map(ast.statements.filter(ts.isFunctionDeclaration).map(node=>[node.name.text,node.getText(ast)])),compile=text=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
after(async()=>assert.equal(sha(await readFile(mainURL,'utf8')),sourceHash,'actual Main changed during bound tests'));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(policy='success',realMusic=false){
 const d=installUIDOM(),field=viewFixture(),life=new AbortController(),ui=new UI(),state=newState(data,'Ethan','boy',()=>.5);state.map=map.id;state.x=12.5;state.z=10.5;state.starter=155;state.party=[structuredClone(earned.mon)];state.bag={ITEM_POTION:5};field.field.map=state.map;
 // The exact retained witness is explicitly a local-browser-v2 record. Run
 // the real ONE-TIME policies before the recovery checkpoint, never at query.
 delete state.nicknameMetadata;delete state.formMetadata;migrateLegacyBrowserNicknames(data,state,{origin:'local-browser-v2'});migrateLegacyBrowserForms(data,state,{origin:'local-browser-v2'});
 const originalLookup=d.document.getElementById;d.document.getElementById=id=>{let element=originalLookup(id);if(!element){element=d.document.createElement('div');element.id=id;d.ids.get('game').appendChild(element);}return element;};d.document.querySelector=()=>null;d.document.body.classList={add(){},remove(){}};
 const events=[],battleText=[],saves=[],faults=[];let seed=12345,attempt=0,decisions=0;
 const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/0x100000000;},battle=new Battle(data,state,ui,rng);
 Object.assign(battle,{say:async text=>battleText.push(text),draw(){},nextAction:async()=>{assert.ok(++decisions<200,'bounded actual Li battle actions');const mon=battle.player,enemy=battle.enemy;if(mon.hp<=Math.floor(mon.maxHP/3)&&state.bag.ITEM_POTION)return{kind:'item',item:'ITEM_POTION'};const rows=mon.moves.map((move,slot)=>({move,slot})).filter(row=>row.move.pp>0);const score=row=>{const move=data.moves[row.move.id];return move.category===2?-1:moveDamage(data,mon,enemy,move,freshStages(),freshStages(),100,false).damage;};rows.sort((a,b)=>score(b)-score(a));return{kind:'move',slot:rows[0]?.slot??-1};}});
 const clock=new NativeFieldClock({field:()=>({map:state.map,mapRunning:!field.view.active}),onError:error=>faults.push(error)});
 const sceneAudio={async prepare(){events.push('evolution-prepare');if(policy==='return'||policy==='retry'&&attempt===1)throw Error('technical scene preparation failure');},bgm:id=>events.push(['bgm',id]),stopBGM:id=>events.push(['stop',id]),cry:(species,form)=>events.push(['cry',species,form]),cryPlaying:()=>false,se:id=>events.push(['SE',id]),anySEPlaying:()=>false,fanfare:id=>events.push(['ME',id]),fanfarePlaying:()=>false,cancel:()=>events.push('child-cancel'),restore:async()=>events.push('child-release')};
 let c;
 const registry=new NativeSEPlayer3(azaleaAudio,life.signal);clock.onAfterTasks(()=>registry.soundUpdate(),life.signal);
 let catalogAttempts=0;const actualMusic=createNativeFieldMusicPlayer({enabled:false,volume:0,...['silent','unsupported'].includes(policy)?{loadCatalog:async()=>{catalogAttempts++;if(policy==='silent'&&catalogAttempts===1)throw Error('technical catalog fetch failed');const raw=JSON.parse(await readFile(new URL('../../public/source/music/catalog.json',import.meta.url),'utf8'));if(policy==='unsupported')raw.battle.parameters=[];return raw;}}:{},fetchBytes:async url=>{events.push(['fetch',url]);const bytes=await readFile(new URL('../../public'+url,import.meta.url));return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);}});
 const backend=createEvolutionAudio({lifetime:life.signal,player3:registry,borrowParent:()=>{events.push('real-child-borrow');return c.battleMusicParent.borrow({resumeOnRelease:false});},anySEPlaying:()=>registry.isPlaying(1510),onAfterTasks:(fn,owner)=>clock.onAfterTasks(fn,owner),report:status=>{if(status.stage==='no-voice')events.push(['no-voice',status.id]);}});
 const host=new EvolutionFieldHost({data,native,fieldMoves,messages,state:()=>state,field:()=>field.field,world:field.world,view:field.view,clock,lifetime:life.signal,ui,enabled:()=>false,sharedOutput:()=>{throw Error('Silent CPU-only fixture cannot unlock audio');},textDelay:()=>0,hour:()=>12,audio:{open(scene,output,signal){assert.equal(c.battleSoundOwned,true);assert.equal(battle.active,false);assert.equal(sourceActions.busy,true);events.push('borrow-inside-battle-owner');if(!realMusic)return sceneAudio;const audio=backend.open(scene,output,signal);return{...audio,restore:async signal=>{await audio.restore(signal);events.push('child-release');}};}},retainRestore:()=>{throw Error('unexpected retained child');},prepareMenu:async()=>{throw Error('full-set menu not part of starter14 witness');},menuSE:()=>{throw Error('P4 menu not admitted');},cancelMenuOwner(){},keyboard:null,controls:d.ids.get('game')});
 const sourceActions=new SourceActionRecovery(state,{capture:()=>({map:state.map}),restore:async()=>{host.cancel(Error('hydrate failed source action'));await host.settled();events.push(['hydrate',state.party[0].species,state.party[0].level]);}});
 const executeSourceAction=action=>runRecoverableSourceAction(sourceActions,action,{failed:async error=>{faults.push(error);return policy==='retry'?'retry':'return';},recoveryFailed:async error=>{throw error;},retry(){events.push('explicit-retry');},committed(){saves.push(structuredClone(state));events.push('save');}});
 c={data,state,map:structuredClone(map),battle,sourceActions,executeSourceAction,runFieldBattleAction,UnsupportedBattleEvolution:Error,momSavingsActive,settleMomBattleMoney,originalTrainerParty,trainerPrize,battleMoneyLoss,UnsupportedScript,healParty,evolutionHost:host,
 fieldPhone:{resetForSourceEvent:()=>events.push('phone-reset'),triggerQueued(){throw Error('unexpected Mom purchase');}},battleSoundOwned:false,withBattleMusic:async(_enemies,_trainer,action)=>{attempt++;c.battleSoundOwned=true;events.push('battle-music-owner');try{return await action();}finally{c.battleSoundOwned=false;events.push('field-music-release');}},music:actualMusic,UnsupportedNativeMusic,nativeBattleMusic,battleMusicParent:undefined,pendingMusicRestores:new Set(),MUSIC_WAIT_MS:1500,musicKey:'',musicFailed:error=>faults.push(error),syncMusic:()=>events.push('field-sync'),setTimeout,clearTimeout,DOMException,AbortController,Date,
 world:{sky:{currentWeather:0}},resetFieldInput:()=>events.push('input-reset'),encounterChecks:{reset(){}},updateHUD:()=>events.push('hud'),runFieldEntry:async()=>events.push('field-resume'),checkFrameTriggers:async()=>false,whiteOut:async()=>{throw Error('unexpected blackout');},textDelay:()=>0,ui:{message:async text=>battleText.push(text)},Math,structuredClone};
 createContext(c);if(realMusic){runInContext(compile(['musicDeadline','retryMusicRestores','withBattleMusic'].map(name=>functions.get(name)).join('\n')),c);const actual=c.withBattleMusic;c.withBattleMusic=async(...args)=>{attempt++;events.push('battle-music-owner');try{return await actual(...args);}finally{events.push('field-music-release');}};}runInContext(compile(['drainBattleEvolution','startBattle','trainerBattle'].filter(name=>functions.has(name)).map(name=>functions.get(name)).join('\n')),c);
 async function run(){const work=executeSourceAction(()=>new ScriptVM(data,state,{message:async text=>{battleText.push(text);if(policy==='late-return'&&state.party[0].species===156&&state.bag.ITEM_TM70===1)throw Error('source reward acknowledgement failed after evolution');},choice:async()=>0,move:async()=>{},position(){},face(){},visible(){},chooseStarter:async()=>{},nickname:async()=>1,refresh:async()=>{},battle:c.trainerBattle,warp:async()=>{}}).run(c.map,3,'obj_D15R0103_chourou'));let done=false,value,error;void work.then(result=>{done=true;value=result;},cause=>{done=true;error=cause;});let cancelled=false;for(let tick=0;tick<2200&&!done;tick++){if(policy==='cancel'&&host.phase==='oscillate'&&!cancelled){const event=new Event('keydown',{cancelable:true});Object.assign(event,{code:'KeyB',repeat:false});host['keyDown'](event);cancelled=true;}ui.advance();clock.frame(1/30);await clock.settled();field.view.update(1/30);await flush();await new Promise(resolve=>setTimeout(resolve,2));}assert.equal(done,true,'actual Main/source action finishes');if(error)throw error;return value;}
 return{state,before:structuredClone(state),host,battle,clock,events,battleText,saves,faults,run,get attempts(){return attempt;},dispose(){host.dispose();backend.dispose();life.abort();clock.dispose();registry.dispose();void actualMusic.dispose();d.restore();}};
}

test('actual Main ElderLi source rewards/save follow real earned Cyndaquil13→14 evolution inside battle music ownership',async t=>{
 t.diagnostic('actual Main SHA256 '+sourceHash);const f=fixture();try{const original=f.state.party[0],result=await f.run();assert.equal(result.ok,true);assert.equal(original.level,14);assert.equal(original.species,156,'earned evolution must run before ElderLi rewards/save');assert.equal(f.state.party[0],original);assert.equal(f.state.bag.ITEM_TM70,1);assert.equal(f.state.flags.FLAG_UNK_076,true);assert.equal(f.saves.length,1);assert.equal(f.saves[0].party[0].species,156);assert.equal(f.saves[0].bag.ITEM_TM70,1);assert.ok(f.events.indexOf('child-release')<f.events.indexOf('field-music-release'));assert.ok(f.events.indexOf('field-music-release')<f.events.indexOf('save'));assert.ok(f.battleText.some(text=>text.includes('grew to Lv. 14')));assert.deepEqual(f.faults,[]);}finally{f.dispose();}
});

test('native B cancel retains earned14 and continues actual source rewards/save without species mutation',async()=>{
 const f=fixture('cancel');try{await f.run();assert.equal(f.state.party[0].level,14);assert.equal(f.state.party[0].species,155);assert.equal(f.state.bag.ITEM_TM70,1);assert.equal(f.saves.length,1);assert.equal(f.host.queue.pending(f.battle.evolutionCompletion),0);}finally{f.dispose();}
});

test('technical scene failure Return rolls back fight, wallet and source rewards before a coherent field handback',async()=>{
 const f=fixture('return');try{const result=await f.run();assert.equal(result.ok,false);assert.deepEqual(f.state,f.before);assert.equal(f.saves.length,1);assert.deepEqual(f.saves[0],f.before,'Return may save only the coherent restored checkpoint');assert.equal(f.faults.length,1);assert.match(String(f.faults[0]),/technical scene preparation/);assert.equal(f.host.active,false);assert.ok(f.events.some(row=>Array.isArray(row)&&row[0]==='hydrate'&&row[1]===155&&row[2]===13));}finally{f.dispose();}
});

test('explicit Retry replays real battle with a fresh completion and drains evolution exactly once before outer commit',async()=>{
 const f=fixture('retry');try{await f.run();assert.equal(f.attempts,2);assert.equal(f.faults.length,1);assert.equal(f.state.party[0].species,156);assert.equal(f.state.bag.ITEM_TM70,1);assert.equal(f.saves.length,1);assert.ok(f.events.indexOf('explicit-retry')>f.events.findIndex(row=>Array.isArray(row)&&row[0]==='hydrate'));assert.equal(f.events.filter(row=>Array.isArray(row)&&row[0]==='cry'&&row[1]===156).length,1);}finally{f.dispose();}
});


test('actual SAVE_KEY read attests one-time form/nickname admission before any source checkpoint; other records remain unresolved',async()=>{
 const original=newState(data,'Ethan','boy',()=>.5);original.party=[structuredClone(earned.mon)];giveTogepiEgg(data,original);delete original.formMetadata;delete original.nicknameMetadata;const input=JSON.stringify(original),writes=[];
 const c={JSON,data,state:null,savedStateOrigins:new WeakSet(),SAVE_KEY:'source-save',localStorage:{getItem(key){assert.equal(key,'source-save');return input;},setItem(key,text){assert.equal(key,'source-save');writes.push(JSON.parse(text));}},migrateLegacyBrowserNicknames,migrateLegacyBrowserForms,UnsupportedBrowserFormAdmission,preferences:{music:false,textSpeed:1},console:{warn(){}},nicknameAdmission:null,formAdmission:null};createContext(c);runInContext(compile(['readSave','admitNicknameMetadata','admitFormMetadata','begin'].map(name=>{assert.ok(functions.has(name),'actual Main '+name);return functions.get(name);}).join('\n')),c);
 const loaded=c.readSave();assert.ok(loaded);assert.equal(c.savedStateOrigins.has(loaded),true);assert.notEqual(loaded,original);c.state=loaded;const nickname=c.admitNicknameMetadata('continue'),form=c.admitFormMetadata('continue');assert.equal(nickname.admission,'migrated');assert.equal(form.admission,'migrated');assert.equal(form.kind,'partial');assert.equal(loaded.party[0].form,0);assert.equal(loaded.party[0].hasNickname,false);assert.equal(loaded.party[1].isEgg,true);assert.equal(loaded.party[1].form,undefined);assert.ok(form.unresolved.some(row=>row.index===1));assert.equal(writes.at(-1).formMetadata.origin,'migrated-local-v2');
 const recovery=new SourceActionRecovery(loaded,{capture:()=>({}),restore:async()=>{}});await assert.rejects(recovery.run(async()=>{loaded.party[0].form=2;throw Error('failed later source action');}));assert.equal(loaded.party[0].form,0);assert.equal(loaded.formMetadata.origin,'migrated-local-v2');
 const late=structuredClone(earned.mon);loaded.party.push(late);assert.equal(c.admitFormMetadata('continue').admission,'already-marked');assert.equal(late.form,undefined,'later missing metadata never gets a new guess');
 const untrusted=structuredClone(loaded),written=writes.length;c.state=untrusted;await assert.rejects(c.begin('continue'),UnsupportedBrowserFormAdmission);assert.equal(writes.length,written,'unattested Continue fails before nickname migration writes');assert.throws(()=>c.admitFormMetadata('continue'),UnsupportedBrowserFormAdmission);
 c.state=newState(data,'New','girl',()=>.5);assert.equal(c.admitFormMetadata('warp').admission,'already-marked');
 const begin=functions.get('begin');assert.ok(begin.indexOf('savedStateOrigins.has(state)')<begin.indexOf('admitNicknameMetadata(entryMode)'));assert.ok(begin.indexOf('admitFormMetadata(entryMode)')<begin.indexOf('new SourceActionRecovery('));
});


test('actual Main earned evolution composes real muted/locked battle parent, shared PLAYER3 and original audio backend without field gap or Context',async()=>{
 const old=globalThis.AudioContext;let contexts=0;globalThis.AudioContext=class{constructor(){contexts++;throw Error('CPU fixture cannot unlock');}};
 const f=fixture('success',true);try{await f.run();assert.deepEqual(f.faults,[]);assert.equal(f.state.party[0].species,156);assert.equal(f.state.party[0].level,14);assert.equal(f.saves.length,1);assert.equal(contexts,0);assert.equal(f.events.filter(x=>x==='real-child-borrow').length,1);assert.ok(f.events.indexOf('child-release')<f.events.indexOf('field-music-release'));assert.ok(f.events.indexOf('field-music-release')<f.events.indexOf('save'));assert.deepEqual(f.faults,[]);assert.equal(f.host.active,false);assert.equal(f.events.some(x=>Array.isArray(x)&&x[0]==='fetch'&&x[1].endsWith('.wav')),false);}finally{f.dispose();if(old===undefined)delete globalThis.AudioContext;else globalThis.AudioContext=old;}
});


test('technical catalog failure uses SAME real silent parent, then earned evolution still completes before field restore',async()=>{
 const f=fixture('silent',true);try{await f.run();assert.equal(f.state.party[0].species,156);assert.equal(f.state.party[0].level,14);assert.equal(f.saves.length,1);assert.equal(f.faults.length,1);assert.match(String(f.faults[0]),/technical catalog fetch failed/);assert.equal(f.events.filter(x=>x==='real-child-borrow').length,1);assert.ok(f.events.indexOf('child-release')<f.events.indexOf('field-music-release'));assert.equal(f.host.active,false);}finally{f.dispose();}
});


test('late native source failure after evolution and TM credit restores pre-action party/Dex/bag before Return save',async()=>{
 const f=fixture('late-return',true);try{await f.run();assert.deepEqual(f.state,f.before);assert.equal(f.faults.length,1);assert.match(String(f.faults[0]),/source reward acknowledgement failed after evolution/);assert.ok(f.events.indexOf('child-release')<f.events.findIndex(x=>Array.isArray(x)&&x[0]==='hydrate'));assert.equal(f.saves.length,1);assert.deepEqual(f.saves[0],f.before);assert.equal(f.host.active,false);}finally{f.dispose();}
});


test('missing original battle configuration remains explicit Unsupported and never fabricates a silent evolution parent',async()=>{
 const f=fixture('unsupported',true);try{await f.run();assert.deepEqual(f.state,f.before);assert.equal(f.faults.length,2,'same configuration failure is reported by music and SourceRecovery');assert.equal(f.faults[0],f.faults[1]);assert.ok(f.faults[0] instanceof UnsupportedNativeMusic);assert.match(String(f.faults[0]),/configuration is unsupported/);assert.equal(f.events.includes('real-child-borrow'),false);assert.equal(f.state.bag.ITEM_TM70,undefined);assert.equal(f.saves.length,1);}finally{f.dispose();}
});


test('actual later earned battle after a fatal field clock rolls back promptly instead of waiting forever',async()=>{
 const f=fixture();try{f.clock.onAfterTasks(()=>{throw Error('fatal clock before next battle');},new AbortController().signal);f.clock.frame(1/30);await f.clock.settled();await flush();const result=await f.run();assert.equal(result.ok,false);assert.deepEqual(f.state,f.before);assert.equal(f.events.includes('borrow-inside-battle-owner'),false);assert.equal(f.saves.length,1);assert.deepEqual(f.saves[0],f.before);assert.equal(f.host.active,false);}finally{f.dispose();}
});
