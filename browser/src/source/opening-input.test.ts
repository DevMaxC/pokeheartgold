import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chooseOpeningButton} from './opening-input.ts';
function fixture(){
 let key:((event:KeyboardEvent)=>void)|null=null;let removed=0,focused=-1;const later:(()=>void)[]=[],selected=[false,false];
 const buttons=[0,1].map(i=>({onfocus:null as null|(()=>void),onclick:null as null|(()=>void),classList:{toggle:(name:string,value:boolean)=>{assert.equal(name,'opening-selected');selected[i]=value;}},focus(){focused=i;this.onfocus?.();},click(){this.onclick?.();}}));
 const events={addEventListener:(_name:string,callback:(event:KeyboardEvent)=>void)=>{key=callback;},removeEventListener:(_name:string,callback:(event:KeyboardEvent)=>void)=>{assert.equal(key,callback);removed++;key=null;}}as unknown as Pick<Window,'addEventListener'|'removeEventListener'>;
 return{buttons:buttons as unknown as HTMLButtonElement[],events,selected,later,get removed(){return removed;},get focused(){return focused;},press(code:string){let prevented=false;key?.({code,repeat:false,preventDefault:()=>prevented=true}as KeyboardEvent);assert.equal(prevented,true);}};
}
test('Enter preserves the remembered Girl cursor before deferred focus runs, with one actual highlighted option',async()=>{
 const f=fixture(),pending=chooseOpeningButton(f.buttons,1,f.events,callback=>f.later.push(callback));assert.deepEqual(f.selected,[false,true]);assert.equal(f.focused,-1);f.press('Enter');assert.equal(await pending,1);assert.equal(f.removed,1);f.later[0]();assert.equal(f.focused,-1);
});
test('arrows, focus and clicks use the same cursor even if focus is subsequently elsewhere',async()=>{
 const f=fixture(),pending=chooseOpeningButton(f.buttons,1,f.events,callback=>f.later.push(callback));f.press('ArrowRight');assert.deepEqual(f.selected,[true,false]);assert.equal(f.focused,0);f.buttons[1].focus();assert.deepEqual(f.selected,[false,true]);f.press('Space');assert.equal(await pending,1);assert.equal(f.removed,1);f.buttons[0].click();assert.deepEqual(f.selected,[false,true]);
});
