import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import {backgroundDirectionCompatible,backgroundFlagSet,findInteractedBackgroundEvent} from './background-events.ts';
import type {SourceMap,Trigger} from './types.ts';

const json=(path:string)=>JSON.parse(readFileSync(new URL('../../public/source/'+path,import.meta.url),'utf8'));
const constants=json('constants.json'),violet=json('maps/135.json') as SourceMap;
const find=(map:Pick<SourceMap,'events'>,x:number,z:number,facing:number,flags:Record<string,boolean>={})=>findInteractedBackgroundEvent(map,x,z,facing,script=>typeof script==='number'?script:constants[script],id=>backgroundFlagSet(flags,constants,id),constants);

test('all background directions match the literal compiled native C function',()=>{
 const source=readFileSync(new URL('../../../src/field_interaction.c',import.meta.url),'utf8');
 const start=source.indexOf('BOOL BgEventDirectionIsCompatibleWithPlayerFacing(FieldSystem *fieldSystem, BgEvent *bgEvent) {'),end=source.indexOf('\n// Script of a sign',start);assert.ok(start>=0&&end>start);
 const literal=source.slice(start,end),dir=mkdtempSync(join(tmpdir(),'hg-background-'));
 try{
  const c=join(dir,'native.c'),binary=join(dir,'native');
  writeFileSync(c,'#include <stdio.h>\ntypedef int BOOL;\n#define TRUE 1\n#define FALSE 0\ntypedef struct { int playerAvatar; } FieldSystem;\ntypedef struct { int dir; } BgEvent;\nint PlayerAvatar_GetFacingDirection(int value){return value;}\n'+literal+'\nint main(void){for(int d=0;d<8;d++)for(int f=0;f<4;f++){FieldSystem s={f};BgEvent b={d};printf("%d ",BgEventDirectionIsCompatibleWithPlayerFacing(&s,&b));}return 0;}\n');
  execFileSync('cc',[c,'-o',binary]);const results=execFileSync(binary,{encoding:'utf8'}).trim().split(/\s+/).map(Number);let index=0;
  for(let d=0;d<8;d++)for(let f=0;f<4;f++)assert.equal(Number(backgroundDirectionCompatible(d,f)),results[index++],`native dir${d}/facing${f}`);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('actual Violet Gym plaques require their facing tile and native north-facing direction',()=>{
 assert.equal(violet.events.bgs.length,2);
 for(const event of violet.events.bgs){assert.equal(event.dir,0);assert.equal(find(violet,event.x+.5,event.z+1.5,0),event);assert.equal(find(violet,event.x+.5,event.z+.5,0),undefined,'standing on the sign does not activate it');assert.equal(find(violet,event.x+.5,event.z-.5,1),undefined,'the reverse face is not an eligible interaction');}
});

test('hidden items ignore direction, skip their collected native flag, and retain event source precedence',()=>{
 const base=constants._std_hidden_item,flagBase=constants.HIDDEN_ITEMS_FLAG_BASE;
 const hidden:Trigger={scriptId:base+7,type:2,x:10,z:9,y:999,dir:3},ordinary:Trigger={scriptId:1,type:0,x:10,z:9,y:-999,dir:0};
 const map={events:{bgs:[hidden,ordinary]}} as Pick<SourceMap,'events'>;
 assert.equal(find(map,10.5,10.5,0),hidden);assert.equal(find(map,10.5,10.5,0,{['#'+(flagBase+7)]:true}),ordinary);
 assert.equal(find(map,10.5,9.5,0),undefined,'no current-tile fallback');
 const symbolic=Object.entries(constants).find(([key,value])=>key.startsWith('FLAG_')&&value===flagBase+7);assert.ok(symbolic);assert.equal(find(map,10.5,10.5,0,{[symbolic[0]]:true}),ordinary);
 assert.equal(backgroundFlagSet({[symbolic[0]]:true,['#'+(flagBase+7)]:false},constants,flagBase+7),false);
});

test('all 241 imported hidden backgrounds resolve their exact original flag and only the matching flag suppresses them',()=>{
 let count=0;
 for(let id=0;id<540;id++){let map:SourceMap;try{map=json(`maps/${id}.json`);}catch{continue;}
  for(const event of map.events.bgs.filter(bg=>bg.type===2)){
   const script=typeof event.scriptId==='number'?event.scriptId:constants[event.scriptId];assert.ok(Number.isInteger(script),String(event.scriptId));
   const singleton={events:{bgs:[event]}} as Pick<SourceMap,'events'>,flag=(script-constants._std_hidden_item+constants.HIDDEN_ITEMS_FLAG_BASE)&0xffff;
   assert.equal(find(singleton,event.x+.5,event.z+1.5,0),event);assert.equal(find(singleton,event.x+.5,event.z+1.5,0,{['#'+flag]:true}),undefined);assert.equal(find(singleton,event.x+.5,event.z+1.5,0,{['#'+(flag+1)]:true}),event);count++;
  }
 }
 assert.equal(count,241);
});

test('actual main interaction binds native background eligibility after trainer and NPC priority',async()=>{
 const main=readFileSync(new URL('./main.ts',import.meta.url),'utf8'),start=main.indexOf('async function interact()'),end=main.indexOf('\nasync function step(',start);assert.ok(start>=0&&end>start);
 const calls:unknown[]=[],state={x:12.5,z:27.5,facing:0,flags:{}},c={ready:true,hatching:false,battleSoundOwned:false,state,map:violet,data:{constants},ui:{dialogueOpen:false,panelOpen:false},started:true,sourceActions:{busy:false},recoveryPrompt:false,walking:false,transitioning:false,vm:{busy:false,value:(script:string)=>violet.constants[script]??constants[script]},battle:{active:false},world:{npcSprites:new Map(),permission:()=>0},deltas:[{x:0,z:-1},{x:0,z:1},{x:-1,z:0},{x:1,z:0}],trainerEventPriority:async()=>false,checkFrameTriggers(){},tryTrainerEncounter(){},runScript:async(...args:unknown[])=>{calls.push(args);},findInteractedBackgroundEvent,backgroundFlagSet};
 runInNewContext(stripTypeScriptTypes(main.slice(start,end),{mode:'transform'})+';globalThis.actualInteract=interact;',c);
 await (c as typeof c&{actualInteract:()=>Promise<void>}).actualInteract();assert.equal(calls.length,1);assert.equal((calls[0] as unknown[])[0],violet.events.bgs[0].scriptId);
 calls.length=0;state.z=26.5;await (c as typeof c&{actualInteract:()=>Promise<void>}).actualInteract();assert.equal(calls.length,0);
 state.z=27.5;c.trainerEventPriority=async()=>true;await (c as typeof c&{actualInteract:()=>Promise<void>}).actualInteract();assert.equal(calls.length,0);
 c.trainerEventPriority=async()=>false;c.world.npcSprites.set('npc',{group:{visible:true,position:{x:12.5,z:26.5}},npc:{id:'npc',scriptId:42}});await (c as typeof c&{actualInteract:()=>Promise<void>}).actualInteract();assert.equal((calls[0] as unknown[])[0],42);
});
