import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fieldBattleLayout} from './battle-layout.ts';

test('battle figures choose a continuous terrace rather than straddling a ledge',()=>{
 const field={height:(_x:number,z:number)=>z>=0?1:2,walkable:()=>true},layout=fieldBattleLayout(field,{x:0,z:-.5,y:2,facing:1});assert.equal(layout.safe,true);assert.ok(layout.positions.every(p=>p.y===2));assert.ok(layout.positions.every(p=>p.z<0),'Both figures remain on the original upper terrace');assert.ok(Math.hypot(layout.positions[0].x-layout.positions[1].x,layout.positions[0].z-layout.positions[1].z)>3);
});
test('battle figures preserve the player floor under or above a bridge',()=>{
 const field={height:(_x:number,_z:number,y=0)=>y>=2?3:1,walkable:()=>true};for(const y of [1,3]){const layout=fieldBattleLayout(field,{x:10,z:10,y,facing:0});assert.ok(layout.positions.every(p=>p.y===y));}
});
test('narrow battle space reduces spacing instead of moving figures into solid walls',()=>{
 const field={height:()=>0,walkable:(x:number,z:number)=>Math.abs(x)<.5&&Math.abs(z)<.5},layout=fieldBattleLayout(field,{x:0,z:0,y:0,facing:0});assert.equal(layout.safe,true);assert.ok(layout.positions.every(p=>field.walkable(p.x,p.z)));assert.ok(Math.hypot(layout.positions[1].x-layout.positions[0].x,layout.positions[1].z-layout.positions[0].z)<1);
});
test('trainer figures stay on their Pokémon terrace when the preferred shoulder position crosses a cliff',async()=>{
 const {battleTrainerSpot}=await import('./battle-layout.ts'),field={height:(_x:number,z:number)=>z>=0?1:2,walkable:()=>true},spot=battleTrainerSpot(field,{x:0,z:-.5,y:2},{x:0,z:-1},1);assert.equal(spot.y,2);assert.ok(spot.z<0);
});
test('battle presentation cannot relocate across a narrow lower strip to another terrace',()=>{
 const field={height:(x:number)=>x>.25&&x<.75?0:2,walkable:()=>true},layout=fieldBattleLayout(field,{x:0,z:0,y:2,facing:3});assert.equal(layout.safe,true);assert.ok(layout.positions.every(p=>p.x<=.25),'A clear destination beyond a cliff is not a connected patch');
});
test('battle presentation avoids placing either Pokémon inside a solid canopy',()=>{
 const field={height:()=>0,walkable:()=>true},clear=(p:{x:number;z:number})=>Math.abs(p.x)>1||Math.abs(p.z)>1,layout=fieldBattleLayout(field,{x:0,z:0,y:0,facing:0},clear);assert.equal(layout.safe,true);assert.ok(layout.positions.every(clear));
});
