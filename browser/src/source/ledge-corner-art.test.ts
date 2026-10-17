import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assertNativeCornerFloor,nativeCornerWitness,type NativeCornerFace} from '../../scripts/ledge_corner_art.ts';
type Proof={cell:{x:number;z:number;altitude:number};nativeFloor:number;floorProfile:number[];witnesses:{point:[number,number];material:string;normalY:number;triangle:[number,number,number][]}[]};
const proofs:Proof[]=JSON.parse(await readFile(new URL('../../reviews/native-ledge-corners/native-corner-art-proof.json',import.meta.url),'utf8'));
function face(w:Proof['witnesses'][number]):NativeCornerFace{return{material:w.material,normal:{y:w.normalY},p:w.triangle.map(([x,y,z])=>({x,y,z}))};}

test('all three literal art witnesses and six collision-aligned floor samples pass for every actual corner',()=>{
 assert.equal(proofs.length,48);for(const row of proofs){assertNativeCornerFloor(row.floorProfile,row.nativeFloor);assert.equal(row.witnesses.length,3);for(const w of row.witnesses)assert.ok(nativeCornerWitness([face(w)],row.cell,row.nativeFloor,...w.point));}
});

test('actual native corner triangles reject wrong material, underside, wrong layer, non-flatness, missing coverage and degenerate art',()=>{
 const row=proofs.find(row=>row.cell.x===18&&row.cell.z===12)!;assert.ok(row);
 for(const witness of row.witnesses){for(const change of[
  (f:NativeCornerFace)=>{f.material='grass01';},(f:NativeCornerFace)=>{f.normal.y=-1;},(f:NativeCornerFace)=>{for(const p of f.p)p.y+=1;},(f:NativeCornerFace)=>{f.p[1].y+=.125;},(f:NativeCornerFace)=>{for(const p of f.p)p.x+=512;},(f:NativeCornerFace)=>{f.p=[f.p[0],f.p[0],f.p[0]];}
 ]){const altered=face(witness);change(altered);assert.equal(nativeCornerWitness([altered],row.cell,row.nativeFloor,...witness.point),undefined);}}
});

test('a corner rejects each non-flat endpoint, collision-layer mismatch, missing floor and non-finite floor',()=>{
 const row=proofs[0];for(let i=0;i<6;i++){const altered=[...row.floorProfile];altered[i]+=.0625;assert.throws(()=>assertNativeCornerFloor(altered,row.nativeFloor),/Unsupported non-flat/);}
 for(const floor of[row.nativeFloor+1,NaN,Infinity])assert.throws(()=>assertNativeCornerFloor(row.floorProfile,floor),/collision-mismatched/);
 for(const profile of[row.floorProfile.slice(1),[NaN,...row.floorProfile.slice(1)],[Infinity,...row.floorProfile.slice(1)]])assert.throws(()=>assertNativeCornerFloor(profile,row.nativeFloor),/Unsupported non-flat/);
});
