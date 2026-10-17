import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createContext,runInContext} from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {initialAzaleaGymState,planAzaleaGymRide,azaleaGymRideFrame} from './gym-azalea-plan.ts';
import {AzaleaGymHost} from './gym-azalea-host.ts';
import {AzaleaFieldActors} from './azalea-field-bindings.ts';
import {AzaleaFieldSound} from './azalea-field-sound.ts';
import {NativeFieldClock} from './native-field-clock.ts';
import {OriginalWorld} from './world.ts';
import {ScriptVM,UnsupportedScript,type ScriptHooks} from './script.ts';
import {SourceActionRecovery,SourceTriggerGate,runRecoverableSourceAction} from './script-recovery.ts';
import {TrainerAttemptLatch,trainerEventPriority,fieldTrainerCollision,findTrainerEncounter,MissingTrainerPartner} from './trainer-encounters.ts';
import {furnitureBlocksStep} from './furniture-collision.ts';
import {findCoordinateTrigger} from './coordinate-triggers.ts';
import {doorwayEntry} from './terrain.ts';
import {ledgeDirection,jumpHeight} from './ledges.ts';
import {pushWarp,stepWarpFacing} from './field-transitions.ts';
import {FieldObjects} from './objects.ts';
import {FieldPhoneHost} from './phone-field-host.ts';
import {loadData,newState,createMon} from './data.ts';
import {firstFollowerMon} from './eggs.ts';
import {createNativeFieldMusicPlayer} from './field-music.ts';
import {gymFieldEntry} from './gym-violet.ts';
import {fieldEntryScripts} from './field-transitions.ts';
import {mapWeather} from './atmosphere.ts';
import {defaultInterfacePreferences,writeInterfacePreferences} from './interface-preferences.ts';
import {UI} from './ui.ts';
import {installUIDOM,installUIClock} from './ui-test-dom.ts';
import {originalMaterial} from './render-repair.ts';
import type {SourceMap} from './types.ts';
import type {AzaleaGymResources,AzaleaResourceManifest} from './gym-azalea-world.ts';

// Exercise actual host statements. The renderer/GPU is an explicit port;
// route vectors and logical boarding coordinates come from the native plan.
const mainInput=process.env.HG_AZALEA_MAIN_REVIEW_MAIN??new URL('./main.ts',import.meta.url);
const source=await readFile(mainInput,'utf8');
const sourceSHA=createHash('sha256').update(source).digest('hex');
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const functions=new Map(ast.statements.filter(ts.isFunctionDeclaration).map(node=>[node.name?.text,node]));
function compile(text:string){return ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;}
function renderStatement(condition:string){
 let render:ts.FunctionDeclaration|undefined;
 function find(node:ts.Node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='render')render=node;ts.forEachChild(node,find);}
 find(functions.get('boot')!);assert.ok(render?.body,'actual Main render loop');
 const found=render.body.statements.find(node=>ts.isIfStatement(node)&&node.expression.getText(ast)===condition);
 assert.ok(found,'actual Main render statement '+condition);return found.getText(ast);
}

const sourceRoot=new URL('../../public/source/',import.meta.url),originalFetch=globalThis.fetch;
globalThis.fetch=async input=>{const name=String(input).replace(/^.*\/source\//,'');try{const bytes=await readFile(new URL(name,sourceRoot));return{ok:true,status:200,json:async()=>JSON.parse(bytes.toString()),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}as Response;}catch{return{ok:false,status:404}as Response;}};
after(async()=>{globalThis.fetch=originalFetch;assert.equal(createHash('sha256').update(await readFile(mainInput)).digest('hex'),sourceSHA,'Main source changed during actual binding tests');});
const data=await loadData(),nativeMap=JSON.parse((await readFile(new URL('maps/180.json',sourceRoot))).toString())as SourceMap;

async function nativeResources():Promise<AzaleaGymResources>{
 const manifest=JSON.parse((await readFile(new URL('azalea-gym/resources.json',sourceRoot))).toString())as AzaleaResourceManifest,models=new Map<number,THREE.Group>(),patterns=new Map<string,THREE.Texture>();
 for(const[id,entry]of Object.entries(manifest.models)){
  const bytes=await readFile(new URL(entry.asset,sourceRoot));assert.equal(createHash('sha256').update(bytes).digest('hex'),(entry as any).glbSHA256);
  // Keep actual native geometry/animations. Pixel upload is an explicit GPU
  // port, as in the reviewed host tests; this is not a rendered-art approval.
  const size=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+size).toString());delete doc.images;delete doc.textures;delete doc.samplers;for(const material of doc.materials??[])delete material.pbrMetallicRoughness?.baseColorTexture;
  let text=JSON.stringify(doc);text+=' '.repeat((-Buffer.byteLength(text))&3);const json=Buffer.from(text),tail=bytes.subarray(20+size),out=Buffer.alloc(20+json.length+tail.length);bytes.copy(out,0,0,20);out.writeUInt32LE(out.length,8);out.writeUInt32LE(json.length,12);json.copy(out,20);tail.copy(out,20+json.length);
  const gltf=await new GLTFLoader().parseAsync(out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength),'');gltf.scene.animations=gltf.animations;gltf.scene.traverse(object=>{if(object instanceof THREE.Mesh){const convert=(material:THREE.Material)=>originalMaterial(material as THREE.MeshStandardMaterial);object.material=Array.isArray(object.material)?object.material.map(convert):convert(object.material);}});models.set(Number(id),gltf.scene);
  for(const animation of entry.animations)if(animation.kind==='pattern')for(const track of animation.tracks)for(const key of track.keys)patterns.set(key.asset,new THREE.Texture());
 }
 return{manifest,models,patterns};
}
class ActualHostWithGPUResources extends AzaleaGymHost{
 constructor(...args:ConstructorParameters<typeof AzaleaGymHost>){super(args[0],args[1],args[2],args[3],nativeResources);}
}

async function fixture(withFollower=true){
 const dom=installUIDOM(),ui=new UI(),raf:(()=>void)[]=[],state=newState(data,'Gold','boy'),lifetime=new AbortController(),writes:any[]=[],events:any[]=[];
 Object.assign(state,{map:180,x:3.5,z:32.5,facing:0});if(withFollower)state.party=[createMon(data,155,5,state.name)];
 const player={group:new THREE.Group()},follower=withFollower?{group:new THREE.Group()}:null;player.group.position.set(state.x,0,state.z);follower?.group.position.set(state.x,0,state.z+1);
 const world=Object.assign(Object.create(OriginalWorld.prototype)as OriginalWorld,{
  scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),target:new THREE.Vector3(state.x,.9,state.z),yaw:.4,pitch:.6,distance:15,
  activeHeader:180,activeMatrix:105,matrix:{headers:null},generation:0,cameraReady:true,cameraTransition:false,cameraResizePending:false,fieldTasks:null,azaleaGym:null,
  cells:new Map(),npcSprites:new Map(),sky:{currentWeather:0,enter(){}},stream:async()=>{},map:async()=>nativeMap,height:()=>0,
  clearNPCs(){events.push('clear-npcs');},updateNPCs(){},animate(...args:unknown[]){events.push(['animate',...args]);},paper(){return{group:new THREE.Group()};},removePaper(){},
 });
 // The production shared player stays genuinely locked. No Context exists;
 // real source assets/configuration still admit diagnosed technical no-voice.
 let milliseconds=0;
 const music=createNativeFieldMusicPlayer({enabled:false,volume:0,createContext:()=>{assert.fail('unit tests must never unlock a real audio Context');}});
 const objects=new FieldObjects(data,state);objects.load(nativeMap.events.objects);
 const prefs={...defaultInterfacePreferences,music:false,volume:0},fieldPhone=new FieldPhoneHost(JSON.parse((await readFile(new URL('phone-triggers.json',sourceRoot))).toString()),0,12);
 const c:any={state,world,map:nativeMap,data,ui,objects,player,follower,fieldPhone,preferences:prefs,music,
  NativeFieldClock,AzaleaFieldActors,AzaleaFieldSound,AzaleaGymHost:ActualHostWithGPUResources,ScriptVM,UnsupportedScript,SourceActionRecovery,runRecoverableSourceAction,
  fieldClock:undefined,fieldSound:undefined,fieldActors:undefined,frameTriggerGate:new SourceTriggerGate(),phoneAdmissionGate:new SourceTriggerGate(),trainerAttempts:new TrainerAttemptLatch(),
  started:true,ready:true,transitioning:false,connecting:false,walking:false,hatching:false,battleSoundOwned:false,recoveryPrompt:false,sourceSceneOwners:0,ordinaryInputOwners:0,preservedControlScripts:0,
  followerSuppressed:false,followerFacing:0,followerMoving:false,followerStep:-1,followerPrevious:null,playerDirectionLocked:false,playerTweenY:undefined,stepFrame:-1,previousStepJump:false,restoringGym:false,
  battle:{active:false},activeBagUse:null,fieldPolling:false,lastWarp:'',lastCoord:'',lastError:'',musicKey:'',musicRequestSerial:0,musicPreferencePending:0,npcTweenY:new Map(),activeTrainerEncounter:null,trainerApproachTasks:new Map(),
  keys:new Set(),touch:{read:()=>({horizontal:0,forward:0,run:false})},trainerEventPriority,fieldTrainerCollision,findTrainerEncounter,MissingTrainerPartner,furnitureBlocksStep,findCoordinateTrigger,doorwayEntry,ledgeDirection,jumpHeight,pushWarp,stepWarpFacing,performance:{now:()=>milliseconds},requestAnimationFrame:(callback:()=>void)=>{raf.push(callback);},deltas:[{x:0,z:-1},{x:0,z:1},{x:-1,z:0},{x:1,z:0}],
  firstFollowerMon,gymFieldEntry,fieldEntryScripts,mapWeather,AbortController,DOMException,structuredClone,
  refreshNPCs(){events.push('refresh');},updateHUD(){events.push('hud');},resetFieldInput(){events.push('reset-input');},syncMusic(){events.push('sync-music');},musicChanged(){},musicFailed(error:unknown){events.push(['music-error',error]);},
  reportNativeFieldFailure(error:unknown){events.push(['field-error',error]);},console:{warn(...args:unknown[]){events.push(['warn',...args]);},error(...args:unknown[]){events.push(['error',...args]);}},
  encounterChecks:{reset(){events.push('reset-encounter');},step(){events.push('completed-step');}},mapBlackoutSpawn:async()=>null,save(){if(c.sourceActions?.busy)return false;writes.push(structuredClone(state));return true;},
  $:(id:string)=>dom.ids.get(id)??dom.document.createElement('div'),followMon:state.party[0]??null,followSpecies:state.party[0]?.species??0,
 };
 createContext(c);
 const names=['initializeNativeField','installAzaleaField','abortBagUse','captureField','restoreField','executeSourceAction','runScript','runFieldEntry','enterMap','checkFrameTriggers','fieldControlsAvailable','menu','save','updatePreferences','step','interact','tryTrainerEncounter','pollFieldInput','answerPhone','refreshPhoneIndicator','useBagItem','running','tween','tweenPlayer','checkEvents','trainerCollision','retainFieldInput'];
 // Save is a real binding too; its storage/field ownership gates must remain.
 const prefStore=new Map<string,string>();Object.assign(c,{writeInterfacePreferences,preferenceStorage:{getItem:(key:string)=>prefStore.get(key)??null,setItem:(key:string,value:string)=>prefStore.set(key,value)},SAVE_KEY:'azalea-unit-save',localStorage:{setItem(_key:string,value:string){writes.push(JSON.parse(value));}}});
 runInContext(compile(names.map(name=>{assert.ok(functions.has(name),name);return functions.get(name)!.getText(ast);}).join('\n')),c);
 for(const cell of nativeMap.cells){const land=JSON.parse((await readFile(new URL('lands/'+cell.land+'.json',sourceRoot))).toString());world.cells.set(cell.x+','+cell.z,{cell,land,map:nativeMap,group:new THREE.Group(),furniture:[]});}
 c.initializeNativeField();await c.installAzaleaField();
 let hooksExpression:ts.Expression|undefined;function hook(node:ts.Node){if(ts.isNewExpression(node)&&node.expression.getText(ast)==='ScriptVM'&&node.arguments?.[2]&&ts.isObjectLiteralExpression(node.arguments[2])){const property=node.arguments[2].properties.find(value=>value.name?.getText(ast)==='azaleaGym')as ts.PropertyAssignment|undefined;if(property)hooksExpression=property.initializer;}ts.forEachChild(node,hook);}hook(functions.get('begin')!);assert.ok(hooksExpression,'actual Main source gym hook');
 const unsupported=()=>{throw Error('Unexpected unrelated VM command in native gym fixture');};
 const hooks:ScriptHooks={message:async()=>unsupported(),choice:async()=>unsupported(),move:async()=>unsupported(),position:unsupported,face:unsupported,visible:unsupported,chooseStarter:async()=>unsupported(),nickname:async()=>unsupported(),refresh:async()=>{},battle:async()=>unsupported(),warp:async()=>unsupported(),azaleaGym:runInContext(compile('('+hooksExpression.getText(ast)+')'),c)};
 c.vm=new ScriptVM(data,state,hooks);c.sourceActions=new SourceActionRecovery(state,{capture:c.captureField,restore:c.restoreField});
 const frame=async()=>{milliseconds+=1000/30;for(const callback of raf.splice(0))callback();c.fieldClock.frame(1/30);await c.fieldClock.settled();await new Promise<void>(resolve=>setImmediate(resolve));};
 const renderCode=compile(renderStatement('player')+'\n'+renderStatement('follower'));
 const render=()=>{c.lead=firstFollowerMon(state.party);runInContext(renderCode,c);};
 async function until<T>(pending:Promise<T>,onFrame?:()=>void){let done=false,value:T|undefined,error:unknown;pending.then(result=>{value=result;done=true;},reason=>{error=reason;done=true;});for(let tick=0;!done&&tick<1200;tick++){await frame();render();onFrame?.();}assert.ok(done,'actual Main source action did not settle');if(error!==undefined)throw error;return value!;}
 const enter=async(kind:'warp'|'continue'='warp')=>until(c.enterMap(180,state.x,state.z,true,kind==='continue',false,false,kind));
 return Object.assign(c,{dom,writes,events,lifetime,frame,render,until,enter,prefStore,async dispose(){await world.azaleaGym?.dispose();c.fieldSound.dispose();c.fieldClock.dispose();lifetime.abort();await music.dispose();dom.restore();}});
}

test('actual Main render preserves full native cart vector while source logical coordinates stay at boarding',t=>{
 t.diagnostic('actual Main SHA256 '+sourceSHA);
 const plan=planAzaleaGymRide(initialAzaleaGymState(),0),vector=azaleaGymRideFrame(plan,40).player;
 const player={group:new THREE.Group()},state={x:plan.boarding.onto.x,z:plan.boarding.onto.z,facing:0};
 player.group.position.set(plan.boarding.from.x,0,plan.boarding.from.z);
 let terrainReads=0;const animation:unknown[]=[];
 const world={azaleaGym:{riderPosition:vector,playerHeld:true},violetGym:{riderHeight:undefined},height(){terrainReads++;return 99;},animate(...args:unknown[]){animation.push(args);}};
 const context=createContext({world,state,player,fieldActors:undefined,playerTweenY:undefined,walking:true,stepFrame:3});
 runInContext(compile(renderStatement('player')),context);
 assert.deepEqual(player.group.position.toArray(),[vector.x,vector.y,vector.z],'normal render must not pull the cart rider back to State/BDHC');
 assert.deepEqual([state.x,state.z],[plan.boarding.onto.x,plan.boarding.onto.z],'render must not commit the riding vector as logical docking coordinates');
 assert.equal(terrainReads,0,'forced native rider height must not sample ordinary terrain');
 assert.equal(animation.length,1);
});

test('native0869 ride through actual Main VM hook keeps logical docking, render and whole action save coherent',async()=>{
 const h=await fixture();try{await h.enter();const before=h.writes.length,plan=planAzaleaGymRide(initialAzaleaGymState(),0),samples:any[]=[];
 const command=h.runScript('_EV_scr_seq_T23GYM0102_002 + 1');assert.equal(h.sourceActions.busy,true);
 await h.until(command,()=>{const rider=h.world.azaleaGym?.riderPosition;if(rider)samples.push({logical:[h.state.x,h.state.z],physical:h.player.group.position.toArray(),rider:Object.values(rider)});if(h.world.azaleaGym?.moving){assert.equal(h.fieldControlsAvailable(),false);assert.equal(h.save(),false);}});
 assert.ok(samples.some(value=>value.logical[0]===plan.boarding.onto.x&&value.logical[1]===plan.boarding.onto.z&&value.physical[0]!==value.logical[0]),'physical route moves while logical source position remains boarding');
 assert.ok(samples.every(value=>JSON.stringify(value.physical)===JSON.stringify(value.rider)),'normal render never overwrites actual route XYZ');
 assert.deepEqual([h.state.x,h.state.z],[plan.arrival.disembarked.x,plan.arrival.disembarked.z]);assert.deepEqual(h.player.group.position.toArray(),[plan.arrival.disembarked.x,0,plan.arrival.disembarked.z]);
 assert.deepEqual(h.fieldActors.snapshot().player,{current:{...plan.arrival.disembarked,y:0},previous:{...plan.arrival.disembarked,y:0}});
 assert.equal(h.writes.length,before+1);assert.deepEqual(h.writes.at(-1).gymmick,{kind:'azalea',spiders:[4,1,2,7],switches:0});assert.equal(h.world.azaleaGym.moving,false);assert.equal(h.fieldControlsAvailable(),true);
 assert.equal(h.world.azaleaGym.audioStatus[2171].kind,'no-voice','locked/muted shared output is diagnosed, never fabricated playback');
 }finally{await h.dispose();}
});

test('actual Continue and failure hydration retain puzzle/orbit while native warp Init resets',async()=>{
 const h=await fixture(false);try{h.state.gymmick={kind:'azalea',spiders:[4,1,2,7],switches:3};h.state.fieldHeight=0;await h.enter('continue');assert.deepEqual(h.world.azaleaGym.renderer.state,{spiders:[4,1,2,7],switches:3});
 const checkpoint=structuredClone(h.state.gymmick),orbit=[h.world.yaw,h.world.pitch,h.world.distance];
 const pending=h.executeSourceAction(async()=>{await h.world.azaleaGym.flipSwitch(0,{map:nativeMap,signal:new AbortController().signal});h.state.flags.FAILED_GYM_SCENE=true;throw Error('after switch');});
 await h.until(pending,()=>{if(h.ui.panelOpen&&h.dom.ids.get('panel-content')?.innerHTML.includes('Return to field'))h.dom.buttons[1]?.click();});
 assert.equal(h.state.flags.FAILED_GYM_SCENE,undefined);assert.deepEqual(h.state.gymmick,checkpoint);assert.deepEqual(h.world.azaleaGym.renderer.state,{spiders:checkpoint.spiders,switches:checkpoint.switches});assert.deepEqual([h.world.yaw,h.world.pitch,h.world.distance],orbit);
 await h.enter('warp');assert.deepEqual(h.state.gymmick,{kind:'azalea',...initialAzaleaGymState()});assert.equal(h.vm.lastUnsupported,null);
 }finally{await h.dispose();}
});

test('mid-route VM cancellation drains actual riders before Return; explicit Retry replays one coherent ride',async()=>{
 for(const retry of[false,true]){const h=await fixture();try{
  await h.enter();const writes=h.writes.length,checkpoint=h.captureField(),puzzle=structuredClone(h.state.gymmick);let cancelled=false,recovered=false;
  const action=h.runScript('_EV_scr_seq_T23GYM0102_002 + 1');
  await h.until(action,()=>{
   if(!cancelled&&h.world.azaleaGym.riderPosition?.x>4.5){cancelled=true;h.vm.cancel(Error('original ride interrupted'));}
   if(h.ui.panelOpen&&h.dom.ids.get('panel-content')?.innerHTML.includes('Return to field')){
    recovered=true;assert.equal(h.world.azaleaGym.moving,false);assert.deepEqual(h.state.gymmick,puzzle);assert.deepEqual([h.state.x,h.state.z],[3.5,32.5]);assert.deepEqual(h.player.group.position.toArray(),[3.5,0,32.5]);assert.deepEqual(h.follower.group.position.toArray(),checkpoint.followerPosition);assert.equal(h.save(),false);
    h.dom.buttons[retry?0:1].click();
   }
  });
  assert.equal(cancelled,true);assert.equal(recovered,true);assert.equal(h.writes.length,writes+1,'no partial ride save before Return or successful Retry');
  if(retry){assert.deepEqual([h.state.x,h.state.z],[9.5,23.5]);assert.deepEqual(h.state.gymmick,{kind:'azalea',spiders:[4,1,2,7],switches:0});}
  else{assert.deepEqual([h.state.x,h.state.z],[3.5,32.5]);assert.deepEqual(h.state.gymmick,puzzle);}
  assert.equal(h.sourceActions.busy,false);assert.equal(h.world.azaleaGym.moving,false);
 }finally{await h.dispose();}}
});

test('actual0869 reverse and switch source entries work without a follower',async()=>{
 const h=await fixture(false);try{h.state.gymmick={kind:'azalea',spiders:[4,1,2,7],switches:0};const plan=planAzaleaGymRide(h.state.gymmick,4);Object.assign(h.state,{x:plan.boarding.from.x,z:plan.boarding.from.z});h.player.group.position.set(h.state.x,0,h.state.z);await h.enter('continue');
 await h.until(h.runScript('_EV_scr_seq_T23GYM0102_006 + 1'));assert.deepEqual([h.state.x,h.state.z],[plan.arrival.disembarked.x,plan.arrival.disembarked.z]);assert.equal(h.fieldActors.actors().follower,null);
 await h.until(h.runScript('_EV_scr_seq_T23GYM0102_014 + 1'));assert.equal(h.state.gymmick.switches,1);assert.equal(h.world.azaleaGym.audioStatus[1561].kind,'no-voice');assert.equal(h.vm.lastUnsupported,null);
 }finally{await h.dispose();}
});

test('global mute remains authoritative through actual Main source rollback and explicit Retry',async()=>{
 for(const retry of[false,true]){const h=await fixture(false);try{await h.enter('continue');h.preferences={...h.preferences,music:true,textSpeed:1};h.state.options.sound=true;h.state.options.textSpeed=1;h.state.options.battleStyle='shift';let attempts=0;
  const result=h.executeSourceAction(async()=>{attempts++;h.updatePreferences({...h.preferences,music:false,textSpeed:2});h.state.options.battleStyle='set';if(attempts===1)throw Error('scene failed after global mute');return true;});
  await h.until(result,()=>{if(h.ui.panelOpen&&h.dom.ids.get('panel-content')?.innerHTML.includes('Return to field')){
   assert.equal(h.state.options.sound,false);assert.equal(h.state.options.textSpeed,2);assert.equal(h.state.options.battleStyle,'shift','gameplay settings remain checkpoint owned');h.dom.buttons[retry?0:1].click();
  }});
  assert.equal(h.preferences.music,false);assert.equal(h.state.options.sound,false);assert.equal(h.state.options.textSpeed,2);assert.equal(h.state.options.battleStyle,retry?'set':'shift');assert.equal(attempts,retry?2:1);
  assert.equal([...h.prefStore.values()].some((value:any)=>JSON.parse(value).music===false),true);assert.equal(h.writes.at(-1).options.sound,false);assert.equal((await h.music.playMap({id:180},{hour:12,flags:h.state.flags})).status,'muted');assert.equal(h.music.isUnlocked(),false);
 }finally{await h.dispose();}}
});

test('actual Main keeps one root sound registry across field cancellation, recovery and a replacement gym host',async()=>{
 const h=await fixture(false);try{
  await h.enter('continue');const clock=h.fieldClock,sound=h.fieldSound,registry=await sound.preparePlayer(new AbortController().signal);
  assert.equal(registry.signal,h.music.lifetimeSignal);assert.equal(h.music.isUnlocked(),false);
  let updates=0;const actual=registry.soundUpdate.bind(registry);registry.soundUpdate=()=>{updates++;actual();};
  h.world.beginFieldTransition();assert.equal(h.world.fieldMapRunning,false);
  h.world.draw(h.state.x,h.state.z,1/30,0);await clock.settled();assert.equal(updates,1,'World.draw advances sound before its frozen camera return');
  await h.enter('continue');assert.equal(h.fieldClock,clock);assert.equal(h.fieldSound,sound);assert.equal(await sound.preparePlayer(new AbortController().signal),registry);
  const failure=h.executeSourceAction(async()=>{throw Error('root sound survives hydration');});
  await h.until(failure,()=>{if(h.ui.panelOpen&&h.dom.ids.get('panel-content')?.innerHTML.includes('Return to field'))h.dom.buttons[1].click();});
  assert.equal(h.fieldClock,clock);assert.equal(h.fieldSound,sound);assert.equal(await sound.preparePlayer(new AbortController().signal),registry);
  await h.installAzaleaField();const before=updates;h.world.beginFieldTransition();h.world.draw(h.state.x,h.state.z,1/30,0);await clock.settled();assert.equal(updates,before+1,'host replacement installs no second sound callback');
  await h.music.dispose();const closed=updates;h.world.draw(h.state.x,h.state.z,1/30,0);await clock.settled();assert.equal(updates,closed,'music root disposal removes the sound callback');
 }finally{await h.dispose();}
});

test('native capture handlers never unlock from the global mute target while field and owned-panel keys retain their owners',async()=>{
 const dom=installUIDOM(),clock=installUIClock(),ui=new UI(),keys=new Set<string>(),registered=new Map<string,((event:any)=>void)[]>();let unlocks=0,reads=0,interactions=0,toggles=0;
 const c:any={ui,keys,preferences:{music:true},document:{...dom.document,visibilityState:'visible',addEventListener(){}},
  music:{isUnlocked(){reads++;return false;},unlock(){unlocks++;return Promise.resolve();}},soundUnlocked:false,unlockPending:null,hatching:false,battleSoundOwned:false,musicRequestSerial:0,musicChanged(){},finishMusicUnlock(){},musicFailed(error:unknown){throw error;},
  started:true,ready:true,world:{fieldTransitionActive:false,azaleaGym:null},sourceActions:null,recoveryPrompt:false,transitioning:false,connecting:false,sourceSceneOwners:0,preservedControlScripts:0,ordinaryInputOwners:0,vm:{busy:false},battle:{active:false},
  interact:async()=>{interactions++;},menu:async()=>{},answerPhone:async()=>{},reportInputError(error:unknown){throw error;},resetFieldInput(){keys.clear();},save(){},abortBagUse(){},
  addEventListener(type:string,handler:(event:any)=>void,options?:{capture?:boolean}){const handlers=registered.get(type)??[];handlers.push(handler);registered.set(type,handlers);dom.listen(type,handler,options?.capture);},
 };
 try{
  const events=ast.statements.filter(node=>ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)&&node.expression.expression.getText(ast)==='addEventListener').map(node=>node.getText(ast)).join('\n');
  createContext(c);runInContext(compile(functions.get('unlockSound')!.getText(ast)+'\n'+functions.get('fieldControlsAvailable')!.getText(ast)+'\n'+events),c);
  const button=dom.document.createElement('button');button.setAttribute('data-global-audio','');dom.document.body.appendChild(button);button.onclick=()=>{toggles++;};const icon=button.appendChild(dom.document.createElement('span'));button.focus();
  registered.get('pointerdown')![0]({target:icon});
  for(const code of['Enter','Space']){const event=dom.key(code);assert.equal(event.defaultPrevented,false);button.click();}
  assert.equal(toggles,2);assert.equal(unlocks,0);assert.equal(reads,0,'capture must not even query/unlock music before the mute click');
  for(const code of['KeyW','KeyA','KeyS','KeyD']){assert.equal(dom.key(code).defaultPrevented,true);assert.ok(keys.has(code));}
  assert.equal(unlocks,0,'focused mute does not create a permission gesture on unrelated field keys');
  const choice=ui.choose('Required source choice',['Yes','No']);clock.flush();button.focus();
  assert.equal(dom.key('ArrowDown').defaultPrevented,true);assert.equal(dom.document.activeElement,dom.buttons[0],'arrows return to modal navigation');
  button.focus();assert.equal(dom.key('Tab').defaultPrevented,true);assert.equal(dom.document.activeElement,dom.buttons[0]);
  const count=keys.size;dom.key('Enter');assert.equal(await choice,0);assert.equal(interactions,0);assert.equal(keys.size,count);
  const beforeMuted=unlocks;c.preferences.music=false;dom.ids.get('original-world')!.focus();dom.key('KeyW');registered.get('pointerdown')![0]({target:dom.ids.get('original-world')});assert.equal(unlocks,beforeMuted,'ordinary muted gestures cannot unlock');
 }finally{ui.close();clock.restore();dom.restore();}
});


test('native cart ownership blocks independent field actions without relying on VM or transaction busy',async()=>{
 const h=await fixture(false);try{await h.enter('continue');const checkpoint=structuredClone(h.state),writes=h.writes.length;
  assert.equal(h.vm.busy,false);assert.equal(h.sourceActions.busy,false);assert.equal(h.ui.busy,false);
  Reflect.set(h.world.azaleaGym,'busy',true);
  assert.equal(h.fieldControlsAvailable(),false);assert.equal(h.save(),false);assert.equal(await h.step(3),false);await h.interact();await h.menu();assert.equal(await h.tryTrainerEncounter(),false);await h.pollFieldInput();await h.answerPhone();
  await assert.rejects(h.useBagItem('ITEM_POTION',{state:h.state,signal:new AbortController().signal}),{name:'AbortError'});
  assert.deepEqual(h.state,checkpoint);assert.equal(h.writes.length,writes);assert.equal(h.ui.panelOpen,false);assert.equal(h.fieldPolling,false);
  Reflect.set(h.world.azaleaGym,'busy',false);assert.equal(h.fieldControlsAvailable(),true,'positive control: idle native host releases field admission');
 }finally{Reflect.set(h.world.azaleaGym,'busy',false);await h.dispose();}
});


test('eight source walking ticks map to one Paper walk cycle for player and follower',()=>{
 const paper=()=>({group:new THREE.Group(),texture:new THREE.Texture(),sprite:new THREE.Mesh(),info:{frames:16,columns:4,rows:4}}),player=paper(),follower=paper(),state={x:3.5,z:32.5,facing:0};
 let step=0;const columns:number[][]=[[],[]],world={azaleaGym:{riderPosition:null,playerHeld:false},violetGym:{riderHeight:undefined},height:()=>0,yaw:0,animate:OriginalWorld.prototype.animate};
 const c=createContext({world,state,player,follower,lead:{},followerSuppressed:false,followerFacing:0,followerMoving:false,walking:false,stepFrame:-1,playerTweenY:undefined,fieldActors:{movement:()=>({direction:0,step})}});
 const draw=compile(renderStatement('player')+'\n'+renderStatement('follower'));
 for(step=0;step<8;step++){runInContext(draw,c);columns[0].push(player.texture.offset.x*4);columns[1].push(follower.texture.offset.x*4);}
 for(const frames of columns)assert.deepEqual(frames,[0,0,1,1,2,2,3,3],'source displacement ticks are not atlas column indices');
});

test('actual ordinary step enters the native coordinate ride and whole-step Return or Retry restores its original tile',async()=>{
 for(const retry of[false,true]){const h=await fixture();try{
  Object.assign(h.state,{x:3.5,z:33.5});h.player.group.position.set(3.5,0,33.5);h.follower.group.position.set(3.5,0,34.5);await h.enter('continue');h.follower.group.position.set(3.5,0,34.5);
  assert.equal(h.world.permission(3.5,32.5),0,'literal native land249 boarding permission');assert.equal(h.world.walkable(3.5,32.5,3.5,33.5,0),true);
  const before=h.captureField(),writes=h.writes.length,puzzle=structuredClone(h.state.gymmick);let cancelled=false,prompted=false;
  const pending=h.step(0);
  await h.until(pending,()=>{
   if(!cancelled&&h.world.azaleaGym.riderPosition?.x>4.5){cancelled=true;h.vm.cancel(Error('coordinate ride interrupted'));}
   if(h.ui.panelOpen&&h.dom.ids.get('panel-content')?.innerHTML.includes('Return to field')){prompted=true;assert.deepEqual([h.state.x,h.state.z],[3.5,33.5],'outer step checkpoint precedes entering coordinate3,32');assert.deepEqual(h.follower.group.position.toArray(),before.followerPosition);assert.deepEqual(h.state.gymmick,puzzle);assert.equal(h.world.azaleaGym.moving,false);assert.equal(h.save(),false);h.dom.buttons[retry?0:1].click();}
  });
  assert.equal(cancelled,true,'actual coordinate matcher and VM must start the ride');assert.equal(prompted,true);assert.equal(h.writes.length,writes+1,'the ordinary step and nested ride commit once together');assert.equal(h.events.filter((event:any)=>event==='completed-step').length,retry?2:1);
  assert.deepEqual([h.state.x,h.state.z],retry?[9.5,23.5]:[3.5,33.5]);assert.deepEqual(h.state.gymmick,retry?{kind:'azalea',spiders:[4,1,2,7],switches:0}:puzzle);assert.equal(h.sourceActions.busy,false);
 }finally{await h.dispose();}}
});
