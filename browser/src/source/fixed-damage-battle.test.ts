import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Battle} from './battle.ts';
import {createMon,loadData,newState} from './data.ts';
import {originalTrainerParty} from './trainers.ts';
import {monAbility} from './battle-math.ts';
import type {Mon} from './types.ts';
import type {UI} from './ui.ts';
globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData(),noncrit=32769/65536;
const mon=(species:number,level:number)=>createMon(data,species,level,'Ethan',()=>noncrit);
function tape(...raw:number[]){let calls=0;return{rng:()=>{assert.ok(calls<raw.length,'fixed damage must not draw critical/range RNG');return raw[calls++]/65536;},get calls(){return calls;}};}
function fixture(player:Mon,target:Mon,rng:()=>number=()=>noncrit){
 const elements=new Map<string,{innerHTML:string;hidden:boolean}>();globalThis.document={getElementById(id:string){if(!elements.has(id))elements.set(id,{innerHTML:'',hidden:true});return elements.get(id);},querySelector(){return null;}}as unknown as Document;
 const state=newState(data,'Ethan','boy',()=>noncrit);state.party=[player];const battle=new Battle(data,state,{}as UI,rng),messages:string[]=[];Reflect.set(battle,'enemies',[target]);Reflect.set(battle,'say',async(text:string)=>{messages.push(text);});return{battle,state,messages};
}
const invoke=(f:ReturnType<typeof fixture>,key:string,...args:unknown[])=>Reflect.get(f.battle,key).apply(f.battle,args);
function slot(mon:Mon,key:string){const i=mon.moves.findIndex(row=>row.id===data.constants[key]);assert.ok(i>=0,`${mon.name} naturally knows ${key}`);return i;}
const noDamageModifiers=(messages:string[])=>assert.ok(!messages.some(text=>/critical hit|super effective|not very effective/i.test(text)));

test('native40/41/87 direct effect scripts never call critical or ranged damage, and halfHP uses DamageDivide',async()=>{
 for(const effect of['0040','0041','0087']){const source=await readFile(new URL(`../../../files/battledata/script/effect_script/effect_script_${effect}.s`,import.meta.url),'utf8');assert.match(source,/BATTLE_STATUS_IGNORE_TYPE_EFFECTIVENESS/);assert.doesNotMatch(source,/^\s*(CalcCrit|CalcDamage|CalcDamageRaw)\b/m);}
 const c=await readFile(new URL('../../../src/battle/battle_command.c',import.meta.url),'utf8'),start=c.indexOf('BOOL BtlCmd_DivideVarByValue('),end=c.indexOf('BOOL BtlCmd_DivideVarByVar(',start);assert.match(c.slice(start,end),/\*data = DamageDivide\(\*data, denom\)/);
});
test('natural Rattata SuperFang ignores FocusEnergy, burn, Reflect and resistance without critical/range draws',async()=>{
 const rat=mon(19,28),team=await originalTrainerParty(data,1),bayleef=team.find(m=>m.species===153)!;rat.status='BRN';const fang=rat.moves[slot(rat,'MOVE_SUPER_FANG')],focus=data.moves[data.constants.MOVE_FOCUS_ENERGY];assert.ok(data.learnsets[19].some(row=>row.move===focus.id&&row.level<=28));rat.moves=[fang,{id:focus.id,pp:focus.pp,maxPP:focus.pp}];const rng=tape(0),f=fixture(rat,bayleef,rng.rng);await invoke(f,'attack',true,1);await invoke(f,'attack',false,slot(bayleef,'MOVE_REFLECT'));const before=bayleef.hp,pp=fang.pp;await invoke(f,'attack',true,0);assert.equal(before-bayleef.hp,Math.floor(before/2));assert.equal(fang.pp,pp-1);assert.equal(rng.calls,1);noDamageModifiers(f.messages);
 // Repeated legal hits on a fresh native Steel target reach1HP naturally.
 const steel=mon(81,18),rolls=tape(...Array(10).fill(0)),g=fixture(mon(19,28),steel,rolls.rng);let uses=0,sawOne=false;while(steel.hp>0){const hp=steel.hp;if(hp===1)sawOne=true;await invoke(g,'attack',true,slot(g.battle.player,'MOVE_SUPER_FANG'));assert.equal(hp-steel.hp,Math.max(1,Math.floor(hp/2)));assert.equal(rolls.calls,++uses);}assert.ok(sawOne);noDamageModifiers(g.messages);
});
test('natural Dratini DragonRage deals40 through Steel resistance and has only its accuracy draw',async()=>{
 const user=mon(147,15),target=mon(81,30),rng=tape(0),f=fixture(user,target,rng.rng),i=slot(user,'MOVE_DRAGON_RAGE'),pp=user.moves[i].pp,hp=target.hp;assert.ok(hp>40);await invoke(f,'attack',true,i);assert.equal(hp-target.hp,40);assert.equal(user.moves[i].pp,pp-1);assert.equal(rng.calls,1);noDamageModifiers(f.messages);
});
test('natural Gastly NightShade uses level damage against super-effective/resisted types but keeps Normal immunity',async()=>{
 for(const species of[92,198,161]){const user=mon(92,15),target=mon(species,25),rng=tape(0),f=fixture(user,target,rng.rng),hp=target.hp;await invoke(f,'attack',true,slot(user,'MOVE_NIGHT_SHADE'));assert.equal(hp-target.hp,species===161?0:15);assert.equal(rng.calls,1);noDamageModifiers(f.messages);}
});
test('actual Hoothoot Foresight persists across player switch and lets natural Machop SeismicToss hit Ghosts',async()=>{
 const target=(await originalTrainerParty(data,1))[0],machop=mon(66,19),first=tape(0),before=fixture(machop,target,first.rng),hp=target.hp;await invoke(before,'attack',true,slot(machop,'MOVE_SEISMIC_TOSS'));assert.equal(target.hp,hp);assert.equal(first.calls,1);
 const hoothoot=mon(163,10),rng=tape(0),f=fixture(hoothoot,target,rng.rng);f.state.party.push(machop);assert.equal(data.moves[data.constants.MOVE_FORESIGHT].accuracy,0,'source accuracy0 consumes no hit roll');await invoke(f,'attack',true,slot(hoothoot,'MOVE_FORESIGHT'));await invoke(f,'switch',1);await invoke(f,'attack',true,slot(machop,'MOVE_SEISMIC_TOSS'));assert.equal(hp-target.hp,19);assert.equal(rng.calls,1);noDamageModifiers(f.messages);
});
test('fixed contact SuperFang still draws Static after accuracy and can paralyze its user',async()=>{
 const user=mon(19,28),target=mon(179,30),rng=tape(0,0),f=fixture(user,target,rng.rng),hp=target.hp;await invoke(f,'attack',true,slot(user,'MOVE_SUPER_FANG'));assert.equal(hp-target.hp,Math.floor(hp/2));assert.equal(user.status,'PAR');assert.equal(rng.calls,2);noDamageModifiers(f.messages);
});
test('native WonderGuard retains its type-permission check for fixed damage without multiplying the amount',async()=>{
 const ghost=mon(92,15),shedinja=mon(292,20),rng=tape(0),f=fixture(ghost,shedinja,rng.rng);assert.equal(monAbility(data,shedinja),'ABILITY_WONDER_GUARD');assert.equal(shedinja.hp,1);await invoke(f,'attack',true,slot(ghost,'MOVE_NIGHT_SHADE'));assert.equal(shedinja.hp,0);assert.equal(rng.calls,1);noDamageModifiers(f.messages);
 const dragon=mon(147,15),other=mon(292,20),roll=tape(0),g=fixture(dragon,other,roll.rng);await invoke(g,'attack',true,slot(dragon,'MOVE_DRAGON_RAGE'));assert.equal(other.hp,1);assert.equal(roll.calls,1);assert.ok(g.messages.includes(`${other.name} avoided damage by using Wonder Guard!`));noDamageModifiers(g.messages);
});
