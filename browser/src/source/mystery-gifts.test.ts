import {stripTypeScriptTypes} from 'node:module';
import {createHash} from 'node:crypto';
import {sampleUint32} from './native-rng.ts';
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {loadData,newState} from './data.ts';
import {sourceJSON,type SourceMap,type State} from './types.ts';
import {newMysteryGiftSave,ensureMysteryGiftSave,nextMysteryGift,MYSTERY_GIFT_SAVE_SIZE,validateMysteryGiftSave} from './mystery-gifts.ts';
import {ScriptVM,UnsupportedScript,type ScriptHooks} from './script.ts';
import {FieldObjects} from './objects.ts';
import {readMomSavings,type MomSavingsState} from './mom-savings.ts';
import {SourceActionRecovery,runRecoverableSourceAction} from './script-recovery.ts';

globalThis.fetch=async input=>{try{return new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));}catch{return new Response('',{status:404});}};
const data=await loadData(),c=data.constants,common=await sourceJSON<SourceMap>('scripts/0144.json');
const maps=await Promise.all(Object.keys(data.index.maps).map(id=>sourceJSON<SourceMap>(`maps/${id}.json`)));
const marts=maps.filter(map=>map.events.objects.some(object=>object.scriptId==='std_moms_gift_deliveryman'));
const state=():State&MomSavingsState=>Object.assign(newState(data,'Ethan','boy',()=>.5),{momSavings:{balance:2900,normalGiftsGiven:1,gifts:[{item:c.ITEM_SUPER_POTION,quantity:1}]},phoneTriggers:[12]});
function queue(value:State,index:number,tag:number){const bytes=value.mysteryGifts!.bytes,offset=0x100+index*0x104;bytes[offset]=tag&255;bytes[offset+1]=tag>>>8;}
function fixture(map=marts[0]){
  const value=state();value.map=map.id;const objects=new FieldObjects(data,value);objects.load(map.events.objects);objects.snapshot();const messages:string[]=[],control:{message?:(text:string)=>void|Promise<void>;refresh?:()=>void}={};
  const hooks:ScriptHooks={message:async text=>{messages.push(text);await control.message?.(text);},choice:async()=>assert.fail('no native delivery choice'),move:async()=>{},position(){},face(){},visible(){},chooseStarter:async()=>{},nickname:async()=>1,refresh:async()=>{objects.snapshot();control.refresh?.();},battle:async()=>assert.fail(),warp:async()=>assert.fail('delivery init never warps')};
  const vm=new ScriptVM(data,value,hooks),owner=new SourceActionRecovery(value,{capture:()=>objects.save(value.map),restore:async saved=>{objects.load(map.events.objects);objects.restore(value.map,saved);objects.snapshot();}});
  const run=(script:string|number,object='obj_player')=>owner.run(()=>vm.run(map,script,object));
  const init=()=>run(map.initScripts.OnTransition),mother=map.events.objects.find(object=>object.scriptId==='std_moms_gift_deliveryman')!,mystery=map.events.objects.find(object=>object.scriptId==='std_mystery_gift_deliveryman')!;
  return{value,objects,messages,control,vm,owner,run,init,mother,mystery,map};
}
function commands(instructions:SourceMap['scripts']['instructions']):SourceMap{return{...marts[0],code:'MG_ABI_FIXTURE',scripts:{entries:['start'],labels:{start:0},instructions:[...instructions,['End',[]]]}};}

test('new browser games get distinct exact native zero stores and only absent known browser-v2 saves migrate',()=>{
  const a=state(),b=state();assert.equal(MYSTERY_GIFT_SAVE_SIZE,0x1680);assert.equal(a.mysteryGifts!.bytes.length,5760);assert.ok(a.mysteryGifts!.bytes.every(byte=>byte===0));assert.notEqual(a.mysteryGifts,b.mysteryGifts);assert.notEqual(a.mysteryGifts!.bytes,b.mysteryGifts!.bytes);
  for(const enabled of[false,true]){const legacy=state();delete legacy.mysteryGifts;legacy.mysteryGiftEnabled=enabled;legacy.flags.FLAG_HIDE_MYSTERY_GIFT_DELIVERYMAN=false;const store=ensureMysteryGiftSave(legacy);assert.equal(nextMysteryGift(store),null);assert.equal(ensureMysteryGiftSave(legacy),store);assert.deepEqual(JSON.parse(JSON.stringify(legacy)).mysteryGifts,store);}
  for(const change of[(s:State)=>{(s as unknown as{version:number}).version=1;},(s:State)=>{delete(s as Partial<State>).boxes;},(s:State)=>{(s as unknown as{flags:unknown}).flags=[];}]){const value=state();delete value.mysteryGifts;change(value);const before=structuredClone(value);assert.throws(()=>ensureMysteryGiftSave(value),/provenance/);assert.deepEqual(value,before);}
});
test('all six exact historic browser-v2 constructors retain the required legacy fields and migrate without losing state',async()=>{
  const history=JSON.parse(await readFile(new URL('./fixtures/mystery-gift-legacy-v2.json',import.meta.url),'utf8')) as{entries:{commit:string;source:string;constructorSha256:string}[]};assert.equal(history.entries.length,6);
  for(const row of history.entries){assert.equal(createHash('sha256').update(row.source).digest('hex'),row.constructorSha256);
    // Execute the exact trusted Git fixture, with only type syntax removed.
    const plain=stripTypeScriptTypes(row.source.replace(/^export /,'')),build=new Function('sampleUint32',plain+';return newState;')(sampleUint32) as typeof newState;
    for(const gender of['boy','girl']as const){const legacy=build(data,'Ethan',gender,()=>.5),before=structuredClone(legacy);assert.equal(Object.hasOwn(legacy,'mysteryGifts'),false,row.commit);assert.equal(legacy.version,2);assert.ok(Array.isArray(legacy.boxes));assert.equal(legacy.gender,gender);assert.equal(legacy.options.battleStyle,'shift');ensureMysteryGiftSave(legacy);assert.equal(nextMysteryGift(legacy.mysteryGifts!),null);const{mysteryGifts:_,...retained}=legacy;assert.deepEqual(retained,before);}
  }
});
test('present malformed/unknown stores never turn into empty and every payload/history byte round trips',()=>{
  for(const bad of[null,undefined,{}, {format:'unknown',bytes:Array(5760).fill(0)},{format:'hgss-mystery-gift-v1',bytes:Array(5759).fill(0)},...[-1,256,.5,NaN].map(byte=>({format:'hgss-mystery-gift-v1',bytes:[byte,...Array(5759).fill(0)]}))]){const value=state();Object.assign(value,{mysteryGifts:bad});const before=structuredClone(value);assert.throws(()=>ensureMysteryGiftSave(value),/Mystery Gift save/);assert.deepEqual(value,before);}
  const sparse=newMysteryGiftSave();delete sparse.bytes[2];assert.throws(()=>validateMysteryGiftSave(sparse),/Malformed/);
  const value=state();value.mysteryGifts!.bytes=value.mysteryGifts!.bytes.map((_,i)=>(i*73+17)%256);const saved=JSON.parse(JSON.stringify(value));assert.deepEqual(ensureMysteryGiftSave(saved),value.mysteryGifts);assert.deepEqual(saved,value);assert.equal(nextMysteryGift(newMysteryGiftSave()),null);
  const cardsOnly=state();cardsOnly.mysteryGifts!.bytes[0x920]=3;cardsOnly.mysteryGifts!.bytes[0x1328]=1;cardsOnly.mysteryGifts!.bytes[0]=255;assert.equal(nextMysteryGift(cardsOnly.mysteryGifts!),null);
});
test('literal native first-valid tag ABI matches compiled original C across every slot and 16-bit boundary',async()=>{
  const native=await readFile(new URL('../../../src/mystery_gift.c',import.meta.url),'utf8'),header=await readFile(new URL('../../../include/mystery_gift.h',import.meta.url),'utf8'),save=await readFile(new URL('../../../src/save.c',import.meta.url),'utf8');
  assert.match(save,/MI_CpuClearFast\(ptr, headers\[i\]\.size\);\s*chunkHeaders\[i\]\.initFunc\(ptr\)/);assert.match(header,/MysteryGift gifts\[NUM_SAVED_MYSTERY_GIFTS\];\s*\/\/ 0100/);assert.match(header,/size = 0x1680/);
  const extract=(name:string)=>{const match=new RegExp('(?:^|\\n)[^\\n;{}]*\\b'+name+'\\([^;{}]*\\)\\s*\\{').exec(native);assert.ok(match,'literal native definition '+name);const start=match.index+Number(match[0].startsWith('\n')),begin=native.indexOf('{',start);let end=begin+1,depth=1;while(depth){if(native[end]==='{')depth++;if(native[end]==='}')depth--;end++;}return native.slice(native.lastIndexOf('\n',start)+1,end);};
  const code=`#include <stdint.h>\n#include <stdio.h>\n#include <stddef.h>\n#include <string.h>\ntypedef uint16_t u16;typedef uint32_t u32;typedef int BOOL;\n#define TRUE 1\n#define FALSE 0\n#define MG_TAG_INVALID 0\n#define MG_TAG_MAX 16\n#define NUM_SAVED_MYSTERY_GIFTS 8\n#define GF_ASSERT(x) ((void)0)\ntypedef union {uint8_t raw[256];uint32_t align;} MysteryGiftData;\n${header.slice(header.indexOf('typedef struct WonderCardInfo'),header.indexOf('// Save block API')).replace(/u8 /g,'uint8_t ').replace(/s32 /g,'int32_t ').replace(/NUM_MYSTERY_GIFT_RECV_FLAGS \/ 8/g,'256').replace(/NUM_SAVED_WONDER_CARDS/g,'3')}\nstatic MysteryGiftSave block,*sMysteryGiftSaveData=&block;\n${extract('MysteryGiftTagIsValid')}\n${extract('SaveMysteryGift_GetByIdx')}\n${extract('SaveMysteryGift_TagAtIndexIsValid')}\n${extract('SaveMGDataPtr_GetFirstGiftIndex')}\n${extract('SaveMGDataPtr_GetTagByIndex')}\nint main(void){_Static_assert(sizeof(MysteryGiftSave)==0x1680,"save size");_Static_assert(offsetof(MysteryGiftSave,gifts)==0x100,"gift offset");_Static_assert(sizeof(MysteryGift)==0x104,"gift size");_Static_assert(sizeof(WonderCard)==0x358,"card size");_Static_assert(offsetof(MysteryGiftSave,cards)==0x920,"cards offset");_Static_assert(offsetof(MysteryGiftSave,specialWonderCard)==0x1328,"special card offset");unsigned slot,tag;while(scanf("%u %u",&slot,&tag)==2){memset(&block,0,sizeof block);block.gifts[slot].tag=tag;int n=SaveMGDataPtr_GetFirstGiftIndex();printf("%d %u\\n",n,SaveMGDataPtr_GetTagByIndex(n));}return 0;}`;
  const dir=await mkdtemp(join(tmpdir(),'hg-mg-oracle-'));after(()=>rm(dir,{recursive:true,force:true}));await writeFile(join(dir,'oracle.c'),code);execFileSync('cc',['-std=c11',join(dir,'oracle.c'),'-o',join(dir,'oracle')]);
  const cases=Array.from({length:8},(_,slot)=>[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,255,256,65535].map(tag=>({slot,tag}))).flat(),actual=execFileSync(join(dir,'oracle'),{input:cases.map(({slot,tag})=>`${slot} ${tag}`).join('\n'),encoding:'utf8'}).trim().split('\n');
  cases.forEach(({slot,tag},i)=>{const value=state();queue(value,slot,tag);const result=nextMysteryGift(value.mysteryGifts!);assert.equal(`${result?.index??-1} ${result?.tag??0}`,actual[i]);});
  const value=state();queue(value,0,16);queue(value,6,1);queue(value,2,15);assert.deepEqual(nextMysteryGift(value.mysteryGifts!),{index:2,tag:15});
});

test('all sixteen original Mart OnTransition standards derive independent Mom-first and Mystery Gift visibility from actual stores',async()=>{
  assert.equal(marts.length,16);assert.equal(c.std_hide_show_deliverymen,10200);assert.equal(c.std_hide_show_deliverymen_2,10203);
  for(const map of marts)for(const hasMom of[false,true])for(const tag of[0,3]){const f=fixture(map);if(!hasMom)f.value.momSavings!.gifts=[];if(tag)queue(f.value,7,tag);const before=structuredClone(f.value.mysteryGifts);await f.init();assert.equal(f.objects.get(f.mother.id)!.visible,hasMom);assert.equal(f.objects.get(f.mystery.id)!.visible,!!tag);assert.equal(f.value.flags.FLAG_HIDE_MOM_GIFT_DELIVERYMAN,!hasMom);assert.equal(f.value.flags.FLAG_HIDE_MYSTERY_GIFT_DELIVERYMAN,!tag);assert.equal(f.vm.value('VAR_MYSTERY_GIFT_CHECK',map),Number(!!tag));assert.deepEqual(f.value.mysteryGifts,before);assert.equal(f.vm.lastUnsupported,null);if(map.id===530)assert.equal(f.vm.value('VAR_UNK_40E5',map),2);
    const order=common.scripts.instructions.slice(common.scripts.labels[common.scripts.entries[map.id===530?3:0]]).map(row=>row[0]);assert.ok(order.indexOf('MomGiftCheck')<order.indexOf('MysteryGift',1));
  }
});
test('real initialized Mart Mom delivery grants only acknowledged packages; empty/full/cancel/late failure and Retry preserve gift history',async()=>{
  for(const mode of['success','empty','full','cancel','late','retry']as const){const f=fixture();queue(f.value,3,3);f.value.mysteryGifts!.bytes[19]=193;if(mode==='empty')f.value.momSavings!.gifts=[];await f.init();if(mode==='full')f.value.bag.ITEM_SUPER_POTION=999;const before=structuredClone(f.value),savedActors=f.objects.save(f.value.map);let failed=false;
    f.control.message=()=>{if(!failed&&f.value.bag.ITEM_SUPER_POTION===1&&['cancel','late','retry'].includes(mode)){failed=true;if(mode==='cancel')f.vm.cancel();else throw Error('late native acknowledgement');}};
    const action=()=>f.vm.run(f.map,f.mother.scriptId,f.mother.id);
    if(mode==='retry'){const result=await runRecoverableSourceAction(f.owner,action,{failed:async()=> 'retry',recoveryFailed:async e=>{throw e;},retry(){},committed(){}});assert.equal(result.ok,true);}
    else if(mode==='cancel'||mode==='late'){await assert.rejects(f.owner.run(action));assert.deepEqual(f.value,before);assert.deepEqual(f.objects.save(f.value.map),savedActors);continue;}
    else await f.owner.run(action);
    assert.deepEqual(f.value.mysteryGifts,before.mysteryGifts);if(mode==='success'||mode==='retry'){assert.equal(f.value.bag.ITEM_SUPER_POTION,1);assert.equal(readMomSavings(f.value).gifts.length,0);await f.init();assert.equal(f.objects.get(f.mother.id)!.visible,false);assert.equal(f.objects.get(f.mystery.id)!.visible,true);}else{assert.deepEqual(f.value.bag,before.bag);assert.deepEqual(readMomSavings(f.value),readMomSavings(before));}
  }
});
test('empty Mystery Gift dialogue works; real queued gift remains explicit Unsupported and unconsumed through Return/Retry',async()=>{
  const empty=fixture();await empty.init();await empty.run(empty.mystery.scriptId,empty.mystery.id);assert.equal(empty.messages.at(-1),empty.vm.text('msg_0209_00003',common));assert.equal(empty.vm.lastUnsupported,null);
  const f=fixture();queue(f.value,0,3);await f.init();const before=structuredClone(f.value);let attempts=0;
  const result=await runRecoverableSourceAction(f.owner,async()=>{attempts++;await f.vm.run(f.map,f.mystery.scriptId,f.mystery.id);},{failed:async error=>{assert.ok(error instanceof UnsupportedScript);assert.equal(error.command,'MysteryGift');assert.deepEqual(f.value,before);return attempts===1?'retry':'return';},recoveryFailed:async e=>{throw e;},retry(){},committed(){}});assert.equal(result.ok,false);assert.equal(attempts,2);assert.deepEqual(f.value,before);
});
test('raw selector is never VAR-dereferenced, query outputs are native, NopVar490 preserves its variable and session never leaks after error/cancel',async()=>{
  const value=state();queue(value,4,15);const vm=new ScriptVM(data,value,fixture().vm.hooks);
  const map=commands([['SetVar',['VAR_TEMP_x4000','99']],['MysteryGift',['SCR_MG_BEGIN']],['MysteryGift',['SCR_MG_HAS_GIFT','VAR_SPECIAL_x8004']],['MysteryGift',['SCR_MG_GET_TYPE','VAR_SPECIAL_x8005']],['NopVar490',['VAR_TEMP_x4000']],['MysteryGift',['SCR_MG_END2']]]);
  await vm.run(map,1);assert.equal(vm.value('VAR_TEMP_x4000',map),99);assert.equal(vm.value('VAR_SPECIAL_x8004',map),1);assert.equal(vm.value('VAR_SPECIAL_x8005',map),15);
  for(const end of['SCR_MG_END','SCR_MG_END2'])await assert.rejects(vm.run(commands([['MysteryGift',['SCR_MG_BEGIN']],['MysteryGift',[end]],['MysteryGift',['SCR_MG_HAS_GIFT','VAR_SPECIAL_x8004']]]),1),/without native BEGIN/);
  const bad=commands([['SetVar',['VAR_TEMP_x4000','0']],['MysteryGift',['VAR_TEMP_x4000']]]);await assert.rejects(vm.run(bad,1),e=>e instanceof UnsupportedScript&&e.command==='MysteryGift');
  await assert.rejects(vm.run(commands([['MysteryGift',['SCR_MG_BEGIN']],['UnportedFixture',[]]]),1),UnsupportedScript);assert.equal((vm as unknown as{mysteryGiftSession:{save:unknown}}).mysteryGiftSession.save,null,'failed run releases its pointer before any new root run');await assert.rejects(vm.run(commands([['MysteryGift',['SCR_MG_HAS_GIFT','VAR_SPECIAL_x8004']]]),1),/without native BEGIN/);
  const cancel=commands([['MysteryGift',['SCR_MG_BEGIN']],['Message',['cancel']],['MysteryGift',['SCR_MG_GET_TYPE','VAR_SPECIAL_x8004']]]);vm.hooks.message=async()=>vm.cancel();await assert.rejects(vm.run(cancel,1));assert.equal((vm as unknown as{mysteryGiftSession:{save:unknown}}).mysteryGiftSession.save,null,'cancelled run releases its pointer before any new root run');await assert.rejects(vm.run(commands([['MysteryGift',['SCR_MG_GET_TYPE','VAR_SPECIAL_x8004']]]),1),/without native BEGIN/);
});
test('failed Mart migration/init refresh restores the original absent legacy store and actual actor snapshot',async()=>{
  const f=fixture();delete f.value.mysteryGifts;const before=structuredClone(f.value),actors=f.objects.save(f.value.map);f.control.refresh=()=>{throw Error('init renderer failure');};await assert.rejects(f.init(),/init renderer failure/);assert.deepEqual(f.value,before);assert.deepEqual(f.objects.save(f.value.map),actors);assert.equal(Object.hasOwn(f.value,'mysteryGifts'),false);f.control.refresh=undefined;await f.init();assert.equal(nextMysteryGift(f.value.mysteryGifts!),null);
});
