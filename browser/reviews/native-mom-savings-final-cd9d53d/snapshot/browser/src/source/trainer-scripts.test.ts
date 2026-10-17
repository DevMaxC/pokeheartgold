import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData,newState,createMon} from './data.ts';
import {ScriptVM,UnsupportedScript,type ScriptHooks,type TrainerApproachContext} from './script.ts';
import {sourceJSON,type SourceMap} from './types.ts';
import {trainerIdForScript,trainerDefeated,setTrainerDefeated,trainerContacts,phoneRematchTrainer,TRAINER_FLAG_BASE} from './trainer-script-state.ts';

// Real map, trainer, phone, message and COMMON_0953 exports; no replacement script.
globalThis.fetch=async input=>{try{return new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));}catch{return new Response('',{status:404});}};
const data=await loadData();
async function fixture(mapId=35,trainer='TRAINER_BUG_CATCHER_WADE',partner=false){
 const map=await sourceJSON<SourceMap>(`maps/${mapId}.json`),npc=map.events.objects.find(n=>String(n.scriptId)===`std_trainer${partner?'_2':''}(${trainer})`)!;assert.ok(npc);
 const state=newState(data,'Ethan','boy');state.map=mapId;state.x=npc.x+.5;state.z=npc.z+1.5;state.party=[createMon(data,155,8,state.name,()=>.5),createMon(data,16,6,state.name,()=>.5)];
 const messages:string[]=[],battles:{id:number;options:Parameters<ScriptHooks['battle']>[1]}[]=[],moves=new Map(map.events.objects.map(n=>[n.id,n.movement])),faces=new Map(map.events.objects.map(n=>[n.id,n.facingDirection]));let won=true,choice=0,whiteouts=0;
 const hooks:ScriptHooks={message:async text=>{messages.push(text);},choice:async()=>choice,move:async()=>{},position:()=>{},face:id=>{faces.set(id,1);},visible:()=>{},chooseStarter:async()=>{},nickname:async()=>{},refresh:async()=>{},battle:async(id,options)=>{battles.push({id,options});return won;},warp:async()=>{},whiteOut:async()=>{whiteouts++;},objectMovement:(id,next)=>{if(next!==undefined)moves.set(id,next);return moves.get(id)??0;},objectFacing:id=>faces.get(id)??0,followerActive:()=>true,trainerPath:async()=>{},trainerStep:async()=>true};
 const vm=new ScriptVM(data,state,hooks);return{map,npc,state,messages,battles,moves,hooks,vm,run:()=>vm.run(map,npc.scriptId,npc.id),win:(value:boolean)=>{won=value;},choose:(value:number)=>{choice=value;},whiteouts:()=>whiteouts};
}
test('native trainer script banks decode the same trainer and reject ordinary scripts/approach',()=>{
 assert.equal(trainerIdForScript(3003),4);assert.equal(trainerIdForScript(5003),4);for(const id of[1,2033,2999,3739,4999,5739,9000])assert.equal(trainerIdForScript(id),null);
});
test('manual Wade introduction, win and phone acceptance run the actual shared trainer script',async()=>{
 const f=await fixture();await f.run();assert.equal(f.vm.lastUnsupported,null);assert.deepEqual(f.battles,[{id:4,options:{second:0,canLose:false,suppressFollower:false}}]);
 assert.ok(f.messages[0].includes('I caught a bunch'));assert.ok(f.messages.some(text=>text.includes('Could I get your phone number?')));assert.ok(f.messages.at(-1)?.includes('You’ll hear from me'));
 assert.equal(trainerDefeated(f.state,4),true);assert.equal(f.state.flags['#'+(TRAINER_FLAG_BASE+4)],true);assert.deepEqual(f.state.pokegear?.contacts,['PHONE_CONTACT_WADE']);assert.equal(f.state.vars.VAR_SPECIAL_LAST_TALKED,f.map.constants[f.npc.id]);assert.equal(f.moves.get(f.npc.id),15);
 assert.ok(!f.messages.join('').includes('VAR_TEMP'));assert.ok(!f.messages.join('').includes('\\\n'),'doubly escaped trainer line breaks normalize before rendering');
});
test('defeated Wade gives source after-battle dialogue and never fights again without a rematch',async()=>{
 const f=await fixture();await f.run();f.messages.length=0;await f.run();assert.equal(f.battles.length,1);assert.ok(f.messages.join('').includes('it’ll go to your Box'));assert.ok(!f.messages.join('').includes('Could I get your phone number?'));
});
test('phone refusal is respected and a later conversation uses the native second offer',async()=>{
 const f=await fixture();f.choose(1);await f.run();assert.equal(trainerDefeated(f.state,4),true);assert.deepEqual(f.state.pokegear?.contacts??[],[]);assert.ok(f.messages.at(-1)?.includes('Don’t be shy'));
 f.messages.length=0;f.choose(0);await f.run();assert.equal(f.battles.length,1);assert.ok(f.messages[0].startsWith('When I’m in the tall grass'));assert.deepEqual(f.state.pokegear?.contacts,['PHONE_CONTACT_WADE']);
});
test('loss calls whiteout without defeating the trainer or offering a phone number',async()=>{
 const f=await fixture();f.win(false);await f.run();assert.equal(f.whiteouts(),1);assert.equal(trainerDefeated(f.state,4),false);assert.equal(f.state.pokegear,undefined);assert.equal(f.messages.length,1);assert.equal(f.state.vars.VAR_BATTLE_RESULT,2);
});
test('failed battle host work cannot advance source victory flags',async()=>{
 const f=await fixture();f.hooks.battle=async()=>{throw Error('Battle aborted');};await assert.rejects(f.run(),/Battle aborted/);assert.equal(trainerDefeated(f.state,4),false);assert.equal(f.state.pokegear,undefined);assert.equal(f.vm.busy,false);
});
test('Sprout Tower sage and both Violet Gym trainers complete their non-phone standard paths',async()=>{
 for(const[map,id]of[[155,'TRAINER_SAGE_NICO'],[135,'TRAINER_BIRD_KEEPER_GS_ABE'],[135,'TRAINER_BIRD_KEEPER_GS_ROD']]as const){const f=await fixture(map,id);await f.run();assert.equal(f.battles[0].id,data.constants[id]);assert.equal(trainerDefeated(f.state,data.constants[id]),true);assert.equal(f.state.vars.VAR_TEMP_x4010,255);assert.equal(f.state.pokegear,undefined);await f.run();assert.equal(f.battles.length,1);assert.ok(f.messages.length>=2);}
});
test('both native double-trainer partners reject one usable Pokémon with their own message',async()=>{
 for(const partner of[false,true]){const f=await fixture(180,'TRAINER_TWINS_AMY_AND_MIMI',partner);f.state.party.splice(1);await f.run();assert.equal(f.battles.length,0);assert.equal(trainerDefeated(f.state,10),false);assert.ok(f.messages[0].startsWith(partner?'Mimi:':'Amy:'));assert.ok(f.messages[0].includes('only one Pokémon'));}
});
test('double-trainer partner banks retain the proper intro/after message and shared defeat flag',async()=>{
 const f=await fixture(180,'TRAINER_TWINS_AMY_AND_MIMI',true);await f.run();assert.ok(f.messages[0].startsWith('Mimi: If you insist'));assert.equal(f.battles[0].id,10);assert.equal(trainerDefeated(f.state,10),true);await f.run();assert.ok(f.messages.at(-1)?.startsWith('Mimi: Our bug Pokémon lost'));assert.equal(f.battles.length,1);const twins=f.map.events.objects.filter(n=>String(n.scriptId).includes('TRAINER_TWINS_AMY_AND_MIMI'));assert.ok(twins.every(n=>f.moves.get(n.id)===15));
});
test('trainer movement mutation is an explicit field host contract',async()=>{
 const f=await fixture();delete f.hooks.objectMovement;await assert.rejects(f.run(),UnsupportedScript);assert.equal(f.vm.lastUnsupported?.command,'SetLastTalkedTrainerMovement');assert.equal(f.battles.length,0);assert.equal(trainerDefeated(f.state,4),false);
});
test('hidden-trainer reveal movement resolves last-talked identity in the originating map, not the common bank',async()=>{
 const f=await fixture(),revealed:string[]=[];f.moves.set(f.npc.id,51);f.hooks.move=async object=>{revealed.push(object);};await f.run();assert.deepEqual(revealed,[f.npc.id]);assert.equal(f.battles[0].id,4);assert.equal(trainerDefeated(f.state,4),true);
});
test('native explicit trainer flag branches, clearing, and boolean comparison retain source semantics',async()=>{
 const f=await fixture();f.map.scripts={entries:['start'],labels:{start:0,defeated:5,cleared:9},instructions:[['SetTrainerFlag',['TRAINER_BUG_CATCHER_WADE']],['CheckTrainerFlag',['TRAINER_BUG_CATCHER_WADE']],['GoToIf',['TRUE','defeated']],['SetFlag',['WRONG_BRANCH']],['End',[]],['ClearTrainerFlag',['TRAINER_BUG_CATCHER_WADE']],['GoToIfNotDefeated',['TRAINER_BUG_CATCHER_WADE','cleared']],['SetFlag',['WRONG_BRANCH']],['End',[]],['SetFlag',['CORRECT_BRANCH']],['End',[]]]};await f.vm.run(f.map,1,f.npc.id);assert.equal(f.state.flags.CORRECT_BRANCH,true);assert.equal(f.state.flags.WRONG_BRANCH,undefined);assert.equal(trainerDefeated(f.state,4),false);
});
test('last-interacted flag commands use the native object event identity rather than substituting its trainer number',async()=>{
 const f=await fixture(),id=f.map.constants[f.npc.id];assert.notEqual(id,4);f.map.scripts={entries:['start'],labels:{start:0,done:4},instructions:[['SetLastInteractedTrainerFlag',[]],['GoToIfTrainerDefeated',['done']],['SetFlag',['WRONG_BRANCH']],['End',[]],['End',[]]]};await f.vm.run(f.map,1,f.npc.id);assert.equal(trainerDefeated(f.state,id),true);assert.equal(trainerDefeated(f.state,4),false);assert.equal(f.state.flags.WRONG_BRANCH,undefined);
});
test('native phone contacts, gifts and rematch order come from the source tables',async()=>{
 const book=await trainerContacts(),f=await fixture();assert.equal(book.contacts.length,75);assert.deepEqual(book.contacts[13],{id:13,key:'PHONE_CONTACT_WADE',trainer:4,gift:data.constants.ITEM_NONE,messageBank:684});assert.equal(book.rematchSets.length,63);
 f.state.trainerPhone={seeking:[13],gifts:{}};setTrainerDefeated(f.state,4);assert.equal(phoneRematchTrainer(data,f.state,book,13,1),4,'locked rematch group falls back one native group');f.state.flags.FLAG_UNK_97D=true;assert.equal(phoneRematchTrainer(data,f.state,book,13,1),data.constants.TRAINER_BUG_CATCHER_WADE_3);f.state.trainerPhone.seeking=[];assert.equal(phoneRematchTrainer(data,f.state,book,13,1),0);
});
test('a queued native phone gift is consumed once and delivered through the source item script',async()=>{
 const f=await fixture();setTrainerDefeated(f.state,4);f.state.pokegear={contacts:['PHONE_CONTACT_WADE'],cards:[]};f.state.trainerPhone={seeking:[],gifts:{13:data.constants.ITEM_ORAN_BERRY}};await f.run();assert.equal(f.battles.length,0);assert.equal(f.state.bag.ITEM_ORAN_BERRY,1);assert.equal(f.state.trainerPhone.gifts[13],undefined);await f.run();assert.equal(f.state.bag.ITEM_ORAN_BERRY,1);
});
test('an unlocked requested rematch keeps the original trainer context while flagging the new team',async()=>{
 const f=await fixture(),rematch=data.constants.TRAINER_BUG_CATCHER_WADE_3;setTrainerDefeated(f.state,4);f.state.flags.FLAG_UNK_97D=true;f.state.pokegear={contacts:['PHONE_CONTACT_WADE'],cards:[]};f.state.trainerPhone={seeking:[13],gifts:{}};await f.run();assert.equal(f.battles[0].id,rematch);assert.ok(f.messages[0].includes('I was waiting for you'));assert.equal(trainerDefeated(f.state,4),true);assert.equal(trainerDefeated(f.state,rematch),true);assert.deepEqual(f.state.trainerPhone.seeking,[]);await f.run();assert.equal(f.battles.length,1);
});
test('sight approach consumes explicit field context and awaits the supplied trainer path',async()=>{
 const f=await fixture(),steps:string[]=[];f.hooks.trainerPath=async(index,t)=>{steps.push(`path:${index}:${t.object}`);};f.hooks.trainerStep=async(index,t)=>{steps.push(`step:${index}:${t.trainer}`);return true;};const context:TrainerApproachContext={eyeType:0,trainers:[{trainer:4,object:f.npc.id}]};await f.vm.runTrainerApproach(f.map,context);assert.deepEqual(steps,[`path:0:${f.npc.id}`,'step:0:4']);assert.equal(f.battles[0].id,4);assert.equal(trainerDefeated(f.state,4),true);assert.deepEqual(f.state.pokegear?.contacts,['PHONE_CONTACT_WADE']);
});
test('approach cannot pretend pathfinding or follower state is implemented without its host hooks',async()=>{
 const f=await fixture();delete f.hooks.trainerPath;await assert.rejects(f.vm.runTrainerApproach(f.map,{eyeType:0,trainers:[{trainer:4,object:f.npc.id}]}),UnsupportedScript);assert.equal(f.vm.lastUnsupported?.command,'GetTrainerPathToPlayer');assert.equal(f.battles.length,0);assert.equal(trainerDefeated(f.state,4),false);
});
test('approach context rejects a mismatched source trainer before executing commands',async()=>{
 const f=await fixture();await assert.rejects(f.vm.runTrainerApproach(f.map,{eyeType:0,trainers:[{trainer:51,object:f.npc.id}]}),/Invalid native/);assert.equal(f.messages.length,0);assert.equal(f.battles.length,0);assert.equal(f.vm.busy,false);
});
test('the Morty candle operation remains explicit while source guarded no-ops work elsewhere',async()=>{
 const map=await sourceJSON<SourceMap>('maps/80.json'),f=await fixture();map.scripts={entries:['start'],labels:{start:0},instructions:[['EcruteakGymExtinguishCandle',['1']],['SetFlag',['SHOULD_NOT_ADVANCE']],['End',[]]]};await assert.rejects(f.vm.run(map,1),UnsupportedScript);assert.equal(f.state.flags.SHOULD_NOT_ADVANCE,undefined);let action='';f.hooks.trainerCandle=(next,last)=>{action=next+':'+last;};await f.vm.run(map,1);assert.equal(action,'extinguish:true');
});
