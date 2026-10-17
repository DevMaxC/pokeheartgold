import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData,createMon} from './data.ts';
import {sourceJSON} from './types.ts';
import {partyHUD,partyRow,partySummary,eggWatchMessage} from './party-display.ts';
globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData(),messages=await sourceJSON<Record<string,string>>('messages/302.json'),icon='/source/eggs/egg-icon.png';

test('an unhatched Egg keeps its original icon and conceals species, level, health, gender, stats and moves in all party views',()=>{
  const egg=createMon(data,175,1,'Ethan',()=>.5);Object.assign(egg,{isEgg:true,name:'Egg',friendship:10});
  const before=structuredClone(egg),hud=partyHUD(egg,icon),row=partyRow(egg,1,icon),summary=partySummary(data,egg,icon,messages);
  for(const html of[hud,row,summary]){assert.ok(html.includes(icon));assert.ok(!html.includes('/pokemon/175-'));assert.doesNotMatch(html,/Lv\.|Level | HP|hp-bar|Attack|Defense|Speed|PP |♂|♀|OT Ethan/);}
  assert.ok(summary.includes('The Egg Watch'));assert.ok(summary.includes('It appears to move<br>occasionally.'));
  assert.deepEqual(egg,before);
});

test('native Egg Watch thresholds select literal exported messages without advancing the saved hatch cycles',()=>{
  for(const[cycles,key]of[[0,105],[5,105],[6,106],[10,106],[11,107],[40,107],[41,108]] as const)assert.equal(eggWatchMessage(cycles,messages),messages[key]);
});

test('a hatched Pokémon retains normal party health, level, typing, ownership and move presentation',()=>{
  const mon=createMon(data,175,1,'Ethan',()=>.5),hud=partyHUD(mon,icon),row=partyRow(mon,0,icon),summary=partySummary(data,mon,icon,messages);
  for(const html of[hud,row,summary]){assert.ok(html.includes('/pokemon/175-'));assert.ok(!html.includes(icon));}
  assert.ok(hud.includes('Level 1'));assert.ok(row.includes('hp-bar'));assert.ok(summary.includes('OT Ethan'));assert.ok(summary.includes('PP '));assert.ok(!summary.includes('Egg Watch'));
});
