// The imported fixtures also register their existing eleven earned-battle
// controls. This is a separately counted composition test, not a unique-suite
// claim. Main, actual Battle/XP, real queue/player and real 3D hatch view run;
// textures/decoded buffers/render ticks are CPU adapters, never audible/GPU QA.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadData} from './data.ts';
import {giveTogepiEgg} from './eggs.ts';
import {fixture,retainedMusicFixture} from './main-evolution.test.ts';

test('actual Main hatch completes native Togepi flags/name, retains failed restore, then next real Li battle evolves without old-field resurrection',async()=>{
 const music=await retainedMusicFixture();let retired:((signal?:AbortSignal)=>Promise<void>)|undefined,probed=false;
 const f=fixture('success',true,{music,audible:true,beforeTick:async host=>{if(host.phase==='oscillate'&&!probed){probed=true;assert.ok(retired);await retired(new AbortController().signal);assert.equal(music.nodes.some(node=>node.buffer?.asset.id===1072),false);}}});
 try{await music.player.unlock();await assert.rejects(music.player.playMap({id:f.state.map},{hour:12,flags:f.state.flags}),/original audio formats/);const data=await loadData();giveTogepiEgg(data,f.state);f.state.party[1].friendship=0;const egg=f.state.party[1];const hatch=await f.hatch();assert.equal(hatch.ok,true);assert.equal(egg.isEgg,false);assert.equal(egg.species,175);assert.equal(egg.hasNickname,false);assert.ok(f.state.caught.includes(175));assert.equal(f.state.flags.FLAG_SYS_HATCHED_TOGEPI_EGG,true);assert.ok(f.events.includes('hatch-phone0'));assert.equal(f.pendingMusicRestores.size,1);retired=[...f.pendingMusicRestores][0];assert.equal(f.state.party[0].level,13);f.saves.length=0;
  const result=await f.run();assert.equal(result.ok,true,JSON.stringify({faults:f.faults.map(String),events:f.events.slice(-15)}));assert.equal(probed,true);assert.equal(f.state.party[0].level,14);assert.equal(f.state.party[0].species,156);assert.equal(f.state.party[1],egg);assert.equal(f.state.bag.ITEM_TM70,1);assert.equal(f.saves.length,1);assert.equal(f.saves[0].party[0].species,156);assert.equal(f.saves[0].party[1].isEgg,false);assert.equal(f.soundOwned,false);assert.equal(music.contexts.length,1);assert.ok(f.pendingMusicRestores.size);assert.equal(music.nodes.some(node=>node.buffer?.asset.id===1072),false);
  music.setBadField(false);await f.retryMusicRestores(new AbortController().signal);assert.equal(f.pendingMusicRestores.size,0);assert.equal(music.player.capture().cue.id,1072);const count=music.nodes.length;await retired(new AbortController().signal);assert.equal(music.nodes.length,count);
 }finally{f.dispose();await music.player.dispose();}
});
