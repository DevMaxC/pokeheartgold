import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nativeUpwardJoinDomains,proveNativeUpwardJoin,type UpwardJoinInput} from './native-upward-joint-authority.ts';
import {terrainExactCoverage} from './terrain-emission-witness.ts';
function input():UpwardJoinInput{const common={asset:'land/103-8.glb',sourceSHA256:'a'.repeat(64),placement:'0:19,5',mesh:'native',material:'grass01',alphaMode:'OPAQUE'as const};return{first:{...common,triangleIndex:0,p:[[0,2,0],[0,2,2],[1,2,2]]},second:{...common,triangleIndex:1,p:[[0,2,0],[1,2,2],[1,2,0]]},profiles:[[[[1,3,0],[1,3,2]]],[[[1,2,0],[1,2,2]]]],cellOrigin:[0,0,0],reliefSHA256:'b'.repeat(64)};}
// Separate, opposite-side source triangles share the complete X=1 edge.
function valid(){const i=input();i.first.p=[[0,2,0],[1,2,2],[1,2,0]];i.second.p=[[1,2,0],[1,2,2],[2,2,2]];return i;}
test('literal UP↔UP authority admits an exact gap and rejects outside area/plane and prior opaque coverage',()=>{
 const i=valid(),triangle=[[1,3,0],[1,3,2],[1,2,2]]as const;assert.equal(nativeUpwardJoinDomains(i).proved,true);assert.equal(proveNativeUpwardJoin(i,triangle).proved,true);assert.equal(proveNativeUpwardJoin(i,[[1,3,0],[1,3,2],[1,1.999999,2]]).proved,false);assert.equal(proveNativeUpwardJoin(i,[[1.00000001,3,0],[1,3,2],[1,2,2]]).proved,false);assert.equal(proveNativeUpwardJoin(i,triangle,[[[0,2.5],[2,2.5],[2,3],[0,3]]]).proved,false);
});
for(const change of['asset','sourceSHA256','placement','mesh','material']as const)test('foreign '+change+' cannot lend native gap authority',()=>{const i=valid();i.second[change]='foreign';assert.equal(nativeUpwardJoinDomains(i).proved,false);});
test('same-side, alpha, incomplete, shifted and ambiguous source branches cannot admit a strip',()=>{
 const cases=[()=>input(),()=>{const i=valid();i.second.alphaMode='MASK';return i;},()=>{const i=valid();i.profiles=[[[[1,3,0],[1,3,1]]],i.profiles[1]];return i;},()=>{const i=valid();i.profiles=[[[[1.000001,3,0],[1.000001,3,2]]],i.profiles[1]];return i;},()=>{const i=valid();i.profiles=[[[[1,3,0],[1,3,2]],[[1,4,0],[1,4,2]]],i.profiles[1]];return i;}];for(const create of cases)assert.equal(nativeUpwardJoinDomains(create()).proved,false);
});
test('strict rational coverage keeps a tiny positive external strip and a tiny native overlap',()=>{
 const tri=[[0,0],[1,0],[1,1]]as const;assert.deepEqual(terrainExactCoverage(tri,[[[0,0],[1,0],[1,1],[0,1]]]).remainingArea,{n:'0',d:'1'});assert.equal(terrainExactCoverage(tri,[[[0,0],[.999999999999,0],[.999999999999,1],[0,1]]]).inside,false);assert.equal(terrainExactCoverage(tri,[tri],[[[.999999999999,0],[1,0],[1,1]]]).overlap,true);
});
