import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {drawOpeningDemo,setOpeningDemoVisible,prepareOpeningArtwork,animateOpeningShrink,type OpeningArtwork} from './opening-art.ts';
const artwork:OpeningArtwork=JSON.parse(await readFile(new URL('../../public/source/opening/assets.json',import.meta.url),'utf8')),demo=artwork.demo;
function svg(){const attributes=new Map<string,string>();return{attributes,setAttribute:(name:string,value:string)=>{attributes.set(name,value);},removeAttribute:(name:string)=>{attributes.delete(name);}};}
test('the original demonstration explicitly removes and restores SVG visibility, without relying on HTMLElement.hidden',()=>{
 const node=svg();setOpeningDemoVisible(node,false);assert.equal(node.attributes.get('hidden'),'');setOpeningDemoVisible(node,true);assert.equal(node.attributes.has('hidden'),false);setOpeningDemoVisible(node,false);assert.equal(node.attributes.has('hidden'),true);
});
test('essential native images decode before the introduction starts and a failed shrink image rejects preparation',async()=>{
 const urls:string[]=[];await prepareOpeningArtwork(artwork,async url=>{urls.push(url);await readFile(new URL('../../public'+url,import.meta.url));});assert.equal(urls.length,16);assert.ok(urls.includes('/source/opening/girl-shrink-4.png'));assert.ok(urls.includes('/source/opening/boy-choice.png'));
 await assert.rejects(prepareOpeningArtwork(artwork,async url=>{if(url.endsWith('girl-shrink-4.png'))throw Error('image decode failed');}),/image decode failed/);
});
test('the native full-size player remains visible for30 frames before four9-frame shrinking portraits',async()=>{
 for(const gender of['boy','girl']as const){const trace:(string|number|null)[]=[];await animateOpeningShrink(gender,file=>trace.push(file),async ms=>{trace.push(ms);});assert.deepEqual(trace,[gender+'.png',500,...[1,2,3,4].flatMap(i=>[gender+'-shrink-'+i+'.png',150]),null,150]);}
});
test('native OAM anchors and NANR shrink, translation and rotation frames project into the original256×192 stage',()=>{
 const image=svg();drawOpeningDemo(image,demo,0,0);assert.equal(image.attributes.get('href'),'/source/opening/demo-cell-0.png');assert.equal(image.attributes.get('width'),'48');assert.equal(image.attributes.get('height'),'48');assert.equal(image.attributes.get('x'),'136');assert.equal(image.attributes.get('y'),'32');
 for(let sequence=0;sequence<demo.sequences.length;sequence++)for(let i=0;i<demo.sequences[sequence].frames.length;i++){
  const frame=demo.sequences[sequence].frames[i],cell=demo.cells[frame.cell];drawOpeningDemo(image,demo,sequence,i);const x=Number(image.attributes.get('x')),y=Number(image.attributes.get('y'));
  assert.equal(x+cell.origin[0]*frame.scale[0],160+frame.translate[0]);assert.equal(y+cell.origin[1]*frame.scale[1],80+frame.translate[1]);assert.equal(image.attributes.get('transform'),`rotate(${frame.rotation} ${160+frame.translate[0]} ${80+frame.translate[1]})`);assert.ok(Number(image.attributes.get('width'))>0&&Number(image.attributes.get('height'))>0);
 }
});
