import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createContext,runInContext} from 'node:vm';
import * as ts from 'typescript';
import * as THREE from 'three';
import {loadData,newState} from './data.ts';
import {FieldObjects} from './objects.ts';
import {ScriptVM,UnsupportedScript} from './script.ts';
import {OriginalWorld} from './world.ts';
import {isItemBallObject} from './item-pickup.ts';
import {fieldSpriteHeight} from './field-sprite-scale.ts';
import {doorwayEntry} from './terrain.ts';
import {ledgeDirection} from './ledges.ts';
import {pushWarp} from './field-transitions.ts';
import {sourceJSON} from './types.ts';
import {SourceActionRecovery,SourceTriggerGate,runRecoverableSourceAction} from './script-recovery.ts';
import {TrainerAttemptLatch,trainerEventPriority} from './trainer-encounters.ts';
import {FieldPhoneHost} from './phone-field-host.ts';
import {firstFollowerMon,NATIVE_EGG_ICON} from './eggs.ts';
import {partyHUD} from './party-display.ts';
import {fieldInput,fieldInputFacing} from './field-input.ts';
import {findInteractedBackgroundEvent,backgroundFlagSet} from './background-events.ts';

globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
// The optional immutable snapshot is used only for a controlled regression negative;
// ordinary runs always extract the real production entry point next to this test.
const data=await loadData(),mainURL=process.env.HG_ITEM_REVIEW_MAIN?pathToFileURL(process.env.HG_ITEM_REVIEW_MAIN):new URL('./main.ts',import.meta.url),worldURL=new URL('./world.ts',import.meta.url),main=await readFile(mainURL,'utf8'),worldSource=await readFile(worldURL,'utf8');
const phoneRules=await sourceJSON('phone-triggers.json');
const hash=(text:string)=>createHash('sha256').update(text).digest('hex'),names=['abortBagUse','fieldControlsAvailable','captureField','restoreField','executeSourceAction','pollFieldInput','save','resetFieldInput','syncInputContext','displayMapName','updateHUD','refreshNPCs','showPerson','face','runScript','checkFrameTriggers','interact','step','menu'];
function bindings(source:string){
 const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),functions=new Map(ast.statements.filter(ts.isFunctionDeclaration).map(node=>[node.name?.text,node.getText(ast)]));
 for(const name of names)assert.ok(functions.has(name),'actual main '+name);
 const camera=ast.statements.filter(ts.isVariableStatement).flatMap(node=>[...node.declarationList.declarations]).find(node=>node.name.getText(ast)==='camera')!.initializer as ts.NewExpression;
 const options=camera.arguments![1]as ts.ObjectLiteralExpression,allowed=options.properties.find(node=>ts.isPropertyAssignment(node)&&node.name.getText(ast)==='allowed')as ts.PropertyAssignment;
 return names.map(name=>functions.get(name)).join('\n')+'\nvar cameraAllowedActual='+allowed.initializer.getText(ast)+';';
}
function worldBinding(source:string){const ast=ts.createSourceFile('world.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),world=ast.statements.find(node=>ts.isClassDeclaration(node)&&node.name?.text==='OriginalWorld')as ts.ClassDeclaration;return world.members.find(node=>ts.isMethodDeclaration(node)&&node.name.getText(ast)==='updateNPCs')!.getText(ast);}
const bound=bindings(main),bindingHash=hash(bound),worldMethod=worldBinding(worldSource),compiled=ts.transpileModule(bound,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
after(async()=>{const current=await readFile(mainURL,'utf8');assert.equal(hash(bindings(current)),bindingHash,'the tested main item/input/save bodies changed during the run');assert.equal(hash(worldBinding(await readFile(worldURL,'utf8'))),hash(worldMethod),'the tested World NPC scaling binding changed during the run');if(hash(current)!==hash(main))console.log('# Unrelated main bytes changed during this run; actual extracted bindings remained identical.');});
function deferred(){let resolve!:(value?:any)=>void,reject!:(error:unknown)=>void;const promise=new Promise<any>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
async function fixture({mapId=154,localIndex=0}={}){
 const map=structuredClone(await sourceJSON('maps/'+mapId+'.json')),balls=map.events.objects.filter(event=>isItemBallObject(map,event.id)),event=balls[localIndex];assert.ok(event,'actual source item event');map.initTriggers=[];
 const state=newState(data,'Ethan','boy');Object.assign(state,{map:map.id,x:event.x+.5,z:event.z+1.5,facing:0});delete state.flags[event.eventFlag];
 const objects=new FieldObjects(data,state);objects.load(map.events.objects);const controls={hud:null as null|(()=>void),message:null as null|((text:string)=>Promise<void>),choice:null as null|((options:string[])=>Promise<number>),hydrationFault:false},log:any[]=[],writes:any[]=[],nodes=new Map<string,any>();let c:any;
 const element=(id:string)=>{if(!nodes.has(id)){let html='';nodes.set(id,{dataset:{},textContent:'',get innerHTML(){return html;},set innerHTML(value){html=value;if(id==='party-hud'){log.push(['hud',structuredClone(state.bag)]);controls.hud?.();}}});}return nodes.get(id);};
 const world={yaw:.3,pitch:.5,distance:12,sky:{currentWeather:0},clearScriptCameraTarget(){log.push('clear-camera');},beginFieldTransition(){world.fieldTransitionActive=true;},endFieldTransition(){world.fieldTransitionActive=false;},map:async()=>map,enter:async()=>map,clearNPCs(){world.npcSprites.clear();},paper(){return{group:new THREE.Group()};},removePaper(){},npcSprites:new Map(),fieldTransitionActive:false,updateNPCs(actors:any[]){log.push('refresh');if(controls.hydrationFault)throw Error('NPC hydration failed');for(const npc of actors){let actor=world.npcSprites.get(npc.id);if(!actor){actor={npc,group:new THREE.Group()};world.npcSprites.set(npc.id,actor);}actor.npc=npc;actor.group.position.set(npc.x+.5,0,npc.z+.5);actor.group.visible=npc.visible;}},permission:()=>0,terrainWalkable:()=>true,height:()=>0,walkable(){log.push('walk-admission');return false;}};
 const ui={loading(){},busy:false,panelOpen:false,dialogueOpen:false,advance(){log.push('advance');},async message(text:string){log.push(['message',text]);ui.busy=true;ui.dialogueOpen=true;try{await controls.message?.(text);}finally{ui.dialogueOpen=false;ui.busy=false;}},async choose(title:string,options:string[],detail:string,_signal:unknown,settings:unknown){log.push(['recovery',title,[...options],detail,settings]);ui.busy=true;ui.panelOpen=true;try{assert.ok(controls.choice,'unexpected item recovery prompt');return await controls.choice(options);}finally{ui.panelOpen=false;ui.busy=false;}}};
 const touch={context:null,read:()=>({horizontal:0,forward:0,run:false}),reset(){log.push('touch-reset');},setContext(context:any){touch.context=context;}};const camera={reset(){log.push('camera-reset');},sync(){}};
 c={fieldActors:undefined,state,map,data,objects,world,ui,touch,camera,$:element,esc:(text:string)=>text,keys:new Set(['KeyW']),walking:false,transitioning:false,connecting:false,started:true,ready:true,sourceActions:null,recoveryPrompt:false,hatching:false,sourceSceneOwners:0,preservedControlScripts:0,ordinaryInputOwners:0,fieldPolling:false,activeBagUse:null,battleSoundOwned:false,lastError:'',musicKey:'',musicRequestSerial:0,syncMusic(){},preferences:{music:state.options.sound,cameraSensitivity:1,textSpeed:state.options.textSpeed},textDelay:()=>0,fieldPhone:new FieldPhoneHost(phoneRules,1000,12),frameTriggerGate:new SourceTriggerGate(),phoneAdmissionGate:new SourceTriggerGate(),trainerAttempts:new TrainerAttemptLatch(),trainerApproachTasks:new Map(),player:{group:new THREE.Group()},follower:null,followMon:null,followSpecies:0,followerFacing:1,followerMoving:false,followerStep:-1,followerPrevious:null,followerSuppressed:false,hatchFollowerPendingCommit:false,playerDirectionLocked:false,previousStepJump:false,playerTweenY:undefined,stepFrame:-1,lastWarp:'',lastCoord:'',npcTweenY:new Map(),panels:{async menu(){log.push('menu-admission');}},battle:{active:false},isItemBallObject,runRecoverableSourceAction,trainerEventPriority,tryTrainerEncounter:async()=>false,pollPhoneAdmission:async()=>{log.push('phone-poll');},firstFollowerMon,NATIVE_EGG_ICON,partyHUD,fieldInput,fieldInputFacing,findInteractedBackgroundEvent,backgroundFlagSet,mapWeather:()=>0,structuredClone,AbortController,DOMException,ScriptVM,UnsupportedScript,AggregateError,console:{error(){},warn(){}},localStorage:{setItem:(_key:string,text:string)=>writes.push(JSON.parse(text))},SAVE_KEY:'item-host-test',checkFrameTriggers:async()=>{log.push('frame-check');return false;},deltas:[{x:0,z:-1},{x:0,z:1},{x:-1,z:0},{x:1,z:0}],doorwayEntry,ledgeDirection,pushWarp,running:()=>false,encounterChecks:{reset(){},step(){log.push('step');}},warp:async()=>{throw Error('Unexpected warp');},tweenPlayer:async()=>{log.push('move-admission');}};
 createContext(c);runInContext(compiled,c);
 c.vm=new ScriptVM(data,state,{message:text=>ui.message(text),choice:async()=>0,move:async()=>{},position(){},face:(...args:any[])=>c.face(...args),visible:(...args:any[])=>c.showPerson(...args),chooseStarter:async()=>{},nickname:async()=>1,refresh:async()=>c.refreshNPCs(),battle:async()=>false,warp:async()=>{throw Error('Item source must not warp');}});
 c.sourceActions=new SourceActionRecovery(state,{capture:()=>c.captureField(),restore:(snapshot,error)=>c.restoreField(snapshot,error)});c.refreshNPCs();log.length=0;
 return Object.assign(c,{event,controls,log,writes,touchPort:touch});
}
function expectedItem(c:any){const sid=c.vm.value(String(c.event.scriptId),c.map),entry=c.map.scripts.entries[sid-1];return{sid,entry};}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(condition:()=>boolean){for(let i=0;i<30;i++){if(condition())return;await tick();}assert.ok(condition(),'expected actual host phase');}

test('actual interact/runScript saves one real item, hides the correct rendered object and allows re-entry to keep it collected',async t=>{
 t.diagnostic(JSON.stringify({mainSha256:hash(main),actualBindingsSha256:bindingHash,worldSha256:hash(worldSource),npcScalingBindingSha256:hash(worldMethod)}));
 const c=await fixture(),others=structuredClone(c.objects.save(c.state.map).actors.filter(actor=>actor.id!==c.event.id));await c.interact();
 assert.deepEqual(c.state.bag,{ITEM_ELIXIR:1});assert.equal(c.state.flags[c.event.eventFlag],true);assert.equal(c.world.npcSprites.get(c.event.id).group.visible,false);assert.equal(c.vm.lastUnsupported,null);assert.equal(c.sourceActions.busy,false);assert.equal(c.walking,false);assert.equal(c.writes.length,1);assert.equal(c.writes[0].bag.ITEM_ELIXIR,1);assert.equal(c.writes[0].flags[c.event.eventFlag],true);assert.deepEqual(c.objects.save(c.state.map).actors.filter(actor=>actor.id!==c.event.id),others);assert.ok(c.log.includes('touch-reset'));assert.ok(c.log.includes('camera-reset'));
 const restored=new FieldObjects(data,JSON.parse(JSON.stringify(c.writes[0])));restored.load(c.map.events.objects);assert.equal(restored.snapshot().find(actor=>actor.id===c.event.id)!.visible,false);const before=c.writes.length;await c.interact();assert.equal(c.writes.length,before,'the hidden ball is not interacted with or rewarded again');assert.equal(c.state.bag.ITEM_ELIXIR,1);
});

test('a post-VM HUD failure followed by Return restores State/live actors and saves no reward or hide flag',async()=>{
 const c=await fixture(),stateRef=c.state,before=structuredClone(c.state),actors=structuredClone(c.objects.save(c.state.map)),prompts:any[]=[];let failed=false;
 c.controls.hud=()=>{if(!failed&&c.state.bag.ITEM_ELIXIR){failed=true;c.objects.position(c.event.id,90,91,2);c.state.money+=100;throw Error('post-swap-equivalent item HUD failure');}};
 c.controls.choice=async options=>{prompts.push({options:Array.from(options),walking:c.walking,bag:structuredClone(c.state.bag),actors:structuredClone(c.objects.save(c.state.map)),saved:c.save()});return 1;};
 await c.interact();assert.deepEqual(prompts,[{options:['Retry scene','Return to field'],walking:false,bag:before.bag,actors,saved:false}]);assert.equal(failed,true);assert.equal(c.state,stateRef);const expected=structuredClone(before);expected.objectEvents=actors;expected.fieldHeight=0;assert.deepEqual(c.state,expected);assert.deepEqual(c.writes,[JSON.parse(JSON.stringify(expected))]);assert.equal(c.world.npcSprites.get(c.event.id).group.visible,true);assert.equal(c.walking,false);assert.equal(c.sourceActions.busy,false);assert.equal(c.log.filter(row=>Array.isArray(row)&&row[0]==='recovery').length,1);
});

test('actual Retry replays the restored pickup once and commits exactly one item after a late message failure',async()=>{
 const c=await fixture(),prompts:any[]=[];let failed=false,attempts=0;c.controls.message=async text=>{if(text.includes('found')){attempts++;if(!failed){failed=true;throw Error('native print failed once');}}};c.controls.choice=async options=>{prompts.push({options:Array.from(options),bag:structuredClone(c.state.bag),visible:c.objects.snapshot().find(actor=>actor.id===c.event.id).visible});return 0;};
 await c.interact();assert.deepEqual(prompts,[{options:['Retry scene','Return to field'],bag:{},visible:true}]);assert.equal(attempts,2);assert.deepEqual(c.state.bag,{ITEM_ELIXIR:1});assert.equal(c.writes.length,1);assert.equal(c.writes[0].bag.ITEM_ELIXIR,1);assert.equal(c.state.flags[c.event.eventFlag],true);assert.match(c.lastError,/fail/);assert.equal(c.sourceActions.busy,false);
});

test('the actual full-bag host shows native failure without deleting/rewarding the ball or opening recovery UI',async()=>{
 const c=await fixture();c.state.bag.ITEM_ELIXIR=data.constants.BAG_SLOT_QUANTITY_MAX;await c.interact();assert.equal(c.state.bag.ITEM_ELIXIR,data.constants.BAG_SLOT_QUANTITY_MAX);assert.notEqual(c.state.flags[c.event.eventFlag],true);assert.equal(c.world.npcSprites.get(c.event.id).group.visible,true);assert.equal(c.state.vars.VAR_SPECIAL_RESULT,0);assert.equal(c.log.filter(row=>Array.isArray(row)&&row[0]==='message').length,1);assert.equal(c.log.some(row=>Array.isArray(row)&&row[0]==='recovery'),false);assert.equal(c.writes.length,1);
});

test('actual local Lake of Rage and Mt. Moon interactions enter the same main transaction despite having no7000+ script ID',async()=>{
 for(const mapId of[88,513]){const c=await fixture({mapId}),sid=expectedItem(c).sid;assert.ok(sid<7000);let failed=false;c.controls.hud=()=>{if(!failed&&Object.keys(c.state.bag).length){failed=true;throw Error('local HUD failed');}};c.controls.choice=async()=>0;await c.interact();assert.equal(failed,true);assert.equal(Object.values(c.state.bag).reduce((sum:any,count:any)=>sum+count,0),1);assert.equal(c.state.flags[c.event.eventFlag],true);assert.equal(c.writes.length,1);assert.equal(c.vm.lastUnsupported,null);assert.equal(c.log.filter(row=>Array.isArray(row)&&row[0]==='recovery').length,1);}
});

test('a failed recovery refresh blocks save and all field controls until actual Retry succeeds, without duplicating its provisional item',async()=>{
 const c=await fixture(),entered=deferred(),choice=deferred();let failed=false,optionsSeen:string[]=[];c.controls.hud=()=>{if(!failed&&c.state.bag.ITEM_ELIXIR){failed=true;c.controls.hydrationFault=true;throw Error('HUD then hydration failure');}};c.controls.choice=async options=>{optionsSeen=Array.from(options);if(options[0]==='Retry loading'){entered.resolve();return choice.promise;}return 0;};
 const pending=c.interact();await entered.promise;assert.deepEqual(optionsSeen,['Retry loading']);assert.equal(c.sourceActions.recovering,true);assert.deepEqual(c.state.bag,{});assert.notEqual(c.state.flags[c.event.eventFlag],true);assert.equal(c.save(),false);assert.equal(c.writes.length,0);c.syncInputContext();assert.deepEqual(structuredClone(c.touchPort.context),{movement:false,run:false,interact:false,menu:false});assert.equal(c.cameraAllowedActual(),false);
 c.controls.hydrationFault=false;choice.resolve(0);await pending;assert.equal(c.sourceActions.busy,false);assert.equal(c.walking,false);assert.equal(c.state.bag.ITEM_ELIXIR,1);assert.equal(c.writes.length,1);assert.match(c.lastError,/fail/);
});

test('an interrupted refresh-failure prompt fails closed: the actual post-catch save, step, interaction, menu and camera stay blocked',async()=>{
 const c=await fixture();let failed=false;c.controls.hud=()=>{if(!failed&&c.state.bag.ITEM_ELIXIR){failed=true;c.controls.hydrationFault=true;throw Error('HUD then hydration failure');}};c.controls.choice=async()=>{throw new DOMException('Recovery panel was replaced','AbortError');};
 await assert.rejects(c.interact(),/Recovery panel was replaced/);assert.equal(c.walking,false);assert.equal(c.sourceActions.recovering,true);assert.deepEqual(c.state.bag,{});assert.equal(c.writes.length,0);assert.equal(c.save(),false);c.syncInputContext();assert.deepEqual(structuredClone(c.touchPort.context),{movement:false,run:false,interact:false,menu:false});assert.equal(c.cameraAllowedActual(),false);
 const facing=c.state.facing,logs=c.log.length;await c.step(3);await c.interact();await c.menu();assert.equal(c.state.facing,facing);await c.pollFieldInput();assert.equal(c.log.length,logs);assert.equal(c.writes.length,0);
});

test('the actual automatic frame gate also stays closed after failed item hydration and an interrupted recovery prompt',async()=>{
 const c=await fixture(),label='item_hydration_frame_witness',flag='ITEM_HYDRATION_FRAME_MUST_NOT_RUN';
 c.map.scripts.labels[label]=c.map.scripts.instructions.length;c.map.scripts.instructions.push(['SetVar',['VAR_SPECIAL_x800D','1']],['SetFlag',[flag]],['End',[]]);
 let failed=false;c.controls.hud=()=>{if(!failed&&c.state.bag.ITEM_ELIXIR){failed=true;c.controls.hydrationFault=true;c.map.initTriggers=[{var:'VAR_SPECIAL_x800D',value:0,script:label}];throw Error('HUD then hydration failure');}};c.controls.choice=async()=>{throw new DOMException('Recovery panel replaced','AbortError');};
 await assert.rejects(c.interact(),/Recovery panel replaced/);assert.equal(c.sourceActions.recovering,true);await c.pollFieldInput();assert.equal(c.state.flags[flag],undefined,'no frame script may mutate quest state until hydration recovers');assert.equal(c.writes.length,0);assert.deepEqual(c.state.bag,{});
});

test('the actual World.updateNPCs binding calibrates only the original16px ball to1unit beside2unit hero and1.4unit follower',()=>{
 const world=Object.create(OriginalWorld.prototype)as any,created:any[]=[],follower=Object.keys(data.sprites).find(key=>key.includes('FOLLOWER'))!;
 Object.assign(world,{scene:new THREE.Scene(),npcSprites:new Map(),sprites:data.sprites,height:()=>0,animate(){},paper(key:string,height:number){created.push([key,height]);return{group:new THREE.Group(),texture:new THREE.Texture(),info:data.sprites[key]};}});
 const base={id:'ball',resolvedSprite:'SPRITE_MONSTARBALL',x:1,z:1,y:0,visible:true,facingDirection:0,step:-1};world.updateNPCs([base,{...base,id:'hero',resolvedSprite:'SPRITE_HERO'},{...base,id:'follower',resolvedSprite:follower}]);
 assert.equal(data.sprites.SPRITE_MONSTARBALL.height,16);assert.equal(data.sprites.SPRITE_HERO.height,32);assert.deepEqual(created,[['SPRITE_MONSTARBALL',1],['SPRITE_HERO',2],[follower,1.4]]);assert.equal(created[0][1],fieldSpriteHeight('SPRITE_MONSTARBALL',data.sprites,2));world.updateNPCs([base]);assert.equal(created.length,3,'ordinary refresh does not rebuild the ball');
});
