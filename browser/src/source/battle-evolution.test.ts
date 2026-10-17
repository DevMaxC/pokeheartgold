import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadData,newState,createMon,speciesName} from './data.ts';
import {BattleEvolutionQueue,ordinaryLevelEvolution,UnsupportedBattleEvolution,type BattleEvolutionPorts,type NativeEvolutionSelection} from './battle-evolution.ts';
import type {BattleEvolutionCallbacks,BattleEvolutionCompletion,BattleEvolutionScenePort} from './battle-evolution-types.ts';
import type {Mon} from './types.ts';
import {loadNativeEvolutionData,selectNativeLevelEvolution} from './evolution-native.ts';
import {loadNativeFieldMoveData,isHMMove,prepareTMHMTeaching,commitTMHMTeaching} from './field-moves.ts';
import {monAbility} from './battle-math.ts';

globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData(),native=await loadNativeEvolutionData(data),fieldMoves=await loadNativeFieldMoveData();
const mon=(species=155,level=14)=>({...createMon(data,species,level,'Ethan',()=>.5),hasNickname:false});
const selection=(m:Mon):NativeEvolutionSelection=>selectNativeLevelEvolution(native,null,m,{night:false,evolutionLocation:0});
const completion=(party:Mon[],mask=1,result:BattleEvolutionCompletion['result']='won'):BattleEvolutionCompletion=>Object.freeze({serial:1,result,levelUpMask:mask,party:Object.freeze([...party]),isCurrent:()=>true});
const scene:BattleEvolutionScenePort=async(_scene,callbacks)=>{callbacks.evolve();callbacks.register();await callbacks.learnMoves();callbacks.finish();return'evolved';};
function fixture(party:Mon[]=[mon()]){
 const state=newState(data,'Ethan','boy',()=>.5);state.party=party;const events:unknown[]=[];
 const ports:BattleEvolutionPorts={select:(_p,m)=>selection(m),metadata:m=>({form:m.form??0,hasNickname:m.hasNickname!}),present:scene,moveLearning:{isHM:move=>isHMMove(fieldMoves,move),choose:async()=>({kind:'decline'}),show:async event=>{events.push(event);}}};
 return{state,events,ports,queue:new BattleEvolutionQueue(),record:completion(party)};
}

test('original C BattleSystem_CheckEvolution exit flags, bit order and once-per-slot behavior match every legal mask',async()=>{
 const source=await readFile(new URL('../../../src/battle/battle_system.c',import.meta.url),'utf8'),start=source.indexOf('u16 BattleSystem_CheckEvolution('),end=source.indexOf('\nu8 BattleSystem_IsServer(',start);assert.ok(start>=0&&end>start);
 const native=source.slice(start,end),temporary=await mkdtemp(join(tmpdir(),'hg-evolution-queue-'));
 try{
  const c=`#include <stdio.h>\n#include <stdint.h>\ntypedef uint16_t u16;typedef struct{int slot;}Pokemon;typedef struct{Pokemon mons[6];}Party;typedef struct{int winFlag,levelUpFlag,evolutionLocation;Party*party[1];}BattleSetup;\n#define PARTY_SIZE 6\n#define BATTLE_OUTCOME_WIN 1\n#define BATTLE_OUTCOME_MON_CAUGHT 4\n#define BATTLE_OUTCOME_PLAYER_FLED 5\n#define EVOCTX_LEVELUP 0\n#define MaskOfFlagNo(x) (1u<<(x))\nPokemon*Party_GetMonByIndex(Party*p,int i){return &p->mons[i];}\nu16 GetMonEvolution(Party*p,Pokemon*m,int context,int location,int*method){printf("G%d,",m->slot);return (m->slot%2)==0?156:0;}\n${native}\nint main(){Party p={0};for(int i=0;i<6;i++)p.mons[i].slot=i;int outcomes[]={1,2,4,5};for(int o=0;o<4;o++)for(int mask=0;mask<64;mask++){BattleSetup b={outcomes[o],mask,0,{&p}};int i,method;printf("%d:%d:",outcomes[o],mask);while(BattleSystem_CheckEvolution(&b,&i,&method))printf("E%d,",i);puts("");}return 0;}`;
  await writeFile(join(temporary,'oracle.c'),c);execFileSync('cc',['-std=c99','-O2',join(temporary,'oracle.c'),'-o',join(temporary,'oracle')]);
  const lines=execFileSync(join(temporary,'oracle'),{encoding:'utf8'}).trim().split('\n');let cursor=0;
  for(const[result,flag]of[['won',1],['lost',2],['caught',4],['ran',5]]as const)for(let mask=0;mask<64;mask++){
   const f=fixture(Array.from({length:6},()=>mon())),calls:string[]=[];f.ports.select=(_party,_mon,index)=>{calls.push('G'+index);return index%2===0?selection(_mon):{kind:'ineligible'};};f.ports.present=async(s,cb,signal)=>{calls.push('E'+s.partyIndex);return scene(s,cb,signal);};
   await f.queue.run(data,f.state,completion(f.state.party,mask,result),f.ports);assert.equal(`${flag}:${mask}:${calls.length?calls.join(',')+',':''}`,lines[cursor++]);
  }
 }finally{await rm(temporary,{recursive:true,force:true});}
});

test('native starter targets update only species-derived fields at the source callback boundaries',async()=>{
 for(const[species,level,target]of[[152,16,153],[155,14,156],[158,18,159]]as const){
  const original=mon(species,level);original.hp-=5;original.status='PSN';original.moves[0].pp=2;original.heldItem='ITEM_ORAN_BERRY';original.provenance={otId:31,otGender:'boy',language:2,gameVersion:7,metLevel:5,pokeball:4,metLocation:1,metDate:{year:2026,month:10,day:17},eggLocation:0,eggDate:{year:0,month:0,day:0},fatefulEncounter:false};
  const f=fixture([original]),before=structuredClone(original),move=original.moves[0],provenance=original.provenance,stats=original.stats;
  f.ports.present=async(s,cb)=>{assert.ok(Object.isFrozen(s.before)&&Object.isFrozen(s.before.moves));assert.equal(original.species,species);const text=cb.evolve();assert.deepEqual(text,{nickname:before.name,speciesName:speciesName(data,target)});assert.equal(original.name,before.name);assert.equal(original.species,target);assert.ok(!f.state.caught.includes(target));cb.register();assert.equal(original.name,speciesName(data,target));assert.ok(f.state.caught.includes(target));await cb.learnMoves();cb.finish();return'evolved';};
  assert.deepEqual(await f.queue.run(data,f.state,f.record,f.ports),{evolved:[0],cancelled:[],ineligible:[]});
  assert.equal(f.state.party[0],original);assert.equal(original.stats,stats);assert.equal(original.moves[0],move);assert.equal(original.provenance,provenance);
  for(const key of['exp','ivs','evs','nature','personality','friendship','status','sleepTurns','heldItem','ot','id','provenance','moves']as const)assert.deepEqual(original[key],before[key],key);
  assert.equal(original.hp,original.maxHP-5);assert.equal(f.state.gameStats![data.constants.GAME_STAT_UNIQUE_MONS_CAUGHT],1);assert.equal(f.state.gameStats![data.constants.GAME_STAT_SCORE],20);
  assert.equal(f.queue.pending(f.record),0);assert.deepEqual(await f.queue.run(data,f.state,f.record,f.ports),{evolved:[],cancelled:[],ineligible:[]});
 }
});

test('native cancellation consumes only its own level-up bit and preserves earned EXP, level, item, stats and identity',async()=>{
 const first=mon(),second=mon(152,16),f=fixture([first,second]),before=structuredClone(first);f.record=completion(f.state.party,3);f.ports.present=async(s,cb,signal)=>s.partyIndex===0?'cancelled':scene(s,cb,signal);
 assert.deepEqual(await f.queue.run(data,f.state,f.record,f.ports),{evolved:[1],cancelled:[0],ineligible:[]});assert.deepEqual(first,before);assert.equal(f.state.party[0],first);assert.equal(second.species,153);assert.equal(f.queue.pending(f.record),0);
 const next=completion(f.state.party,1);await f.queue.run(data,f.state,next,{...f.ports,present:scene});assert.equal(first.species,156,'a later real level-up bit can retry a previously cancelled species');
});

test('actual raw Everstone suppresses the source query even under Klutz, and consumes the battle bit without a scene',async()=>{
 for(const m of[mon(),mon(427,20)]){m.heldItem='ITEM_EVERSTONE';if(m.species===427){m.personality++;m.friendship=255;assert.equal(monAbility(data,m),'ABILITY_KLUTZ');}const f=fixture([m]),before=structuredClone(f.state);let scenes=0;f.ports.present=async()=>{scenes++;return'cancelled';};assert.deepEqual(await f.queue.run(data,f.state,f.record,f.ports),{evolved:[],cancelled:[],ineligible:[0]});assert.equal(scenes,0);assert.deepEqual(f.state,before);assert.equal(f.queue.pending(f.record),0);}
});

test('one bit never chains two species even after a multi-level battle; no HP condition is fabricated',async()=>{
 const f=fixture([mon(155,40)]);f.state.party[0].hp=0;await f.queue.run(data,f.state,f.record,f.ports);assert.equal(f.state.party[0].species,156);assert.equal(f.state.party[0].hp,0);assert.equal(f.state.party[0].level,40);assert.equal(selection(f.state.party[0]).kind,'eligible');assert.equal(f.queue.pending(f.record),0);
});

test('technical failure restores both pending bits and every provisional evolution while retaining original objects for retry',async()=>{
 const f=fixture([mon(),mon(152,16)]);f.record=completion(f.state.party,3);const before=structuredClone(f.state),identities=[...f.state.party],moves=identities.map(m=>m.moves[0]);
 f.ports.present=async(s,cb,signal)=>{if(s.partyIndex===0)return scene(s,cb,signal);cb.evolve();cb.register();throw Error('view failed after native register');};
 await assert.rejects(f.queue.run(data,f.state,f.record,f.ports),/view failed/);assert.deepEqual(f.state,before);assert.equal(f.queue.pending(f.record),3);for(let i=0;i<2;i++){assert.equal(f.state.party[i],identities[i]);assert.equal(f.state.party[i].moves[0],moves[i]);}
 f.ports.present=scene;await f.queue.run(data,f.state,f.record,f.ports);assert.deepEqual(f.state.party.map(m=>m.species),[156,153]);assert.equal(f.state.gameStats![13],2);assert.equal(f.queue.pending(f.record),0);
});

test('outer abort during a scene or after an earlier completed candidate restores the batch and its pending mask',{timeout:3000},async()=>{
 for(const abortAt of[0,1]){
  const f=fixture([mon(),mon(152,16)]),outer=new AbortController(),before=structuredClone(f.state);f.record=completion(f.state.party,3);let entered!:()=>void,observed=false;const ready=new Promise<void>(resolve=>{entered=resolve;});
  f.ports.present=async(s,cb,signal)=>{if(s.partyIndex!==abortAt)return scene(s,cb,signal);cb.evolve();cb.register();entered();await new Promise<never>((_resolve,reject)=>{signal!.addEventListener('abort',()=>{observed=true;reject(signal!.reason);},{once:true});});throw Error('unreachable');};
  const running=f.queue.run(data,f.state,f.record,f.ports,outer.signal);await ready;outer.abort(new DOMException('field owner aborted','AbortError'));await assert.rejects(running,/field owner aborted/);
  assert.equal(observed,true);assert.deepEqual(f.state,before);assert.equal(f.queue.pending(f.record),3);f.ports.present=scene;await f.queue.run(data,f.state,f.record,f.ports);assert.deepEqual(f.state.party.map(m=>m.species),[156,153]);
 }
});

test('a concurrent run cannot steal the active queue owner or consume its pending batch',{timeout:3000},async()=>{
 const f=fixture();let enter!:()=>void,release!:()=>void;const entered=new Promise<void>(resolve=>{enter=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
 f.ports.present=async(s,cb,signal)=>{enter();await gate;return scene(s,cb,signal);};const first=f.queue.run(data,f.state,f.record,f.ports);await entered;
 try{await assert.rejects(f.queue.run(data,f.state,f.record,f.ports),/already owns the field/);assert.equal(f.state.party[0].species,155);}finally{release();await first;}
 assert.equal(f.state.party[0].species,156);assert.equal(f.queue.pending(f.record),0);
});

test('a native cancel followed by a later technical failure restores the cancelled bit for the source-action retry',async()=>{
 const f=fixture([mon(),mon(152,16)]),before=structuredClone(f.state);f.record=completion(f.state.party,3);const offered:number[]=[];
 f.ports.present=async(s,cb)=>{offered.push(s.partyIndex);if(s.partyIndex===0)return'cancelled';cb.evolve();cb.register();throw Error('later candidate failed');};
 await assert.rejects(f.queue.run(data,f.state,f.record,f.ports),/later candidate failed/);assert.deepEqual(offered,[0,1]);assert.deepEqual(f.state,before);assert.equal(f.queue.pending(f.record),3);
 offered.length=0;f.ports.present=async(s,cb,signal)=>{offered.push(s.partyIndex);return scene(s,cb,signal);};await f.queue.run(data,f.state,f.record,f.ports);assert.deepEqual(offered,[0,1]);assert.deepEqual(f.state.party.map(m=>m.species),[156,153]);assert.equal(f.state.gameStats![13],2);
});

test('the source register boundary retains a confirmed custom nickname while registering the new species',async()=>{
 const named=mon();named.name='Cinder';named.hasNickname=true;const f=fixture([named]);
 f.ports.present=async(_s,cb)=>{assert.deepEqual(cb.evolve(),{nickname:'Cinder',speciesName:speciesName(data,156)});assert.equal(named.name,'Cinder');cb.register();assert.equal(named.name,'Cinder');assert.ok(f.state.caught.includes(156));await cb.learnMoves();cb.finish();return'evolved';};
 await f.queue.run(data,f.state,f.record,f.ports);assert.equal(named.name,'Cinder');assert.equal(named.hasNickname,true);assert.equal(f.state.gameStats![13],1);
});

test('stale callbacks, source phase skips, post-commit cancel and changed slot identity cannot mutate the party',async()=>{
 for(const error of['register-first','skip-learning','cancel-after-commit','return-early']as const){const f=fixture(),before=structuredClone(f.state);let callback:BattleEvolutionCallbacks|undefined;f.ports.present=async(_s,cb)=>{callback=cb;if(error==='register-first')cb.register();else if(error==='skip-learning'){cb.evolve();cb.register();cb.finish();}else if(error==='cancel-after-commit'){cb.evolve();return'cancelled';}return'evolved';};await assert.rejects(f.queue.run(data,f.state,f.record,f.ports));assert.deepEqual(f.state,before);assert.equal(f.queue.pending(f.record),1);assert.throws(()=>callback!.evolve(),/Stale|Abort/);}
 const f=fixture();f.state.party[0]=structuredClone(f.state.party[0]);await assert.rejects(f.queue.run(data,f.state,f.record,f.ports),/identity changed/);
});

test('target-level moves use native append/full/known outcomes and reset only a replaced slot PP',async()=>{
 const caterpie=fixture([mon(10,7)]),old=caterpie.state.party[0].moves[0];await caterpie.queue.run(data,caterpie.state,caterpie.record,caterpie.ports);assert.equal(caterpie.state.party[0].species,11);assert.ok(caterpie.state.party[0].moves.some(m=>m.id===data.constants.MOVE_HARDEN));assert.equal(caterpie.state.party[0].moves[0],old);
 const rat=fixture([mon(19,20)]),known=rat.state.party[0].moves.map(m=>m.id),pp=rat.state.party[0].moves.map(m=>m.pp);rat.state.party[0].moves[0].pp=1;rat.ports.moveLearning.choose=async request=>{assert.equal(request.move,data.constants.MOVE_SCARY_FACE);return{kind:'replace',slot:1};};await rat.queue.run(data,rat.state,rat.record,rat.ports);assert.equal(rat.state.party[0].moves[1].id,data.constants.MOVE_SCARY_FACE);assert.equal(rat.state.party[0].moves[1].pp,data.moves[data.constants.MOVE_SCARY_FACE].pp);assert.equal(rat.state.party[0].moves[0].pp,1);assert.equal(rat.state.party[0].moves[2].id,known[2]);assert.equal(rat.state.party[0].moves[2].pp,pp[2]);assert.deepEqual(rat.events.map((e:any)=>e.kind),['forget','learned']);
 const decline=fixture([mon(19,20)]),before=structuredClone(decline.state.party[0].moves);await decline.queue.run(data,decline.state,decline.record,decline.ports);assert.deepEqual(decline.state.party[0].moves,before);assert.deepEqual(decline.events.map((e:any)=>e.kind),['declined']);
});

test('actual Lanturn27 move rows retain native source order through mixed replace, decline and replace outcomes',async()=>{
 const f=fixture([mon(170,27)]),source=f.state.party[0],old=structuredClone(source.moves),offered:number[]=[];
 assert.equal(source.moves.length,4);assert.deepEqual(data.learnsets[171].filter(row=>row.level===27).map(row=>row.move),[254,256,255]);
 f.ports.moveLearning.choose=async request=>{offered.push(request.move);if(request.move===256)return{kind:'decline'};return{kind:'replace',slot:request.move===254?0:1};};
 await f.queue.run(data,f.state,f.record,f.ports);assert.equal(source.species,171);assert.deepEqual(offered,[254,256,255]);assert.deepEqual(source.moves.map(move=>move.id),[254,255,old[2].id,old[3].id]);assert.equal(source.moves[0].pp,data.moves[254].pp);assert.equal(source.moves[1].pp,data.moves[255].pp);assert.deepEqual(source.moves.slice(2),old.slice(2));assert.deepEqual(f.events.map((event:any)=>[event.kind,event.move]),[['forget',254],['learned',254],['declined',256],['forget',255],['learned',255]]);
});

test('source evolution move summary preserves a legally taught HM and rejects a port that tries to forget it',async()=>{
 for(const invalid of[false,true]){
  const f=fixture([mon(19,20)]);f.state.bag.ITEM_HM01=1;const plan=prepareTMHMTeaching(data,fieldMoves,f.state,0,'ITEM_HM01',0);assert.equal(plan.status,'ready');assert.equal(commitTMHMTeaching(f.state,plan as any).status,'learned');assert.equal(f.state.party[0].moves[0].id,data.constants.MOVE_CUT);const before=structuredClone(f.state);
  f.ports.moveLearning.choose=async request=>{assert.deepEqual(request.unforgettablyHM,[true,false,false,false]);return{kind:'replace',slot:invalid?0:1};};
  if(invalid){await assert.rejects(f.queue.run(data,f.state,f.record,f.ports),/cannot forget an HM/);assert.deepEqual(f.state,before);assert.equal(f.queue.pending(f.record),1);}else{await f.queue.run(data,f.state,f.record,f.ports);assert.equal(f.state.party[0].moves[0].id,data.constants.MOVE_CUT);assert.equal(f.state.party[0].moves[1].id,data.constants.MOVE_SCARY_FACE);assert.equal(f.state.bag.ITEM_HM01,1);}
 }
});

test('owned move UI aborts and drains before technical rollback; a late choice cannot teach a restored mon',async()=>{
 const f=fixture([mon(19,20)]),before=structuredClone(f.state);let learned:Promise<void>|undefined,settled=false,signalSeen:AbortSignal|undefined;
 f.ports.moveLearning.choose=(_request,signal)=>new Promise((_resolve,reject)=>{signalSeen=signal;signal.addEventListener('abort',()=>{setImmediate(()=>{settled=true;reject(signal.reason);});},{once:true});});
 f.ports.present=async(_scene,cb)=>{cb.evolve();cb.register();learned=cb.learnMoves();throw Error('scene lost its context');};
 await assert.rejects(f.queue.run(data,f.state,f.record,f.ports),/lost its context/);assert.equal(signalSeen!.aborted,true);assert.equal(settled,true);await assert.rejects(learned!);assert.deepEqual(f.state,before);assert.equal(f.queue.pending(f.record),1);
});

test('unsupported eligible methods/forms and unknown nickname metadata fail explicitly before transition',async()=>{
 for(const mode of['method','form','nickname']as const){const f=fixture(),before=structuredClone(f.state);let scenes=0;f.ports.present=async()=>{scenes++;return'cancelled';};if(mode==='method')f.ports.select=()=>({kind:'eligible',target:176,method:1,methodKey:'EVO_FRIENDSHIP',param:0});else f.ports.metadata=()=>({form:mode==='form'?1:0,hasNickname:mode==='nickname'?undefined as any:false});await assert.rejects(f.queue.run(data,f.state,f.record,f.ports),UnsupportedBattleEvolution);assert.equal(scenes,0);assert.deepEqual(f.state,before);assert.equal(f.queue.pending(f.record),1);}
});

test('ordinary source transition retains custom nickname, derives new-species gender and preserves a native faint',()=>{
 const m=mon(298,18);m.name='Puddle';m.hasNickname=true;m.personality=160;const target=ordinaryLevelEvolution(data,m,183,{form:0,hasNickname:true});assert.equal(m.gender,'female');assert.equal(target.gender,'male','native Azurill/Marill ratio change uses same PID');assert.equal(target.name,'Puddle');assert.equal(target.personality,160);m.hp=0;assert.equal(ordinaryLevelEvolution(data,m,183,{form:0,hasNickname:true}).hp,0);
});

test('the unchanged native HP tail matches every HP of one stats fixture per starter and explicit shrinking-maximum controls',async()=>{
 const source=await readFile(new URL('../../../src/pokemon.c',import.meta.url),'utf8'),start=source.indexOf('    if (hp != 0 || maxHp == 0) {',source.indexOf('void CalcMonStats(')),end=source.indexOf('    ReleaseMonLock(mon, decry);',start);assert.ok(start>=0&&end>start);
 const tail=source.slice(start,end),temporary=await mkdtemp(join(tmpdir(),'hg-evolution-hp-'));
 try{
  const c=`#include <stdio.h>\n#define SPECIES_SHEDINJA 292\n#define MON_DATA_HP 1\n#define SetMonData(m,k,v) (output=*(v))\nint main(){int species,maxHp,newMaxHp,hp;while(scanf("%d %d %d %d",&species,&maxHp,&newMaxHp,&hp)==4){int output=hp;${tail}printf("%d\\n",output);}return 0;}`;
  await writeFile(join(temporary,'oracle.c'),c);execFileSync('cc',['-std=c99','-O2',join(temporary,'oracle.c'),'-o',join(temporary,'oracle')]);
  const cases:{source:Mon;target:number}[]=[];for(const[s,l,t]of[[152,16,153],[155,14,156],[158,18,159]]as const){const m=mon(s,l);for(let hp=0;hp<=m.maxHP;hp++)cases.push({source:{...m,hp},target:t});}
  // These additional maxHP values isolate the literal HP-tail branch. They
  // are synthetic function inputs, not claimed legal starter-derived stats.
  const base=mon(),newMax=ordinaryLevelEvolution(data,base,156,{form:0,hasNickname:false}).maxHP;for(let hp=0;hp<=newMax+7;hp++)cases.push({source:{...base,maxHP:newMax+7,hp},target:156});
  const actual=cases.map(row=>ordinaryLevelEvolution(data,row.source,row.target,{form:0,hasNickname:false})),input=cases.map((row,index)=>`${row.target} ${row.source.maxHP} ${actual[index].maxHP} ${row.source.hp}`).join('\n')+'\n';
  const expected=execFileSync(join(temporary,'oracle'),{input,encoding:'utf8'}).trim().split('\n').map(Number);assert.deepEqual(actual.map(mon=>mon.hp),expected);
 }finally{await rm(temporary,{recursive:true,force:true});}
});
