import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stepWarpFacing,pushWarp,fieldEntryScripts,arrivalStep,arrivalFacing} from './field-transitions.ts';

test('south exit mats and side gates require pushing their source direction, not stepping across',()=>{
 for(const [behavior,facing]of [[101,1],[111,1],[98,3],[108,3],[94,3],[99,2],[109,2],[95,2]]){
  assert.equal(stepWarpFacing(behavior,facing),null);for(let dir=0;dir<4;dir++)assert.equal(pushWarp(behavior,dir),dir===facing);
 }
});
test('north entrances, panels, ladders and escalators preserve their native transition facing',()=>{
 for(const behavior of [100,110,62])for(let facing=0;facing<4;facing++)assert.equal(stepWarpFacing(behavior,facing),0);
 assert.equal(stepWarpFacing(103,2),2);assert.equal(stepWarpFacing(106,2),3);assert.equal(stepWarpFacing(106,3),2);assert.equal(stepWarpFacing(106,0),null);assert.equal(stepWarpFacing(107,3),3);assert.equal(stepWarpFacing(105,0),null);
});
test('connections run transition only while battle returns rebuild through load and resume',()=>{
 assert.deepEqual(fieldEntryScripts('connection'),['OnTransition']);assert.deepEqual(fieldEntryScripts('warp'),['OnTransition','OnLoad','OnResume']);assert.deepEqual(fieldEntryScripts('resume'),['OnLoad','OnResume']);
});
test('native north/south ladders warp on directional push even with clear floor ahead',()=>{
 for(const [behavior,facing]of [[60,0],[61,1]])for(let dir=0;dir<4;dir++)for(const blocked of [true,false])assert.equal(pushWarp(behavior|0x8000,dir,blocked),dir===facing);assert.equal(pushWarp(0x65,1,false),false);
});
test('door arrivals step clear while stairs finish on the anchor facing away from the stair wall',()=>{
 assert.equal(arrivalStep(0x8069,1),1);assert.equal(arrivalStep(0x8069,0),null);assert.equal(arrivalStep(0x65,0),null);assert.equal(arrivalStep(94,3),null);assert.equal(arrivalFacing(94,3),2);assert.equal(arrivalFacing(95,2),3);assert.equal(arrivalFacing(0x65,0),0);
});
