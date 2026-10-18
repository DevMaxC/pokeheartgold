import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fixture,scene} from './evolution-audio.test.ts';
import {createEvolutionPresentation} from '../../reviews/native-evolution-audio/frozen-dependencies/presentation/evolution-presentation.ts';
import {EVOLUTION_AUDIO_PREPARATION_BUDGET_MS,EVOLUTION_AUDIO_PRESENTATION_WATCHDOG_MS} from './evolution-audio.ts';

test('compiler accepts real backend against exact accepted presentation audio port',()=>{
 execFileSync(new URL('../../node_modules/.bin/tsc',import.meta.url).pathname,['--noEmit','--moduleResolution','Bundler','--module','ESNext','--target','ES2022','--allowImportingTsExtensions','--skipLibCheck','--strict','--lib','ES2022,DOM',new URL('../../reviews/native-evolution-audio/binding-contract.ts',import.meta.url).pathname],{encoding:'utf8'});
});

test('real presentation defaults outlive one total backend budget; a hung1011 asset becomes no-voice and evolution still completes',async()=>{
 const f=await fixture({productionDefaults:true});let late!:(value:ArrayBuffer)=>void;const hung=new Promise<ArrayBuffer>(resolve=>{late=resolve;});
 f.controls.fetch=async(url)=>{if(url.endsWith('/resources.json'))await new Promise(resolve=>setTimeout(resolve,120));if(url.includes('/1011-'))return hung;const b=await readFile(new URL('../../public'+url,import.meta.url));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)as ArrayBuffer;};
 const value={...scene,before:{...scene.before,name:'CYNDAQUIL',gender:'male',personality:0x12345678,id:123456,provenance:{otId:0x11223344}},after:{...scene.after,name:'CYNDAQUIL',gender:'male',personality:0x12345678,id:123456,provenance:{otId:0x11223344}}}as any;
 const world={fieldEffect:null,battleStage:null},view={world,owner:null as symbol|null,active:false,poseActive:false,paletteActive:false,particlesActive:false,cameraReturned:false,async begin(){this.active=true;this.owner=Symbol();},assertOwned(owner:symbol){assert.equal(owner,this.owner);},tick(){},setPhase(){},startPose(){},fade(){},beginReturn(){this.cameraReturned=true;},complete(){},cancel(){this.active=false;}};
 const events:string[]=[],present=createEvolutionPresentation({view:view as any,audio:f.backend,nextFrame:async()=>{for(const n of f.nodes)if(!n.loop&&!n.stopped)n.end();f.context.currentTime+=1/30;await f.tick();},takeBCancel:()=>false,enabled:()=>true,sharedOutput:()=>f.output as any,retainRestore:()=>{throw Error('unexpected cleanup retention');},print:()=>({done:Promise.resolve(),clear(){}})});
 assert.ok(EVOLUTION_AUDIO_PREPARATION_BUDGET_MS<EVOLUTION_AUDIO_PRESENTATION_WATCHDOG_MS);let result:unknown;await assert.doesNotReject(async()=>{result=await present(value,{evolve(){events.push('evolve');return{nickname:'CYNDAQUIL',speciesName:'QUILAVA'};},register(){events.push('register');},async learnMoves(){events.push('learn');},finish(){events.push('finish');}},f.outer.signal);});assert.equal(result,'evolved');assert.deepEqual(events,['evolve','register','learn','finish']);assert.ok(f.statuses.some(x=>x.id===1011&&x.stage==='no-voice'));assert.equal(f.leaseHeld,false);assert.ok(!f.nodes.some(n=>n.buffer.asset.id===1011));const b=await readFile(new URL('../../public/source/hatching/music/1011-SEQ_GS_SHINKA.wav',import.meta.url));late(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)as ArrayBuffer);await new Promise(r=>setImmediate(r));assert.ok(!f.nodes.some(n=>n.buffer.asset.id===1011));f.dispose();
});
