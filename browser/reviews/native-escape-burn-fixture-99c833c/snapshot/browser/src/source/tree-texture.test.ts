import {test} from 'node:test';
import assert from 'node:assert/strict';
import {treeLeafPixels,type TreeShape} from './tree-texture.ts';

test('small and off-centre native tree banks sample foliage above their trunk and roots',()=>{
 for(const shape of [{topV:.171875,footV:.5,crownWidth:.34375,crownCenterU:.5},{topV:.09375,footV:.625,crownWidth:.5625,crownCenterU:.375}] satisfies TreeShape[]){
  const pixels=new Uint8Array(64*64*4),height=shape.footV-shape.topV;
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){const visible=y/64>=shape.topV&&y/64<shape.footV&&Math.abs(x/64-shape.crownCenterU)<shape.crownWidth/2;if(!visible)continue;const leaf=y/64<shape.topV+height*.6,i=(y*64+x)*4;pixels.set(leaf?[70,150,40,255]:[130,65,25,255],i);}
  const patch=treeLeafPixels(pixels,64,64,shape);assert.ok(patch);assert.ok(patch.sourceRect[3]/64<shape.topV+height*.6);for(let i=0;i<patch.data.length;i+=4)assert.deepEqual(Array.from(patch.data.slice(i,i+4)),[70,150,40,255]);
 }
});
test('transparent leaf-patch holes extend original opaque leaf colour',()=>{
 const data=new Uint8Array(16*16*4);data.set([80,160,50,255],(5*16+8)*4);const patch=treeLeafPixels(data,16,16,{footV:1,topV:0,crownWidth:1,crownCenterU:.5});assert.ok(patch);for(let i=0;i<patch.data.length;i+=4)assert.deepEqual(Array.from(patch.data.slice(i,i+4)),[80,160,50,255]);assert.equal(treeLeafPixels(new Uint8Array(16*16*4),16,16,{footV:1}),null);
});
