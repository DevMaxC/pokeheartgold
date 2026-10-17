import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {planRandomIncomingCall,type PhoneAdmissionRules} from './phone-random.ts';
import {advancePhoneMinutes,boostPhoneTimer,newPhoneRingState,launchIncomingCall} from './phone-scheduler.ts';
import type {State} from './types.ts';

const rules=JSON.parse(await readFile(new URL('../../public/source/phone-triggers.json',import.meta.url),'utf8'))as PhoneAdmissionRules&{sourceSha256:Record<string,string>};
const ready=()=>advancePhoneMinutes(boostPhoneTimer(newPhoneRingState(),true,rules),1);
function state(ids:number[]=[]){return{pokegear:{contacts:ids.map(id=>rules.randomCallers.find(row=>row.id===id)!.key),cards:[]},flags:{},vars:{}}as Pick<State,'pokegear'|'flags'|'vars'|'phoneRecentCallers'>;}
function ports(lc=0,mt=[0,0],map=60,rtcHour=9){const draws:string[]=[],values=[...mt];return{draws,map,rtcHour,drawLCUint16:()=>{draws.push('LC');return lc;},drawMTUint32:()=>{draws.push('MT');assert.ok(values.length,'unexpected extra MT draw');return values.shift()!;}};}

test('random admission exports all75 exact native book IDs/types/groups/maps, literal recent chunks and pinned sources',async()=>{
  const book=JSON.parse(await readFile(new URL('../../../files/tel/pmtel_book.json',import.meta.url),'utf8')).pmtel_book,constants=JSON.parse(await readFile(new URL('../../public/source/constants.json',import.meta.url),'utf8'));
  assert.equal(rules.randomCallChance,50);assert.equal(rules.randomCallers.length,75);assert.deepEqual(rules.randomCallers,book.map((row:any)=>({id:constants[row.id],key:row.id,type:row.type,group:row.unkF,map:constants[row.mapId]})));
  assert.deepEqual(rules.recentCallerChunks,[{offset:0,length:4},{offset:4,length:2},{offset:6,length:2}]);assert.deepEqual(rules.randomRestrictions,{buenaContact:8,nationalParkMap:96,rocketTakeoverVar:0x4077,bugContestFlag:0x996});
  for(const[path,hash]of Object.entries(rules.sourceSha256))assert.equal(createHash('sha256').update(await readFile(new URL('../../../'+path,import.meta.url))).digest('hex'),hash,path);
});

test('native chance rejects strictly above50 without LC or caller selection; accepted empty category resets after one LC',()=>{
  const s=state([0,1,2]),reject=ports(0,[51]);assert.equal(planRandomIncomingCall(s,ready(),rules,reject).outcome,'chance-rejected');assert.deepEqual(reject.draws,['MT']);
  const accept=ports(0,[50]),plan=planRandomIncomingCall(s,ready(),rules,accept);assert.equal(plan.outcome,'no-candidates');assert.equal(plan.ring.elapsedMinutes,0);assert.deepEqual(accept.draws,['MT','LC']);assert.equal(s.phoneRecentCallers,undefined);
});

test('LC modulo1000 thresholds499/500/799/800 determine random category, independent of current clock hour',()=>{
  for(const[lc,category,caller]of[[499,0,4],[500,1,10],[799,1,10],[800,2,13],[1000,0,4],[65535,1,10]]){
    const p=ports(lc,[0,0],60,23),plan=planRandomIncomingCall(state([4,10,13]),ready(),rules,p);assert.equal(plan.call?.category,category);assert.equal(plan.call?.contact,caller);assert.deepEqual(p.draws,['MT','LC','MT']);
  }
});

test('random caller pick preserves registered order and native MT modulo(numCallers*100)/100 weighting',()=>{
  const s=state([20,4,11]),p=ports(0,[0,250]),plan=planRandomIncomingCall(s,ready(),rules,p);assert.equal(plan.call?.contact,11);assert.equal(plan.call?.candidateCount,3);assert.equal(plan.call?.scripted,0);assert.equal(plan.ring.activeSince,null);assert.equal(plan.ring.elapsedMinutes,10);assert.equal(s.phoneRecentCallers,undefined,'unanswered selection never adds recent history');
  const pending={phoneTriggers:[0]};assert.throws(()=>launchIncomingCall(pending,plan.ring),/random incoming phone delivery is unported/);assert.deepEqual(pending.phoneTriggers,[0]);
});

test('the native eligible caller families include type14 Irwin and exclude type6 Kenji despite registration',()=>{
  const s=state([16,25]);assert.equal(rules.randomCallers.find(row=>row.id===16)!.type,6);assert.equal(rules.randomCallers.find(row=>row.id===25)!.type,14);const plan=planRandomIncomingCall(s,ready(),rules,ports());assert.equal(plan.call?.contact,25);assert.equal(plan.call?.candidateCount,1);
});

test('map and recent exclusions preserve the original category candidate count in the selected token',()=>{
  const s=state([4,11,19]);s.phoneRecentCallers=[11,255,255,255,255,255,255,255];const plan=planRandomIncomingCall(s,ready(),rules,ports(0,[0,0],384));assert.equal(plan.call?.contact,19);assert.equal(plan.call?.candidateCount,3);assert.deepEqual(s.phoneRecentCallers,[11,255,255,255,255,255,255,255]);
});

test('full recent rotation clears only its literal4/2/2 chunk BEFORE map filters and never adds an unanswered caller',()=>{
  for(const[group,ids,offset,length]of[[0,[4,11],0,4],[1,[10,40],4,2],[2,[13,17],6,2]]as const){
    const s=state([...ids]),bytes=[255,255,255,255,255,255,255,255];bytes[offset]=ids[0];bytes[offset+1]=ids[1];s.phoneRecentCallers=bytes;
    const p=ports(group===0?0:group===1?500:800,[0,0],rules.randomCallers.find(row=>row.id===ids[0])!.map),plan=planRandomIncomingCall(s,ready(),rules,p);
    assert.equal(plan.call?.contact,ids[1]);assert.equal(plan.call?.candidateCount,2);assert.deepEqual(s.phoneRecentCallers,Array(8).fill(255));assert.equal(s.phoneRecentCallers!.length,8);assert.equal(length,rules.recentCallerChunks[group].length);
  }
});

test('native recent Count scans past255 holes while Contains stops at the first255',()=>{
  const hole=state([4]);hole.phoneRecentCallers=[255,4,255,255,10,255,13,255];assert.equal(planRandomIncomingCall(hole,ready(),rules,ports()).call?.contact,4);assert.deepEqual(hole.phoneRecentCallers,[255,255,255,255,10,255,13,255]);
  const contains=state([4,11,14]);contains.phoneRecentCallers=[4,255,11,255,255,255,255,255];assert.equal(planRandomIncomingCall(contains,ready(),rules,ports()).call?.contact,11);assert.deepEqual(contains.phoneRecentCallers,[4,255,11,255,255,255,255,255]);
});

test('Buena is blocked on exact password hours or takeover2..4, including numeric VM variable alias precedence',()=>{
  for(const hour of[2,5,8,11,14,17,20,23]){const p=ports(500,[0],60,hour);assert.equal(planRandomIncomingCall(state([8]),ready(),rules,p).outcome,'no-callers');assert.deepEqual(p.draws,['MT','LC']);}
  for(const value of[2,3,4])for(const alias of['VAR_SCENE_ROCKET_TAKEOVER','#16503']){const s=state([8]);s.vars[alias]=value;assert.equal(planRandomIncomingCall(s,ready(),rules,ports(500,[0],60,9)).outcome,'no-callers');}
  const s=state([8]);s.vars.VAR_SCENE_ROCKET_TAKEOVER=2;s.vars['#16503']=1;assert.equal(planRandomIncomingCall(s,ready(),rules,ports(500,[0,0],60,9)).call?.contact,8);
  s.vars['#16503']=4;assert.equal(planRandomIncomingCall(s,ready(),rules,ports(500,[0],60,9)).outcome,'no-callers');
});

test('contest exclusion uses the exact NationalPark map and source flag, accepting named/numeric stored aliases',()=>{
  for(const key of['FLAG_UNK_996','#2454']){const s=state([19]);s.flags[key]=true;assert.equal(planRandomIncomingCall(s,ready(),rules,ports(0,[0])).outcome,'no-callers');}
  const s=state([19,4]);s.flags.FLAG_UNK_996=true;assert.equal(planRandomIncomingCall(s,ready(),rules,ports()).call?.contact,4);s.flags.FLAG_UNK_996=false;s.flags['#2454']=true;assert.equal(planRandomIncomingCall(s,ready(),rules,ports()).call?.contact,19,'named source flag has precedence, matching VM flag storage');
});

test('no remaining callers resets, while active/early polls consume no RNG or history',()=>{
  const s=state([4]),empty=ports(0,[0],384);assert.equal(planRandomIncomingCall(s,ready(),rules,empty).ring.elapsedMinutes,0);assert.deepEqual(empty.draws,['MT','LC']);
  const active=planRandomIncomingCall(s,ready(),rules,ports()).ring,p=ports();assert.equal(planRandomIncomingCall(s,active,rules,p).outcome,'blocked');assert.equal(planRandomIncomingCall(s,newPhoneRingState(),rules,p).outcome,'blocked');assert.deepEqual(p.draws,[]);
});

test('invalid RNG/hour/contact/history inputs fail explicitly instead of silently completing unknown callers',()=>{
  assert.throws(()=>planRandomIncomingCall(state(),ready(),rules,ports(0,[0x100000000])),/unsigned 32-bit/);assert.throws(()=>planRandomIncomingCall(state(),ready(),rules,ports(65536,[0])),/unsigned 16-bit/);assert.throws(()=>planRandomIncomingCall(state(),ready(),rules,ports(0,[0],60,24)),/anchor hour/);
  const unknown=state();unknown.pokegear!.contacts=['PHONE_CONTACT_MADE_UP'];assert.throws(()=>planRandomIncomingCall(unknown,ready(),rules,ports()),/Unknown original registered/);
  const bad=state([4]);bad.phoneRecentCallers=[4];assert.throws(()=>planRandomIncomingCall(bad,ready(),rules,ports()),/eight-byte/);
});
