// @ts-nocheck — execute actual Main bodies/hooks with bounded UI/GPU ports.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createContext,runInContext} from 'node:vm';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';
import {loadData,newState,createMon,giveMon} from './data.ts';
import {Battle as ProductionBattle} from './battle.ts';
import {ScriptVM,UnsupportedScript} from './script.ts';
import {SourceActionRecovery,runFieldBattleAction} from './script-recovery.ts';
import {FieldPhoneHost} from './phone-field-host.ts';
import {sourceJSON} from './types.ts';
import {applyNativeFieldNicknameInput,applyNativeNicknameResult,resolveNativeNicknameInput,migrateLegacyBrowserNicknames,UnsupportedNativeNickname} from './mon-nickname.ts';

globalThis.fetch=async input=>{try{return new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));}catch{return new Response('',{status:404});}};
const data=await loadData(),native=await sourceJSON('maps/157.json');
const mainURL=process.env.HG_NICKNAME_REVIEW_MAIN?pathToFileURL(process.env.HG_NICKNAME_REVIEW_MAIN):new URL('./main.ts',import.meta.url);
const source=await readFile(mainURL,'utf8'),sha=text=>createHash('sha256').update(text).digest('hex'),hash=sha(source);
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const functions=new Map(ast.statements.filter(ts.isFunctionDeclaration).map(node=>[node.name.text,node.getText(ast)]));
const compile=text=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
let vmSource,hatchNickname;
function visit(node){
 if(ts.isNewExpression(node)&&node.expression.getText(ast)==='ScriptVM'&&node.arguments?.[2]&&ts.isObjectLiteralExpression(node.arguments[2]))vmSource=node.getText(ast);
 if(ts.isCallExpression(node)&&node.expression.getText(ast)==='presentNativeEggHatch')for(const argument of node.arguments)if(ts.isObjectLiteralExpression(argument)){const property=argument.properties.find(property=>property.name?.getText(ast)==='nickname');if(property)hatchNickname=property.initializer.getText(ast);}
 ts.forEachChild(node,visit);
}visit(ast);assert.ok(vmSource&&hatchNickname);
after(async()=>assert.equal(sha(await readFile(mainURL,'utf8')),hash,'Main changed during actual-body tests'));
const copy=value=>JSON.parse(JSON.stringify(value));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
function fixture(){
 const state=newState(data,'Case','boy',()=>.5);state.map=native.id;state.party=[createMon(data,155,14,state.name,()=>.5)];
 const log=[],writes=[],errors=[],control={input:'Cinder',choice:0};
 const ui={input:async(...args)=>{log.push(['input',...args]);if(control.inputError)throw control.inputError;return control.inputGate?control.inputGate.promise:control.inputs?.length?control.inputs.shift():control.input;},choose:async()=>control.choice,message:async(...args)=>{log.push(['message',...args]);await control.messageGate?.promise;}};
 const no=()=>{},asyncNo=async()=>{},world={paper:()=>({group:new THREE.Group()}),sky:{currentWeather:0},violetGym:{}};
 class Recovery extends SourceActionRecovery{constructor(state,ports){log.push(['recovery-created',copy(state.nicknameMetadata??null),state.party.map(mon=>mon.hasNickname)]);super(state,ports);}}
 const c={data,state,map:structuredClone(native),vm:null,world,ui,log,writes,errors,control,nicknameAdmission:null,preferences:{music:false,textSpeed:1},player:null,follower:null,objects:null,battle:null,sourceActions:null,started:false,ready:false,restoringGym:false,fieldPhone:{resetForSourceEvent(){},triggerQueued(){}},SAVE_KEY:'nickname-test',
  applyNativeFieldNicknameInput,applyNativeNicknameResult,resolveNativeNicknameInput,migrateLegacyBrowserNicknames,UnsupportedNativeNickname,
  ScriptVM,UnsupportedScript,SourceActionRecovery:Recovery,FieldPhoneHost,sourceJSON,fieldRTCObservation:()=>({seconds:1000,hour:12}),
  Battle:class{constructor(){this.start=async enemies=>{log.push(['battle-start']);if(control.actualCapture){const native=new ProductionBattle(data,c.state,ui,()=>0);native.enemies=enemies;native.trainer=null;native.say=async()=>{};let result;native.finish=value=>{result=value;};assert.equal(await native.item('ITEM_POKE_BALL'),true);assert.equal(result,'caught');return result;}giveMon(c.state,enemies[0]);return'caught';};}},WorldBattleView:class{},FieldObjects:class{},
  captureField:()=>({}),restoreField:async()=>{},enterMap:async()=>{},save:()=>{writes.push(copy(c.state));return true;},$:()=>({focus:no}),
  localStorage:{setItem(key,value){log.push(['persist',key]);writes.push(JSON.parse(value));}},console:{warn:(...args)=>log.push(['warn',...args]),error:no},
  installAzaleaField:asyncNo,hatchEgg:asyncNo,setScriptCameraTarget:no,SCRIPT_CAMERA_ACTOR:241,beginTrainerPath:asyncNo,finishTrainerPath:asyncNo,whiteOut:asyncNo,setPosition:no,face:no,showPerson:no,chooseStarter:asyncNo,trainerBattle:asyncNo,scriptWarp:asyncNo,moveActor:asyncNo,refreshNPCs:no,updateHUD:no,textDelay:()=>0,
  resetFieldInput:no,encounterChecks:{reset:no},momSavingsActive:()=>false,settleMomBattleMoney:()=>({}),withBattleMusic:async(_attempt,_trainer,action)=>action(),battleMoneyLoss:()=>0,healParty:no,trainerPrize:async()=>0,runFieldEntry:asyncNo,checkFrameTriggers:async()=>false,runFieldBattleAction,structuredClone,DOMException,AbortController,
 };
 c.executeSourceAction=async action=>{try{return{ok:true,value:await c.sourceActions.run(action)};}catch(error){errors.push(error);return{ok:false};}};
 createContext(c);
 const wanted=['requestNativeNickname','nicknamePartyMon','nicknameCapturedMon','admitNicknameMetadata','begin','startBattle'];
 runInContext(compile(wanted.filter(name=>functions.has(name)).map(name=>functions.get(name)).join('\n')+'\nvm='+vmSource+';'),c);
 c.sourceActions=new SourceActionRecovery(c.state,{capture:()=>({}),restore:async()=>{}});c.started=true;c.ready=true;c.battle=new c.Battle();
 c.hatchNickname=runInContext(compile('('+hatchNickname+')'),c);
 return c;
}
function namingMap(index=0){const map=structuredClone(native);map.scripts={entries:['start'],labels:{start:0},instructions:[['NicknameInput',[String(index),'VAR_TEMP_x4000']],['End',[]]]};return map;}

test('actual Main field hook writes custom flag; unchanged and explicit species reset use literal0/1',async t=>{
 t.diagnostic('actual Main SHA256 '+hash);
 const c=fixture();const mon=c.state.party[0];assert.equal(await c.vm.hooks.nickname(0),0);assert.equal(mon.name,'Cinder');assert.equal(mon.hasNickname,true);
 c.control.input='Cinder';assert.equal(await c.vm.hooks.nickname(0),1);assert.equal(mon.hasNickname,true);
 c.control.input='CYNDAQUIL';assert.equal(await c.vm.hooks.nickname(0),0);assert.equal(mon.hasNickname,false);
});

test('VM preserves actual unchanged noInput1 and applied0, rejects void/other codes before result write',async()=>{
 const c=fixture();c.control.input='CYNDAQUIL';await c.vm.run(namingMap(),1);assert.equal(c.vm.value('VAR_TEMP_x4000',native),1);
 c.control.input='Cinder';await c.vm.run(namingMap(),1);assert.equal(c.vm.value('VAR_TEMP_x4000',native),0);assert.equal(c.state.party[0].hasNickname,true);
 for(const value of[undefined,null,2,-1,NaN,'0']){c.vm.set('VAR_TEMP_x4000',77);c.vm.hooks.nickname=async()=>value;await assert.rejects(c.vm.run(namingMap(),1),UnsupportedScript);assert.equal(c.vm.value('VAR_TEMP_x4000',native),77);}
});

test('field missing/Bug Contest subject and invalid input are explicit; late UI cannot mutate replacement party/field',async()=>{
 const c=fixture();for(const index of[-1,2,255])await assert.rejects(c.vm.hooks.nickname(index),/naming subject/);assert.equal(c.log.filter(row=>row[0]==='input').length,0);
 c.control.inputs=['😀','Cinder'];assert.equal(await c.vm.hooks.nickname(0),0);assert.equal(c.state.party[0].name,'Cinder');assert.equal(c.log.filter(row=>row[0]==='input').length,2);assert.equal(c.log.filter(row=>row[0]==='message').length,1);
 for(const kind of['party','map']){const f=fixture(),old=f.state.party[0];f.control.inputGate=deferred();const work=f.vm.hooks.nickname(0);if(kind==='party')f.state.party[0]=structuredClone(old);else f.state.map++;
  f.control.inputGate.resolve('Later');await assert.rejects(work,/subject changed/);assert.equal(old.name,'CYNDAQUIL');assert.equal(old.hasNickname,false);
 }
});

test('actual Main capture path names the retained party and PC subjects, including default/no choices',async()=>{
 for(const destination of['party','boxes'])for(const decision of['custom','default','no']){
  const c=fixture();if(destination==='boxes')c.state.party=Array.from({length:6},()=>createMon(data,155,5,'Case',()=>.5));
  c.control.choice=decision==='no'?1:0;c.control.input=decision==='custom'?'Cinder':'CYNDAQUIL';await c.startBattle([createMon(data,155,14,'',()=>.5)]);
  assert.deepEqual(c.errors,[]);const mon=c.state[destination].at(-1);assert.equal(mon.name,decision==='custom'?'Cinder':'CYNDAQUIL');assert.equal(mon.hasNickname,decision==='custom');
 }
});

test('capture naming is inside actual battle transaction: later failure removes provisional catch/flag',async()=>{
 const c=fixture(),before=copy(c.state);c.settleMomBattleMoney=()=>{throw Error('after capture name');};await c.startBattle([createMon(data,155,14,'',()=>.5)]);
 assert.equal(c.errors.length,1);assert.match(String(c.errors[0]),/after capture name/);assert.deepEqual(copy(c.state),before);
});

test('late capture UI cannot mutate detached subject and rejects unresolved choice',async()=>{
 const c=fixture();c.control.inputGate=deferred();const work=c.startBattle([createMon(data,155,14,'',()=>.5)]);for(let i=0;i<30;i++)await Promise.resolve();
 const subject=c.state.party.at(-1);c.state.party.pop();c.control.inputGate.resolve('Later');await work;assert.equal(c.errors.length,1);assert.match(String(c.errors[0]),/subject changed/);assert.equal(subject.name,'CYNDAQUIL');
 const invalid=fixture();invalid.control.choice=undefined;await invalid.startBattle([createMon(data,155,14,'',()=>.5)]);assert.equal(invalid.errors.length,1);assert.match(String(invalid.errors[0]),/choice was not resolved/);
});

test('actual begin admits/persists legacy custom/default before recovery and never reinfers after saved marker',async()=>{
 const c=fixture();delete c.state.nicknameMetadata;delete c.state.party[0].hasNickname;const custom=createMon(data,158,18,'Case',()=>.5);custom.name='Old Custom';delete custom.hasNickname;c.state.boxes.push(custom);
 await c.begin('continue');assert.equal(c.state.party[0].hasNickname,false);assert.equal(c.state.boxes[0].hasNickname,true);assert.equal(c.nicknameAdmission.admission,'migrated');
 const created=c.log.find(row=>row[0]==='recovery-created');assert.equal(created[1].origin,'migrated-local-v2');assert.deepEqual(created[2],[false]);assert.ok(c.log.findIndex(row=>row[0]==='persist')<c.log.findIndex(row=>row[0]==='recovery-created'));
 const saved=c.writes[0];assert.equal(saved.party[0].hasNickname,false);assert.equal(saved.boxes[0].hasNickname,true);assert.equal(saved.nicknameMetadata.version,1);
 await assert.rejects(c.sourceActions.run(async()=>{c.state.party[0].hasNickname=true;throw Error('rollback after admission');}));assert.equal(c.state.party[0].hasNickname,false);assert.equal(c.state.nicknameMetadata.origin,'migrated-local-v2');
 const missing=createMon(data,155,14,'Case',()=>.5);delete missing.hasNickname;c.state.party.push(missing);await c.begin('continue');assert.equal(missing.hasNickname,undefined);assert.equal(c.nicknameAdmission.admission,'already-marked');assert.equal(c.nicknameAdmission.kind,'partial');
});

test('actual begin retains unknown/foreign/corrupt/Egg exclusions, and tolerates unavailable storage without fabricating flags',async()=>{
 const c=fixture();delete c.state.nicknameMetadata;delete c.state.party[0].hasNickname;
 c.state.boxes=[{...structuredClone(c.state.party[0]),isEgg:true},{...structuredClone(c.state.party[0]),checksumFailed:true},{...structuredClone(c.state.party[0]),provenance:{language:1}}];
 c.localStorage.setItem=()=>{throw Error('storage unavailable');};await c.begin('continue');assert.equal(c.nicknameAdmission.kind,'partial');assert.equal(c.nicknameAdmission.skippedEggs,1);assert.equal(c.nicknameAdmission.unresolved.length,2);for(const mon of c.state.boxes)assert.equal(mon.hasNickname,undefined);assert.equal(c.state.party[0].hasNickname,false);
 assert.ok(c.log.some(row=>row[0]==='warn'));assert.ok(c.sourceActions);
});

test('actual hatch Main port uses general native input rules without a premature Mon mutation',async()=>{
 const c=fixture(),before=copy(c.state);for(const[name,expected]of[['TOGEPI','TOGEPI'],['Pip','Pip'],['   ',null]]){c.control.input=name;assert.equal(await c.hatchNickname({speciesName:'TOGEPI'},new AbortController().signal),expected);}
 c.control.inputs=['😀','Pip'];assert.equal(await c.hatchNickname({speciesName:'TOGEPI'},new AbortController().signal),'Pip');assert.deepEqual(copy(c.state),before);
});


test('invalid ASCII-apostrophe capture input reprompts without replaying actual capture, Ball use or Pokédex commit',async()=>{
 const c=fixture();c.control.actualCapture=true;c.state.bag.ITEM_POKE_BALL=2;c.control.inputs=["Bob's",'Bob’s'];
 await c.startBattle([createMon(data,161,5,'',()=>.5)]);
 assert.deepEqual(c.errors,[]);assert.equal(c.log.filter(row=>row[0]==='battle-start').length,1);assert.equal(c.state.bag.ITEM_POKE_BALL,1);
 assert.equal(c.state.party.length,2);assert.equal(c.state.party[1].species,161);assert.equal(c.state.party[1].name,'Bob’s');assert.equal(c.state.party[1].hasNickname,true);
 assert.ok(c.state.seen.includes(161));assert.ok(c.state.caught.includes(161));assert.equal(c.log.filter(row=>row[0]==='input').length,2);assert.equal(c.log.filter(row=>row[0]==='message').length,1);
});

test('reprompt catches only validation: stale subjects, rejected UI, missing source rows and hatch abort still fail',async()=>{
 const stale=fixture(),old=stale.state.party[0];stale.control.input='😀';stale.control.messageGate=deferred();const pending=stale.vm.hooks.nickname(0);
 for(let i=0;i<20;i++)await Promise.resolve();assert.equal(stale.log.filter(row=>row[0]==='message').length,1);stale.state.party[0]=structuredClone(old);stale.control.messageGate.resolve();
 await assert.rejects(pending,/subject changed/);assert.equal(stale.log.filter(row=>row[0]==='input').length,1);assert.equal(old.name,'CYNDAQUIL');
 const completed=fixture(),prior=completed.state.party[0],request=completed.requestNativeNickname;completed.requestNativeNickname=async(...args)=>{const result=await request(...args);completed.state.party[0]=structuredClone(prior);return result;};await assert.rejects(completed.vm.hooks.nickname(0),/subject changed/);assert.equal(prior.name,'CYNDAQUIL');
 const technical=fixture();technical.control.inputError=Error('input device failed');await assert.rejects(technical.vm.hooks.nickname(0),/input device failed/);assert.equal(technical.log.filter(row=>row[0]==='message').length,0);
 const invalidPort=fixture();invalidPort.control.input=null;await assert.rejects(invalidPort.vm.hooks.nickname(0),/explicit string/);assert.equal(invalidPort.log.filter(row=>row[0]==='message').length,0);
 const config=fixture();config.data={...data,names:{...data.names,species:{...data.names.species}}};delete config.data.names.species[155];await assert.rejects(config.vm.hooks.nickname(0),/original English species-name/);assert.equal(config.log.filter(row=>row[0]==='input').length,1);assert.equal(config.log.filter(row=>row[0]==='message').length,0);
 const hatch=fixture(),signal=new AbortController();hatch.control.input='😀';hatch.control.messageGate=deferred();const naming=hatch.hatchNickname({speciesName:'TOGEPI'},signal.signal);
 for(let i=0;i<20;i++)await Promise.resolve();signal.abort(new DOMException('hatch cancelled','AbortError'));hatch.control.messageGate.resolve();await assert.rejects(naming,/hatch cancelled/);assert.equal(hatch.log.filter(row=>row[0]==='input').length,1);
});
