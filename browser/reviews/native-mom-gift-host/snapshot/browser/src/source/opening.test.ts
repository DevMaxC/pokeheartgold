import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openingName,openingText,oakGreetingMessage,runOakIntroduction,runOpeningSession,validOpeningName,type OpeningPort,type OpeningEffect,type OpeningScene} from './opening.ts';
const messages=JSON.parse(await readFile(new URL('../../public/source/intro-messages.json',import.meta.url),'utf8')).msg_0219;
const defaultNames=JSON.parse(await readFile(new URL('../../public/source/messages/254.json',import.meta.url),'utf8'));
const data={messages,defaultNames};
const message=(id:number,name='')=>openingText(messages,id,name);
function fixture(answers:number[]=[2,0,0,0],names:string[]=['Case']){
 const trace:{kind:string;value:unknown}[]=[],questions:{prompt:string;choices:string[];initial:number}[]=[],queue=[...answers],input=[...names];
 const port:OpeningPort={scene:(s:OpeningScene)=>trace.push({kind:'scene',value:s}),message:async text=>{trace.push({kind:'message',value:text});},choose:async(prompt,choices,initial=0)=>{questions.push({prompt,choices,initial});assert.ok(queue.length,'unexpected extra prompt '+prompt);const value=queue.shift()!;assert.ok(value<choices.length);return value;},name:async(prompt,maximum)=>{assert.equal(prompt,message(40));assert.equal(maximum,7);assert.ok(input.length);return input.shift()!;},effect:async(effect:OpeningEffect,gender)=>{trace.push({kind:'effect',value:{effect,gender}});}};
 return{port,trace,questions,queue,input};
}
const at=(h:number,m=0)=>()=>new Date(2026,9,16,h,m);
test('native no-information path orders the greeting, Oak, Marill demonstration, identity and final shrink before returning a draft',async()=>{
 const f=fixture(),result=await runOakIntroduction(data,f.port,{now:at(16),random:()=>0});assert.deepEqual(result,{name:'Case',gender:'boy'});assert.equal(f.queue.length,0);
 assert.deepEqual(f.trace.filter(e=>e.kind==='message').map(e=>e.value),[7,3,6,34,35,36,37,43].map(i=>message(i,i===43?'Case':'')));
 assert.deepEqual(f.trace.filter(e=>e.kind==='effect').map(e=>(e.value as{effect:string}).effect),['oak-right','ball-flash','marill-appear','marill-cry','marill-hide','oak-left','player-shrink']);
 assert.equal(f.questions[2].prompt,message(38));assert.equal(f.questions[3].prompt,message(41,'Case'));assert.ok(!JSON.stringify(f.trace).includes('STRVAR'));assert.ok(!JSON.stringify(f.questions).includes('YESNO'));
});
test('Control Info No repeats its lessons, Yes returns to topics, and Adventure Info also returns before the main introduction',async()=>{
 const f=fixture([0,0,1,0,0,1,2,0,0,0]);await runOakIntroduction(data,f.port,{now:at(4)});
 const actual=f.trace.filter(e=>e.kind==='message').map(e=>e.value),control=[9,10,11,12,23,13,14,15,16,17].map(i=>message(i));
 assert.deepEqual(actual.slice(0,21),[message(7),...control,...control]);assert.deepEqual(actual.slice(21,29),[7,28,29,30,31,32,33,7].map(i=>message(i)));assert.equal(actual.filter(t=>t===message(6)).length,1);
 assert.equal(f.questions.filter(q=>q.prompt===message(26)).length,2);assert.deepEqual(f.questions.find(q=>q.prompt===message(26))!.choices,['Yes','No']);assert.equal(f.questions.filter(q=>q.choices.includes(message(44))).length,3);assert.equal(f.queue.length,0);
});
test('gender rejection and name rejection return to character selection with the native remembered cursor',async()=>{
 const f=fixture([2,0,1,1,0,1,0,0,0],['Alice','Case']),result=await runOakIntroduction(data,f.port,{now:at(20)});assert.deepEqual(result,{name:'Case',gender:'boy'});
 const selections=f.questions.filter(q=>q.choices.join(',')==='Boy,Girl');assert.deepEqual(selections.map(q=>q.initial),[0,0,1]);assert.equal(f.questions.filter(q=>q.prompt===message(39)).length,1);assert.equal(f.questions.filter(q=>q.prompt===message(42,'Alice')).length,1);
 assert.equal(f.trace.filter(e=>e.kind==='message'&&e.value===message(37)).length,3);assert.equal(f.input.length,0);assert.equal(f.queue.length,0);
});
test('blank names use the actual18-choice HG pools, custom names preserve case/meaningful spaces and have the native seven-character limit',()=>{
 for(const gender of['boy','girl']as const)for(let i=0;i<18;i++)assert.equal(openingName('   ',gender,defaultNames,()=>i/18),defaultNames[String(i+(gender==='boy'?0:18))]);
 assert.equal(openingName('', 'boy',defaultNames,()=>0),'Heart');assert.equal(openingName('', 'girl',defaultNames,()=>1/18),'Karla');assert.equal(openingName(' Abc ', 'boy',defaultNames),' Abc ');assert.equal(openingName('Abc01234','boy',defaultNames),'Abc0123');assert.equal(openingName("O'Neill",'boy',defaultNames),'O’Neill');assert.equal(validOpeningName('A♀★'),true);assert.equal(validOpeningName('😀'),false);assert.throws(()=>openingName('😀','boy',defaultNames));
});
test('Oak greeting uses all five exact source RTC windows rather than the different field clock',()=>{
 const cases:[[number,number],number][]=[[[0,0],5],[[3,59],5],[[4,0],1],[[10,59],1],[[11,0],2],[[15,59],2],[[16,0],3],[[18,59],3],[[19,0],4],[[23,59],4]];
 for(const[[h,m],expected]of cases)assert.equal(oakGreetingMessage(h,m),expected);for(let h=0;h<24;h++)for(let m=0;m<60;m++)assert.ok(oakGreetingMessage(h,m)>=1&&oakGreetingMessage(h,m)<=5);assert.throws(()=>oakGreetingMessage(24));
});
test('the demonstration is an awaited effect and cannot start identity or return a completed draft while its reveal is pending',async()=>{
 const f=fixture(),normal=f.port.effect;let release:()=>void=()=>{throw Error('not reached');},waiting=false;f.port.effect=async(effect,gender)=>{await normal(effect,gender);if(effect==='marill-cry'){waiting=true;await new Promise<void>(resolve=>release=resolve);}};
 let returned=false;const pending=runOakIntroduction(data,f.port,{now:at(12)}).then(value=>{returned=true;return value;});await new Promise(resolve=>setTimeout(resolve,0));assert.equal(waiting,true);assert.equal(returned,false);assert.ok(!f.trace.some(e=>e.kind==='message'&&e.value===message(35)));release();assert.equal((await pending).name,'Case');
});
test('existing-save Continue and replacement cancellation preserve the actual supplied state and never construct a new adventure',async()=>{
 const saved={name:'Existing',party:[{species:155}],bag:{ITEM_POTION:3}},before=structuredClone(saved),f=fixture([1,0,0]);let created=0;f.port.prepare=async()=>{throw Error('Continue must not load demonstration assets');};
 const result=await runOpeningSession(saved,async()=>{throw Error('Continue must not load default names');},f.port,()=>{created++;return saved;},{'0':'CONTINUE','1':'NEW GAME'},'Existing');assert.equal(result,saved);assert.deepEqual(saved,before);assert.equal(created,0);assert.equal(f.trace.length,0);assert.equal(f.queue.length,0);
});
test('replacement constructs one new state only after all accepted identity and final shrink effects complete',async()=>{
 const saved={name:'Existing',gender:'girl'},before=structuredClone(saved),f=fixture([1,1,2,0,0,0],['Case']);let created=0;const result=await runOpeningSession(saved,data,f.port,identity=>{created++;assert.deepEqual(f.trace.at(-1),{kind:'effect',value:{effect:'player-shrink',gender:'boy'}});return identity;},{'0':'CONTINUE','1':'NEW GAME'},'',{now:at(8)});assert.equal(created,1);assert.deepEqual(result,{name:'Case',gender:'boy'});assert.deepEqual(saved,before);
});
test('incomplete native dialogue fails visibly instead of inventing substitute messages',async()=>{
 assert.throws(()=>openingText({},6),/Missing original/);const bad={...data,messages:{...messages,msg_0219_00034:null}};await assert.rejects(runOakIntroduction(bad,fixture().port,{now:at(8)}),/Missing original/);
});

test('a rejected introduction asset request cannot cross the saved-game replacement gateway',async()=>{
 const saved={name:'Keep me',bag:{ITEM_POTION:2}},before=structuredClone(saved),f=fixture([1,1]);let constructed=0;f.port.prepare=async()=>{throw Error('offline asset');};await assert.rejects(runOpeningSession(saved,data,f.port,()=>{constructed++;return saved;},{'0':'CONTINUE','1':'NEW GAME'}),/offline asset/);assert.equal(constructed,0);assert.deepEqual(saved,before);
});
test('leaving or failing during the final shrink keeps the previous save resumable and never constructs the replacement early',async()=>{
 const saved={name:'Existing',party:[155]},before=structuredClone(saved),f=fixture([1,1,2,0,0,0],['New']);let constructed=0,release:()=>void=()=>{throw Error('not shrinking');};let shrinking=false;
 f.port.effect=async(effect)=>{if(effect==='player-shrink'){shrinking=true;await new Promise<void>(resolve=>release=resolve);}};
 const pending=runOpeningSession(saved,data,f.port,identity=>{constructed++;return{...saved,name:identity.name};},{'0':'CONTINUE','1':'NEW GAME'},'',{now:at(8)});await new Promise(resolve=>setTimeout(resolve,0));assert.equal(shrinking,true);assert.equal(constructed,0);assert.deepEqual(saved,before);
 // A new startup while this uncommitted draft is pending resumes the same
 // persisted object, without requiring any of the abandoned intro resources.
 const reload=fixture([0]);assert.equal(await runOpeningSession(saved,async()=>{throw Error('unneeded');},reload.port,()=>{throw Error('must not create');},{'0':'CONTINUE','1':'NEW GAME'}),saved);
 release();assert.equal((await pending).name,'New');assert.equal(constructed,1);assert.deepEqual(saved,before);
 const failed=fixture([1,1,2,0,0,0],['New']);failed.port.effect=async(effect)=>{if(effect==='player-shrink')throw Error('interrupted shrink');};await assert.rejects(runOpeningSession(saved,data,failed.port,()=>{throw Error('must not construct');},{'0':'CONTINUE','1':'NEW GAME'},'',{now:at(8)}),/interrupted shrink/);assert.deepEqual(saved,before);
});
