import {test} from 'node:test';
import assert from 'node:assert/strict';
import {treeSpritePixels,treeInteriorPixels,treeSpriteComponents} from './tree-texture.ts';

test('selected atlas plants retain independent bounds and foot UVs rather than the full atlas',()=>{
 const data=new Uint8Array(16*16*4);for(let y=2;y<14;y++)for(let x=1;x<6;x++)data.set([45,140,70,255],(y*16+x)*4);for(let y=1;y<8;y++)for(let x=10;x<15;x++)data.set([180,90,30,255],(y*16+x)*4);const source={data,width:16,height:16},before=data.slice(),sprite=treeSpritePixels(source,{region:[0,0,.5,1]});assert.ok(sprite);assert.deepEqual(sprite.bounds,[1,2,6,14]);assert.equal(sprite.shape.footU,3.5/16);assert.equal(sprite.shape.footV,14/16);assert.equal(treeSpriteComponents(source).length,2);assert.equal(treeSpritePixels(source,{region:[0,0,.5,1]}),sprite,'Repeated instances reuse measured sprite data');assert.deepEqual(source.data,before);
});
test('interior-row wrapping uses only actual selected native pixels and preserves native stem colours',()=>{
 const data=new Uint8Array(16*16*4);for(let y=1;y<11;y++)for(let x=2;x<14;x++)data.set(x===2||x===13?[8,20,5,255]:[50+x*5,130+y*3,42,255],(y*16+x)*4);for(let y=11;y<15;y++)for(let x=6;x<10;x++)data.set([110+x,70+y,35,255],(y*16+x)*4);const source={data,width:16,height:16},sprite=treeSpritePixels(source)!;const result=treeInteriorPixels(source,sprite),native=new Set<string>();for(let i=0;i<data.length;i+=4)if(data[i+3]>=128)native.add(Array.from(data.slice(i,i+3)).join(','));for(let i=0;i<result.length;i+=4){assert.equal(result[i+3],255);assert.ok(native.has(Array.from(result.slice(i,i+3)).join(',')));}for(let x=0;x<16;x++)assert.notDeepEqual(Array.from(result.slice((5*16+x)*4,(5*16+x)*4+3)),[8,20,5],'Baked outside outline is not wrapped as a vertical stripe');for(let x=0;x<16;x++){const i=(13*16+x)*4;assert.ok(result[i]>110&&result[i+1]<100,'Stem row stays native wood');}assert.equal(treeSpritePixels({data:new Uint8Array(4),width:1,height:1}),null);
});
