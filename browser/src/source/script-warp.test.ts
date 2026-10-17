import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {loadData,newState} from './data.ts';
import {ScriptVM,type ScriptHooks} from './script.ts';
import {sourceJSON,type SourceMap} from './types.ts';

globalThis.fetch=async input=>{try{return new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));}catch{return new Response('',{status:404});}};
const data=await loadData();
function fixture(){
  const state=newState(data,'Case','girl'),warps:number[][]=[],battles:number[]=[];let won=true;
  const hooks:ScriptHooks={message:async()=>{},choice:async()=>0,move:async()=>{},position:()=>{},face:()=>{},visible:()=>{},chooseStarter:async()=>{},nickname:async()=>1,refresh:async()=>{},battle:async id=>{battles.push(id);return won;},warp:async(map,x,z,facing)=>{warps.push([map,x,z,facing!]);},whiteOut:async()=>{}};
  return{state,hooks,warps,battles,vm:new ScriptVM(data,state,hooks),lose:()=>{won=false;}};
}

test('actual Proton victory script warps to Kurt at map164 X4 Z5 North before its post-warp flags',async()=>{
  const f=fixture(),map=await sourceJSON<SourceMap>('maps/177.json');f.state.map=177;await f.vm.run(map,'scr_seq_D26R0102_002');
  assert.deepEqual(f.battles,[data.constants.TRAINER_EXECUTIVE_PROTON_PROTON]);assert.deepEqual(f.warps,[[164,4,5,0]]);assert.equal(f.state.flags.FLAG_BEAT_AZALEA_ROCKETS,true);assert.equal(f.state.vars.VAR_UNK_4080,2);assert.equal(f.state.flags.FLAG_HIDE_ILEX_APPRENTICE,false);assert.equal(f.state.flags.FLAG_HIDE_FARFETCHD_1_LOST,false);assert.equal(f.vm.lastUnsupported,null);
});

test('Proton loss never warps, and a rejected warp host cannot execute its later source flags',async()=>{
  const map=await sourceJSON<SourceMap>('maps/177.json'),lost=fixture();lost.lose();await lost.vm.run(map,'scr_seq_D26R0102_002');assert.deepEqual(lost.warps,[]);assert.equal(lost.state.flags.FLAG_BEAT_AZALEA_ROCKETS,undefined);
  const f=fixture(),error=Error('warp failed'),before={apprentice:f.state.flags.FLAG_HIDE_ILEX_APPRENTICE,scene:f.state.vars.VAR_UNK_40F4};f.hooks.warp=async()=>{throw error;};await assert.rejects(f.vm.run(map,'scr_seq_D26R0102_002'),value=>value===error);assert.equal(f.state.flags.FLAG_HIDE_ILEX_APPRENTICE,before.apprentice);assert.equal(f.state.vars.VAR_UNK_40F4,before.scene,'initial source state is not advanced after warp failure');assert.equal(f.vm.busy,false);
});

test('all114 exported native Warp rows preserve map/X/Z/facing ABI, including the literal unused7',async()=>{
  let tested=0,unusedSeven=0,variableCoords=0,variableFacing=0;
  for(const directory of['maps','scripts'])for(const file of await readdir(new URL(`../../public/source/${directory}/`,import.meta.url))){
    if(!file.endsWith('.json'))continue;const map=await sourceJSON<SourceMap>(`${directory}/${file}`);
    for(const[command,args]of map.scripts.instructions){
      if(command!=='Warp')continue;assert.equal(args.length,5);const f=fixture();
      for(const[index,value]of[[0,74],[2,123],[3,456],[4,3]]as const)if(args[index].startsWith('VAR_'))f.vm.set(args[index],value);
      const operand=(token:string)=>{if(token.startsWith('VAR_'))return f.state.vars['#'+data.constants[token]]??f.state.vars[token];return /^\d+|^0x[\da-f]+$/i.test(token)?Number(token):map.constants[token]??data.constants[token];};
      const expected=[operand(args[0]),operand(args[2]),operand(args[3]),operand(args[4])];assert.ok(expected.every(Number.isInteger),`${directory}/${file}: ${args}`);
      const onlyWarp={...map,events:map.events??{objects:[],coords:[],bgs:[],warps:[]},scripts:{labels:{start:0},entries:['start'],instructions:[['Warp',args],['End',[]]]}}as SourceMap;await f.vm.run(onlyWarp,'start');assert.deepEqual(f.warps,[expected],`${directory}/${file}: ${args}`);
      if(args[1]==='7'){unusedSeven++;assert.deepEqual(expected,[78,376,182,1]);}if(args[2].startsWith('VAR_'))variableCoords++;if(args[4].startsWith('VAR_'))variableFacing++;tested++;
    }
  }
  assert.equal(tested,114);assert.equal(unusedSeven,1);assert.ok(variableCoords>0);assert.equal(variableFacing,23);
});

test('native C and assembler consume the second halfword without selecting an anchor and pass direction into Location',async()=>{
  const root=new URL('../../../',import.meta.url),source=await readFile(new URL('src/scrcmd_c.c',root),'utf8'),command=source.match(/BOOL ScrCmd_Warp\(ScriptContext \*ctx\) \{([\s\S]*?)\n\}/)![1];
  assert.match(command,/u16 unused = ScriptReadHalfword\(ctx\);/);assert.match(command,/u16 x = ScriptGetVar\(ctx\);\s*u16 y = ScriptGetVar\(ctx\);\s*u16 direction = ScriptGetVar\(ctx\);/);assert.match(command,/CallTask_ScriptWarp\(ctx->taskman, mapId, -1, x, y, direction\);/);
  const macro=await readFile(new URL('asm/macros/script.inc',root),'utf8');assert.match(macro,/\.macro Warp arg0, arg1=0, arg2, arg3, arg4\s+\.short 176\s+\.short \\arg0\s+\.short \\arg1\s+\.short \\arg2\s+\.short \\arg3\s+\.short \\arg4/);
});
