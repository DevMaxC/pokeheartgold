import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openingFixture} from '../../tests/trace-opening.ts';
import {hasBagSpace,addBagItem,takeBagItem,isCaptureBall} from './bag.ts';
import {originalTrainerParty,trainerPrize,battleMoneyLoss} from './trainers.ts';
import {typeEffectiveness} from './battle-math.ts';
import {catchingTutorialState} from './tutorial.ts';
import {loadData,newState} from './data.ts';
import {timeOfDay,trainerCardStars} from './field-services.ts';
const fixtureData=await loadData();

for(const gender of ['boy','girl'] as const)for(const starter of [152,155,158])test(`original opening quest state: ${gender}, starter ${starter}`,async()=>{
  const {state,data,checkpoints,battles,messages,vm,tutorials,nicknameResults}=await openingFixture({starter,gender});
  assert.equal(vm.lastUnsupported,null);assert.equal(state.party.length,1);assert.equal(state.party[0].species,starter);assert.equal(state.starter,starter);assert.equal(checkpoints['Aide gift'].bag.ITEM_POTION,5);
  assert.equal(checkpoints['Mr. Pokémon and Oak'].bag.ITEM_MYSTERY_EGG,1);assert.equal(checkpoints['Mr. Pokémon and Oak'].pokedexEnabled,true);assert.equal(checkpoints['Mr. Pokémon and Oak'].flags.FLAG_GOT_POKEDEX,true);assert.equal(state.runningShoes,true);assert.ok(state.pokegear?.cards.length);assert.ok(state.pokegear?.contacts.includes('PHONE_CONTACT_PROF__OAK'));
  assert.equal(state.rivalName,'Silver');assert.equal(state.bag.ITEM_MYSTERY_EGG,undefined);assert.equal(state.flags.FLAG_GAVE_RIVAL_NAME_TO_OFFICER,true);assert.equal(state.flags.FLAG_SYS_MOMS_SAVINGS,true);assert.deepEqual(state.lastHeal,{map:69,x:8.5,z:13.5,facing:0});
  assert.equal(battles.length,1);assert.equal(battles[0].canLose,true);assert.equal(data.constants[data.trainers[battles[0].id].party[0].species],starter===152?155:starter===155?158:152);assert.ok(messages.some(message=>message.includes('disaster')));assert.ok(messages.some(message=>message.includes(gender==='boy'?'Lyra':'Ethan')));
  assert.equal(tutorials,1);assert.equal(state.bag.ITEM_POKE_BALL,5);assert.equal(state.vars.VAR_UNK_408B,0);assert.equal(state.flags.FLAG_UNK_09A,true);assert.equal(state.party.length,1);
  assert.deepEqual(nicknameResults,[{slot:0,code:1}]);assert.equal(state.party[0].hasNickname,false);assert.equal(state.party[0].name,data.names.species[starter]);
});
test('losing the initial rival battle still follows the original story branch',async()=>{const {state,checkpoints}=await openingFixture({battleWon:false,motherSaving:false});assert.equal(checkpoints['Rival battle'].flags.FLAG_MET_PASSERBY_BOY,true);assert.equal(checkpoints['Rival battle'].vars.VAR_SCENE_CHERRYGROVE_CITY_OW,4);assert.equal(state.flags.FLAG_GAVE_RIVAL_NAME_TO_OFFICER,true);assert.equal(!!state.flags.FLAG_SYS_MOMS_SAVINGS,false);});
test('bag additions and removals are atomic at original stack and pocket limits',async()=>{
  const data=fixtureData,bag={ITEM_POTION:995};assert.equal(addBagItem(data,bag,'ITEM_POTION',5),false);assert.equal(bag.ITEM_POTION,995);assert.equal(addBagItem(data,bag,'ITEM_POTION',4),true);assert.equal(takeBagItem(bag,'ITEM_POTION',1000),false);assert.equal(bag.ITEM_POTION,999);assert.equal(hasBagSpace(data,{ITEM_TM01:99},'ITEM_TM01',1),false);
  const items=data.items.filter(item=>item.fieldPocket==='POCKET_ITEMS'&&item.item!=='ITEM_NONE'),limit=data.constants.NUM_BAG_ITEMS,full=Object.fromEntries(items.slice(0,limit).map(item=>[item.item,1]));assert.ok(items.length>limit);assert.equal(hasBagSpace(data,full,items[limit].item,1),false);assert.equal(addBagItem(data,full,items[0].item,1),true);
});
test('original rival team generation and single-battle rewards are deterministic',async()=>{const {data,state,battles}=await openingFixture(),id=battles[0].id,first=(await originalTrainerParty(data,id))[0],second=(await originalTrainerParty(data,id))[0];assert.deepEqual(first.ivs,[0,0,0,0,0,0]);assert.equal(first.species,158);assert.equal(first.personality,second.personality);assert.deepEqual(first.stats,second.stats);assert.equal(first.hp,first.maxHP);assert.equal(await trainerPrize(data,id),500);assert.equal(battleMoneyLoss(state.party,0,3000),40);assert.equal(battleMoneyLoss(state.party,8,3000),600);assert.equal(battleMoneyLoss(state.party,16,10),10);});
test('Foresight removes Ghost immunity while retaining other type matchups',()=>{const data=fixtureData;assert.equal(typeEffectiveness(data,data.constants.TYPE_NORMAL,92),0);assert.equal(typeEffectiveness(data,data.constants.TYPE_NORMAL,92,true),1);assert.equal(typeEffectiveness(data,data.constants.TYPE_FIGHTING,92,true),.5);});
test('the catching demonstration owns a separate party, inventory and capture records',()=>{const original=newState(fixtureData,'Ethan','boy'),before=structuredClone(original),demo=catchingTutorialState(fixtureData,original);assert.equal(demo.state.name,'Lyra');assert.equal(demo.state.party[0].species,183);assert.equal(demo.state.party[0].level,5);assert.equal(demo.state.party[0].moves[0].id,fixtureData.constants.MOVE_TACKLE);assert.equal(demo.enemy.species,19);assert.equal(demo.enemy.level,2);assert.equal(demo.state.bag.ITEM_POKE_BALL,20);demo.state.bag.ITEM_POKE_BALL--;demo.state.party[0].hp=1;demo.state.caught.push(19);assert.deepEqual(original,before);});
test('original names preserve punctuation, sex symbols, articles and item plurals',()=>{assert.equal(fixtureData.names.species[122],'MR. MIME');assert.equal(fixtureData.names.species[29],'NIDORAN♀');assert.equal(fixtureData.names.itemsPlural[17],'Potions');assert.equal(fixtureData.names.trainerClasses[119],'Passerby');});

test('capture items use the original Ball pocket rather than names ending in Ball',()=>{assert.equal(isCaptureBall(fixtureData,'ITEM_POKE_BALL'),true);assert.equal(isCaptureBall(fixtureData,'ITEM_GREAT_BALL'),true);for(const key of ['ITEM_SMOKE_BALL','ITEM_LIGHT_BALL','ITEM_IRON_BALL'])assert.equal(isCaptureBall(fixtureData,key),false);const bag={ITEM_POKE_BALL:1};assert.equal(takeBagItem(bag,'ITEM_POKE_BALL',1),true);assert.equal('ITEM_POKE_BALL' in bag,false);});

test('field clock uses the original morning/day/evening/night/late boundaries',()=>{assert.deepEqual([3,4,9,10,16,17,19,20,23].map(timeOfDay),[4,0,0,1,1,2,2,3,3]);});
test('trainer-card stars follow the five original independent achievements',()=>{const state=newState(fixtureData,'Ethan','boy');assert.equal(trainerCardStars(state),0);state.flags.FLAG_GAME_CLEAR=true;state.flags.FLAG_UNK_0F1=true;state.flags.FLAG_UNK_184=true;assert.equal(trainerCardStars(state),3);state.caught=Array.from({length:493},(_,i)=>i+1).filter(id=>![151,251,385,386,489,490,491,492,493].includes(id));assert.equal(trainerCardStars(state),4);state.battleTowerStreaks=[0,99,100];assert.equal(trainerCardStars(state),5);});
