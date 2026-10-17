import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createContext,runInContext} from 'node:vm';
import * as ts from 'typescript';
import * as THREE from 'three';
import {loadData,newState,createMon} from './data.ts';
import {giveTogepiEgg,firstFollowerMon,NATIVE_EGG_ICON} from './eggs.ts';
import {hatchFirstReadyEgg} from './egg-hatching.ts';
import {chooseFieldPartySwitchTarget,swapFieldPartySlots} from './party-order.ts';
import {partyRow,partySummary} from './party-display.ts';
import {SourceActionRecovery,SourceTriggerGate,runRecoverableSourceAction} from './script-recovery.ts';
import {TrainerAttemptLatch} from './trainer-encounters.ts';
import {ScriptVM,UnsupportedScript} from './script.ts';
import {sourceJSON} from './types.ts';

globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData(),mainURL=new URL('./main.ts',import.meta.url),main=await readFile(mainURL,'utf8');
const mainHash=createHash('sha256').update(main).digest('hex');
const ast=ts.createSourceFile('main.ts',main,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const functions=new Map(ast.statements.filter(ts.isFunctionDeclaration).map(node=>[node.name?.text,node.getText(ast)]));
const names=['save','executeSourceAction','partyMenu','choosePartyAction','summary'];
for(const name of names)assert.ok(functions.has(name),'actual main binding '+name);
let render;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='render')render=node;ts.forEachChild(node,visit);}visit(ast);
const statements=render.body.statements,index=statements.findIndex(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>d.name.getText(ast)==='lead'));
assert.ok(index>0);const followerSource=statements.slice(index-1,index+3).map(node=>node.getText(ast)).join('\n');
const bound=names.map(name=>functions.get(name)).join('\n')+'\nfunction renderFollowerActual(){'+followerSource+'}';
const compiled=ts.transpileModule(bound,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
after(async()=>assert.equal(createHash('sha256').update(await readFile(mainURL)).digest('hex'),mainHash,'main changed during bound tests'));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
async function fixture({hatched=false}={}){
 const state=newState(data,'Ethan','boy',()=>.5);Object.assign(state,{map:73,x:10.5,z:10.5,trainerId:123,nativeEggSeed:1});state.party=[createMon(data,155,5,state.name,()=>.5)];giveTogepiEgg(data,state,{now:()=>new Date(2026,9,17)});
 if(hatched){state.party[1].friendship=0;await hatchFirstReadyEgg(data,state,{map:await sourceJSON('maps/73.json'),now:()=>new Date(2026,9,17)},{reveal:async()=>{},cry:async()=>{},announce:async(_scene,cry)=>{await cry;return false;},nickname:async()=>null,resumeField:async()=>{}});}
 const player={group:new THREE.Group()},follower={group:new THREE.Group()};player.group.position.set(10.5,3,10.5);follower.group.position.set(10.5,3,11.5);
 const controls={choices:[],choose:null,update:null},writes=[],log=[],listeners=new Set(),elements=new Map();let buttons=[];
 const element=id=>{if(!elements.has(id))elements.set(id,{onclick:null,focus(){log.push(['focus',id]);}});return elements.get(id);};
 const document={querySelectorAll:selector=>selector==='[data-party-slot]'?buttons:[],querySelector:selector=>{const selected=/data-party-slot="(\d+)"/.exec(selector);return selected?buttons[Number(selected[1])]:null;}};
 const ui={panelOpen:true,busy:true,canDismiss:true,panel(html,autoFocus){log.push(['panel',html,autoFocus]);ui.panelOpen=true;buttons=Array.from(html.matchAll(/data-party-slot="(\d+)"/g),m=>({dataset:{partySlot:m[1]},onclick:null,focus(){log.push(['focus-slot',Number(m[1])]);}}));},close(){ui.panelOpen=false;log.push('close');},async choose(title,options,_detail,signal){log.push(['choice',title,[...options]]);if(title==='Scene not completed')return 1;if(controls.choose)return controls.choose(title,options,signal);assert.ok(controls.choices.length,'unexpected chooser '+title);return controls.choices.shift();}};
 const world={removePaper(actor){actor.group.removeFromParent();log.push(['remove',actor]);return true;},paper(key){const actor={group:new THREE.Group()};log.push(['paper',key,actor]);return actor;},animate(){},battleStage:null};
 const c={state,data,player,follower,followMon:state.party[0],followSpecies:155,followerSuppressed:false,followerFacing:1,followerMoving:false,followerStep:-1,hatchFollowerPendingCommit:false,world,ui,document,$:element,NATIVE_EGG_ICON,partyRow,partySummary,chooseFieldPartySwitchTarget,swapFieldPartySlots,firstFollowerMon,UnsupportedScript,runRecoverableSourceAction,ready:true,started:true,recoveryPrompt:false,transitioning:false,walking:false,vm:{busy:false},battle:{active:false},keys:new Set(),drag:false,frameTriggerGate:new SourceTriggerGate(),trainerAttempts:new TrainerAttemptLatch(),lastError:'',console:{error(){},warn:console.warn},SAVE_KEY:'party-test',localStorage:{setItem:(_key,text)=>writes.push(JSON.parse(text))},objects:{save:()=>state.objectEvents},updateHUD(){log.push('hud');controls.update?.();},AbortController,DOMException,addEventListener(type,handler){assert.equal(type,'keydown');listeners.add(handler);},removeEventListener(type,handler){assert.equal(type,'keydown');listeners.delete(handler);}};
 createContext(c);runInContext(compiled,c);
 c.sourceActions=new SourceActionRecovery(state,{capture:()=>({}),restore:async()=>{log.push('restore');}});
 return Object.assign(c,{controls,writes,log,listeners,dispatchEscape(){const event={code:'Escape',preventDefault(){log.push('prevent-default');}};for(const listener of [...listeners])listener(event);}});
}

test('actual party panel opens options and returns cursor to the selected target or summary slot',async t=>{
 t.diagnostic('main SHA256 '+mainHash+'; bindings SHA256 '+createHash('sha256').update(bound).digest('hex'));
 const c=await fixture();c.partyMenu(1);assert.ok(c.log.at(-2)[1].includes('data-party-slot="1"'));assert.deepEqual(c.log.at(-1),['focus-slot',1]);
 c.controls.choices=[0];await c.choosePartyAction(1);assert.ok(c.log.some(row=>Array.isArray(row)&&row[0]==='panel'&&row[1].includes('POKÉMON SUMMARY')));c.$('summary-back').onclick();assert.deepEqual(c.log.at(-1),['focus-slot',1]);assert.equal(c.listeners.size,0);
});

test('real gift/hatch then actual field switch persists whole records, refreshes follower and enables native Elm reward',async()=>{
 const c=await fixture({hatched:true}),starter=c.state.party[0],togepi=c.state.party[1];togepi.moves[0].pp=1;togepi.status='paralysis';const original=structuredClone(c.state.party),position=c.follower.group.position.clone();
 c.controls.choices=[1,0];await c.choosePartyAction(1);assert.equal(c.state.party[0],togepi);assert.equal(c.state.party[1],starter);assert.deepEqual(c.state.party,[original[1],original[0]]);assert.deepEqual(c.log.at(-1),['focus-slot',0]);assert.equal(c.sourceActions.busy,false);assert.equal(c.writes.at(-1).party[0].species,175);
 c.renderFollowerActual();assert.equal(c.followMon,togepi);assert.equal(c.followSpecies,175);assert.ok(c.follower.group.position.equals(position));assert.equal(c.log.filter(row=>Array.isArray(row)&&row[0]==='remove').length,1);c.renderFollowerActual();assert.equal(c.log.filter(row=>Array.isArray(row)&&row[0]==='paper').length,1);
 const continued=JSON.parse(JSON.stringify(c.writes.at(-1))),lab=await sourceJSON('maps/61.json');continued.map=61;continued.vars.VAR_SCENE_ELMS_LAB=7;const messages=[];
 const vm=new ScriptVM(data,continued,{message:async text=>{messages.push(text);},choice:async()=>0,move:async()=>{},position(){},face(){},visible(){},chooseStarter:async()=>{},nickname:async()=>{},refresh:async()=>{},battle:async()=>{throw Error('no fight');},warp:async()=>{}});await vm.run(lab,1);
 assert.equal(vm.lastUnsupported,null);assert.equal(continued.bag.ITEM_EVERSTONE,1);assert.equal(continued.flags.FLAG_GOT_EVERSTONE_FROM_ELM,true);assert.ok(messages.some(text=>text.includes('Everstone')));
});

test('Cancel, source slot and owned Escape preserve party; pending selection gates actual save and removes its listener',async()=>{
 for(const selection of['cancel-menu','cancel-target','same-slot','escape-menu','escape-target']){
  const c=await fixture(),party=c.state.party,before=structuredClone(party);if(selection==='cancel-menu')c.controls.choices=[2];if(selection==='cancel-target')c.controls.choices=[1,2];if(selection==='same-slot')c.controls.choices=[1,1];
  if(selection.startsWith('escape')){let calls=0;const entered=deferred();c.controls.choose=async(_title,_options,signal)=>{if(selection==='escape-target'&&calls++===0)return 1;entered.resolve();return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));};const pending=c.choosePartyAction(1);await entered.promise;assert.equal(c.sourceActions.busy,true);c.save();assert.equal(c.writes.length,0);c.dispatchEscape();await pending;}else await c.choosePartyAction(1);
  assert.equal(c.state.party,party,selection);assert.deepEqual(c.state.party,before,selection);assert.equal(c.listeners.size,0);assert.equal(c.sourceActions.busy,false);assert.ok(!c.log.includes('restore'));assert.deepEqual(c.log.at(-1),['focus-slot',1]);
 }
});

test('external UI replacement and post-swap failure recover instead of being mistaken for owned cancel',async()=>{
 for(const phase of['replaced','after-swap']){const c=await fixture(),before=structuredClone(c.state.party);if(phase==='replaced')c.controls.choose=async()=>{throw new DOMException('UI operation replaced','AbortError');};else{c.controls.choices=[1,0];c.controls.update=()=>{throw Error('refresh failed after swap');};}
  await c.choosePartyAction(1);assert.deepEqual(c.state.party,before);assert.ok(c.log.includes('restore'));assert.ok(c.log.some(row=>Array.isArray(row)&&row[0]==='choice'&&row[1]==='Scene not completed'));assert.equal(c.listeners.size,0);assert.equal(c.writes.at(-1).party[0].species,155);
 }
});

test('actual native partner-room exception omits Switch; other rooms retain it, including Eggs',async()=>{
 for(const partner of[false,true]){const c=await fixture();c.state.map=partner?data.constants.MAP_BATTLE_TOWER_PARTNER_ROOM:73;c.controls.choices=[partner?1:2];await c.choosePartyAction(1);const options=c.log.find(row=>Array.isArray(row)&&row[0]==='choice')[2];assert.deepEqual(options,partner?['Summary','Cancel']:['Summary','Switch','Cancel']);assert.equal(c.state.party[1].isEgg,true);}
});

test('actual follower render distinguishes same-species identities, preserves position and removes an absent lead once',async()=>{
 const c=await fixture(),second=createMon(data,155,5,c.state.name,()=>.1);c.state.party=[c.state.party[0],second];const position=c.follower.group.position.clone();c.state.party=swapFieldPartySlots(c.state.party,0,1);c.renderFollowerActual();assert.equal(c.followMon,second);assert.ok(c.follower.group.position.equals(position));assert.equal(c.log.filter(row=>Array.isArray(row)&&row[0]==='paper').length,1);
 c.state.party=[];c.renderFollowerActual();assert.equal(c.follower,null);assert.equal(c.followMon,null);assert.equal(c.followSpecies,0);c.renderFollowerActual();assert.equal(c.log.filter(row=>Array.isArray(row)&&row[0]==='remove').length,2);
});
