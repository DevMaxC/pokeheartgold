import {test} from 'node:test';
import assert from 'node:assert/strict';
import {UI} from './ui.ts';
function dom(){
 const ids=new Map(['dialogue-next','dialogue','dialogue-speaker','dialogue-text'].map(id=>[id,{hidden:true,textContent:'',onclick:null}]));
 const beforeDocument=Object.getOwnPropertyDescriptor(globalThis,'document'),beforeAdd=Object.getOwnPropertyDescriptor(globalThis,'addEventListener');
 Object.defineProperty(globalThis,'document',{value:{getElementById:(id:string)=>ids.get(id)},configurable:true});Object.defineProperty(globalThis,'addEventListener',{value:()=>{},configurable:true});
 return{ids,restore(){for(const[key,descriptor]of[['document',beforeDocument],['addEventListener',beforeAdd]]as const){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}}};
}
test('an opening menu can own remembered-cursor focus without a queued default first-button focus overriding it',async()=>{
 const d=dom();try{let focused=0;const element={hidden:true,textContent:'',onclick:null,inert:false,innerHTML:'',querySelector:()=>({focus:()=>focused++})};for(const id of['panel-content','panel','original-world','game-hud','touch-pad'])d.ids.set(id,element);const ui=new UI();ui.panel('Opening choices',false);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(focused,0);ui.panel('Normal field menu');await new Promise(resolve=>setTimeout(resolve,0));assert.equal(focused,1);}finally{d.restore();}
});
test('one confirm reveals a typing opening page and a second advances it; an extra confirm cannot skip the next native page',async()=>{
 const d=dom();try{const ui=new UI(),pending=ui.message('Native first page\\rNative second page',50);assert.equal(ui.dialogueOpen,true);assert.equal(d.ids.get('dialogue-text')!.textContent,'N');ui.advance();assert.equal(d.ids.get('dialogue-text')!.textContent,'Native first page');assert.equal(ui.dialogueOpen,true);ui.advance();ui.advance();await Promise.resolve();assert.equal(d.ids.get('dialogue-text')!.textContent,'N');ui.advance();assert.equal(d.ids.get('dialogue-text')!.textContent,'Native second page');ui.advance();await pending;assert.equal(ui.dialogueOpen,false);assert.equal(d.ids.get('dialogue')!.hidden,true);}finally{d.restore();}
});
test('existing field-dialogue calls remain instant and retain native newline/page-break handling',async()=>{
 const d=dom();try{const ui=new UI(),pending=ui.message('Oak: First\\nline\\fSecond');assert.equal(d.ids.get('dialogue-speaker')!.textContent,'Oak');assert.equal(d.ids.get('dialogue-text')!.textContent,'First\nline');ui.advance();await Promise.resolve();assert.equal(d.ids.get('dialogue-text')!.textContent,'Second');ui.advance();await pending;assert.equal(ui.dialogueOpen,false);}finally{d.restore();}
});
