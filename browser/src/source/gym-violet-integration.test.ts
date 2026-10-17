import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createContext,runInContext} from 'node:vm';
// Copy this file into browser/src/source; set HG_REVIEW_ROOT for standalone /tmp execution.
const root=process.env.HG_REVIEW_ROOT??fileURLToPath(new URL('../../../',import.meta.url)).replace(/\/$/,'');
const load=path=>import(pathToFileURL(root+'/'+path).href);
const THREE=await load('browser/node_modules/three/build/three.module.js');
const {GLTFLoader}=await load('browser/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
const ts=(await load('browser/node_modules/typescript/lib/typescript.js')).default;
const {loadData,newState,createMon}=await load('browser/src/source/data.ts');
const {OriginalWorld}=await load('browser/src/source/world.ts');
const {VioletGym}=await load('browser/src/source/gym-violet.ts');
const {ScriptVM,UnsupportedScript}=await load('browser/src/source/script.ts');
const {FieldObjects}=await load('browser/src/source/objects.ts');
const {FieldPhoneHost}=await load('browser/src/source/phone-field-host.ts');
const {SourceActionRecovery,SourceTriggerGate}=await load('browser/src/source/script-recovery.ts');
const {setScriptCameraTarget,SCRIPT_CAMERA_ACTOR}=await load('browser/src/source/script-camera.ts');
const {firstFollowerMon}=await load('browser/src/source/eggs.ts');
const {fieldCameraEntry}=await load('browser/src/source/camera.ts');
const {mapWeather}=await load('browser/src/source/atmosphere.ts');
const {sourceJSON}=await load('browser/src/source/types.ts');
globalThis.fetch=async input=>new Response(await readFile(root+'/browser/public'+String(input)));
const phoneRules=await sourceJSON('phone-triggers.json');
const data=await loadData(),map=await sourceJSON('maps/135.json'),land=await sourceJSON('lands/246.json');
const main=await readFile(root+'/browser/src/source/main.ts','utf8');
const raw=await readFile(root+'/browser/public/source/props/0-111-26.glb');
const size=raw.readUInt32LE(12),doc=JSON.parse(raw.subarray(20,20+size).toString());
delete doc.images;delete doc.textures;delete doc.samplers;
for(const m of doc.materials??[]){delete m.pbrMetallicRoughness?.baseColorTexture;delete m.pbrMetallicRoughness?.metallicRoughnessTexture;delete m.normalTexture;delete m.occlusionTexture;delete m.emissiveTexture;}
let encoded=JSON.stringify(doc);encoded+=' '.repeat((4-Buffer.byteLength(encoded)%4)%4);
const json=Buffer.from(encoded),tail=raw.subarray(20+size),packed=Buffer.alloc(20+json.length+tail.length);
raw.copy(packed,0,0,20);packed.writeUInt32LE(packed.length,8);packed.writeUInt32LE(json.length,12);json.copy(packed,20);tail.copy(packed,20+json.length);
const template=(await new GLTFLoader().parseAsync(packed.buffer.slice(packed.byteOffset,packed.byteOffset+packed.byteLength),'')).scene;
const prefix='vm=new ScriptVM(data,state,';
const hookStart=main.indexOf(prefix,main.indexOf('async function begin('));
const hookEnd=main.indexOf(');\n  sourceActions=',hookStart);
assert.ok(hookStart>=0&&hookEnd>=0,'actual main hook expression moved');
const hookExpression=main.slice(hookStart+'vm='.length,hookEnd+1);
const capture=main.match(/^function captureField\(\).*$/m)?.[0];
const restore=main.slice(main.indexOf('async function restoreField('),main.indexOf('async function executeSourceAction'));
assert.ok(capture&&restore.startsWith('async function restoreField('));
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const unexpected=()=>{throw Error('Unexpected gameplay hook: this fixture never fabricates trainer wins or source movement');};
async function fixture(height=2,restoreSave=false){
 const state=newState(data,'Ethan','boy');Object.assign(state,{map:135,x:15.5,z:20.5,fieldHeight:height,gymmick:{kind:'violet',liftState:height===31?1:0}});
 state.party=[createMon(data,152,10,state.name,()=>.5)];
 const world=Object.create(OriginalWorld.prototype);
 Object.assign(world,{scene:new THREE.Scene(),cells:new Map([['0,0',{cell:map.cells[0],land,map,group:new THREE.Group(),furniture:[]}]]),npcSprites:new Map(),activeMatrix:87,activeHeader:135,matrix:{headers:null},generation:0,camera:new THREE.PerspectiveCamera(52),target:new THREE.Vector3(15.5,2.9,27.5),cameraReady:true,cameraTransition:false,grassTime:0,yaw:1.2,pitch:.5,distance:17,sky:{currentWeather:0,enter(_map,value){this.currentWeather=value;}},stream:async()=>{},streamCenter:'',streamRequest:false,loading:false,nextStreamAttempt:0});
 world.map=async()=>map;world.asset=async()=>template;
 world.paper=()=>({group:new THREE.Group()});world.removePaper=actor=>{actor.group.removeFromParent();return true;};
 world.violetGymInstance=new VioletGym(world.scene,world.asset,async(seconds,frame)=>{assert.equal(seconds,29/30);for(let i=0;i<=29;i++)frame(i/29);});
 fieldCameraEntry(world.camera,world.target,world.target.clone(),true,world.yaw,world.pitch,world.distance);
 await world.enter(135,state.x,state.z,0,height,height===31?1:0);
 const player={group:new THREE.Group()},follower={group:new THREE.Group()};player.group.position.set(state.x,height,state.z);follower.group.position.set(state.x,height,state.z+1);world.scene.add(player.group,follower.group);
 const objects=new FieldObjects(data,state);objects.load(map.events.objects);
 const context={fieldActors:undefined,preferences:{music:state.options.sound,textSpeed:state.options.textSpeed},abortBagUse(){},syncInputContext(){},syncMusic(){},musicKey:'',musicRequestSerial:0,resetFieldInput(){context.keys.clear();},state,world,data,map,fieldPhone:new FieldPhoneHost(phoneRules,1000,12),phoneAdmissionGate:new SourceTriggerGate(),objects,player,follower,restoringGym:restoreSave,followerMoving:false,followSpecies:152,followMon:state.party[0],started:true,ready:true,walking:false,transitioning:false,followerPrevious:null,playerTweenY:undefined,stepFrame:-1,followerStep:-1,followerFacing:1,followerSuppressed:false,playerDirectionLocked:false,previousStepJump:false,lastWarp:'',lastCoord:'',keys:new Set(),drag:false,npcTweenY:new Map(),ScriptVM,UnsupportedScript,FieldObjects,setScriptCameraTarget,SCRIPT_CAMERA_ACTOR,firstFollowerMon,mapWeather,console,requestAnimationFrame:unexpected,ui:{loading(){},message:unexpected,choose:unexpected},refreshNPCs(){},updateHUD(){},beginTrainerPath:unexpected,finishTrainerPath:unexpected,whiteOut:unexpected,moveActor:unexpected,setPosition:unexpected,face:unexpected,showPerson:unexpected,chooseStarter:unexpected,trainerBattle:unexpected,enterMap:unexpected,scriptWarp:unexpected,encounterChecks:{reset(){}}};
 createContext(context);context.vm=runInContext(compile(hookExpression),context);runInContext(compile(capture+'\n'+restore+'\nglobalThis.captureActual=captureField;globalThis.restoreActual=restoreField;'),context);
 return context;
}

test('unconditional actual Violet OnTransition finishes through real trainer phone commands and native main lift hooks',async()=>{
 const c=await fixture();await c.vm.run(map,map.initScripts.OnTransition);
 assert.equal(c.vm.lastUnsupported,null);assert.ok(c.vm.supported.has('GetPhoneBookRematch'));assert.ok(c.vm.supported.has('CheckRegisteredPhoneNumber'));assert.equal(c.state.flags.FLAG_HIDE_VIOLET_GYM_FALKNER,false);assert.equal(c.state.gymmick.liftState,0);assert.equal(c.world.violetGym.platform.position.y,2);
 await c.vm.run(map,map.events.coords[0].scriptId);assert.equal(c.player.group.position.y,31);assert.equal(c.follower.group.position.y,31);assert.equal(c.world.height(15.5,20.5,31),31);assert.equal(c.state.gymmick.liftState,1);assert.equal(c.world.scriptCameraPosition,null);
 await c.vm.run(map,map.events.coords[0].scriptId);assert.equal(c.player.group.position.y,2);assert.equal(c.follower.group.position.y,2);assert.equal(c.state.gymmick.liftState,0);
});

test('actual main Continue hook preserves raised lift through full native entry and World.enter clears old camera target',async()=>{
 const c=await fixture(31,true),offset=c.world.camera.position.clone().sub(c.world.target),rotation=c.world.camera.quaternion.clone();c.world.createScriptCameraTarget(135,15,18);assert.ok(c.world.scriptCameraPosition);await c.world.enter(135,c.state.x,c.state.z,0,c.state.fieldHeight,c.state.gymmick.liftState);assert.equal(c.world.scriptCameraPosition,null);await c.vm.run(map,map.initScripts.OnTransition);assert.equal(c.vm.lastUnsupported,null);assert.equal(c.state.gymmick.liftState,1);assert.equal(c.world.violetGym.platform.position.y,31);assert.equal(c.world.height(c.state.x,c.state.z,c.state.fieldHeight),31);assert.equal(c.world.target.y,31.9);assert.ok(c.world.camera.position.clone().sub(c.world.target).distanceTo(offset)<1e-12);assert.ok(c.world.camera.quaternion.angleTo(rotation)<1e-7);
});

test('actual main recovery rehydrates raised lift, actor/follower height and orbit after completed downward ride then failure',async()=>{
 const c=await fixture(31,true);await c.vm.run(map,map.initScripts.OnTransition);const recovery=new SourceActionRecovery(c.state,{capture:c.captureActual,restore:c.restoreActual}),error=new UnsupportedScript(map.code,'SyntheticAfterLiftFailure',999),rotation=c.world.camera.quaternion.clone();
 await assert.rejects(recovery.run(async()=>{await c.vm.run(map,map.events.coords[0].scriptId);assert.equal(c.player.group.position.y,2);c.state.flags.AFTER_LIFT=true;c.world.createScriptCameraTarget(135,15,18);throw error;}),value=>value===error);
 assert.equal(recovery.busy,false);assert.equal(c.state.flags.AFTER_LIFT,undefined);assert.equal(c.state.gymmick.liftState,1);assert.equal(c.world.violetGym.platform.position.y,31);assert.equal(c.world.height(c.state.x,c.state.z,31),31);assert.equal(c.player.group.position.y,31);assert.equal(c.follower.group.position.y,31);assert.equal(c.world.scriptCameraPosition,null);assert.equal(c.vm.lastUnsupported.command,'SyntheticAfterLiftFailure');assert.deepEqual([c.world.yaw,c.world.pitch,c.world.distance],[1.2,.5,17]);assert.ok(c.world.camera.quaternion.angleTo(rotation)<1e-7);
});
