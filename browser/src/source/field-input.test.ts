import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fieldInput,fieldInputFacing} from './field-input.ts';
import {readInterfacePreferences,writeInterfacePreferences,defaultInterfacePreferences} from './interface-preferences.ts';

test('touch movement is camera-relative at each quarter turn and does not invent diagonal tile movement',()=>{
 const input=fieldInput(new Set(),{horizontal:0,forward:1,run:false});assert.deepEqual([0,Math.PI/2,Math.PI,Math.PI*1.5].map(yaw=>fieldInputFacing(input,yaw)),[0,2,1,3]);assert.equal(fieldInputFacing({horizontal:0,forward:0},1),null);assert.equal(fieldInputFacing({horizontal:NaN,forward:1},0),null);
});
test('keyboard ownership wins without touch release clearing held keys, including opposed input and right Shift',()=>{
 const keys=new Set(['KeyW','ShiftRight']),touch={horizontal:1,forward:0,run:false};assert.deepEqual(fieldInput(keys,touch),{horizontal:0,forward:1,run:true});keys.add('KeyS');assert.deepEqual(fieldInput(keys,touch),{horizontal:0,forward:0,run:true});keys.delete('KeyW');keys.delete('KeyS');assert.deepEqual(fieldInput(keys,touch),{horizontal:1,forward:0,run:true});assert.equal(keys.has('ShiftRight'),true);
});
test('explicit muted preferences survive reload; missing legacy music setting becomes a tap-unlocked default',()=>{
 let raw=null;const storage={getItem:()=>raw,setItem:(_key,value)=>{raw=value;}};assert.deepEqual(readInterfacePreferences(storage),defaultInterfacePreferences());const saved=writeInterfacePreferences(storage,{music:false,volume:.2,cameraSensitivity:1.2,textSpeed:2});assert.deepEqual(readInterfacePreferences(storage),saved);assert.equal(readInterfacePreferences(storage).music,false);
});
test('corrupt/private storage and invalid individual preference fields do not disable input',()=>{
 const unavailable={getItem(){throw Error('private');},setItem(){throw Error('quota');}};assert.deepEqual(readInterfacePreferences(unavailable),defaultInterfacePreferences());assert.doesNotThrow(()=>writeInterfacePreferences(unavailable,defaultInterfacePreferences()));const source={version:1,music:false,volume:99,cameraSensitivity:NaN,textSpeed:7};const value=readInterfacePreferences({getItem:()=>JSON.stringify(source),setItem(){}});assert.equal(value.music,false);assert.equal(value.volume,.55);assert.equal(value.cameraSensitivity,.8);assert.equal(value.textSpeed,1);
});
