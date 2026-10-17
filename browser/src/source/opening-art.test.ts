import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {drawOpeningDemo,setOpeningDemoVisible,type OpeningDemo} from './opening-art.ts';
const demo:OpeningDemo=JSON.parse(await readFile(new URL('../../public/source/opening/assets.json',import.meta.url),'utf8')).demo;
function svg(){const attributes=new Map<string,string>();return{attributes,setAttribute:(name:string,value:string)=>{attributes.set(name,value);},removeAttribute:(name:string)=>{attributes.delete(name);}};}
test('the original demonstration explicitly removes and restores SVG visibility, without relying on HTMLElement.hidden',()=>{
 const node=svg();setOpeningDemoVisible(node,false);assert.equal(node.attributes.get('hidden'),'');setOpeningDemoVisible(node,true);assert.equal(node.attributes.has('hidden'),false);setOpeningDemoVisible(node,false);assert.equal(node.attributes.has('hidden'),true);
});
test('native OAM anchors and NANR shrink, translation and rotation frames project into the original256×192 stage',()=>{
 const image=svg();drawOpeningDemo(image,demo,0,0);assert.equal(image.attributes.get('href'),'/source/opening/demo-cell-0.png');assert.equal(image.attributes.get('width'),'48');assert.equal(image.attributes.get('height'),'48');assert.equal(image.attributes.get('x'),'136');assert.equal(image.attributes.get('y'),'32');
 for(let sequence=0;sequence<demo.sequences.length;sequence++)for(let i=0;i<demo.sequences[sequence].frames.length;i++){
  const frame=demo.sequences[sequence].frames[i],cell=demo.cells[frame.cell];drawOpeningDemo(image,demo,sequence,i);const x=Number(image.attributes.get('x')),y=Number(image.attributes.get('y'));
  assert.equal(x+cell.origin[0]*frame.scale[0],160+frame.translate[0]);assert.equal(y+cell.origin[1]*frame.scale[1],80+frame.translate[1]);assert.equal(image.attributes.get('transform'),`rotate(${frame.rotation} ${160+frame.translate[0]} ${80+frame.translate[1]})`);assert.ok(Number(image.attributes.get('width'))>0&&Number(image.attributes.get('height'))>0);
 }
});
